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
  /** Channels this clip owns: lower layers (idle sway, held pose) are suppressed there while it plays. */
  override?: Channel[];
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

interface ActiveClip {
  name: string;
  clip: Clip;
  time: number;
  /** fade-out weight when stopped early (1 = normal) */
  fade: number;
  stopping: boolean;
}

/**
 * Gesture layer: several additive clips can play at once (a nod during a
 * greeting, a startle over speech). Each has an envelope; stopping fades it
 * out instead of cutting. Override masks tell lower layers to yield.
 */
export class ClipLayer {
  private clips: ActiveClip[] = [];
  /** 0..1 per channel: how strongly active clips own it this frame */
  readonly ownership = emptyChannels();

  play(name: string, clip: Clip) {
    // Restarting the same clip fades the old instance out.
    for (const c of this.clips) if (c.name === name) c.stopping = true;
    this.clips.push({ name, clip, time: 0, fade: 1, stopping: false });
    if (this.clips.length > 6) this.clips.shift();
  }

  stop(name?: string) {
    for (const c of this.clips) if (!name || c.name === name) c.stopping = true;
  }

  isPlaying(name?: string) {
    return this.clips.some((c) => !c.stopping && (!name || c.name === name));
  }

  get names() {
    return this.clips.filter((c) => !c.stopping).map((c) => c.name);
  }

  private envelope(c: ActiveClip) {
    const b = c.clip.blend ?? 0.12;
    const fin = Math.min(1, c.time / b);
    const fout = Math.min(1, (c.clip.duration - c.time) / b);
    return Math.max(0, Math.min(fin, fout)) * c.fade;
  }

  update(dt: number, out: ChannelRecord, scale = 1) {
    for (const k in this.ownership) this.ownership[k as Channel] = 0;
    for (const c of this.clips) {
      c.time += dt;
      if (c.stopping) c.fade -= dt / 0.2;
    }
    this.clips = this.clips.filter((c) => c.time < c.clip.duration && c.fade > 0);
    for (const c of this.clips) {
      // Authored clips start/end at rest, so the envelope only matters for early stops.
      const w = (c.stopping ? this.envelope(c) : Math.min(1, c.fade)) * scale;
      for (const ch in c.clip.tracks) out[ch as Channel] += sampleTrack(c.clip.tracks[ch as Channel]!, c.time) * w;
      if (c.clip.override) {
        const e = Math.min(1, this.envelope(c) * 1.5);
        for (const ch of c.clip.override) this.ownership[ch] = Math.max(this.ownership[ch], e);
      }
    }
  }
}
