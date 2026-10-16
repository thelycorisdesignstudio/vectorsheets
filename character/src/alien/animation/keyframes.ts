/**
 * Minimal keyframe system for hand-authored body motion. Clips are additive
 * offsets layered on top of the procedural animation, sampled with
 * Catmull-Rom interpolation so authored keys stay smooth.
 */

export type Channel =
  | 'rootX'
  | 'rootY'
  | 'rootZ'
  | 'rootRx'
  | 'rootRy'
  | 'rootRz'
  | 'headRx'
  | 'headRy'
  | 'headRz'
  | 'squash'
  | 'armLx'
  | 'armLz'
  | 'armRx'
  | 'armRz'
  | 'elbowL'
  | 'elbowR'
  | 'elbowLx'
  | 'elbowRx'
  | 'earL'
  | 'earR'
  | 'glow'
  | 'smile'
  | 'mouthOpen'
  | 'lidUpper'
  | 'browRaise';

export const CHANNELS: Channel[] = [
  'rootX', 'rootY', 'rootZ', 'rootRx', 'rootRy', 'rootRz',
  'headRx', 'headRy', 'headRz', 'squash',
  'armLx', 'armLz', 'armRx', 'armRz', 'elbowL', 'elbowR', 'elbowLx', 'elbowRx', 'earL', 'earR',
  'glow', 'smile', 'mouthOpen', 'lidUpper', 'browRaise',
];

export type ChannelRecord = Record<Channel, number>;
export const emptyChannels = (): ChannelRecord =>
  Object.fromEntries(CHANNELS.map((c) => [c, 0])) as ChannelRecord;

/** [time in seconds, value] */
export type Key = readonly [number, number];

export interface Clip {
  duration: number;
  tracks: Partial<Record<Channel, readonly Key[]>>;
  /** Fade in / out time used when the clip starts or is interrupted. */
  blend?: number;
}

export function sampleTrack(keys: readonly Key[], t: number): number {
  const n = keys.length;
  if (n === 0) return 0;
  if (t <= keys[0][0]) return keys[0][1];
  if (t >= keys[n - 1][0]) return keys[n - 1][1];
  let i = 0;
  while (i < n - 2 && t > keys[i + 1][0]) i++;
  const k0 = keys[Math.max(0, i - 1)];
  const k1 = keys[i];
  const k2 = keys[i + 1];
  const k3 = keys[Math.min(n - 1, i + 2)];
  const span = k2[0] - k1[0];
  const u = span > 0 ? (t - k1[0]) / span : 0;
  // Non-uniform Catmull-Rom tangents, scaled to the current segment.
  const m1 = ((k2[1] - k0[1]) / Math.max(1e-4, k2[0] - k0[0])) * span;
  const m2 = ((k3[1] - k1[1]) / Math.max(1e-4, k3[0] - k1[0])) * span;
  const u2 = u * u;
  const u3 = u2 * u;
  return (
    (2 * u3 - 3 * u2 + 1) * k1[1] +
    (u3 - 2 * u2 + u) * m1 +
    (-2 * u3 + 3 * u2) * k2[1] +
    (u3 - u2) * m2
  );
}

/** Plays one clip at a time with a cross-fade envelope. */
export class ClipPlayer {
  private clip: Clip | null = null;
  private time = 0;
  private fading: { clip: Clip; time: number; weight: number } | null = null;

  play(clip: Clip) {
    if (this.clip) this.fading = { clip: this.clip, time: this.time, weight: this.envelope(this.clip, this.time) };
    this.clip = clip;
    this.time = 0;
  }

  get active() {
    return this.clip !== null;
  }

  get progress() {
    return this.clip ? this.time / this.clip.duration : 1;
  }

  private envelope(clip: Clip, t: number) {
    const b = clip.blend ?? 0.12;
    const fin = Math.min(1, t / b);
    const fout = Math.min(1, (clip.duration - t) / b);
    return Math.max(0, Math.min(fin, fout));
  }

  /** Accumulates the clip's additive offsets into `out`. */
  update(dt: number, out: ChannelRecord, scale = 1) {
    if (this.fading) {
      const f = this.fading;
      f.time += dt;
      f.weight -= dt / 0.18;
      if (f.weight <= 0 || f.time >= f.clip.duration) this.fading = null;
      else this.accumulate(f.clip, f.time, f.weight * scale, out);
    }
    if (!this.clip) return;
    this.time += dt;
    if (this.time >= this.clip.duration) {
      this.clip = null;
      return;
    }
    // Clips are authored to start and end at rest, so only the cross-fade needs an envelope.
    const w = this.fading ? Math.min(1, this.time / 0.18) : 1;
    this.accumulate(this.clip, this.time, w * scale, out);
  }

  private accumulate(clip: Clip, t: number, w: number, out: ChannelRecord) {
    for (const ch in clip.tracks) {
      const keys = clip.tracks[ch as Channel]!;
      out[ch as Channel] += sampleTrack(keys, t) * w;
    }
  }
}
