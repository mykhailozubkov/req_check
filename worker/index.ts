import handler from 'vinext/server/fetch-handler';
import { accessDenied, verifyAccess } from '../lib/access.mjs';

export default {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    // Vite replaces this with false in the production bundle. There is no
    // environment-variable or request-header switch that disables access.
    if (!import.meta.env.DEV) {
      const access = await verifyAccess(request, env);
      if (!access.allowed) return accessDenied(access.status);
    }
    const response = await handler.fetch(request, env, ctx);
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'private, no-store');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'same-origin');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
};
