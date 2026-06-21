import fs from 'fs';
import WebSocket from 'ws';
global.WebSocket = WebSocket;

const envContent = fs.readFileSync('.env', 'utf-8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let val = match[2];
    if (val && val.startsWith('"')) val = val.slice(1, -1);
    process.env[match[1]] = val || '';
  }
});

const mod = await import('./api/stats.js');
const handler = mod.default;
const res = { setHeader: () => {}, status: (c) => res, json: (d) => console.log(JSON.stringify(d)), end: () => {} };
await handler({ method: 'GET', headers: {} }, res);
