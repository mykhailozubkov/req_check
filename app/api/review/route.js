import { env } from 'cloudflare:workers';
import { handleReviewRequest, ReviewError } from '../../../lib/review.mjs';

export const dynamic = 'force-dynamic';

// Only the server-held secret can authenticate upstream requests. Client input
// cannot select another model, key, or provider endpoint.
export async function POST(request) {
  return handleReviewRequest(request, {
    apiKey: env.OPENROUTER_API_KEY,
    rateLimiter: async () => {
      if (!env.AI_RATE_LIMITER) {
        if (import.meta.env.DEV) return true;
        throw new ReviewError('AI review is temporarily unavailable.', 503);
      }
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const { success } = await env.AI_RATE_LIMITER.limit({ key: `req-check:${ip}` });
      return success;
    },
  });
}
