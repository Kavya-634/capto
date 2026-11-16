import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Download, Film, LoaderCircle, X } from 'lucide-react';
import type { Caption, CaptionStyle } from '../captions';
import type { Project } from '../App';
import {
  burnInCaptions,
  planExport,
  type ExportPlan,
  type ExportProgress,
  type ExportResult,
} from './burnIn';

type Phase =
  | { kind: 'planning' }
  | { kind: 'ready'; plan: ExportPlan; file: Blob }
  | { kind: 'encoding'; plan: ExportPlan; progress: ExportProgress }
  | { kind: 'done'; result: ExportResult; url: string }
  | { kind: 'error'; message: string };

function fmtTime(s: number) {
  if (!Number.isFinite(s)) return '—';
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return m ? `${m}m ${r.toString().padStart(2, '0')}s` : `${r}s`;
}
function fmtMB(bytes: number) {
  return `${(bytes / 1e6).toFixed(1)} MB`;
}

export default function VideoExport({
  project,
  captions,
  style,
  onClose,
  notify,
}: {
  project: Project;
  captions: Caption[];
  style: CaptionStyle;
  onClose: () => void;
  notify: (message: string) => void;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: 'planning' });
  const controller = useRef<AbortController | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const urlRef = useRef<string | null>(null);

  // Sync offset is already applied by the Editor to the captions it hands us; nothing to do here.

  useEffect(() => {
    dialog.current?.showModal();
    let cancelled = false;
    (async () => {
      try {
        // Demo projects have no File; fetch the static asset so the same code path is exercised.
        const file = project.file ?? (await (await fetch(project.url!)).blob());
        const plan = await planExport(file);
        if (!cancelled) setPhase({ kind: 'ready', plan, file });
      } catch (e) {
        if (!cancelled)
          setPhase({
            kind: 'error',
            message: e instanceof Error ? e.message : 'Could not inspect this video.',
          });
      }
    })();
    return () => {
      cancelled = true;
      controller.current?.abort();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, [project]);

  async function start(plan: ExportPlan, file: Blob) {
    const abort = new AbortController();
    controller.current = abort;
    setPhase({
      kind: 'encoding',
      plan,
      progress: {
        stage: 'probing',
        fraction: 0,
        processedSeconds: 0,
        durationSeconds: plan.durationSeconds,
        elapsedSeconds: 0,
        framesRendered: 0,
      },
    });
    try {
      const result = await burnInCaptions({
        file,
        captions,
        style,
        syncOffset: 0,
        plan,
        signal: abort.signal,
        onProgress: (progress) => setPhase((p) => (p.kind === 'encoding' ? { ...p, progress } : p)),
      });
      const url = URL.createObjectURL(result.blob);
      urlRef.current = url;
      setPhase({ kind: 'done', result, url });
    } catch (e) {
      if (abort.signal.aborted) {
        setPhase({ kind: 'ready', plan, file });
        notify('Video export cancelled. Nothing was saved.');
      } else {
        setPhase({ kind: 'error', message: e instanceof Error ? e.message : 'Video export failed.' });
      }
    } finally {
      controller.current = null;
    }
  }

  function save(result: ExportResult, url: string) {
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name || 'capto'}-captioned.${result.plan.container}`;
    a.click();
    notify(`Captioned video saved (${fmtMB(result.blob.size)}).`);
  }

  function close() {
    controller.current?.abort();
    onClose();
  }

  const busy = phase.kind === 'encoding';

  return (
    <dialog
      ref={dialog}
      className="export-dialog video-export-dialog"
      aria-labelledby="video-export-title"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else close();
      }}
      onClose={close}
    >
      <div className="dialog-top">
        <span className="section-kicker">VIDEO WITH CAPTIONS</span>
        <button className="icon-button" onClick={close} aria-label="Close video export" disabled={busy}>
          <X size={19} />
        </button>
      </div>
      <div className="dialog-icon">
        <Film size={26} />
      </div>
      <h2 id="video-export-title">Burn it in.</h2>

      {phase.kind === 'planning' && (
        <p className="export-status">
          <LoaderCircle size={14} className="spin" /> Inspecting your video…
        </p>
      )}

      {phase.kind === 'error' && (
        <>
          <div className="export-error" role="alert">
            <AlertTriangle size={16} />
            <p>{phase.message}</p>
          </div>
          <p className="export-note">You can still download SRT or VTT subtitles from the previous screen.</p>
          <button className="button button-quiet" onClick={close}>
            Back
          </button>
        </>
      )}

      {(phase.kind === 'ready' || phase.kind === 'encoding') && (
        <dl className="export-plan">
          <div>
            <dt>Output</dt>
            <dd>
              {phase.plan.width}×{phase.plan.height}
              {phase.plan.frameRate ? ` · ${phase.plan.frameRate.toFixed(2)} fps` : ''} ·{' '}
              {fmtTime(phase.plan.durationSeconds)}
            </dd>
          </div>
          <div>
            <dt>Video</dt>
            <dd>
              {phase.plan.targetVideoCodec.toUpperCase()} in {phase.plan.container.toUpperCase()} ·{' '}
              {(phase.plan.targetBitrate / 1e6).toFixed(1)} Mbps
            </dd>
          </div>
          <div>
            <dt>Audio</dt>
            <dd>
              {phase.plan.audioCopied
                ? `Copied unchanged (${phase.plan.sourceAudioCodec ?? 'original'})`
                : 'None in source'}
            </dd>
          </div>
          <div>
            <dt>Captions</dt>
            <dd>{captions.length} lines · current style and sync</dd>
          </div>
        </dl>
      )}

      {phase.kind === 'ready' && (
        <>
          <ul className="export-notes">
            {phase.plan.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          <p className="export-note">
            Everything runs in this tab. Expect roughly real-time or slower depending on resolution; keep the
            tab open.
          </p>
          <div className="export-actions">
            <button className="button button-primary" onClick={() => start(phase.plan, phase.file)}>
              <Film size={15} /> Start export
            </button>
            <button className="button button-quiet" onClick={close}>
              Cancel
            </button>
          </div>
        </>
      )}

      {phase.kind === 'encoding' && (
        <div className="export-progress" aria-busy="true">
          <div className="generation-status" role="status">
            <LoaderCircle size={16} className="spin" />
            <strong>
              {phase.progress.stage === 'probing'
                ? 'Starting…'
                : phase.progress.stage === 'finalizing'
                  ? 'Finalizing file…'
                  : 'Rendering captions into video…'}
            </strong>
            <span>{Math.round(phase.progress.fraction * 100)}%</span>
          </div>
          <progress
            aria-label="Video export progress"
            max="100"
            value={Math.round(phase.progress.fraction * 100)}
          />
          <small>
            {fmtTime(phase.progress.processedSeconds)} of {fmtTime(phase.progress.durationSeconds)} ·{' '}
            {phase.progress.framesRendered} frames · elapsed {fmtTime(phase.progress.elapsedSeconds)}
            {phase.progress.etaSeconds !== undefined
              ? ` · about ${fmtTime(phase.progress.etaSeconds)} left`
              : ' · estimating…'}
          </small>
          <button className="cancel-generation" onClick={() => controller.current?.abort()}>
            <X size={13} /> Cancel export
          </button>
        </div>
      )}

      {phase.kind === 'done' && (
        <>
          <div className="export-done" role="status">
            <Check size={16} />
            <p>
              Done in {fmtTime(phase.result.seconds)} · {phase.result.frames} frames ·{' '}
              {fmtMB(phase.result.blob.size)}
            </p>
          </div>
          <video className="export-preview" src={phase.url} controls playsInline />
          <div className="export-actions">
            <button className="button button-primary" onClick={() => save(phase.result, phase.url)}>
              <Download size={15} /> Save video
            </button>
            <button className="button button-quiet" onClick={close}>
              Close
            </button>
          </div>
          <p className="export-note">
            Check a few captions in the preview above before sharing — especially Hindi/Hinglish spelling.
          </p>
        </>
      )}
    </dialog>
  );
}
