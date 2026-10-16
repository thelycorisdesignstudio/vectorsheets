import { EXPRESSIONS, NEUTRAL_FACE } from '../config/expressions';
import type { Behaviour, ExpressionName, FaceParams, ReactionKind } from '../types';
import type { Channel } from './keyframes';
import type { ClipName } from './clips';
import { createRandom } from './math';

/** Motion modifiers a behaviour applies on top of the active state. */
export interface MotionModifier {
  /** scales idle body motion (sway, drift) */
  energy: number;
  /** scales breathing rate */
  tempo: number;
  /** scales speaking gestures (nods, beats) */
  gesture: number;
  /** extra eye contact (positive) or aversion (negative) */
  contact: number;
  /** blink rate multiplier */
  blink: number;
}

export interface BehaviourDefinition {
  label: string;
  face: Partial<FaceParams>;
  pose?: Partial<Record<Channel, number>>;
  motion: MotionModifier;
  /** parameters whose sign may flip between applications (keeps repeats varied) */
  mirrorable?: (keyof FaceParams)[];
}

const M = (m: Partial<MotionModifier>): MotionModifier => ({ energy: 1, tempo: 1, gesture: 1, contact: 0, blink: 1, ...m });

/**
 * Behaviours: bounded recipes the conversational layer can request.
 * They add small deltas to the face, a held pose and motion modifiers.
 */
export const BEHAVIOURS: Record<Behaviour, BehaviourDefinition> = {
  neutral: { label: 'Neutral', face: {}, motion: M({}) },
  attentive: {
    label: 'Attentive',
    face: { browRaise: 0.14, lidUpper: 0.03, smile: 0.06, earPerk: 0.3, headTilt: 0.05 },
    pose: { rootRx: 0.03 },
    motion: M({ energy: 0.6, gesture: 0.8, contact: 0.3, blink: 0.8 }),
    mirrorable: ['headTilt'],
  },
  curious: {
    label: 'Curious',
    face: { browRaise: 0.32, browAsym: 0.6, mouthRound: 0.25, mouthWidth: -0.12, headTilt: 0.16, earPerk: 0.4, pupil: 0.04 },
    pose: { rootRx: 0.045, headRx: 0.03 },
    motion: M({ energy: 0.7, contact: 0.2, blink: 0.75 }),
    mirrorable: ['headTilt', 'browAsym'],
  },
  excited: {
    label: 'Excited',
    face: { browRaise: 0.42, smile: 0.4, mouthOpen: 0.1, eyeScale: 0.04, earPerk: 0.6, glow: 0.4, cheek: 0.4, blush: 0.25 },
    motion: M({ energy: 1.45, tempo: 1.25, gesture: 1.5, blink: 1.1 }),
  },
  calm: {
    label: 'Calm',
    face: { smile: 0.1, lidUpper: -0.08, browRaise: -0.06, earPerk: -0.1 },
    motion: M({ energy: 0.55, tempo: 0.75, gesture: 0.6, blink: 0.7 }),
  },
  playful: {
    label: 'Playful',
    face: { browAsym: 0.4, browTilt: 0.25, smile: 0.35, mouthAsym: 0.3, headTilt: -0.1, cheek: 0.3, lidLower: 0.12 },
    motion: M({ energy: 1.2, gesture: 1.2 }),
    mirrorable: ['browAsym', 'mouthAsym', 'headTilt'],
  },
  thoughtful: {
    label: 'Thoughtful',
    face: { browAsym: -0.4, browTilt: 0.2, lidUpper: -0.12, mouthWidth: -0.2, mouthAsym: 0.4, smile: -0.1 },
    motion: M({ energy: 0.75, tempo: 0.85, gesture: 0.7, contact: -0.3 }),
    mirrorable: ['browAsym', 'mouthAsym'],
  },
  reassuring: {
    label: 'Reassuring',
    face: { smile: 0.3, browTilt: -0.3, lidLower: 0.25, headTilt: 0.08, cheek: 0.2 },
    pose: { headRx: 0.03 },
    motion: M({ energy: 0.8, tempo: 0.9, gesture: 0.9, contact: 0.3, blink: 0.85 }),
    mirrorable: ['headTilt'],
  },
};

export interface ReactionDefinition {
  label: string;
  expression: ExpressionName;
  /** extra face deltas on top of the expression */
  face?: Partial<FaceParams>;
  clips: ClipName[];
  duration: number;
  /** antenna / crown impulse */
  kick?: number;
}

/** Each reaction has several clip variants so repeats don't look canned. */
export const REACTIONS: Record<ReactionKind, ReactionDefinition> = {
  surprise: { label: 'Surprise', expression: 'surprised', clips: ['surprised', 'startle'], duration: 1.3, kick: 1 },
  delight: { label: 'Delight', expression: 'happy', clips: ['happy', 'wiggle'], duration: 1.7 },
  curious: { label: 'Curious', expression: 'curious', clips: ['tiltIn', 'tiltInAlt'], duration: 1.8 },
  giggle: { label: 'Giggle', expression: 'happy', face: { lidLower: 0.3 }, clips: ['giggle', 'wiggle'], duration: 1.4 },
  acknowledge: { label: 'Acknowledge', expression: 'listening', face: { smile: 0.15 }, clips: ['nod', 'nodSmall', 'nodDouble'], duration: 0.9 },
  yield: { label: 'Yield', expression: 'listening', face: { browRaise: 0.3, mouthOpen: 0 }, clips: ['yield'], duration: 0.8 },
  empathy: { label: 'Empathy', expression: 'concerned', face: { smile: 0.25, browTilt: -0.2 }, clips: ['nodSlow'], duration: 1.8 },
  flick: { label: 'Ear flick', expression: 'playful', clips: ['earFlickL', 'earFlickR'], duration: 1 },
};

/**
 * Maps expression names and behaviours to concrete facial parameters, with
 * controlled variation: each application draws a small, bounded jitter and
 * may mirror asymmetric features, so repeated moments never look identical.
 */
export class ExpressionController {
  private rnd = createRandom(17);
  private variation: Partial<FaceParams> = {};
  private mirror = 1;
  approved: Set<ExpressionName> | null = null;

  /** Current mirroring of asymmetric features (also used for look direction). */
  get mirrorSign() {
    return this.mirror;
  }

  /** Call when a new expressive moment starts (state change, new behaviour). */
  vary(amount = 1) {
    this.mirror = this.rnd() < 0.5 ? 1 : -1;
    const j = (s: number) => (this.rnd() * 2 - 1) * s * amount;
    this.variation = { browRaise: j(0.07), smile: j(0.06), headTilt: j(0.04), lidUpper: j(0.03), browAsym: j(0.08) };
  }

  /** Falls back to neutral when an expression is not in the approved set. */
  resolve(name: ExpressionName): ExpressionName {
    if (this.approved && !this.approved.has(name)) return 'neutral';
    return name;
  }

  compose(expression: ExpressionName, behaviour: Behaviour, out: FaceParams, behaviourWeight = 1): FaceParams {
    Object.assign(out, EXPRESSIONS[this.resolve(expression)] ?? NEUTRAL_FACE);
    const b = BEHAVIOURS[behaviour];
    for (const k in b.face) {
      const key = k as keyof FaceParams;
      const flip = b.mirrorable?.includes(key) ? this.mirror : 1;
      out[key] += (b.face[key] ?? 0) * flip * behaviourWeight;
    }
    for (const k in this.variation) out[k as keyof FaceParams] += this.variation[k as keyof FaceParams] ?? 0;
    return out;
  }
}
