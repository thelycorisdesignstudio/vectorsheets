import { textToTimeline } from '../../alien/animation/speech/textToVisemes';
import type { SpeakOptions, SpeechHandle, SpeechSynthesizer } from '../types';

/**
 * Browser text-to-speech (Web Speech API). Audible and credential-free.
 * It provides no phoneme timing, so the mouth uses an estimated timeline
 * that is re-anchored on every word `boundary` event the engine reports
 * (most local voices do; some network voices don't, in which case the
 * estimate runs on its own).
 */
export class WebSpeechSynthesizer implements SpeechSynthesizer {
  readonly id = 'web-speech';
  readonly label = 'Browser voice';
  readonly audible = true;

  static get available() {
    return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  }

  private pickVoice(names: string[] = []) {
    const voices = window.speechSynthesis.getVoices();
    for (const n of names) {
      const v = voices.find((x) => x.name.includes(n));
      if (v) return v;
    }
    return voices.find((v) => v.lang.startsWith('en') && v.localService) ?? voices.find((v) => v.lang.startsWith('en')) ?? null;
  }

  speak(text: string, opts: SpeakOptions = {}): SpeechHandle {
    const synth = window.speechSynthesis;
    const rate = opts.rate ?? 1;
    const timeline = textToTimeline(text, { rate });
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate;
    u.pitch = opts.pitch ?? 1;
    const voice = this.pickVoice(opts.voiceNames);
    if (voice) u.voice = voice;
    let start: number | null = null;
    let startCb: (() => void) | null = null;
    let boundaryCb: ((i: number) => void) | null = null;
    let settled = false;
    let resolveDone!: (v: 'ended' | 'cancelled' | 'error') => void;
    const done = new Promise<'ended' | 'cancelled' | 'error'>((r) => (resolveDone = r));
    const finish = (v: 'ended' | 'cancelled' | 'error') => {
      if (settled) return;
      settled = true;
      resolveDone(v);
    };
    u.onstart = () => {
      start = performance.now() / 1000;
      startCb?.();
    };
    u.onboundary = (e) => {
      if (e.name === 'word' || e.name === undefined) boundaryCb?.(e.charIndex);
    };
    u.onend = () => finish('ended');
    u.onerror = (e) => finish(e.error === 'interrupted' || e.error === 'canceled' ? 'cancelled' : 'error');
    synth.cancel();
    synth.speak(u);
    // Some engines never fire onstart (autoplay policy / no voices): don't hang.
    const watchdog = setTimeout(() => {
      if (start == null && !settled) {
        synth.cancel();
        finish('error');
      }
    }, 4000);
    done.then(() => clearTimeout(watchdog));
    return {
      text,
      timeline,
      exactTiming: false,
      clock: () => (start == null ? null : performance.now() / 1000 - start),
      cancel: () => {
        synth.cancel();
        finish('cancelled');
      },
      onStart: (cb) => (startCb = cb),
      onBoundary: (cb) => (boundaryCb = cb),
      done,
    };
  }
}
