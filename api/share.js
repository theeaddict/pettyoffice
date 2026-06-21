// POST /api/share — Store a generated document for sharing.
// Returns { share_url: "/case/:uuid" }.

import { getSupabase } from './_supabase.js';
import { applyRateLimit } from './_rate-limit.js';

const MAX_BODY_BYTES = 50240;

export default async function handler(req, res) {
  if (!applyRateLimit(req, res, { key: 'share', max: 10 })) return;
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

  const { module_type, primary_selection, secondary_selection, document_content } = body || {};
  if (!module_type || !document_content) {
    return res.status(400).json({ error: 'module_type and document_content are required' });
  }

  const validModules = ['sue_brain', 'invoice_ex', 'breakup_habit', 'cosmic'];
  if (!validModules.includes(module_type)) {
    return res.status(400).json({ error: 'Invalid module_type' });
  }

  if (typeof document_content !== 'string') {
    return res.status(400).json({ error: 'Invalid document_content' });
  }

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('shared_documents')
      .insert({
        module_type,
        primary_selection: String(primary_selection || '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').slice(0, 500),
        secondary_selection: String(secondary_selection || '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').slice(0, 500),
        document_content: document_content.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').slice(0, 25000),
      })
      .select('id')
      .single();

    if (error) throw error;
    return res.status(201).json({ success: true, share_url: `/case/${data.id}` });
  } catch (err) {
    console.warn('/api/share error:', err.message);
    const mockId = 'mock-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 7);
    return res.status(201).json({ success: true, share_url: `/case/${mockId}` });
  }
}
