export type CaptionView = 'hindi' | 'hinglish' | 'english';
export type CaptionWord = {
  text: string;
  start: number;
  end: number;
  forms?: Partial<Record<CaptionView, string>>;
};
export type Caption = {
  id: string;
  text: string;
  start: number;
  end: number;
  words?: CaptionWord[];
  timingSource?: 'model' | 'edited' | 'estimated' | 'translation';
  sourceLanguage?: 'english' | 'hindi';
  translation?: { text: string; sourceText: string };
  originalWords?: CaptionWord[];
};
export type Animation =
  | 'none'
  | 'pop'
  | 'fade'
  | 'slide'
  | 'word'
  | 'karaoke'
  | 'typewriter'
  | 'word-reveal'
  | 'word-pop'
  | 'bounce'
  | 'blur'
  | 'flip'
  | 'zoom'
  | 'wave'
  | 'glitch'
  | 'shake';

export const animations: { value: Animation; label: string; group: string; hint: string }[] = [
  { value: 'none', label: 'None', group: 'Line', hint: 'Static text' },
  { value: 'pop', label: 'Pop in', group: 'Line', hint: 'Scales up on entry' },
  { value: 'fade', label: 'Fade in', group: 'Line', hint: 'Soft opacity entry' },
  { value: 'slide', label: 'Slide up', group: 'Line', hint: 'Rises from below' },
  { value: 'zoom', label: 'Zoom', group: 'Line', hint: 'Starts large, settles' },
  { value: 'blur', label: 'Blur in', group: 'Line', hint: 'Sharpens into focus' },
  { value: 'flip', label: 'Flip', group: 'Line', hint: '3D turn on entry' },
  { value: 'bounce', label: 'Bounce', group: 'Line', hint: 'Springy overshoot' },
  { value: 'shake', label: 'Shake', group: 'Line', hint: 'Quick side-to-side' },
  { value: 'glitch', label: 'Glitch', group: 'Line', hint: 'Digital jitter on entry' },
  { value: 'word', label: 'One word at a time', group: 'Word timing', hint: 'Shows only the spoken word' },
  { value: 'karaoke', label: 'Karaoke highlight', group: 'Word timing', hint: 'Highlights the spoken word' },
  { value: 'word-reveal', label: 'Word by word', group: 'Word timing', hint: 'Reveals words as spoken' },
  { value: 'word-pop', label: 'Word pop', group: 'Word timing', hint: 'Spoken word scales up' },
  {
    value: 'typewriter',
    label: 'Typewriter',
    group: 'Word timing',
    hint: 'Types letters in time with speech',
  },
  { value: 'wave', label: 'Wave', group: 'Word timing', hint: 'Spoken word lifts, others settle' },
];

/** Animations that follow individual word intervals (model-aligned or even-split fallback). */
export const wordTimedAnimations: ReadonlySet<Animation> = new Set([
  'word',
  'karaoke',
  'word-reveal',
  'word-pop',
  'typewriter',
  'wave',
]);

export type CaptionStyle = {
  font: string;
  size: number;
  color: string;
  outline: number;
  outlineColor: string;
  background: boolean;
  backgroundColor: string;
  position: 'top' | 'center' | 'bottom';
  animation: Animation;
  bold: boolean;
  uppercase: boolean;
  neon: boolean;
  highlight: string;
};

