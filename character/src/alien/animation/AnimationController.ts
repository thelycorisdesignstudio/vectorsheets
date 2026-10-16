import { CLIPS, type ClipName } from './clips';
import { BlinkController } from './blink';
import { GazeController, type Angles, type FixationKind, type GazeProfile } from './gaze';
import { CHANNELS, ClipLayer, emptyChannels, type ChannelRecord } from './keyframes';
import { clamp, createRandom, fbm1, smoothstep } from './math';
import { Spring, SpringRecord } from './springs';
import { BEHAVIOURS, ExpressionController, REACTIONS } from './expression';
import { SpeechAnimationController, type SpeechSyncSource } from './speech/SpeechAnimationController';
import type { Viseme } from './speech/visemes';
import { NEUTRAL_FACE } from '../config/expressions';
import { ANIMATION_STYLES, STATES, type StateDefinition } from '../config/states';
import type { AnimationState, AnimationStyle, Behaviour, ExpressionName, FaceParams, ReactionKind } from '../types';

/** Everything a renderer needs for one frame. Renderer-agnostic. */
export interface Pose {
  face: FaceParams;
  /** Eye rotation relative to the head (rad); pitch positive looks down. */
  eyeYaw: number;
  eyePitch: number;
  /** Convergence for near targets (rad, added to the left eye, removed from the right). */
  vergence: number;
  /** 0 open … 1 closed, layered over the lids */
  blink: number;
  body: ChannelRecord;
  breath: number;
  /** Impulse for secondary motion (antennae / crown) */
  kick: number;
  /** 0..1 extra crown ripple (delight, wiggles) */
  flourish: number;
  time: number;
}

/** Per-frame inputs from the renderer (all angles relative to the body). */
export interface FrameInput {
  camera: Angles & { valid: boolean };
  pointer: Angles & { active: boolean; speed: number };
  /** the pointer is hovering over the character */
  hover?: boolean;
}

/** Small spontaneous expressions that give the idle face an inner life. */
interface Micro {
  name: string;
  face: Partial<FaceParams>;
  duration: number;
  time: number;
  flourish?: number;
}

const MICROS: { name: string; weight: number; duration: number; face: Partial<FaceParams>; flourish?: number }[] = [
  { name: 'soft smile', weight: 3, duration: 1.8, face: { smile: 0.32, cheek: 0.3, lidLower: 0.18, blush: 0.2 } },
  { name: 'brow flash', weight: 2, duration: 0.55, face: { browRaise: 0.5, browArch: 0.35, lidUpper: 0.08, pupil: 0.06 } },
  { name: 'content sigh', weight: 1.5, duration: 2.2, face: { lidUpper: -0.32, smile: 0.18, lidLower: 0.12 } },
  { name: 'curious peek', weight: 1.5, duration: 1.4, face: { browAsym: 0.6, browRaise: 0.15, pupil: 0.1, mouthRound: 0.2 } },
  { name: 'happy wiggle', weight: 1, duration: 1.2, face: { smile: 0.25, earPerk: 0.4 }, flourish: 1 },
];

/** Settings that change rarely (from props / profile / dev tools). */
export interface ControllerSettings {
  style: AnimationStyle;
  /** 0..1.5 movement intensity */
  intensity: number;
  /** speaking gesture intensity 0..1.5 */
  gesture: number;
  blinking: boolean;
  /** blink frequency multiplier */
  blinkScale: number;
  tracking: boolean;
  reducedMotion: boolean;
  /** forces a facial expression regardless of state (dev / art direction) */
  expressionOverride: ExpressionName | null;
  /** forces the eye target (dev gaze tester) */
  gazeOverride: Angles | null;
  gaze: GazeProfile;
  /** expression used by the idle state */
  defaultExpression: ExpressionName;
}

export interface RequestOptions {
  /** bypass minimum durations */
  force?: boolean;
  /** why (shown in diagnostics) */
  reason?: string;
}

export interface ControllerSnapshot {
  state: AnimationState;
  previous: AnimationState;
  resume: AnimationState;
  stateTime: number;
  pending: AnimationState | null;
  expression: ExpressionName;
  behaviour: Behaviour;
  reaction: string | null;
  gaze: FixationKind;
  clips: string[];
  speech: { active: boolean; source: SpeechSyncSource; viseme: Viseme; weight: number };
  blink: number;
  lastReason: string;
}

