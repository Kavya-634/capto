import { activeWordIndex, wordTimedAnimations, type Caption, type CaptionStyle } from '../captions';

/**
 * Canvas renderer that mirrors CaptionOverlay for burned-in export.
 *
 * The preview sizes everything in `cqw` units (1% of frame width), so every dimension here is
 * derived from `width` the same way. Fonts are the same families the preview uses; callers must
 * `await document.fonts.load(...)` before rendering so Devanagari shapes correctly on first frame.
 */

export type RenderCaption = Caption;

type Rgb = [number, number, number];
function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function luminance(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
/** Same rule as the preview: never let highlight equal text colour. */
export function effectiveHighlight(text: string, highlight: string) {
  if (text.toLowerCase() !== highlight.toLowerCase()) return highlight;
  return luminance(text) > 0.6 ? '#7856ef' : '#d4fc79';
}

/** Cubic-bezier(0.2, 0.8, 0.2, 1)-ish ease-out used by the preview's entry animations. */
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

type Entry = { opacity: number; scale: number; dy: number; dx: number; blur: number; rotX: number };
/** Float animation maths can land on -0 at the end of an ease; normalise so settled state is exactly identity. */
const clean = (e: Entry): Entry => ({
  opacity: e.opacity || 0,
  scale: e.scale,
  dy: e.dy || 0,
  dx: e.dx || 0,
  blur: e.blur || 0,
  rotX: e.rotX || 0,
});
/** Line-entry animation state at `age` seconds after the caption appeared. Matches effects.css. */
export function entryState(animation: CaptionStyle['animation'], age: number): Entry {
  return clean(entryStateRaw(animation, age));
}
function entryStateRaw(animation: CaptionStyle['animation'], age: number): Entry {
  const base: Entry = { opacity: 1, scale: 1, dy: 0, dx: 0, blur: 0, rotX: 0 };
  const t = (dur: number) => clamp01(age / dur);
  switch (animation) {
    case 'pop': {
      const p = easeOut(t(0.3));
      return { ...base, opacity: p, scale: 0.83 + 0.17 * p };
    }
    case 'fade':
      return { ...base, opacity: easeOut(t(0.5)) };
    case 'slide': {
      const p = easeOut(t(0.4));
      return { ...base, opacity: p, dy: (1 - p) * 14 };
    }
    case 'zoom': {
      const p = easeOut(t(0.45));
      return { ...base, opacity: p, scale: 1.35 - 0.35 * p };
    }
    case 'blur': {
      const p = easeOut(t(0.5));
      return { ...base, opacity: p, blur: (1 - p) * 0.25 };
    }
    case 'flip': {
      const p = easeOut(t(0.55));
      return { ...base, opacity: p, rotX: -80 * (1 - p) };
    }
    case 'bounce': {
      const p = t(0.6);
      // 0→60%: rise past target; 60→100%: settle. Approximates cubic-bezier(.34,1.56,.64,1).
      if (p < 0.6) {
        const q = p / 0.6;
        return { ...base, opacity: q, dy: (1 - q) * 0.9 * 16 - q * 0.12 * 16, scale: 0.9 + 0.13 * q };
      }
      const q = (p - 0.6) / 0.4;
      return { ...base, dy: -(1 - q) * 0.12 * 16, scale: 1.03 - 0.03 * q };
    }
    case 'shake': {
      const p = t(0.45);
      if (p >= 1) return base;
      const k = [0, -0.18, 0.16, -0.1, 0.06, 0][Math.min(5, Math.floor(p * 5))];
      return { ...base, dx: k * 16 };
    }
    case 'glitch': {
      const p = t(0.5);
      if (p >= 1) return base;
      return { ...base, opacity: p < 0.3 ? 0.4 : 1, dx: p < 0.3 ? -1.3 : p < 0.6 ? 1 : -0.3 };
    }
    default:
      return base;
  }
}

/** Fraction (0–1) of the active word's interval that has elapsed; drives the typewriter. */
function wordProgress(caption: Caption, index: number, time: number) {
  if (index < 0) return 0;
  const words = caption.words;
  if (words?.length) {
    const w = words[index];
    return clamp01((time - w.start) / Math.max(0.01, w.end - w.start));
  }
  const count = caption.text.trim().split(/\s+/u).length;
  const slot = Math.max(0.01, caption.end - caption.start) / count;
  return clamp01((time - caption.start - index * slot) / slot);
}

export type WordRun = { text: string; state: 'past' | 'active' | 'future'; index: number };

/** Build the visible word runs exactly as CaptionOverlay would at `time`. */
export function wordRuns(caption: Caption, style: CaptionStyle, time: number): WordRun[] {
  const words = caption.words?.map((w) => w.text) || caption.text.trim().split(/\s+/u);
  const index = activeWordIndex(caption, time);
  if (style.animation === 'word') {
    return index < 0 ? [] : [{ text: words[index], state: 'active', index }];
  }
  return words.map((word, i) => {
    const state: WordRun['state'] = i < index ? 'past' : i === index ? 'active' : 'future';
    let text = word;
    if (style.animation === 'typewriter') {
      if (state === 'future') text = '';
      else if (state === 'active') {
        const chars = Array.from(word);
        const shown = Math.max(1, Math.ceil(wordProgress(caption, index, time) * chars.length));
        text = chars.slice(0, shown).join('');
      }
    }
    return { text, state, index: i };
  });
}

export type RenderFrameOptions = {
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
  width: number;
  height: number;
  caption: Caption | undefined;
  style: CaptionStyle;
  /** Media time of this frame, in seconds, after any user sync offset is applied. */
  time: number;
};

/** Greedy word-wrap at the preview's 88% content width. Returns lines of word runs. */
function wrapRuns(
  ctx: RenderFrameOptions['ctx'],
  runs: WordRun[],
  maxWidth: number,
  spaceWidth: number,
): WordRun[][] {
  const lines: WordRun[][] = [];
  let current: WordRun[] = [];
  let currentWidth = 0;
  for (const run of runs) {
    if (!run.text && current.length) continue; // typewriter future words occupy no space
    const w = ctx.measureText(run.text).width;
    const extra = current.length ? spaceWidth : 0;
    if (current.length && currentWidth + extra + w > maxWidth) {
      lines.push(current);
      current = [run];
      currentWidth = w;
    } else {
      current.push(run);
      currentWidth += extra + w;
    }
  }
  if (current.length) lines.push(current);
  return lines;
}

/**
 * Draw one frame's caption. Pure function of (caption, style, time): no DOM, deterministic.
 * Returns true if anything was drawn.
 */
export function renderCaptionFrame({
  ctx,
  width,
  height,
  caption,
  style,
  time,
}: RenderFrameOptions): boolean {
  if (!caption) return false;
  const runs = wordRuns(caption, style, time);
  if (!runs.length || runs.every((r) => !r.text)) return false;

  // --- Scale: preview uses cqw, i.e. 1% of frame width. ---
  const cqw = width / 100;
  const fontPx = (style.size / 3.6) * cqw;
  const strokePx = (style.outline / 3.6) * cqw;
  const lineHeight = fontPx * 1.48;
  const padX = fontPx * 0.15;
  const padY = fontPx * 0.03;
  const radius = fontPx * 0.12;
  const maxWidth = width * 0.88;

  const wordTimed = wordTimedAnimations.has(style.animation);
  const entry = wordTimed ? entryState('none', 0) : entryState(style.animation, time - caption.start);
  if (entry.opacity <= 0) return false;

  const highlight = effectiveHighlight(style.color, style.highlight);
  const weight = style.bold ? 800 : 500;
  const transform = (s: string) => (style.uppercase ? s.toUpperCase() : s);

  ctx.save();
  ctx.font = `${weight} ${fontPx}px ${style.font}`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  // letter-spacing: -0.025em in the preview
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D).letterSpacing = `${-0.025 * fontPx}px`;

  const spaceWidth = ctx.measureText(' ').width;
  const visualRuns = runs.map((r) => ({ ...r, text: transform(r.text) }));
  const lines = wrapRuns(ctx, visualRuns, maxWidth, spaceWidth);
  const blockHeight = lines.length * lineHeight;

  // --- Vertical anchor mirrors .caption-overlay.position-* ---
  let top: number;
  if (style.position === 'top') top = height * 0.13;
  else if (style.position === 'center') top = height / 2 - blockHeight / 2;
  else top = height - height * 0.15 - blockHeight;

  // --- Entry transform about the block centre ---
  const cx = width / 2;
  const cy = top + blockHeight / 2;
  ctx.globalAlpha = entry.opacity;
  ctx.translate(cx + entry.dx * (fontPx / 16), cy + entry.dy * (fontPx / 16));
  if (entry.rotX) {
    // Approximate 3D X-rotation by vertical squash (perspective foreshortening).
    const k = Math.cos((entry.rotX * Math.PI) / 180);
    ctx.scale(entry.scale, entry.scale * Math.max(0.05, k));
  } else if (entry.scale !== 1) ctx.scale(entry.scale, entry.scale);
  ctx.translate(-cx, -cy);
  if (entry.blur > 0 && 'filter' in ctx)
    (ctx as CanvasRenderingContext2D).filter = `blur(${entry.blur * fontPx}px)`;

  // Font metrics for baseline placement within the line box. Use the *font's* ascent/descent
  // (covers Devanagari headline, matras above, and subscript conjuncts below) rather than the
  // ink bounds of a Latin probe, otherwise highlight pills clip tall/deep scripts.
  const probe = ctx.measureText('Mgक्षीं');
  const ascent =
    Math.max(probe.fontBoundingBoxAscent || 0, probe.actualBoundingBoxAscent || 0) || fontPx * 0.9;
  const descent =
    Math.max(probe.fontBoundingBoxDescent || 0, probe.actualBoundingBoxDescent || 0) || fontPx * 0.25;
  const glyphH = ascent + descent;
  const baselineOffset = (lineHeight - glyphH) / 2 + ascent;

  lines.forEach((line, li) => {
    const widths = line.map((r) => ctx.measureText(r.text).width);
    const total = widths.reduce((s, w) => s + w, 0) + spaceWidth * (line.length - 1);
    let x = cx - total / 2;
    const baseline = top + li * lineHeight + baselineOffset;

    line.forEach((run, ri) => {
      const w = widths[ri];
      if (!run.text) return;

      // Per-word state styling (word-timed effects) mirrors effects.css.
      let color = style.color;
      let alpha = 1;
      let scale = 1;
      let dy = 0;
      let bg: string | null = style.background ? style.backgroundColor : null;
      let drawStroke = strokePx > 0;
      if (wordTimed) {
        if (style.animation === 'karaoke' && run.state === 'active') {
          bg = highlight;
          color = '#242721';
          drawStroke = false;
        } else if (style.animation === 'word-reveal') {
          if (run.state === 'future') alpha = 0;
        } else if (style.animation === 'word-pop') {
          if (run.state === 'active') {
            scale = 1.22;
            color = highlight;
            drawStroke = false;
          } else if (run.state === 'future') alpha = 0.35;
        } else if (style.animation === 'wave') {
          if (run.state === 'active') {
            scale = 1.08;
            dy = -0.28 * fontPx;
            color = highlight;
            drawStroke = false;
          } else if (run.state === 'future') {
            alpha = 0.45;
            dy = 0.12 * fontPx;
          }
        }
      }
      if (alpha <= 0) {
        x += w + spaceWidth;
        return;
      }

      ctx.save();
      ctx.globalAlpha = entry.opacity * alpha;
      if (scale !== 1 || dy) {
        const wx = x + w / 2;
        const wy = baseline - glyphH / 2 + descent;
        ctx.translate(wx, wy + dy);
        ctx.scale(scale, scale);
        ctx.translate(-wx, -wy);
      }

      // Background pill (box-decoration-break: clone → per run).
      if (bg) {
        ctx.fillStyle = bg;
        const bx = x - padX;
        const by = baseline - ascent - padY;
        const bw = w + padX * 2;
        const bh = glyphH + padY * 2;
        roundRect(ctx, bx, by, bw, bh, radius);
        ctx.fill();
      }

      // Neon glow or soft shadow.
      if (style.neon) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 18 * (fontPx / 34);
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      } else {
        ctx.shadowColor = 'rgba(0,0,0,0.33)';
        ctx.shadowBlur = 10 * (fontPx / 34);
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 2 * (fontPx / 34);
      }

      // paint-order: stroke fill
      if (drawStroke) {
        ctx.lineWidth = strokePx * 2; // stroke is centred on the outline; preview stroke is one-sided width
        ctx.strokeStyle = style.outlineColor;
        ctx.strokeText(run.text, x, baseline);
      }
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = color;
      ctx.fillText(run.text, x, baseline);

      // Typewriter caret on the active word.
      if (style.animation === 'typewriter' && run.state === 'active') {
        const blinkOn = Math.floor(time / 0.35) % 2 === 0;
        if (blinkOn) {
          ctx.fillStyle = color;
          ctx.globalAlpha = entry.opacity * 0.9;
          ctx.fillRect(x + w - fontPx * 0.05, baseline - ascent, fontPx * 0.12, glyphH);
        }
      }
      ctx.restore();
      x += w + spaceWidth;
    });
  });

  ctx.restore();
  return true;
}

function roundRect(ctx: RenderFrameOptions['ctx'], x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

/** Font strings to pre-load so the first exported frame doesn't render in a fallback face. */
export function fontLoadSpecs(style: CaptionStyle, sampleText: string): string[] {
  const weight = style.bold ? 800 : 500;
  // Load each family in the stack; the browser picks per-glyph.
  return style.font
    .split(',')
    .map((f) => f.trim().replace(/^["']|["']$/g, ''))
    .filter((f) => f && !/^(sans-serif|serif|monospace|system-ui)$/i.test(f))
    .map((family) => `${weight} 32px "${family}"`)
    .concat([sampleText.length ? `${weight} 32px ${style.font}` : '']);
}
