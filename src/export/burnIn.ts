import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
  VideoSample,
  WebMOutputFormat,
  type VideoCodec,
} from 'mediabunny';
import type { Caption, CaptionStyle } from '../captions';
import { getActiveCaption } from '../captions';
import { fontLoadSpecs, renderCaptionFrame } from './renderCaption';

export type ExportProgress = {
  stage: 'probing' | 'encoding' | 'finalizing';
  /** 0–1 */
  fraction: number;
  processedSeconds: number;
  durationSeconds: number;
  elapsedSeconds: number;
  /** Rolling estimate; undefined until enough frames have been processed to be meaningful. */
  etaSeconds?: number;
  framesRendered: number;
};

export type ExportPlan = {
  width: number;
  height: number;
  rotation: number;
  durationSeconds: number;
  frameRate: number | null;
  sourceVideoCodec: string | null;
  sourceAudioCodec: string | null;
  /** Bits per second measured from the source video track. */
  sourceVideoBitrate: number;
  /** Encode target: match source codec family where WebCodecs can encode it, else fall back. */
  targetVideoCodec: VideoCodec;
  targetBitrate: number;
  container: 'mp4' | 'webm';
  audioCopied: boolean;
  /** Human-readable notes about anything that could not be preserved exactly. */
  notes: string[];
};

export type ExportResult = { blob: Blob; plan: ExportPlan; frames: number; seconds: number };

const MIN_BITRATE = 1_500_000;
const MAX_BITRATE = 40_000_000;

async function canEncode(codec: string, width: number, height: number, bitrate: number, framerate: number) {
  if (typeof VideoEncoder === 'undefined') return false;
  try {
    const r = await VideoEncoder.isConfigSupported({ codec, width, height, bitrate, framerate });
    return !!r.supported;
  } catch {
    return false;
  }
}

/** Pick an encodable codec that keeps the source container/codec family where possible. */
async function chooseVideoCodec(
  source: string | null,
  width: number,
  height: number,
  bitrate: number,
  framerate: number,
): Promise<{ codec: VideoCodec; container: 'mp4' | 'webm'; note?: string }> {
  // H.264 High profile covers up to 4K at level 5.1; mediabunny builds the full string.
  const candidates: { codec: VideoCodec; probe: string; container: 'mp4' | 'webm' }[] = [
    { codec: 'avc', probe: 'avc1.640033', container: 'mp4' },
    { codec: 'hevc', probe: 'hvc1.1.6.L153.B0', container: 'mp4' },
    { codec: 'vp9', probe: 'vp09.00.51.08', container: 'webm' },
    { codec: 'av1', probe: 'av01.0.13M.08', container: 'webm' },
    { codec: 'vp8', probe: 'vp8', container: 'webm' },
  ];
  // Prefer the source family first so an H.264 MP4 stays an H.264 MP4.
  const preferred = source ? candidates.filter((c) => c.codec === source) : [];
  const ordered = [...preferred, ...candidates.filter((c) => !preferred.includes(c))];
  for (const c of ordered) {
    if (await canEncode(c.probe, width, height, bitrate, framerate)) {
      const note =
        source && c.codec !== source
          ? `Source video codec "${source}" can't be encoded by this browser; exporting as ${c.codec.toUpperCase()} instead.`
          : undefined;
      return { codec: c.codec, container: c.container, note };
    }
  }
  throw new Error(
    'This browser cannot encode video at this resolution. Try a recent desktop Chrome or Edge, or export subtitles instead.',
  );
}

/** Inspect the source and decide how it will be exported, without encoding anything. */
export async function planExport(file: Blob): Promise<ExportPlan> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoDecoder === 'undefined') {
    throw new Error(
      'Video export needs WebCodecs, which this browser does not expose. Try a recent desktop Chrome or Edge, or export subtitles instead.',
    );
  }
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const video = await input.getPrimaryVideoTrack();
  if (!video) throw new Error('This file has no video track to export.');
  const audio = await input.getPrimaryAudioTrack();
  if (!(await video.canDecode()))
    throw new Error(
      'This browser cannot decode the source video, so frames cannot be drawn on. Try an H.264 MP4.',
    );

  const [width, height, duration, stats, sourceVideoCodec, sourceAudioCodec] = await Promise.all([
    video.getDisplayWidth(),
    video.getDisplayHeight(),
    input.computeDuration(),
    video.computePacketStats(200),
    video.getCodec(),
    audio ? audio.getCodec() : Promise.resolve(null),
  ]);
  const frameRate = stats.averagePacketRate > 0 ? stats.averagePacketRate : null;
  const sourceVideoBitrate = stats.averageBitrate;
  // Preserve visual quality: match the source bitrate, bounded to sane limits, never below source.
  const targetBitrate = Math.min(MAX_BITRATE, Math.max(MIN_BITRATE, Math.round(sourceVideoBitrate * 1.1)));
  const { codec, container, note } = await chooseVideoCodec(
    sourceVideoCodec,
    width,
    height,
    targetBitrate,
    frameRate ?? 30,
  );
  const notes: string[] = [];
  if (note) notes.push(note);
  notes.push(
    'Video is re-encoded so captions can be drawn into the frames; resolution, aspect ratio and frame rate are kept and bitrate is matched to the source. Audio is copied bit-for-bit.',
  );
  if (!audio) notes.push('The source has no audio track.');
  return {
    width,
    height,
    rotation: video.rotation,
    durationSeconds: duration,
    frameRate,
    sourceVideoCodec,
    sourceAudioCodec,
    sourceVideoBitrate,
    targetVideoCodec: codec,
    targetBitrate,
    container,
    audioCopied: !!audio,
    notes,
  };
}

