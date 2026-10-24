import type { GazeProfile } from '../alien/animation/gaze';
import type {
  Accessory, AnimationStyle, Behaviour, BrowShape, CharacterKind, CrownFeature, EarStyle, ExpressionName, EyeShape, HairStyle, HeadShape, HumanFigure, Outfit, PaletteName,
} from '../alien/types';

/**
 * A character's identity, appearance and presentation in one place. The
 * renderer only reads `appearance`; the embodiment layer reads `behaviour`;
 * the conversation layer reads `persona`. Personality never touches geometry.
 */
export interface CharacterProfile {
  id: string;
  name: string;
  tagline: string;
  persona: {
    /** Short description used to brief a conversational model. */
    summary: string;
    /** Extra guidance for replies (tone, length). */
    style: string;
    voice: { rate: number; pitch: number; preferredVoices: string[] };
  };
  appearance: {
    kind?: CharacterKind;
    figure?: HumanFigure;
    hair?: HairStyle;
    outfit?: Outfit;
    palette: PaletteName;
    head: HeadShape;
    crown: CrownFeature;
    ears: EarStyle;
    eyeShape: EyeShape;
    browShape: BrowShape;
    accessories: Accessory[];
  };
  behaviour: {
    defaultExpression: ExpressionName;
    defaultBehaviour: Behaviour;
    animationStyle: AnimationStyle;
    /** 0..1.5 */
    movementIntensity: number;
    /** blink frequency multiplier */
    blinkRate: number;
    gaze: GazeProfile;
    /** 0..1.5 nods and beats while speaking */
    speakingGestureIntensity: number;
    greeting: { onLoad: boolean; style: 'wave' | 'nod' };
    approvedExpressions: ExpressionName[];
    approvedBehaviours: Behaviour[];
    /** seconds of inactivity before resting (0 = never) */
    restAfter: number;
  };
}

export const ORU_PROFILE: CharacterProfile = {
  id: 'oru',
  name: 'Oru',
  tagline: 'A small, curious companion from somewhere else.',
  persona: {
    summary:
      'Oru is a small, curious, friendly companion character from somewhere else. Oru is warm, playful and observant, ' +
      'speaks in short, clear sentences, asks one good question at a time, and is honest that it is an AI character ' +
      'without human feelings or a body outside the screen.',
    style: 'Reply in one to three short spoken sentences. No lists, no markdown, no emoji.',
    voice: { rate: 1.04, pitch: 1.25, preferredVoices: ['Samantha', 'Google UK English Female', 'Microsoft Aria', 'Karen', 'Moira'] },
  },
  appearance: {
    palette: 'grape',
    head: 'puck',
    crown: 'fronds',
    ears: 'none',
    eyeShape: 'round',
    browShape: 'pill',
    accessories: [],
  },
  behaviour: {
    defaultExpression: 'neutral',
    defaultBehaviour: 'attentive',
    animationStyle: 'gentle',
    movementIntensity: 1,
    blinkRate: 1,
    gaze: { eyeContact: 0.78, pointerInterest: 0.5, glanceRate: 5 },
    speakingGestureIntensity: 1,
    greeting: { onLoad: true, style: 'wave' },
    approvedExpressions: ['neutral', 'happy', 'content', 'curious', 'surprised', 'sleepy', 'thinking', 'listening', 'concerned', 'sad', 'shy', 'adoring', 'determined', 'confused', 'playful'],
    approvedBehaviours: ['neutral', 'attentive', 'curious', 'excited', 'calm', 'playful', 'thoughtful', 'reassuring'],
    restAfter: 60,
  },
};

const HUMAN_EXPRESSIONS: ExpressionName[] = ORU_PROFILE.behaviour.approvedExpressions;

/** Mira: warm, quick to smile, a little playful. */
export const MIRA_PROFILE: CharacterProfile = {
  id: 'mira',
  name: 'Mira',
  tagline: 'Warm, curious and always up for a chat.',
  persona: {
    summary:
      'Mira is a warm, upbeat companion character. She is curious about people, quick to smile, gently playful, ' +
      'and honest that she is an AI character rather than a real person.',
    style: 'Reply in one to three short spoken sentences. Friendly and natural. No lists, no markdown, no emoji.',
    voice: { rate: 1.03, pitch: 1.1, preferredVoices: ['Samantha', 'Google UK English Female', 'Microsoft Aria', 'Karen'] },
  },
  appearance: {
    kind: 'human', figure: 'lady', hair: 'ponytail', outfit: 'workout', palette: 'mira', head: 'puck', crown: 'fronds', ears: 'none',
    eyeShape: 'almond', browShape: 'arched', accessories: [],
  },
  behaviour: {
    ...ORU_PROFILE.behaviour,
    defaultBehaviour: 'attentive',
    approvedExpressions: HUMAN_EXPRESSIONS,
    gaze: { eyeContact: 0.8, pointerInterest: 0.45, glanceRate: 5 },
  },
};

