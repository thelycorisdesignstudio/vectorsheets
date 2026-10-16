import type { Behaviour, ReactionKind, TouchZone } from '../alien/types';

/**
 * Semantic events: the only way the conversational / interaction layers talk
 * to the character. They describe *what happened*, never how to animate it.
 */
export type EmbodimentEvent =
  | { type: 'USER_STARTED_SPEAKING' }
  | { type: 'USER_FINISHED_SPEAKING'; transcript?: string }
  | { type: 'USER_TYPING' }
  | { type: 'AI_STARTED_THINKING' }
  | { type: 'AI_RESPONSE_READY'; behaviour?: Behaviour; reaction?: ReactionKind }
  | { type: 'AI_STARTED_SPEAKING'; behaviour?: Behaviour }
  | { type: 'AI_FINISHED_SPEAKING' }
  | { type: 'USER_INTERRUPTED' }
  | { type: 'CHARACTER_GREETING' }
  | { type: 'CONVERSATION_ENDED' }
  | { type: 'USER_TOUCHED'; zone: TouchZone; side: 1 | -1 }
  | { type: 'USER_ACTIVITY' }
  | { type: 'SET_BEHAVIOUR'; behaviour: Behaviour }
  | { type: 'REACT'; reaction: ReactionKind };

export type EmbodimentEventType = EmbodimentEvent['type'];
