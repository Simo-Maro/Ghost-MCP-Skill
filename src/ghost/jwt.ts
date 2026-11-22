import { createHmac } from 'node:crypto';

const JWT_TTL_SECONDS = 300;

export function createGhostJwt(adminApiKey: string, nowSeconds?: number): string {
  const colonIdx = adminApiKey.indexOf(':');
  if (colonIdx === -1) {
    throw new Error('Invalid Ghost Admin API key format.');
  }

  const keyId = adminApiKey.slice(0, colonIdx);
  const keySecretHex = adminApiKey.slice(colonIdx + 1);
  const iat = nowSeconds ?? Math.floor(Date.now() / 1000);
  const exp = iat + JWT_TTL_SECONDS;

  const header = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: keyId }),
    'utf8',
  ).toString('base64url');

  const payload = Buffer.from(
    JSON.stringify({ iat, exp, aud: '/admin/' }),
    'utf8',
  ).toString('base64url');

  const signingInput = `${header}.${payload}`;
  const signature = createHmac('sha256', Buffer.from(keySecretHex, 'hex'))
    .update(signingInput)
    .digest('base64url');

  return `${signingInput}.${signature}`;
}
