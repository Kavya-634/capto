import { describe, expect, it } from 'vitest';
import { alignWords, detectDegenerate, splitIntoCaptions } from './alignment';
import { captionError, type CaptionWord } from '../captions';
import { checkAudio } from './audio';
import { durationWarning, longClipNotice } from './config';

const words = (count: number): CaptionWord[] =>
  Array.from({ length: count }, (_, i) => ({ text: `word${i}`, start: i * 0.4, end: i * 0.4 + 0.3 }));
const repeated = (text: string, count: number, gap = 0.05): CaptionWord[] =>
  Array.from({ length: count }, (_, i) => ({ text, start: i * gap, end: i * gap + gap }));

describe('degenerate transcript detection', () => {
  it('flags the Whisper repetition loop a user hit on Hindi audio (one word × 229)', () => {
    // Every word was zero-length and repaired, as in the reported screenshot.
    const result = detectDegenerate(repeated('तुछ', 229), 229);
    expect(result.degenerate).toBe(true);
    expect(result.longestRun).toBe(229);
    expect(result.topWordShare).toBe(1);
    expect(result.reason).toMatch(/repeated 229 times/);
  });
  it('flags a loop even when a few other words leaked in', () => {
    const mixed = [...words(5), ...repeated('lag', 40), ...words(3)];
    const result = detectDegenerate(mixed, 0);
    expect(result.degenerate).toBe(true);
    expect(result.longestRun).toBe(40);
  });
  it('flags a transcript where almost every word needed timing repair', () => {
    expect(detectDegenerate(words(30), 20).degenerate).toBe(true);
    expect(detectDegenerate(words(30), 20).reason).toMatch(/67% of words had no usable timing/);
  });
  it('does not flag genuine repeated speech or short clips', () => {
    // "no no no no" in the middle of a normal sentence.
    const chant = [...words(8), ...repeated('no', 4), ...words(8)];
    expect(detectDegenerate(chant, 0).degenerate).toBe(false);
    // A short clip that happens to be one repeated word (e.g. a 3-word jingle) is left alone.
    expect(detectDegenerate(repeated('hey', 6), 0).degenerate).toBe(false);
    // A normal varied transcript with a handful of repairs.
    expect(detectDegenerate(words(60), 5).degenerate).toBe(false);
    // Punctuation and case differences count as the same word, but a varied sentence passes.
    const varied = [
      'The',
      'the',
      'THE,',
      'quick',
      'brown',
      'fox',
      'jumps',
      'over',
      'the',
      'lazy',
      'dog',
      'again',
      'and',
      'again',
      'tonight',
      'friends',
      'hello',
      'world',
      'ok',
      'done',
    ].map((t, i) => ({ text: t, start: i, end: i + 0.5 }));
    expect(detectDegenerate(varied, 0).degenerate).toBe(false);
  });
  it('handles an empty list', () => {
    expect(detectDegenerate([], 0).degenerate).toBe(false);
  });
});

