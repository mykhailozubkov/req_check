# Cloudflare deployment

## Architecture

The `req-check` Worker serves the React UI, static assets, and `/api/review` together. Its runtime entry point is `worker/index.ts`; `vite.config.ts` reads `wrangler.jsonc`. Deployment does not depend on Sites registration, connector bindings, or its mock sign-in. Old starter helpers are retained as unused source.

The application is public at https://req-check.mykhailo-zubkov.workers.dev. Visitors can open the UI, prepared demo, and live AI analysis without signing in or entering a personal key. Analysis uses the server-held `OPENROUTER_API_KEY` and the fixed `openrouter/free` route. The upstream request only permits zero-price providers; client input cannot select another model or credential.

Cloudflare serves public static assets directly. API routes run through the Worker first (`assets.run_worker_first: ["/api/*"]`), and unmatched page requests fall through to server rendering. Preview URLs are disabled. The Worker does not invoke the optional Access verifier and does not require `ACCESS_TEAM_DOMAIN` or `ACCESS_AUD`. Existing Cloudflare Access configuration is not changed by deployment. The standalone verifier and its tests remain in the source for possible future private access; they are not active in the deployed request path.

## Local checks

```sh
npm ci
npm test
npm run typecheck
npm run dev
```

`npm run build` creates the production build. `npm start` previews it in the Workers runtime. Both development and production currently serve the application without requiring sign-in.

## First deployment

1. Authenticate in the intended Cloudflare account:

   ```sh
   npx wrangler login
   npx wrangler whoami
   ```

2. Run `npm run deploy:dry-run`. This builds the app, checks that API routes run through the Worker first, and validates the deployment bundle without publishing.
3. Run `npm run deploy` and save the returned `workers.dev` URL.
4. Store the application key through `npx wrangler secret put OPENROUTER_API_KEY --name req-check`. Enter it only at the terminal prompt. Never add it to Wrangler `vars`, source files, or Git.
5. Verify `/api/status` reports OpenRouter configured, the app and static assets load, and a malformed review request is rejected before contacting a provider.

Run `node scripts/smoke.mjs` after deployment to check the home page, every JavaScript/CSS URL referenced by its HTML, the public provider status, and input validation without consuming the model quota.

`keep_vars` preserves dashboard-managed variables on subsequent CLI deployments. Access variables left from an earlier configuration do not enable the optional verifier. No Cloudflare Access policy is created, edited, or deleted by this deployment. Do not put API keys in Wrangler `vars`.

`/api/status` returns only the provider, model route, free status, and whether the server secret is configured. It never returns credentials. Requests use strict JSON Schema and `provider.require_parameters` with both prompt and completion maximum prices set to zero. There is no paid-model fallback or automatic retry. The actual selected free model appears in the review metadata.

The `AI_RATE_LIMITER` binding permits 5 review attempts per IP per minute in each Cloudflare location. It is a burst control, not a global daily quota. OpenRouter independently enforces account-level free usage limits. Exhausted limits produce a safe 429 response with Retry-After. Provider authentication/configuration failures produce a generic service-unavailable error, not an invitation for users to enter their own keys.

## D1

D1 is suitable for saved stories, review history, and BA decisions. The current feature set is deliberately session-only, so no unused database is provisioned and no documents are persisted.

When persistence is implemented:

1. Define data ownership, retention, and deletion behavior for team documents.
2. Create the database with `npx wrangler d1 create req-check`.
3. Add the returned real ID as a `DB` entry in `wrangler.jsonc` under `d1_databases`. Do not use an invented or example ID.
4. Add versioned SQL migrations and apply them locally, then remotely.
5. Use the existing D1/Drizzle entry point in `db/index.ts`. Before shared persistence goes live, introduce authentication and authorize data reads and writes per owner or team.

Do not store provider API keys in review records. Large binary uploads would need separate object storage, not D1 rows.

## Optional GitHub deployment automation

Cloudflare Workers Builds can connect the `mykhailozubkov/req_check` repository. Its project root is `/` (the local `storylens` folder is already the GitHub repository root), build command `npm run build`, and deploy command `npx wrangler deploy --config dist/server/wrangler.json --keep-vars`. GitHub integration must be authorized separately in the Cloudflare dashboard; CLI deployment alone does not establish it.

## References

- https://developers.cloudflare.com/workers/configuration/cloudflare-access/
- https://developers.cloudflare.com/workers/vite-plugin/
- https://developers.cloudflare.com/d1/
- https://openrouter.ai/docs/guides/routing/routers/free-router
- https://openrouter.ai/docs/guides/features/structured-outputs
