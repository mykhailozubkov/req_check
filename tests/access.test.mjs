import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { accessDenied, accessSettings, verifyAccess } from '../lib/access.mjs';

const env = { ACCESS_TEAM_DOMAIN: 'example-team.cloudflareaccess.com', ACCESS_AUD: 'test-audience', ACCESS_ALLOWED_EMAIL_DOMAIN: 'cleveroad.com' };
const { privateKey, publicKey } = await generateKeyPair('RS256');
const jwk = await exportJWK(publicKey);
const keys = createLocalJWKSet({ keys: [{ ...jwk, kid: 'test-key', alg: 'RS256' }] });
async function token(options = {}) {
  return new SignJWT({ email: options.email ?? 'ba@cleveroad.com' })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(options.issuer ?? 'https://example-team.cloudflareaccess.com')
    .setAudience(options.audience ?? 'test-audience')
    .setSubject('user-123')
    .setIssuedAt()
    .setExpirationTime(options.expiration ?? '5m')
    .sign(privateKey);
}
function request(jwt, extraHeaders = {}) {
  return new Request('https://req-check.example.workers.dev/api/review', { headers: { ...(jwt ? { 'Cf-Access-Jwt-Assertion': jwt } : {}), ...extraHeaders } });
}

test('production access fails closed without complete Access settings', async () => {
  assert.deepEqual(await verifyAccess(request(), {}), { allowed: false, status: 503 });
  assert.equal(accessDenied(503).headers.get('cache-control'), 'private, no-store');
});
test('issuer only accepts a Cloudflare Access team hostname', () => {
  for (const domain of ['http://team.cloudflareaccess.com', 'team.cloudflareaccess.com.evil.test', 'evil.test', 'team.cloudflareaccess.com/path', 'team.cloudflareaccess.com?x=1', 'a@team.cloudflareaccess.com']) assert.equal(accessSettings({ ...env, ACCESS_TEAM_DOMAIN: domain }), null);
  assert.equal(accessSettings({ ...env, ACCESS_TEAM_DOMAIN: 'https://example-team.cloudflareaccess.com/' }).issuer, 'https://example-team.cloudflareaccess.com');
});
test('accepts a signed, current token for the configured audience and company domain', async () => {
  assert.deepEqual(await verifyAccess(request(await token()), env, keys), { allowed: true, status: 200 });
  assert.equal((await verifyAccess(request(await token({ email: 'BA@Cleveroad.COM' })), env, keys)).allowed, true);
});
test('ignores forged identity headers without a verified JWT', async () => {
  assert.equal((await verifyAccess(request(null, { 'Cf-Access-Authenticated-User-Email': 'ba@cleveroad.com', 'oai-authenticated-user-email': 'ba@cleveroad.com' }), env, keys)).allowed, false);
});
test('rejects wrong audience, issuer, expired tokens and tampered signatures', async () => {
  for (const jwt of [await token({ audience: 'other-app' }), await token({ issuer: 'https://other.cloudflareaccess.com' }), await token({ expiration: Math.floor(Date.now() / 1000) - 60 }), (await token()).slice(0, -12) + 'aaaaaaaaaaaa', 'not-a-token']) assert.equal((await verifyAccess(request(jwt), env, keys)).allowed, false);
});
test('rejects valid tokens from other domains and service identities', async () => {
  for (const email of ['user@example.com', 'user@sub.cleveroad.com', 'user@cleveroad.com.evil.test', 'a@b@cleveroad.com', '']) assert.equal((await verifyAccess(request(await token({ email })), env, keys)).allowed, false);
});
test('private gate also protects asset requests', async () => {
  for (const path of ['/', '/assets/main.js', '/favicon.svg', '/api/review']) assert.equal((await verifyAccess(new Request('https://req-check.example.workers.dev' + path), env, keys)).status, 401);
});
