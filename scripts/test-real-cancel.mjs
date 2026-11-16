import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const context = await chromium.launchPersistentContext('/private/tmp/capto-asr-browser-cache', {
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  viewport: { width: 1440, height: 1000 },
  reducedMotion: 'reduce',
});
const page = await context.newPage();
page.on('dialog', (dialog) => dialog.accept());
try {
  await page.goto(process.env.CAPTO_URL || 'http://127.0.0.1:4201');
  await page.getByLabel('Upload video file').setInputFiles('public/demos/english.mp4');
  await page.getByRole('button', { name: 'Add first caption' }).click();
  await page.getByLabel('Caption 1 text', { exact: true }).fill('Keep this manual caption.');
  await page.getByRole('button', { name: 'Regenerate Captions', exact: true }).click();
  await expect(page.locator('.generation-status')).toContainText('Listening', { timeout: 600000 });
  const workersBefore = page.workers().length;
  const start = Date.now();
  await page.getByRole('button', { name: 'Cancel generation' }).click();
  await expect(page.locator('.result-cancelled')).toContainText('unchanged');
  await expect.poll(() => page.workers().length).toBe(0);
  await expect(page.getByLabel('Caption 1 text', { exact: true })).toHaveValue('Keep this manual caption.');
  const result = {
    stage: 'Listening / active model inference',
    cancellationMilliseconds: Date.now() - start,
    workersBefore,
    workersAfter: page.workers().length,
    existingCaptionPreserved: true,
  };
  await mkdir('docs/speech-tests', { recursive: true });
  await writeFile('docs/speech-tests/cancellation.json', JSON.stringify(result, null, 2) + '\n');
  await page.screenshot({ path: 'docs/speech-tests/cancelled.png', fullPage: true });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await context.close();
}
