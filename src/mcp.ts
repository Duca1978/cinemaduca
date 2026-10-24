import type { IncomingMessage, ServerResponse } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { searchMovies, getSessions } from './catalog.js';
export async function handleMcp(req: IncomingMessage & { body?: unknown }, res: ServerResponse) {
  const server = new McpServer({ name: 'cinema-duca', version: '0.1.0' });
  server.registerTool('search_movies', { description: 'Consulta filmes fictícios do Cinema Duca por título e gênero.', inputSchema: { query: z.string().optional(), genre: z.string().optional() } }, async ({ query, genre }) => {
    const result = { movies: searchMovies(query, genre) };
    return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
  });
  server.registerTool('get_sessions', { description: 'Consulta sessões de demonstração, preços em reais e assentos disponíveis. As datas são fixas e podem estar no passado.', inputSchema: { movieId: z.string().optional(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() } }, async ({ movieId, date }) => {
    const result = { sessions: getSessions(movieId, date) };
    return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
  });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => { void transport.close(); void server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}
