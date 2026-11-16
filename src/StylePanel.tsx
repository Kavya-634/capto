import { useState } from 'react';
import {
  AlignCenter,
  ArrowDownToLine,
  ArrowUpToLine,
  Bookmark,
  Check,
  ChevronDown,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  animations,
  fonts,
  presets,
  wordTimedAnimations,
  type Animation,
  type CaptionStyle,
} from './captions';
import { PresetPreview } from './Home';
import ColorField from './ColorField';
import { stylePresets, type SavedPreset } from './export/presets';

export default function StylePanel({
  style,
  preset,
  onChange,
  onPreset,
}: {
  style: CaptionStyle;
  preset: string;
  onChange: (style: CaptionStyle) => void;
  onPreset: (id: string) => void;
}) {
  function change<K extends keyof CaptionStyle>(key: K, value: CaptionStyle[K]) {
    onChange({ ...style, [key]: value });
  }
  const fontGroups = [...new Set(fonts.map((f) => f.group))];
  const animationGroups = [...new Set(animations.map((a) => a.group))];
  const currentAnimation = animations.find((a) => a.value === style.animation);
  const currentFont = fonts.find((f) => f.value === style.font);
  const [saved, setSaved] = useState<SavedPreset[]>(() => stylePresets.list());
  const [savingName, setSavingName] = useState<string | null>(null);
  const [saveError, setSaveError] = useState('');
  const refresh = () => setSaved(stylePresets.list());
  function savePreset() {
    const r = stylePresets.save(savingName ?? '', style);
    if (r.ok) {
      setSavingName(null);
      setSaveError('');
      refresh();
    } else setSaveError(r.reason);
  }
  return (
    <aside className="style-panel panel" aria-label="Caption style controls">
      <div className="panel-heading">
        <div>
          <SlidersHorizontal size={17} />
          <h2>Make it yours</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Reset caption style"
          title="Reset to selected preset"
          onClick={() => onPreset(preset || 'bold')}
        >
          <RotateCcw size={15} />
        </button>
      </div>
      <div className="style-scroll">
        <div className="control-heading">
          <span>
            <Sparkles size={13} /> PRESETS
          </span>
          <small>Start with a vibe</small>
        </div>
        <div className="editor-preset-grid">
          {presets.map((p) => (
            <button
              key={p.id}
              className={`editor-preset ${preset === p.id ? 'selected' : ''}`}
              onClick={() => onPreset(p.id)}
              aria-pressed={preset === p.id}
            >
              <PresetPreview id={p.id} />
              <span>{p.name}</span>
              {preset === p.id && (
                <i className="preset-check">
                  <Check size={10} />
                </i>
              )}
            </button>
          ))}
        </div>
        <div className="control-divider" />
        <div className="control-heading">
          <span>
            <Bookmark size={13} /> MY PRESETS
          </span>
          <small>Saved on this device</small>
        </div>
        {saved.length > 0 && (
          <ul className="saved-presets" aria-label="Saved style presets">
            {saved.map((p) => (
              <li key={p.id}>
                <button
                  className="saved-preset"
                  onClick={() => onChange({ ...p.style })}
                  aria-label={`Apply saved preset ${p.name}`}
                  title={`${p.style.animation} · ${p.style.size}px`}
                >
                  <span
                    className="saved-preset-swatch"
                    style={{
                      background: p.style.background ? p.style.backgroundColor : '#2b2f36',
                      color: p.style.color,
                      fontFamily: p.style.font,
                      WebkitTextStroke: p.style.outline ? `0.5px ${p.style.outlineColor}` : undefined,
                    }}
                    aria-hidden="true"
                  >
                    Aa
                  </span>
                  <span>{p.name}</span>
                </button>
                <button
                  className="icon-button"
                  aria-label={`Delete saved preset ${p.name}`}
                  onClick={() => {
                    if (window.confirm(`Delete preset “${p.name}”?`)) {
                      stylePresets.remove(p.id);
                      refresh();
                    }
                  }}
                >
                  <Trash2 size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {savingName === null ? (
          <button className="button button-quiet save-preset" onClick={() => setSavingName('')}>
            <Bookmark size={14} /> Save current style as preset
          </button>
        ) : (
          <form
            className="save-preset-form"
            onSubmit={(e) => {
              e.preventDefault();
              savePreset();
            }}
          >
            <input
              autoFocus
              type="text"
              maxLength={40}
              placeholder="Preset name"
              aria-label="New preset name"
              value={savingName}
              onChange={(e) => setSavingName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setSavingName(null);
              }}
            />
            <button type="submit" className="button button-primary">
              Save
            </button>
            <button type="button" className="button button-quiet" onClick={() => setSavingName(null)}>
              Cancel
            </button>
            {saveError && <p className="caption-error">{saveError}</p>}
          </form>
        )}
        <div className="control-divider" />
        <div className="control-heading">
          <span>TYPOGRAPHY</span>
          <small>{preset ? 'Fine-tune your style' : 'Custom style'}</small>
        </div>
        <label className="field-label" htmlFor="caption-font">
          Font family
        </label>
        <div className="select-wrap">
          <select id="caption-font" value={style.font} onChange={(e) => change('font', e.target.value)}>
            {fontGroups.map((group) => (
              <optgroup label={group} key={group}>
                {fonts
                  .filter((f) => f.group === group)
                  .map((font) => (
                    <option value={font.value} key={font.name}>
                      {font.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          <ChevronDown size={13} />
        </div>
        <p className="font-hint" style={{ fontFamily: style.font }}>
          Aa <span lang="hi">अ आ</span>{' '}
          <span>
            {currentFont?.group === 'Latin + Devanagari'
              ? 'Hindi and English in one design'
              : 'Hindi falls back to a matching Devanagari face'}
          </span>
        </p>
        <div className="range-label">
          <label htmlFor="font-size">Font size</label>
          <output htmlFor="font-size">{style.size} px</output>
        </div>
        <input
          type="range"
          id="font-size"
          min="16"
          max="60"
          value={style.size}
          onChange={(e) => change('size', +e.target.value)}
        />
        <div className="type-toggles">
          <button
            className={style.bold ? 'selected' : ''}
            aria-pressed={style.bold}
            onClick={() => change('bold', !style.bold)}
          >
            <b>B</b> Bold
          </button>
          <button
            className={style.uppercase ? 'selected' : ''}
            aria-pressed={style.uppercase}
            onClick={() => change('uppercase', !style.uppercase)}
          >
            <b>AA</b> Uppercase
          </button>
        </div>
        <ColorField
          id="text-color"
          label="Text color"
          value={style.color}
          onChange={(v) => change('color', v)}
        />
        <div className="control-divider" />
        <div className="control-heading">
          <span>THE FINISHING TOUCHES</span>
        </div>
        <div className="range-label">
          <label htmlFor="outline-size">Outline</label>
          <output htmlFor="outline-size">{style.outline} px</output>
        </div>
        <input
          id="outline-size"
          type="range"
          min="0"
          max="5"
          step="0.5"
          value={style.outline}
          onChange={(e) => change('outline', +e.target.value)}
        />
        <ColorField
          id="outline-color"
          label="Outline color"
          value={style.outlineColor}
          onChange={(v) => change('outlineColor', v)}
          compact
        />
        <div className="switch-field">
          <span id="background-label">Text background</span>
          <button
            className={`switch ${style.background ? 'on' : ''}`}
            role="switch"
            aria-checked={style.background}
            aria-labelledby="background-label"
            onClick={() => change('background', !style.background)}
          >
            <span />
          </button>
        </div>
        {style.background && (
          <ColorField
            id="background-color"
            label="Background color"
            value={style.backgroundColor}
            onChange={(v) => change('backgroundColor', v)}
          />
        )}
        <div className="switch-field">
          <span id="glow-label">Neon glow</span>
          <button
            className={`switch ${style.neon ? 'on' : ''}`}
            role="switch"
            aria-checked={style.neon}
            aria-labelledby="glow-label"
            onClick={() => change('neon', !style.neon)}
          >
            <span />
          </button>
        </div>
        <span className="field-label">Position</span>
        <div className="position-control">
          {(
            [
              { value: 'top', icon: <ArrowUpToLine size={16} />, label: 'Top' },
              { value: 'center', icon: <AlignCenter size={16} />, label: 'Center' },
              { value: 'bottom', icon: <ArrowDownToLine size={16} />, label: 'Bottom' },
            ] as const
          ).map((p) => (
            <button
              key={p.value}
              className={style.position === p.value ? 'selected' : ''}
              aria-pressed={style.position === p.value}
              onClick={() => change('position', p.value)}
            >
              {p.icon}
              <span>{p.label}</span>
            </button>
          ))}
        </div>
        <label className="field-label" htmlFor="caption-animation">
          Animation
        </label>
        <div className="select-wrap">
          <select
            id="caption-animation"
            value={style.animation}
            onChange={(e) => change('animation', e.target.value as Animation)}
          >
            {animationGroups.map((group) => (
              <optgroup label={group} key={group}>
                {animations
                  .filter((a) => a.group === group)
                  .map((a) => (
                    <option value={a.value} key={a.value}>
                      {a.label}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          <ChevronDown size={13} />
        </div>
        {currentAnimation && <p className="animation-hint">{currentAnimation.hint}</p>}
        {(style.animation === 'karaoke' || style.animation === 'wave' || style.animation === 'word-pop') && (
          <ColorField
            id="highlight-color"
            label="Highlight color"
            value={style.highlight}
            onChange={(v) => change('highlight', v)}
          />
        )}
        <p className="style-help">
          {wordTimedAnimations.has(style.animation)
            ? 'This effect follows each word’s timing. Generated captions use model-aligned intervals; manual or edited lines split the caption evenly. Review word timings in the caption list.'
            : 'This effect plays once when each caption line appears.'}
        </p>
      </div>
    </aside>
  );
}
