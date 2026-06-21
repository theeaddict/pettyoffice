// POST /api/admin/login
// Authenticates admin with server-side ADMIN_PASSWORD only.
// Returns a short-lived JWT signed with ADMIN_JWT_SECRET.

import { timingSafeEqual } from 'crypto';
import { signJwt } from '../_jwt.js';
import { applyRateLimit } from '../_rate-limit.js';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const MAX_BODY_BYTES = 2048;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY_BYTES) { req.destroy(); reject(new Error('Request body too large')); return; }
      body += c.toString();
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function safePwCompare(a, b) {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export default async function handler(req, res) {
  if (!applyRateLimit(req, res, { key: 'admin-login', max: 5 })) return;
  const origin = req.headers.origin || '';
  const allowed = (process.env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim());
  res.setHeader('Access-Control-Allow-Origin', allowed.includes('*') ? '*' : (allowed.includes(origin) ? origin : ''));
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'none'");

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!ADMIN_PASSWORD) {
    console.error('/api/admin/login: ADMIN_PASSWORD not set');
    return res.status(500).json({ error: 'Authentication unavailable' });
  }

  let body;
  try {
    const raw = await readBody(req);
    body = JSON.parse(raw || '{}');
  } catch (err) {
    if (err.message === 'Request body too large') {
      return res.status(413).json({ error: 'Request body too large' });
    }
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const username = String(body?.username || '');
  const password = String(body?.password || '');
  const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
  
  if (username !== ADMIN_USERNAME || !safePwCompare(password, ADMIN_PASSWORD)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  try {
    const token = signJwt({ sub: 'admin', role: 'admin' });
    return res.status(200).json({ success: true, token });
  } catch (err) {
    console.error('/api/admin/login error:', err);
    return res.status(500).json({ error: 'Authentication system error' });
  }
}
