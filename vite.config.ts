import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Prebundle the lazy worker dependency up front: late optimization must not reload an active job.
  optimizeDeps: { include: ['@huggingface/transformers'] },
  // Cross-origin isolation lets the WASM backend use several threads for long clips.
  // The same headers must be set by whichever static host serves dist/.
  server: {
    proxy: { '/api/ai': 'http://127.0.0.1:4202' },
    headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' },
    watch: { ignored: ['**/playwright-report/**', '**/test-results/**'] },
  },
  preview: {
    proxy: { '/api/ai': 'http://127.0.0.1:4202' },
    headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' },
  },
  test: { include: ['src/**/*.test.ts', 'server/**/*.test.mjs'] },
});
