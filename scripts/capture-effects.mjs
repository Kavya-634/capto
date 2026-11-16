import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

await mkdir('docs/screenshots', { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
  reducedMotion: 'reduce',
});
page.on('dialog', (d) => d.accept());
// Same mock worker as the e2e suite so we get deterministic word timings without a 250 MB download.
await page.addInitScript(() => {
  const OriginalWorker = window.Worker;
  class SpeechWorker {
    onmessage = null;
    constructor(url, options) {
      if (!String(url).includes('transcribe.worker')) return new OriginalWorker(url, options);
    }
    terminate() {}
    postMessage(request) {
      const group = ['Make', 'every', 'word', 'worth', 'watching.'];
      const words = group.map((text, j) => ({
        text,
        start: +(0.1 + j * 0.35).toFixed(2),
        end: +(0.32 + j * 0.35).toFixed(2),
      }));
      const captions = [
        {
          id: 'speech-0',
          text: group.join(' '),
          start: words[0].start,
          end: words.at(-1).end,
          words,
          timingSource: 'model',
        },
      ];
      setTimeout(
        () =>
          this.onmessage?.({
            data: { id: request.id, type: 'complete', captions, warnings: [], seconds: 0.5 },
          }),
        300,
      );
    }
  }
  window.Worker = SpeechWorker;
});
await page.goto('http://127.0.0.1:4200');
await page.getByRole('button', { name: 'Open studio' }).click();
await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2);
await page.getByRole('button', { name: 'Generate Captions', exact: true }).click();
await page.locator('.result-complete').waitFor();
await page.getByRole('button', { name: 'Dismiss notification' }).click();

const seek = (t) => page.getByRole('slider', { name: 'Video playhead' }).fill(String(t));
const animation = page.getByLabel('Animation', { exact: true });

// Style panel with the expanded controls.
await page.getByLabel('Font family', { exact: true }).selectOption({ label: 'Bebas Neue' });
await page.getByRole('button', { name: /Capto lime/ }).click();
// Scroll the panel so typography + colour controls are in view, then screenshot the panel itself.
await page.locator('#text-color').scrollIntoViewIfNeeded();
await page.locator('.style-panel').screenshot({ path: 'docs/screenshots/style-panel-expanded.png' });

// A few effects mid-line.
for (const [value, t] of [
  ['typewriter', 0.9],
  ['word-pop', 0.9],
  ['wave', 0.9],
  ['word-reveal', 0.9],
]) {
  await animation.selectOption(value);
  await seek(t);
  await page.waitForTimeout(250);
  await page.locator('.video-frame').screenshot({ path: `docs/screenshots/effect-${value}.png` });
}
console.log('captured');
await browser.close();
