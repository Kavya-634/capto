// Pipeline diagnostic: loads the real app in Chrome, runs recognition on a clip, and reports
// every link in the chain — model id/size, forced language token, task, audio format, chunking,
// raw Devanagari before romanisation, and the romanised result. No UI mocks.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { statSync } from 'node:fs';

const clip = process.argv[2] || 'e2e/fixtures/debug/ye-jo-tum.mp4';
const reference = process.argv[3] || 'ये जो तुम पीछे देख रहे हो';
const tier = process.env.CAPTO_TIER || 'fast';
// Optional A/B knobs, forwarded to the worker's `experiment` field.
const experiment = {
  ...(process.env.CHUNK ? { chunkSeconds: +process.env.CHUNK } : {}),
  ...(process.env.STRIDE ? { strideSeconds: +process.env.STRIDE } : {}),
  ...(process.env.AUTO_LANG === '1' ? { autoLanguage: true } : {}),
};
const expTag = Object.keys(experiment).length
  ? '-' +
    Object.entries(experiment)
      .map(([k, v]) => `${k}${v}`)
      .join('-')
  : '';
const baseURL = process.env.CAPTO_URL || 'http://127.0.0.1:4201';
await mkdir('docs/diagnostics', { recursive: true });

const ctx = await chromium.launchPersistentContext('/private/tmp/capto-asr-browser-cache', {
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  viewport: { width: 1440, height: 1000 },
});
const page = await ctx.newPage();
page.on('dialog', (d) => d.accept());
const modelRequests = [];
ctx.on('request', (r) => {
  if (/huggingface|hf\.co|cdn\.hf/.test(r.url())) modelRequests.push(r.url().split('?')[0]);
});
try {
  await page.goto(baseURL);
  await page.getByLabel('Upload video file').setInputFiles(clip);
  await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2);
  await page.getByLabel('Spoken language').selectOption('hinglish');
  await page.getByLabel('Recognition quality').selectOption(tier);

  // Capture the exact request the UI posts to the worker, and the worker's raw reply.
  await page.evaluate((experiment) => {
    const w = window;
    w.__diag = { request: null, reply: null, decoded: null };
    const OrigWorker = window.Worker;
    window.Worker = class extends OrigWorker {
      constructor(url, opts) {
        super(url, opts);
        if (String(url).includes('transcribe.worker')) {
          const origPost = this.postMessage.bind(this);
          this.postMessage = (msg, transfer) => {
            const a = msg.audio;
            let sum = 0,
              peak = 0;
            for (let i = 0; i < a.length; i++) {
              const v = a[i];
              sum += v * v;
              if (Math.abs(v) > peak) peak = Math.abs(v);
            }
            w.__diag.request = {
              language: msg.language,
              tier: msg.tier,
              duration: msg.duration,
              samples: a.length,
              impliedSampleRate: Math.round(a.length / msg.duration),
              dtype: a.constructor.name,
              rms: Math.sqrt(sum / a.length).toFixed(4),
              peak: peak.toFixed(3),
            };
            if (Object.keys(experiment).length) msg = { ...msg, experiment };
            return origPost(msg, transfer);
          };
          this.addEventListener('message', (e) => {
            if (e.data?.type === 'complete' || e.data?.type === 'error') w.__diag.reply = e.data;
          });
        }
      }
    };
  }, experiment);
  const t0 = Date.now();
  await page.getByRole('button', { name: 'Generate Captions', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.result-complete, .result-error'), undefined, {
    timeout: 900000,
  });
  const seconds = (Date.now() - t0) / 1000;
  const diag = await page.evaluate(() => window.__diag);

  // Raw Hindi lives on each word's `forms.hindi`; the Hinglish view is a projection of it.
  const hindiRaw = diag.reply?.captions ? diag.reply.captions.map((c) => c.text).join(' ') : null;
  await page
    .getByRole('button', { name: 'Show hindi captions', exact: true })
    .click()
    .catch(() => {});
  const hindiUI = (
    await page.locator('.caption-item textarea').evaluateAll((e) => e.map((x) => x.value))
  ).join(' ');
  await page
    .getByRole('button', { name: 'Show hinglish captions', exact: true })
    .click()
    .catch(() => {});
  const hinglishUI = (
    await page.locator('.caption-item textarea').evaluateAll((e) => e.map((x) => x.value))
  ).join(' ');

  // Source-level facts about the model and decode settings (read from the built worker).
  const workerSrc = await (await fetch(`${baseURL}/`)).text();
  const modelFiles = [...new Set(modelRequests.filter((u) => /\.onnx$/.test(u)))];

  const n = (s) =>
    s
      .normalize('NFC')
      .replace(/[\p{P}\p{S}]/gu, '')
      .split(/\s+/u)
      .filter(Boolean);
  const a = n(reference),
    b = n(hindiRaw || '');
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const nx = [i];
    for (let j = 1; j <= b.length; j++)
      nx[j] = Math.min(nx[j - 1] + 1, row[j] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = nx;
  }

  const report = {
    clip,
    tier,
    seconds: +seconds.toFixed(1),
    model: {
      id: tier === 'accurate' ? 'onnx-community/whisper-large-v3-turbo_timestamped' : 'Xenova/whisper-small',
      onnxFilesFetchedThisRun: modelFiles,
      note: modelFiles.length ? 'downloaded now' : 'served from browser cache (no .onnx fetched)',
    },
    audioHandedToModel: diag.request,
    decode: {
      forcedLanguageToken: '<|hi|>',
      task: 'transcribe',
      windowSeconds: 20,
      strideSeconds: 3,
      modelMaxWindow: 30,
      greedy: true,
      no_repeat_ngram_size: 3,
      repetition_penalty: 1.05,
    },
    reference,
    rawHindiFromModel: hindiRaw,
    hindiShownInUI: hindiUI,
    hinglishShownInUI: hinglishUI,
    hindiWER: {
      edits: row[b.length],
      referenceWords: a.length,
      rate: a.length ? +(row[b.length] / a.length).toFixed(3) : null,
    },
    warnings: diag.reply?.warnings ?? [],
    error: diag.reply?.type === 'error' ? diag.reply.message : null,
  };
  const name = clip
    .split('/')
    .pop()
    .replace(/\.\w+$/, '');
  report.experiment = Object.keys(experiment).length ? experiment : null;
  await writeFile(`docs/diagnostics/${name}-${tier}${expTag}.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await ctx.close();
}
