import './runtime-env.mjs';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
if (args.some(arg => arg !== '--dry-run') || args.length > 1) throw new Error('Supported option: --dry-run');
const root = fileURLToPath(new URL('../', import.meta.url));
function run(script, parameters) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL(script, import.meta.url)), ...parameters], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run('../node_modules/vinext/dist/cli.js', ['build']);
const config = JSON.parse(readFileSync(new URL('../dist/server/wrangler.json', import.meta.url), 'utf8'));
if (config.assets?.run_worker_first !== true) throw new Error('Deployment blocked: assets must pass through the private Worker.');
if (config.preview_urls !== false) throw new Error('Deployment blocked: preview URLs must stay disabled.');
run('../node_modules/wrangler/bin/wrangler.js', ['deploy', '--config', 'dist/server/wrangler.json', '--keep-vars', ...args]);
