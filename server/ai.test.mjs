import { describe, it, expect, vi } from 'vitest';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createAiHandler, validateRequest, validateResponse } from './ai.mjs';

const words = [
  { id: 'line_0_word_0', text: 'namste' },
  { id: 'line_0_word_1', text: 'friends' },
];
async function withServer(options, run) {
  const server = createServer(createAiHandler(options));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}
describe('server-only AI safety', () => {
  it('runs without a key and does not expose secrets in status', async () => {
    await withServer({}, async (base) => {
      const s = await (await fetch(base + '/api/ai/status')).json();
      expect(s.available).toBe(false);
      expect(s).not.toHaveProperty('apiKey');
    });
  });
  it('requires consent, text-only payloads and stable IDs', () => {
    expect(() => validateRequest({ view: 'hinglish', words })).toThrow(/consent/);
    expect(() =>
      validateRequest({ consent: true, view: 'hinglish', words: [{ ...words[0], start: 1 }] }),
    ).toThrow(/Only/);
    expect(() => validateRequest({ consent: true, view: 'hinglish', words: [words[0], words[0]] })).toThrow(
      /duplicate/,
    );
    expect(() => validateResponse({ words: [{ id: 'x', text: 'oops' }] }, words)).toThrow();
  });
  it('blocks cross-origin and missing-CSRF posts before any provider call', async () => {
    const provider = vi.fn();
    await withServer({ apiKey: 'test-server-secret', fetchImpl: provider }, async (base) => {
      for (const origin of ['https://evil.invalid', 'http://127.0.0.1:4200']) {
        const r = await fetch(base + '/api/ai/improve', {
          method: 'POST',
          headers: { Origin: origin, 'Content-Type': 'application/json' },
          body: JSON.stringify({ consent: true, view: 'hinglish', words }),
        });
        expect(r.status).toBe(403);
      }
      expect(provider).not.toHaveBeenCalled();
    });
  });
  it('sends only words to the provider and validates text-only suggestions', async () => {
    let request;
    const provider = vi.fn(async (url, options) => {
      request = { url, options };
      return new Response(
        JSON.stringify({
          choices: [
            { message: { content: JSON.stringify({ words: [{ ...words[0], text: 'namaste' }, words[1]] }) } },
          ],
        }),
        { status: 200 },
      );
    });
    await withServer({ apiKey: 'test-server-secret', fetchImpl: provider }, async (base) => {
      const status = await (await fetch(base + '/api/ai/status')).json();
      const r = await fetch(base + '/api/ai/improve', {
        method: 'POST',
        headers: {
          Origin: 'http://127.0.0.1:4200',
          'Content-Type': 'application/json',
          'X-Capto-CSRF': status.csrf,
        },
        body: JSON.stringify({ consent: true, view: 'hinglish', words }),
      });
      const body = await r.json();
      expect(r.status).toBe(200);
      expect(body.words[0].text).toBe('namaste');
      expect(JSON.stringify(body)).not.toContain('test-server-secret');
      expect(request.options.headers.Authorization).toBe('Bearer test-server-secret');
      expect(JSON.parse(JSON.parse(request.options.body).messages[1].content)).toEqual({
        view: 'hinglish',
        words,
      });
    });
  });
  it('refuses changed mappings and redacts provider errors', async () => {
    await withServer(
      {
        apiKey: 'test-server-secret',
        fetchImpl: async () => new Response('provider error with secret', { status: 401 }),
      },
      async (base) => {
        const s = await (await fetch(base + '/api/ai/status')).json();
        const r = await fetch(base + '/api/ai/improve', {
          method: 'POST',
          headers: {
            Origin: 'http://127.0.0.1:4200',
            'Content-Type': 'application/json',
            'X-Capto-CSRF': s.csrf,
          },
          body: JSON.stringify({ consent: true, view: 'hinglish', words }),
        });
        expect(r.status).toBe(502);
        expect(await r.text()).not.toContain('provider error with secret');
      },
    );
  });
});
