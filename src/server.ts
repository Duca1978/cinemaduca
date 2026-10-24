import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import handler from '../api/index.js';
const portraits = new Map(['orbita', 'bairro', 'mar'].map(id => [`/images/${id}-protagonist.png`, new URL(`../public/images/${id}-protagonist.png`, import.meta.url)]));
const html = readFileSync(new URL('../public/index.html', import.meta.url));
createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') { res.setHeader('Content-Type','text/html; charset=utf-8'); res.end(html); }
  else if (portraits.has(new URL(req.url ?? '/', 'http://localhost').pathname)) {
    res.setHeader('Content-Type', 'image/png');
    res.end(readFileSync(portraits.get(new URL(req.url!, 'http://localhost').pathname)!));
  }
  else void handler(req, res);
}).listen(Number(process.env.PORT ?? 3000), '0.0.0.0', () => console.log('Cinema Duca iniciado na porta ' + (process.env.PORT ?? 3000)));
