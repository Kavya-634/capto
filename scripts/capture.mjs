import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

await mkdir('docs/screenshots', { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
});
for (const [name, viewport] of [
  ['desktop', { width: 1440, height: 1000 }],
  ['mobile', { width: 390, height: 844 }],
]) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  page.on('pageerror', (error) => console.error(error));
  await page.goto('http://127.0.0.1:4200');
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `docs/screenshots/home-${name}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await page.screenshot({ path: `docs/screenshots/home-dark-${name}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await page.getByRole('button', { name: 'Open studio' }).click();
  await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2);
  await page.screenshot({ path: `docs/screenshots/editor-${name}.png`, fullPage: true });
  if (name === 'mobile') await page.getByRole('button', { name: 'Captions', exact: true }).click();
  await page.getByLabel('Spoken language').selectOption('hindi');
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `docs/screenshots/editor-hindi-dark-${name}.png`, fullPage: true });
  if (name === 'mobile') {
    await page.getByRole('button', { name: 'Style', exact: true }).click();
    await page.screenshot({ path: 'docs/screenshots/style-mobile.png', fullPage: true });
  }
  console.log(`${name}: screenshots captured`);
  await page.close();
}
await browser.close();
