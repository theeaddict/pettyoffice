import { signJwt, verifyJwt } from './api/_jwt.js';
import fs from 'fs';
const env = fs.readFileSync('.env', 'utf-8');
env.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) process.env[match[1]] = match[2];
});
const token = signJwt({ sub: 'admin' });
console.log('Token:', token);
const verified = verifyJwt(token);
console.log('Verified:', verified);
