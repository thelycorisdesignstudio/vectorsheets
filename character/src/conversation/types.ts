import type { SpeechTimeline } from '../alien/animation/speech/visemes';
import type { Behaviour, ReactionKind } from '../alien/types';

/** One conversational turn. */
export interface Turn {
  role: 'user' | 'assistant';
  text: string;
  time: number;
}

/** What a conversation provider returns for one assistant turn. */
export interface AssistantReply {
  text: string;
  /** presentation hint, validated against the profile's approved set */
  behaviour?: Behaviour;
  reaction?: ReactionKind;
  /** the provider thinks the conversation is over (e.g. user said goodbye) */
  endConversation?: boolean;
  /** pre-generated speech audio, if the provider does TTS itself */
  audio?: { data: ArrayBuffer | Blob | string; timeline?: SpeechTimeline };
  /** which backend produced the reply (for diagnostics) */
  provider: string;
}

export interface PersonaBrief {
  name: string;
  summary: string;
  style: string;
}

/**
 * Provider-independent conversation backend. Implementations may call a
 * local script, an HTTP service, or a realtime API; the character never
 * knows which.
 */
export interface ConversationAdapter {
  readonly id: string;
  readonly label: string;
  /** true when backed by a real model (vs. scripted demo) */
  readonly live: boolean;
  respond(history: Turn[], persona: PersonaBrief, signal: AbortSignal): Promise<AssistantReply>;
}

/** Live handle for one spoken utterance. */
export interface SpeechHandle {
  readonly text: string;
  readonly timeline?: SpeechTimeline;
  /** timeline came from the speech engine (not estimated) */
  readonly exactTiming: boolean;
  /** seconds since audio started; null before start */
  clock(): number | null;
  amplitude?(): number;
  cancel(): void;
  onStart(cb: () => void): void;
  onBoundary(cb: (charIndex: number) => void): void;
  /** resolves when finished: 'ended' | 'cancelled' | 'error' */
  readonly done: Promise<'ended' | 'cancelled' | 'error'>;
}

export interface SpeakOptions {
  rate?: number;
  pitch?: number;
  voiceNames?: string[];
  audio?: AssistantReply['audio'];
}

/** Text-to-speech (or audio playback) provider. */
export interface SpeechSynthesizer {
  readonly id: string;
  readonly label: string;
  /** produces audible output */
  readonly audible: boolean;
  speak(text: string, opts?: SpeakOptions): SpeechHandle;
}

export type RecognizerEvent =
  | { type: 'speechstart' }
  | { type: 'interim'; text: string }
  | { type: 'final'; text: string }
  | { type: 'end' }
  | { type: 'error'; message: string };

/** Speech-to-text provider. */
export interface SpeechRecognizer {
  readonly id: string;
  readonly label: string;
  readonly available: boolean;
  start(): void;
  stop(): void;
  subscribe(cb: (e: RecognizerEvent) => void): () => void;
}
