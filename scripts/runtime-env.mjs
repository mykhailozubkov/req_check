import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
process.env.CLOUDFLARE_CF_FETCH_ENABLED ??= 'false';
process.env.WRANGLER_SEND_METRICS ??= 'false';
process.env.WRANGLER_WRITE_LOGS ??= 'false';
process.env.WRANGLER_LOG_PATH ??= path.join(root, '.wrangler/logs');
process.env.WRANGLER_REGISTRY_PATH ??= path.join(root, '.wrangler/dev-registry');
process.env.MINIFLARE_REGISTRY_PATH ??= path.join(root, '.wrangler/registry');
for (const directory of [process.env.WRANGLER_LOG_PATH, process.env.WRANGLER_REGISTRY_PATH, process.env.MINIFLARE_REGISTRY_PATH]) mkdirSync(directory, { recursive: true });
