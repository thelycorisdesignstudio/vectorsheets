import { createRandom } from './math';

/**
 * Procedural speech: a stream of syllables grouped into words and phrases.
 * Each syllable has a viseme-ish shape (open / round / wide). When an
 * external speech level is supplied (e.g. from an audio analyser) it drives
 * the jaw instead, while the shapes keep varying for liveliness.
 */
export interface TalkFrame {
  open: number;
  round: number;
  width: number;
  /** Emphasis pulse for brows / head nods */
  stress: number;
}

const VISEMES = [
  { open: 0.75, round: 0.05, width: 1.08 }, // "ah"
  { open: 0.5, round: 0.85, width: 0.78 }, // "oh"
  { open: 0.35, round: 0.0, width: 1.22 }, // "ee"
  { open: 0.55, round: 0.35, width: 0.95 }, // "eh"
  { open: 0.08, round: 0.1, width: 0.95 }, // "m"
  { open: 0.3, round: 0.6, width: 0.82 }, // "oo"
];

export class TalkGenerator {
  private rnd = createRandom(99);
  private t = 0;
  private sylDur = 0.2;
  private viseme = VISEMES[0];
  private next = VISEMES[1];
  private inWord = 0;
  private pause = 0;
  private stress = 0;
  readonly frame: TalkFrame = { open: 0, round: 0, width: 1, stress: 0 };

  update(dt: number, external: number | null): TalkFrame {
    this.t += dt;
    if (this.pause > 0) {
      this.pause -= dt;
      this.frame.open = 0;
    } else if (this.t >= this.sylDur) {
      this.t = 0;
      this.viseme = this.next;
      this.next = VISEMES[Math.floor(this.rnd() * VISEMES.length)];
      this.sylDur = 0.11 + this.rnd() * 0.13;
      this.stress = this.rnd() < 0.22 ? 1 : 0;
      this.inWord++;
      if (this.inWord > 1 + this.rnd() * 3) {
        this.inWord = 0;
        // Short gap between words, a longer breath between phrases.
        this.pause = this.rnd() < 0.2 ? 0.45 + this.rnd() * 0.35 : 0.06 + this.rnd() * 0.08;
      }
    }
    const u = this.t / this.sylDur;
    const env = this.pause > 0 ? 0 : Math.sin(Math.PI * Math.min(1, u)) ** 0.7;
    const v = this.viseme;
    const open = external != null ? Math.min(1, external * 1.15) : v.open * env * (0.8 + this.stress * 0.3);
    this.frame.open = open;
    this.frame.round = v.round;
    this.frame.width = v.width;
    this.frame.stress = this.stress * env;
    return this.frame;
  }
}
