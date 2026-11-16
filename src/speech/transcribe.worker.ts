import {
  env,
  pipeline,
  WhisperTextStreamer,
  type AutomaticSpeechRecognitionPipeline,
  type WhisperTokenizer,
} from '@huggingface/transformers';
import wasmUrl from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm?url';
import wasmModuleUrl from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs?url';
import { alignWords, detectDegenerate, splitIntoCaptions, type ModelWord } from './alignment';
import {
  AUDIO_SAMPLE_RATE,
  MAX_TRANSCRIPTION_LABEL,
  MAX_TRANSCRIPTION_SECONDS,
  MODELS,
  type ModelTier,
} from './config';
import type { WorkerReply, WorkerRequest } from './protocol';

env.allowLocalModels = false;
env.useBrowserCache = true;
// Multi-threaded WASM needs SharedArrayBuffer (cross-origin isolation). Use the cores when the
// page is isolated; otherwise fall back to one thread so generation still works everywhere.
const isolated =
  typeof SharedArrayBuffer !== 'undefined' &&
  (self as unknown as { crossOriginIsolated?: boolean }).crossOriginIsolated === true;
const threads = isolated ? Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)) : 1;
env.backends.onnx.wasm!.numThreads = threads;
env.backends.onnx.wasm!.proxy = false;
env.backends.onnx.wasm!.wasmPaths = { wasm: wasmUrl, mjs: wasmModuleUrl };

const CHUNK_SECONDS = 20;
const STRIDE_SECONDS = 3;

