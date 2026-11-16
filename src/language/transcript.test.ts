import { describe, it, expect } from 'vitest';
import { toHinglish } from './romanize';
import {
  prepareTranscript,
  projectCaption,
  editWordText,
  editLineText,
  splitCaption,
  mergeCaptions,
  applyTranslation,
  hasEnglish,
} from './transcript';
import { captionError, type Caption } from '../captions';

const source: Caption = {
  id: 'line',
  text: 'आज हम सीखेंगे बहुत मस्त चीज़।',
  start: 0.2,
  end: 3.8,
  timingSource: 'model',
  words: ['आज', 'हम', 'सीखेंगे', 'बहुत', 'मस्त', 'चीज़।'].map((text, i) => ({
    text,
    start: 0.2 + i * 0.6,
    end: 0.6 + i * 0.6,
  })),
};
describe('casual Hinglish transliteration', () => {
  it('romanises Hindi without translating its meaning', () => {
    expect(toHinglish(source.text)).toBe('aaj hum seekhenge bahut mast cheez.');
    expect(toHinglish('आपकी कहानी दुनिया तक पहुँचाइए।')).toBe('aapki kahani duniya tak pahunchaiye.');
  });
  it('preserves existing English words, casing, digits, punctuation and URLs', () => {
    expect(toHinglish('आज video upload करो और Save पर click करो।')).toBe(
      'aaj video upload karo aur Save par click karo.',
    );
    expect(toHinglish('React v19 https://example.com 25%')).toBe('React v19 https://example.com 25%');
    expect(toHinglish('एडिटिंग कैमरा क्वालिटी')).toBe('editing camera quality');
  });
  it('handles nukta and conjuncts without leaving Devanagari characters in fallback words', () => {
    for (const s of ['ज़िन्दगी', 'क्षमता', 'प्रकाश', 'कृष्ण', 'संपर्क', '१२३'])
      expect(toHinglish(s)).not.toMatch(/[\u0900-\u097f]/u);
    expect(toHinglish('आवाज़')).toBe(toHinglish('आवाज'));
    expect(toHinglish('१२३')).toBe('123');
  });
});
describe('lossless script projection and editing', () => {
  const original = prepareTranscript([source], 'hinglish')[0];
  it('keeps every source word interval bit-for-bit across 50 script switches', () => {
    const before = JSON.stringify(original);
    for (let i = 0; i < 50; i++)
      for (const view of ['hindi', 'hinglish'] as const) {
        const projected = projectCaption(original, view);
        expect(projected.words!.map((w) => [w.start, w.end])).toEqual(
          source.words!.map((w) => [w.start, w.end]),
        );
        expect(captionError(projected, 5)).toBeNull();
      }
    expect(JSON.stringify(original)).toBe(before);
  });
  it('edits one Roman word without changing source Hindi or timestamps', () => {
    const next = editWordText(original, 4, 'awesome', 'hinglish');
    expect(projectCaption(next, 'hinglish').text).toContain('awesome');
    expect(projectCaption(next, 'hindi').text).toBe(source.text);
    expect(next.words![4].start).toBe(original.words![4].start);
    expect(next.words![4].end).toBe(original.words![4].end);
  });
  it('propagates Hindi spelling edits to local romanisation without losing word alignment', () => {
    const next = editWordText(original, 4, 'अच्छी', 'hindi');
    expect(projectCaption(next, 'hinglish').text).toContain('achhi');
    expect(next.words!.map((w) => [w.start, w.end])).toEqual(original.words!.map((w) => [w.start, w.end]));
  });
  it('preserves alignment on same-count line rewrites but labels count-changing edits estimated', () => {
    expect(
      editLineText(original, 'आज हम सीखेंगे बहुत अच्छी चीज़।', 'hindi').words!.map((w) => [w.start, w.end]),
    ).toEqual(source.words!.map((w) => [w.start, w.end]));
    expect(editLineText(original, 'एक नई कहानी', 'hindi').timingSource).toBe('estimated');
  });
  it('splits and merges without losing scripts or intervals', () => {
    const changed = editWordText(original, 2, 'seekhenge', 'hinglish');
    const [a, b] = splitCaption(changed, 3);
    expect(a.words).toHaveLength(3);
    expect(b.words).toHaveLength(3);
    const merged = mergeCaptions(a, b);
    expect(merged.words).toEqual(changed.words);
    expect(projectCaption(merged, 'hinglish').text).toBe(projectCaption(changed, 'hinglish').text);
    expect(() => mergeCaptions(b, a)).toThrow(/overlap|order/);
  });
  it('keeps English translation separate and does not invent its word alignment', () => {
    expect(hasEnglish([original])).toBe(false);
    const translated = applyTranslation(
      [original],
      [{ id: 'line', text: 'Today we will learn something cool.' }],
    );
    expect(hasEnglish(translated)).toBe(true);
    const english = projectCaption(translated[0], 'english');
    expect(english.words).toBeUndefined();
    expect(english.originalWords).toEqual(original.words);
    expect([english.start, english.end]).toEqual([source.start, source.end]);
    expect(projectCaption(translated[0], 'hinglish').text).toBe('aaj hum seekhenge bahut mast cheez.');
    expect(hasEnglish([editWordText(translated[0], 0, 'कल', 'hindi')])).toBe(false);
  });
});
