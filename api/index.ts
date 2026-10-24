import type { IncomingMessage, ServerResponse } from 'node:http';
import { searchMovies, getSessions, manifest } from '../src/catalog.js';
import { handleMcp } from '../src/mcp.js';
export default async function handler(req: IncomingMessage & { body?: unknown }, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  try {
    if (url.pathname === '/api/mcp') return await handleMcp(req, res);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (req.method !== 'GET') { res.writeHead(405, {Allow: 'GET'}); res.end(JSON.stringify({error:'Método não permitido'})); return; }
    const year = url.searchParams.get('year')?.trim();
    if (url.pathname === '/api/movies' && year && !/^[1-9]\d{3}$/.test(year)) {
      res.statusCode = 400; res.end(JSON.stringify({ error: 'Ano deve conter quatro dígitos.' })); return;
    }
    const result = url.pathname === '/api/movies' ? { movies: searchMovies(url.searchParams.get('query') ?? '', url.searchParams.get('genre') ?? '', url.searchParams.get('actor') ?? '', year ? Number(year) : undefined) }
      : url.pathname === '/api/sessions' ? { sessions: getSessions(url.searchParams.get('movieId') ?? undefined, url.searchParams.get('date') ?? undefined) }
      : url.pathname === '/api/manifest' ? manifest : null;
    res.statusCode = result ? 200 : 404;
    res.end(JSON.stringify(result ?? {error:'Rota não encontrada'}));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Request failed');
    if (!res.headersSent) res.writeHead(500, {'Content-Type':'application/json'});
    res.end(JSON.stringify({error:'Falha interna'}));
  }
}
