import type { GazePolicy } from '../config/states';
import { clamp, createRandom } from './math';

export interface GazeProfile {
  /** 0..1 how much the character prefers eye contact */
  eyeContact: number;
  /** 0..1 how readily the pointer attracts attention */
  pointerInterest: number;
  /** idle glances per minute */
  glanceRate: number;
}

export interface Angles {
  yaw: number;
  pitch: number;
}

export interface GazeInput {
  policy: GazePolicy;
  /** direction to the camera = eye contact with the user */
  camera: Angles & { valid: boolean };
  pointer: Angles & { active: boolean; speed: number };
  /** explicit look target (developer tools / scripted moments) */
  override: Angles | null;
  /** behaviour bias: >0 more contact, <0 more aversion */
  contact: number;
  /** speech: a new phrase just started */
  phraseStart: boolean;
  tracking: boolean;
  profile: GazeProfile;
}

export type FixationKind = 'user' | 'pointer' | 'glance' | 'avert' | 'check' | 'override' | 'closed';

/**
 * Attention model. Rather than chasing the cursor, the eyes choose a
 * fixation (user, pointer, glance, aversion), hold it, and jump between
 * fixations in saccades — with human-like reaction latency, micro-saccades
 * during holds and policy-specific rhythms (thinking looks away, speaking
 * breaks eye contact at phrase starts, listening keeps contact).
 */
export class GazeController {
  private rnd = createRandom(23);
  private kind: FixationKind = 'user';
  private hold = 0;
  private offset: Angles = { yaw: 0, pitch: 0 };
  private micro: Angles = { yaw: 0, pitch: 0 };
  private microTimer = 0;
  private breakTimer = 4;
  private pointerLatency = 0;
  private pointerSeen = false;
  private lastPolicy: GazePolicy = 'ambient';
  private avertSide = 1;
  private fix: Angles = { yaw: 0, pitch: 0 };
  readonly out = { yaw: 0, pitch: 0, kind: 'user' as FixationKind, jumped: false };

  private set(kind: FixationKind, hold: number, offset: Angles = { yaw: 0, pitch: 0 }) {
    this.kind = kind;
    this.hold = hold;
    this.offset = offset;
  }

  private r(a: number, b: number) {
    return a + (b - a) * this.rnd();
  }

  update(dt: number, g: GazeInput) {
    const prev = { ...this.fix };
    this.hold -= dt;
    this.breakTimer -= dt;
    const contact = clamp(g.profile.eyeContact + g.contact, 0, 1);
    const user: Angles = g.camera.valid
      ? { yaw: clamp(g.camera.yaw, -0.85, 0.85), pitch: clamp(g.camera.pitch, -0.45, 0.45) }
      : { yaw: 0, pitch: 0 };

    if (g.policy !== this.lastPolicy) {
      // Entering a new policy: thinking looks away immediately, others re-engage.
      if (g.policy === 'avert') {
        this.avertSide *= -1;
        this.set('avert', this.r(1.3, 2.4), { yaw: 0.36 * this.avertSide, pitch: -0.28 });
      } else if (g.policy !== 'closed') this.set('user', this.r(1.5, 3));
      this.lastPolicy = g.policy;
    }

    if (g.override) {
      this.kind = 'override';
      this.fix = { ...g.override };
    } else if (g.policy === 'closed') {
      this.kind = 'closed';
      this.fix = { yaw: this.fix.yaw * 0.98, pitch: 0.12 };
    } else {
      this.choose(dt, g, contact);
      const base = this.kind === 'pointer' ? { yaw: g.pointer.yaw, pitch: g.pointer.pitch } : user;
      this.fix = { yaw: base.yaw + this.offset.yaw, pitch: base.pitch + this.offset.pitch };
    }

    // Micro-saccades keep a held gaze alive.
    this.microTimer -= dt;
    if (this.microTimer <= 0) {
      this.micro = { yaw: this.r(-0.014, 0.014), pitch: this.r(-0.01, 0.01) };
      this.microTimer = this.r(0.35, 1.1);
    }
    const o = this.out;
    o.yaw = clamp(this.fix.yaw + this.micro.yaw, -0.9, 0.9);
    o.pitch = clamp(this.fix.pitch + this.micro.pitch, -0.55, 0.55);
    o.kind = this.kind;
    o.jumped = Math.hypot(this.fix.yaw - prev.yaw, this.fix.pitch - prev.pitch) > 0.28;
    return o;
  }

  private choose(dt: number, g: GazeInput, contact: number) {
    const p = g.policy;
    // --- Pointer interest (relaxed states only) ---
    const pointerAllowed = g.tracking && p === 'ambient' && g.pointer.active;
    if (pointerAllowed) {
      if (!this.pointerSeen) {
        // Notice the pointer after a short, human reaction delay.
        this.pointerLatency = this.r(0.12, 0.25);
        this.pointerSeen = true;
      }
      this.pointerLatency -= dt;
      if (this.pointerLatency <= 0 && this.kind !== 'pointer' && this.rnd() < g.profile.pointerInterest * dt * 12) {
        this.set('pointer', this.r(1.2, 2.2));
      }
      if (this.kind === 'pointer') {
        this.hold = Math.max(this.hold, 0.6);
        return;
      }
    } else {
      this.pointerSeen = false;
      if (this.kind === 'pointer' && this.hold <= 0) this.set('user', this.r(2, 4));
      if (this.kind === 'pointer') return;
    }

    switch (p) {
      case 'avert':
        if (this.hold <= 0) {
          if (this.kind === 'avert') this.set('check', this.r(0.45, 0.9));
          else {
            this.avertSide = this.rnd() < 0.7 ? this.avertSide : -this.avertSide;
            this.set('avert', this.r(1.3, 2.6), { yaw: this.r(0.28, 0.42) * this.avertSide, pitch: this.r(-0.34, -0.18) });
          }
        }
        // Slow drift while looking away.
        if (this.kind === 'avert') this.offset.yaw += Math.sin(this.hold * 1.3) * 0.0015;
        break;
      case 'social':
        if (g.phraseStart && this.kind === 'user' && this.rnd() < 0.4 * (1.2 - contact)) {
          const side = this.rnd() < 0.5 ? -1 : 1;
          this.set('glance', this.r(0.5, 1.0), { yaw: this.r(0.16, 0.3) * side, pitch: this.r(-0.14, 0.1) });
        } else if (this.hold <= 0 && this.kind !== 'user') this.set('user', this.r(1.5, 3.5));
        break;
      case 'attentive':
        if (this.kind !== 'user' && this.hold <= 0) this.set('user', this.r(3, 6));
        if (this.kind === 'user' && this.breakTimer <= 0) {
          this.breakTimer = this.r(7, 14) * (0.5 + contact);
          this.set('glance', this.r(0.3, 0.55), { yaw: this.r(-0.16, 0.16), pitch: this.r(-0.06, 0.1) });
        }
        break;
      default: {
        // Ambient: mostly with the user, glancing around at a configurable rate.
        if (this.hold > 0) break;
        const glanceChance = (g.profile.glanceRate / 60) * (1.3 - contact);
        if (this.kind === 'user' && this.rnd() < glanceChance * 4) {
          const side = this.rnd() < 0.5 ? -1 : 1;
          this.set('glance', this.r(0.6, 1.4), { yaw: this.r(0.18, 0.5) * side, pitch: this.r(-0.22, 0.14) });
        } else this.set('user', this.r(2, 4.5));
      }
    }
  }
}
