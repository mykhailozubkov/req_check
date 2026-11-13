import handler from 'vinext/server/fetch-handler';

export default {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    // The application is public. AI requests use the server's free OpenRouter route;
    // Cloudflare Access policies are not configured or modified by this Worker.
    const response = await handler.fetch(request, env, ctx);
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'private, no-store');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'same-origin');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
};
