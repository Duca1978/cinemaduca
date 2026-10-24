import type { IncomingMessage, ServerResponse } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { searchMovies, getMovie } from './catalog.js';
import { cancelReservation, createReservation, getSeatAvailability, getSessionsWithReservations, ReservationError } from './reservations.js';
const response = (result: Record<string, unknown>) => ({content: [{type: 'text' as const, text: JSON.stringify(result)}], structuredContent: result});
async function reservationResponse(action: () => Promise<Record<string, unknown>>) {
  try { return response(await action()); }
  catch (error) {
    const result = {error: {code: error instanceof ReservationError ? error.code : 'STORAGE_ERROR', message: error instanceof ReservationError ? error.message : 'Não foi possível acessar o armazenamento de reservas.'}};
    return {...response(result), isError: true};
  }
}
export async function handleMcp(req: IncomingMessage & { body?: unknown }, res: ServerResponse) {
  const server = new McpServer({ name: 'cinema-duca', version: '0.1.0' });
  server.registerTool('search_movies', { description: 'Consulta filmes fictícios do Cinema Duca por título, gênero, ator e ano de lançamento.', inputSchema: { query: z.string().optional(), genre: z.string().optional(), actor: z.string().optional(), year: z.number().int().min(1000).max(9999).optional() } }, async ({ query, genre, actor, year }) => {
    const result = { movies: searchMovies(query, genre, actor, year) };
    return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
  });
  server.registerTool('get_sessions', { description: 'Consulta sessões de demonstração, preços em reais e assentos disponíveis. As datas são fixas e podem estar no passado.', inputSchema: { movieId: z.string().optional(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() } }, async ({ movieId, date }) => {
    const result = { sessions: await getSessionsWithReservations(movieId, date) };
    return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
  });
  server.registerTool('get_movie', {
    description: 'Consulta os detalhes de um filme pelo identificador retornado por search_movies.',
    inputSchema: {movieId: z.string().min(1)}, annotations: {readOnlyHint: true}
  }, async ({movieId}) => {
    const movie = getMovie(movieId);
    if (!movie) return {...response({error: {code: 'MOVIE_NOT_FOUND', message: 'Filme não encontrado.'}}), isError: true};
    return response({movie});
  });
  server.registerTool('get_seat_availability', {
    description: 'Consulta assentos disponíveis, reservados e ocupados de uma sessão de demonstração. Na Vercel, informa que reservas estão desativadas.',
    inputSchema: {sessionId: z.string().min(1)}, annotations: {readOnlyHint: true}
  }, async ({sessionId}) => reservationResponse(() => getSeatAvailability(sessionId)));
  server.registerTool('create_reservation', {
    description: 'Cria uma reserva simulada, sem pagamento, de assentos de uma sessão. As datas são fictícias. Disponível apenas no servidor local com JSON; indisponível na Vercel. Guarde o cancellationToken retornado para cancelar; não o divulgue.',
    inputSchema: {sessionId: z.string().min(1), seats: z.array(z.string().trim().min(1).max(8)).min(1).max(24)},
    annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: false}
  }, async ({sessionId, seats}) => reservationResponse(async () => ({reservation: await createReservation(sessionId, seats)})));
  server.registerTool('cancel_reservation', {
    description: 'Cancela uma reserva simulada e libera seus assentos no servidor local; indisponível na Vercel. Exige o identificador e o cancellationToken recebido ao reservar. Repetir o cancelamento é seguro.',
    inputSchema: {reservationId: z.string().uuid(), cancellationToken: z.string().regex(/^[a-f0-9]{48}$/)},
    annotations: {readOnlyHint: false, destructiveHint: true, idempotentHint: true}
  }, async ({reservationId, cancellationToken}) => reservationResponse(async () => ({reservation: await cancelReservation(reservationId, cancellationToken)})));
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => { void transport.close(); void server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}