export const fonts = [
  // Latin fonts fall back to Noto Sans Devanagari so mixed Hinglish lines still render.
  {
    name: 'DM Sans',
    group: 'Sans',
    value: '"DM Sans Variable", "Noto Sans Devanagari Variable", sans-serif',
  },
  {
    name: 'Manrope',
    group: 'Sans',
    value: '"Manrope Variable", "Noto Sans Devanagari Variable", sans-serif',
  },
  { name: 'Inter', group: 'Sans', value: '"Inter Variable", "Noto Sans Devanagari Variable", sans-serif' },
  { name: 'Nunito', group: 'Sans', value: '"Nunito Variable", "Noto Sans Devanagari Variable", sans-serif' },
  {
    name: 'Space Grotesk',
    group: 'Sans',
    value: '"Space Grotesk Variable", "Noto Sans Devanagari Variable", sans-serif',
  },
  {
    name: 'Bebas Neue',
    group: 'Display',
    value: '"Bebas Neue", "Noto Sans Devanagari Variable", sans-serif',
  },
  {
    name: 'Playfair Display',
    group: 'Serif',
    value: '"Playfair Display Variable", "Tiro Devanagari Hindi", serif',
  },
  { name: 'Lora', group: 'Serif', value: '"Lora", "Tiro Devanagari Hindi", serif' },
  {
    name: 'JetBrains Mono',
    group: 'Mono',
    value: '"JetBrains Mono Variable", "Noto Sans Devanagari Variable", monospace',
  },
  // These carry their own Devanagari glyphs, so Hindi and English share one design.
  { name: 'Poppins · हिन्दी', group: 'Latin + Devanagari', value: '"Poppins", sans-serif' },
  { name: 'Baloo 2 · हिन्दी', group: 'Latin + Devanagari', value: '"Baloo 2 Variable", sans-serif' },
  { name: 'Mukta · हिन्दी', group: 'Latin + Devanagari', value: '"Mukta", sans-serif' },
  {
    name: 'Noto Sans Devanagari · हिन्दी',
    group: 'Latin + Devanagari',
    value: '"Noto Sans Devanagari Variable", sans-serif',
  },
  { name: 'Hind · हिन्दी', group: 'Latin + Devanagari', value: '"Hind", sans-serif' },
  {
    name: 'Tiro Devanagari Hindi · हिन्दी',
    group: 'Latin + Devanagari',
    value: '"Tiro Devanagari Hindi", serif',
  },
];

/** Brand palette first, then neutrals and accents. Swatches feed text, outline, background and highlight. */
export const palette = [
  { name: 'Capto violet', value: '#7856ef', primary: true },
  { name: 'Capto lime', value: '#d4fc79', primary: true },
  { name: 'Capto lilac', value: '#e7b6ff', primary: true },
  { name: 'Capto ink', value: '#19191f', primary: true },
  { name: 'White', value: '#ffffff' },
  { name: 'Cream', value: '#fbf9ef' },
  { name: 'Gold', value: '#faca59' },
  { name: 'Coral', value: '#ff6b6b' },
  { name: 'Mint', value: '#5ef0c0' },
  { name: 'Sky', value: '#5ec2ff' },
  { name: 'Hot pink', value: '#ff4fa3' },
  { name: 'Black', value: '#000000' },
];

export const defaultStyle: CaptionStyle = {
  font: fonts[0].value,
  size: 34,
  color: '#ffffff',
  outline: 2,
  outlineColor: '#19191f',
  background: false,
  backgroundColor: '#7856ef',
  position: 'bottom',
  animation: 'pop',
  bold: true,
  uppercase: true,
  neon: false,
  highlight: '#d4fc79',
};

export const presets: {
  id: string;
  name: string;
  description: string;
  sample: string;
  style: CaptionStyle;
}[] = [
  {
    id: 'bold',
    name: 'Bold & Punchy',
    description: 'Big words. Bigger energy.',
    sample: 'MAKE IT HAPPEN.',
    style: defaultStyle,
  },
  {
    id: 'word',
    name: 'One word at a time',
    description: 'Every word gets its moment.',
    sample: 'unstoppable.',
    style: { ...defaultStyle, size: 38, color: '#d4fc79', animation: 'word', outline: 0, uppercase: false },
  },
  {
    id: 'karaoke',
    name: 'Karaoke',
    description: 'A little follow-along magic.',
    sample: 'find your rhythm',
    style: { ...defaultStyle, animation: 'karaoke', size: 30, outline: 0, uppercase: false },
  },
  {
    id: 'minimal',
    name: 'Clean & Minimal',
    description: 'Let your story do the talking.',
    sample: 'less, but better.',
    style: { ...defaultStyle, size: 25, outline: 0, animation: 'fade', bold: false, uppercase: false },
  },
  {
    id: 'boxed',
    name: 'Boxed',
    description: 'Give your words a home.',
    sample: 'outside the box.',
    style: { ...defaultStyle, size: 29, background: true, outline: 0, animation: 'slide', uppercase: false },
  },
  {
    id: 'neon',
    name: 'Neon',
    description: 'Impossible to scroll past.',
    sample: 'main character',
    style: {
      ...defaultStyle,
      size: 30,
      outline: 0,
      color: '#e7b6ff',
      neon: true,
      animation: 'fade',
      uppercase: false,
    },
  },
];

export function getActiveCaption(captions: Caption[], time: number) {
  return [...captions]
    .sort((a, b) => b.start - a.start)
    .find((c) => c.start <= time && time < c.end && c.text.trim());
}

/**
 * Shift every caption and word interval by `seconds` (positive = later), clamped to the clip.
 * Used for export so SRT/VTT/burned-in video all honour the user's sync fix. Words that would be
 * pushed outside the clip are clamped rather than dropped, preserving the one-to-one word list.
 */
