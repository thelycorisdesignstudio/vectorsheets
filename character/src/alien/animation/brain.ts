import { CLIPS, type ClipName } from './clips';
import { BlinkController } from './blink';
import { GazeController } from './gaze';
import { CHANNELS, ClipPlayer, emptyChannels, type ChannelRecord } from './keyframes';
import { clamp, createRandom, fbm1 } from './math';
import { Spring, SpringRecord } from './springs';
import { TalkGenerator } from './talk';
import { EXPRESSIONS, NEUTRAL_FACE } from '../config/expressions';
import { ANIMATION_STYLES, STATES, type StateDefinition } from '../config/states';
import type { AnimationState, AnimationStyle, ExpressionName, FaceParams, TouchZone } from '../types';

/** Everything the renderer needs for one frame. Renderer-agnostic. */
export interface Pose {
  face: FaceParams;
  /** Eye rotation relative to the head (rad); pitch positive looks down. */
  eyeYaw: number;
  eyePitch: number;
  /** 0 open … 1 closed, layered over the lids */
  blink: number;
  /** Body channels: rotations (rad), translations (units), squash factor */
  body: ChannelRecord;
  /** -1..1 breathing signal */
  breath: number;
  /** Impulses for secondary motion (consumed by the renderer) */
  antennaKick: number;
  time: number;
}

export interface BrainInput {
  pointer: { yaw: number; pitch: number; active: boolean };
  blinking: boolean;
  tracking: boolean;
  expression: ExpressionName | null;
  style: AnimationStyle;
  speechLevel: number | null;
}

interface Overlay {
  expression: ExpressionName;
  timeLeft: number;
  then?: Overlay;
}

/**
 * The character's "animator": an animation state machine plus layered
 * procedural behaviours (breathing, weight shifts, gaze, blinking, talking)
 * and additive keyframe clips. All targets pass through springs, so any
 * state can blend into any other without popping.
 */
export class AlienBrain {
  state: AnimationState = 'idle';
  restingState: AnimationState = 'idle';
  onStateChange: ((s: AnimationState) => void) | null = null;

  private def: StateDefinition = STATES.idle;
  private stateTime = 0;
  private time = 0;
  private rnd = createRandom(5);
  private clips = new ClipPlayer();
  private blinkCtl = new BlinkController();
  private gaze = new GazeController();
  private talk = new TalkGenerator();
  private overlay: Overlay | null = null;
  private nextNod = 3;
  private antennaKick = 0;

  private face = new SpringRecord<keyof FaceParams>({ ...NEUTRAL_FACE }, 8);
  private poseSprings = new SpringRecord(emptyChannels(), 4.5);
  private gazeYaw = new Spring(0, 26);
  private gazePitch = new Spring(0, 26);
  private headYaw = new Spring(0, 3.5);
  private headPitch = new Spring(0, 3.5);
  private talkWeight = new Spring(0, 10);
  private breathPhase = 0;
  private faceTarget: FaceParams = { ...NEUTRAL_FACE };
  private poseTarget = emptyChannels();

  readonly pose: Pose = {
    face: this.face.value as FaceParams,
    eyeYaw: 0,
    eyePitch: 0,
    blink: 0,
    body: emptyChannels(),
    breath: 0,
    antennaKick: 0,
    time: 0,
  };

  setState(next: AnimationState, notify = false) {
    const prev = this.state;
    if (next === prev && !STATES[next].clip) return;
    this.state = next;
    this.def = STATES[next];
    this.stateTime = 0;
    if (this.def.clip) this.clips.play(CLIPS[this.def.clip]);
    else if (prev === 'sleep' && next !== 'sleep') this.clips.play(CLIPS.wake);
    // Persistent states become the place one-shots return to; waking always lands in idle.
    if (!this.def.duration) this.restingState = next === 'sleep' ? 'idle' : next;
    if (notify) this.onStateChange?.(next);
  }

  /** Touch reaction: expressive overlay + clip, never leaves the current state stuck. */
  poke(zone: TouchZone, side: 1 | -1 = 1) {
    if (this.state === 'sleep') {
      this.setState('surprised', true);
      return;
    }
    if (zone === 'antenna') {
      this.antennaKick += 1;
      // A startle that melts into a pleased, playful look.
      this.overlay = { expression: 'surprised', timeLeft: 0.65, then: { expression: 'playful', timeLeft: 1.5 } };
      this.clips.play(CLIPS.surprised);
      return;
    }
    let clip: ClipName = 'giggle';
    let expression: ExpressionName = 'happy';
    if (zone === 'ear') {
      clip = side > 0 ? 'earFlickL' : 'earFlickR';
      expression = 'playful';
    }
    this.blinkCtl.trigger();
    this.overlay = { expression, timeLeft: zone === 'ear' ? 1.1 : 1.6 };
    this.clips.play(CLIPS[clip]);
  }

