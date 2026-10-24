import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import handler from '../api/index.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { searchMovies, getSessions } from '../src/catalog.js';
test('filtra títulos e gêneros, ignorando acentos', () => {
  assert.equal(searchMovies('orbita')[0]?.id, 'orbita');
  assert.equal(searchMovies('', 'comedia')[0]?.id, 'bairro');
  assert.equal(searchMovies('inexistente').length, 0);
});
test('combina ator e ano com os outros filtros', () => {
  assert.equal(searchMovies('', '', '  caio  ', 2026)[0]?.id, 'orbita');
  assert.equal(searchMovies('', '', 'joao', 2024)[0]?.id, 'mar');
  assert.equal(searchMovies('', '', 'Caio', 2025).length, 0);
  assert.equal(searchMovies('', '', '', 2025)[0]?.id, 'bairro');
  assert.equal(searchMovies('orbita', 'Drama', 'Caio', 2026).length, 0);
});
test('filtra sessões e exclui assentos ocupados', () => {
  const sessions = getSessions('orbita', '2026-10-24');
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].availableSeats.length, 21);
  assert.ok(!sessions[0].availableSeats.includes('A1'));
  assert.equal(getSessions(undefined, '2020-01-01').length, 0);
});
test('HTTP e cliente MCP: inicialização, descoberta e execução das ferramentas', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cinema-mcp-'));
  const process = spawn('node', ['--import', 'tsx', 'src/server.ts'], { env: {...globalThis.process.env, PORT:'3101', CINEMA_RESERVATIONS_FILE:join(dir,'reservations.json')}, stdio:'pipe' });
  const base = 'http://127.0.0.1:3101';
  const client = new Client({name:'cinema-test',version:'1.0.0'});
  try {
    let ready = false;
    for(let i=0;i<50;i++) { try {if((await fetch(base)).ok) {ready=true;break;}} catch {} await new Promise(r=>setTimeout(r,100)); }
    assert.ok(ready, 'servidor deve iniciar');
    const page=await (await fetch(base)).text();assert.match(page,/Cinema Duca/);
    const movies=await (await fetch(base+'/api/movies?query=orbita')).json(); assert.equal(movies.movies.length,1);
    const filtered=await (await fetch(base+'/api/movies?actor=caio&year=2026')).json(); assert.equal(filtered.movies[0].id,'orbita');
    assert.equal((await fetch(base+'/api/movies?year=abc')).status,400);
    assert.equal((await (await fetch(base+'/api/movies?actor=caio&year=2025')).json()).movies.length,0);
    const manifest=await (await fetch(base+'/api/manifest')).json();assert.equal(manifest.id,'cinema-duca');
    assert.equal((await fetch(base+'/api/unknown')).status,404);
    assert.equal((await fetch(base+'/api/movies',{method:'POST'})).status,405);
    await client.connect(new StreamableHTTPClientTransport(new URL(base+'/api/mcp')));
    const {tools}=await client.listTools();assert.deepEqual(tools.map(t=>t.name).sort(),['cancel_reservation','create_reservation','get_movie','get_seat_availability','get_sessions','search_movies']);
    const detail = await client.callTool({name:'get_movie',arguments:{movieId:'orbita'}});
    assert.equal((detail.structuredContent as {movie:{id:string}}).movie.id, 'orbita');
    const protagonist = (detail.structuredContent as {movie:{protagonist:{imageUrl:string;fictional:boolean}}}).movie.protagonist;
    assert.equal(protagonist.fictional, true);
    const portrait = await fetch(base+protagonist.imageUrl);assert.equal(portrait.status,200);assert.equal(portrait.headers.get('content-type'),'image/png');
    const bytes = new Uint8Array(await portrait.arrayBuffer());assert.deepEqual(Array.from(bytes.slice(0,8)),[137,80,78,71,13,10,26,10]);
    const missing = await client.callTool({name:'get_movie',arguments:{movieId:'unknown'}}); assert.equal(missing.isError,true);
    const created = await client.callTool({name:'create_reservation',arguments:{sessionId:'sessao-1',seats:['B1','B2']}});
    assert.ok(!created.isError);
    const reservation = (created.structuredContent as {reservation:{id:string;cancellationToken:string;totalBRL:number}}).reservation;
    assert.equal(reservation.totalBRL,64);
    const availability = await client.callTool({name:'get_seat_availability',arguments:{sessionId:'sessao-1'}});
    assert.equal((availability.structuredContent as {availableSeats:string[]}).availableSeats.length,19);
    const httpSessions = await (await fetch(base+'/api/sessions?movieId=orbita')).json();
    assert.equal(httpSessions.sessions[0].availableSeats.length,19);
    const duplicate = await client.callTool({name:'create_reservation',arguments:{sessionId:'sessao-1',seats:['B1']}}); assert.equal(duplicate.isError,true);
    const wrongToken = await client.callTool({name:'cancel_reservation',arguments:{reservationId:reservation.id,cancellationToken:'0'.repeat(48)}});assert.equal(wrongToken.isError,true);
    const cancelled = await client.callTool({name:'cancel_reservation',arguments:{reservationId:reservation.id,cancellationToken:reservation.cancellationToken}});
    assert.equal((cancelled.structuredContent as {reservation:{status:string}}).reservation.status,'cancelled');
    const moviesResult=await client.callTool({name:'search_movies',arguments:{query:'Órbita'}});
    assert.equal((moviesResult.structuredContent as {movies:unknown[]}).movies.length,1);
    const actorResult=await client.callTool({name:'search_movies',arguments:{actor:'João',year:2024}});
    assert.equal((actorResult.structuredContent as {movies:{id:string}[]}).movies[0].id,'mar');
    const invalidYear=await client.callTool({name:'search_movies',arguments:{year:2024.5}});assert.equal(invalidYear.isError,true);
    const sessionsResult=await client.callTool({name:'get_sessions',arguments:{movieId:'orbita'}});
    assert.equal((sessionsResult.structuredContent as {sessions:{availableSeats:string[]}[]}).sessions[0].availableSeats.length,21);
    const invalid=await client.callTool({name:'get_sessions',arguments:{date:'invalid'}});assert.equal(invalid.isError,true);
  } finally {await client.close();process.kill();await rm(dir,{recursive:true,force:true});}
});

test('rotas e MCP preservados após rewrite da Vercel', async () => {
  const server = createServer((req, res) => {
    const url = new URL(req.url!, 'http://localhost');
    url.searchParams.set('route', url.pathname.slice('/api/'.length));
    req.url = '/api?' + url.searchParams;
    void handler(req, res);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  const client = new Client({name:'vercel-rewrite-test',version:'1.0.0'});
  try {
    const all = await (await fetch(base+'/api/movies')).json();
    assert.equal(all.movies.length, 3);
    const filtered = await (await fetch(base+'/api/movies?actor=caio&year=2026')).json();
    assert.equal(filtered.movies[0].id, 'orbita');
    const sessions = await (await fetch(base+'/api/sessions')).json();
    assert.equal(sessions.sessions.length, 3);
    assert.equal((await (await fetch(base+'/api/manifest')).json()).id, 'cinema-duca');
    await client.connect(new StreamableHTTPClientTransport(new URL(base+'/api/mcp')));
    assert.equal((await client.listTools()).tools.length, 6);
    const result = await client.callTool({name:'search_movies', arguments:{actor:'Caio'}});
    assert.equal((result.structuredContent as {movies:{id:string}[]}).movies[0].id, 'orbita');
  } finally {
    await client.close();
    await new Promise<void>((resolve,reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
