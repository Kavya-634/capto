import type { CSSProperties } from 'react';
import { activeWordIndex, wordTimedAnimations, type Caption, type CaptionStyle } from './captions';

/** Fraction (0–1) of the active word's interval that has elapsed; drives the typewriter. */
function wordProgress(caption: Caption, index: number, time: number) {
  if (index < 0) return 0;
  const words = caption.words;
  if (words?.length) {
    const w = words[index];
    return Math.min(1, Math.max(0, (time - w.start) / Math.max(0.01, w.end - w.start)));
  }
  const count = caption.text.trim().split(/\s+/u).length;
  const slot = Math.max(0.01, caption.end - caption.start) / count;
  return Math.min(1, Math.max(0, (time - caption.start - index * slot) / slot));
}

/** Pick a highlight that actually contrasts when the user has set text and highlight to the same colour. */
function effectiveHighlight(text: string, highlight: string) {
  if (text.toLowerCase() !== highlight.toLowerCase()) return highlight;
  const n = parseInt(text.slice(1), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? '#7856ef' : '#d4fc79';
}

export default function CaptionOverlay({
  caption,
  time,
  style,
}: {
  caption?: Caption;
  time: number;
  style: CaptionStyle;
}) {
  if (!caption) return null;
  const words = caption.words?.map((w) => w.text) || caption.text.trim().split(/\s+/u);
  const index = activeWordIndex(caption, time);
  const wordTimed = wordTimedAnimations.has(style.animation);
  const css = {
    fontFamily: style.font,
    fontSize: `${style.size / 3.6}cqw`,
    color: style.color,
    fontWeight: style.bold ? 800 : 500,
    textTransform: style.uppercase ? 'uppercase' : 'none',
    WebkitTextStroke: `${style.outline / 3.6}cqw ${style.outlineColor}`,
    textShadow: style.neon
      ? `0 0 6px ${style.color}, 0 0 18px ${style.color}, 0 0 32px ${style.color}`
      : '0 2px 10px #0005',
    '--caption-bg': style.background ? style.backgroundColor : 'transparent',
    '--highlight': effectiveHighlight(style.color, style.highlight),
    '--caption-color': style.color,
  } as CSSProperties;

  // Word-timed effects. Each word is its own span so it can be shown, hidden, scaled or lifted
  // independently according to its real (or fallback) interval.
  const renderWords = () =>
    words.map((word, i) => {
      const state = i < index ? 'past' : i === index ? 'active' : 'future';
      let content: string = word;
      if (style.animation === 'typewriter') {
        if (state === 'future') content = '';
        else if (state === 'active') {
          const chars = Array.from(word);
          const shown = Math.max(1, Math.ceil(wordProgress(caption, index, time) * chars.length));
          content = chars.slice(0, shown).join('');
        }
      }
      return (
        <span key={i} className={`w w-${state}`} data-word={word}>
          {content}
          {i < words.length - 1 ? ' ' : ''}
        </span>
      );
    });

  return (
    <div
      className={`caption-overlay position-${style.position}`}
      aria-hidden="true"
      data-testid="caption-overlay"
    >
      <div
        // Keyed per caption so line-entry animations replay when the line changes. Word-timed
        // effects use per-word spans inside, so the active word changing never remounts the line.
        key={`${caption.id}-${style.animation}`}
        className={`caption-text animation-${style.animation} ${wordTimed ? 'word-timed' : ''}`}
        style={css}
      >
        {style.animation === 'word' ? (
          index < 0 ? null : (
            <span key={index} className="single-word">
              {words[index]}
            </span>
          )
        ) : style.animation === 'karaoke' ? (
          words.map((word, i) => (
            <span key={i} className={i === index ? 'karaoke-active' : ''}>
              {word}
              {i < words.length - 1 ? ' ' : ''}
            </span>
          ))
        ) : wordTimed ? (
          renderWords()
        ) : (
          <span>{caption.text}</span>
        )}
      </div>
    </div>
  );
}
