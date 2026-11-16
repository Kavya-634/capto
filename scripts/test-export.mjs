// Real end-to-end burn-in test: upload a real MP4, add Hindi + Hinglish captions, export, then verify the
// output file with ffprobe (dimensions, codecs, duration, audio preserved) and sample frames for text.
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const ffmpeg = process.env.FFMPEG;
assert(ffmpeg, 'Set FFMPEG=/path/to/ffmpeg');

/** Minimal probe via `ffmpeg -i` (the bundled build has no ffprobe). */
function probe(file) {
  let err = '';
  try {
    execFileSync(ffmpeg, ['-hide_banner', '-i', file], { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e) {
    err = e.stderr?.toString() || '';
  }
  const dur = err.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
  const duration = dur ? +dur[1] * 3600 + +dur[2] * 60 + +dur[3] : NaN;
  const bitrate = +(err.match(/bitrate: (\d+) kb\/s/)?.[1] ?? 0) * 1000;
  const v = err.match(/Video: (\w+)[^\n]*?(\d{2,5})x(\d{2,5})[^\n]*?(?:, ([\d.]+) fps)?/);
  const a = err.match(/Audio: (\w+)/);
  return {
    duration,
    bitrate,
    vcodec: v?.[1] ?? null,
    width: v ? +v[2] : null,
    height: v ? +v[3] : null,
    fps: v?.[4] ? +v[4] : null,
    acodec: a?.[1] ?? null,
  };
}
const out = 'docs/export-tests';
await mkdir(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const page = await context.newPage();
page.on('dialog', (d) => d.accept());
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

const results = {};
try {
  const fixture = process.env.EXPORT_FIXTURE || 'public/demos/hindi.mp4';
  const tag = process.env.EXPORT_TAG || 'hindi';
  await page.goto(process.env.CAPTO_URL || 'http://127.0.0.1:4201');
  await page.getByLabel('Upload video file').setInputFiles(fixture);
  await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2);
  const src = probe(fixture);
  results.source = src;

  // Two manual captions: Devanagari + Hinglish, karaoke style so word highlighting is burned too.
  const captions = [
    { text: 'नमस्ते दोस्तों आज हम सीखेंगे', start: 0.3, end: 3.6 },
    { text: 'aaj hum video banana seekhenge', start: 4.0, end: 7.8 },
  ];
  for (const [i, c] of captions.entries()) {
    await page.getByRole('button', { name: i === 0 ? 'Add first caption' : /Add caption/ }).click();
    await page.getByLabel(`Caption ${i + 1} text`, { exact: true }).fill(c.text);
    await page.getByLabel(`Caption ${i + 1} text`, { exact: true }).press('Tab');
    await page.getByLabel(`Caption ${i + 1} start time`).fill(String(c.start));
    await page.getByLabel(`Caption ${i + 1} end time`).fill(String(c.end));
  }
  await page.getByRole('button', { name: 'Karaoke', exact: true }).click();
  await page.getByLabel('Font family', { exact: true }).selectOption({ label: 'Poppins · हिन्दी' });

  // Sync offset: shift +0.5s so exported timings must differ from the typed ones.
  await page.getByLabel('Caption sync offset in seconds').fill('0.5');

  // Export subtitles first and verify the offset was applied.
  await page.getByRole('button', { name: 'Export captions' }).click();
  let dl = page.waitForEvent('download');
  await page.getByRole('button', { name: /SubRip captions/ }).click();
  const srt = await readFile(await (await dl).path(), 'utf8');
  assert(srt.includes('00:00:00,800 --> 00:00:04,100'), `SRT did not apply +0.5s offset:\n${srt}`);
  assert(srt.includes('नमस्ते दोस्तों'), 'SRT lost Devanagari');
  results.srt = srt;
  await writeFile(`${out}/${tag}-sync.srt`, srt);

  await page.getByRole('button', { name: 'Export captions' }).click();
  dl = page.waitForEvent('download');
  await page.getByRole('button', { name: /Web captions/ }).click();
  const vtt = await readFile(await (await dl).path(), 'utf8');
  assert(vtt.startsWith('WEBVTT') && vtt.includes('00:00:04.500 --> 00:00:08.300'), 'VTT offset wrong');
  results.vtt = vtt;

  // Video export.
  await page.getByRole('button', { name: 'Export captions' }).click();
  await page.getByRole('button', { name: /Video with captions/ }).click();
  await page.getByRole('button', { name: 'Start export', exact: true }).click();
  const t0 = Date.now();
  let lastProgress = '';
  const timer = setInterval(async () => {
    try {
      const p = await page.locator('.export-progress small').innerText({ timeout: 500 });
      if (p !== lastProgress) {
        console.log('  ', p.replace(/\s+/g, ' '));
        lastProgress = p;
      }
    } catch {}
  }, 1500);
  await page.getByRole('button', { name: 'Save video', exact: true }).waitFor({ timeout: 600000 });
  clearInterval(timer);
  results.exportSeconds = (Date.now() - t0) / 1000;
  results.doneText = await page.locator('.export-done p').innerText();
  dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save video', exact: true }).click();
  const download = await dl;
  const outPath = `${out}/${tag}-captioned.mp4`;
  await download.saveAs(outPath);

  // Verify with ffprobe.
  const o = probe(outPath);
  const { statSync } = await import('node:fs');
  results.output = { ...o, sizeBytes: statSync(outPath).size };
  assert.equal(o.width, src.width, 'width changed');
  assert.equal(o.height, src.height, 'height changed');
  assert(o.acodec, 'audio track missing from export');
  assert.equal(o.acodec, src.acodec, 'audio was re-encoded (codec changed)');
  assert(Math.abs(o.duration - src.duration) < 0.25, `duration drift ${o.duration} vs ${src.duration}`);

  // Audio identical? Compare decoded PCM hashes of source vs output.
  const pcm = (f) =>
    execFileSync(ffmpeg, [
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
  const crypto = await import('node:crypto');
  const h = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
  results.audioPcmHash = { source: h(pcm(fixture)), output: h(pcm(outPath)) };
  results.audioBitIdentical = results.audioPcmHash.source === results.audioPcmHash.output;

  // Grab frames at times where each caption (shifted +0.5s) should be visible, and one gap frame.
  for (const [name, t] of [
    ['hindi', 2.0],
    ['hinglish', 6.0],
    ['gap', 3.9],
  ]) {
    execFileSync(ffmpeg, [
      '-v',
      'quiet',
      '-y',
      '-ss',
      String(t),
      '-i',
      outPath,
      '-frames:v',
      '1',
      `${out}/${tag}-frame-${name}.png`,
    ]);
  }
  results.errors = errors;
  await writeFile(`${out}/${tag}-result.json`, JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify(results, null, 2));
  assert.equal(errors.length, 0, 'page errors');
  console.log('EXPORT TEST COMPLETE');
} finally {
  await browser.close();
}
