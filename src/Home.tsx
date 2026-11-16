import { useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  Captions,
  Check,
  CheckCheck,
  Clapperboard,
  FileVideo,
  Heart,
  LockKeyhole,
  MousePointer2,
  Play,
  Plus,
  Sparkles,
  Upload,
  WandSparkles,
} from 'lucide-react';
import { presets } from './captions';

type Props = {
  onUpload: () => void;
  onDrop: (file?: File) => void;
  onDemo: (preset?: string, sample?: 'english' | 'hindi') => void;
};

export function PresetPreview({ id }: { id: string }) {
  return (
    <div className={`preset-preview preset-${id}`} aria-hidden="true">
      {id === 'bold' && (
        <span>
          MAKE IT
          <br />
          <em>HAPPEN.</em>
        </span>
      )}
      {id === 'word' && (
        <span>
          unstoppable<span className="word-period">.</span>
        </span>
      )}
      {id === 'karaoke' && (
        <span>
          find <em>your</em> rhythm
        </span>
      )}
      {id === 'minimal' && <span>less, but better.</span>}
      {id === 'boxed' && <span>outside the box.</span>}
      {id === 'neon' && <span>main character</span>}
    </div>
  );
}

export default function Home({ onUpload, onDrop, onDemo }: Props) {
  const [dragging, setDragging] = useState(false);
  return (
    <main id="main">
      <section className="hero page-width">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="status-dot" /> YOUR WORDS. MAIN CHARACTER ENERGY.
          </div>
          <h1>
            Good videos.
            <br />
            Great{' '}
            <span className="underlined">
              captions.
              <svg viewBox="0 0 400 20" aria-hidden="true">
                <path d="M4 14Q180 -4 393 10M50 19Q210 6 350 16" />
              </svg>
            </span>
          </h1>
          <p className="hero-description">
            Make every word worth watching. Turn your videos into scroll-stopping stories with captions that
            feel like <em>you.</em>
          </p>
          <div
            className={`upload-zone ${dragging ? 'dragging' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              onDrop(e.dataTransfer.files[0]);
            }}
          >
            <div className="upload-zone-top">
              <span className="upload-symbol">
                <Upload size={23} strokeWidth={1.7} />
              </span>
              <div>
                <strong>
                  {dragging ? 'Drop it like it’s a great video.' : 'Your next great video starts here'}
                </strong>
                <span>Drag & drop a video, or choose a file</span>
              </div>
            </div>
            <button className="button button-primary upload-button" onClick={onUpload}>
              <Plus size={19} /> Upload your video <ArrowUpRight size={18} />
            </button>
            <div className="upload-meta">
              <span>MP4, MOV, WebM</span>
              <span className="meta-dot">·</span>
              <span>Up to 250 MB</span>
              <span className="local-upload">
                <LockKeyhole size={11} /> Stays on your device
              </span>
            </div>
          </div>
          <div className="demo-link-row">
            <span>Just looking around?</span>
            <button className="text-button" onClick={() => onDemo()}>
              <Play size={13} fill="currentColor" /> Try a demo project <ArrowRight size={15} />
            </button>
          </div>
          <div className="hero-benefits">
            <span>
              <Check size={14} /> No sign-up
            </span>
            <span>
              <Check size={14} /> No watermarks
            </span>
            <span>
              <Check size={14} /> All your creative control
            </span>
          </div>
        </div>
        <div className="hero-visual" aria-label="Creative caption examples on scenic video previews">
          <div className="visual-grid" />
          <div className="orbit-label label-top">
            <span>
              <Sparkles size={14} /> A little caption. A big difference.
            </span>
            <svg viewBox="0 0 55 44" aria-hidden="true">
              <path d="M2 2C40 0 45 15 33 38m0 0-2-12m2 12 11-5" />
            </svg>
          </div>
          <div className="reel-card reel-left">
            <img src="/images/adventure.jpg" alt="Sunlit green hills" />
            <div className="reel-tag">
              <span className="record-dot" /> THE LITTLE THINGS
            </div>
            <div className="left-caption">
              romanticize
              <br />
              <span>your life.</span>
            </div>
            <span className="reel-watermark">CAPTO ORIGINALS</span>
          </div>
          <div className="reel-card reel-right">
            <img src="/images/ocean.jpg" alt="Rolling ocean waves" />
            <span className="reel-tag">SOUND ON. WORLD OFF.</span>
            <div className="right-caption" lang="hi">
              बस <span>जी लो।</span>
            </div>
            <div className="reel-bottom">
              <Heart size={15} />
              <span>made of moments</span>
            </div>
          </div>
          <button
            className="reel-card reel-main"
            onClick={() => onDemo()}
            aria-label="Open the adventure caption demo"
          >
            <img src="/images/mountains.jpg" alt="Dramatic mountain peaks beneath a cloudy sky" />
            <span className="reel-tag">
              <span className="record-dot" /> YOUR NEXT ADVENTURE
            </span>
            <span className="main-caption">
              GO WHERE
              <br />
              YOU FEEL
              <br />
              <span>ALIVE.</span>
            </span>
            <span className="reel-play">
              <Play size={16} fill="currentColor" />
            </span>
            <span className="reel-duration">
              00:06 <AudioLines size={19} />
            </span>
          </button>
          <div className="float-chip style-chip">
            <div className="chip-icon">
              <WandSparkles size={17} />
            </div>
            <div>
              <span>YOUR VIBE, ONE CLICK AWAY</span>
              <strong>
                Bold & Punchy <CheckCheck size={14} />
              </strong>
            </div>
          </div>
          <div className="float-chip language-chip">
            <span className="hindi-letter" lang="hi">
              अ
            </span>
            <span>
              English. हिन्दी.
              <br />
              <strong>And everything in between.</strong>
            </span>
          </div>
          <div className="mini-timeline">
            <span className="mini-time">00:06</span>
            <div className="mini-wave">
              {Array.from({ length: 33 }, (_, i) => (
                <i key={i} style={{ height: `${7 + ((i * 17 + 13) % 24)}px` }} />
              ))}
            </div>
            <div className="mini-caption-block">
              <Captions size={13} /> Go where you feel alive.
            </div>
            <div className="mini-playhead" />
          </div>
          <div className="creator-cursor">
            <MousePointer2 size={25} fill="#7856ef" />
            <span>You, but captioned.</span>
          </div>
        </div>
      </section>
      <div className="platform-strip page-width">
        <span>
          A SMALL EDIT.
          <br />
          <strong>A WHOLE NEW FEEL.</strong>
        </span>
        <div>
          <Clapperboard size={19} /> Reels that hit
        </div>
        <div>
          <Play size={18} /> Shorts with a story
        </div>
        <div>
          <Captions size={20} /> Content for everyone
        </div>
        <a href="#caption-styles">
          Find your style <ArrowDown size={15} />
        </a>
      </div>
      <section className="styles-section page-width" id="caption-styles">
        <div className="section-heading">
          <div>
            <span className="section-kicker">SIX STYLES. ENDLESS POSSIBILITIES.</span>
            <h2>
              Same words. <span>Different energy.</span>
            </h2>
          </div>
          <p>
            Pick a starting point. Make it your own.
            <br />
            Your signature style is one click away.
          </p>
        </div>
        <div className="preset-grid">
          {presets.map((preset, i) => (
            <button className="preset-card" key={preset.id} onClick={() => onDemo(preset.id)}>
              <PresetPreview id={preset.id} />
              <div className="preset-card-title">
                <h3>{preset.name}</h3>
                <ArrowUpRight size={17} />
              </div>
              <p>{preset.description}</p>
              <span className="preset-index">0{i + 1}</span>
            </button>
          ))}
        </div>
        <p className="styles-footnote">
          <Sparkles size={13} /> All styles are customizable. No rules, just your vibe.
        </p>
      </section>
      <section className="how-section page-width" id="how-it-works">
        <div className="section-heading">
          <div>
            <span className="section-kicker">LESS FRICTION. MORE CREATION.</span>
            <h2>
              From a clip to <span>can’t skip.</span>
            </h2>
          </div>
          <span className="handwritten">
            It's your story. Own it. <ArrowUpRight size={21} />
          </span>
        </div>
        <div className="steps-grid">
          {[
            {
              icon: <FileVideo size={23} />,
              title: 'Drop your video',
              text: 'That clip on your camera roll? Give it a little main character treatment.',
            },
            {
              icon: <Captions size={24} />,
              title: 'Put it into words',
              text: 'Generate English or Hindi captions on your device, then review every word and its timing.',
            },
            {
              icon: <WandSparkles size={24} />,
              title: 'Make it unmistakably you',
              text: 'Find your font, pick a preset, and export your captions. Creative control is yours.',
            },
          ].map((step, i) => (
            <div className="step" key={step.title}>
              <div className="step-top">
                <span>{step.icon}</span>
                <span>0{i + 1}</span>
              </div>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="creator-section page-width" id="for-creators">
        <div className="creator-copy">
          <span className="section-kicker">YOUR VOICE. EVERY SCRIPT.</span>
          <h2>
            Stories don’t have
            <br />a language barrier.
          </h2>
          <p>
            From “let’s go” to “चलो चलें” — make your words look as good as they sound. With beautiful English
            and Devanagari fonts, there’s room for every kind of creator.
          </p>
          <button className="button button-dark" onClick={() => onDemo('boxed', 'hindi')}>
            Try the Hindi demo <ArrowUpRight size={17} />
          </button>
          <small>
            On-device English and Hindi transcription. Up to 5 minutes.
            <br />
            Automatic captions aren’t perfect — review before sharing.
          </small>
        </div>
        <div className="script-art" aria-hidden="true">
          <span className="script-one">your story.</span>
          <span className="script-two" lang="hi">
            आपकी कहानी।
          </span>
          <span className="script-three">apna moment.</span>
          <span className="script-spark">✳</span>
        </div>
      </section>
      <footer className="site-footer page-width">
        <a className="footer-logo" href="#main">
          capto<span>.</span>
        </a>
        <p>A little text. A lot more you.</p>
        <span>
          Made for the ones who make things <Heart size={13} />
        </span>
        <button className="text-button" onClick={onUpload}>
          Let’s create <ArrowUpRight size={16} />
        </button>
      </footer>
    </main>
  );
}
