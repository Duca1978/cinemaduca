import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import handler from '../api/index.js';

test('API de reservas: JSON, conflito, cancelamento e bloqueio na Vercel através do rewrite', async () => {
  const dir=await mkdtemp(join(tmpdir(),'cinema-api-'));
  const previousFile=process.env.CINEMA_RESERVATIONS_FILE;
  const previousVercel=process.env.VERCEL;
  process.env.CINEMA_RESERVATIONS_FILE=join(dir,'reservations.json');
  delete process.env.VERCEL;
  const server=createServer((req,res)=>{
    const url=new URL(req.url!,'http://localhost');url.searchParams.set('route',url.pathname.slice(5));req.url='/api?'+url.searchParams;void handler(req,res);
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  const post=(path:string,body:unknown)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  try {
    assert.equal((await fetch(base+'/api/reservations')).status,405);
    assert.equal((await post('/api/reservations',{sessionId:'sessao-1',seats:[]})).status,400);
    const malformed=await fetch(base+'/api/reservations',{method:'POST',headers:{'Content-Type':'application/json'},body:'invalid'});assert.equal(malformed.status,400);
    const created=await post('/api/reservations',{sessionId:'sessao-1',seats:['B1','B2']});assert.equal(created.status,201);
    const {reservation}=await created.json();assert.equal(reservation.totalBRL,64);
    assert.equal((await post('/api/reservations',{sessionId:'sessao-1',seats:['B1']})).status,409);
    let sessions=await (await fetch(base+'/api/sessions?movieId=orbita')).json();assert.equal(sessions.sessions[0].availableSeats.length,19);
    assert.equal((await post('/api/reservations/cancel',{reservationId:reservation.id,cancellationToken:'0'.repeat(48)})).status,404);
    const cancellation=await post('/api/reservations/cancel',{reservationId:reservation.id,cancellationToken:reservation.cancellationToken});assert.equal(cancellation.status,200);
    assert.equal((await cancellation.json()).reservation.status,'cancelled');
    sessions=await (await fetch(base+'/api/sessions?movieId=orbita')).json();assert.equal(sessions.sessions[0].availableSeats.length,21);
    process.env.VERCEL='1';
    const disabled=await post('/api/reservations',{sessionId:'sessao-1',seats:['B1']});assert.equal(disabled.status,503);assert.equal((await disabled.json()).code,'STORAGE_NOT_CONFIGURED');
  } finally {
    await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    if(previousFile===undefined)delete process.env.CINEMA_RESERVATIONS_FILE;else process.env.CINEMA_RESERVATIONS_FILE=previousFile;
    if(previousVercel===undefined)delete process.env.VERCEL;else process.env.VERCEL=previousVercel;
    await rm(dir,{recursive:true,force:true});
  }
});
