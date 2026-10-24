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
  const process = spawn('node', ['--import', 'tsx', 'src/server.ts'], { env: {...globalThis.process.env, PORT:'3101'}, stdio:'pipe' });
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
    const {tools}=await client.listTools();assert.deepEqual(tools.map(t=>t.name).sort(),['get_sessions','search_movies']);
    const moviesResult=await client.callTool({name:'search_movies',arguments:{query:'Órbita'}});
    assert.equal((moviesResult.structuredContent as {movies:unknown[]}).movies.length,1);
    const actorResult=await client.callTool({name:'search_movies',arguments:{actor:'João',year:2024}});
    assert.equal((actorResult.structuredContent as {movies:{id:string}[]}).movies[0].id,'mar');
    const invalidYear=await client.callTool({name:'search_movies',arguments:{year:2024.5}});assert.equal(invalidYear.isError,true);
    const sessionsResult=await client.callTool({name:'get_sessions',arguments:{movieId:'orbita'}});
    assert.equal((sessionsResult.structuredContent as {sessions:{availableSeats:string[]}[]}).sessions[0].availableSeats.length,21);
    const invalid=await client.callTool({name:'get_sessions',arguments:{date:'invalid'}});assert.equal(invalid.isError,true);
  } finally {await client.close();process.kill();}
});
