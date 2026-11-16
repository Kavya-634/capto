import { useEffect, useState } from 'react';
import { Check, Pipette } from 'lucide-react';
import { palette } from './captions';

type EyeDropperResult = { sRGBHex: string };
type EyeDropperCtor = new () => { open: (opts?: { signal?: AbortSignal }) => Promise<EyeDropperResult> };

function eyeDropper(): EyeDropperCtor | null {
  const w = window as unknown as { EyeDropper?: EyeDropperCtor };
  return typeof w.EyeDropper === 'function' ? w.EyeDropper : null;
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
function normalizeHex(input: string): string | null {
  const v = input.trim().replace(/^(?!#)/, '#');
  if (!HEX.test(v)) return null;
  if (v.length === 4) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`.toLowerCase();
  return v.toLowerCase();
}

/** Readable check-mark colour for a swatch. */
function onColor(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#1a1a1f' : '#ffffff';
}

export default function ColorField({
  id,
  label,
  value,
  onChange,
  compact = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (hex: string) => void;
  /** Hide the palette row (used for secondary colours like outline). */
  compact?: boolean;
}) {
  const [draft, setDraft] = useState(value.toUpperCase());
  const [picking, setPicking] = useState(false);
  const [pickError, setPickError] = useState('');
  const dropper = eyeDropper();

  useEffect(() => setDraft(value.toUpperCase()), [value]);

  function commitDraft() {
    const hex = normalizeHex(draft);
    if (hex) onChange(hex);
    else setDraft(value.toUpperCase());
  }

  async function pick() {
    if (!dropper) return;
    setPickError('');
    setPicking(true);
    try {
      const result = await new dropper().open();
      const hex = normalizeHex(result.sRGBHex);
      if (hex) onChange(hex);
    } catch (error) {
      // AbortError is the user pressing Escape; everything else is worth surfacing briefly.
      if (!(error instanceof DOMException && error.name === 'AbortError'))
        setPickError('Couldn’t read that pixel. Try again.');
    } finally {
      setPicking(false);
    }
  }

  return (
    <div className={`color-field-block ${compact ? 'compact' : ''}`}>
      <div className="color-field">
        <label htmlFor={id}>{label}</label>
        <div className="color-input">
          <input id={id} type="color" value={value} onChange={(e) => onChange(e.target.value)} />
          <input
            className="hex-input"
            type="text"
            inputMode="text"
            spellCheck={false}
            aria-label={`${label} hex value`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
          />
          {dropper && (
            <button
              type="button"
              className={`icon-button dropper ${picking ? 'is-active' : ''}`}
              aria-label={`Pick ${label.toLowerCase()} from screen`}
              title="Pick a colour from anywhere on screen"
              onClick={pick}
              disabled={picking}
            >
              <Pipette size={14} />
            </button>
          )}
        </div>
      </div>
      {pickError && <p className="color-pick-error">{pickError}</p>}
      {!compact && (
        <div className="color-swatches" aria-label={`${label} palette`}>
          {palette.map((swatch) => {
            const selected = swatch.value === value.toLowerCase();
            return (
              <button
                key={swatch.value}
                type="button"
                className={swatch.primary ? 'primary' : ''}
                style={{ background: swatch.value }}
                onClick={() => onChange(swatch.value)}
                aria-label={`${swatch.name} ${swatch.value}`}
                aria-pressed={selected}
                title={swatch.name}
              >
                {selected && <Check size={12} color={onColor(swatch.value)} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
