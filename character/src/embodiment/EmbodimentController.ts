import type { AnimationController } from '../alien/animation/AnimationController';
import { createRandom } from '../alien/animation/math';
import type { Behaviour, ReactionKind, TouchZone } from '../alien/types';
import type { EmbodimentEvent } from './events';
import type { CharacterProfile } from './profile';

export interface EventLogEntry {
  time: number;
  type: EmbodimentEvent['type'];
  detail?: string;
}

/**
 * Converts semantic events into visible behaviour. It decides *which* state,
 * behaviour and reaction fit the moment — with context (what the character
 * is doing, how often it was just touched) and controlled variation — and
 * hands the decision to the AnimationController. It never touches 3D objects.
 */
export class EmbodimentController {
  readonly log: EventLogEntry[] = [];
  private rnd = createRandom(77);
  private time = 0;
  private thinkingTimer: number | null = null;
  private greetAfterWake: number | null = null;
  private lastActivity = 0;
  private touches: { zone: TouchZone; time: number }[] = [];
  private profile: CharacterProfile;

  constructor(readonly anim: AnimationController, profile: CharacterProfile) {
    this.profile = profile;
    this.applyProfile(profile);
  }

  applyProfile(profile: CharacterProfile) {
    this.profile = profile;
    const b = profile.behaviour;
    this.anim.configure({
      style: b.animationStyle,
      intensity: b.movementIntensity,
      gesture: b.speakingGestureIntensity,
      blinkScale: b.blinkRate,
      gaze: b.gaze,
      defaultExpression: b.defaultExpression,
    });
    this.anim.expressions.approved = new Set(b.approvedExpressions);
    this.setBehaviour(b.defaultBehaviour);
  }

  private setBehaviour(b: Behaviour | undefined) {
    if (!b) return;
    const allowed = this.profile.behaviour.approvedBehaviours;
    this.anim.setBehaviour(allowed.includes(b) ? b : this.profile.behaviour.defaultBehaviour);
  }

  private record(e: EmbodimentEvent) {
    const detail =
      'zone' in e ? e.zone : 'behaviour' in e && e.behaviour ? e.behaviour : 'reaction' in e && e.reaction ? e.reaction : 'transcript' in e ? e.transcript?.slice(0, 40) : undefined;
    this.log.unshift({ time: this.time, type: e.type, detail });
    if (this.log.length > 30) this.log.pop();
  }

  dispatch(e: EmbodimentEvent) {
    this.record(e);
    if (e.type !== 'AI_FINISHED_SPEAKING') this.lastActivity = this.time;
    const a = this.anim;
    switch (e.type) {
      case 'USER_STARTED_SPEAKING':
      case 'USER_TYPING':
        this.wakeIfResting();
        if (a.state !== 'listening') a.request('listening', { force: a.state !== 'greeting', reason: e.type });
        this.setBehaviour('attentive');
        break;
      case 'USER_FINISHED_SPEAKING':
        // A small acknowledgement that the turn was heard.
        if (a.state === 'listening') a.react('acknowledge');
        break;
      case 'AI_STARTED_THINKING':
        // Quick replies skip the thinking pose entirely; slower ones show it.
        this.thinkingTimer = 0.25 + this.rnd() * 0.25;
        break;
      case 'AI_RESPONSE_READY':
        this.thinkingTimer = null;
        this.setBehaviour(e.behaviour ?? this.profile.behaviour.defaultBehaviour);
        a.request('preparing', { force: true, reason: e.type });
        if (e.reaction) a.react(e.reaction);
        break;
      case 'AI_STARTED_SPEAKING':
        if (e.behaviour) this.setBehaviour(e.behaviour);
        a.request('speaking', { force: true, reason: e.type });
        break;
      case 'AI_FINISHED_SPEAKING':
        a.speech.end();
        a.request('waiting', { force: true, reason: e.type });
        this.setBehaviour(this.profile.behaviour.defaultBehaviour);
        break;
      case 'USER_INTERRUPTED':
        this.thinkingTimer = null;
        a.speech.end();
        a.react('yield');
        a.request('listening', { force: true, reason: e.type });
        this.setBehaviour('attentive');
        break;
      case 'CHARACTER_GREETING':
        this.wakeIfResting();
        if (this.profile.behaviour.greeting.style === 'nod') {
          a.react('acknowledge');
          a.react('delight');
        } else a.request('greeting', { force: true, reason: e.type });
        break;
      case 'CONVERSATION_ENDED':
        this.thinkingTimer = null;
        a.speech.end();
        a.request('farewell', { force: true, reason: e.type });
        this.setBehaviour(this.profile.behaviour.defaultBehaviour);
        break;
      case 'USER_TOUCHED':
        this.onTouch(e.zone, e.side);
        break;
      case 'USER_ACTIVITY':
        if (a.state === 'sleep') this.wakeIfResting();
        break;
      case 'SET_BEHAVIOUR':
        this.setBehaviour(e.behaviour);
        break;
      case 'REACT':
        a.react(e.reaction);
        break;
    }
  }

  private wakeIfResting() {
    if (this.anim.state !== 'sleep') return;
    this.anim.request('idle', { force: true, reason: 'wake' });
    this.greetAfterWake = 1.6;
  }

  /** Touch reactions depend on where, how often and what the character is doing. */
  private onTouch(zone: TouchZone, side: 1 | -1) {
    const a = this.anim;
    if (a.state === 'sleep') {
      a.react('surprise');
      this.greetAfterWake = 1.4;
      return;
    }
    this.touches = this.touches.filter((t) => this.time - t.time < 6);
    this.touches.push({ zone, time: this.time });
    const recent = this.touches.length;
    let reaction: ReactionKind;
    if (zone === 'ear') reaction = 'flick';
    else if (zone === 'antenna') reaction = recent > 2 ? 'delight' : 'surprise';
    else if (recent >= 5) {
      // Lots of poking: a playful "okay, okay" rather than the same giggle again.
      reaction = 'empathy';
      this.setBehaviour('playful');
    } else if (zone === 'head') reaction = recent > 1 && this.rnd() < 0.5 ? 'delight' : 'giggle';
    else reaction = this.rnd() < 0.6 ? 'giggle' : 'delight';
    // While speaking, keep it small: an overlay, no state change.
    a.react(reaction, { side });
  }

  update(dt: number) {
    this.time += dt;
    if (this.thinkingTimer != null) {
      this.thinkingTimer -= dt;
      if (this.thinkingTimer <= 0) {
        this.thinkingTimer = null;
        this.setBehaviour('thoughtful');
        this.anim.request('thinking', { reason: 'AI_STARTED_THINKING' });
      }
    }
    if (this.greetAfterWake != null) {
      this.greetAfterWake -= dt;
      if (this.greetAfterWake <= 0) {
        this.greetAfterWake = null;
        this.anim.request('greeting', { reason: 'woke up' });
      }
    }
    const rest = this.profile.behaviour.restAfter;
    if (rest > 0 && this.anim.state === 'idle' && this.time - this.lastActivity > rest) {
      this.anim.request('sleep', { reason: 'no activity' });
    }
  }

  /** Called on pointer / keyboard activity (throttled by the caller). */
  noteActivity() {
    this.lastActivity = this.time;
    if (this.anim.state === 'sleep') this.dispatch({ type: 'USER_ACTIVITY' });
  }
}
