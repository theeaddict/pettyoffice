// Dev server for PettyOffice API routes.
// Run alongside `npm run dev` during local development.
// Usage:  node dev-server.js   (starts on port 3001)
// Vite proxies /api/* requests to this server (see vite.config.js).

import http from 'http';
import WebSocket from 'ws';
global.WebSocket = WebSocket;

import { URL, fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
  const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf-8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || '';
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      else if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
      if (!process.env[key]) process.env[key] = value;
    }
  });
} catch (e) {}

// Inject helper methods Vercel normally provides
function wrapRes(res) {
  res.status = function (code) {
    res.statusCode = code;
    return res;
  };
  res.json = function (obj) {
    res.setHeader('Content-Type', 'application/json');
    try {
      res.end(JSON.stringify(obj));
    } catch (err) {
      console.error('res.json serialization error:', err);
      res.end(JSON.stringify({ error: 'Internal serialization error' }));
    }
  };
  return res;
}

// Dynamic import an API handler
async function loadHandler(modulePath) {
  const mod = await import(modulePath);
  return mod.default;
}

const server = http.createServer(async (req, res) => {
  wrapRes(res);
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  const method = req.method;

  try {
    if (method === 'GET' && pathname === '/api/forms') {
      const handler = await loadHandler('./api/forms.js');
      return handler(req, res);
    }

    if (method === 'GET' && pathname === '/api/stats') {
      const handler = await loadHandler('./api/stats.js');
      return handler(req, res);
    }

    if (method === 'POST' && pathname === '/api/generate') {
      const handler = await loadHandler('./api/generate.js');
      return handler(req, res);
    }

    if (method === 'POST' && pathname === '/api/defense') {
      const handler = await loadHandler('./api/defense.js');
      return handler(req, res);
    }

    if (method === 'POST' && pathname === '/api/share') {
      const handler = await loadHandler('./api/share.js');
      return handler(req, res);
    }

    if (method === 'POST' && pathname === '/api/event') {
      const handler = await loadHandler('./api/event.js');
      return handler(req, res);
    }

    if (method === 'POST' && pathname === '/api/admin/login') {
      const handler = await loadHandler('./api/admin/login.js');
      return handler(req, res);
    }

    if (method === 'POST' && pathname === '/api/admin/change-password') {
      const handler = await loadHandler('./api/admin/change-password.js');
      return handler(req, res);
    }

    if (pathname.startsWith('/api/admin/forms')) {
      if (!['GET', 'POST', 'PUT', 'DELETE'].includes(method)) {
        return res.status(405).json({ error: 'Method not allowed' });
      }
      const handler = await loadHandler('./api/admin/forms.js');
      return handler(req, res);
    }

    // /api/case/:id
    const caseMatch = pathname.match(/^\/api\/case\/([^/]+)\/?$/);
    if (caseMatch && method === 'GET') {
      req.query = { id: caseMatch[1] };
      const handler = await loadHandler('./api/case/[id].js');
      return handler(req, res);
    }

    res.status(404).json({ error: 'Not found' });
  } catch (err) {
    console.error('Dev server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Startup Supabase health check
async function checkSupabase() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log('  ⚠ Supabase credentials not set. Static fallback data will be used.');
    return;
  }
  try {
    const testUrl = process.env.SUPABASE_URL.replace(/\/+$/, '');
    const res = await fetch(`${testUrl}/rest/v1/generations?select=count&limit=1`, {
      headers: { 'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY, 'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` }
    });
    const text = await res.text();
    if (text.includes('PGRST205') || text.includes('relation') || text.includes('does not exist')) {
      console.log('  ⚠ Supabase reachable but tables are missing.');
      if (process.env.DATABASE_URL) {
        console.log('     DATABASE_URL is set — tables will auto-create on first API call.');
      } else {
        console.log('     Set DATABASE_URL or run SQL manually:');
        console.log('     node migrate.js');
      }
    } else {
      console.log('  ✓ Supabase connected, tables ready.');
    }
  } catch (e) {
    console.log('  ⚠ Cannot reach Supabase:', e.message.substring(0, 60));
  }
}

const PORT = parseInt(process.env.DEV_API_PORT || '3001', 10);
server.listen(PORT, () => {
  console.log(`PettyOffice API dev server running on http://localhost:${PORT}`);
  checkSupabase();
});
