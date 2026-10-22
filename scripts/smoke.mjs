const origin = process.argv[2] ?? 'https://req-check.mykhailo-zubkov.workers.dev';
const page = await fetch(origin, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
const html = await page.text();
console.log(JSON.stringify({ path: '/', status: page.status, isApp: html.includes('Storylens') }));
if (page.status !== 200 || !html.includes('Storylens')) process.exitCode = 1;
const assets = [...new Set([...html.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)].map(m => m[1]))]
  .map(path => new URL(path, origin))
  .filter(url => url.origin === new URL(origin).origin && url.pathname.startsWith('/_next/static/'));
for (const url of assets) {
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
  console.log(JSON.stringify({ path: url.pathname, status: response.status, type: response.headers.get('content-type') }));
  if (response.status !== 200) process.exitCode = 1;
  await response.body?.cancel();
}
const review = await fetch(new URL('/api/review', origin), {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: new URL(origin).origin },
  body: JSON.stringify({ story: 'As a business analyst I want to review user stories so that business rules are clear.' }),
  signal: AbortSignal.timeout(15000),
});
const result = await review.json();
console.log(JSON.stringify({ path: '/api/review', status: review.status, error: result.error }));
if (review.status !== 401 || !result.error?.includes('API-ключ')) process.exitCode = 1;
