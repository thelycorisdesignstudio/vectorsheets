import type { AudioController, PlaybackHandle } from '../../audio/AudioController';
import type { SpeakOptions, SpeechHandle, SpeechSynthesizer } from '../types';

/**
 * Speaks provider-generated audio (e.g. a server TTS response). Lip-sync
 * uses the provider's viseme timeline when one is supplied (exact timing),
 * otherwise the live audio amplitude. Falls back to `fallback` when a reply
 * carries no audio.
 */
export class AudioClipSpeech implements SpeechSynthesizer {
  readonly id: string;
  readonly label: string;
  readonly audible: boolean;
  constructor(private audio: AudioController, private fallback: SpeechSynthesizer) {
    // Reports as its fallback voice, since provider audio only applies to replies that carry it.
    this.id = fallback.id;
    this.label = fallback.label;
    this.audible = fallback.audible;
  }

  speak(text: string, opts: SpeakOptions = {}): SpeechHandle {
    if (!opts.audio) return this.fallback.speak(text, opts);
    const audioData = opts.audio;
    let playback: PlaybackHandle | null = null;
    let cancelled = false;
    let startCb: (() => void) | null = null;
    let resolveDone!: (v: 'ended' | 'cancelled' | 'error') => void;
    const done = new Promise<'ended' | 'cancelled' | 'error'>((r) => (resolveDone = r));
    this.audio
      .play(audioData.data)
      .then((p) => {
        playback = p;
        if (cancelled) return p.stop();
        startCb?.();
        p.ended.then((r) => resolveDone(r === 'stopped' ? 'cancelled' : r));
      })
      .catch(() => resolveDone('error'));
    return {
      text,
      timeline: audioData.timeline,
      exactTiming: !!audioData.timeline,
      clock: () => playback?.clock() ?? null,
      amplitude: audioData.timeline ? undefined : () => playback?.amplitude() ?? 0,
      cancel: () => {
        cancelled = true;
        playback?.stop();
        resolveDone('cancelled');
      },
      onStart: (cb) => (startCb = cb),
      onBoundary: () => {},
      done,
    };
  }
}
