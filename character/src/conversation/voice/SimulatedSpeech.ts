import { textToTimeline } from '../../alien/animation/speech/textToVisemes';
import type { SpeakOptions, SpeechHandle, SpeechSynthesizer } from '../types';

/**
 * Silent speech: an estimated viseme timeline played against the wall clock.
 * Used when no audible voice is available (and in tests). Captions carry the words.
 */
export class SimulatedSpeech implements SpeechSynthesizer {
  readonly id = 'simulated';
  readonly label = 'Silent (captions only)';
  readonly audible = false;
  constructor(private now: () => number = () => performance.now() / 1000) {}

  speak(text: string, opts: SpeakOptions = {}): SpeechHandle {
    const timeline = textToTimeline(text, { rate: opts.rate ?? 1 });
    let start: number | null = null;
    let cancelled = false;
    let startCb: (() => void) | null = null;
    let resolveDone!: (v: 'ended' | 'cancelled') => void;
    const done = new Promise<'ended' | 'cancelled' | 'error'>((r) => (resolveDone = r));
    // Start on the next tick so listeners can attach first.
    const startTimer = setTimeout(() => {
      if (cancelled) return;
      start = this.now();
      startCb?.();
      setTimeout(() => !cancelled && resolveDone('ended'), timeline.duration * 1000);
    }, 0);
    return {
      text,
      timeline,
      exactTiming: false,
      clock: () => (start == null ? null : this.now() - start),
      cancel: () => {
        cancelled = true;
        clearTimeout(startTimer);
        resolveDone('cancelled');
      },
      onStart: (cb) => (startCb = cb),
      onBoundary: () => {},
      done,
    };
  }
}