const DEFAULT_SETTINGS: ControllerSettings = {
  style: 'playful',
  intensity: 1,
  gesture: 1,
  blinking: true,
  blinkScale: 1,
  tracking: true,
  reducedMotion: false,
  expressionOverride: null,
  gazeOverride: null,
  gaze: { eyeContact: 0.7, pointerInterest: 0.6, glanceRate: 8 },
  defaultExpression: 'neutral',
};

/**
 * The central animation controller. One instance coordinates body, head,
 * eyes, brows and mouth through explicit layers (low → high priority):
 *
 *  body:  idle motion → held state pose → gesture clips (with override masks)
 *         → speech beats → gaze head-follow
 *  face:  state expression → behaviour → reaction overlay → clip accents
 *         → speech (owns the mouth, keeps part of the smile) → blink
 *
 * States have explicit entry clips, behaviour, exit clips, minimum
 * durations and timed exits. Requests made too early are deferred, never
 * dropped, so the character cannot jitter between states.
 */
export class AnimationController {
  state: AnimationState = 'idle';
  previous: AnimationState = 'idle';
  resume: AnimationState = 'idle';
  behaviour: Behaviour = 'neutral';
  readonly settings: ControllerSettings = { ...DEFAULT_SETTINGS, gaze: { ...DEFAULT_SETTINGS.gaze } };
  readonly speech = new SpeechAnimationController();
  readonly expressions = new ExpressionController();

  private listeners = new Set<(s: AnimationState, prev: AnimationState) => void>();
  private def: StateDefinition = STATES.idle;
  private stateTime = 0;
  private time = 0;
  private pending: { state: AnimationState; opts: RequestOptions } | null = null;
  private lastReason = 'start';
  private rnd = createRandom(5);
  private clips = new ClipLayer();
  private blinkCtl = new BlinkController();
  private gaze = new GazeController();
  private overlay: { kind: ReactionKind; timeLeft: number } | null = null;
  private lastVariant = new Map<ReactionKind, ClipName>();
  private nextNod = 3;
  private kick = 0;
  private enterBoost = 0;

  // Slightly underdamped: expressions arrive with a small, lively overshoot.
  private face = new SpringRecord<keyof FaceParams>({ ...NEUTRAL_FACE }, 8, 0.72);
  private micro: Micro | null = null;
  private microTimer = 3;
  private hover = new Spring(0, 4);
  private contact = new Spring(0, 3);
  private lastGazeKind: FixationKind = 'user';
  private lastExpression: ExpressionName = 'neutral';
  private flourish = 0;
  // Pose-to-pose idle: a relaxed pose is chosen, eased into slowly and held.
  private idlePoseTarget = { headRz: 0, headRx: 0, headRy: 0, rootRz: 0, rootRx: 0, rootX: 0, armLz: 0, armRz: 0 };
  private idlePose = new SpringRecord({ ...this.idlePoseTarget }, 1.7);
  private idlePoseTimer = 1.5;
  private poseSide = 1;
  private poseSprings = new SpringRecord(emptyChannels(), 4.5);
  private gazeYaw = new Spring(0, 26);
  private gazePitch = new Spring(0, 26);
  private headYaw = new Spring(0, 3.5);
  private headPitch = new Spring(0, 3.5);
  private behaviourWeight = new Spring(0, 3);
  private breathPhase = 0;
  private faceTarget: FaceParams = { ...NEUTRAL_FACE };
  private poseTarget = emptyChannels();
  private clipOut = emptyChannels();
  private effectiveExpression: ExpressionName = 'neutral';

  readonly pose: Pose = {
    face: this.face.value as FaceParams,
    eyeYaw: 0, eyePitch: 0, vergence: 0, blink: 0,
    body: emptyChannels(), breath: 0, kick: 0, flourish: 0, time: 0,
  };

  configure(partial: Partial<ControllerSettings>) {
    Object.assign(this.settings, partial);
    if (partial.gaze) this.settings.gaze = { ...this.settings.gaze, ...partial.gaze };
  }

