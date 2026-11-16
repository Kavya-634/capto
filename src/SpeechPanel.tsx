import { useEffect, useState } from 'react';
import {
  CheckCheck,
  ChevronDown,
  Download,
  LoaderCircle,
  Mic2,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import {
  MAX_TRANSCRIPTION_LABEL,
  MODELS,
  durationWarning,
  longClipNotice,
  type ModelTier,
  type SpeechLanguage,
} from './speech/config';
import type { TranscriptionState } from './speech/protocol';

const LANGUAGE_LABEL: Record<SpeechLanguage, string> = {
  english: 'English',
  hindi: 'Hindi · हिन्दी',
  hinglish: 'Hinglish',
};

export default function SpeechPanel({
  language,
  onLanguage,
  tier,
  onTier,
  duration,
  mediaError,
  state,
  elapsed,
  onGenerate,
  onCancel,
  onDismiss,
  hasCaptions,
  locked = false,
}: {
  language: SpeechLanguage;
  onLanguage: (language: SpeechLanguage) => void;
  tier: ModelTier;
  onTier: (tier: ModelTier) => void;
  duration: number;
  mediaError: boolean;
  state: TranscriptionState;
  elapsed: number;
  onGenerate: () => void;
  onCancel: () => void;
  onDismiss: () => void;
  hasCaptions: boolean;
  locked?: boolean;
}) {
  const busy = state.status === 'running';
  const spec = MODELS[tier];
  const modelMB = spec.downloadMB;
  // navigator.deviceMemory is Chromium-only and capped at 8; treat "unknown" as "fine".
  const deviceMemory = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
  const lowMemory = deviceMemory !== undefined && deviceMemory < spec.minMemoryGB;
  const warning = duration > 0 ? durationWarning(duration) : null;
  const longNotice = duration > 0 ? longClipNotice(duration) : null;
  const listenPercent =
    state.stage === 'listening' && state.durationSeconds
      ? Math.min(99, Math.round(((state.processedSeconds || 0) / state.durationSeconds) * 100))
      : undefined;
  const minutes = (seconds: number) =>
    `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
      .toString()
      .padStart(2, '0')}`;
  const stages = {
    decoding: 'Preparing audio…',
    loading: 'Loading speech model…',
    listening: 'Listening…',
    writing: 'Writing captions…',
  };
  const percent = state.total
    ? Math.min(100, Math.round(((state.loaded || 0) / state.total) * 100))
    : undefined;

  // Expanded while there is nothing to edit; collapses itself once captions arrive so the list
  // gets the space. The user can reopen it at any time. Progress and errors force it open.
  const [open, setOpen] = useState(!hasCaptions);
  useEffect(() => {
    if (hasCaptions && state.status === 'complete') setOpen(false);
  }, [hasCaptions, state.status]);
  const forcedOpen = busy || state.status === 'error';
  const expanded = open || forcedOpen;

  return (
    <section className={`speech-panel ${expanded ? '' : 'is-collapsed'}`} aria-label="Caption generation">
      <button
        type="button"
        className="panel-toggle"
        aria-expanded={expanded}
        aria-controls="speech-panel-body"
        disabled={forcedOpen}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="panel-toggle-title">
          <Sparkles size={13} /> Generate
        </span>
        <span className="panel-toggle-summary">
          {LANGUAGE_LABEL[language]} · {tier === 'accurate' ? 'Accurate' : 'Fast'}
        </span>
        <ChevronDown size={14} className="panel-toggle-chevron" />
      </button>

      <div id="speech-panel-body" className="panel-body" hidden={!expanded}>
        <div className="speech-heading">
          <span className="speech-local">
            <ShieldCheck size={12} /> On device · nothing uploaded
          </span>
        </div>
        <label className="field-label" htmlFor="speech-language">
          Spoken language
        </label>
        <select
          id="speech-language"
          value={language}
          disabled={busy || locked}
          onChange={(e) => onLanguage(e.target.value as SpeechLanguage)}
        >
          <option value="english">English → English</option>
          <option value="hindi">Hindi → हिन्दी</option>
          <option value="hinglish">Hinglish → Hindi in English letters</option>
        </select>
        <label className="field-label" htmlFor="speech-model">
          Recognition quality
        </label>
        <select
          id="speech-model"
          value={tier}
          disabled={busy || locked}
          onChange={(e) => onTier(e.target.value as ModelTier)}
        >
          {(Object.keys(MODELS) as ModelTier[]).map((t) => (
            <option key={t} value={t}>
              {MODELS[t].label}
            </option>
          ))}
        </select>
        <p className="model-note">{spec.note}</p>
        {lowMemory && !busy && (
          <p className="speech-warning" role="note">
            This device reports about {deviceMemory} GB of memory. The accurate model needs roughly{' '}
            {spec.minMemoryGB} GB free and may fail or crash the tab here. The fast model is safer.
          </p>
        )}
        {busy && (
          <div className="generation-progress" aria-busy="true">
            <div className="generation-status" role="status">
              <LoaderCircle size={16} className="spin" />
              <strong>{stages[state.stage || 'decoding']}</strong>
              <span>{elapsed}s</span>
            </div>
            {state.stage === 'listening' && listenPercent !== undefined ? (
              <>
                <progress aria-label="Transcription progress" max="100" value={listenPercent} />
                <small>
                  {minutes(state.processedSeconds || 0)} of {minutes(state.durationSeconds || 0)} heard ·{' '}
                  {listenPercent}%{state.tokens ? ` · ${state.tokens} tokens` : ''}
                </small>
              </>
            ) : state.stage === 'loading' && state.loaded !== undefined ? (
              <>
                <progress aria-label="Speech model download" max="100" value={percent} />
                <small>
                  <Download size={11} /> {(state.loaded / 1e6).toFixed(1)} MB loaded
                  {percent !== undefined ? ` · ${percent}% of current files` : ''}
                </small>
              </>
            ) : (
              <div className="indeterminate-track" aria-hidden="true">
                <span />
              </div>
            )}
            <p>
              {state.stage === 'loading'
                ? `First use of this model downloads about ${modelMB} MB. Your video stays here. The model can be cached by your browser.`
                : state.stage === 'listening' && (state.durationSeconds || 0) > 90
                  ? 'Working locally through your clip in short windows. Long clips can take longer than their own runtime. Keep this tab open.'
                  : 'Working locally, not recording your microphone. This may take several minutes. Keep this tab open.'}
            </p>
            <button className="cancel-generation" onClick={onCancel}>
              <X size={13} /> Cancel generation
            </button>
          </div>
        )}
        {warning && (
          <p className="speech-warning" role="note">
            {warning}
          </p>
        )}
        {!warning && longNotice && !busy && (
          <p className="speech-notice" role="note">
            {longNotice}
          </p>
        )}
        {!busy && (
          <p className="speech-footnote">
            Whisper · ~{modelMB} MB first download · {MAX_TRANSCRIPTION_LABEL} max
            <br />
            {language !== 'english'
              ? 'Hindi draft quality varies; our tests needed substantial corrections. Review every caption.'
              : 'Automatic text and word timing need a human review.'}
          </p>
        )}
      </div>

      {/* Result of the last run lives outside the collapsible settings: it must stay visible and
          dismissible whether or not the user has the settings open. */}
      {!busy && state.status !== 'idle' && (
        <div
          className={`generation-result result-${state.status}`}
          role={state.status === 'error' ? 'alert' : 'status'}
        >
          <div className="generation-result-head">
            {state.status === 'complete' && <CheckCheck size={15} />}
            <p>{state.message}</p>
            <button
              type="button"
              className="icon-button dismiss-result"
              aria-label="Dismiss generation result"
              title="Dismiss"
              onClick={onDismiss}
            >
              <X size={13} />
            </button>
          </div>
          {state.warnings?.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      )}

      {/* The action stays visible whether or not the settings are expanded. */}
      {!busy && (
        <button
          className="button button-primary generate-button"
          disabled={!duration || !!warning || mediaError || locked}
          onClick={onGenerate}
        >
          <Mic2 size={16} /> {hasCaptions ? 'Regenerate Captions' : 'Generate Captions'}
        </button>
      )}
    </section>
  );
}
