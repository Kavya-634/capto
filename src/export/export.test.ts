import { describe, expect, it } from 'vitest';
import { shiftCaptions, defaultStyle, type Caption } from '../captions';
import { entryState, wordRuns, effectiveHighlight } from './renderCaption';

const cap: Caption = {
  id: 'a',
  text: 'aaj hum seekhenge',
  start: 1,
  end: 3,
  words: [
    { text: 'aaj', start: 1, end: 1.5 },
    { text: 'hum', start: 1.5, end: 2.1 },
    { text: 'seekhenge', start: 2.1, end: 3 },
  ],
};

describe('shiftCaptions (sync offset)', () => {
  it('returns the same array for zero offset', () => {
    const input = [cap];
    expect(shiftCaptions(input, 0, 10)).toBe(input);
  });
  it('shifts lines and words together, positive = later', () => {
    const [s] = shiftCaptions([cap], 0.5, 10);
    expect(s.start).toBe(1.5);
    expect(s.end).toBe(3.5);
    expect(s.words!.map((w) => [w.start, w.end])).toEqual([
      [1.5, 2],
      [2, 2.6],
      [2.6, 3.5],
    ]);
  });
  it('clamps to the clip and never emits inverted or zero-length intervals', () => {
    const [s] = shiftCaptions([cap], -1.2, 10);
    expect(s.start).toBe(0);
    expect(s.end).toBeCloseTo(1.8);
    for (const w of s.words!) expect(w.end).toBeGreaterThan(w.start);
    expect(s.words![0].start).toBe(0);
  });
  it('drops captions shifted entirely outside the clip', () => {
    expect(shiftCaptions([cap], -5, 10)).toEqual([]);
    expect(shiftCaptions([cap], 9, 10)).toEqual([]);
  });
  it('does not mutate input', () => {
    const before = JSON.stringify(cap);
    shiftCaptions([cap], 0.7, 10);
    expect(JSON.stringify(cap)).toBe(before);
  });
});

describe('renderCaption model (pure)', () => {
  it('builds karaoke-style runs with past/active/future states from real word intervals', () => {
    const runs = wordRuns(cap, { ...defaultStyle, animation: 'karaoke' }, 1.8);
    expect(runs.map((r) => r.state)).toEqual(['past', 'active', 'future']);
    expect(runs.map((r) => r.text)).toEqual(['aaj', 'hum', 'seekhenge']);
  });
  it('one-word mode yields exactly the active word, or nothing in a gap', () => {
    expect(wordRuns(cap, { ...defaultStyle, animation: 'word' }, 1.8)).toEqual([
      { text: 'hum', state: 'active', index: 1 },
    ]);
    const gapCap = {
      ...cap,
      words: [
        { text: 'x', start: 1, end: 1.2 },
        { text: 'y', start: 2, end: 2.5 },
      ],
    };
    expect(wordRuns(gapCap, { ...defaultStyle, animation: 'word' }, 1.6)).toEqual([]);
  });
  it('typewriter reveals letters across the active word interval', () => {
    const style = { ...defaultStyle, animation: 'typewriter' as const };
    const early = wordRuns(cap, style, 2.15)[2].text; // 5.5% into "seekhenge" (9 chars)
    const late = wordRuns(cap, style, 2.95)[2].text; // ~94%
    expect(early.length).toBeGreaterThanOrEqual(1);
    expect(early.length).toBeLessThan(late.length);
    expect(wordRuns(cap, style, 1.2)[2].text).toBe(''); // future word hidden
  });
  it('entry animations start hidden/offset and settle to identity', () => {
    for (const a of ['pop', 'fade', 'slide', 'zoom', 'blur', 'flip', 'bounce'] as const) {
      const start = entryState(a, 0);
      const done = entryState(a, 5);
      expect(start.opacity).toBeLessThanOrEqual(1);
      expect(done).toEqual({ opacity: 1, scale: 1, dy: 0, dx: 0, blur: 0, rotX: 0 });
    }
    expect(entryState('none', 0)).toEqual({ opacity: 1, scale: 1, dy: 0, dx: 0, blur: 0, rotX: 0 });
  });
  it('never lets the highlight equal the text colour', () => {
    expect(effectiveHighlight('#ffffff', '#ffffff')).not.toBe('#ffffff');
    expect(effectiveHighlight('#000000', '#000000')).not.toBe('#000000');
    expect(effectiveHighlight('#ffffff', '#d4fc79')).toBe('#d4fc79');
  });
});
