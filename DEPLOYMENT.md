# Cloudflare deployment

## Architecture

The `req-check` Worker serves the React UI, static assets, and `/api/review` together. Its runtime entry point is `worker/index.ts`; `vite.config.ts` reads `wrangler.jsonc`. Deployment does not depend on Sites registration, connector bindings, or its mock sign-in. Old starter helpers are retained as unused source.

Cloudflare Access restricts sign-in to the company domain. The Worker separately verifies the signed Access JWT with `jose`: issuer, audience, expiration, RS256 signature, and the exact email domain `cleveroad.com`. Request headers containing an email without a valid JWT do not grant access.

Static assets must run through the Worker (`assets.run_worker_first: true`). Preview URLs are disabled. Without `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD`, the production Worker returns 503 and does not serve the application. Without a valid token it returns 401; valid identities outside the configured email domain are rejected. Local `npm run dev` bypasses the gate through Vite's compile-time development flag; the production build has no bypass switch.

## Local checks

```sh
npm ci
npm test
npm run typecheck
npm run dev
```

`npm run build` creates the production build. `npm start` previews it in the Workers runtime with the production access gate enabled. To browse the interface locally use the development server; unit tests verify successful JWT authorization using locally generated signing keys.

## First deployment

1. Authenticate in the intended Cloudflare account:

   ```sh
   npx wrangler login
   npx wrangler whoami
   ```

2. Run `npm run deploy:dry-run`. This builds the app, checks that the generated configuration keeps the Worker before assets, and validates the deployment bundle without publishing.
3. Run `npm run deploy`. The first deployment is locked until Access has been configured. Save the returned `workers.dev` URL.
4. In Cloudflare, open **Workers & Pages → req-check → Access** and protect this Worker's production traffic. Allow the email domain **cleveroad.com**. Alternatively, create a self-hosted app in **Zero Trust → Access → Applications** for the complete Worker hostname (no path restriction). Do not add a bypass/everyone policy.
5. Configure the login method. One-time PIN verifies ownership of the email address; use an existing corporate identity provider if the organization requires one. Initial Cloudflare One setup, plan acceptance, and identity provider administration may require the account owner.
6. From that Access application copy its **Application Audience (AUD)** and the **team domain** (`your-team.cloudflareaccess.com`). Under the Worker's Settings → Variables and Secrets add these server-side text variables:

   | Name | Value |
   | --- | --- |
   | `ACCESS_TEAM_DOMAIN` | The real team domain from Cloudflare Access |
   | `ACCESS_AUD` | The real audience tag of this application |
   | `ACCESS_ALLOWED_EMAIL_DOMAIN` | `cleveroad.com` (already configured) |

   `keep_vars` preserves dashboard-managed variables on subsequent CLI deployments. Do not put API keys in Wrangler `vars`.

7. Verify that an anonymous visit redirects to Access, an allowed company user can open the app, and another domain is denied. Verify the API and a static asset too, not just `/`.

The app currently uses each user's own Claude API key, held in tab memory. A shared Anthropic secret is not required for this deployment. AI output quality and a real provider request must still be checked with an authorized user's key; no sample result substitutes for an API failure.

## D1

D1 is suitable for saved stories, review history, and BA decisions. The current feature set is deliberately session-only, so no unused database is provisioned and no documents are persisted.

When persistence is implemented:

1. Define data ownership, retention, and deletion behavior for team documents.
2. Create the database with `npx wrangler d1 create req-check`.
3. Add the returned real ID as a `DB` entry in `wrangler.jsonc` under `d1_databases`. Do not use an invented or example ID.
4. Add versioned SQL migrations and apply them locally, then remotely.
5. Use the existing D1/Drizzle entry point in `db/index.ts`, and authorize data reads and writes by the verified identity.

Do not store Claude API keys in review records. Large binary uploads would need separate object storage, not D1 rows.

## Optional GitHub deployment automation

Cloudflare Workers Builds can connect the `mykhailozubkov/req_check` repository. Its project root is `/` (the local `storylens` folder is already the GitHub repository root), build command `npm run build`, and deploy command `npx wrangler deploy --config dist/server/wrangler.json --keep-vars`. Configure the same Access variables on the Worker. GitHub integration must be authorized separately in the Cloudflare dashboard; CLI deployment alone does not establish it.

## References

- https://developers.cloudflare.com/workers/configuration/cloudflare-access/
- https://developers.cloudflare.com/workers/vite-plugin/
- https://developers.cloudflare.com/d1/
