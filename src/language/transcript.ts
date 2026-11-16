import { toHinglish } from './romanize';
import { type Caption, type CaptionView, type CaptionWord } from '../captions';

export function ensureWords(caption: Caption): Caption {
  if (caption.words?.length) return caption;
  const text = caption.text.trim().split(/\s+/u).filter(Boolean);
  if (
    !text.length ||
    !Number.isFinite(caption.start) ||
    !Number.isFinite(caption.end) ||
    caption.end <= caption.start
  )
    return caption;
  const slot = (caption.end - caption.start) / text.length;
  return {
    ...caption,
    timingSource: 'estimated',
    words: text.map((word, i) => ({
      text: word,
      start: caption.start + i * slot,
      end: caption.start + (i + 1) * slot,
    })),
  };
}

export function prepareTranscript(
  captions: Caption[],
  language: 'english' | 'hindi' | 'hinglish',
): Caption[] {
  const sourceLanguage = language === 'english' ? 'english' : 'hindi';
  return captions.map((raw) => {
    const c = ensureWords(raw);
    const words = c.words?.map((w) => ({
      ...w,
      forms: {
        hindi: w.text,
        hinglish: toHinglish(w.text),
        ...(sourceLanguage === 'english' ? { english: w.text } : {}),
      },
    }));
    return { ...c, words, sourceLanguage };
  });
}

export function visibleWord(word: CaptionWord, view: CaptionView) {
  return word.forms?.[view] ?? (view === 'hinglish' ? toHinglish(word.text) : word.text);
}
export function projectCaption(caption: Caption, view: CaptionView): Caption {
  if (view === 'english' && caption.sourceLanguage === 'hindi') {
    if (caption.translation?.sourceText === caption.text)
      return {
        ...caption,
        text: caption.translation.text,
        words: undefined,
        originalWords: caption.words,
        timingSource: 'translation',
      };
    // UI blocks this projection until all translations exist; never label romanised Hindi English.
    return caption;
  }
  const words = caption.words?.map((w) => ({ ...w, text: visibleWord(w, view) }));
  return {
    ...caption,
    text:
      words?.map((w) => w.text).join(' ') ?? (view === 'hinglish' ? toHinglish(caption.text) : caption.text),
    words,
  };
}
export function hasEnglish(captions: Caption[]) {
  return (
    captions.length > 0 &&
    captions.every((c) => c.sourceLanguage !== 'hindi' || c.translation?.sourceText === c.text)
  );
}

export function editWordText(caption: Caption, index: number, text: string, view: CaptionView): Caption {
  const c = ensureWords(caption);
  if (!c.words?.[index]) return caption;
  const words = c.words.map((w, i) => {
    if (i !== index) return w;
    const forms = { ...w.forms, [view]: text };
    const editsSource = (view === 'english' && c.sourceLanguage !== 'hindi') || view === 'hindi';
    if (editsSource) {
      forms.hindi = text;
      forms.hinglish = toHinglish(text);
    }
    return { ...w, text: editsSource ? text : w.text, forms };
  });
  return { ...c, words, text: words.map((w) => w.text).join(' '), translation: undefined };
}

/** A same-count line edit is a spelling edit: preserve the original word intervals. */
export function editLineText(caption: Caption, text: string, view: CaptionView): Caption {
  if (view === 'english' && caption.sourceLanguage === 'hindi')
    return { ...caption, translation: { text, sourceText: caption.text } };
  const tokens = text.trim().split(/\s+/u);
  const c = ensureWords(caption);
  if (c.words?.length === tokens.length) {
    return tokens.reduce((next, token, i) => editWordText(next, i, token, view), c);
  }
  // Structural free-text rewrites cannot keep an honest one-to-one alignment. Keep the old
  // source as the other script where possible; label the newly allocated timing estimated.
  const next = ensureWords({
    ...c,
    text,
    words: undefined,
    translation: undefined,
    timingSource: 'estimated',
  });
  return {
    ...next,
    words: next.words?.map((w) => ({
      ...w,
      forms: { [view]: w.text, hinglish: toHinglish(w.text), hindi: w.text },
    })),
  };
}

export function splitCaption(caption: Caption, afterWord: number): [Caption, Caption] {
  const c = ensureWords(caption);
  if (!c.words || afterWord < 1 || afterWord >= c.words.length)
    throw new Error('Choose a split between two words.');
  const left = c.words.slice(0, afterWord),
    right = c.words.slice(afterWord);
  const build = (words: CaptionWord[], id: string): Caption => ({
    ...c,
    id,
    text: words.map((w) => w.text).join(' '),
    words,
    start: words[0].start,
    end: words.at(-1)!.end,
    translation: undefined,
  });
  return [build(left, c.id), build(right, `${c.id}-split-${crypto.randomUUID()}`)];
}

export function mergeCaptions(first: Caption, second: Caption): Caption {
  const a = ensureWords(first),
    b = ensureWords(second);
  if (!a.words?.length || !b.words?.length)
    throw new Error('Add text and valid timing to both lines before merging.');
  if (a.words.at(-1)!.end > b.words[0].start)
    throw new Error('These lines overlap or are out of order. Fix their timing before merging.');
  const words = [...a.words, ...b.words];
  return {
    ...a,
    words,
    text: words.map((w) => w.text).join(' '),
    start: a.start,
    end: b.end,
    translation: undefined,
  };
}

export function applyTranslation(captions: Caption[], translations: { id: string; text: string }[]) {
  return captions.map((c) => {
    const t = translations.find((t) => t.id === c.id);
    return t ? { ...c, translation: { text: t.text, sourceText: c.text } } : c;
  });
}
