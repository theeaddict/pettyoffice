// POST /api/event — Fire-and-forget event logging for product analytics.
// Currently supports event: "premium_interest" with optional amount.

import { getSupabase } from './_supabase.js';
import { applyRateLimit } from './_rate-limit.js';

const MAX_BODY_BYTES = 2048;

export default async function handler(req, res) {
  if (!applyRateLimit(req, res, { key: 'event', max: 30 })) return;
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

  let rawBody;
  try {
    rawBody = await new Promise((resolve, reject) => {
      let body = '';
      let size = 0;
      req.on('data', chunk => {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) { req.destroy(); reject(new Error('Request body too large')); return; }
        body += chunk.toString();
      });
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  } catch {
    return res.status(413).json({ error: 'Request body too large' });
  }

  let body;
  try { body = JSON.parse(rawBody); }
  catch { return res.status(400).json({ error: 'Invalid JSON body' }); }

  const { event, amount } = body || {};
  if (!event || typeof event !== 'string') return res.status(400).json({ error: 'event is required' });
  if (event.length > 50) return res.status(400).json({ error: 'Invalid event name' });

  try {
    const supabase = getSupabase();
    await supabase.from('generations').insert({
      tool: 'premium_interest',
      country: 'Unknown',
      device: 'desktop',
      source: 'event',
      premium_interest: typeof amount === 'number' && Number.isFinite(amount) ? Math.round(amount) : 1,
    });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('/api/event error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
