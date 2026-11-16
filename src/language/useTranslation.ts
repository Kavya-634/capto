import { useEffect, useRef, useState } from 'react';
import type { Caption } from '../captions';

export function useTranslation(onComplete: (lines: { id: string; text: string }[]) => void) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const worker = useRef<Worker | null>(null),
    generation = useRef(0),
    callback = useRef(onComplete);
  callback.current = onComplete;
  function stop() {
    generation.current++;
    worker.current?.terminate();
    worker.current = null;
  }
  useEffect(() => () => stop(), []);
  function cancel() {
    stop();
    setBusy(false);
    setMessage('Translation cancelled; your captions are unchanged.');
  }
  function translate(captions: Caption[]) {
    if (worker.current) return;
    const id = ++generation.current;
    setBusy(true);
    setMessage('Preparing text-only translation…');
    const w = new Worker(new URL('./translate.worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    const finish = (message: string) => {
      stop();
      setBusy(false);
      setMessage(message);
    };
    w.onerror = () => {
      if (id === generation.current)
        finish(
          'Local translation stopped. Retry in desktop Chrome; your Hindi and Hinglish captions are safe.',
        );
    };
    w.onmessage = (event) => {
      if (id !== generation.current) return;
      const data = event.data;
      if (data.type === 'progress') setMessage(data.text);
      if (data.type === 'error') finish(`Translation failed: ${data.message}`);
      if (data.type === 'complete') {
        callback.current(data.translated);
        finish(
          'English text cached. Translation has line timing only; original word timing is preserved in Hindi/Hinglish.',
        );
      }
    };
    w.postMessage({
      lines: captions
        .filter((c) => c.sourceLanguage === 'hindi' && c.translation?.sourceText !== c.text)
        .map((c) => ({ id: c.id, text: c.text })),
    });
  }
  return { busy, message, translate, cancel };
}
