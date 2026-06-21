// /api/admin/forms — Admin CRUD endpoint for forms_metadata.
// Requires Authorization: Bearer <JWT from /api/admin/login> header.
//
// GET    /api/admin/forms        — list all rows (including inactive)
// POST   /api/admin/forms        — create new row
// PUT    /api/admin/forms        — update row (expects { id, ...fields })
// DELETE /api/admin/forms        — delete row (expects { id })

import { getSupabase } from '../_supabase.js';
import { verifyJwt } from '../_jwt.js';
import { applyRateLimit } from '../_rate-limit.js';

const MAX_BODY_BYTES = 10240;

function unauthorized(res) {
  res.setHeader('WWW-Authenticate', 'Bearer realm="PettyOffice Admin"');
  return res.status(401).json({ error: 'Unauthorized — provide a valid admin token' });
}

function authenticate(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return token ? verifyJwt(token) : null;
}

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

function isValidId(id) {
  return typeof id === 'number' && Number.isInteger(id) && id > 0;
}

export default async function handler(req, res) {
  // CORS
  const origin = req.headers.origin || '';
  const allowed = (process.env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim());
  res.setHeader('Access-Control-Allow-Origin', allowed.includes('*') ? '*' : (allowed.includes(origin) ? origin : ''));
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'none'");

  if (req.method === 'OPTIONS') return res.status(204).end();

  if (!applyRateLimit(req, res, { key: 'admin-forms', max: 30 })) return;
  if (!authenticate(req)) return unauthorized(res);

  try {
    const supabase = getSupabase();

    // ── GET — list all rows ──
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('forms_metadata')
        .select('*')
        .order('display_order', { ascending: true, nullsLast: true })
        .order('id', { ascending: true });

      if (error) throw error;
      return res.status(200).json({ success: true, data: data || [] });
    }

    // ── POST — create ──
    if (req.method === 'POST') {
      let body;
      try { body = JSON.parse(await readBody(req) || '{}'); }
      catch (err) {
        if (err.message === 'Request body too large') {
          return res.status(413).json({ error: 'Request body too large' });
        }
        return res.status(400).json({ error: 'Invalid JSON body' });
      }

      const { module_type, category_name, emoji_or_icon, description_text, display_order } = body || {};

      if (!module_type || !category_name || !description_text) {
        return res.status(400).json({ error: 'module_type, category_name, and description_text are required' });
      }

      const validModules = ['sue_brain', 'invoice_ex', 'breakup_habit', 'cosmic'];
      if (!validModules.includes(module_type)) {
        return res.status(400).json({ error: 'Invalid module_type' });
      }

      const { data, error } = await supabase
        .from('forms_metadata')
        .insert({
          module_type,
          category_name: String(category_name).trim().slice(0, 200),
          emoji_or_icon: String(emoji_or_icon || '📋').trim().slice(0, 10),
          description_text: String(description_text).trim().slice(0, 500),
          display_order: typeof display_order === 'number' ? display_order : 0,
        })
        .select()
        .single();

      if (error) throw error;
      return res.status(201).json({ success: true, data });
    }

    // ── PUT — update ──
    if (req.method === 'PUT') {
      let body;
      try { body = JSON.parse(await readBody(req) || '{}'); }
      catch (err) {
        if (err.message === 'Request body too large') {
          return res.status(413).json({ error: 'Request body too large' });
        }
        return res.status(400).json({ error: 'Invalid JSON body' });
      }

      const { id, ...fields } = body || {};
      if (!id || !isValidId(Number(id))) return res.status(400).json({ error: 'Valid id is required for update' });

      const allowedFields = ['module_type', 'category_name', 'emoji_or_icon', 'description_text', 'is_active', 'display_order'];
      const updates = {};
      let hasUpdates = false;

      for (const key of allowedFields) {
        if (fields[key] !== undefined) {
          if (key === 'module_type') {
            const validModules = ['sue_brain', 'invoice_ex', 'breakup_habit', 'cosmic'];
            if (!validModules.includes(fields[key])) continue;
          }
          if (typeof fields[key] === 'string') {
            updates[key] = String(fields[key]).trim().slice(0, 500);
          } else {
            updates[key] = fields[key];
          }
          hasUpdates = true;
        }
      }

      if (!hasUpdates) return res.status(400).json({ error: 'No valid fields to update' });

      updates.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from('forms_metadata')
        .update(updates)
        .eq('id', Number(id))
        .select()
        .single();

      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Record not found' });
      return res.status(200).json({ success: true, data });
    }

    // ── DELETE — destroy ──
    if (req.method === 'DELETE') {
      let body;
      try { body = JSON.parse(await readBody(req) || '{}'); }
      catch (err) {
        if (err.message === 'Request body too large') {
          return res.status(413).json({ error: 'Request body too large' });
        }
        return res.status(400).json({ error: 'Invalid JSON body' });
      }

      const { id } = body || {};
      if (!id || !isValidId(Number(id))) return res.status(400).json({ error: 'Valid id is required for delete' });

      const { error } = await supabase
        .from('forms_metadata')
        .delete()
        .eq('id', Number(id));

      if (error) throw error;
      return res.status(200).json({ success: true, message: 'Record permanently destroyed' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    const msg = err.message || '';
    if (msg.includes('must be set') || msg.includes('not configured') || msg.includes('table') || msg.includes('relation') || msg.includes('Failed to fetch') || msg.includes('fetch')) {
      if (req.method === 'GET') {
        return res.status(200).json({ success: true, data: [], source: 'fallback' });
      }
      return res.status(503).json({ error: 'Database not configured' });
    }
    console.error('/api/admin/forms error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
