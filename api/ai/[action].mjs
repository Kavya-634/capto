// Vercel serverless entry for the optional text-only AI route. Same handler as server/index.mjs.
// Without OPENAI_API_KEY the route answers "not configured" and every local feature still works.
import { createAiHandler } from '../../server/ai.mjs';

const originsFromEnv = () => {
  const explicit = (process.env.CAPTO_APP_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  // Vercel exposes the deployment host; accept it so previews work without manual config.
  const auto = [process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_URL]
    .filter(Boolean)
    .map((h) => `https://${h}`);
  return [...new Set([...explicit, ...auto])];
};

const handler = createAiHandler({
  apiKey: process.env.OPENAI_API_KEY || '',
  model: process.env.CAPTO_AI_MODEL || 'gpt-4o-mini',
  origins: originsFromEnv(),
  // Serverless instances are ephemeral; derive the CSRF token from a stable secret.
  csrfSecret: process.env.CAPTO_CSRF_SECRET || process.env.OPENAI_API_KEY || '',
});

export default function vercelHandler(req, res) {
  // Vercel strips nothing from req.url for file-based routes; the handler keys off /api/ai/*.
  return handler(req, res);
}

export const config = { maxDuration: 60 };
