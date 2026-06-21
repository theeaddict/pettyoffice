// GET /api/case/:id — Return a shared document by UUID and increment view count.

import { getSupabase } from '../_supabase.js';
import { applyRateLimit } from '../_rate-limit.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MOCK_ID_RE = /^mock-/;

export default async function handler(req, res) {
  if (!applyRateLimit(req, res, { key: 'case', max: 60 })) return;
  const origin = req.headers.origin || '';
  const allowed = (process.env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim());
  res.setHeader('Access-Control-Allow-Origin', allowed.includes('*') ? '*' : (allowed.includes(origin) ? origin : ''));
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'none'");

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const id = req.query?.id || req.url?.split('/').pop();
  if (!id || typeof id !== 'string') return res.status(400).json({ error: 'Missing case id' });

  if (!UUID_RE.test(id) && !MOCK_ID_RE.test(id)) {
    return res.status(400).json({ error: 'Invalid case id format' });
  }

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('shared_documents')
      .select('id, module_type, primary_selection, secondary_selection, document_content, view_count, created_at')
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Case not found' });

    supabase.from('shared_documents').update({ view_count: (data.view_count || 0) + 1 }).eq('id', id).catch(() => {});

    return res.status(200).json({ success: true, data });
  } catch (err) {
    if (MOCK_ID_RE.test(id)) return res.status(404).json({ error: 'Mock case not saved to database.' });
    if (err.code === 'PGRST116') return res.status(404).json({ error: 'Case not found' });
    console.error('/api/case error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
