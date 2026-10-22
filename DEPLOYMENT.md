# Cloudflare deployment

## Architecture

The `req-check` Worker serves the React UI, static assets, and `/api/review` together. Its runtime entry point is `worker/index.ts`; `vite.config.ts` reads `wrangler.jsonc`. Deployment does not depend on Sites registration, connector bindings, or its mock sign-in. Old starter helpers are retained as unused source.

The application is currently public at https://req-check.mykhailo-zubkov.workers.dev. Visitors can open the UI and the prepared demo without signing in. Live AI requests require each visitor's own Claude API key; there is no shared billable server credential.

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
4. Verify that an anonymous GET to `/` returns the app, its static assets load, and a same-origin POST to `/api/review` without a provider key returns the API's missing-key error.

Run `node scripts/smoke.mjs` after deployment to check the home page, every JavaScript/CSS URL referenced by its HTML, and the missing-key API response without making a billable AI request.

`keep_vars` preserves dashboard-managed variables on subsequent CLI deployments. Access variables left from an earlier configuration do not enable the optional verifier. No Cloudflare Access policy is created, edited, or deleted by this deployment. Do not put API keys in Wrangler `vars`.

The app currently uses each user's own Claude API key, held in tab memory. A shared Anthropic secret is not required for this deployment. AI output quality and a real provider request must still be checked with an authorized user's key; no sample result substitutes for an API failure.

## D1

D1 is suitable for saved stories, review history, and BA decisions. The current feature set is deliberately session-only, so no unused database is provisioned and no documents are persisted.

When persistence is implemented:

1. Define data ownership, retention, and deletion behavior for team documents.
2. Create the database with `npx wrangler d1 create req-check`.
3. Add the returned real ID as a `DB` entry in `wrangler.jsonc` under `d1_databases`. Do not use an invented or example ID.
4. Add versioned SQL migrations and apply them locally, then remotely.
5. Use the existing D1/Drizzle entry point in `db/index.ts`. Before shared persistence goes live, introduce authentication and authorize data reads and writes per owner or team.

Do not store Claude API keys in review records. Large binary uploads would need separate object storage, not D1 rows.

## Optional GitHub deployment automation

Cloudflare Workers Builds can connect the `mykhailozubkov/req_check` repository. Its project root is `/` (the local `storylens` folder is already the GitHub repository root), build command `npm run build`, and deploy command `npx wrangler deploy --config dist/server/wrangler.json --keep-vars`. GitHub integration must be authorized separately in the Cloudflare dashboard; CLI deployment alone does not establish it.

## References

- https://developers.cloudflare.com/workers/configuration/cloudflare-access/
- https://developers.cloudflare.com/workers/vite-plugin/
- https://developers.cloudflare.com/d1/
