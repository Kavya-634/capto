// Final acceptance matrix: real ASR → real burn-in export → ffmpeg verification, across
// English / Hindi / Hinglish and portrait / landscape sources. Nothing is mocked.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
import assert from 'node:assert/strict';

const ffmpeg = process.env.FFMPEG;
assert(ffmpeg, 'Set FFMPEG=/path/to/ffmpeg');
const baseURL = process.env.CAPTO_URL || 'http://127.0.0.1:4201';
const out = 'docs/acceptance';
await mkdir(out, { recursive: true });

function probe(file) {
  let err = '';
  try {
    execFileSync(ffmpeg, ['-hide_banner', '-i', file], { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e) {
    err = e.stderr?.toString() || '';
  }
  const dur = err.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
  const v = err.match(/Video: (\w+)[^\n]*?(\d{2,5})x(\d{2,5})/);
  const a = err.match(/Audio: (\w+)/);
  return {
    duration: dur ? +dur[1] * 3600 + +dur[2] * 60 + +dur[3] : NaN,
    bitrateKbps: +(err.match(/bitrate: (\d+) kb\/s/)?.[1] ?? 0),
    vcodec: v?.[1] ?? null,
    width: v ? +v[2] : null,
    height: v ? +v[3] : null,
    acodec: a?.[1] ?? null,
  };
}
const pcmHash = async (f) => {
  const crypto = await import('node:crypto');
  const buf = execFileSync(ffmpeg, [
    '-v',
    'quiet',
    '-i',
    f,
    '-map',
    '0:a:0',
    '-f',
    's16le',
    '-ac',
    '1',
    '-ar',
    '16000',
    '-',
  ]);
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
};

const cases = [
  {
    id: 'english-portrait',
    video: 'public/demos/english.mp4',
    language: 'english',
    expectScript: /^[\x00-\x7F\s.,'’-]+$/u,
    reference:
      'Hello everyone. Today we are making short videos with clear captions. Every word tells a story.',
  },
  {
    id: 'hindi-portrait',
    video: 'public/demos/hindi.mp4',
    language: 'hindi',
    expectScript: /[\u0900-\u097f]/u,
    reference: 'नमस्ते दोस्तों। आज हम छोटे वीडियो बनाना सीखेंगे। साफ आवाज़ में बोलिए और अपनी कहानी दुनिया तक पहुँचाइए।',
  },
  {
    id: 'hinglish-landscape',
    video: 'e2e/fixtures/export/landscape-1080p.mp4',
    language: 'hinglish',
    expectScript: /^[\x00-\x7F\s.,'’-]+$/u,
    reference: 'kal hamari team meeting hai project update bhejo aur deadline dhyan mein rakho',
  },
];

function wer(ref, hyp) {
  const n = (s) =>
    s
      .normalize('NFC')
      .toLowerCase()
      .replace(/[\p{P}\p{S}]/gu, '')
      .split(/\s+/u)
      .filter(Boolean);
  const a = n(ref),
    b = n(hyp);
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++)
      next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return { edits: row[b.length], words: a.length, rate: +(row[b.length] / a.length).toFixed(3) };
}

const context = await chromium.launchPersistentContext('/private/tmp/capto-asr-browser-cache', {
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
const page = await context.newPage();
page.on('dialog', (d) => d.accept());
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
const results = [];

try {
  for (const c of cases) {
    console.log(`\n=== ${c.id} ===`);
    const t0 = Date.now();
    await page.goto(baseURL);
    await page.getByLabel('Upload video file').setInputFiles(c.video);
    await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2);
    await page.getByLabel('Spoken language').selectOption(c.language);
    await page.getByLabel('Recognition quality').selectOption(process.env.CAPTO_TIER || 'accurate');
    await page.getByRole('button', { name: 'Generate Captions', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.result-complete, .result-error'), undefined, {
      timeout: 900000,
    });
    const asrSeconds = (Date.now() - t0) / 1000;
    const err = (await page.locator('.result-error').count())
      ? await page.locator('.result-error').innerText()
      : null;
    assert(!err, `${c.id}: ASR failed: ${err}`);
    const texts = await page.locator('.caption-item textarea').evaluateAll((els) => els.map((e) => e.value));
    const transcript = texts.join(' ');
    assert(c.expectScript.test(transcript), `${c.id}: wrong script in output: ${transcript}`);
    console.log('  transcript:', transcript);
    const quality = wer(c.reference, transcript);
    console.log('  WER:', quality);

    // Style: karaoke so word timing is burned; shift sync so the export must honour it.
    await page.getByRole('button', { name: 'Karaoke', exact: true }).click();
    await page.getByLabel('Caption sync offset in seconds').fill('0.25');

    // Export video.
    await page.getByRole('button', { name: 'Export captions' }).click();
    await page.getByRole('button', { name: /Video with captions/ }).click();
    const plan = await page.locator('.export-plan').innerText();
    await page.getByRole('button', { name: 'Start export', exact: true }).click();
    const e0 = Date.now();
    await page.getByRole('button', { name: 'Save video', exact: true }).waitFor({ timeout: 600000 });
    const exportSeconds = (Date.now() - e0) / 1000;
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save video', exact: true }).click();
    const outPath = `${out}/${c.id}.mp4`;
    await (await dl).saveAs(outPath);

    // Verify.
    const src = probe(c.video),
      o = probe(outPath);
    assert.equal(o.width, src.width, 'width');
    assert.equal(o.height, src.height, 'height');
    assert.equal(o.acodec, src.acodec, 'audio codec changed');
    assert(Math.abs(o.duration - src.duration) < 0.25, `duration ${o.duration} vs ${src.duration}`);
    const audioIdentical = (await pcmHash(c.video)) === (await pcmHash(outPath));
    assert(audioIdentical, 'audio PCM differs');
    // Grab a frame in the middle of the first caption (after +0.25 shift) and one before it starts.
    const first = await page
      .locator('.caption-item')
      .first()
      .evaluate((el) => +el.querySelector('.caption-times input').value);
    const mid = first + 0.6;
    execFileSync(ffmpeg, [
      '-v',
      'quiet',
      '-y',
      '-ss',
      String(mid),
      '-i',
      outPath,
      '-frames:v',
      '1',
      `${out}/${c.id}-caption.png`,
    ]);
    execFileSync(ffmpeg, [
      '-v',
      'quiet',
      '-y',
      '-ss',
      String(Math.max(0, first - 0.15)),
      '-i',
      outPath,
      '-frames:v',
      '1',
      `${out}/${c.id}-before.png`,
    ]);

    results.push({
      ...c,
      expectScript: String(c.expectScript),
      transcript,
      wer: quality,
      asrSeconds: +asrSeconds.toFixed(1),
      exportSeconds: +exportSeconds.toFixed(1),
      plan: plan.replace(/\s+/g, ' '),
      source: src,
      output: { ...o, bytes: statSync(outPath).size },
      audioIdentical,
    });
    console.log(
      `  export ${exportSeconds.toFixed(1)}s · ${o.width}x${o.height} ${o.vcodec}/${o.acodec} · audio identical: ${audioIdentical}`,
    );
  }

  // Mobile viewport sanity on the real app (no mocks): upload, generate with Fast tier, check layout.
  console.log('\n=== mobile ===');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseURL);
  await page.getByLabel('Upload video file').setInputFiles('public/demos/english.mp4');
  await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2);
  const scrollOk = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  assert(scrollOk, 'mobile: horizontal overflow');
  await page.getByRole('button', { name: 'Captions', exact: true }).click();
  await page.getByLabel('Recognition quality').selectOption('fast');
  await page.getByRole('button', { name: 'Generate Captions', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.result-complete, .result-error'), undefined, {
    timeout: 600000,
  });
  assert.equal(await page.locator('.result-error').count(), 0, 'mobile ASR failed');
  for (const tab of ['Preview', 'Style', 'Captions']) {
    await page.getByRole('button', { name: tab, exact: true }).click();
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `mobile overflow on ${tab}`,
    );
  }
  await page.getByRole('button', { name: 'Export captions' }).click();
  await page.getByRole('button', { name: /Video with captions/ }).click();
  await page.getByRole('button', { name: 'Start export', exact: true }).click();
  await page.getByRole('button', { name: 'Save video', exact: true }).waitFor({ timeout: 300000 });
  await page.screenshot({ path: `${out}/mobile-export-done.png`, fullPage: true });
  results.push({ id: 'mobile-390', ok: true });

  await writeFile(`${out}/results.json`, JSON.stringify({ results, pageErrors }, null, 2) + '\n');
  assert.equal(pageErrors.length, 0, `page errors: ${pageErrors.join(' | ')}`);
  console.log('\nACCEPTANCE COMPLETE');
} finally {
  await context.close();
}
