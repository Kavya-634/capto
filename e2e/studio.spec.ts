import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';

// Deterministic UI/edge-case tests only. scripts/test-real-speech.mjs uses the actual WASM model.
async function mockSpeech(page: Page, mode: 'success' | 'pending' | 'error' = 'success') {
  await page.addInitScript((initialMode) => {
    const scope = window as unknown as {
      __speechMode: string;
      __speechRequests: { language: string; samples: number; tier?: string }[];
    };
    scope.__speechMode = initialMode;
    scope.__speechRequests = [];
    const OriginalWorker = window.Worker;
    class TranslationWorker {
      onmessage: ((event: { data: unknown }) => void) | null = null;
      terminate() {}
      postMessage(request: { lines: { id: string; text: string }[] }) {
        setTimeout(
          () =>
            this.onmessage?.({
              data: {
                type: 'complete',
                translated: request.lines.map((line, i) => ({
                  id: line.id,
                  text: i === 0 ? 'Hello friends. Today we will learn.' : 'Tell your story clearly.',
                })),
              },
            }),
          50,
        );
      }
    }
    class SpeechWorker {
      onmessage: ((event: { data: unknown }) => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(url: string | URL, options?: WorkerOptions) {
        if (String(url).includes('translate.worker'))
          return new TranslationWorker() as unknown as SpeechWorker;
        if (!String(url).includes('transcribe.worker'))
          return new OriginalWorker(url, options) as unknown as SpeechWorker;
      }
      terminate() {
        /* Deliberately let delayed messages fire to test stale-result protection. */
      }
      postMessage(request: { id: number; language: string; audio: Float32Array; tier?: string }) {
        scope.__speechRequests.push({
          language: request.language,
          samples: request.audio.length,
          tier: request.tier,
        });
        const mode = scope.__speechMode;
        setTimeout(
          () => this.onmessage?.({ data: { id: request.id, type: 'progress', stage: 'listening' } }),
          20,
        );
        const groups =
          request.language !== 'english'
            ? [
                ['नमस्ते', 'दोस्तों।', 'आज', 'हम', 'सीखेंगे।'],
                ['साफ', 'आवाज़', 'अपनी', 'कहानी', 'बताइए।'],
              ]
            : [
                ['Hello', 'everyone.', 'Today', 'we', 'create.'],
                ['Clear', 'captions', 'tell', 'your', 'story.'],
              ];
        const captions = groups.map((group, i) => {
          const words = group.map((text, j) => ({
            text,
            start: +(i * 3 + 0.1 + j * 0.35).toFixed(2),
            end: +(i * 3 + 0.32 + j * 0.35).toFixed(2),
          }));
          return {
            id: `speech-${i}`,
            text: group.join(' '),
            start: words[0].start,
            end: words.at(-1)!.end,
            words,
            timingSource: 'model',
          };
        });
        setTimeout(
          () =>
            this.onmessage?.({
              data:
                mode === 'error'
                  ? { id: request.id, type: 'error', message: 'Model download unavailable.' }
                  : { id: request.id, type: 'complete', captions, warnings: [], seconds: 0.6 },
            }),
          mode === 'pending' ? 2500 : 600,
        );
      }
    }
    window.Worker = SpeechWorker as unknown as typeof Worker;
  }, mode);
}
async function panel(page: Page, name: string) {
  const tabs = page.locator('.mobile-editor-tabs');
  if (await tabs.isVisible()) await tabs.getByRole('button', { name, exact: true }).click();
}
async function demo(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open studio' }).click();
  await expect
    .poll(() => page.locator('video').evaluate((v) => (v as HTMLVideoElement).duration))
    .toBeGreaterThan(1);
}
async function generate(page: Page) {
  await panel(page, 'Captions');
  await page.getByRole('button', { name: 'Generate Captions', exact: true }).click();
  await expect(page.locator('.result-complete')).toContainText('Review');
}
/** The generation settings collapse once captions exist; expand them when a test needs the controls. */
async function openGenerateSettings(page: Page) {
  await panel(page, 'Captions');
  const toggle = page.locator('.speech-panel .panel-toggle');
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
}
/** Translation / AI tools live in a collapsed drawer under the script tabs. */
async function openLanguageTools(page: Page) {
  await panel(page, 'Captions');
  const toggle = page.locator('.language-panel .panel-toggle');
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
}
async function mode(page: Page, value: string) {
  await page.evaluate((value) => {
    (window as unknown as { __speechMode: string }).__speechMode = value;
  }, value);
}

test.beforeEach(async ({ page }) => {
  page.on('dialog', (dialog) => dialog.accept());
});

test('Hinglish script switching, word edits, merge and split preserve original timing', async ({ page }) => {
  await mockSpeech(page);
  await demo(page);
  await panel(page, 'Captions');
  await page.getByLabel('Spoken language').selectOption('hinglish');
  await generate(page);
  await expect(page.getByLabel('Caption 1 text', { exact: true })).toHaveValue(
    'namaste doston. aaj hum seekhenge.',
  );
  await page.locator('.word-timings summary').first().click();
  const start = await page.getByLabel('Caption 1 word 1 start', { exact: true }).inputValue();
  const end = await page.getByLabel('Caption 1 word 1 end', { exact: true }).inputValue();
  await page.getByLabel('Caption 1 word 1 text', { exact: true }).fill('Namaste');
  await page.getByRole('button', { name: 'Show hindi captions', exact: true }).click();
  await expect(page.getByLabel('Caption 1 text', { exact: true })).toHaveValue('नमस्ते दोस्तों। आज हम सीखेंगे।');
  await page.getByRole('button', { name: 'Show hinglish captions', exact: true }).click();
  await expect(page.getByLabel('Caption 1 word 1 text', { exact: true })).toHaveValue('Namaste');
  await expect(page.getByLabel('Caption 1 word 1 start', { exact: true })).toHaveValue(start);
  await expect(page.getByLabel('Caption 1 word 1 end', { exact: true })).toHaveValue(end);
  await page.getByRole('button', { name: 'Split caption 1 after word 2', exact: true }).click();
  await expect(page.locator('.caption-item')).toHaveCount(3);
  await page.getByRole('button', { name: 'Merge caption 1 with next', exact: true }).click();
  await expect(page.locator('.caption-item')).toHaveCount(2);
  await expect(page.getByLabel('Caption 1 text', { exact: true })).toHaveValue(
    'Namaste doston. aaj hum seekhenge.',
  );
  const count = await page.evaluate(
    () => (window as unknown as { __speechRequests: unknown[] }).__speechRequests.length,
  );
  expect(count).toBe(1);
});

test('English translation is text only, cached, and keeps Hindi/Hinglish word times intact', async ({
  page,
}) => {
  await mockSpeech(page);
  await demo(page);
  await panel(page, 'Captions');
  await page.getByLabel('Spoken language').selectOption('hinglish');
  await generate(page);
  await openLanguageTools(page);
  await page.getByRole('button', { name: 'Create English translation locally', exact: true }).click();
  await expect(page.getByLabel('Caption 1 text', { exact: true })).toHaveValue(
    'Hello friends. Today we will learn.',
  );
  await expect(page.locator('.script-help').first()).toContainText('line timing only');
  await page.getByRole('button', { name: 'Show hinglish captions', exact: true }).click();
  await expect(page.getByLabel('Caption 1 text', { exact: true })).toHaveValue(
    'namaste doston. aaj hum seekhenge.',
  );
  await page.getByRole('button', { name: 'Show english captions', exact: true }).click();
  await expect(page.getByLabel('Caption 1 text', { exact: true })).toHaveValue(
    'Hello friends. Today we will learn.',
  );
  expect(
    await page.evaluate(() => (window as unknown as { __speechRequests: unknown[] }).__speechRequests.length),
  ).toBe(1);
});

test('optional AI is disabled without key; correction preview is text-only and undoable', async ({
  page,
}) => {
  await page.route('**/api/ai/status', (route) =>
    route.fulfill({ json: { available: false, csrf: 'test', model: 'mock', provider: 'OpenAI' } }),
  );
  await mockSpeech(page);
  await demo(page);
  await generate(page);
  await openLanguageTools(page);
  await expect(page.getByRole('button', { name: 'Improve with AI', exact: true })).toBeDisabled();
  await page.route('**/api/ai/status', (route) =>
    route.fulfill({ json: { available: true, csrf: 'test', model: 'mock', provider: 'OpenAI' } }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Open studio' }).click();
  await generate(page);
  await openLanguageTools(page);
  let sent: { words: { id: string; text: string }[]; consent: boolean } | null = null;
  await page.route('**/api/ai/improve', async (route) => {
    sent = route.request().postDataJSON();
    expect(sent!.consent).toBe(true);
    expect(sent!.words.every((w) => Object.keys(w).sort().join(',') === 'id,text')).toBe(true);
    await route.fulfill({
      json: { words: sent!.words.map((w, i) => ({ ...w, text: i === 0 ? 'Hi' : w.text })) },
    });
  });
  await page.getByRole('button', { name: 'Improve with AI', exact: true }).click();
  await expect(page.getByLabel('AI correction review')).toBeVisible();
  await expect(page.getByLabel('Caption 1 text', { exact: true })).toHaveValue(
    'Hello everyone. Today we create.',
  );
  await page.getByRole('button', { name: 'Apply suggestions', exact: true }).click();
  await expect(page.getByLabel('Caption 1 text', { exact: true })).toHaveValue(
    'Hi everyone. Today we create.',
  );
  await page.locator('.word-timings summary').first().click();
  await expect(page.getByLabel('Caption 1 word 1 start', { exact: true })).toHaveValue('0.1');
  await page.getByRole('button', { name: 'Undo caption edit' }).click();
  await expect(page.getByLabel('Caption 1 text', { exact: true })).toHaveValue(
    'Hello everyone. Today we create.',
  );
});

test('recognition quality tier is selectable, persisted, confirmed, and forwarded to the worker', async ({
  page,
}) => {
  await mockSpeech(page);
  await demo(page);
  await panel(page, 'Captions');
  const quality = page.getByLabel('Recognition quality');
  // English defaults to Fast; Hindi/Hinglish default to Accurate because the small model
  // measurably mishears Hindi. Until the user pins a tier, it follows the language.
  await expect(quality).toHaveValue('fast');
  await expect(page.locator('.model-note')).toContainText('250 MB');
  await page.getByLabel('Spoken language').selectOption('hindi');
  await expect(quality).toHaveValue('accurate');
  await expect(page.locator('.speech-footnote')).toContainText(/spelled by ear/);
  await page.getByLabel('Spoken language').selectOption('hinglish');
  await expect(quality).toHaveValue('accurate');
  await expect(page.locator('.speech-footnote')).toContainText(/English phrases spoken mid-sentence/);
  await page.getByLabel('Spoken language').selectOption('english');
  await expect(quality).toHaveValue('fast');
  // Pinning a tier stops it following the language.
  await quality.selectOption('accurate');
  await expect(page.locator('.model-note')).toContainText('1.1 GB');
  await page.getByLabel('Spoken language').selectOption('hindi');
  await page.getByLabel('Spoken language').selectOption('english');
  await expect(quality).toHaveValue('accurate');
  // The accurate tier asks for confirmation (auto-accepted by the beforeEach dialog handler).
  await generate(page);
  const requests = await page.evaluate(
    () => (window as unknown as { __speechRequests: { tier?: string }[] }).__speechRequests,
  );
  expect(requests.at(-1)?.tier).toBe('accurate');
  // Preference survives a reload.
  await page.reload();
  await page.getByRole('button', { name: 'Open studio' }).click();
  await panel(page, 'Captions');
  await expect(page.getByLabel('Recognition quality')).toHaveValue('accurate');
  await page.getByLabel('Recognition quality').selectOption('fast');
});

test('generation and tools panels collapse after captions exist so the list gets the space', async ({
  page,
}) => {
  await mockSpeech(page);
  await demo(page);
  await panel(page, 'Captions');
  const genToggle = page.locator('.speech-panel .panel-toggle');
  // Empty project: settings expanded, controls visible.
  await expect(genToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByLabel('Spoken language')).toBeVisible();
  const listBefore = await page.locator('.caption-list').boundingBox();
  await generate(page);
  // After captions arrive the settings collapse automatically; the action button stays.
  await expect(genToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByLabel('Spoken language')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Regenerate Captions', exact: true })).toBeVisible();
  await expect(genToggle).toContainText(/English · Fast/);
  // Tools drawer is collapsed too, but script tabs remain usable.
  await expect(page.locator('.language-panel .panel-toggle')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: 'Show hinglish captions', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Improve with AI', exact: true })).toBeHidden();
  // With both panels collapsed the list should own most of the sidebar on desktop, where the
  // column has a fixed height. (Before generation there is no language panel at all, so a
  // before/after ratio is not a fair comparison; the share of the panel is.)
  const listAfter = await page.locator('.caption-list').boundingBox();
  const column = await page.locator('.captions-panel').boundingBox();
  const isMobile = await page.locator('.mobile-editor-tabs').isVisible();
  if (!isMobile && listAfter && column) expect(listAfter.height / column.height).toBeGreaterThan(0.55);
  expect(listBefore).not.toBeNull();
  // Reopen and close by hand.
  await genToggle.click();
  await expect(page.getByLabel('Recognition quality')).toBeVisible();
  await genToggle.click();
  await expect(page.getByLabel('Recognition quality')).toBeHidden();
  await page.locator('.language-panel .panel-toggle').click();
  await expect(page.getByRole('button', { name: 'Improve with AI', exact: true })).toBeVisible();
});

test('sync slider shifts preview, timeline and subtitle exports together', async ({ page }) => {
  await mockSpeech(page);
  await demo(page);
  await generate(page);
  await panel(page, 'Preview');
  // Mock caption 1 spans 0.10–1.72s. At t=0.05 nothing shows; shift +0.5 → caption starts at 0.60.
  const slider = page.getByRole('slider', { name: 'Video playhead' });
  await slider.fill('0.3');
  await expect(page.getByTestId('caption-overlay')).toContainText('Hello');
  await page.getByLabel('Caption sync offset in seconds').fill('0.5');
  await expect(page.locator('.sync-control output')).toHaveText('+0.50s');
  await expect(page.getByTestId('caption-overlay')).toHaveCount(0); // 0.3 < 0.6 now
  await slider.fill('0.8');
  await expect(page.getByTestId('caption-overlay')).toContainText('Hello');
  // Exported SRT reflects the shift (0.10 + 0.5 = 0.60).
  await page.getByRole('button', { name: 'Export captions' }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: /SubRip captions/ }).click();
  const srt = await readFile((await (await pending).path())!, 'utf8');
  expect(srt).toContain('00:00:00,600 -->');
  // Reset returns to original timing.
  await page.getByRole('button', { name: 'Reset sync offset' }).click();
  await expect(page.locator('.sync-control output')).toHaveText('in sync');
});

test('style presets save to this device, reapply, persist across reload, and delete', async ({ page }) => {
  await mockSpeech(page);
  await demo(page);
  await generate(page);
  await panel(page, 'Style');
  await page.getByLabel('Font size', { exact: true }).fill('47');
  await page.getByRole('button', { name: /Capto lime/ }).click();
  await page.getByRole('button', { name: 'Save current style as preset' }).click();
  await page.getByLabel('New preset name').fill('Lime 47');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Apply saved preset Lime 47' })).toBeVisible();
  // Duplicate name is refused.
  await page.getByRole('button', { name: 'Save current style as preset' }).click();
  await page.getByLabel('New preset name').fill('lime 47');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.save-preset-form .caption-error')).toContainText('already exists');
  await page.keyboard.press('Escape');
  // Change style, then reapply the preset and confirm it restored.
  await page.getByLabel('Font size', { exact: true }).fill('20');
  await page.getByRole('button', { name: 'Apply saved preset Lime 47' }).click();
  await expect(page.getByLabel('Font size', { exact: true })).toHaveValue('47');
  await expect(page.getByLabel('Text color hex value', { exact: true })).toHaveValue('#D4FC79');
  // Survives reload (localStorage).
  await page.reload();
  await page.getByRole('button', { name: 'Open studio' }).click();
  await panel(page, 'Style');
  await expect(page.getByRole('button', { name: 'Apply saved preset Lime 47' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete saved preset Lime 47' }).click();
  await expect(page.getByRole('button', { name: 'Apply saved preset Lime 47' })).toHaveCount(0);
});

test('export dialog offers video burn-in and inspects the source before encoding', async ({ page }) => {
  await mockSpeech(page);
  await demo(page);
  await generate(page);
  await page.getByRole('button', { name: 'Export captions' }).click();
  await page.getByRole('button', { name: /Video with captions/ }).click();
  const dialog = page.locator('.video-export-dialog');
  await expect(dialog.getByRole('heading', { name: 'Burn it in.' })).toBeVisible();
  // Plan is derived from the real demo file: 320×568 H.264 + AAC.
  await expect(dialog.locator('.export-plan')).toContainText('320×568');
  await expect(dialog.locator('.export-plan')).toContainText(/AVC in MP4/);
  await expect(dialog.locator('.export-plan')).toContainText(/Copied unchanged/);
  await expect(dialog.getByRole('button', { name: 'Start export', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

test('homepage themes and real language selection; no prefilled captions', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Good videos. Great captions.' })).toBeVisible();
  await expect(page.locator('.preset-card')).toHaveCount(6);
  await page.getByLabel('Transcription language').selectOption('hindi');
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Try the Hindi demo' }).click();
  await panel(page, 'Captions');
  await expect(page.getByLabel('Spoken language')).toHaveValue('hindi');
  await expect(page.locator('.caption-item')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Generate Captions', exact: true })).toBeEnabled();
});

test('real video upload and manual caption editing, timing, undo and SRT export', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Upload video file').setInputFiles('public/demos/english.mp4');
  await panel(page, 'Captions');
  await page.getByRole('button', { name: 'Add first caption' }).click();
  await page.getByLabel('Caption 1 text', { exact: true }).fill('Your next adventure begins.');
  await page.getByLabel('Caption 1 end time').fill('1.5');
  await panel(page, 'Preview');
  await expect(page.getByTestId('caption-overlay')).toHaveText('Your next adventure begins.');
  await page.getByRole('slider', { name: 'Video playhead' }).fill('2');
  await expect(page.getByTestId('caption-overlay')).toHaveCount(0);
  await panel(page, 'Captions');
  await page.getByLabel('Caption 1 end time').fill('0');
  await expect(page.getByText('End must be after start.')).toBeVisible();
  await page.getByRole('button', { name: 'Export captions' }).click();
  await expect(page.locator('.toast')).toContainText('fix');
  await page.getByRole('button', { name: 'Undo caption edit' }).click();
  await page.getByRole('button', { name: 'Export captions' }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: /SubRip captions/ }).click();
  const download = await pending;
  const text = await readFile((await download.path())!, 'utf8');
  expect(text).toContain('00:00:01,500');
  expect(text).toContain('Your next adventure begins.');
});

test('generation progress, aligned word playback, review edits and JSON export', async ({ page }) => {
  await mockSpeech(page);
  await demo(page);
  await generate(page);
  await expect(page.locator('.caption-item')).toHaveCount(2);
  await page.locator('.word-timings summary').first().click();
  await expect(page.getByLabel('Caption 1 word 1 start', { exact: true })).toHaveValue('0.1');
  await panel(page, 'Style');
  for (const name of ['Bold & Punchy', 'One word at a time', 'Karaoke', 'Clean & Minimal', 'Boxed', 'Neon']) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true');
  }
  await page.getByRole('button', { name: 'One word at a time', exact: true }).click();
  await panel(page, 'Preview');
  await page.getByRole('slider', { name: 'Video playhead' }).fill('0.15');
  await expect(page.getByTestId('caption-overlay')).toHaveText('Hello');
  await page.getByRole('slider', { name: 'Video playhead' }).fill('0.4');
  await expect(page.getByTestId('caption-overlay')).toBeEmpty();
  await panel(page, 'Captions');
  await page.getByLabel('Caption 1 word 1 end', { exact: true }).fill('0.3');
  await expect(page.locator('.word-timings summary').first()).toContainText('Edited');
  await page.getByRole('button', { name: 'Export captions' }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: /Word timing data/ }).click();
  const file = await pending;
  const exported = JSON.parse(await readFile((await file.path())!, 'utf8'));
  expect(exported.captions[0].words[0].end).toBe(0.3);
  await page
    .getByLabel('Caption 1 text', { exact: true })
    .fill('These edited words now need a careful review.');
  await page.getByLabel('Caption 1 text', { exact: true }).press('Tab');
  await expect(page.locator('.word-timings summary').first()).toContainText('Estimated');
  await page.getByRole('button', { name: 'Undo caption edit' }).click();
  await expect(page.locator('.word-timings').first()).toBeVisible();
});

test('new word-timed and line animations follow real word intervals', async ({ page }) => {
  await mockSpeech(page);
  await demo(page);
  await generate(page);
  // Mock word 1 = "Hello" 0.10–0.32, word 2 = "everyone." 0.45–0.67, word 3 = "Today" 0.80–1.02.
  const seek = (t: number) => page.getByRole('slider', { name: 'Video playhead' }).fill(String(t));
  const pick = async (value: string) => {
    await panel(page, 'Style');
    await page.getByLabel('Animation', { exact: true }).selectOption(value);
    await panel(page, 'Preview');
  };
  const overlay = page.getByTestId('caption-overlay');

  // Word by word: future words hidden, spoken and past words visible.
  await pick('word-reveal');
  await seek(0.5);
  await expect(overlay.locator('.w-past')).toHaveCount(1);
  await expect(overlay.locator('.w-active')).toHaveText(/everyone\./);
  await expect(overlay.locator('.w-future')).toHaveCount(3);
  await expect(overlay.locator('.w-future').first()).toHaveCSS('opacity', '0');

  // Typewriter: active word partially typed, future words produce no text.
  await pick('typewriter');
  await seek(0.5); // ~23% through "everyone." → at least 1 letter, fewer than all 9
  const typed = await overlay.locator('.w-active').textContent();
  expect(typed?.trim().length).toBeGreaterThan(0);
  expect(typed?.trim().length).toBeLessThan('everyone.'.length);
  await seek(0.66); // ~95% through → fully typed
  await expect(overlay.locator('.w-active')).toHaveText(/^everyone\.\s*$/);
  await expect(overlay).toHaveText(/^Hello everyone\./);

  // Word pop: active word takes the highlight colour.
  await pick('word-pop');
  await panel(page, 'Style');
  await page.getByLabel('Highlight color hex value', { exact: true }).fill('#FF4FA3');
  await page.getByLabel('Highlight color hex value', { exact: true }).press('Enter');
  await panel(page, 'Preview');
  await seek(0.5);
  await expect(overlay.locator('.w-active')).toHaveCSS('color', 'rgb(255, 79, 163)');

  // Wave: active word lifted (transform), future words dimmed.
  await pick('wave');
  await seek(0.5);
  const transform = await overlay.locator('.w-active').evaluate((el) => getComputedStyle(el).transform);
  expect(transform).not.toBe('none');
  await expect(overlay.locator('.w-future').first()).toHaveCSS('opacity', '0.45');

  // Line animations attach the right class and still render the whole line.
  for (const value of ['zoom', 'blur', 'flip', 'bounce', 'shake', 'glitch']) {
    await pick(value);
    await seek(0.2);
    await expect(overlay.locator('.caption-text')).toHaveClass(new RegExp(`animation-${value}`));
    await expect(overlay).toContainText('Hello everyone.');
  }
});

test('palette, hex entry, dropper availability and font catalogue', async ({ page }) => {
  await mockSpeech(page);
  await demo(page);
  await generate(page);
  await panel(page, 'Style');

  // Brand palette swatches apply to text colour.
  await page.getByRole('button', { name: /Capto lime/ }).click();
  await expect(page.getByLabel('Text color hex value', { exact: true })).toHaveValue('#D4FC79');
  await panel(page, 'Preview');
  await expect(page.locator('.caption-text')).toHaveCSS('color', 'rgb(212, 252, 121)');
  await panel(page, 'Style');
  // Primary swatches are marked.
  await expect(page.locator('.color-swatches > button.primary')).toHaveCount(4);

  // Hex entry: shorthand expands, garbage reverts.
  const hex = page.getByLabel('Text color hex value', { exact: true });
  await hex.fill('#abc');
  await hex.press('Enter');
  await expect(hex).toHaveValue('#AABBCC');
  await hex.fill('not a colour');
  await hex.press('Enter');
  await expect(hex).toHaveValue('#AABBCC');

  // Dropper is shown only when the browser exposes EyeDropper.
  const hasDropper = await page.evaluate(() => 'EyeDropper' in window);
  await expect(page.getByRole('button', { name: 'Pick text color from screen' })).toHaveCount(
    hasDropper ? 1 : 0,
  );

  // Font catalogue: grouped, includes new faces, and the sample updates to the chosen family.
  const fontSelect = page.getByLabel('Font family', { exact: true });
  await expect(fontSelect.locator('optgroup')).toHaveCount(5);
  await fontSelect.selectOption({ label: 'Bebas Neue' });
  await expect(page.locator('.font-hint')).toHaveCSS('font-family', /Bebas Neue/);
  await fontSelect.selectOption({ label: 'Poppins · हिन्दी' });
  await expect(page.locator('.font-hint')).toContainText('Hindi and English in one design');
  await panel(page, 'Preview');
  await expect(page.locator('.caption-text')).toHaveCSS('font-family', /Poppins/);
});

test('Hindi selection is passed to worker and applies Devanagari font', async ({ page }) => {
  await mockSpeech(page);
  await demo(page);
  await panel(page, 'Captions');
  await page.getByLabel('Spoken language').selectOption('hindi');
  await generate(page);
  await expect(page.getByLabel('Caption 1 text', { exact: true })).toHaveValue('नमस्ते दोस्तों। आज हम सीखेंगे।');
  const requests = await page.evaluate(
    () =>
      (window as unknown as { __speechRequests: { language: string; samples: number }[] }).__speechRequests,
  );
  expect(requests[0].language).toBe('hindi');
  expect(requests[0].samples).toBeGreaterThan(16000);
  await panel(page, 'Preview');
  await expect(page.locator('.caption-text')).toHaveCSS('font-family', /Noto Sans Devanagari/);
  await openGenerateSettings(page);
  await page.getByLabel('Spoken language').selectOption('english');
  await expect(page.getByLabel('Caption 1 text', { exact: true })).toHaveValue('नमस्ते दोस्तों। आज हम सीखेंगे।');
});

test('cancellation leaves existing captions safe and ignores late results', async ({ page }) => {
  await mockSpeech(page);
  await demo(page);
  await generate(page);
  await page.getByLabel('Caption 1 text', { exact: true }).fill('Keep this edited caption.');
  await mode(page, 'pending');
  await page.getByRole('button', { name: 'Regenerate Captions', exact: true }).click();
  await expect(page.locator('.generation-status')).toContainText('Listening');
  await expect(page.getByLabel('Caption 1 text', { exact: true })).toBeDisabled();
  await expect(page.getByLabel('Spoken language')).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel generation' }).click();
  await expect(page.locator('.result-cancelled')).toContainText('unchanged');
  await page.waitForTimeout(2800); // Intentionally wait past the mock's late-result deadline.
  await expect(page.getByLabel('Caption 1 text', { exact: true })).toHaveValue('Keep this edited caption.');
  await mode(page, 'success');
  await page.getByRole('button', { name: 'Regenerate Captions', exact: true }).click();
  await expect(page.locator('.result-complete')).toBeVisible();
  await page.getByRole('button', { name: 'Undo caption edit' }).click();
  await expect(page.getByLabel('Caption 1 text', { exact: true })).toHaveValue('Keep this edited caption.');
});

test('model errors are recoverable without replacing manual work', async ({ page }) => {
  await mockSpeech(page, 'error');
  await demo(page);
  await panel(page, 'Captions');
  await page.getByRole('button', { name: 'Add first caption' }).click();
  await page.getByLabel('Caption 1 text', { exact: true }).fill('Keep me.');
  await page.getByRole('button', { name: 'Regenerate Captions', exact: true }).click();
  await expect(page.locator('.result-error')).toContainText('Model download unavailable');
  await expect(page.getByLabel('Caption 1 text', { exact: true })).toHaveValue('Keep me.');
  await expect(page.getByRole('button', { name: 'Regenerate Captions', exact: true })).toBeEnabled();
});

test('result box can be dismissed and clears itself on the next run', async ({ page }) => {
  await mockSpeech(page);
  await demo(page);
  await generate(page);
  const result = page.locator('.generation-result');
  await expect(result).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss generation result' }).click();
  await expect(result).toHaveCount(0);
  // Captions are untouched by dismissing.
  await expect(page.locator('.caption-item')).toHaveCount(2);
  // An error result is dismissible too.
  await mode(page, 'error');
  await page.getByRole('button', { name: 'Regenerate Captions', exact: true }).click();
  await expect(page.locator('.result-error')).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss generation result' }).click();
  await expect(page.locator('.result-error')).toHaveCount(0);
  await expect(page.locator('.caption-item')).toHaveCount(2);
});

test('over-limit videos show a friendly warning and still allow manual editing', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Upload video file').setInputFiles('e2e/fixtures/speech/over-limit.mp4');
  await panel(page, 'Captions');
  await expect(page.locator('.speech-warning')).toContainText('5 minutes');
  await expect(page.getByRole('button', { name: 'Generate Captions', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Add first caption' }).click();
  await expect(page.getByLabel('Caption 1 text', { exact: true })).toBeEditable();
});

test('video without decodable audio fails before downloading a model', async ({ page }) => {
  await mockSpeech(page);
  await page.goto('/');
  await page.getByLabel('Upload video file').setInputFiles('e2e/fixtures/flower.mp4');
  await panel(page, 'Captions');
  await page.getByRole('button', { name: 'Generate Captions', exact: true }).click();
  await expect(page.locator('.result-error')).toContainText(/audio|silent/);
  expect(
    await page.evaluate(() => (window as unknown as { __speechRequests: unknown[] }).__speechRequests),
  ).toHaveLength(0);
});

test('actual playback, seek and loop controls', async ({ page }) => {
  await demo(page);
  await panel(page, 'Preview');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect
    .poll(() => page.locator('video').evaluate((v) => (v as HTMLVideoElement).currentTime))
    .toBeGreaterThan(0.2);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('slider', { name: 'Video playhead' }).fill('5');
  await page.getByRole('button', { name: 'Back 5 seconds' }).click();
  await expect(page.getByRole('slider', { name: 'Video playhead' })).toHaveValue('0');
  await page.getByRole('button', { name: 'Loop playback' }).click();
  const duration = await page.locator('video').evaluate((v) => (v as HTMLVideoElement).duration);
  await page.getByRole('slider', { name: 'Video playhead' }).fill(String(duration - 0.1));
  await page.locator('video').evaluate((v) => {
    const video = v as HTMLVideoElement;
    video.addEventListener('seeked', () => {
      if (video.currentTime < 1) video.dataset.loopObserved = 'true';
    });
  });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('video')).toHaveAttribute('data-loop-observed', 'true');
});

test('drag/drop opens the local editor and invalid files get feedback', async ({ page }) => {
  await page.goto('/');
  await page
    .getByLabel('Upload video file')
    .setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not video') });
  await expect(page.locator('.toast')).toContainText('Please choose a video');
  const data = await page.evaluateHandle(
    (encoded) => {
      const transfer = new DataTransfer();
      transfer.items.add(
        new File([Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))], 'dropped.mp4', {
          type: 'video/mp4',
        }),
      );
      return transfer;
    },
    (await readFile('public/demos/english.mp4')).toString('base64'),
  );
  await page.locator('.upload-zone').dispatchEvent('drop', { dataTransfer: data });
  await panel(page, 'Preview');
  await expect(page.locator('video')).toBeVisible();
});

test('accessible generation controls and responsive panels', async ({ page }) => {
  test.setTimeout(60000); // Several full axe scans plus twelve layout transitions.
  await mockSpeech(page);
  await page.goto('/');
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Open studio' }).click();
  await panel(page, 'Captions');
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
  await generate(page);
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
  for (const width of [320, 390, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    for (const name of ['Preview', 'Captions', 'Style']) {
      await panel(page, name);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
});
