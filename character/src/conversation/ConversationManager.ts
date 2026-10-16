import type { AnimationController } from '../alien/animation/AnimationController';
import type { AudioController } from '../audio/AudioController';
import type { EmbodimentController } from '../embodiment/EmbodimentController';
import type { CharacterProfile } from '../embodiment/profile';
import { SimulatedSpeech } from './voice/SimulatedSpeech';
import type {
  AssistantReply, ConversationAdapter, RecognizerEvent, SpeechHandle, SpeechRecognizer, SpeechSynthesizer, Turn,
} from './types';

export type ConversationPhase = 'idle' | 'listening' | 'thinking' | 'speaking' | 'ended';

export interface ConversationSnapshot {
  phase: ConversationPhase;
  adapter: { id: string; label: string; live: boolean };
  voice: { id: string; label: string; audible: boolean };
  voiceInput: { available: boolean; active: boolean; bargeIn: boolean };
  userCaption: string;
  assistantCaption: string;
  history: Turn[];
  lastProvider: string | null;
  notice: string | null;
}

export interface ConversationDeps {
  adapter: ConversationAdapter;
  synth: SpeechSynthesizer;
  recognizer?: SpeechRecognizer;
  audio?: AudioController;
  embodiment: EmbodimentController;
  anim: AnimationController;
  profile: CharacterProfile;
}

/**
 * Owns the conversation: turn-taking, provider calls, speech playback and
 * interruption. It reports progress to the character exclusively through
 * semantic events, and to the UI through snapshots (only on meaningful
 * changes — never per frame).
 */
export class ConversationManager {
  private deps: ConversationDeps;
  private phase: ConversationPhase = 'idle';
  private history: Turn[] = [];
  private userCaption = '';
  private assistantCaption = '';
  private notice: string | null = null;
  private lastProvider: string | null = null;
  private request: AbortController | null = null;
  private handle: SpeechHandle | null = null;
  private turnId = 0;
  private voiceActive = false;
  private bargeIn = true;
  private listeners = new Set<() => void>();
  private unsubRecognizer: (() => void) | null = null;
  private fallbackVoice = new SimulatedSpeech();
  private snapshotCache: ConversationSnapshot | null = null;

  constructor(deps: ConversationDeps) {
    this.deps = deps;
    this.attachRecognizer();
  }

  // --- configuration ----------------------------------------------------

  setAdapter(adapter: ConversationAdapter) {
    this.deps.adapter = adapter;
    this.changed();
  }

  setSynth(synth: SpeechSynthesizer) {
    this.deps.synth = synth;
    this.changed();
  }

  setBargeIn(on: boolean) {
    this.bargeIn = on;
    this.changed();
  }

  private attachRecognizer() {
    this.unsubRecognizer?.();
    this.unsubRecognizer = this.deps.recognizer?.subscribe((e) => this.onRecognizer(e)) ?? null;
  }

