import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  ArrowLeft,
  Captions,
  CircleHelp,
  FileVideo,
  Film,
  FolderOpen,
  List,
  LockKeyhole,
  Maximize,
  Merge,
  Pause,
  Play,
  Plus,
  Redo2,
  Repeat2,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Undo2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { Project } from './App';
import CaptionOverlay from './CaptionOverlay';
import StylePanel from './StylePanel';
import SpeechPanel from './SpeechPanel';
import WordTimings from './WordTimings';
import CaptionLanguagePanel from './CaptionLanguagePanel';
import CaptionTextArea from './CaptionTextArea';
import {
  prepareTranscript,
  projectCaption,
  editLineText,
  splitCaption,
  mergeCaptions,
  applyTranslation,
  hasEnglish,
} from './language/transcript';
import { useTranslation } from './language/useTranslation';
import { useImprove } from './language/useImprove';
import { useTranscription } from './speech/useTranscription';
import { MODELS, recommendedTier, type ModelTier, type SpeechLanguage } from './speech/config';
import {
  captionError,
  editCaption,
  fonts,
  formatTime,
  getActiveCaption,
  presets,
  shiftCaptions,
  type Caption,
  type CaptionStyle,
  type CaptionView,
} from './captions';

type Props = {
  project: Project;
  language: SpeechLanguage;
  onLanguage: (language: SpeechLanguage) => void;
  onUpload: () => void;
  onHome: () => void;
  notify: (message: string) => void;
  registerExport: (action: () => void) => void;
  onExport: (captions: Caption[], duration: number, style: CaptionStyle) => void;
};

