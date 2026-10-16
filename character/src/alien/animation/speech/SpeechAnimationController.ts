import { blendMouth, REST_MOUTH, VISEME_SHAPES, type MouthShape, type SpeechTimeline, type Viseme } from './visemes';
import { Spring } from '../springs';
import { createRandom } from '../math';

/** Where mouth timing currently comes from — surfaced in diagnostics. */
export type SpeechSyncSource = 'timeline' | 'boundary' | 'amplitude' | 'estimated' | 'none';

export interface SpeechSessionInput {
  /** Viseme / word timing. Exact when the provider supplies it, estimated otherwise. */
  timeline?: SpeechTimeline;
  /** True if `timeline` came from the speech engine (not estimated from text). */
  exactTiming?: boolean;
  /** Seconds since audio started, or null before playback begins. Defaults to wall clock. */
  clock?: () => number | null;
  /** Live loudness 0..1 from an analyser, used when there is no timeline. */
  amplitude?: () => number;
}

export interface SpeechFrame {
  mouth: MouthShape;
  /** 0..1 how much the speech layer owns the mouth */
  weight: number;
  /** emphasis pulse for head nods and brows */
  stress: number;
  /** true for one frame when a new phrase begins after a pause */
  phraseStart: boolean;
  /** true while inside a pause between phrases */
  pausing: boolean;
  viseme: Viseme;
  source: SpeechSyncSource;
}

const AMP_VOWELS: Viseme[] = ['aa', 'E', 'oh', 'ih', 'aa', 'ou'];

/**
 * Turns speech timing into mouth motion. Supports, in order of preference:
 * exact viseme timelines, timelines re-anchored by live word boundaries,
 * audio amplitude, and estimated timelines. Cues are blended with a little
 * look-ahead (coarticulation) and smoothed by fast springs; when speech
 * ends the mouth is always eased closed.
 */
export class SpeechAnimationController {
  private session: (SpeechSessionInput & { start: number; offset: number }) | null = null;
  private springs = {
    open: new Spring(0, 19), width: new Spring(1, 17), round: new Spring(0, 17),
    teeth: new Spring(0, 22), tongue: new Spring(0, 20), jaw: new Spring(0, 18),
  };
  private weight = new Spring(0, 12);
  private target: MouthShape = { ...REST_MOUTH };
  private scratch: MouthShape = { ...REST_MOUTH };
  private rnd = createRandom(41);
  private ampViseme: Viseme = 'aa';
  private ampPrev = 0;
  private wasPausing = true;
  private now = 0;
  readonly frame: SpeechFrame = {
    mouth: { ...REST_MOUTH }, weight: 0, stress: 0, phraseStart: false, pausing: true, viseme: 'sil', source: 'none',
  };

  get active() {
    return this.session !== null;
  }

  begin(input: SpeechSessionInput) {
    this.session = { ...input, start: this.now, offset: 0 };
    this.wasPausing = true;
  }

  /** Re-anchor the timeline on a live word boundary (e.g. SpeechSynthesis `boundary`). */
  boundary(charIndex: number) {
    const s = this.session;
    if (!s?.timeline) return;
    const t = this.time();
    if (t == null) return;
    const word = s.timeline.words.find((w) => w.charIndex >= charIndex) ?? null;
    if (!word) return;
    // Shift so the timeline's word start lines up with "now" (bounded to avoid jumps).
    const desired = t - word.time;
    s.offset = Math.max(-1.5, Math.min(1.5, desired));
    this.frame.source = 'boundary';
  }

  end() {
    this.session = null;
  }

  private time(): number | null {
    const s = this.session;
    if (!s) return null;
    const c = s.clock ? s.clock() : this.now - s.start;
    return c == null ? null : c;
  }

  update(dt: number): SpeechFrame {
    this.now += dt;
    const f = this.frame;
    f.phraseStart = false;
    f.stress = 0;
    const s = this.session;
    let viseme: Viseme = 'sil';
    let pausing = true;
    Object.assign(this.target, REST_MOUTH);

    if (s) {
      const t = this.time();
      if (t != null && s.timeline && t - s.offset <= s.timeline.duration) {
        const tl = s.timeline;
        const lt = t - s.offset + 0.04; // look-ahead: lips anticipate sounds
        let i = 0;
        // Cues are sorted; a linear scan from a remembered index would also do.
        let lo = 0, hi = tl.cues.length - 1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          if (tl.cues[mid].time <= lt) {
            i = mid;
            lo = mid + 1;
          } else hi = mid - 1;
        }
        const cue = tl.cues[i];
        const next = tl.cues[i + 1];
        const end = next ? next.time : tl.duration;
        const u = (lt - cue.time) / Math.max(1e-3, end - cue.time);
        // Coarticulation: start moving toward the next shape late in the cue.
        const blend = next ? Math.max(0, (u - 0.6) / 0.4) : 0;
        blendMouth(VISEME_SHAPES[cue.viseme], VISEME_SHAPES[next?.viseme ?? 'sil'], blend * 0.5, this.target);
        if (cue.stress) {
          this.target.open *= 1 + cue.stress * 0.18;
          f.stress = cue.stress * Math.sin(Math.PI * Math.min(1, u));
        }
        viseme = cue.viseme;
        pausing = cue.viseme === 'sil' && end - cue.time > 0.15;
        if (f.source !== 'boundary') f.source = s.exactTiming ? 'timeline' : 'estimated';
      } else if (s.amplitude) {
        const a = Math.min(1, s.amplitude() * 1.4);
        // A new vowel shape on each syllable onset keeps amplitude-driven speech varied.
        if (a > 0.22 && this.ampPrev <= 0.22) this.ampViseme = AMP_VOWELS[Math.floor(this.rnd() * AMP_VOWELS.length)];
        this.ampPrev = a;
        const shape = a < 0.08 ? VISEME_SHAPES.sil : VISEME_SHAPES[this.ampViseme];
        blendMouth(VISEME_SHAPES.sil, shape, Math.min(1, a * 1.3), this.target);
        viseme = a < 0.08 ? 'sil' : this.ampViseme;
        pausing = a < 0.05;
        f.stress = Math.max(0, a - 0.55);
        f.source = 'amplitude';
      } else if (t == null) {
        // Waiting for audio to start: lips parted, ready.
        blendMouth(REST_MOUTH, VISEME_SHAPES.ih, 0.18, this.target);
      }
    } else f.source = 'none';

    if (this.wasPausing && !pausing) f.phraseStart = true;
    this.wasPausing = pausing;
    f.pausing = pausing;
    f.viseme = viseme;

    const sp = this.springs;
    const m = this.scratch;
    m.open = sp.open.update(this.target.open, dt);
    m.width = sp.width.update(this.target.width, dt);
    m.round = sp.round.update(this.target.round, dt);
    m.teeth = sp.teeth.update(this.target.teeth, dt);
    m.tongue = sp.tongue.update(this.target.tongue, dt);
    m.jaw = sp.jaw.update(this.target.jaw, dt);
    Object.assign(f.mouth, m);
    f.weight = this.weight.update(s ? 1 : 0, dt);
    return f;
  }
}
