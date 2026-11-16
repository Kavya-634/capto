import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  Download,
  Globe2,
  Moon,
  Plus,
  Sun,
  X,
} from 'lucide-react';
import Home from './Home';
import Editor from './Editor';
import { captionError, exportCaptions, exportWordTiming, type Caption, type CaptionStyle } from './captions';
import VideoExport from './export/VideoExport';
import type { SpeechLanguage } from './speech/config';

export type Project = {
  name: string;
  url: string | null;
  /** Original upload; needed for burned-in export. Null for demo projects (fetched on demand). */
  file: File | null;
  demo: boolean;
  preset: string;
  sample: 'english' | 'hindi';
};

export function Brand({ onClick }: { onClick: () => void }) {
  return (
    <button className="brand" onClick={onClick} aria-label="Capto home">
      <img src="/favicon.svg" alt="" />
      <span>
        capto<span className="brand-dot">.</span>
      </span>
    </button>
  );
}

export default function App() {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('capto-theme') === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });
  const [language, setLanguage] = useState<SpeechLanguage>('english');
  const [project, setProject] = useState<Project | null>(null);
  const [toast, setToast] = useState('');
  const [exportData, setExportData] = useState<{
    captions: Caption[];
    duration: number;
    style: CaptionStyle;
  } | null>(null);
  const [videoExportOpen, setVideoExportOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const exportButton = useRef<HTMLButtonElement>(null);
  const exportAction = useRef<() => void>(() => {});

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#141518' : '#f8f9f5');
    try {
      localStorage.setItem('capto-theme', theme);
    } catch {
      /* Theme still works without storage. */
    }
  }, [theme]);
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(''), 4500);
    return () => clearTimeout(timeout);
  }, [toast]);
  useEffect(
    () => () => {
      if (project?.url?.startsWith('blob:')) URL.revokeObjectURL(project.url);
    },
    [project],
  );
  useEffect(() => {
    if (exportData) dialogRef.current?.showModal();
    else if (dialogRef.current?.open) dialogRef.current.close();
  }, [exportData]);
  useEffect(() => {
    if (!project) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [project]);

  function openDemo(preset = 'bold', sample: 'english' | 'hindi' = 'english') {
    setLanguage(sample);
    setProject({
      name: sample === 'hindi' ? 'Hindi speech demo' : 'English speech demo',
      url: `/demos/${sample}.mp4`,
      file: null,
      demo: true,
      preset,
      sample,
    });
    window.scrollTo({ top: 0 });
  }
  function upload(file?: File) {
    if (!file) return;
    if (!(file.type.startsWith('video/') || /\.(mp4|mov|webm|m4v)$/i.test(file.name)))
      return setToast('Please choose a video file: MP4, MOV, or WebM.');
    if (!file.size) return setToast('This file is empty. Please choose another video.');
    if (file.size > 250 * 1024 * 1024) return setToast('Please choose a video smaller than 250 MB.');
    if (
      project &&
      !window.confirm('Open a new video? Export your current captions first if you want to keep them.')
    )
      return;
    setProject({
      name: file.name.replace(/\.[^.]+$/, ''),
      url: URL.createObjectURL(file),
      file,
      demo: false,
      preset: 'bold',
      sample: 'english',
    });
    window.scrollTo({ top: 0 });
  }
  function goHome() {
    if (project && !window.confirm('Leave the studio? Unsaved caption edits will be cleared.')) return;
    setProject(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function download(format: 'srt' | 'vtt' | 'json') {
    if (!exportData) return;
    const data =
      format === 'json' ? exportWordTiming(exportData.captions) : exportCaptions(exportData.captions, format);
    const url = URL.createObjectURL(
      new Blob([data], {
        type:
          format === 'json'
            ? 'application/json;charset=utf-8'
            : format === 'vtt'
              ? 'text/vtt;charset=utf-8'
              : 'application/x-subrip;charset=utf-8',
      }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project?.name || 'capto-captions'}.${format}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setExportData(null);
    setToast(`${format.toUpperCase()} captions exported. Your words are ready to go.`);
  }

  return (
    <div className={project ? 'app studio-app' : 'app'}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <input
        ref={fileRef}
        className="sr-only"
        tabIndex={-1}
        type="file"
        accept="video/mp4,video/webm,video/quicktime,.mp4,.mov,.webm,.m4v"
        aria-label="Upload video file"
        onChange={(e) => {
          upload(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <header className={`site-header ${project ? 'studio-header' : ''}`}>
        <div className="header-inner">
          <Brand onClick={goHome} />
          {project ? (
            <div className="project-breadcrumb">
              <span>/</span>
              <span title={project.name}>{project.name}</span>
              <span className="local-chip">LOCAL</span>
            </div>
          ) : (
            <nav className="desktop-nav" aria-label="Main navigation">
              <a href="#how-it-works">How it works</a>
              <a href="#caption-styles">
                Caption styles <span className="nav-count">6</span>
              </a>
              <a href="#for-creators">Made for creators</a>
            </nav>
          )}
          <div className="header-actions">
            {!project && (
              <label className="language-select" title="Spoken language for your next transcription">
                <Globe2 size={16} />
                <span className="sr-only">Transcription language</span>
                <select
                  aria-label="Transcription language"
                  value={language}
                  onChange={(e) => {
                    setLanguage(e.target.value as SpeechLanguage);
                  }}
                >
                  <option value="english">English</option>
                  <option value="hindi">Hindi</option>
                  <option value="hinglish">Hinglish</option>
                </select>
                <ChevronDown size={12} />
              </label>
            )}
            <button
              className="icon-button theme-toggle"
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            >
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            {project ? (
              <>
                <button className="button button-quiet new-video" onClick={() => fileRef.current?.click()}>
                  <Plus size={16} />
                  <span>New video</span>
                </button>
                <button
                  ref={exportButton}
                  className="button button-primary export-button"
                  onClick={() => exportAction.current()}
                >
                  <Download size={16} />
                  <span>Export captions</span>
                </button>
              </>
            ) : (
              <button className="button button-dark header-cta" onClick={() => openDemo()}>
                Open studio <ArrowUpRight size={16} />
              </button>
            )}
          </div>
        </div>
      </header>
      {project ? (
        <Editor
          key={project.url || `${project.preset}-${project.sample}`}
          project={project}
          language={language}
          onLanguage={setLanguage}
          onUpload={() => fileRef.current?.click()}
          onHome={goHome}
          notify={setToast}
          registerExport={(action) => {
            exportAction.current = action;
          }}
          onExport={(captions, duration, style) => {
            if (!captions.length) return setToast('Add at least one caption before exporting.');
            if (captions.some((c) => captionError(c, duration)))
              return setToast('Please fix the highlighted caption text or timing before exporting.');
            setExportData({ captions, duration, style });
          }}
        />
      ) : (
        <Home onUpload={() => fileRef.current?.click()} onDrop={upload} onDemo={openDemo} />
      )}
      <div className={`toast ${toast ? 'visible' : ''}`} role="status" aria-live="polite">
        {toast && (
          <>
            <Check size={17} />
            <span>{toast}</span>
            <button className="icon-button" onClick={() => setToast('')} aria-label="Dismiss notification">
              <X size={15} />
            </button>
          </>
        )}
      </div>
      <dialog
        ref={dialogRef}
        className="export-dialog"
        aria-labelledby="export-title"
        onCancel={() => setExportData(null)}
        onClose={() => {
          setExportData(null);
          exportButton.current?.focus();
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) setExportData(null);
        }}
      >
        <div className="dialog-top">
          <span className="section-kicker">READY FOR THE NEXT STEP</span>
          <button
            className="icon-button"
            onClick={() => setExportData(null)}
            aria-label="Close export dialog"
          >
            <X size={19} />
          </button>
        </div>
        <div className="dialog-icon">
          <Download size={26} />
        </div>
        <h2 id="export-title">Your words, to go.</h2>
        <p>
          Export {exportData?.captions.length} caption lines. Download a video with the captions burned in, or
          a subtitle file for your editor or platform.
        </p>
        <button
          className="export-option export-option-primary"
          onClick={() => {
            setVideoExportOpen(true);
          }}
        >
          <span>
            <strong>Video with captions</strong>
            <small>.MP4 · Captions drawn into the picture, exactly as previewed</small>
          </span>
          <Download size={21} />
        </button>
        <button className="export-option" onClick={() => download('srt')}>
          <span>
            <strong>SubRip captions</strong>
            <small>.SRT · Widely supported</small>
          </span>
          <Download size={21} />
        </button>
        <button className="export-option" onClick={() => download('vtt')}>
          <span>
            <strong>Web captions</strong>
            <small>.VTT · Made for web players</small>
          </span>
          <Download size={21} />
        </button>
        <button className="export-option" onClick={() => download('json')}>
          <span>
            <strong>Word timing data</strong>
            <small>.JSON · Keep line and word alignment</small>
          </span>
          <Download size={21} />
        </button>
        <p className="export-note">
          Subtitle files contain text and timing only; styling lives in the video export. All exports include
          your sync adjustment.
        </p>
        <button className="text-button" onClick={() => setExportData(null)}>
          <ArrowLeft size={14} /> Back to creating
        </button>
      </dialog>
      {exportData && videoExportOpen && project && (
        <VideoExport
          project={project}
          captions={exportData.captions}
          style={exportData.style}
          onClose={() => {
            setVideoExportOpen(false);
          }}
          notify={setToast}
        />
      )}
    </div>
  );
}
