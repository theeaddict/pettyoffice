import { timingSafeEqual } from 'crypto';
import { verifyJwt } from '../_jwt.js';
import { applyRateLimit } from '../_rate-limit.js';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ENV_PATH = path.resolve(__dirname, '../../.env');

const MAX_BODY_BYTES = 4096;

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

function safeCompare(a, b) {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function setHeaders(req, res) {
  const origin = req.headers.origin || '';
  const allowed = (process.env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim());
  res.setHeader('Access-Control-Allow-Origin', allowed.includes('*') ? '*' : (allowed.includes(origin) ? origin : ''));
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'none'");
}

export default async function handler(req, res) {
  setHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!applyRateLimit(req, res, { key: 'admin-change-password', max: 5 })) return;

  // Verify JWT
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const payload = verifyJwt(token);
  if (!payload || payload.role !== 'admin') {
    return res.status(401).json({ error: 'Unauthorized' });
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

  const currentPassword = String(body.currentPassword || '');
  const newPassword = String(body.newPassword || '');

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Both currentPassword and newPassword are required' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }

  if (newPassword.length > 256) {
    return res.status(400).json({ error: 'New password too long' });
  }

  // Verify current password matches .env
  const storedPassword = process.env.ADMIN_PASSWORD;
  if (!storedPassword) {
    return res.status(500).json({ error: 'Password storage unavailable' });
  }

  if (!safeCompare(currentPassword, storedPassword)) {
    return res.status(403).json({ error: 'Current password is incorrect' });
  }

  if (safeCompare(newPassword, storedPassword)) {
    return res.status(400).json({ error: 'New password must differ from current password' });
  }

  // Write new password to .env file
  try {
    let envContent = '';
    try {
      envContent = fs.readFileSync(ENV_PATH, 'utf-8');
    } catch {
      return res.status(500).json({ error: 'Cannot read env file' });
    }

    const lines = envContent.split('\n');
    let replaced = false;
    const newLines = lines.map(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith('ADMIN_PASSWORD=')) {
        replaced = true;
        // Preserve quoting style if any
        const quote = trimmed.includes('="') ? '"' : trimmed.includes("='") ? "'" : '';
        return `ADMIN_PASSWORD=${quote}${newPassword}${quote}`;
      }
      return line;
    });

    if (!replaced) {
      newLines.push(`ADMIN_PASSWORD=${newPassword}`);
    }

    fs.writeFileSync(ENV_PATH, newLines.join('\n'), 'utf-8');

    // Update running process
    process.env.ADMIN_PASSWORD = newPassword;

    return res.status(200).json({ success: true, message: 'Password changed successfully. Restart the server for the change to take full effect.' });
  } catch (err) {
    console.error('/api/admin/change-password write error:', err);
    return res.status(500).json({ error: 'Failed to persist password change' });
  }
}
