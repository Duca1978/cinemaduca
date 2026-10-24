import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import handler from '../api/index.js';
const html = readFileSync(new URL('../public/index.html', import.meta.url));
createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') { res.setHeader('Content-Type','text/html; charset=utf-8'); res.end(html); }
  else void handler(req, res);
}).listen(Number(process.env.PORT ?? 3000), '0.0.0.0', () => console.log('Cinema Duca iniciado na porta ' + (process.env.PORT ?? 3000)));
