import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const baseURL = process.env.CAPTO_URL || 'http://127.0.0.1:4200';
const fixtures = JSON.parse(
  await readFile(process.env.CAPTO_SPEECH_FIXTURE || 'e2e/fixtures/speech/manifest.json', 'utf8'),
).filter((f) => !process.env.CAPTO_LANGUAGE || f.language === process.env.CAPTO_LANGUAGE);
const reportTag = process.env.CAPTO_REPORT_TAG || '';
await mkdir('docs/speech-tests', { recursive: true });
const context = await chromium.launchPersistentContext('/private/tmp/capto-asr-browser-cache', {
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  viewport: { width: 1440, height: 1100 },
  reducedMotion: 'reduce',
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
page.on('dialog', (dialog) => dialog.accept());
const requests = [];
context.on('request', (request) =>
  requests.push({
    method: request.method(),
    url: request.url(),
    bodyBytes: request.postDataBuffer()?.length || 0,
  }),
);
page.on('pageerror', (error) => console.error('PAGE ERROR:', error.message));
page.on('console', (message) => {
  if (message.type() === 'error') console.error('BROWSER:', message.text());
});

function normalize(text) {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, '')
    .split(/\s+/u)
    .filter(Boolean);
}
function wer(reference, text) {
  const a = normalize(reference),
    b = normalize(text);
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++)
      next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return {
    edits: row[b.length],
    referenceWords: a.length,
    recognizedWords: b.length,
    rate: row[b.length] / a.length,
  };
}
const results = [];
try {
  for (const fixture of fixtures) {
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto(baseURL);
    await page.getByLabel('Upload video file').setInputFiles(fixture.video);
    await page.getByLabel('Spoken language').selectOption(fixture.language);
    const tier = process.env.CAPTO_TIER || 'fast';
    await page.getByLabel('Recognition quality').selectOption(tier);
    await page.getByRole('button', { name: 'Generate Captions', exact: true }).waitFor();
    const start = Date.now();
    console.log(`START ${fixture.language} tier=${tier} (${fixture.duration.toFixed(2)}s)`);
    const isolated = await page.evaluate(() => crossOriginIsolated);
    const longNotice = (await page.locator('.speech-notice').count())
      ? await page.locator('.speech-notice').innerText()
      : null;
    await page.getByRole('button', { name: 'Generate Captions', exact: true }).click();
    let last = '';
    const progressLog = [];
    const timer = setInterval(async () => {
      try {
        const progress = await page.locator('.generation-progress').innerText({ timeout: 1000 });
        if (progress !== last) {
          console.log(`${fixture.language}: ${progress.replaceAll('\n', ' ')}`);
          last = progress;
          const heard = progress.match(/(\d+:\d+) of (\d+:\d+) heard · (\d+)%/);
          if (heard)
            progressLog.push({
              at: (Date.now() - start) / 1000,
              heard: heard[1],
              of: heard[2],
              percent: +heard[3],
            });
        }
      } catch {
        /* Complete or navigation. */
      }
    }, 15000);
    try {
      await page.waitForFunction(() => document.querySelector('.result-complete, .result-error'), undefined, {
        timeout: 3600000,
      });
    } finally {
      clearInterval(timer);
    }
    const seconds = (Date.now() - start) / 1000;
    const error = (await page.locator('.result-error').count())
      ? await page.locator('.result-error').innerText()
      : null;
    const captions = await page.locator('.caption-item').evaluateAll((items) =>
      items.map((item) => ({
        text: item.querySelector('textarea').value,
        start: +item.querySelector('.caption-times input').value,
        end: +item.querySelectorAll('.caption-times input')[1].value,
        words: [...item.querySelectorAll('.word-timing-row')].map((row) => ({
          // Word text is an editable input now; the two numeric inputs follow it.
          text: row.querySelector('.word-text-input').value,
          start: +row.querySelectorAll('input[type=number]')[0].value,
          end: +row.querySelectorAll('input[type=number]')[1].value,
        })),
      })),
    );
    const text = captions.map((c) => c.text).join(' ');
    const words = captions.flatMap((c) => c.words);
    let actualWordPlaybackVerified = false;
    let playbackProbeError = null;
    // Playback probes must never prevent the transcript itself from being recorded.
    if (!error && words.length)
      try {
        await page.getByRole('button', { name: 'One word at a time', exact: true }).click();
        // Check the opening words and the final words, so late-clip timing drift would be caught too.
        const probes = words.length > 8 ? [...words.slice(0, 4), ...words.slice(-4)] : words.slice(0, 4);
        for (const word of probes) {
          await page
            .getByRole('slider', { name: 'Video playhead' })
            .fill(String((word.start + word.end) / 2));
          await expect(page.getByTestId('caption-overlay')).toHaveText(word.text);
        }
        await page.getByRole('button', { name: 'Karaoke', exact: true }).click();
        const karaokeWord = words[Math.min(3, words.length - 1)];
        await page
          .getByRole('slider', { name: 'Video playhead' })
          .fill(String((karaokeWord.start + karaokeWord.end) / 2));
        await expect(page.locator('.karaoke-active')).toHaveText(karaokeWord.text.trim());
        actualWordPlaybackVerified = true;
      } catch (probeError) {
        playbackProbeError = String(probeError.message || probeError).split('\n')[0];
        console.warn('PLAYBACK PROBE FAILED (transcript still saved):', playbackProbeError);
      }
    const result = {
      ...fixture,
      tier,
      error,
      elapsedSeconds: seconds,
      realTimeFactor: +(seconds / fixture.duration).toFixed(2),
      crossOriginIsolated: isolated,
      longClipNoticeShown: longNotice,
      progressSamples: progressLog,
      lastWordEnd: words.at(-1)?.end ?? null,
      coveredToEnd: words.length > 0 && fixture.duration - words.at(-1).end < 15,
      warnings: await page.locator('.result-complete p, .result-error p').allInnerTexts(),
      actualWordPlaybackVerified,
      playbackProbeError,
      text,
      wordError: wer(fixture.reference, text),
      captions,
      orderedBoundedWords:
        words.length > 0 &&
        words.every(
          (w, i) =>
            w.start >= 0 &&
            w.end > w.start &&
            w.end <= fixture.duration + 0.2 &&
            (!i || w.start >= words[i - 1].end),
        ),
      wordsPerLine: captions.map((c) => c.words.length),
    };
    results.push(result);
    await writeFile(
      `docs/speech-tests/${fixture.reportName || fixture.language}${reportTag}.json`,
      JSON.stringify(result, null, 2) + '\n',
    );
    if (await page.getByRole('button', { name: 'Dismiss notification' }).isVisible())
      await page.getByRole('button', { name: 'Dismiss notification' }).click();
    await page.screenshot({
      path: `docs/speech-tests/${fixture.reportName || fixture.language}${reportTag}.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Captions', exact: true }).click();
    await page.locator('.word-timings summary').first().click();
    await page.getByRole('button', { name: 'Switch to dark mode' }).click();
    await page.screenshot({
      path: `docs/speech-tests/${fixture.reportName || fixture.language}${reportTag}-mobile.png`,
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await page.screenshot({
      path: `docs/speech-tests/${fixture.reportName || fixture.language}${reportTag}-mobile-preview.png`,
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Switch to light mode' }).click();
    console.log('RESULT', JSON.stringify(result, null, 2));
  }
  await writeFile(
    `docs/speech-tests/network-${fixtures[0].reportName || 'synthetic'}${reportTag}.json`,
    JSON.stringify(
      requests.map((r) => ({ ...r, url: r.url.split('?')[0] })),
      null,
      2,
    ) + '\n',
  );
  assert(
    requests.every(
      (request) => (request.method === 'GET' || request.method === 'HEAD') && request.bodyBytes === 0,
    ),
    'A request attempted to send data.',
  );
  assert(
    results.every((result) => !result.error && result.orderedBoundedWords),
    'At least one real transcription failed.',
  );
  console.log('REAL SPEECH TESTS COMPLETE. No POST requests or request bodies.');
} finally {
  await context.close();
}
