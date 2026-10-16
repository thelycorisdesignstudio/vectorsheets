/**
 * Viseme vocabulary shared by every speech source. It follows the common
 * 15-viseme set used by most TTS / lip-sync tools, so provider timing data
 * maps onto it directly.
 */
export type Viseme =
  | 'sil' | 'PP' | 'FF' | 'TH' | 'DD' | 'kk' | 'CH' | 'SS' | 'nn' | 'RR'
  | 'aa' | 'E' | 'ih' | 'oh' | 'ou';

export const VISEMES: Viseme[] = ['sil', 'PP', 'FF', 'TH', 'DD', 'kk', 'CH', 'SS', 'nn', 'RR', 'aa', 'E', 'ih', 'oh', 'ou'];

/** Mouth parameters a viseme resolves to (all roughly 0..1, width is a multiplier). */
export interface MouthShape {
  open: number;
  width: number;
  round: number;
  /** how much of the upper teeth show */
  teeth: number;
  /** tongue visibility / raised tip */
  tongue: number;
  /** jaw drop (deforms the lower face) */
  jaw: number;
}

export const REST_MOUTH: MouthShape = { open: 0, width: 1, round: 0, teeth: 0, tongue: 0, jaw: 0 };

export const VISEME_SHAPES: Record<Viseme, MouthShape> = {
  sil: REST_MOUTH,
  PP: { open: 0, width: 0.9, round: 0.12, teeth: 0, tongue: 0, jaw: 0.02 },
  FF: { open: 0.12, width: 1.02, round: 0, teeth: 0.95, tongue: 0, jaw: 0.1 },
  TH: { open: 0.2, width: 1, round: 0, teeth: 0.6, tongue: 0.85, jaw: 0.16 },
  DD: { open: 0.24, width: 1.04, round: 0, teeth: 0.6, tongue: 0.5, jaw: 0.2 },
  kk: { open: 0.3, width: 1, round: 0.05, teeth: 0.4, tongue: 0.2, jaw: 0.28 },
  CH: { open: 0.22, width: 0.84, round: 0.5, teeth: 0.85, tongue: 0.1, jaw: 0.18 },
  SS: { open: 0.12, width: 1.12, round: 0, teeth: 1, tongue: 0, jaw: 0.08 },
  nn: { open: 0.2, width: 1.02, round: 0, teeth: 0.45, tongue: 0.65, jaw: 0.16 },
  RR: { open: 0.24, width: 0.82, round: 0.55, teeth: 0.3, tongue: 0.2, jaw: 0.2 },
  aa: { open: 0.8, width: 1.06, round: 0.05, teeth: 0.35, tongue: 0.15, jaw: 0.78 },
  E: { open: 0.5, width: 1.2, round: 0, teeth: 0.6, tongue: 0.1, jaw: 0.42 },
  ih: { open: 0.34, width: 1.16, round: 0, teeth: 0.55, tongue: 0.1, jaw: 0.3 },
  oh: { open: 0.58, width: 0.8, round: 0.85, teeth: 0.15, tongue: 0.1, jaw: 0.52 },
  ou: { open: 0.3, width: 0.66, round: 1, teeth: 0, tongue: 0, jaw: 0.26 },
};

/**
 * Azure Speech viseme IDs (0–21) mapped to this set. Other providers that
 * emit IPA phonemes or character alignments can be mapped the same way.
 */
export const AZURE_VISEME_IDS: Viseme[] = [
  'sil', 'aa', 'aa', 'oh', 'E', 'RR', 'ih', 'ou', 'oh', 'aa', 'oh',
  'aa', 'kk', 'RR', 'nn', 'SS', 'CH', 'TH', 'FF', 'DD', 'kk', 'PP',
];

export interface VisemeCue {
  /** seconds from the start of the utterance */
  time: number;
  viseme: Viseme;
  /** emphasis 0..1 (stressed vowels) */
  stress?: number;
}

export interface WordCue {
  time: number;
  end: number;
  text: string;
  /** character offset of the word in the source text */
  charIndex: number;
}

export interface SpeechTimeline {
  cues: VisemeCue[];
  words: WordCue[];
  duration: number;
}

export function blendMouth(a: MouthShape, b: MouthShape, t: number, out: MouthShape = { ...REST_MOUTH }): MouthShape {
  out.open = a.open + (b.open - a.open) * t;
  out.width = a.width + (b.width - a.width) * t;
  out.round = a.round + (b.round - a.round) * t;
  out.teeth = a.teeth + (b.teeth - a.teeth) * t;
  out.tongue = a.tongue + (b.tongue - a.tongue) * t;
  out.jaw = a.jaw + (b.jaw - a.jaw) * t;
  return out;
}
