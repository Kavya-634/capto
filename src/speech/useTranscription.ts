import { useCallback, useEffect, useRef, useState } from 'react';
import type { Caption } from '../captions';
import { decodeVideoAudio } from './audio';
import { durationWarning, type ModelTier, type SpeechLanguage } from './config';
import type { TranscriptionState, WorkerReply, WorkerRequest } from './protocol';

export function useTranscription(onComplete: (captions: Caption[], language: SpeechLanguage) => void) {
  const [state, setState] = useState<TranscriptionState>({ status: 'idle' });
  const [elapsed, setElapsed] = useState(0);
  const worker = useRef<Worker | null>(null);
  const controller = useRef<AbortController | null>(null);
  const jobId = useRef(0);
  const stageRef = useRef<string | undefined>(undefined);
  const callback = useRef(onComplete);
  callback.current = onComplete;

  const stop = useCallback(() => {
    jobId.current++;
    controller.current?.abort();
    controller.current = null;
    worker.current?.terminate();
    worker.current = null;
  }, []);
  useEffect(() => stop, [stop]);
  useEffect(() => {
    if (state.status !== 'running') return;
    const started = Date.now();
    setElapsed(0);
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [state.status]);

  function cancel() {
    stop();
    setState({ status: 'cancelled', message: 'Cancelled. Your existing captions are unchanged.' });
  }
  /** Hide the result/error box without touching captions or any running job. */
  function dismiss() {
    if (state.status !== 'running') setState({ status: 'idle' });
  }
  async function generate(url: string, duration: number, language: SpeechLanguage, tier: ModelTier = 'fast') {
    if (controller.current) return;
    const warning = durationWarning(duration);
    if (warning) {
      setState({ status: 'error', message: warning });
      return;
    }
    if (!window.Worker || !window.WebAssembly) {
      setState({
        status: 'error',
        message:
          'This browser can’t run the speech model locally. Try a recent desktop Chrome or Edge browser.',
      });
      return;
    }
    const id = ++jobId.current;
    const abort = new AbortController();
    controller.current = abort;
    setState({ status: 'running', stage: 'decoding' });
    try {
      const audio = await decodeVideoAudio(url, abort.signal);
      if (id !== jobId.current) return;
      if (!worker.current)
        worker.current = new Worker(new URL('./transcribe.worker.ts', import.meta.url), { type: 'module' });
      const current = worker.current;
      const fail = (message: string) => {
        if (id !== jobId.current) return;
        stop();
        setState({ status: 'error', message });
      };
      current.onerror = () =>
        fail(
          'The local speech engine stopped. Try again, close other tabs, or use a shorter clip in desktop Chrome/Edge. No audio was uploaded.',
        );
      current.onmessage = (event: MessageEvent<WorkerReply>) => {
        const message = event.data;
        if (message.id !== id || id !== jobId.current) return;
        if (message.type === 'progress') stageRef.current = message.stage;
        if (message.type === 'progress')
          setState({
            status: 'running',
            stage: message.stage,
            loaded: message.loaded,
            total: message.total,
            processedSeconds: message.processedSeconds,
            durationSeconds: message.durationSeconds,
            tokens: message.tokens,
          });
        if (message.type === 'error') {
          // Only mention the network when the failure actually happened while fetching model files.
          const duringDownload =
            stageRef.current === 'loading' ||
            /fetch|network|download|404|403|Failed to load/i.test(message.message);
          fail(
            `Couldn’t generate captions: ${message.message}${duringDownload ? ' If the model download failed, check your connection and retry.' : ''}`,
          );
        }
        if (message.type === 'complete') {
          controller.current = null;
          callback.current(message.captions, language);
          setState({
            status: 'complete',
            warnings: message.warnings,
            seconds: message.seconds,
            message: 'Captions are ready. Review the words and timing before exporting.',
          });
        }
      };
      const request: WorkerRequest = { id, audio, duration, language, tier };
      current.postMessage(request, [audio.buffer]);
    } catch (error) {
      if (id !== jobId.current || abort.signal.aborted) return;
      controller.current = null;
      setState({
        status: 'error',
        message:
          error instanceof Error ? error.message : 'Audio preparation failed. Please try another video.',
      });
    }
  }
  return { state, elapsed, generate, cancel, dismiss, busy: state.status === 'running' };
}