  // --- subscription -----------------------------------------------------

  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };

  private changed() {
    this.snapshotCache = null;
    for (const l of this.listeners) l();
  }

  getSnapshot = (): ConversationSnapshot => {
    if (this.snapshotCache) return this.snapshotCache;
    const { adapter, synth, recognizer } = this.deps;
    this.snapshotCache = {
      phase: this.phase,
      adapter: { id: adapter.id, label: adapter.label, live: adapter.live },
      voice: { id: synth.id, label: synth.label, audible: synth.audible },
      voiceInput: { available: !!recognizer?.available, active: this.voiceActive, bargeIn: this.bargeIn },
      userCaption: this.userCaption,
      assistantCaption: this.assistantCaption,
      history: this.history,
      lastProvider: this.lastProvider,
      notice: this.notice,
    };
    return this.snapshotCache;
  };

  private setPhase(p: ConversationPhase) {
    if (this.phase === p) return;
    this.phase = p;
    this.changed();
  }

  // --- user input -------------------------------------------------------

  /** The user is composing a typed message. */
  typing() {
    if (this.phase === 'idle' || this.phase === 'ended') this.deps.embodiment.dispatch({ type: 'USER_TYPING' });
  }

  /** Send a user message (typed, or a final transcript). */
  async send(text: string) {
    const clean = text.trim();
    if (!clean) return;
    if (this.phase === 'speaking' || this.phase === 'thinking') this.interrupt('new message');
    const { embodiment } = this.deps;
    if (this.phase !== 'listening') embodiment.dispatch({ type: 'USER_STARTED_SPEAKING' });
    embodiment.dispatch({ type: 'USER_FINISHED_SPEAKING', transcript: clean });
    this.history = [...this.history, { role: 'user', text: clean, time: Date.now() }];
    this.userCaption = clean;
    this.assistantCaption = '';
    this.notice = null;
    await this.reply();
  }

  private async reply() {
    const id = ++this.turnId;
    const { adapter, embodiment, profile } = this.deps;
    this.setPhase('thinking');
    embodiment.dispatch({ type: 'AI_STARTED_THINKING' });
    const ctrl = new AbortController();
    this.request = ctrl;
    let reply: AssistantReply;
    try {
      reply = await adapter.respond(this.history, { name: profile.name, summary: profile.persona.summary, style: profile.persona.style }, ctrl.signal);
    } catch (e) {
      if (ctrl.signal.aborted || id !== this.turnId) return;
      this.notice = `The conversation service failed (${e instanceof Error ? e.message : 'error'}).`;
      reply = { text: "Hmm, I couldn't reach my thinking service just now. Could you try again?", behaviour: 'reassuring', provider: 'fallback' };
    }
    if (id !== this.turnId) return;
    this.request = null;
    this.lastProvider = reply.provider;
    this.history = [...this.history, { role: 'assistant', text: reply.text, time: Date.now() }];
    embodiment.dispatch({ type: 'AI_RESPONSE_READY', behaviour: reply.behaviour, reaction: reply.reaction });
    // Give the "preparing" inhale a beat before the first word.
    await new Promise((r) => setTimeout(r, 380));
    if (id !== this.turnId) return;
    await this.speak(reply, id);
  }

  /** Speak a line without a user turn (greetings, prompts). */
  async say(text: string, behaviour?: AssistantReply['behaviour']) {
    const id = ++this.turnId;
    this.handle?.cancel();
    this.history = [...this.history, { role: 'assistant', text, time: Date.now() }];
    this.deps.embodiment.dispatch({ type: 'AI_RESPONSE_READY', behaviour });
    await new Promise((r) => setTimeout(r, 300));
    if (id !== this.turnId) return;
    await this.speak({ text, behaviour, provider: 'local' }, id);
  }

  private async speak(reply: AssistantReply, id: number, synth = this.deps.synth): Promise<void> {
    const { embodiment, anim, profile } = this.deps;
    this.assistantCaption = reply.text;
    this.setPhase('speaking');
    const voice = profile.persona.voice;
    const handle = synth.speak(reply.text, { rate: voice.rate, pitch: voice.pitch, voiceNames: voice.preferredVoices, audio: reply.audio });
    this.handle = handle;
    let started = false;
    let startedAt = 0;
    handle.onStart(() => {
      if (id !== this.turnId) return;
      started = true;
      startedAt = performance.now();
      embodiment.dispatch({ type: 'AI_STARTED_SPEAKING', behaviour: reply.behaviour });
      anim.speech.begin({ timeline: handle.timeline, exactTiming: handle.exactTiming, clock: () => handle.clock(), amplitude: handle.amplitude ? () => handle.amplitude!() : undefined });
      if (this.voiceActive && this.bargeIn) void this.armBargeIn(id);
      this.changed();
    });
    handle.onBoundary((i) => id === this.turnId && anim.speech.boundary(i));
    const result = await handle.done;
    if (id !== this.turnId) return;
    const expected = handle.timeline?.duration ?? 0;
    const elapsed = (performance.now() - startedAt) / 1000;
    // Some engines "finish" instantly without producing audio; treat that as unavailable too.
    const silentFinish = result === 'ended' && started && expected > 1 && elapsed < expected * 0.25;
    if (((result === 'error' && !started) || silentFinish) && synth !== this.fallbackVoice) {
      // Voice unavailable (no voices, autoplay policy…): keep the character speaking with captions.
      this.notice = 'Voice output was unavailable, so the reply is shown as captions.';
      anim.speech.end();
      return this.speak(reply, id, this.fallbackVoice);
    }
    this.handle = null;
    this.deps.audio?.stopCapture();
    if (result === 'cancelled') return;
    embodiment.dispatch({ type: 'AI_FINISHED_SPEAKING' });
    this.setPhase('idle');
    if (reply.endConversation) this.end();
    else if (this.voiceActive) this.listen();
  }

  /** While speaking in voice mode: listen for the user talking over the character. */
  private async armBargeIn(id: number) {
    const audio = this.deps.audio;
    if (!audio) return;
    const ok = await audio.startCapture((speaking) => {
      if (speaking && id === this.turnId && this.phase === 'speaking') {
        this.interrupt('user spoke');
        this.listen();
      }
    }, { threshold: 0.06, attack: 220 });
    if (!ok) this.notice = 'Microphone permission was denied, so voice interruption is off.';
  }

  /** Stop whatever the character is doing because the user took the floor. */
  interrupt(reason = 'interrupted') {
    if (this.phase !== 'speaking' && this.phase !== 'thinking') return;
    this.turnId++;
    this.request?.abort();
    this.request = null;
    this.handle?.cancel();
    this.handle = null;
    this.deps.audio?.stopCapture();
    this.deps.embodiment.dispatch({ type: 'USER_INTERRUPTED' });
    this.notice = reason === 'new message' ? null : `Interrupted (${reason}).`;
    this.setPhase('listening');
  }

  // --- voice input --------------------------------------------------------

  setVoiceInput(on: boolean) {
    if (on && !this.deps.recognizer?.available) {
      this.notice = 'Speech recognition is not available in this browser — type instead.';
      this.changed();
      return;
    }
    this.voiceActive = on;
    if (on) this.listen();
    else this.deps.recognizer?.stop();
    this.changed();
  }

  private listen() {
    if (!this.voiceActive) return;
    this.deps.recognizer?.start();
  }

  private onRecognizer(e: RecognizerEvent) {
    const { embodiment } = this.deps;
    switch (e.type) {
      case 'speechstart':
        if (this.phase === 'speaking' || this.phase === 'thinking') this.interrupt('user spoke');
        embodiment.dispatch({ type: 'USER_STARTED_SPEAKING' });
        this.userCaption = '';
        this.setPhase('listening');
        break;
      case 'interim':
        this.userCaption = e.text;
        this.changed();
        break;
      case 'final':
        void this.send(e.text);
        break;
      case 'error':
        if (e.message !== 'no-speech' && e.message !== 'aborted') this.notice = `Speech recognition: ${e.message}`;
        if (e.message === 'not-allowed') this.voiceActive = false;
        this.changed();
        break;
      case 'end':
        if (this.phase === 'listening') this.setPhase('idle');
        // Hands-free: keep listening between turns.
        if (this.voiceActive && this.phase === 'idle') setTimeout(() => this.phase === 'idle' && this.listen(), 250);
        break;
    }
  }

  // --- lifecycle ------------------------------------------------------------

  greet(line?: string) {
    this.deps.embodiment.dispatch({ type: 'CHARACTER_GREETING' });
    if (line) setTimeout(() => void this.say(line, 'excited'), 1500);
  }

  end() {
    this.turnId++;
    this.request?.abort();
    this.handle?.cancel();
    this.voiceActive = false;
    this.deps.recognizer?.stop();
    this.deps.audio?.stopCapture();
    this.deps.embodiment.dispatch({ type: 'CONVERSATION_ENDED' });
    this.setPhase('ended');
  }

  reset() {
    this.end();
    this.history = [];
    this.userCaption = '';
    this.assistantCaption = '';
    this.notice = null;
    this.setPhase('idle');
  }

  dispose() {
    this.turnId++;
    this.request?.abort();
    this.handle?.cancel();
    this.unsubRecognizer?.();
    this.deps.recognizer?.stop();
    this.listeners.clear();
  }
}
