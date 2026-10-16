import type { SpeechTimeline, Viseme, VisemeCue, WordCue } from './visemes';

/**
 * Text → estimated viseme timeline (English-leaning grapheme rules).
 *
 * This is the fallback when a speech provider gives no phoneme timing. It is
 * deliberately simple but structured: vowels get longer slots than
 * consonants, stressed syllables open wider, punctuation produces real
 * pauses (and therefore mouth closures). Word cues are kept so the timeline
 * can be re-anchored to live word-boundary events from a TTS engine.
 */

const DIGRAPHS: [string, Viseme[]][] = [
  ['tch', ['CH']], ['igh', ['aa', 'ih']], ['th', ['TH']], ['ch', ['CH']], ['sh', ['CH']], ['ph', ['FF']],
  ['wh', ['ou']], ['ng', ['kk']], ['ck', ['kk']], ['qu', ['kk', 'ou']], ['oo', ['ou']],
  ['ee', ['ih']], ['ea', ['ih']], ['ai', ['E']], ['ay', ['E']], ['oa', ['oh']], ['ou', ['aa', 'ou']],
  ['ow', ['oh', 'ou']], ['oi', ['oh', 'ih']], ['oy', ['oh', 'ih']], ['au', ['oh']], ['aw', ['oh']],
  ['er', ['RR']], ['ir', ['RR']], ['ur', ['RR']], ['ar', ['aa', 'RR']], ['or', ['oh', 'RR']],
];

const SINGLE: Record<string, Viseme> = {
  a: 'aa', e: 'E', i: 'ih', o: 'oh', u: 'aa', y: 'ih',
  b: 'PP', m: 'PP', p: 'PP', f: 'FF', v: 'FF', d: 'DD', t: 'DD', n: 'nn', l: 'nn',
  k: 'kk', c: 'kk', g: 'kk', q: 'kk', x: 'kk', h: 'kk', s: 'SS', z: 'SS', j: 'CH', r: 'RR', w: 'ou',
};

const VOWELS = new Set<Viseme>(['aa', 'E', 'ih', 'oh', 'ou', 'RR']);

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

export function wordToVisemes(word: string): Viseme[] {
  let w = word.toLowerCase().replace(/[0-9]/g, (d) => ` ${NUMBER_WORDS[+d]} `).replace(/[^a-z ]/g, '');
  w = w.replace(/\s+/g, '');
  // Silent final "e" (make, time) — but keep it for short words (be, me).
  if (w.length > 3 && w.endsWith('e') && !w.endsWith('ee')) w = w.slice(0, -1);
  const out: Viseme[] = [];
  let i = 0;
  while (i < w.length) {
    let matched = false;
    for (const [g, vs] of DIGRAPHS) {
      if (w.startsWith(g, i)) {
        out.push(...vs);
        i += g.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    const v = SINGLE[w[i]];
    // Doubled consonants are one sound.
    if (v && !(i > 0 && w[i] === w[i - 1] && !VOWELS.has(v))) out.push(v);
    i++;
  }
  return out;
}

export interface TimingOptions {
  /** overall speaking rate multiplier (1 = conversational) */
  rate?: number;
}

export function textToTimeline(text: string, opts: TimingOptions = {}): SpeechTimeline {
  const rate = opts.rate ?? 1;
  const vowelDur = 0.15 / rate;
  const consDur = 0.065 / rate;
  const cues: VisemeCue[] = [];
  const words: WordCue[] = [];
  let t = 0.04;
  const token = /([A-Za-z0-9'’]+)|([,;:]+)|([.!?]+)|(\s+)|(—|–|-)/g;
  let m: RegExpExecArray | null;
  const pushSil = (dur: number) => {
    if (cues.length && cues[cues.length - 1].viseme === 'sil') {
      t += dur;
      return;
    }
    cues.push({ time: t, viseme: 'sil' });
    t += dur;
  };
  while ((m = token.exec(text))) {
    if (m[1]) {
      const vs = wordToVisemes(m[1]);
      if (!vs.length) continue;
      const start = t;
      let firstVowel = true;
      for (const v of vs) {
        const vowel = VOWELS.has(v);
        const stress = vowel ? (firstVowel && vs.length > 2 ? 1 : 0.5) : 0;
        if (vowel) firstVowel = false;
        cues.push({ time: t, viseme: v, stress });
        t += vowel ? vowelDur * (stress === 1 ? 1.15 : 1) : consDur;
      }
      words.push({ time: start, end: t, text: m[1], charIndex: m.index });
    } else if (m[2]) pushSil(0.24 / rate);
    else if (m[3]) pushSil(0.42 / rate);
    else if (m[5]) pushSil(0.18 / rate);
    else if (m[4]) t += 0.035 / rate;
  }
  pushSil(0.1);
  return { cues, words, duration: t };
}
