import type { Caption } from '../captions';
import type { ModelTier, SpeechLanguage } from './config';

export type SpeechStage = 'decoding' | 'loading' | 'listening' | 'writing';
export type WorkerRequest = {
  id: number;
  audio: Float32Array;
  language: SpeechLanguage;
  duration: number;
  tier: ModelTier;
  /** Diagnostics only (scripts/diagnose-asr.mjs). Never set by the UI. */
  experiment?: { chunkSeconds?: number; strideSeconds?: number; autoLanguage?: boolean };
};
export type WorkerReply =
  | {
      id: number;
      type: 'progress';
      stage: SpeechStage;
      loaded?: number;
      total?: number;
      processedSeconds?: number;
      durationSeconds?: number;
      tokens?: number;
    }
  | { id: number; type: 'complete'; captions: Caption[]; warnings: string[]; seconds: number }
  | { id: number; type: 'error'; message: string };

export type TranscriptionState = {
  status: 'idle' | 'running' | 'complete' | 'cancelled' | 'error';
  stage?: SpeechStage;
  loaded?: number;
  total?: number;
  processedSeconds?: number;
  durationSeconds?: number;
  tokens?: number;
  message?: string;
  warnings?: string[];
  seconds?: number;
};
