import { describe, expect, it } from 'vitest';
import {
  activeWordIndex,
  animations,
  captionError,
  editCaption,
  exportCaptions,
  exportWordTiming,
  fonts,
  formatTime,
  getActiveCaption,
  palette,
  presets,
  subtitleTime,
  wordTimedAnimations,
} from './captions';

describe('caption playback', () => {
  const lines = [
    { id: 'line-0', text: 'First line', start: 0, end: 3 },
    { id: 'line-1', text: 'Second line', start: 3, end: 6 },
  ];
  it('uses inclusive starts and exclusive ends', () => {
    expect(getActiveCaption(lines, 0)?.id).toBe('line-0');
    expect(getActiveCaption(lines, 3)?.id).toBe('line-1');
    expect(getActiveCaption(lines, 18)).toBeUndefined();
    expect(getActiveCaption(lines, -1)).toBeUndefined();
  });
  it('shows the latest starting caption when captions overlap', () => {
    expect(
      getActiveCaption(
        [
          { id: 'a', text: 'A', start: 0, end: 4 },
          { id: 'b', text: 'B', start: 1, end: 3 },
        ],
        2,
      )?.text,
    ).toBe('B');
  });
  it('distributes word timing and handles Devanagari', () => {
    const caption = { id: 'hindi', text: 'आपकी कहानी आपके शब्द', start: 2, end: 6 };
    expect(activeWordIndex(caption, 2)).toBe(0);
    expect(activeWordIndex(caption, 3.5)).toBe(1);
    expect(activeWordIndex(caption, 5.9)).toBe(3);
    expect(activeWordIndex(caption, 12)).toBe(3);
  });
  it('uses actual word times and leaves silent gaps unhighlighted', () => {
    const caption = {
      id: 'aligned',
      text: 'नमस्ते दोस्तों',
      start: 0,
      end: 3,
      words: [
        { text: 'नमस्ते', start: 0.1, end: 0.4 },
        { text: 'दोस्तों', start: 1.6, end: 2.7 },
      ],
    };
    expect(activeWordIndex(caption, 0.2)).toBe(0);
    expect(activeWordIndex(caption, 0.4)).toBe(-1);
    expect(activeWordIndex(caption, 1)).toBe(-1);
    expect(activeWordIndex(caption, 1.7)).toBe(1);
    expect(activeWordIndex(caption, 2.8)).toBe(-1);
  });
  it('invalidates stale word alignment when text or line bounds change', () => {
    const caption = {
      id: 'a',
      text: 'Hello',
      start: 0,
      end: 2,
      words: [{ text: 'Hello', start: 0, end: 2 }],
      timingSource: 'model' as const,
    };
    expect(editCaption(caption, 'text', 'Hello')).toBe(caption);
    for (const [key, value] of [
      ['text', 'New words'],
      ['start', 0.1],
      ['end', 3],
    ] as const) {
      expect(editCaption(caption, key, value).words).toBeUndefined();
      expect(editCaption(caption, key, value).timingSource).toBe('estimated');
    }
    expect(JSON.parse(exportWordTiming([caption])).captions[0].words).toEqual(caption.words);
  });
  it('provides six distinct presets', () => {
    expect(new Set(presets.map((p) => p.name)).size).toBe(6);
    expect(presets.find((p) => p.id === 'word')?.style.animation).toBe('word');
    expect(presets.find((p) => p.id === 'karaoke')?.style.animation).toBe('karaoke');
    expect(presets.find((p) => p.id === 'boxed')?.style.background).toBe(true);
    expect(presets.find((p) => p.id === 'neon')?.style.neon).toBe(true);
  });
  it('exposes consistent animation, font and palette catalogues', () => {
    // Every animation value is unique and the word-timed set is a subset of the catalogue.
    const values = animations.map((a) => a.value);
    expect(new Set(values).size).toBe(values.length);
    expect(values.length).toBeGreaterThanOrEqual(16);
    for (const value of wordTimedAnimations) expect(values).toContain(value);
    expect(wordTimedAnimations.has('typewriter')).toBe(true);
    expect(wordTimedAnimations.has('word-reveal')).toBe(true);
    expect(wordTimedAnimations.has('pop')).toBe(false);
    // Every animation declares a group and a hint for the panel.
    expect(animations.every((a) => a.group && a.hint)).toBe(true);
    // Fonts: unique names, every stack ends in a generic family, Hindi-capable faces are grouped.
    expect(new Set(fonts.map((f) => f.name)).size).toBe(fonts.length);
    expect(fonts.length).toBeGreaterThanOrEqual(15);
    expect(fonts.every((f) => /(sans-serif|serif|monospace)$/.test(f.value))).toBe(true);
    expect(fonts.filter((f) => f.group === 'Latin + Devanagari').length).toBeGreaterThanOrEqual(6);
    // Palette: valid 6-digit hex, unique, with a flagged primary set.
    expect(palette.every((p) => /^#[0-9a-f]{6}$/.test(p.value))).toBe(true);
    expect(new Set(palette.map((p) => p.value)).size).toBe(palette.length);
    expect(palette.filter((p) => p.primary).length).toBe(4);
  });
});

describe('validation and exports', () => {
  const valid = { id: 'a', text: 'Hello world', start: 0, end: 3 };
  it('validates all editable fields', () => {
    expect(captionError(valid, 5)).toBeNull();
    expect(captionError({ ...valid, text: ' ' }, 5)).toMatch(/text/);
    expect(captionError({ ...valid, start: NaN }, 5)).toMatch(/valid/);
    expect(captionError({ ...valid, start: -1 }, 5)).toMatch(/negative/);
    expect(captionError({ ...valid, start: 3 }, 5)).toMatch(/after/);
    expect(captionError({ ...valid, end: 6 }, 5)).toMatch(/past/);
  });
  it('formats time without losing millisecond rollover', () => {
    expect(subtitleTime(59.9999, 'srt')).toBe('00:01:00,000');
    expect(subtitleTime(3661.25, 'vtt')).toBe('01:01:01.250');
    expect(formatTime(65)).toBe('01:05');
    expect(formatTime(NaN)).toBe('00:00');
  });
  it('sorts output without mutating the caption list', () => {
    const captions = [{ ...valid, id: 'b', text: 'Second', start: 4, end: 6 }, valid];
    const output = exportCaptions(captions, 'srt');
    expect(output).toBe(
      '1\n00:00:00,000 --> 00:00:03,000\nHello world\n\n2\n00:00:04,000 --> 00:00:06,000\nSecond\n',
    );
    expect(captions[0].id).toBe('b');
  });
  it('exports Unicode and escapes WebVTT markup', () => {
    const output = exportCaptions([{ ...valid, text: 'आपकी कहानी <3 & you' }], 'vtt');
    expect(output).toContain('WEBVTT\n\n');
    expect(output).toContain('आपकी कहानी &lt;3 &amp; you');
    expect(exportCaptions([{ ...valid, text: 'एक\n\nदो --> तीन' }], 'srt')).toContain('एक\nदो → तीन');
  });
});
