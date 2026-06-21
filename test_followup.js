import fs from 'fs';
const env = fs.readFileSync('.env', 'utf-8');
env.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] || '';
    if (value.startsWith('"')) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
});
import handler from './api/defense.js';
async function run() {
  for(let i=0; i<10; i++) {
    const req = {
      method: 'POST',
      headers: { 'origin': 'http://localhost:3000' },
      on: (event, cb) => {
        if (event === 'data') cb(JSON.stringify({
          category: 'overthinking',
          charge: 'Mental Misconduct',
          grievance: 'Creating a plethora of analogies',
          round: 2,
          previousReply: 'That makes no sense, you are overcomplicating everything.'
        }));
        if (event === 'end') cb();
      }
    };
    let resolveRes;
    const resPromise = new Promise(r => resolveRes = r);
    const res = {
      setHeader: () => {}, status: () => res, json: (data) => resolveRes(data)
    };
    await handler(req, res);
    const result = await resPromise;
    console.log(`[R2] ${result.defense}`);
    await new Promise(r => setTimeout(r, 1000));
  }
}
run();