describe('model alignment', () => {
  it('preserves non-uniform word intervals without even spacing', () => {
    const { words: result } = alignWords(
      [
        { text: ' Hello', timestamp: [0.12, 0.34] },
        { text: 'world.', timestamp: [1.2, 2.7] },
      ],
      3,
    );
    expect(result).toEqual([
      { text: 'Hello', start: 0.12, end: 0.34 },
      { text: 'world.', start: 1.2, end: 2.7 },
    ]);
  });
  it('repairs a zero-length word instead of discarding the whole transcript', () => {
    // The user-reported failure: "Some words have missing or zero-length timing".
    // Whisper gave a short function word identical start/end after a chunk merge.
    const result = alignWords(
      [
        { text: ' Welcome', timestamp: [0, 0.6] },
        { text: ' to', timestamp: [0.6, 0.6] },
        { text: ' the', timestamp: [0.6, 0.8] },
        { text: ' studio.', timestamp: [0.8, 1.4] },
      ],
      3,
    );
    expect(result.words.map((w) => w.text)).toEqual(['Welcome', 'to', 'the', 'studio.']);
    expect(result.repaired).toBe(1);
    expect(result.words[1]).toEqual({ text: 'to', start: 0.6, end: 0.65 });
    // The following word was pushed after the repaired slot and still ends where the model said.
    expect(result.words[2]).toEqual({ text: 'the', start: 0.65, end: 0.8 });
    expect(result.adjusted).toBe(1);
    // Sequence remains strictly ordered.
    for (let i = 1; i < result.words.length; i++)
      expect(result.words[i].start).toBeGreaterThanOrEqual(result.words[i - 1].end);
  });
  it('fills a missing start or end from the neighbour and counts it as unaligned', () => {
    const noEnd = alignWords([{ text: 'Hello', timestamp: [0, null] }], 3);
    expect(noEnd.words).toEqual([{ text: 'Hello', start: 0, end: 0.05 }]);
    expect(noEnd.unaligned).toBe(1);
    const noStart = alignWords(
      [
        { text: 'one', timestamp: [0, 1] },
        { text: 'two', timestamp: [NaN, 2] },
      ],
      3,
    );
    expect(noStart.words[1]).toEqual({ text: 'two', start: 1, end: 2 });
    expect(noStart.unaligned).toBe(1);
  });
  it('keeps a collapsed word at the very end inside the clip', () => {
    const result = alignWords(
      [
        { text: 'almost', timestamp: [0, 2] },
        { text: 'done', timestamp: [2, 2] },
      ],
      2,
    );
    expect(result.words[1]).toEqual({ text: 'done', start: 1.95, end: 2 });
    expect(result.words[0].end).toBe(1.95);
    expect(result.repaired).toBe(1);
  });
  it('only throws when there is no recognisable word at all', () => {
    expect(() => alignWords([], 3)).toThrow(/No speech/);
    expect(() => alignWords([{ text: '  ', timestamp: [0, 1] }], 3)).toThrow(/No speech/);
  });
  it('keeps a timed unit with inner whitespace instead of failing the transcript', () => {
    // Reproduces the tokenizer gluing a space-prefixed token to punctuation inside one chunk.
    const result = alignWords(
      [
        { text: ' Hello', timestamp: [0, 0.5] },
        { text: ' world ,', timestamp: [0.5, 1.2] },
        { text: 'tabs\t\there', timestamp: [1.2, 2] },
      ],
      3,
    );
    expect(result.words.map((w) => w.text)).toEqual(['Hello', 'world ,', 'tabs here']);
    expect(result.joined).toBe(2);
    expect(result.words[1]).toEqual({ text: 'world ,', start: 0.5, end: 1.2 });
  });
  it('clips small overlaps and bounds with a review warning count', () => {
    const result = alignWords(
      [
        { text: 'one', timestamp: [-0.1, 1] },
        { text: 'two', timestamp: [0.98, 3.1] },
      ],
      3,
    );
    expect(result.adjusted).toBe(2);
    expect(result.words[1]).toEqual({ text: 'two', start: 1, end: 3 });
  });
  it('attaches zero-duration punctuation without inventing an interval', () => {
    expect(
      alignWords(
        [
          { text: 'नमस्ते', timestamp: [0, 1] },
          { text: '।', timestamp: [1, 1] },
        ],
        2,
      ).words,
    ).toEqual([{ text: 'नमस्ते।', start: 0, end: 1 }]);
  });
});

describe('readable caption lines', () => {
  it('splits into 3–6 words and keeps every word exactly once', () => {
    for (let count = 3; count < 80; count++) {
      const source = words(count);
      const captions = splitIntoCaptions(source);
      expect(captions.every((c) => c.words!.length >= 3 && c.words!.length <= 6)).toBe(true);
      expect(captions.flatMap((c) => c.words)).toEqual(source);
      expect(captions.every((c) => captionError(c, 100) === null)).toBe(true);
    }
  });
  it('honors long pauses and Hindi sentence boundaries', () => {
    const source = ['आज', 'हम', 'सीखेंगे।', 'एक', 'नई', 'कहानी।'].map((text, i) => ({
      text,
      start: i,
      end: i + 0.5,
    }));
    const captions = splitIntoCaptions(source);
    expect(captions.map((c) => c.text)).toEqual(['आज हम सीखेंगे।', 'एक नई कहानी।']);
    expect(
      splitIntoCaptions([
        { text: 'Hi', start: 0, end: 1 },
        { text: 'again', start: 3, end: 4 },
      ]),
    ).toHaveLength(2);
  });
  it('keeps a short utterance instead of padding invented words', () => {
    expect(splitIntoCaptions(words(2))[0].words).toHaveLength(2);
    expect(splitIntoCaptions([])).toEqual([]);
  });
});

describe('audio and review safeguards', () => {
  it('enforces a five-minute generation limit with a long-clip notice', () => {
    expect(durationWarning(300)).toBeNull();
    expect(durationWarning(300.01)).toMatch(/5 minutes/);
    expect(durationWarning(0)).toMatch(/loading/);
    expect(durationWarning(Infinity)).toMatch(/loading/);
    expect(longClipNotice(60)).toBeNull();
    expect(longClipNotice(120)).toMatch(/2 minutes/);
    expect(longClipNotice(299)).toMatch(/5 minutes/);
    expect(longClipNotice(301)).toBeNull();
  });
  it('rejects empty, silent and corrupt decoded audio', () => {
    expect(() => checkAudio(new Float32Array())).toThrow(/no audio/);
    expect(() => checkAudio(new Float32Array(16000))).toThrow(/silent/);
    expect(() => checkAudio(new Float32Array([NaN]))).toThrow(/decode/);
    expect(() => checkAudio(new Float32Array([0.1, -0.1]))).not.toThrow();
  });
  it('validates edited word times and words against the caption', () => {
    const c = splitIntoCaptions(words(3))[0];
    expect(
      captionError({ ...c, words: c.words!.map((w, i) => (i === 1 ? { ...w, start: 0.1 } : w)) }, 5),
    ).toMatch(/Word timings/);
    expect(captionError({ ...c, text: 'different words' }, 5)).toMatch(/don’t match/);
    expect(captionError({ ...c, words: [{ text: c.text, start: NaN, end: 1 }] }, 5)).toMatch(/Word timings/);
  });
});