export type BurnInOptions = {
  file: Blob;
  captions: Caption[];
  style: CaptionStyle;
  /** Seconds to shift captions; positive = later. Applied here so the export matches the preview. */
  syncOffset: number;
  plan: ExportPlan;
  onProgress: (p: ExportProgress) => void;
  signal: AbortSignal;
};

/** Burn captions into the video. Resolves with an MP4/WebM Blob. */
export async function burnInCaptions({
  file,
  captions,
  style,
  syncOffset,
  plan,
  onProgress,
  signal,
}: BurnInOptions): Promise<ExportResult> {
  signal.throwIfAborted();
  const started = performance.now();

  // Fonts must be resident before the first frame or Devanagari falls back to a system face.
  const sample =
    captions
      .map((c) => c.text)
      .join(' ')
      .slice(0, 200) || 'Aa अआ';
  await Promise.all(
    fontLoadSpecs(style, sample)
      .filter(Boolean)
      .map((s) => document.fonts.load(s, sample)),
  );

  const { width, height } = plan;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Could not create a drawing surface for export.');

  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const target = new BufferTarget();
  const output = new Output({
    format:
      plan.container === 'mp4' ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(),
    target,
  });

  let frames = 0;
  let lastReport = 0;
  const report = (stage: ExportProgress['stage'], processedSeconds: number, force = false) => {
    const now = performance.now();
    if (!force && now - lastReport < 250) return;
    lastReport = now;
    const elapsed = (now - started) / 1000;
    const fraction = plan.durationSeconds > 0 ? Math.min(1, processedSeconds / plan.durationSeconds) : 0;
    // ETA from throughput so far; only trust it after 5% so the first frames don't produce wild numbers.
    const eta = fraction > 0.05 ? (elapsed / fraction) * (1 - fraction) : undefined;
    onProgress({
      stage,
      fraction,
      processedSeconds,
      durationSeconds: plan.durationSeconds,
      elapsedSeconds: elapsed,
      etaSeconds: eta,
      framesRendered: frames,
    });
  };
  report('probing', 0, true);

  const conversion = await Conversion.init({
    input,
    output,
    video: {
      codec: plan.targetVideoCodec,
      bitrate: plan.targetBitrate,
      // Explicitly keep dimensions; `process` draws onto a same-size canvas.
      width,
      height,
      fit: 'fill',
      processedWidth: width,
      processedHeight: height,
      forceTranscode: true,
      process: (frame: VideoSample) => {
        if (signal.aborted) {
          frame.close();
          return null;
        }
        // Source frame first (handles rotation/PAR via mediabunny's transformations), then caption.
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        frame.draw(ctx, 0, 0, width, height);
        ctx.restore();
        const t = frame.timestamp - syncOffset;
        renderCaptionFrame({
          ctx,
          width,
          height,
          caption: getActiveCaption(captions, t),
          style,
          time: t,
        });
        frames++;
        report('encoding', frame.timestamp + frame.duration);
        frame.close();
        // Return the canvas; mediabunny stamps it with the source frame's timestamp/duration.
        return canvas;
      },
    },
    // Audio: copy encoded packets untouched. mediabunny only transcodes if the container can't hold them.
    audio: { forceTranscode: false },
    showWarnings: false,
  });

  if (!conversion.isValid) {
    const reasons = conversion.discardedTracks.map((d) => `${d.track.type}: ${d.reason}`).join('; ');
    throw new Error(`Export isn't possible for this file (${reasons || 'no usable tracks'}).`);
  }
  const audioCopied = conversion.utilizedTracks.some((t) => t.type === 'audio');

  const abort = () => void conversion.cancel();
  signal.addEventListener('abort', abort, { once: true });
  try {
    await conversion.execute();
  } finally {
    signal.removeEventListener('abort', abort);
  }
  signal.throwIfAborted();
  report('finalizing', plan.durationSeconds, true);

  const buffer = target.buffer;
  if (!buffer) throw new Error('Export produced no data.');
  const type = plan.container === 'mp4' ? 'video/mp4' : 'video/webm';
  return {
    blob: new Blob([buffer], { type }),
    plan: { ...plan, audioCopied },
    frames,
    seconds: (performance.now() - started) / 1000,
  };
}
