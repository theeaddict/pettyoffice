import fs from 'fs';
const envContent = fs.readFileSync('.env', 'utf-8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let val = match[2];
    if (val && val.startsWith('"')) val = val.slice(1, -1);
    if (!process.env[match[1]]) process.env[match[1]] = val || '';
  }
});

const mod = await import('./api/_supabase.js');
try {
  const client = mod.getSupabase();
  console.log('Success!', client.supabaseUrl);
} catch (e) {
  console.log('Error:', e.message);
}
