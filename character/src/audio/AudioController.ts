/**
 * Audio playback and capture.
 *
 * - Playback decodes audio into a Web Audio graph with an analyser, so the
 *   mouth can follow real loudness and the clock is sample-accurate.
 * - Capture opens the microphone (echo-cancelled) and runs a simple
 *   energy-based voice activity detector with hysteresis, used to detect the
 *   user starting to talk over the character (barge-in).
 * - The browser's autoplay policy requires a user gesture before audio can
 *   start; `unlock()` should be called from one.
 */
export type AudioStatus = 'idle' | 'playing' | 'blocked' | 'error';

export interface PlaybackHandle {
  clock(): number | null;
  amplitude(): number;
  stop(): void;
  ended: Promise<'ended' | 'stopped' | 'error'>;
}

export interface VadOptions {
  /** RMS level that counts as voice (0..1) */
  threshold: number;
  /** ms of voice before "start" */
  attack: number;
  /** ms of silence before "end" */
  release: number;
}

export class AudioController {
  private ctx: AudioContext | null = null;
  private listeners = new Set<() => void>();
  status: AudioStatus = 'idle';
  capturing = false;
  /** live microphone level 0..1 */
  micLevel = 0;
  private stream: MediaStream | null = null;
  private micTimer: number | null = null;

  static get supported() {
    return typeof window !== 'undefined' && ('AudioContext' in window || 'webkitAudioContext' in window);
  }

  subscribe(cb: () => void) {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private set(status: AudioStatus) {
    if (this.status === status) return;
    this.status = status;
    for (const l of this.listeners) l();
  }

  private context() {
    if (!this.ctx) {
      const C = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new C();
    }
    return this.ctx;
  }

  /** Call from a user gesture so later playback is allowed. */
  async unlock() {
    if (!AudioController.supported) return;
    const ctx = this.context();
    if (ctx.state === 'suspended') await ctx.resume().catch(() => undefined);
  }

  async play(data: ArrayBuffer | Blob | string): Promise<PlaybackHandle> {
    const ctx = this.context();
    if (ctx.state === 'suspended') await ctx.resume().catch(() => undefined);
    if (ctx.state !== 'running') {
      this.set('blocked');
      throw new Error('Audio is blocked until the user interacts with the page.');
    }
    let bytes: ArrayBuffer;
    if (typeof data === 'string') bytes = await (await fetch(data)).arrayBuffer();
    else if (data instanceof Blob) bytes = await data.arrayBuffer();
    else bytes = data.slice(0);
    const buffer = await ctx.decodeAudioData(bytes);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    analyser.connect(ctx.destination);
    const samples = new Float32Array(analyser.fftSize);
    const startAt = ctx.currentTime + 0.03;
    let stopped = false;
    const ended = new Promise<'ended' | 'stopped' | 'error'>((resolve) => {
      src.onended = () => {
        this.set('idle');
        resolve(stopped ? 'stopped' : 'ended');
      };
    });
    src.start(startAt);
    this.set('playing');
    return {
      clock: () => (ctx.currentTime < startAt ? null : ctx.currentTime - startAt),
      amplitude: () => {
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
        return Math.min(1, Math.sqrt(sum / samples.length) * 4);
      },
      stop: () => {
        stopped = true;
        try {
          src.stop();
        } catch {
          /* already stopped */
        }
      },
      ended,
    };
  }

  /** Opens the mic and reports voice start / end. Resolves false if permission is denied. */
  async startCapture(onVoice: (speaking: boolean) => void, opts: Partial<VadOptions> = {}): Promise<boolean> {
    if (this.capturing) return true;
    const vad: VadOptions = { threshold: 0.035, attack: 160, release: 700, ...opts };
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch {
      return false;
    }
    const ctx = this.context();
    const srcNode = ctx.createMediaStreamSource(this.stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    srcNode.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    let voiced = false;
    let above = 0;
    let below = 0;
    let last = performance.now();
    this.capturing = true;
    const tick = () => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      this.micLevel = Math.min(1, rms * 6);
      if (rms > vad.threshold) {
        above += dt;
        below = 0;
      } else {
        below += dt;
        above = 0;
      }
      if (!voiced && above > vad.attack) {
        voiced = true;
        onVoice(true);
      } else if (voiced && below > vad.release) {
        voiced = false;
        onVoice(false);
      }
    };
    this.micTimer = window.setInterval(tick, 40);
    for (const l of this.listeners) l();
    return true;
  }

  stopCapture() {
    if (this.micTimer != null) clearInterval(this.micTimer);
    this.micTimer = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.capturing = false;
    this.micLevel = 0;
    for (const l of this.listeners) l();
  }

  dispose() {
    this.stopCapture();
    void this.ctx?.close();
    this.ctx = null;
  }
}
