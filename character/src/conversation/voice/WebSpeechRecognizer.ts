import type { RecognizerEvent, SpeechRecognizer } from '../types';

// Minimal typing for the (prefixed) Web Speech recognition API.
interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onspeechstart: (() => void) | null;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}

type RecognitionCtor = new () => RecognitionLike;

function ctor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Browser speech-to-text (Web Speech API). Note: in Chrome the audio is
 * processed by the browser vendor's speech service. Not available in every
 * browser — the UI falls back to typed input.
 */
export class WebSpeechRecognizer implements SpeechRecognizer {
  readonly id = 'web-speech-stt';
  readonly label = 'Browser speech recognition';
  private rec: RecognitionLike | null = null;
  private subs = new Set<(e: RecognizerEvent) => void>();
  private running = false;

  get available() {
    return ctor() !== null;
  }

  private emit(e: RecognizerEvent) {
    for (const s of this.subs) s(e);
  }

  subscribe(cb: (e: RecognizerEvent) => void) {
    this.subs.add(cb);
    return () => {
      this.subs.delete(cb);
    };
  }

  start() {
    const C = ctor();
    if (!C || this.running) return;
    const rec = new C();
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = true;
    rec.continuous = false;
    rec.onspeechstart = () => this.emit({ type: 'speechstart' });
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) this.emit({ type: 'final', text: r[0].transcript.trim() });
        else interim += r[0].transcript;
      }
      if (interim) this.emit({ type: 'interim', text: interim.trim() });
    };
    rec.onerror = (e) => this.emit({ type: 'error', message: e.error });
    rec.onend = () => {
      this.running = false;
      this.emit({ type: 'end' });
    };
    this.rec = rec;
    this.running = true;
    rec.start();
  }

  stop() {
    this.rec?.stop();
  }
}
