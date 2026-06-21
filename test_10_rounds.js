import fs from 'fs';
import path from 'path';

// read env
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
  let good = 0;
  let bad = 0;
  for(let i=0; i<10; i++) {
    const req = {
      method: 'POST',
      headers: { 'origin': 'http://localhost:3000' },
      on: (event, cb) => {
        if (event === 'data') {
          cb(JSON.stringify({
            category: 'overthinking',
            charge: 'Analyzing a period at the end of "okay."',
            grievance: 'They used a period, which is clearly a threat',
            round: 1
          }));
        }
        if (event === 'end') cb();
      }
    };
    
    let resolveRes;
    const resPromise = new Promise(r => resolveRes = r);
    const res = {
      setHeader: () => {},
      status: (code) => res,
      json: (data) => resolveRes(data)
    };
    
    await handler(req, res);
    const result = await resPromise;
    console.log(`[${i+1}] ${result.defense}`);
    if (result.defense.includes("plethora") || result.defense.includes("byproduct") || result.defense.includes("simplified") || result.defense.includes("relatable")) {
      bad++;
    } else {
      good++;
    }
    await new Promise(r => setTimeout(r, 1000)); // Sleep 1s to avoid rate limits
  }
  console.log(`\nResults: ${good} good, ${bad} bad`);
}

run();
