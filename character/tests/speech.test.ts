import { describe, expect, it } from 'vitest';
import { textToTimeline, wordToVisemes } from '../src/alien/animation/speech/textToVisemes';
import { SpeechAnimationController } from '../src/alien/animation/speech/SpeechAnimationController';

const step = (s: SpeechAnimationController, seconds: number, dt = 1 / 60) => {
  for (let t = 0; t < seconds; t += dt) s.update(dt);
  return s.frame;
};

describe('text to visemes', () => {
  it('maps lips, teeth and rounded sounds', () => {
    expect(wordToVisemes('map')).toEqual(['PP', 'aa', 'PP']);
    expect(wordToVisemes('five')[0]).toBe('FF');
    expect(wordToVisemes('the')[0]).toBe('TH');
    expect(wordToVisemes('moon')).toContain('ou');
  });

  it('builds a sorted timeline with word cues and punctuation pauses', () => {
    const tl = textToTimeline('Hello there. How are you?');
    expect(tl.words.map((w) => w.text)).toEqual(['Hello', 'there', 'How', 'are', 'you']);
    expect(tl.words[1].charIndex).toBe(6);
    for (let i = 1; i < tl.cues.length; i++) expect(tl.cues[i].time).toBeGreaterThanOrEqual(tl.cues[i - 1].time);
    // A sentence break produces a real closure between "there" and "How".
    const between = tl.cues.filter((c) => c.time > tl.words[1].end - 1e-6 && c.time < tl.words[2].time);
    expect(between.some((c) => c.viseme === 'sil')).toBe(true);
    expect(tl.duration).toBeGreaterThan(1);
  });
});

describe('SpeechAnimationController', () => {
  it('opens on vowels, follows the clock and closes at the end', () => {
    const s = new SpeechAnimationController();
    let clock = 0;
    const tl = textToTimeline('ah ah ah');
    s.begin({ timeline: tl, clock: () => clock });
    let maxOpen = 0;
    for (let i = 0; i < 60; i++) {
      clock += 1 / 60;
      maxOpen = Math.max(maxOpen, s.update(1 / 60).mouth.open);
    }
    expect(maxOpen).toBeGreaterThan(0.4);
    expect(s.frame.source).toBe('estimated');
    s.end();
    const f = step(s, 1);
    expect(f.mouth.open).toBeLessThan(0.02);
    expect(f.weight).toBeLessThan(0.05);
  });

  it('reports exact timing when the provider supplies visemes', () => {
    const s = new SpeechAnimationController();
    s.begin({ timeline: { cues: [{ time: 0, viseme: 'oh' }], words: [], duration: 1 }, exactTiming: true, clock: () => 0.3 });
    step(s, 0.3);
    expect(s.frame.source).toBe('timeline');
    expect(s.frame.mouth.round).toBeGreaterThan(0.5);
  });

  it('re-anchors on word boundaries', () => {
    const s = new SpeechAnimationController();
    let clock = 0.5;
    const tl = textToTimeline('one two three');
    s.begin({ timeline: tl, clock: () => clock });
    s.update(1 / 60);
    s.boundary(tl.words[2].charIndex);
    expect(s.frame.source).toBe('boundary');
    clock = 0.52;
    s.update(1 / 60);
    // The third word is now considered to start at clock 0.5, i.e. we are inside it.
    expect(['TH', 'RR', 'ih', 'sil']).toContain(s.frame.viseme);
  });

  it('falls back to amplitude', () => {
    const s = new SpeechAnimationController();
    s.begin({ amplitude: () => 0.8, clock: () => null });
    const f = step(s, 0.4);
    expect(f.source).toBe('amplitude');
    // The vowel shape varies per syllable; any of them opens the mouth clearly.
    expect(f.mouth.open).toBeGreaterThan(0.2);
  });
});
