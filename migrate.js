// PettyOffice — Supabase Migration Script.
// Creates all tables, indexes, RLS policies, and seeds forms_metadata.
//
// Usage:
//   1. Get your Supabase database connection string:
//      Supabase Dashboard → Project Settings → Database → Connection string
//   2. Run:   DATABASE_URL="postgresql://postgres:[PASSWORD]@aws-0-eu-west-1.pooler.supabase.com:6543/postgres" node migrate.js
//   Or set DATABASE_URL in .env and run:   node migrate.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env manually if present (so DATABASE_URL can live there)
try {
  const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf-8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      let val = match[2] || '';
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      else if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
      if (!process.env[match[1]]) process.env[match[1]] = val;
    }
  });
} catch {}

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('');
  console.error('❌  DATABASE_URL not set.');
  console.error('');
  console.error('  Get it from:');
  console.error('  https://supabase.com/dashboard/project/puthbbgclqbopxopwego/settings/database');
  console.error('');
  console.error('  Then run:');
  console.error('  DATABASE_URL="postgresql://postgres:[PASSWORD]@aws-0-eu-west-1.pooler.supabase.com:6543/postgres" node migrate.js');
  console.error('');
  console.error('  Or add to .env:');
  console.error('  DATABASE_URL=postgresql://postgres:[PASSWORD]@aws-0-eu-west-1.pooler.supabase.com:6543/postgres');
  process.exit(1);
}

// Read schema.sql + migration.sql
const schemaPath = path.join(__dirname, 'schema.sql');
const migrationPath = path.join(__dirname, 'supabase', 'migration.sql');
const schemaSQL = fs.readFileSync(schemaPath, 'utf-8');
const seedSQL = fs.readFileSync(migrationPath, 'utf-8');

import('pg').then(async pg => {
  const pool = new pg.default.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

  try {
    console.log('📦  Connected. Running schema...');
    await pool.query(schemaSQL);
    console.log('✅  Schema created (6 tables + indexes + RLS).');

    console.log('🌱  Running seed data...');
    await pool.query(seedSQL);
    console.log('✅  Seed data inserted (forms_metadata).');

    console.log('');
    console.log('🎉  Migration complete! Tables are ready.');
    console.log('');
    console.log('  Tables created: generations, visitors, forms_metadata, rate_limits, shared_documents, llm_cache');
  } catch (err) {
    console.error('❌  Migration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}).catch(err => {
  console.error('❌  Failed to load pg module. Run: npm install pg');
  console.error('   Error:', err.message);
  process.exit(1);
});
