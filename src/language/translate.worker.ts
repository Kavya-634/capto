import { env, pipeline, type TranslationPipeline } from '@huggingface/transformers';
import wasmUrl from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm?url';
import wasmModuleUrl from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs?url';

env.allowLocalModels = false;
env.useBrowserCache = true;
env.backends.onnx.wasm!.numThreads = 1;
env.backends.onnx.wasm!.proxy = false;
env.backends.onnx.wasm!.wasmPaths = { wasm: wasmUrl, mjs: wasmModuleUrl };
let translator: TranslationPipeline | undefined;
let busy = false;
self.onmessage = async (event: MessageEvent<{ lines: { id: string; text: string }[] }>) => {
  if (busy) return;
  busy = true;
  try {
    self.postMessage({ type: 'progress', text: 'Loading local English translation model…' });
    translator ??= await pipeline<'translation'>('translation', 'Xenova/opus-mt-hi-en', {
      revision: '99853100ed9d932987a6816e8cf7b1b6742a6116',
      device: 'wasm',
      dtype: 'q8',
      progress_callback: (p) => {
        if (p.status === 'progress')
          self.postMessage({
            type: 'progress',
            text: `Loading translation model · ${Math.round(p.progress)}% of ${p.file}`,
          });
      },
    });
    const translated: { id: string; text: string }[] = [];
    for (const [i, line] of event.data.lines.entries()) {
      // Leave already-English lines alone; no audio is read or passed into this worker.
      let text = line.text;
      if (/[\u0900-\u097f]/u.test(text)) {
        // Transformers.js accepts partial generation overrides at runtime, although this
        // version's translation signature types the defaults as required properties.
        const options = { max_new_tokens: 160, do_sample: false } as NonNullable<
          Parameters<TranslationPipeline>[1]
        >;
        const result = await translator(text, options);
        const item = result.flat()[0] as { translation_text: string };
        text = item.translation_text?.trim();
        if (!text) throw new Error('An English translation was empty. Your captions are unchanged.');
      }
      translated.push({ id: line.id, text });
      self.postMessage({
        type: 'progress',
        text: `Translating text only · ${i + 1}/${event.data.lines.length} lines`,
      });
    }
    self.postMessage({ type: 'complete', translated });
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'Local translation failed.',
    });
  } finally {
    busy = false;
  }
};
