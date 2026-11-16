import { Scissors } from 'lucide-react';
import type { Caption, CaptionView } from './captions';
import { editWordText, ensureWords, visibleWord } from './language/transcript';

export default function WordTimings({
  caption,
  index,
  disabled,
  onChange,
  onSplit,
  view,
}: {
  caption: Caption;
  index: number;
  disabled: boolean;
  onChange: (caption: Caption) => void;
  onSplit: (after: number) => void;
  view: CaptionView;
}) {
  if (view === 'english' && caption.sourceLanguage === 'hindi')
    return (
      <p className="timing-source">
        English translation · line timing only. Switch to Hindi/Hinglish to edit original timed words.
      </p>
    );
  if (!caption.words?.length)
    return (
      <div>
        <p className="timing-source">
          Even word timing
          {caption.timingSource === 'estimated' ? ' · edited/manual caption' : ' · manual caption'}
        </p>
        {caption.text.trim() && (
          <button className="text-button" disabled={disabled} onClick={() => onChange(ensureWords(caption))}>
            Set up editable words (estimated timing)
          </button>
        )}
      </div>
    );
  return (
    <details className="word-timings">
      <summary>
        {caption.timingSource === 'estimated'
          ? 'Estimated'
          : caption.timingSource === 'edited'
            ? 'Edited'
            : 'Model-aligned'}{' '}
        word timings <span>{caption.words.length} words</span>
      </summary>
      <p>Edit a word without moving its timestamps. Use scissors to split the line after that word.</p>
      {caption.words.map((word, wordIndex) => (
        <div className="word-timing-row" key={wordIndex}>
          <span className="sr-only">{visibleWord(word, view)}</span>
          <input
            className="word-text-input"
            aria-label={`Caption ${index + 1} word ${wordIndex + 1} text`}
            value={visibleWord(word, view)}
            maxLength={120}
            disabled={disabled}
            lang={view === 'hindi' ? 'hi' : 'en'}
            onChange={(e) => onChange(editWordText(caption, wordIndex, e.target.value, view))}
          />
          {(['start', 'end'] as const).map((key) => (
            <input
              key={key}
              type="number"
              min={caption.start}
              max={caption.end}
              step="0.01"
              disabled={disabled}
              value={Number.isFinite(word[key]) ? word[key] : ''}
              aria-label={`Caption ${index + 1} word ${wordIndex + 1} ${key}`}
              onChange={(e) =>
                onChange({
                  ...caption,
                  timingSource: 'edited',
                  words: caption.words!.map((w, j) =>
                    j === wordIndex ? { ...w, [key]: e.target.value === '' ? NaN : +e.target.value } : w,
                  ),
                })
              }
            />
          ))}
          <button
            type="button"
            className="icon-button split-word"
            disabled={disabled || wordIndex === caption.words!.length - 1}
            onClick={() => onSplit(wordIndex + 1)}
            aria-label={`Split caption ${index + 1} after word ${wordIndex + 1}`}
            title="Split line here"
          >
            <Scissors size={13} />
          </button>
        </div>
      ))}
    </details>
  );
}
