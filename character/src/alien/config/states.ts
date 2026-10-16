import type { Channel } from '../animation/keyframes';
import type { ClipName } from '../animation/clips';
import type { AnimationState, AnimationStyle, ExpressionName } from '../types';

/** How the eyes behave while a state is active. */
export type GazePolicy =
  /** relaxed: mostly eye contact, occasional glances, pointer interest */
  | 'ambient'
  /** steady eye contact, rare short breaks */
  | 'attentive'
  /** look up and away, checking back now and then */
  | 'avert'
  /** eye contact with aversion at phrase starts (driven by speech) */
  | 'social'
  | 'closed';

export interface MotionProfile {
  /** breaths per second */
  breathRate: number;
  breathAmp: number;
  /** idle body layer weight (sway, weight shifts, head drift) */
  idle: number;
  /** blinks per minute */
  blinkRate: number;
  /** fraction of gaze the head follows */
  headFollow: number;
}

export interface StateDefinition {
  label: string;
  /** What this state communicates — shown in diagnostics and docs. */
  intent: string;
  expression: ExpressionName;
  gaze: GazePolicy;
  motion: MotionProfile;
  /** Held pose offsets (smoothed). */
  pose?: Partial<Record<Channel, number>>;
  /** Seconds before the held pose engages (e.g. hand-to-chin only if thinking lasts). */
  poseDelay?: number;
  enter?: { clip?: ClipName; /** spring speed multiplier for the transition in */ speed?: number };
  exit?: { clip?: ClipName };
  /** Requests are deferred until this long in the state (unless forced). */
  minDuration?: number;
  /** Timed states move on by themselves. `resume` = return to the last persistent state. */
  duration?: number;
  next?: AnimationState | 'resume';
  /** Speech layer may drive the mouth. */
  speech?: boolean;
  /** Transient states never become the resume target. */
  transient?: boolean;
}

const base: MotionProfile = { breathRate: 0.24, breathAmp: 1, idle: 1, blinkRate: 15, headFollow: 0.38 };

export const STATES: Record<AnimationState, StateDefinition> = {
  idle: {
    label: 'Idle',
    intent: 'Present but relaxed: breathing, weight shifts, small glances.',
    expression: 'neutral',
    gaze: 'ambient',
    motion: base,
  },
  listening: {
    label: 'Listening',
    intent: 'The user has the floor: steady eye contact, leaning in, occasional nods.',
    expression: 'listening',
    gaze: 'attentive',
    motion: { ...base, breathRate: 0.26, breathAmp: 0.8, idle: 0.4, blinkRate: 11, headFollow: 0.3 },
    pose: { rootRx: 0.045, headRz: 0.06, earL: 0.2, earR: 0.2 },
    enter: { clip: 'perk', speed: 1.4 },
  },
  thinking: {
    label: 'Thinking',
    intent: 'Working on a reply: gaze drifts up and away, a restrained thinking face.',
    expression: 'thinking',
    gaze: 'avert',
    motion: { ...base, breathRate: 0.2, idle: 0.5, blinkRate: 8, headFollow: 0.55 },
    pose: { armLx: -1.05, armLz: -0.2, elbowLx: -1.2, headRz: -0.08, rootRz: -0.02 },
    poseDelay: 1.4,
    enter: { clip: 'ponder' },
    exit: { clip: 'aha' },
    minDuration: 0.35,
  },
  preparing: {
    label: 'Preparing',
    intent: 'About to speak: eyes return to the user, an inhale, lips part.',
    expression: 'listening',
    gaze: 'attentive',
    motion: { ...base, idle: 0.5, blinkRate: 6, headFollow: 0.3 },
    enter: { clip: 'inhale', speed: 1.6 },
    duration: 3,
    next: 'waiting',
    transient: true,
  },
  speaking: {
    label: 'Speaking',
    intent: 'Holding the floor: lips follow speech, beats nod the head, eye contact with natural breaks.',
    expression: 'listening',
    gaze: 'social',
    motion: { ...base, breathRate: 0.3, idle: 0.6, blinkRate: 16, headFollow: 0.3 },
    speech: true,
  },
  reacting: {
    label: 'Reacting',
    intent: 'A brief response to an event (touch, surprise, interruption).',
    expression: 'happy',
    gaze: 'attentive',
    motion: { ...base, idle: 0.6, blinkRate: 6 },
    duration: 1.4,
    next: 'resume',
    transient: true,
  },
  greeting: {
    label: 'Greeting',
    intent: 'Welcoming the user with a hop, a wave and a light pulse.',
    expression: 'happy',
    gaze: 'attentive',
    motion: { ...base, idle: 0.4 },
    enter: { clip: 'greeting', speed: 1.3 },
    duration: 2.8,
    minDuration: 0.9,
    next: 'resume',
    transient: true,
  },
  waiting: {
    label: 'Waiting',
    intent: 'Finished speaking, ready for the user: open, attentive, unhurried.',
    expression: 'listening',
    gaze: 'attentive',
    motion: { ...base, breathRate: 0.22, idle: 0.6, blinkRate: 13, headFollow: 0.35 },
    pose: { headRz: 0.04, earL: 0.15, earR: 0.15 },
    duration: 14,
    next: 'idle',
  },
  farewell: {
    label: 'Farewell',
    intent: 'Closing a conversation warmly before returning to idle.',
    expression: 'happy',
    gaze: 'attentive',
    motion: { ...base, idle: 0.5 },
    enter: { clip: 'farewell' },
    duration: 2.3,
    minDuration: 0.8,
    next: 'idle',
    transient: true,
  },
  sleep: {
    label: 'Rest',
    intent: 'Nobody around: slow breathing, eyes closed, crown and ears relaxed.',
    expression: 'sleepy',
    gaze: 'closed',
    motion: { ...base, breathRate: 0.13, breathAmp: 1.7, idle: 0.25, blinkRate: 0, headFollow: 0 },
    pose: { headRx: 0.16, headRz: 0.1, rootRx: 0.04, rootY: -0.012, armLz: -0.12, armRz: 0.12, earL: -0.3, earR: -0.3 },
    exit: { clip: 'wake' },
  },
};

export const STATE_ORDER: AnimationState[] = [
  'idle', 'listening', 'thinking', 'preparing', 'speaking', 'reacting', 'greeting', 'waiting', 'farewell', 'sleep',
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