let transcriber: AutomaticSpeechRecognitionPipeline | null = null;
let loadedTier: ModelTier | null = null;
let busy = false;
const send = (message: WorkerReply) => self.postMessage(message);

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  if (busy) return;
  busy = true;
  const { id, audio, language, duration, tier = 'fast' } = event.data;
  const recognitionLanguage = language === 'hinglish' ? 'hindi' : language;
  const spec = MODELS[tier] ?? MODELS.fast;
  const started = performance.now();
  try {
    if (
      !['english', 'hindi', 'hinglish'].includes(language) ||
      duration <= 0 ||
      duration > MAX_TRANSCRIPTION_SECONDS ||
      audio.length > (MAX_TRANSCRIPTION_SECONDS + 0.1) * AUDIO_SAMPLE_RATE
    )
      throw new Error(
        `Please choose English, Hindi, or Hinglish and a video of ${MAX_TRANSCRIPTION_LABEL} or less.`,
      );
    // Never hold two models at once: the accurate tier alone is ~1.1 GB of weights.
    if (transcriber && loadedTier !== spec.tier) {
      await transcriber.dispose();
      transcriber = null;
      loadedTier = null;
    }
    if (!transcriber) {
      send({ id, type: 'progress', stage: 'loading' });
      const files = new Map<string, { loaded: number; total: number }>();
      transcriber = await pipeline<'automatic-speech-recognition'>('automatic-speech-recognition', spec.id, {
        device: 'wasm',
        dtype: 'q8',
        revision: spec.revision,
        progress_callback: (progress) => {
          if (progress.status !== 'progress') return;
          files.set(progress.file, { loaded: progress.loaded, total: progress.total });
          send({
            id,
            type: 'progress',
            stage: 'loading',
            loaded: [...files.values()].reduce((s, f) => s + f.loaded, 0),
            total: [...files.values()].reduce((s, f) => s + f.total, 0),
          });
        },
      });
      loadedTier = spec.tier;
    }
    const audioSeconds = audio.length / AUDIO_SAMPLE_RATE;
    send({
      id,
      type: 'progress',
      stage: 'listening',
      processedSeconds: 0,
      durationSeconds: audioSeconds,
      tokens: 0,
    });

    // The pipeline processes overlapping windows sequentially, and the streamer is finalized once
    // per window. Count finalized windows to report real progress rather than a guess.
    const jump = CHUNK_SECONDS - 2 * STRIDE_SECONDS;
    const totalWindows =
      audioSeconds <= CHUNK_SECONDS ? 1 : Math.ceil((audioSeconds - CHUNK_SECONDS) / jump) + 1;
    let windowsDone = 0;
    let tokens = 0;
    let lastReport = 0;
    const report = (force = false) => {
      const now = performance.now();
      if (!force && now - lastReport < 400) return;
      lastReport = now;
      send({
        id,
        type: 'progress',
        stage: 'listening',
        processedSeconds: Math.min(audioSeconds, (windowsDone / totalWindows) * audioSeconds),
        durationSeconds: audioSeconds,
        tokens,
      });
    };
    // The pipeline always loads this model's Whisper tokenizer; the generic type is just wider.
    const streamer = new WhisperTextStreamer(transcriber.tokenizer as WhisperTokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: () => {},
      token_callback_function: () => {
        tokens++;
        report();
      },
      on_finalize: () => {
        windowsDone++;
        report(true);
      },
    });

    const output = await transcriber(audio, {
      language: recognitionLanguage,
      task: 'transcribe',
      return_timestamps: 'word',
      chunk_length_s: CHUNK_SECONDS,
      stride_length_s: STRIDE_SECONDS,
      do_sample: false,
      // Transformers.js does not implement true multi-beam search (its generate loop never
      // spawns beams), so num_beams>1 would not improve output. Greedy for both tiers.
      num_beams: 1,
      // Whisper-small is prone to repetition loops on Hindi and on music/noise. Block repeated
      // 3-grams and apply a very mild repeat penalty. A stronger Hindi penalty (1.15) was tested
      // and measurably hurt clean Hindi (WER 44→56%, 58→63%), so it is kept uniform and light;
      // the degenerate-transcript detector is the real safety net for loops that still start.
      no_repeat_ngram_size: 3,
      repetition_penalty: 1.05,
      streamer,
    });
    send({
      id,
      type: 'progress',
      stage: 'writing',
      processedSeconds: audioSeconds,
      durationSeconds: audioSeconds,
      tokens,
    });
    const result = Array.isArray(output) ? output[0] : output;
    if (!result.text.trim() || !result.chunks?.length)
      throw new Error(
        'No speech could be recognized. Try a clip with a clear speaking voice, or add captions manually.',
      );
    const { words, adjusted, joined, repaired, unaligned } = alignWords(
      result.chunks as ModelWord[],
      duration,
    );
    // A looped transcript is not a result; refuse it with a specific explanation rather than
    // building captions out of the same word hundreds of times.
    const degenerate = detectDegenerate(words, repaired);
    if (degenerate.degenerate)
      throw new Error(
        `The model got stuck repeating itself (${degenerate.reason}), which usually means it could not follow the speech. ` +
          (recognitionLanguage === 'hindi'
            ? 'Hindi recognition is weakest with background music, echo, or fast speech. Try a clearer clip, trim to a section with one speaker, or add captions manually. Nothing was changed.'
            : 'Try a clearer clip, or a section without music, or add captions manually. Nothing was changed.'),
      );
    const warnings: string[] = [];
    const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
    if (adjusted)
      warnings.push(
        `${adjusted} word boundaries were clipped to the video or the previous word. Please review them.`,
      );
    if (repaired)
      warnings.push(
        `${repaired} ${plural(repaired, 'word had', 'words had')} a zero-length or overlapping model interval and ${plural(repaired, 'was', 'were')} given a minimal 50 ms slot. Expand “Model-aligned word timings” on ${plural(repaired, 'that line', 'those lines')} and adjust if the highlight looks early or late.`,
      );
    if (unaligned)
      warnings.push(
        `${unaligned} ${plural(unaligned, 'word was', 'words were')} returned without a start or end time; ${plural(unaligned, 'it was', 'they were')} placed immediately after the previous word. Please check ${plural(unaligned, 'it', 'them')}.`,
      );
    if (joined)
      warnings.push(
        `${joined} timed unit${joined === 1 ? '' : 's'} contained a space (usually a word glued to punctuation) and ${joined === 1 ? 'was' : 'were'} kept as one highlight. Check those lines.`,
      );
    if (recognitionLanguage === 'hindi' && !/[\u0900-\u097f]/u.test(words.map((w) => w.text).join(' ')))
      throw new Error(
        'The model didn’t produce Devanagari text for this clip. Check that the audio is Hindi and try a clearer excerpt.',
      );
    if (recognitionLanguage === 'hindi')
      warnings.push(
        'Hindi is a draft: our test clips needed substantial corrections. Review every word, matra, name, and word highlight before sharing.',
      );
    if (audioSeconds > 90)
      warnings.push(
        'Long clip: check the joins between 20-second windows for a dropped or repeated word, and spot-check timing near the end of the video.',
      );
    send({
      id,
      type: 'complete',
      captions: splitIntoCaptions(words),
      warnings,
      seconds: (performance.now() - started) / 1000,
    });
  } catch (error) {
    const raw = error instanceof Error ? error.message : 'Local transcription failed.';
    const message = /memory|allocation|out of/i.test(raw)
      ? 'The browser ran out of memory for this clip. Close other tabs or try a shorter video. Your existing captions are unchanged.'
      : raw;
    send({ id, type: 'error', message });
  } finally {
    busy = false;
  }
};
