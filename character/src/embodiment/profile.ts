import type { GazeProfile } from '../alien/animation/gaze';
import type {
  Accessory, AnimationStyle, Behaviour, BrowShape, CrownFeature, EarStyle, ExpressionName, EyeShape, HeadShape, PaletteName,
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
    eyeShape: 'oval',
    browShape: 'pill',
    accessories: ['collar'],
  },
  behaviour: {
    defaultExpression: 'neutral',
    defaultBehaviour: 'attentive',
    animationStyle: 'playful',
    movementIntensity: 1,
    blinkRate: 1,
    gaze: { eyeContact: 0.72, pointerInterest: 0.6, glanceRate: 8 },
    speakingGestureIntensity: 1,
    greeting: { onLoad: true, style: 'wave' },
    approvedExpressions: ['neutral', 'happy', 'content', 'curious', 'surprised', 'sleepy', 'thinking', 'listening', 'concerned', 'sad', 'shy', 'adoring', 'determined', 'confused', 'playful'],
    approvedBehaviours: ['neutral', 'attentive', 'curious', 'excited', 'calm', 'playful', 'thoughtful', 'reassuring'],
    restAfter: 60,
  },
};
