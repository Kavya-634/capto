import { useState } from 'react';
import { ChevronDown, Languages, LoaderCircle, WandSparkles, X } from 'lucide-react';
import type { Caption, CaptionView } from './captions';
import { hasEnglish } from './language/transcript';
import { useImprove } from './language/useImprove';

export default function CaptionLanguagePanel({
  captions,
  view,
  onView,
  onTranslate,
  translating,
  translationMessage,
  onCancelTranslation,
  disabled,
  ai,
  onApplyAi,
}: {
  captions: Caption[];
  view: CaptionView;
  onView: (view: CaptionView) => void;
  onTranslate: () => void;
  translating: boolean;
  translationMessage: string;
  onCancelTranslation: () => void;
  disabled: boolean;
  ai: ReturnType<typeof useImprove>;
  onApplyAi: () => void;
}) {
  const translatedEnglish = view === 'english' && captions.some((c) => c.sourceLanguage === 'hindi');
  // Script tabs are used constantly and stay visible. Translation and AI are occasional tools and
  // live in a collapsed drawer; anything in progress or awaiting review forces the drawer open.
  const [open, setOpen] = useState(false);
  const forcedOpen = translating || ai.busy || !!ai.proposal;
  const expanded = open || forcedOpen;

  return (
    <section
      className={`language-panel ${expanded ? '' : 'is-collapsed'}`}
      aria-label="Caption script and optional text tools"
    >
      <div className="script-row">
        <Languages size={13} aria-hidden="true" />
        <div className="script-tabs" aria-label="Caption format">
          {(
            [
              { value: 'hindi', label: 'हिन्दी' },
              { value: 'hinglish', label: 'Hinglish' },
              { value: 'english', label: 'English' },
            ] as const
          ).map((v) => (
            <button
              key={v.value}
              aria-label={`Show ${v.value} captions`}
              aria-pressed={view === v.value}
              disabled={disabled || (v.value === 'english' && !hasEnglish(captions))}
              onClick={() => onView(v.value)}
              title={
                v.value === 'english' && !hasEnglish(captions)
                  ? 'Create an English translation first (Tools)'
                  : undefined
              }
            >
              {v.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="panel-toggle panel-toggle-compact"
          aria-expanded={expanded}
          aria-controls="language-tools-body"
          disabled={forcedOpen}
          onClick={() => setOpen((o) => !o)}
          title="Translation and AI tools"
        >
          Tools <ChevronDown size={13} className="panel-toggle-chevron" />
        </button>
      </div>

      <div id="language-tools-body" className="panel-body" hidden={!expanded}>
        <p className="script-help">
          {view === 'hinglish'
            ? 'Roman Hindi, not English translation. Original word timing stays intact.'
            : translatedEnglish
              ? 'English translation · line timing only. Hindi/Hinglish keep original word timestamps.'
              : 'Original transcript. Switching scripts does not listen to the video again.'}
        </p>
        {!hasEnglish(captions) && (
          <button className="text-button translate-action" disabled={disabled} onClick={onTranslate}>
            Create English translation locally
          </button>
        )}
        {translating && (
          <button className="cancel-generation" onClick={onCancelTranslation}>
            <X size={13} /> Cancel text translation
          </button>
        )}
        {translationMessage && (
          <p className="text-tool-status" role="status">
            {translationMessage}
          </p>
        )}
        <div className="ai-row">
          <button
            className="button button-quiet improve-button"
            disabled={disabled || !ai.status?.available || translatedEnglish}
            onClick={() => {
              if (
                window.confirm(
                  'Improve with AI sends ONLY the displayed caption words to OpenAI through your configured server. No audio, video, or timestamps are sent. Provider data policies apply. You will review suggestions before applying. Continue?',
                )
              )
                void ai.improve(captions, view);
            }}
          >
            <WandSparkles size={14} /> Improve with AI
          </button>
          <small>Optional</small>
        </div>
        {!ai.status?.available && (
          <p className="script-help">
            AI is not configured. All local tools work without a key. Server setup: README → Optional AI.
          </p>
        )}
        {ai.busy && (
          <button className="cancel-generation" onClick={ai.cancel}>
            <LoaderCircle size={13} className="spin" /> Cancel AI request
          </button>
        )}
        {ai.message && (
          <p className="text-tool-status" role="status">
            {ai.message}
          </p>
        )}
        {ai.proposal && (
          <div className="ai-review" aria-label="AI correction review">
            <strong>{ai.changes.length} suggested changes</strong>
            <ul>
              {ai.changes.slice(0, 60).map((change, i) => (
                <li key={i}>
                  <del>{change.before}</del>
                  <span>→</span>
                  <ins>{change.after}</ins>
                </li>
              ))}
            </ul>
            {ai.changes.length > 60 && <small>Showing first 60 of {ai.changes.length}.</small>}
            <div>
              <button className="button button-primary" onClick={onApplyAi}>
                Apply suggestions
              </button>
              <button className="button button-quiet" onClick={ai.discard}>
                Discard
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
