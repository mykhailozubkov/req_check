const origin = process.argv[2] ?? 'https://req-check.mykhailo-zubkov.workers.dev';
const page = await fetch(origin, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
const html = await page.text();
console.log(JSON.stringify({ path: '/', status: page.status, isApp: html.includes('Storylens') }));
if (page.status !== 200 || !html.includes('Storylens') || !html.includes('OpenRouter Free') || !html.includes('lang="en"') || /[А-Яа-яЁё]/.test(html)) process.exitCode = 1;
const assets = [...new Set([...html.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)].map(m => m[1]))]
  .map(path => new URL(path, origin))
  .filter(url => url.origin === new URL(origin).origin && url.pathname.startsWith('/_next/static/'));
for (const url of assets) {
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
  console.log(JSON.stringify({ path: url.pathname, status: response.status, type: response.headers.get('content-type') }));
  if (response.status !== 200) process.exitCode = 1;
  await response.body?.cancel();
}
const statusResponse = await fetch(new URL('/api/status', origin), { signal: AbortSignal.timeout(15000) });
const status = await statusResponse.json();
console.log(JSON.stringify({ path: '/api/status', status: statusResponse.status, configured: status.configured, provider: status.provider, model: status.model }));
if (statusResponse.status !== 200 || status.provider !== 'OpenRouter' || status.model !== 'openrouter/free') process.exitCode = 1;
const review = await fetch(new URL('/api/review', origin), {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: new URL(origin).origin },
  body: JSON.stringify({ story: 'short' }),
  signal: AbortSignal.timeout(15000),
});
const result = await review.json();
console.log(JSON.stringify({ path: '/api/review', status: review.status, error: result.error }));
if (review.status !== 400 || /[А-Яа-яЁё]/.test(result.error ?? '')) process.exitCode = 1;
