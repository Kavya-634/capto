import type { Caption, CaptionWord } from '../captions';

export type ModelWord = { text: string; timestamp: [number | null, number | null] };

/** Shortest interval we will show for a word whose model interval collapsed. */
const MIN_WORD_SECONDS = 0.05;

export type AlignmentResult = {
  words: CaptionWord[];
  /** Words whose start/end were nudged to stay inside the clip or after the previous word. */
  adjusted: number;
  /** Timed units that contained inner whitespace (word glued to punctuation) and were kept as one. */
  joined: number;
  /** Words whose interval collapsed to zero/negative length and were given a minimal slot. */
  repaired: number;
  /** Words where the model returned no start or end time at all. */
  unaligned: number;
};

/**
 * Preserve real model word intervals. Repair only the individual words whose interval is missing
 * or collapsed (chunk-merge overlaps, zero-length alignment on short words, a null end on the last
 * token of a window). Never spread timing evenly across a caption and never discard recognised text
 * because one word's timing is imperfect — the user is told how many words were repaired instead.
 */
export function alignWords(chunks: ModelWord[], duration: number): AlignmentResult {
  const words: CaptionWord[] = [];
  let adjusted = 0;
  let joined = 0;
  let repaired = 0;
  let unaligned = 0;

  for (const chunk of chunks) {
    // The tokenizer occasionally emits one timestamped unit with inner whitespace, e.g. a
    // leading-space token glued to a punctuation token. The interval is still that of a single
    // spoken unit, so keep it and normalise the spacing instead of failing the whole transcript.
    const raw = (chunk.text ?? '').trim().normalize('NFC');
    const text = raw.replace(/\s+/gu, ' ');
    if (!text) continue;
    if (text !== raw || /\s/u.test(text)) joined++;

    // Punctuation-only units carry no spoken time of their own; attach them to the previous word.
    if (/^[\p{P}\p{S}]+$/u.test(text) && words.length) {
      words[words.length - 1].text += text;
      continue;
    }

    const previousEnd = words.at(-1)?.end ?? 0;
    let [start, end] = chunk.timestamp ?? [null, null];

    // The library sets end=null only for the very last token of a window, and a missing start
    // means the alignment head produced nothing for that token. Repair from the neighbour.
    if (start === null || !Number.isFinite(start)) {
      start = previousEnd;
      unaligned++;
    }
    if (end === null || !Number.isFinite(end)) {
      end = Math.min(duration, start + MIN_WORD_SECONDS);
      unaligned++;
    }

    let boundedStart = Math.max(0, start, previousEnd);
    let boundedEnd = Math.min(duration, end);

    if (boundedEnd <= boundedStart) {
      // Collapsed interval: a merge overlap pushed the start past the model end, or the model gave
      // a short word zero duration. Give it a minimal slot right after the previous word.
      boundedEnd = Math.min(duration, boundedStart + MIN_WORD_SECONDS);
      if (boundedEnd <= boundedStart) {
        // Only possible at the very end of the clip: shift the slot back inside the clip and
        // trim the previous word so the sequence stays ordered.
        boundedStart = Math.max(0, duration - MIN_WORD_SECONDS);
        boundedEnd = duration;
        const prev = words.at(-1);
        if (prev && prev.end > boundedStart) prev.end = boundedStart;
      }
      repaired++;
    } else if (boundedStart !== start || boundedEnd !== end) {
      adjusted++;
    }

    words.push({ text, start: boundedStart, end: boundedEnd });
  }

  if (!words.length)
    throw new Error(
      'No speech could be aligned. Try a clip with a clear speaking voice, or add captions manually.',
    );
  return { words, adjusted, joined, repaired, unaligned };
}

export type DegenerateCheck = {
  degenerate: boolean;
  reason?: string;
  /** Share of all words taken by the single most common word (0–1). */
  topWordShare: number;
  /** Longest run of the same word repeated back-to-back. */
  longestRun: number;
  /** Share of words whose interval had to be repaired (0–1). */
  repairedShare: number;
};

/**
 * Whisper can fall into a repetition loop — emitting one token hundreds of times — especially on
 * noisy, musical, or low-resource-language audio. Such a transcript is worthless and must not be
 * presented as "ready". Detect it from the word list and repair count; thresholds are deliberately
 * conservative so genuine repeated speech ("no no no", chanting) is still allowed through.
 */
export function detectDegenerate(words: CaptionWord[], repaired: number): DegenerateCheck {
  const total = words.length;
  const norm = (t: string) => t.toLowerCase().replace(/[\p{P}\p{S}]/gu, '');
  const counts = new Map<string, number>();
  let longestRun = 0;
  let run = 0;
  let prev = '';
  for (const w of words) {
    const key = norm(w.text);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    run = key === prev ? run + 1 : 1;
    longestRun = Math.max(longestRun, run);
    prev = key;
  }
  const top = Math.max(0, ...counts.values());
  const topWordShare = total ? top / total : 0;
  const repairedShare = total ? repaired / total : 0;

  let reason: string | undefined;
  if (total >= 12 && longestRun >= 10) reason = `the same word repeated ${longestRun} times in a row`;
  else if (total >= 20 && topWordShare >= 0.5)
    reason = `one word makes up ${Math.round(topWordShare * 100)}% of the transcript`;
  else if (total >= 20 && repairedShare >= 0.6)
    reason = `${Math.round(repairedShare * 100)}% of words had no usable timing`;
  return { degenerate: !!reason, reason, topWordShare, longestRun, repairedShare };
}

/** Group around five words; prefer sentence boundaries and pauses over rigid lengths. */
export function splitIntoCaptions(words: CaptionWord[]): Caption[] {
  const groups: CaptionWord[][] = [];
  let current: CaptionWord[] = [];
  const flush = () => {
    if (current.length) groups.push(current);
    current = [];
  };
  words.forEach((word, i) => {
    const previous = current.at(-1);
    if (previous && word.start - previous.end > 0.65) flush();
    current.push(word);
    const next = words[i + 1];
    const sentenceEnd = /[.!?।॥]$/u.test(word.text);
    if (
      current.length >= 6 ||
      (current.length >= 3 && sentenceEnd) ||
      (current.length >= 5 && (!next || next.start - word.end > 0.2))
    )
      flush();
  });
  flush();
  const last = groups.at(-1);
  const before = groups.at(-2);
  if (last && before && last.length < 3 && last[0].start - before.at(-1)!.end <= 0.65) {
    if (last.length + before.length <= 6) {
      before.push(...last);
      groups.pop();
    } else if (before.length - (3 - last.length) >= 3)
      last.unshift(...before.splice(before.length - (3 - last.length)));
  }
  return groups.map((group, i) => ({
    id: `speech-${i}`,
    text: group.map((w) => w.text).join(' '),
    start: group[0].start,
    end: group.at(-1)!.end,
    words: group,
    timingSource: 'model',
  }));
}
