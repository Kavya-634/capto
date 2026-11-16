import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: 'reduce',
});
const page = await context.newPage();
for (const view of ['home', 'editor', 'editor-dark', 'export']) {
  if (view === 'home') await page.goto('http://127.0.0.1:4200');
  if (view === 'editor') await page.getByRole('button', { name: 'Open studio' }).click();
  if (view === 'editor-dark') await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  if (view === 'export') {
    await page.getByRole('button', { name: 'Add first caption' }).click();
    await page.getByLabel('Caption 1 text', { exact: true }).fill('Review your words.');
    await page.getByRole('button', { name: 'Export captions' }).click();
  }
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  console.log(
    view,
    JSON.stringify(
      results.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({ target: n.target, issue: n.failureSummary })),
      })),
      null,
      2,
    ),
  );
}
await page.getByRole('button', { name: 'Close export dialog' }).click();
for (const width of [320, 360, 390, 768, 1024, 1440]) {
  await page.setViewportSize({ width, height: 900 });
  console.log(
    `Editor at ${width}:`,
    await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth })),
  );
}
await page.goto('http://127.0.0.1:4200');
for (const width of [320, 360, 390, 768, 1024, 1440]) {
  await page.setViewportSize({ width, height: 900 });
  console.log(
    `Home at ${width}:`,
    await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth })),
  );
}
await browser.close();
