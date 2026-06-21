import fs from 'fs';
const envContent = fs.readFileSync('.env', 'utf-8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let val = match[2];
    if (val && val.startsWith('"')) val = val.slice(1, -1);
    process.env[match[1]] = val || '';
  }
});
console.log('VITE_SUPABASE_URL:', `"${process.env.VITE_SUPABASE_URL}"`);
console.log('SUPABASE_URL:', `"${process.env.SUPABASE_URL}"`);
console.log('Or result:', `"${process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL}"`);
