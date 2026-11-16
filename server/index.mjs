import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { createAiHandler } from './ai.mjs';

export function startServer() {
  const port = Number(process.env.CAPTO_API_PORT || 4202);
  const host = process.env.CAPTO_API_HOST || '127.0.0.1';
  const server = createServer(
    createAiHandler({
      apiKey: process.env.OPENAI_API_KEY || '',
      model: process.env.CAPTO_AI_MODEL || 'gpt-4o-mini',
      origins: (
        process.env.CAPTO_APP_ORIGINS || 'http://127.0.0.1:4200,http://localhost:4200,http://127.0.0.1:4201'
      )
        .split(',')
        .map((s) => s.trim()),
    }),
  );
  server.requestTimeout = 100000;
  server.headersTimeout = 10000;
  server.listen(port, host, () =>
    console.log(
      `Capto text-only AI API on http://${host}:${port} · ${process.env.OPENAI_API_KEY ? 'configured' : 'no key: local features remain available'}`,
    ),
  );
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) startServer();
