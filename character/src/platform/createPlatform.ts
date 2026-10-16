import { AnimationController } from '../alien/animation/AnimationController';
import { AudioController } from '../audio/AudioController';
import { ConversationManager } from '../conversation/ConversationManager';
import { HttpChatAdapter } from '../conversation/adapters/HttpChatAdapter';
import { ScriptedAdapter } from '../conversation/adapters/ScriptedAdapter';
import { AudioClipSpeech } from '../conversation/voice/AudioClipSpeech';
import { SimulatedSpeech } from '../conversation/voice/SimulatedSpeech';
import { WebSpeechRecognizer } from '../conversation/voice/WebSpeechRecognizer';
import { WebSpeechSynthesizer } from '../conversation/voice/WebSpeechSynthesizer';
import type { SpeechSynthesizer } from '../conversation/types';
import { EmbodimentController } from '../embodiment/EmbodimentController';
import type { CharacterProfile } from '../embodiment/profile';

/**
 * Wires the character platform together once: animation, embodiment,
 * audio and conversation. Everything here is plain TypeScript (no React),
 * so the same graph can run in tests or another UI.
 */
export interface Platform {
  anim: AnimationController;
  embodiment: EmbodimentController;
  audio: AudioController;
  conversation: ConversationManager;
  voices: { simulated: SpeechSynthesizer; browser: SpeechSynthesizer | null };
  /** Probe the server; switch to the live model if one is configured. */
  connect(): Promise<{ live: boolean; provider: string }>;
  setVoiceOutput(on: boolean): void;
  dispose(): void;
}

export function createPlatform(profile: CharacterProfile): Platform {
  const anim = new AnimationController();
  const embodiment = new EmbodimentController(anim, profile);
  const audio = new AudioController();
  const simulated = new SimulatedSpeech();
  const browser = WebSpeechSynthesizer.available ? new WebSpeechSynthesizer() : null;
  const recognizer = new WebSpeechRecognizer();
  const voiceFor = (on: boolean) => new AudioClipSpeech(audio, on && browser ? browser : simulated);
  const conversation = new ConversationManager({
    adapter: new ScriptedAdapter(),
    synth: voiceFor(!!browser),
    recognizer,
    audio,
    embodiment,
    anim,
    profile,
  });
  return {
    anim,
    embodiment,
    audio,
    conversation,
    voices: { simulated, browser },
    async connect() {
      const status = await HttpChatAdapter.status();
      if (status?.configured) {
        const http = new HttpChatAdapter();
        http.label = `Live model (${status.provider})`;
        conversation.setAdapter(http);
        return { live: true, provider: status.provider };
      }
      return { live: false, provider: 'scripted' };
    },
    setVoiceOutput(on) {
      conversation.setSynth(voiceFor(on));
    },
    dispose() {
      conversation.dispose();
      audio.dispose();
    },
  };
}
