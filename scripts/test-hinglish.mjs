import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const fixtures = JSON.parse(await readFile('e2e/fixtures/hinglish/manifest.json', 'utf8'));
const tier = process.env.CAPTO_TIER || 'fast';
const directory = tier === 'fast' ? 'docs/hinglish-tests' : `docs/hinglish-tests/${tier}`;
await mkdir(directory, { recursive: true });
const context = await chromium.launchPersistentContext('/private/tmp/capto-asr-browser-cache', {
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  viewport: { width: 1440, height: 1100 },
  reducedMotion: 'reduce',
});
const page = await context.newPage();
page.on('dialog', (d) => d.accept());
const requests = [],
  errors = [],
  results = [];
context.on('request', (r) =>
  requests.push({ method: r.method(), url: r.url().split('?')[0], bytes: r.postDataBuffer()?.length || 0 }),
);
page.on('pageerror', (e) => errors.push(e.message));
function normalize(s) {
  return s
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, '')
    .split(/\s+/u)
    .filter(Boolean);
}
function differences(reference, actual) {
  const a = normalize(reference),
    b = normalize(actual);
  const m = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) m[i][0] = i;
  for (let j = 0; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  const edits = [];
  let i = a.length,
    j = b.length;
  while (i || j) {
    if (i && j && m[i][j] === m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) {
      if (a[i - 1] !== b[j - 1]) edits.push({ expected: a[i - 1], actual: b[j - 1] });
      i--;
      j--;
    } else if (i && m[i][j] === m[i - 1][j] + 1) {
      edits.push({ expected: a[--i], actual: '(missing)' });
    } else {
      edits.push({ expected: '(extra)', actual: b[--j] });
    }
  }
  return {
    edits: edits.reverse(),
    wordErrorRate: m[a.length][b.length] / a.length,
    referenceWords: a.length,
    recognizedWords: b.length,
  };
}
async function readCaptions() {
  return page.locator('.caption-item').evaluateAll((items) =>
    items.map((item) => ({
      text: item.querySelector('textarea').value,
      start: +item.querySelector('.caption-times input').value,
      end: +item.querySelectorAll('.caption-times input')[1].value,
      words: [...item.querySelectorAll('.word-timing-row')].map((row) => ({
        text: row.querySelector('.word-text-input').value,
        start: +row.querySelectorAll('input[type=number]')[0].value,
        end: +row.querySelectorAll('input[type=number]')[1].value,
      })),
    })),
  );
}
try {
  for (const fixture of fixtures) {
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto(process.env.CAPTO_URL || 'http://127.0.0.1:4201');
    await page.getByLabel('Upload video file').setInputFiles(fixture.video);
    await page.getByLabel('Spoken language').selectOption('hinglish');
    await page.getByLabel('Recognition quality').selectOption(tier);
    const started = Date.now();
    console.log(`START ${fixture.name}: ${fixture.duration.toFixed(2)}s`);
    await page.getByRole('button', { name: 'Generate Captions', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.result-complete, .result-error'), undefined, {
      timeout: 900000,
    });
    const elapsedSeconds = (Date.now() - started) / 1000;
    const failure = (await page.locator('.result-error').count())
      ? await page.locator('.result-error').innerText()
      : null;
    if (failure) {
      results.push({ ...fixture, error: failure, elapsedSeconds });
      console.log('FAILED', failure);
      continue;
    }
    const roman = await readCaptions();
    await page.getByRole('button', { name: 'Show hindi captions', exact: true }).click();
    const hindi = await readCaptions();
    const intervalList = (cs) => cs.flatMap((c) => c.words.map((w) => [w.start, w.end]));
    assert.deepEqual(intervalList(roman), intervalList(hindi));
    await page.getByRole('button', { name: 'Show hinglish captions', exact: true }).click();
    const again = await readCaptions();
    assert.deepEqual(roman, again);
    const result = {
      ...fixture,
      tier,
      elapsedSeconds,
      error: null,
      recognizedHindi: hindi.map((c) => c.text).join(' '),
      hinglish: roman.map((c) => c.text).join(' '),
      comparison: differences(fixture.hinglishReference, roman.map((c) => c.text).join(' ')),
      exactWordTimestampsPreserved: true,
      captionCount: roman.length,
      captions: roman,
      originalCaptions: hindi,
    };
    results.push(result);
    await writeFile(`${directory}/${fixture.name}.json`, JSON.stringify(result, null, 2) + '\n');
    if (await page.getByRole('button', { name: 'Dismiss notification' }).isVisible())
      await page.getByRole('button', { name: 'Dismiss notification' }).click();
    await page.getByRole('button', { name: 'Dismiss generation result' }).click();
    await page.locator('.word-timings summary').first().click();
    await page.getByRole('button', { name: 'Karaoke', exact: true }).click();
    const first = roman[0].words[0];
    await page.getByRole('slider', { name: 'Video playhead' }).fill(String((first.start + first.end) / 2));
    await expect(page.locator('.karaoke-active')).toHaveText(first.text);
    await page.screenshot({ path: `${directory}/${fixture.name}.png`, fullPage: true });
    if (fixture.name === 'creator' && process.env.TEST_TRANSLATION === '1') {
      await page.getByRole('button', { name: 'Create English translation locally' }).click();
      await expect(page.getByRole('button', { name: 'Show english captions' })).toHaveAttribute(
        'aria-pressed',
        'true',
        { timeout: 900000 },
      );
      result.englishTranslation = (await readCaptions()).map((c) => c.text).join(' ');
      await page.getByRole('button', { name: 'Show hinglish captions' }).click();
      await page.getByRole('button', { name: 'Show english captions' }).click();
      await expect(page.getByRole('button', { name: 'Show english captions' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      result.translationCached = true;
      await writeFile(`${directory}/${fixture.name}.json`, JSON.stringify(result, null, 2) + '\n');
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Captions', exact: true }).click();
    await page.getByRole('button', { name: 'Switch to dark mode' }).click();
    await page.screenshot({ path: `${directory}/${fixture.name}-mobile.png`, fullPage: true });
    await page.getByRole('button', { name: 'Switch to light mode' }).click();
    console.log('RESULT', JSON.stringify(result, null, 2));
  }
  await writeFile(
    `${directory}/summary.json`,
    JSON.stringify({ results, errors, outgoingBodies: requests.filter((r) => r.bytes > 0) }, null, 2) + '\n',
  );
  assert(
    results.every((r) => !r.error),
    'At least one speech clip failed. See summary.json.',
  );
  assert.equal(errors.length, 0, 'Browser errors occurred.');
  assert(
    requests.every((r) => r.method === 'GET' || r.method === 'HEAD'),
    'Local flow attempted a data upload.',
  );
  console.log('HINGLISH REAL TESTS COMPLETE');
} finally {
  await context.close();
}