/** Theo: calm, thoughtful, dry sense of humour. */
export const THEO_PROFILE: CharacterProfile = {
  id: 'theo',
  name: 'Theo',
  tagline: 'Easygoing, thoughtful and a good listener.',
  persona: {
    summary:
      'Theo is a calm, thoughtful companion character with a dry, kind sense of humour. He listens closely, asks good ' +
      'questions, and is honest that he is an AI character rather than a real person.',
    style: 'Reply in one to three short spoken sentences. Relaxed and clear. No lists, no markdown, no emoji.',
    voice: { rate: 1, pitch: 0.92, preferredVoices: ['Daniel', 'Google UK English Male', 'Microsoft Guy', 'Alex'] },
  },
  appearance: {
    kind: 'human', figure: 'man', hair: 'crop', outfit: 'workout', palette: 'theo', head: 'puck', crown: 'fronds', ears: 'none',
    eyeShape: 'oval', browShape: 'pill', accessories: [],
  },
  behaviour: {
    ...ORU_PROFILE.behaviour,
    defaultBehaviour: 'calm',
    approvedExpressions: HUMAN_EXPRESSIONS,
    gaze: { eyeContact: 0.75, pointerInterest: 0.4, glanceRate: 4 },
  },
};

/** Lumi: a newer, softer member of Oru's species — dreamy, gentle and curious. */
export const LUMI_PROFILE: CharacterProfile = {
  id: 'lumi',
  name: 'Lumi',
  tagline: 'Dreamy, gentle and full of small wonders.',
  persona: {
    summary:
      'Lumi is a gentle, dreamy little alien companion who notices small, lovely things and asks soft questions. ' +
      'Lumi is warm and a bit whimsical, and honest about being an AI character.',
    style: 'Reply in one to three short spoken sentences. Soft and kind. No lists, no markdown, no emoji.',
    voice: { rate: 0.98, pitch: 1.35, preferredVoices: ['Samantha', 'Google UK English Female', 'Microsoft Aria', 'Moira'] },
  },
  appearance: {
    palette: 'lagoon',
    head: 'pebble',
    crown: 'tendrils',
    ears: 'none',
    eyeShape: 'round',
    browShape: 'dots',
    accessories: [],
  },
  behaviour: {
    ...ORU_PROFILE.behaviour,
    defaultBehaviour: 'calm',
    animationStyle: 'gentle',
    gaze: { eyeContact: 0.72, pointerInterest: 0.6, glanceRate: 6 },
  },
};

/** Noor: bright, funny and grounded — the friend who makes you laugh and then gives good advice. */
export const NOOR_PROFILE: CharacterProfile = {
  id: 'noor',
  name: 'Noor',
  tagline: 'Bright, funny and refreshingly down to earth.',
  persona: {
    summary:
      'Noor is a bright, funny and grounded companion character. She laughs easily, gives honest, kind advice, ' +
      'and is open that she is an AI character rather than a real person.',
    style: 'Reply in one to three short spoken sentences. Warm, lively and clear. No lists, no markdown, no emoji.',
    voice: { rate: 1.05, pitch: 1.05, preferredVoices: ['Google UK English Female', 'Samantha', 'Microsoft Jenny', 'Karen'] },
  },
  appearance: {
    kind: 'human', figure: 'noor', hair: 'puff', outfit: 'workout', palette: 'noor', head: 'puck', crown: 'fronds', ears: 'none',
    eyeShape: 'oval', browShape: 'arched', accessories: [],
  },
  behaviour: {
    ...ORU_PROFILE.behaviour,
    defaultBehaviour: 'playful',
    approvedExpressions: HUMAN_EXPRESSIONS,
    gaze: { eyeContact: 0.82, pointerInterest: 0.5, glanceRate: 5 },
  },
};

export const PROFILES = { oru: ORU_PROFILE, lumi: LUMI_PROFILE, mira: MIRA_PROFILE, theo: THEO_PROFILE, noor: NOOR_PROFILE } as const;
export type CharacterId = keyof typeof PROFILES;
