import type { IncomingMessage, ServerResponse } from 'node:http';
import { searchMovies, manifest } from '../src/catalog.js';
import { z } from 'zod';
import { createReservation, cancelReservation, ReservationError, getSessionsWithReservations } from '../src/reservations.js';
import { handleMcp } from '../src/mcp.js';
export default async function handler(req: IncomingMessage & { body?: unknown }, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  // Vercel rewrites requests to /api; preserve the original route explicitly.
  const pathname = url.pathname === '/api' || url.pathname === '/api/index'
    ? `/api/${url.searchParams.get('route') ?? ''}` : url.pathname;
  try {
    if (pathname === '/api/mcp') return await handleMcp(req, res);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (pathname === '/api/reservations' || pathname === '/api/reservations/cancel') {
      res.setHeader('Cache-Control', 'no-store');
      if (req.method !== 'POST') { res.writeHead(405, {Allow: 'POST'}); res.end(JSON.stringify({error: 'Use POST para reservas.'})); return; }
      if (!req.headers['content-type']?.startsWith('application/json')) { res.statusCode=415; res.end(JSON.stringify({error:'Envie os dados em JSON.'})); return; }
      let body = req.body;
      if (body === undefined) {
        let raw = '';
        for await (const chunk of req) {
          raw += chunk.toString();
          if (Buffer.byteLength(raw) > 8192) {res.statusCode=413;res.end(JSON.stringify({error:'Pedido muito grande.'}));return;}
        }
        try {body = JSON.parse(raw);} catch {res.statusCode=400;res.end(JSON.stringify({error:'Dados inválidos.'}));return;}
      }
      const schema = pathname === '/api/reservations'
        ? z.object({sessionId:z.string().min(1),seats:z.array(z.string().trim().min(1).max(8)).min(1).max(24)})
        : z.object({reservationId:z.string().uuid(),cancellationToken:z.string().regex(/^[a-f0-9]{48}$/)});
      const parsed = schema.safeParse(body);
      if (!parsed.success) {res.statusCode=400;res.end(JSON.stringify({error:'Confira a sessão, os assentos ou o código de cancelamento.'}));return;}
      try {
        const input = parsed.data;
        const reservation = 'sessionId' in input ? await createReservation(input.sessionId,input.seats) : await cancelReservation(input.reservationId,input.cancellationToken);
        res.statusCode = 'sessionId' in input ? 201 : 200;
        res.end(JSON.stringify({reservation}));
      } catch (error) {
        const code = error instanceof ReservationError ? error.code : 'STORAGE_ERROR';
        res.statusCode = code === 'SEAT_UNAVAILABLE' ? 409 : code === 'STORAGE_NOT_CONFIGURED' ? 503 : code === 'RESERVATION_NOT_FOUND' || code === 'SESSION_NOT_FOUND' ? 404 : code === 'INVALID_SEATS' ? 400 : 503;
        res.end(JSON.stringify({error:error instanceof ReservationError ? error.message : 'Não foi possível acessar as reservas. Tente novamente.',code}));
      }
      return;
    }
    if (req.method !== 'GET') { res.writeHead(405, {Allow: 'GET'}); res.end(JSON.stringify({error:'Método não permitido'})); return; }
    if (pathname === '/api/sessions') res.setHeader('Cache-Control', 'no-store');
    const year = url.searchParams.get('year')?.trim();
    if (pathname === '/api/movies' && year && !/^[1-9]\d{3}$/.test(year)) {
      res.statusCode = 400; res.end(JSON.stringify({ error: 'Ano deve conter quatro dígitos.' })); return;
    }
    const result = pathname === '/api/movies' ? { movies: searchMovies(url.searchParams.get('query') ?? '', url.searchParams.get('genre') ?? '', url.searchParams.get('actor') ?? '', year ? Number(year) : undefined) }
      : pathname === '/api/sessions' ? { sessions: await getSessionsWithReservations(url.searchParams.get('movieId') ?? undefined, url.searchParams.get('date') ?? undefined) }
      : pathname === '/api/manifest' ? manifest : null;
    res.statusCode = result ? 200 : 404;
    res.end(JSON.stringify(result ?? {error:'Rota não encontrada'}));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Request failed');
    if (!res.headersSent) res.writeHead(500, {'Content-Type':'application/json'});
    res.end(JSON.stringify({error:'Falha interna'}));
  }
}
