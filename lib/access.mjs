import { createRemoteJWKSet, jwtVerify } from 'jose';

let cachedIssuer;
let cachedKeys;

export function accessSettings(env) {
  const domain = env.ACCESS_TEAM_DOMAIN;
  const audience = env.ACCESS_AUD;
  if (typeof domain !== 'string' || typeof audience !== 'string' || !audience.trim()) return null;
  // Only Cloudflare Access may supply verification keys. No arbitrary JWKS URLs.
  const host = domain.replace(/^https:\/\//, '').replace(/\/$/, '');
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.cloudflareaccess\.com$/i.test(host)) return null;
  return { issuer: `https://${host.toLowerCase()}`, audience: audience.trim() };
}

function remoteKeys(issuer) {
  if (cachedIssuer !== issuer) {
    cachedIssuer = issuer;
    cachedKeys = createRemoteJWKSet(new URL('/cdn-cgi/access/certs', issuer), { timeoutDuration: 5000, cacheMaxAge: 600000 });
  }
  return cachedKeys;
}

export async function verifyAccess(request, env, keyResolver) {
  const settings = accessSettings(env);
  if (!settings) return { allowed: false, status: 503 };
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || token.length > 16384) return { allowed: false, status: 401 };
  try {
    const { payload } = await jwtVerify(token, keyResolver ?? remoteKeys(settings.issuer), {
      issuer: settings.issuer,
      audience: settings.audience,
      algorithms: ['RS256'],
      requiredClaims: ['exp', 'iat', 'iss', 'aud', 'sub'],
      clockTolerance: 5,
    });
    // This application is for signed-in people, not service-token identities.
    const allowedDomain = (env.ACCESS_ALLOWED_EMAIL_DOMAIN ?? 'cleveroad.com').toLowerCase();
    const emailParts = typeof payload.email === 'string' ? payload.email.toLowerCase().split('@') : [];
    if (emailParts.length !== 2 || !emailParts[0] || emailParts[1] !== allowedDomain) return { allowed: false, status: 403 };
    return { allowed: true, status: 200 };
  } catch {
    return { allowed: false, status: 401 };
  }
}

export function accessDenied(status) {
  return new Response(status === 503
    ? 'Private application: Cloudflare Access configuration is not complete.'
    : 'Sign in through Cloudflare Access to open this private application.', {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}