export function shiftCaptions(captions: Caption[], seconds: number, duration: number): Caption[] {
  if (!seconds) return captions;
  const clamp = (t: number) => Math.min(duration, Math.max(0, t));
  const out: Caption[] = [];
  for (const c of captions) {
    const start = clamp(c.start + seconds);
    const end = clamp(c.end + seconds);
    if (end <= start) continue; // shifted entirely off the clip
    out.push({
      ...c,
      start,
      end,
      words: c.words?.map((w) => {
        const ws = clamp(w.start + seconds);
        const we = Math.max(ws + 0.01, clamp(w.end + seconds));
        return { ...w, start: ws, end: Math.min(end, we) };
      }),
    });
  }
  return out;
}

export function activeWordIndex(caption: Caption, time: number) {
  if (caption.words?.length) {
    // Do not highlight words in silent gaps or before/after their real interval.
    return caption.words.findIndex((w) => w.start <= time && time < w.end);
  }
  const words = caption.text.trim().split(/\s+/u);
  const progress = (time - caption.start) / Math.max(0.01, caption.end - caption.start);
  return Math.min(words.length - 1, Math.max(0, Math.floor(progress * words.length)));
}

export function editCaption(
  caption: Caption,
  key: 'text' | 'start' | 'end',
  value: string | number,
): Caption {
  if (caption[key] === value) return caption;
  // Text/bounds edits can invalidate audio alignment. Never silently reuse stale word timings.
  return { ...caption, [key]: value, words: undefined, timingSource: 'estimated' };
}

export function captionError(caption: Caption, duration: number): string | null {
  if (!caption.text.trim()) return 'Add some caption text.';
  if (!Number.isFinite(caption.start) || !Number.isFinite(caption.end)) return 'Enter valid times.';
  if (caption.start < 0) return 'Start time can’t be negative.';
  if (caption.end <= caption.start) return 'End must be after start.';
  if (caption.end > duration + 0.005) return 'Caption extends past the video.';
  if (caption.words?.length) {
    if (caption.words.map((w) => w.text).join(' ') !== caption.text)
      return 'Word text and caption text don’t match.';
    for (let i = 0; i < caption.words.length; i++) {
      const w = caption.words[i];
      if (!w.text.trim()) return 'Add text to every timed word, or merge/split the line to restructure it.';
      if (
        !Number.isFinite(w.start) ||
        !Number.isFinite(w.end) ||
        w.start < caption.start ||
        w.end > caption.end + 0.005 ||
        w.end <= w.start ||
        (i > 0 && w.start < caption.words[i - 1].end)
      )
        return 'Word timings must be ordered, non-overlapping, and within this caption.';
    }
  }
  return null;
}

export function formatTime(seconds: number) {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  return `${Math.floor(safe / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(safe % 60)
    .toString()
    .padStart(2, '0')}`;
}

export function subtitleTime(seconds: number, format: 'srt' | 'vtt') {
  const ms = Math.round(Math.max(0, seconds) * 1000);
  const h = Math.floor(ms / 3600000)
    .toString()
    .padStart(2, '0');
  const m = Math.floor((ms % 3600000) / 60000)
    .toString()
    .padStart(2, '0');
  const s = Math.floor((ms % 60000) / 1000)
    .toString()
    .padStart(2, '0');
  return `${h}:${m}:${s}${format === 'srt' ? ',' : '.'}${(ms % 1000).toString().padStart(3, '0')}`;
}

export function exportCaptions(captions: Caption[], format: 'srt' | 'vtt') {
  const clean = (text: string) =>
    text
      .trim()
      .replace(/\r\n?/g, '\n')
      .replace(/\n\s*\n/g, '\n')
      .replaceAll('-->', '→');
  const body = [...captions]
    .sort((a, b) => a.start - b.start)
    .map((c, i) => {
      const text = clean(c.text);
      const safe =
        format === 'vtt'
          ? text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
          : text;
      return `${i + 1}\n${subtitleTime(c.start, format)} --> ${subtitleTime(c.end, format)}\n${safe}`;
    })
    .join('\n\n');
  return `${format === 'vtt' ? 'WEBVTT\n\n' : ''}${body}\n`;
}

export function exportWordTiming(captions: Caption[]) {
  return (
    JSON.stringify(
      {
        schema: 'capto.word-timing.v1',
        timeUnit: 'seconds',
        captions: [...captions].sort((a, b) => a.start - b.start),
      },
      null,
      2,
    ) + '\n'
  );
}
