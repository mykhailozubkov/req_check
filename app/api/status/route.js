import { env } from 'cloudflare:workers';
import { DEFAULT_MODEL } from '../../../lib/review.mjs';

export const dynamic = 'force-dynamic';
export async function GET() {
  return Response.json({ configured: !!env.OPENROUTER_API_KEY, provider: 'OpenRouter', model: DEFAULT_MODEL, free: true }, {
    headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}