  update(dtRaw: number, input: BrainInput): Pose {
    const dt = Math.min(dtRaw, 1 / 20);
    const style = ANIMATION_STYLES[input.style];
    this.time += dt;
    this.stateTime += dt;
    const t = this.time;
    const m = this.def.motion;

    // --- State machine: one-shot states return to rest ------------------
    if (this.def.duration && this.stateTime >= this.def.duration) {
      this.setState(this.restingState, true);
    }

    // --- Face target ----------------------------------------------------
    if (this.overlay) {
      this.overlay.timeLeft -= dt;
      if (this.overlay.timeLeft <= 0) this.overlay = this.overlay.then ?? null;
    }
    const exprName: ExpressionName =
      this.overlay?.expression ??
      (this.def.duration || this.state === 'sleep' ? this.def.expression : input.expression ?? this.def.expression);
    const expr = EXPRESSIONS[exprName];
    Object.assign(this.faceTarget, expr);

    // --- Clips (additive) -----------------------------------------------
    const clipOut = emptyChannels();
    this.clips.update(dt, clipOut, style.clipScale);

    // Listening: occasional attentive nods.
    if (this.state === 'listening' && !this.clips.active) {
      this.nextNod -= dt;
      if (this.nextNod <= 0) {
        this.clips.play(CLIPS.nod);
        this.nextNod = 3.5 + this.rnd() * 3.5;
      }
    }

    this.faceTarget.smile += clipOut.smile;
    this.faceTarget.mouthOpen += clipOut.mouthOpen;
    this.faceTarget.lidUpper += clipOut.lidUpper;
    this.faceTarget.browRaise += clipOut.browRaise;
    this.faceTarget.glow += clipOut.glow;

    // Smooth the face. Clip-driven face accents are faster than expression changes.
    const face = this.face.update(this.faceTarget, dt, style.faceFreq);

    // --- Talking --------------------------------------------------------
    const talking = !!this.def.talk || input.speechLevel != null;
    const tw = this.talkWeight.update(talking ? 1 : 0, dt);
    let stress = 0;
    if (tw > 0.001) {
      const f = this.talk.update(dt, input.speechLevel);
      face.mouthOpen = face.mouthOpen * (1 - tw) + f.open * 0.72 * tw;
      face.mouthRound = face.mouthRound * (1 - tw) + f.round * tw;
      face.mouthWidth = face.mouthWidth * (1 - tw) + f.width * tw;
      face.browRaise += f.stress * 0.25 * tw;
      stress = f.stress * tw;
    }

    // --- Gaze -----------------------------------------------------------
    const g = this.gaze.update(dt, this.def.gaze, input.pointer, input.tracking);
    const yawT = clamp(g.yaw, -0.75, 0.75);
    const pitchT = clamp(g.pitch, -0.5, 0.5);
    const gy = this.gazeYaw.update(yawT, dt, style.gazeFreq);
    const gp = this.gazePitch.update(pitchT, dt, style.gazeFreq);
    const follow = m.headFollow;
    const hy = this.headYaw.update(yawT * follow, dt, style.bodyFreq * 0.8);
    const hp = this.headPitch.update(pitchT * follow * 0.8, dt, style.bodyFreq * 0.8);
    if (g.jumped && input.blinking && this.rnd() < 0.45) this.blinkCtl.trigger();

    // --- Body: held pose + procedural layers + clip ----------------------
    for (const ch of CHANNELS) this.poseTarget[ch] = this.def.pose?.[ch] ?? 0;
    const held = this.poseSprings.update(this.poseTarget, dt, style.bodyFreq);
    const body = this.pose.body;
    const amp = style.idleAmp;
    this.breathPhase += dt * m.breathRate * Math.PI * 2;
    const breath = Math.sin(this.breathPhase);
    const sway = m.sway * amp;
    const drift = m.headDrift * amp;
    for (const ch of CHANNELS) body[ch] = held[ch] + clipOut[ch];

    body.squash += breath * 0.011 * m.breathAmp;
    body.rootRz += fbm1(t * 0.13) * 0.028 * sway;
    body.rootX += fbm1(t * 0.1 + 5) * 0.014 * sway;
    body.rootRy += fbm1(t * 0.07 + 9) * 0.07 * sway;
    body.headRz += fbm1(t * 0.17 + 3) * 0.045 * drift + face.headTilt;
    body.headRx += fbm1(t * 0.15 + 7) * 0.025 * drift + face.headPitch + hp + stress * 0.035;
    body.headRy += fbm1(t * 0.11 + 1) * 0.05 * drift + hy;
    body.armLz += breath * 0.025 * m.breathAmp + fbm1(t * 0.2 + 11) * 0.04 * sway;
    body.armRz -= breath * 0.025 * m.breathAmp + fbm1(t * 0.2 + 13) * 0.04 * sway;
    body.earL += face.earPerk;
    body.earR += face.earPerk;

    // --- Blink ----------------------------------------------------------
    const blinkRate = this.def.gaze === 'closed' ? 0 : m.blinkRate;
    const blink = this.blinkCtl.update(dt, blinkRate, input.blinking);

    const pose = this.pose;
    pose.face = face as FaceParams;
    pose.eyeYaw = gy - hy;
    pose.eyePitch = gp - hp;
    pose.blink = blink;
    pose.breath = breath;
    pose.antennaKick = this.antennaKick;
    this.antennaKick = 0;
    pose.time = t;
    return pose;
  }
}
