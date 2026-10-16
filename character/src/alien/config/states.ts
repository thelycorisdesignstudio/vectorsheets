import type { Channel } from '../animation/keyframes';
import type { ClipName } from '../animation/clips';
import type { AnimationState, AnimationStyle, ExpressionName } from '../types';

export type GazeMode = 'track' | 'viewer' | 'think' | 'wander' | 'closed';

export interface MotionProfile {
  /** Breaths per second */
  breathRate: number;
  breathAmp: number;
  /** Weight-shift sway amplitude multiplier */
  sway: number;
  /** Slow head drift amplitude multiplier */
  headDrift: number;
  /** Blinks per minute */
  blinkRate: number;
  /** Fraction of gaze the head follows */
  headFollow: number;
}

export interface StateDefinition {
  label: string;
  expression: ExpressionName;
  gaze: GazeMode;
  motion: MotionProfile;
  /** Held pose offsets while the state is active (smoothed). */
  pose?: Partial<Record<Channel, number>>;
  /** Keyframe clip played on entry. */
  clip?: ClipName;
  /** One-shot states return to the resting state after this many seconds. */
  duration?: number;
  talk?: boolean;
}

const base: MotionProfile = {
  breathRate: 0.24,
  breathAmp: 1,
  sway: 1,
  headDrift: 1,
  blinkRate: 15,
  headFollow: 0.38,
};

export const STATES: Record<AnimationState, StateDefinition> = {
  idle: { label: 'Idle', expression: 'neutral', gaze: 'track', motion: base },
  listening: {
    label: 'Listening',
    expression: 'listening',
    gaze: 'viewer',
    motion: { ...base, breathRate: 0.26, breathAmp: 0.8, sway: 0.35, headDrift: 0.45, blinkRate: 10, headFollow: 0.3 },
    pose: { rootRx: 0.045, headRz: 0.06, earL: 0.2, earR: 0.2 },
  },
  thinking: {
    label: 'Thinking',
    expression: 'thinking',
    gaze: 'think',
    motion: { ...base, breathRate: 0.2, sway: 0.4, headDrift: 0.6, blinkRate: 9, headFollow: 0.55 },
    pose: { armLx: -1.05, armLz: -0.2, elbowLx: -1.2, headRz: -0.08, rootRz: -0.02 },
  },
  speaking: {
    label: 'Speaking',
    expression: 'listening',
    gaze: 'viewer',
    motion: { ...base, breathRate: 0.3, sway: 0.55, headDrift: 0.7, blinkRate: 16, headFollow: 0.3 },
    talk: true,
  },
  happy: {
    label: 'Happy',
    expression: 'happy',
    gaze: 'viewer',
    motion: { ...base, breathRate: 0.3, sway: 1.1 },
    clip: 'happy',
    duration: 2.6,
  },
  curious: {
    label: 'Curious',
    expression: 'curious',
    gaze: 'track',
    motion: { ...base, sway: 0.5, headDrift: 0.6, blinkRate: 11, headFollow: 0.55 },
    pose: { rootRx: 0.06, rootZ: 0.02, headRx: 0.04, earL: 0.3, earR: 0.15 },
  },
  surprised: {
    label: 'Surprised',
    expression: 'surprised',
    gaze: 'viewer',
    motion: { ...base, breathRate: 0.4, sway: 0.2, blinkRate: 4 },
    clip: 'surprised',
    duration: 2.1,
  },
  greeting: {
    label: 'Greeting',
    expression: 'happy',
    gaze: 'viewer',
    motion: { ...base, sway: 0.4 },
    clip: 'greeting',
    duration: 2.9,
  },
  sleep: {
    label: 'Rest',
    expression: 'sleepy',
    gaze: 'closed',
    motion: { ...base, breathRate: 0.13, breathAmp: 1.7, sway: 0.25, headDrift: 0.3, blinkRate: 0, headFollow: 0 },
    pose: { headRx: 0.16, headRz: 0.1, rootRx: 0.04, rootY: -0.012, armLz: -0.12, armRz: 0.12, earL: -0.3, earR: -0.3 },
  },
};

export const STATE_ORDER: AnimationState[] = [
  'idle', 'listening', 'thinking', 'speaking', 'happy', 'curious', 'surprised', 'greeting', 'sleep',
];

export interface StyleProfile {
  label: string;
  faceFreq: number;
  bodyFreq: number;
  gazeFreq: number;
  clipScale: number;
  idleAmp: number;
  jiggle: number;
}

export const ANIMATION_STYLES: Record<AnimationStyle, StyleProfile> = {
  gentle: { label: 'Gentle', faceFreq: 5, bodyFreq: 3.2, gazeFreq: 20, clipScale: 0.75, idleAmp: 0.8, jiggle: 0.7 },
  playful: { label: 'Playful', faceFreq: 8, bodyFreq: 4.6, gazeFreq: 26, clipScale: 1, idleAmp: 1, jiggle: 1 },
  snappy: { label: 'Snappy', faceFreq: 13, bodyFreq: 7.5, gazeFreq: 36, clipScale: 1.12, idleAmp: 1.05, jiggle: 1.25 },
};
