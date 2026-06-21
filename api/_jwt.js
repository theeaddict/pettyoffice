// Minimal JWT helper for admin authentication (no external dependencies).
// Uses HMAC-SHA256. Keep ADMIN_JWT_SECRET long and random.

import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

const JWT_SECRET = process.env.ADMIN_JWT_SECRET;

function base64urlEncode(str) {
  return Buffer.from(str, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64urlDecode(str) {
  str += new Array(5 - (str.length % 4)).join('=');
  return Buffer.from(str.replace(/\-/g, '+').replace(/\_/g, '/'), 'base64').toString('utf8');
}

export function signJwt(payload, expiresInSeconds = 24 * 60 * 60) {
  if (!JWT_SECRET) throw new Error('ADMIN_JWT_SECRET not configured');
  const now = Math.floor(Date.now() / 1000);
  const body = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
    jti: randomBytes(12).toString('hex'),
  };
  const header = base64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const encodedPayload = base64urlEncode(JSON.stringify(body));
  const signingInput = `${header}.${encodedPayload}`;
  const signature = createHmac('sha256', JWT_SECRET).update(signingInput).digest('base64url');
  return `${signingInput}.${signature}`;
}

export function verifyJwt(token) {
  if (!JWT_SECRET) throw new Error('ADMIN_JWT_SECRET not configured');
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  const signingInput = `${header}.${payload}`;
  const expected = createHmac('sha256', JWT_SECRET).update(signingInput).digest('base64url');
  if (!safeEqual(signature, expected)) return null;
  try {
    const decoded = JSON.parse(base64urlDecode(payload));
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) return null;
    return decoded;
  } catch {
    return null;
  }
}

function safeEqual(a, b) {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