  onStateChange(fn: (s: AnimationState, prev: AnimationState) => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /** Ask for a state. Returns false if deferred until the current state's minimum duration. */
  request(next: AnimationState, opts: RequestOptions = {}): boolean {
    if (next === this.state && !STATES[next].enter?.clip) return true;
    const min = this.def.minDuration ?? 0;
    if (!opts.force && this.stateTime < min) {
      this.pending = { state: next, opts };
      return false;
    }
    this.enter(next, opts.reason ?? 'request');
    return true;
  }

  private enter(next: AnimationState, reason: string) {
    const prev = this.state;
    const prevDef = this.def;
    this.pending = null;
    this.previous = prev;
    this.state = next;
    this.def = STATES[next];
    this.stateTime = 0;
    this.lastReason = reason;
    if (!this.def.transient) this.resume = next === 'sleep' || next === 'farewell' ? 'idle' : next;
    // Exit choreography of the old state, entry choreography of the new one.
    if (prevDef.exit?.clip && prev !== next && (prev === 'sleep' || !this.def.enter?.clip)) this.playClip(prevDef.exit.clip);
    if (this.def.enter?.clip) this.playClip(this.def.enter.clip);
    this.enterBoost = this.def.enter?.speed ? 1 : 0;
    if (prev === 'speaking' && next !== 'speaking') this.speech.end();
    this.expressions.vary(0.8);
    for (const l of this.listeners) l(next, prev);
  }

  setBehaviour(b: Behaviour) {
    if (b === this.behaviour) return;
    this.behaviour = b;
    this.expressions.vary(1);
    this.behaviourWeight.snap(0);
  }

  /** A short expressive reaction. Persistent quiet states pass through `reacting`. */
  react(kind: ReactionKind, opts: { side?: 1 | -1 } = {}) {
    const def = REACTIONS[kind];
    let clip: ClipName = def.clips[0];
    if (kind === 'flick') clip = (opts.side ?? 1) > 0 ? 'earFlickL' : 'earFlickR';
    else if (def.clips.length > 1) {
      // Pick a variant different from the last one used for this reaction.
      const options = def.clips.filter((c) => c !== this.lastVariant.get(kind));
      clip = options[Math.floor(this.rnd() * options.length)];
    }
    this.lastVariant.set(kind, clip);
    this.playClip(clip);
    this.overlay = { kind, timeLeft: def.duration };
    this.kick += def.kick ?? 0;
    if (kind === 'delight' || kind === 'giggle') this.flourish = 1;
    this.micro = null;
    if (kind !== 'surprise') this.blinkCtl.trigger();
    if (this.state === 'sleep') this.enter('idle', `wake: ${kind}`);
    else if (['idle', 'waiting'].includes(this.state)) this.enter('reacting', `react: ${kind}`);
  }

  /**
   * Choose the next relaxed pose. Head tilts tend to alternate sides, the
   * body counter-balances the head, and listening tilts are larger and
   * slower (an attentive, "I'm with you" lean). Speaking poses are smaller
   * and change on phrase boundaries.
   */
  private nextIdlePose(hold: [number, number]) {
    const r = (a: number, b: number) => a + (b - a) * this.rnd();
    if (this.rnd() < 0.75) this.poseSide *= -1;
    const s = this.poseSide;
    const scale = this.state === 'listening' ? 1.25 : this.state === 'speaking' ? 0.6 : this.state === 'thinking' ? 0.5 : 1;
    const centred = this.rnd() < 0.22; // sometimes simply settle upright
    const T = this.idlePoseTarget;
    T.headRz = centred ? 0 : s * r(0.07, 0.17) * scale;
    T.headRx = r(-0.03, 0.06) * scale;
    T.headRy = r(-0.08, 0.08) * scale;
    T.rootRz = centred ? 0 : -s * r(0.01, 0.035) * scale;
    T.rootRx = r(0, 0.03) * scale;
    T.rootX = -s * r(0, 0.02) * scale;
    T.armLz = r(-0.04, 0.08) * scale;
    T.armRz = -r(-0.04, 0.08) * scale;
    this.idlePoseTimer = r(hold[0], hold[1]) * (this.state === 'speaking' ? 0.5 : 1);
  }

  private startMicro(name?: string) {
    let pick = MICROS.find((m) => m.name === name);
    if (!pick) {
      const total = MICROS.reduce((a, m) => a + m.weight, 0);
      let r = this.rnd() * total;
      pick = MICROS.find((m) => (r -= m.weight) <= 0) ?? MICROS[0];
    }
    const flip = this.rnd() < 0.5 ? -1 : 1;
    const face = { ...pick.face };
    if (face.browAsym) face.browAsym *= flip;
    this.micro = { name: pick.name, face, duration: pick.duration * (0.85 + this.rnd() * 0.3), time: 0, flourish: pick.flourish };
    this.microTimer = 6 + this.rnd() * 7;
  }

  playClip(name: ClipName) {
    this.clips.play(name, CLIPS[name]);
  }

  stopClips() {
    this.clips.stop();
  }

  snapshot(): ControllerSnapshot {
    const sf = this.speech.frame;
    return {
      state: this.state,
      previous: this.previous,
      resume: this.resume,
      stateTime: this.stateTime,
      pending: this.pending?.state ?? null,
      expression: this.effectiveExpression,
      behaviour: this.behaviour,
      reaction: this.overlay?.kind ?? (this.micro ? `micro: ${this.micro.name}` : null),
      gaze: this.gaze.out.kind,
      clips: this.clips.names,
      speech: { active: this.speech.active, source: sf.source, viseme: sf.viseme, weight: sf.weight },
      blink: this.pose.blink,
      lastReason: this.lastReason,
    };
  }

  update(dtRaw: number, input: FrameInput): Pose {
    const dt = Math.min(Math.max(dtRaw, 0), 1 / 20);
    const set = this.settings;
    const style = ANIMATION_STYLES[set.style];
    const reduced = set.reducedMotion;
    const intensity = clamp(set.intensity, 0, 1.5) * (reduced ? 0.35 : 1);
    this.time += dt;
    this.stateTime += dt;
    this.enterBoost = Math.max(0, this.enterBoost - dt / 0.8);
    const t = this.time;
    const m = this.def.motion;
    const bdef = BEHAVIOURS[this.behaviour];
    const bw = this.behaviourWeight.update(1, dt);

    // --- State machine housekeeping ----------------------------------
    if (this.pending && this.stateTime >= (this.def.minDuration ?? 0)) this.enter(this.pending.state, this.pending.opts.reason ?? 'deferred');
    if (this.def.duration && this.stateTime >= this.def.duration) {
      const next = this.def.next === 'resume' || !this.def.next ? this.resume : this.def.next;
      this.enter(next === this.state ? 'idle' : next, 'timed');
    }
    if (this.overlay) {
      this.overlay.timeLeft -= dt;
      if (this.overlay.timeLeft <= 0) this.overlay = null;
    }

    // --- Face composition --------------------------------------------
    let exprName: ExpressionName = this.state === 'idle' ? set.defaultExpression : this.def.expression;
    if (set.expressionOverride) exprName = set.expressionOverride;
    let behaviourWeight = bw;
    if (this.overlay) {
      const r = REACTIONS[this.overlay.kind];
      exprName = r.expression;
      behaviourWeight *= 0.4;
    }
    if (this.state === 'sleep') behaviourWeight = 0;
    this.effectiveExpression = this.expressions.resolve(exprName);
    this.expressions.compose(exprName, this.behaviour, this.faceTarget, behaviourWeight);
    if (this.overlay) {
      const extra = REACTIONS[this.overlay.kind].face;
      if (extra) for (const k in extra) this.faceTarget[k as keyof FaceParams] += extra[k as keyof FaceParams] ?? 0;
    }

    // --- Gesture clips --------------------------------------------------
    const clipOut = this.clipOut;
    for (const ch of CHANNELS) clipOut[ch] = 0;
    this.clips.update(dt, clipOut, style.clipScale * (reduced ? 0.45 : 1) * clamp(set.intensity, 0.3, 1.3));
    if (reduced) clipOut.rootY *= 0.3;

    if (this.state === 'listening' && !this.clips.isPlaying()) {
      this.nextNod -= dt;
      if (this.nextNod <= 0) {
        this.playClip(this.rnd() < 0.5 ? 'nod' : this.rnd() < 0.5 ? 'nodSmall' : 'nodDouble');
        this.nextNod = 3.5 + this.rnd() * 4;
      }
    }

    // Inner life: occasional micro-expressions while the character is not busy.
    const quiet = ['idle', 'waiting', 'listening'].includes(this.state) && !this.overlay && !set.expressionOverride;
    this.microTimer -= dt;
    if (quiet && !this.micro && this.microTimer <= 0) this.startMicro();
    if (this.micro) {
      const mc = this.micro;
      mc.time += dt;
      const env = Math.sin(Math.PI * Math.min(1, mc.time / mc.duration));
      for (const k in mc.face) this.faceTarget[k as keyof FaceParams] += (mc.face[k as keyof FaceParams] ?? 0) * env;
      if (mc.time >= mc.duration || !quiet) this.micro = null;
    }
    // Pointer hovering over the character: a pleased, expectant look.
    const hv = this.hover.update(input.hover && this.state !== 'sleep' ? 1 : 0, dt);
    this.faceTarget.smile += hv * 0.28;
    this.faceTarget.blush += hv * 0.35;
    this.faceTarget.pupil += hv * 0.08;
    this.faceTarget.lidLower += hv * 0.15;
    this.faceTarget.cheek += hv * 0.25;
    this.faceTarget.earPerk += hv * 0.25;

    this.faceTarget.smile += clipOut.smile;
    this.faceTarget.mouthOpen += clipOut.mouthOpen;
    this.faceTarget.lidUpper += clipOut.lidUpper;
    this.faceTarget.browRaise += clipOut.browRaise;
    this.faceTarget.glow += clipOut.glow;

    this.face.setDamping(style.faceDamping);
    const faceFreq = style.faceFreq * (1 + this.enterBoost * 0.6) * (this.overlay ? 1.4 : 1);
    // Eye contact dilates the pupils a touch.
    this.faceTarget.pupil += this.contact.value * 0.05;
    const face = this.face.update(this.faceTarget, dt, faceFreq) as FaceParams;
    if (this.effectiveExpression !== this.lastExpression) {
      // People blink as their expression changes; it reads as a thought turning over.
      if (set.blinking && this.rnd() < 0.55 && this.state !== 'sleep') this.blinkCtl.trigger();
      this.lastExpression = this.effectiveExpression;
    }

    // --- Speech layer (owns the mouth) --------------------------------
    const sf = this.speech.update(dt);
    let stress = 0;
    if (sf.weight > 0.001) {
      const w = this.def.speech || this.speech.active ? sf.weight : sf.weight * 0.5;
      const mo = sf.mouth;
      // Companion-scale speech: shapes are read, not flapped.
      face.mouthOpen = face.mouthOpen * (1 - w) + mo.open * 0.78 * w;
      face.mouthRound = face.mouthRound * (1 - w) + mo.round * w;
      face.mouthWidth = face.mouthWidth * (1 - w) + mo.width * w;
      // Keep part of the expression's smile so speech stays in character.
      face.smile = face.smile * (1 - w * 0.45);
      face.teeth = face.teeth * (1 - w) + mo.teeth * w;
      face.tongue = face.tongue * (1 - w) + mo.tongue * w;
      face.jaw = face.jaw * (1 - w) + mo.jaw * w;
      stress = sf.stress * w;
      face.browRaise += stress * 0.22 * set.gesture;
      if (sf.phraseStart && set.gesture > 0.2) {
        if (this.rnd() < 0.35 * set.gesture) this.playClip('nodSmall');
        if (set.blinking && this.rnd() < 0.25) this.blinkCtl.trigger();
      }
    }
    // Jaw follows open mouths a little even outside speech.
    face.jaw = Math.max(face.jaw, face.mouthOpen * 0.5);

    // --- Gaze -----------------------------------------------------------
    const g = this.gaze.update(dt, {
      policy: this.def.gaze,
      camera: input.camera,
      pointer: input.pointer,
      override: set.gazeOverride,
      contact: bdef.motion.contact * behaviourWeight,
      phraseStart: sf.phraseStart,
      tracking: set.tracking,
      profile: set.gaze,
    });
    const gy = this.gazeYaw.update(g.yaw, dt, style.gazeFreq);
    const gp = this.gazePitch.update(g.pitch, dt, style.gazeFreq);
    const follow = m.headFollow * (reduced ? 0.6 : 1);
    const hy = this.headYaw.update(g.yaw * follow, dt, style.bodyFreq * 0.8);
    const hp = this.headPitch.update(g.pitch * follow * 0.8, dt, style.bodyFreq * 0.8);
    if (g.jumped && set.blinking && this.rnd() < 0.4) this.blinkCtl.trigger();
    this.contact.update(g.kind === 'user' ? 1 : 0, dt);
    // Re-establishing eye contact sometimes comes with a little eyebrow flash.
    if (g.kind === 'user' && this.lastGazeKind !== 'user' && quiet && !this.micro && this.rnd() < 0.3) this.startMicro('brow flash');
    this.lastGazeKind = g.kind;

    // --- Body -------------------------------------------------------------
    const poseWeight = this.def.poseDelay ? smoothstep(this.def.poseDelay, this.def.poseDelay + 0.6, this.stateTime) : 1;
    for (const ch of CHANNELS) {
      this.poseTarget[ch] = (this.def.pose?.[ch] ?? 0) * poseWeight + (bdef.pose?.[ch] ?? 0) * behaviourWeight;
    }
    const held = this.poseSprings.update(this.poseTarget, dt, style.bodyFreq * (1 + this.enterBoost * 0.5));
    const body = this.pose.body;
    const own = this.clips.ownership;
    const energy = 1 + (bdef.motion.energy - 1) * behaviourWeight;
    const amp = style.idleAmp * intensity * m.idle * energy;
    this.breathPhase += dt * m.breathRate * (1 + (bdef.motion.tempo - 1) * behaviourWeight) * Math.PI * 2;
    const breath = Math.sin(this.breathPhase);
    for (const ch of CHANNELS) body[ch] = held[ch] * (1 - own[ch]) + clipOut[ch];

    const idle = (ch: (typeof CHANNELS)[number], v: number) => {
      body[ch] += v * (1 - own[ch]);
    };
    body.squash += breath * 0.011 * m.breathAmp * (reduced ? 0.6 : 1);
    // Weighted, held poses carry most of the life; only a whisper of noise stays on top.
    this.idlePoseTimer -= dt;
    if (this.idlePoseTimer <= 0 || (sf.phraseStart && this.state === 'speaking')) this.nextIdlePose(style.poseHold);
    const ip = this.idlePose.update(this.idlePoseTarget, dt, 1.5 * (0.8 + 0.4 * energy));
    const poseAmp = intensity * style.idleAmp * (this.state === 'sleep' ? 0.3 : 1);
    for (const k in ip) idle(k as (typeof CHANNELS)[number], ip[k as keyof typeof ip] * poseAmp);
    idle('rootRz', fbm1(t * 0.11) * 0.008 * amp);
    idle('rootRy', fbm1(t * 0.06 + 9) * 0.03 * amp);
    idle('headRz', fbm1(t * 0.13 + 3) * 0.012 * amp);
    idle('headRx', fbm1(t * 0.12 + 7) * 0.008 * amp);
    idle('headRy', fbm1(t * 0.09 + 1) * 0.015 * amp);
    idle('armLz', breath * 0.02 * m.breathAmp);
    idle('armRz', -breath * 0.02 * m.breathAmp);
    // Speech beats: emphasis nods and a livelier head while talking.
    if (stress > 0) body.headRx += stress * 0.035 * set.gesture * (reduced ? 0.4 : 1);
    if (sf.weight > 0.01) body.headRy += fbm1(t * 0.35 + 21) * 0.018 * sf.weight * set.gesture * energy;
    body.headRz += face.headTilt;
    body.headRx += face.headPitch + hp;
    body.headRy += hy;
    body.earL += face.earPerk;
    body.earR += face.earPerk;

    // --- Blink -----------------------------------------------------------
    const surprised = this.overlay?.kind === 'surprise';
    const rate = this.def.gaze === 'closed' || surprised ? 0 : m.blinkRate * set.blinkScale * (1 + (bdef.motion.blink - 1) * behaviourWeight);
    const blink = this.blinkCtl.update(dt, rate, set.blinking);

    const pose = this.pose;
    pose.face = face;
    pose.eyeYaw = gy - hy + face.lookYaw * this.expressions.mirrorSign;
    pose.eyePitch = gp - hp + face.lookPitch;
    pose.vergence = g.kind === 'pointer' ? 0.035 : 0.015;
    pose.blink = blink;
    pose.breath = breath;
    pose.kick = this.kick;
    this.kick = 0;
    this.flourish = Math.max(0, this.flourish - dt / 1.4);
    pose.flourish = Math.max(this.flourish, this.micro?.flourish ? Math.sin(Math.PI * Math.min(1, this.micro.time / this.micro.duration)) : 0);
    pose.time = t;
    return pose;
  }
}
