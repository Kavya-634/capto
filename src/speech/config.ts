export const MAX_TRANSCRIPTION_SECONDS = 300;
export const MAX_TRANSCRIPTION_LABEL = '5 minutes';
export const LONG_CLIP_SECONDS = 90;
export const AUDIO_SAMPLE_RATE = 16000;
export type SpeechLanguage = 'english' | 'hindi' | 'hinglish';
export type ModelTier = 'fast' | 'accurate';

export type ModelSpec = {
  tier: ModelTier;
  id: string;
  revision: string;
  /** Approximate first-download size shown to the user. */
  downloadMB: number;
  label: string;
  note: string;
  /** Approximate peak memory headroom the user should have. */
  minMemoryGB: number;
};

export const MODELS: Record<ModelTier, ModelSpec> = {
  fast: {
    tier: 'fast',
    id: 'Xenova/whisper-small',
    revision: '2d67713f236afa48a18992566e7647f6ca848e13',
    downloadMB: 250,
    label: 'Fast · Whisper small',
    note: 'Quick, ~250 MB. English is usable; Hindi/Hinglish needs heavy correction.',
    minMemoryGB: 4,
  },
  accurate: {
    tier: 'accurate',
    id: 'onnx-community/whisper-large-v3-turbo_timestamped',
    revision: 'b3f77bf9a8c4d5ea3415827033d1ffea7955fd9a',
    downloadMB: 1090,
    label: 'Accurate · Whisper large-v3-turbo',
    note: 'Much better Hindi/Hinglish and names; ~1.1 GB download and several times slower on this device.',
    minMemoryGB: 8,
  },
};
export const DEFAULT_TIER: ModelTier = 'fast';
// Kept for callers that only need the default model.
export const MODEL_ID = MODELS[DEFAULT_TIER].id;
export const MODEL_REVISION = MODELS[DEFAULT_TIER].revision;

export function durationWarning(duration: number): string | null {
  if (!Number.isFinite(duration) || duration <= 0) return 'Wait for your video to finish loading.';
  if (duration > MAX_TRANSCRIPTION_SECONDS) {
    return `A little shorter, a little faster. Trim your video to ${MAX_TRANSCRIPTION_LABEL} or less to generate captions on this device. You can still add captions manually.`;
  }
  return null;
}

export function longClipNotice(duration: number): string | null {
  if (!Number.isFinite(duration) || duration <= LONG_CLIP_SECONDS || duration > MAX_TRANSCRIPTION_SECONDS)
    return null;
  const minutes = Math.round(duration / 60);
  return `This clip is about ${minutes} minute${minutes === 1 ? '' : 's'} long. On-device captioning can take longer than the video itself. Keep this tab open, or trim the clip for a faster result.`;
}
