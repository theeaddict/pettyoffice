// Server-side Supabase client for API routes.
// Uses SERVICE_ROLE key (admin bypasses RLS) — NEVER expose this to the browser.
// If DATABASE_URL is set (pointing to the same Supabase project), tables are
// auto-created on first connection when they don't exist.

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.DATABASE_URL;

let client = null;
let migrated = false;

async function runMigration() {
  if (migrated || !databaseUrl) return;
  migrated = true;
  try {
    const pool = new pg.Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 5000 });

    const { rows } = await pool.query(
      `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'generations') AS exists`
    );
    if (rows[0]?.exists) { await pool.end(); return; }

    console.log('[supabase] Tables missing — running auto-migration...');
    const schemaSQL = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf-8');
    const seedSQL = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migration.sql'), 'utf-8');

    await pool.query(schemaSQL);
    await pool.query(seedSQL);
    console.log('[supabase] Auto-migration complete.');
    await pool.end();
  } catch (err) {
    console.error('[supabase] Auto-migration failed:', err.message);
    console.error('[supabase] Set DATABASE_URL in .env for auto-migration, or run the SQL manually in Supabase Dashboard.');
  }
}

export function getSupabase() {
  if (client) return client;
  if (!supabaseUrl || !serviceKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  }
  client = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // Fire-and-forget auto-migration (non-blocking)
  runMigration();

  return client;
}