export default function Editor({
  project,
  language,
  onLanguage,
  onUpload,
  onHome,
  notify,
  registerExport,
  onExport,
}: Props) {
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [loop, setLoop] = useState(false);
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [tier, setTier] = useState<ModelTier>(() => {
    try {
      const saved = localStorage.getItem('capto-model-tier');
      // A saved choice wins; otherwise pick per language (Accurate for Hindi/Hinglish).
      return saved === 'accurate' || saved === 'fast' ? saved : recommendedTier(language);
    } catch {
      return recommendedTier(language);
    }
  });
  // If the user hasn't pinned a tier, follow the language: switching to Hindi should not
  // silently keep the small model that we know mishears it.
  const tierPinned = useRef(false);
  useEffect(() => {
    try {
      tierPinned.current = localStorage.getItem('capto-model-tier') !== null;
    } catch {
      tierPinned.current = false;
    }
  }, []);
  useEffect(() => {
    if (!tierPinned.current) setTier(recommendedTier(language));
  }, [language]);
  const [requestedView, setOutputView] = useState<CaptionView>(language);
  // An undo/structural edit may invalidate English text. Never display raw Hindi under an
  // English label while waiting for a fresh text-only translation.
  const outputView =
    requestedView === 'english' && captions.some((c) => c.sourceLanguage === 'hindi') && !hasEnglish(captions)
      ? 'hindi'
      : requestedView;
  const displayCaptions = captions.map((c) => projectCaption(c, outputView));
  /** Seconds to shift every caption; positive = captions appear later. Applied to preview and all exports. */
  const [syncOffset, setSyncOffset] = useState(0);
  const syncedCaptions = shiftCaptions(displayCaptions, syncOffset, duration);
  const [preset, setPreset] = useState(project.preset);
  const [style, setStyle] = useState<CaptionStyle>(() => ({
    ...(presets.find((p) => p.id === project.preset) || presets[0]).style,
    ...(project.sample === 'hindi'
      ? { font: fonts.find((f) => f.name.startsWith('Noto Sans Devanagari'))!.value, uppercase: false }
      : {}),
  }));
  const [selected, setSelected] = useState('');
  const [tab, setTab] = useState('preview');
  const [mediaError, setMediaError] = useState('');
  const [ratio, setRatio] = useState(9 / 16);
  const [undo, setUndo] = useState<Caption[][]>([]);
  const [redo, setRedo] = useState<Caption[][]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef(0);
  const active = getActiveCaption(syncedCaptions, time);
  const invalid = captions.filter((c) => captionError(c, duration));
  const transcription = useTranscription((next, spokenLanguage) => {
    commit(prepareTranscript(next, spokenLanguage));
    setOutputView(spokenLanguage);
    if (spokenLanguage === 'hindi') {
      setStyle((s) => ({
        ...s,
        font: fonts.find((f) => f.name.startsWith('Noto Sans Devanagari'))!.value,
        uppercase: false,
      }));
      setPreset('');
    }
    if (spokenLanguage === 'hinglish') setStyle((s) => ({ ...s, font: fonts[0].value, uppercase: false }));
    setSelected(next[0]?.id || '');
    seek(next[0]?.start || 0);
    notify(`Generated ${next.length} captions with word timing. Please review before exporting.`);
  });
  const translation = useTranslation((lines) => {
    commit(applyTranslation(captions, lines));
    setOutputView('english');
  });
  const ai = useImprove();
  const editingLocked = transcription.busy || translation.busy || ai.busy || !!ai.proposal;

  useEffect(() => {
    timeRef.current = time;
  }, [time]);
  useEffect(() => {
    registerExport(() => onExport(syncedCaptions, duration, style));
  }, [captions, outputView, duration, syncOffset, style, registerExport, onExport]);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    // Read the real playhead every frame so short words are not limited by timeupdate's ~4 Hz rate.
    const tick = () => {
      if (videoRef.current) setTime(videoRef.current.currentTime);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const seek = useCallback(
    (seconds: number) => {
      const next = Math.max(0, Math.min(duration, seconds));
      if (videoRef.current) videoRef.current.currentTime = next;
      timeRef.current = next;
      setTime(next);
    },
    [duration],
  );

  const togglePlayback = useCallback(() => {
    if (!duration || mediaError) return;
    if (videoRef.current) {
      if (playing) videoRef.current.pause();
      else {
        if (videoRef.current.currentTime >= duration) videoRef.current.currentTime = 0;
        videoRef.current
          .play()
          .catch(() =>
            notify('Playback couldn’t start. This video codec may not be supported by your browser.'),
          );
      }
    }
  }, [duration, mediaError, project.demo, playing, notify]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (
        document.querySelector('dialog[open]') ||
        (event.target as HTMLElement).closest('input, textarea, select, button, [contenteditable]') ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      )
        return;
      if (event.code === 'Space') {
        event.preventDefault();
        togglePlayback();
      }
      if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
        event.preventDefault();
        seek(timeRef.current + (event.code === 'ArrowLeft' ? -5 : 5));
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [togglePlayback, seek]);

  function commit(next: Caption[]) {
    setUndo((previous) => [...previous.slice(-39), captions]);
    setRedo([]);
    setCaptions(next);
  }
  function updateCaption(id: string, key: 'text' | 'start' | 'end', value: string | number) {
    commit(
      captions.map((c) =>
        c.id === id
          ? key === 'text'
            ? editLineText(c, String(value), outputView)
            : { ...editCaption(c, key, value), translation: undefined }
          : c,
      ),
    );
  }
  function addCaption() {
    if (!duration) return;
    const start = +Math.max(0, Math.min(time, duration - 0.1)).toFixed(2);
    const id = crypto.randomUUID();
    commit([
      ...captions,
      {
        id,
        text: '',
        start,
        end: +Math.min(duration, start + 3).toFixed(2),
        sourceLanguage: outputView === 'english' ? 'english' : 'hindi',
      },
    ]);
    setSelected(id);
    setTab('captions');
    setTimeout(() => document.getElementById(`text-${id}`)?.focus(), 20);
  }
  function generateCaptions() {
    if (!project.url || editingLocked) return;
    if (
      captions.length &&
      !window.confirm(
        'Generate a new transcript? Your captions will only be replaced after success. You can undo the replacement.',
      )
    )
      return;
    if (tier === 'accurate') {
      const spec = MODELS.accurate;
      const deviceMemory = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
      const memoryLine =
        deviceMemory !== undefined && deviceMemory < spec.minMemoryGB
          ? ` This device reports ~${deviceMemory} GB RAM, below the ~${spec.minMemoryGB} GB this model usually needs; it may fail or crash the tab.`
          : '';
      if (
        !window.confirm(
          `Use the accurate model? First use downloads about ${spec.downloadMB} MB and runs several times slower than the fast model on this device.${memoryLine} Continue?`,
        )
      )
        return;
    }
    videoRef.current?.pause();
    void transcription.generate(project.url, duration, language, tier);
  }
  function applyPreset(id: string) {
    const next = presets.find((p) => p.id === id);
    if (!next) return;
    setPreset(id);
    setStyle({ ...next.style, font: style.font });
  }
  function undoCaption() {
    if (!undo.length) return;
    setRedo([...redo, captions]);
    setCaptions(undo[undo.length - 1]);
    setUndo(undo.slice(0, -1));
  }
  function redoCaption() {
    if (!redo.length) return;
    setUndo([...undo, captions]);
    setCaptions(redo[redo.length - 1]);
    setRedo(redo.slice(0, -1));
  }
  function splitLine(id: string, after: number) {
    try {
      const index = captions.findIndex((c) => c.id === id);
      const split = splitCaption(captions[index], after);
      commit([...captions.slice(0, index), ...split, ...captions.slice(index + 1)]);
      setSelected(split[1].id);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not split this line.');
    }
  }
  function mergeLine(index: number) {
    try {
      const merged = mergeCaptions(captions[index], captions[index + 1]);
      commit([...captions.slice(0, index), merged, ...captions.slice(index + 2)]);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not merge these lines.');
    }
  }

  return (
    <main id="main" className={`studio-main mobile-tab-${tab}`}>
      <div className="studio-titlebar">
        <div className="studio-title">
          <button className="icon-button" onClick={onHome} aria-label="Back to upload">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1>
              Your caption studio<span>.</span>
            </h1>
            <p>A little polish. A lot of personality.</p>
          </div>
        </div>
        <div className="studio-status">
          <LockKeyhole size={13} />
          <span>Your video stays on your device</span>
          <span className="status-dot" />
          <strong>{project.demo ? 'Demo project' : 'Local project'}</strong>
        </div>
      </div>
      <div className="mobile-editor-tabs" aria-label="Editor panels">
        {[
          { id: 'preview', label: 'Preview', icon: <Film size={16} /> },
          { id: 'captions', label: 'Captions', icon: <Captions size={16} /> },
          { id: 'style', label: 'Style', icon: <SlidersHorizontal size={16} /> },
        ].map((t) => (
          <button key={t.id} aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>
      <div className="studio-layout">
        <section className="captions-panel panel" aria-label="Editable captions">
          <div className="panel-heading">
            <div>
              <Captions size={19} />
              <h2>Captions</h2>
              <span className="count-badge">{captions.length}</span>
            </div>
            <div className="history-controls">
              <button
                className="icon-button"
                onClick={undoCaption}
                disabled={!undo.length || editingLocked}
                aria-label="Undo caption edit"
              >
                <Undo2 size={15} />
              </button>
              <button
                className="icon-button"
                onClick={redoCaption}
                disabled={!redo.length || editingLocked}
                aria-label="Redo caption edit"
              >
                <Redo2 size={15} />
              </button>
            </div>
          </div>
          <SpeechPanel
            language={language}
            onLanguage={onLanguage}
            tier={tier}
            onTier={(next) => {
              setTier(next);
              tierPinned.current = true;
              try {
                localStorage.setItem('capto-model-tier', next);
              } catch {
                /* preference is optional */
              }
            }}
            duration={duration}
            mediaError={!!mediaError}
            state={transcription.state}
            elapsed={transcription.elapsed}
            onGenerate={generateCaptions}
            onCancel={transcription.cancel}
            onDismiss={transcription.dismiss}
            hasCaptions={captions.length > 0}
            locked={translation.busy || ai.busy || !!ai.proposal}
          />
          {captions.length > 0 && (
            <CaptionLanguagePanel
              captions={captions}
              view={outputView}
              onView={(view) => {
                setOutputView(view);
                setStyle((s) => ({ ...s, uppercase: false }));
              }}
              disabled={editingLocked}
              translating={translation.busy}
              translationMessage={translation.message}
              onCancelTranslation={translation.cancel}
              onTranslate={() => {
                if (
                  window.confirm(
                    'Create an English TRANSLATION of the caption text locally? This downloads a separate translation model once. No video or audio is processed again. Translation preserves line timing, not word alignment.',
                  )
                )
                  translation.translate(captions);
              }}
              ai={ai}
              onApplyAi={() => {
                const next = ai.accept();
                if (next) commit(next);
              }}
            />
          )}
          <div className="caption-list">
            {!captions.length && (
              <div className="empty-captions">
                <span>
                  <Captions size={28} />
                </span>
                <h3>Your story starts here.</h3>
                <p>
                  Choose the spoken language and generate a transcript on your device, or write your own
                  captions below.
                </p>
                <button
                  className="button button-quiet"
                  disabled={!duration || editingLocked}
                  onClick={addCaption}
                >
                  <Plus size={16} /> Add first caption
                </button>
                <small>
                  {project.demo
                    ? 'This demo has synthesized speech. Captions are generated from its audio, not prefilled.'
                    : 'Your audio is processed here, not uploaded.'}
                </small>
              </div>
            )}
            {displayCaptions.map((caption, i) => {
              const error = captionError(caption, duration);
              return (
                <div
                  key={caption.id}
                  className={`caption-item ${selected === caption.id ? 'selected' : ''} ${active?.id === caption.id ? 'active' : ''} ${error ? 'has-error' : ''}`}
                  onFocus={() => setSelected(caption.id)}
                >
                  <div className="caption-item-head">
                    <button
                      className="caption-number"
                      onClick={() => {
                        setSelected(caption.id);
                        seek(caption.start);
                      }}
                      aria-label={`Seek to caption ${i + 1}`}
                    >
                      {active?.id === caption.id ? (
                        <Play size={10} fill="currentColor" />
                      ) : (
                        `${i + 1}`.padStart(2, '0')
                      )}
                    </button>
                    <span>
                      {active?.id === caption.id
                        ? 'NOW SHOWING'
                        : `CAPTION ${String(i + 1).padStart(2, '0')}`}
                    </span>
                    <button
                      className="icon-button delete-caption"
                      aria-label={`Delete caption ${i + 1}`}
                      disabled={editingLocked}
                      onClick={() => commit(captions.filter((c) => c.id !== caption.id))}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <CaptionTextArea
                    id={`text-${caption.id}`}
                    aria-label={`Caption ${i + 1} text`}
                    value={caption.text}
                    disabled={editingLocked}
                    lang={/[\u0900-\u097f]/u.test(caption.text) ? 'hi' : 'en'}
                    placeholder="Type your caption…"
                    rows={2}
                    maxLength={500}
                    onCommit={(value) => updateCaption(caption.id, 'text', value)}
                    spellCheck={false}
                  />
                  <div className="caption-times">
                    <label>
                      <span>Start</span>
                      <input
                        type="number"
                        disabled={editingLocked}
                        step="0.1"
                        min="0"
                        max={duration}
                        value={Number.isFinite(caption.start) ? caption.start : ''}
                        aria-label={`Caption ${i + 1} start time`}
                        aria-invalid={!!error}
                        onChange={(e) =>
                          updateCaption(caption.id, 'start', e.target.value === '' ? NaN : +e.target.value)
                        }
                      />
                      <span>s</span>
                    </label>
                    <span className="time-arrow">→</span>
                    <label>
                      <span>End</span>
                      <input
                        type="number"
                        disabled={editingLocked}
                        step="0.1"
                        min="0"
                        max={duration}
                        value={Number.isFinite(caption.end) ? caption.end : ''}
                        aria-label={`Caption ${i + 1} end time`}
                        aria-invalid={!!error}
                        onChange={(e) =>
                          updateCaption(caption.id, 'end', e.target.value === '' ? NaN : +e.target.value)
                        }
                      />
                      <span>s</span>
                    </label>
                  </div>
                  {error && <p className="caption-error">{error}</p>}
                  <WordTimings
                    caption={captions[i]}
                    view={outputView}
                    index={i}
                    disabled={editingLocked}
                    onChange={(next) => commit(captions.map((c) => (c.id === next.id ? next : c)))}
                    onSplit={(after) => splitLine(caption.id, after)}
                  />
                  {i < captions.length - 1 && (
                    <button
                      className="merge-caption"
                      disabled={editingLocked || caption.timingSource === 'translation'}
                      onClick={() => mergeLine(i)}
                      aria-label={`Merge caption ${i + 1} with next`}
                    >
                      <Merge size={12} /> Merge with next line
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <div className="caption-panel-footer">
            <button className="add-caption" disabled={!duration || editingLocked} onClick={addCaption}>
              <Plus size={16} /> Add caption<span>{formatTime(time)}</span>
            </button>
            <p>
              <CircleHelp size={12} /> Click a line number to jump to that moment.
            </p>
          </div>
        </section>
        <section className="preview-panel" aria-label="Video preview and timeline">
          <div className="preview-toolbar">
            <span>
              <span className="status-dot" /> LIVE PREVIEW
            </span>
            <span>{`${Math.round(ratio * 100) / 100}:1`}</span>
            <button
              className="text-button"
              onClick={() => {
                setTime(0);
                seek(0);
              }}
            >
              <RotateCcw size={12} /> Restart
            </button>
          </div>
          <div className="preview-stage">
            <div
              ref={frameRef}
              className={`video-frame ${project.demo ? 'demo-frame' : ''} ${ratio > 1 ? 'landscape-frame' : ''}`}
              style={{ '--video-ratio': ratio } as CSSProperties}
            >
              {
                <video
                  ref={videoRef}
                  src={project.url!}
                  playsInline
                  preload="metadata"
                  poster={project.demo ? '/images/mountains.jpg' : undefined}
                  muted={muted}
                  loop={loop}
                  onLoadedMetadata={(e) => {
                    const v = e.currentTarget;
                    if (!Number.isFinite(v.duration) || v.duration <= 0) {
                      setMediaError('This file has no readable duration. Try an MP4 (H.264) video.');
                      return;
                    }
                    setDuration(v.duration);
                    setRatio(v.videoWidth / v.videoHeight || 9 / 16);
                    setMediaError('');
                  }}
                  onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onEnded={() => setPlaying(false)}
                  onError={() => {
                    setMediaError(
                      'This browser can’t play this file. Try an MP4 with H.264 video, or another WebM.',
                    );
                    setPlaying(false);
                  }}
                />
              }
              {!mediaError && <CaptionOverlay caption={active} time={time} style={style} />}
              {mediaError ? (
                <div className="media-error" role="alert">
                  <FileVideo size={30} />
                  <strong>Let’s try another take.</strong>
                  <p>{mediaError}</p>
                  <button className="button button-primary" onClick={onUpload}>
                    <FolderOpen size={15} /> Choose another video
                  </button>
                </div>
              ) : !duration ? (
                <div className="video-loading">Loading your video…</div>
              ) : (
                <button
                  className={`preview-play-overlay ${playing ? 'is-playing' : ''}`}
                  onClick={togglePlayback}
                  aria-label={playing ? 'Pause preview' : 'Play preview'}
                >
                  {playing ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
                </button>
              )}
            </div>
          </div>
          <div className="preview-under">
            <span>
              {project.demo
                ? 'Speech demo · Synthesized voice · Local video'
                : 'Original aspect ratio · Local playback'}
            </span>
            <span>
              <Sparkles size={12} /> {presets.find((p) => p.id === preset)?.name || 'Custom style'}
            </span>
          </div>
          <div className="timeline-panel">
            <div className="player-controls">
              <div>
                <button
                  className="icon-button"
                  aria-label={muted ? 'Unmute video' : 'Mute video'}
                  onClick={() => setMuted(!muted)}
                >
                  {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </button>
                <span className="player-time">
                  <strong>{formatTime(time)}</strong>
                  <span> / {formatTime(duration)}</span>
                </span>
              </div>
              <div className="play-controls">
                <button className="icon-button" onClick={() => seek(time - 5)} aria-label="Back 5 seconds">
                  <span className="skip-seconds">−5</span>
                </button>
                <button
                  className="play-button"
                  disabled={!duration || !!mediaError}
                  onClick={togglePlayback}
                  aria-label={playing ? 'Pause' : 'Play'}
                >
                  {playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
                </button>
                <button className="icon-button" onClick={() => seek(time + 5)} aria-label="Forward 5 seconds">
                  <span className="skip-seconds">+5</span>
                </button>
              </div>
              <div>
                <button
                  className={`icon-button ${loop ? 'is-active' : ''}`}
                  aria-label="Loop playback"
                  aria-pressed={loop}
                  onClick={() => setLoop(!loop)}
                >
                  <Repeat2 size={17} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Fullscreen preview"
                  onClick={() => {
                    if (frameRef.current?.requestFullscreen)
                      frameRef.current
                        .requestFullscreen()
                        .catch(() => notify('Fullscreen is not available in this browser.'));
                    else notify('Fullscreen is not available in this browser.');
                  }}
                >
                  <Maximize size={15} />
                </button>
              </div>
            </div>
            <div className="timeline-scrub">
              <input
                type="range"
                aria-label="Video playhead"
                min="0"
                max={duration || 1}
                step="0.01"
                value={time}
                onChange={(e) => seek(+e.target.value)}
                disabled={!duration}
                style={{ '--progress': `${duration ? (time / duration) * 100 : 0}%` } as CSSProperties}
              />
              <div className="timeline-ticks">
                {Array.from({ length: 5 }, (_, i) => (
                  <span key={i}>{formatTime((duration * i) / 4)}</span>
                ))}
              </div>
            </div>
            <div className="timeline-track">
              <span className="track-icon">
                <Film size={14} />
              </span>
              <div
                className="video-strip"
                style={{ backgroundImage: project.demo ? 'url(/images/mountains.jpg)' : undefined }}
              >
                {!project.demo && <span>{project.name}</span>}
              </div>
            </div>
            <div className="timeline-track caption-track">
              <span className="track-icon">
                <Captions size={15} />
              </span>
              <div className="caption-track-inner">
                {syncedCaptions
                  .filter((c) => !captionError(c, duration))
                  .map((c) => (
                    <button
                      key={c.id}
                      className={`timeline-caption ${active?.id === c.id ? 'active' : ''}`}
                      style={{
                        left: `${(c.start / duration) * 100}%`,
                        width: `${((c.end - c.start) / duration) * 100}%`,
                      }}
                      title={c.text}
                      aria-label={`Jump to ${c.text}`}
                      onClick={() => {
                        setSelected(c.id);
                        seek(c.start);
                      }}
                    >
                      {c.text}
                    </button>
                  ))}
                <div
                  className="timeline-playhead"
                  style={{ left: `${duration ? (time / duration) * 100 : 0}%` }}
                />
              </div>
            </div>
            <div className="timeline-footer">
              <span>
                <List size={11} /> {captions.length} caption lines
              </span>
              <label className="sync-control" title="Shift every caption earlier or later to fix audio sync">
                <span>Sync</span>
                <input
                  type="range"
                  min="-2"
                  max="2"
                  step="0.05"
                  value={syncOffset}
                  aria-label="Caption sync offset in seconds"
                  onChange={(e) => setSyncOffset(+e.target.value)}
                  onDoubleClick={() => setSyncOffset(0)}
                />
                <output aria-live="polite">
                  {syncOffset === 0 ? 'in sync' : `${syncOffset > 0 ? '+' : ''}${syncOffset.toFixed(2)}s`}
                </output>
                {syncOffset !== 0 && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setSyncOffset(0)}
                    aria-label="Reset sync offset"
                  >
                    reset
                  </button>
                )}
              </label>
              <span>
                <kbd>space</kbd> play / pause
              </span>
            </div>
          </div>
        </section>
        <StylePanel
          style={style}
          preset={preset}
          onChange={(next) => {
            setStyle(next);
            setPreset('');
          }}
          onPreset={applyPreset}
        />
      </div>
      <div className="studio-bottom">
        <span>
          <LockKeyhole size={12} /> Local, private, and all yours.
        </span>
        <span>
          {invalid.length
            ? `${invalid.length} caption${invalid.length > 1 ? 's' : ''} need attention`
            : 'Looking good. Keep creating.'}
        </span>
        <span>Edits live in this tab. Export to keep your captions.</span>
      </div>
    </main>
  );
}
