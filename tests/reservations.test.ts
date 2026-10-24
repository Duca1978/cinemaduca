import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cancelReservation, createReservation, getSeatAvailability, JsonReservationStore } from '../src/reservations.js';

test('reservas JSON: concorrência, persistência, validação e cancelamento', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cinema-reservations-'));
  const path = join(dir, 'reservations.json');
  const store = new JsonReservationStore(path);
  try {
    await assert.rejects(createReservation('unknown',['B1'],store),{code:'SESSION_NOT_FOUND'});
    await assert.rejects(createReservation('sessao-1',['A1'],store),{code:'SEAT_UNAVAILABLE'});
    await assert.rejects(createReservation('sessao-1',['Z1'],store),{code:'SEAT_UNAVAILABLE'});
    await assert.rejects(createReservation('sessao-1',['B1','b1'],store),{code:'INVALID_SEATS'});
    await assert.rejects(createReservation('sessao-1',[],store),{code:'INVALID_SEATS'});
    const attempts = await Promise.allSettled([
      createReservation('sessao-1',['b1','B2'],store),
      createReservation('sessao-1',['B1','B3'],new JsonReservationStore(path))
    ]);
    assert.equal(attempts.filter(r => r.status === 'fulfilled').length,1);
    assert.equal(attempts.filter(r => r.status === 'rejected').length,1);
    const reservation = (attempts.find(r => r.status === 'fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof createReservation>>>).value;
    assert.equal(reservation.totalBRL,64);
    assert.ok(!('cancellationHash' in reservation));
    assert.ok(!(await readFile(path,'utf8')).includes(reservation.cancellationToken));
    const restored = new JsonReservationStore(path);
    assert.equal((await getSeatAvailability('sessao-1',restored)).availableSeats.length,19);
    await assert.rejects(cancelReservation(reservation.id,'invalid',restored),{code:'RESERVATION_NOT_FOUND'});
    assert.equal((await getSeatAvailability('sessao-1',restored)).availableSeats.length,19);
    assert.equal((await cancelReservation(reservation.id,reservation.cancellationToken,restored)).status,'cancelled');
    assert.equal((await cancelReservation(reservation.id,reservation.cancellationToken,restored)).status,'cancelled');
    assert.equal((await getSeatAvailability('sessao-1',restored)).availableSeats.length,21);
    await createReservation('sessao-1',['B1'],restored);
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('Vercel: consultas funcionam e mutações são recusadas sem gravar JSON temporário', async () => {
  const previous = process.env.VERCEL;
  process.env.VERCEL = '1';
  try {
    const availability = await getSeatAvailability('sessao-1');
    assert.equal(availability.reservationMode,'disabled');
    assert.equal(availability.availableSeats.length,21);
    await assert.rejects(createReservation('sessao-1',['B1']),{code:'STORAGE_NOT_CONFIGURED'});
    await assert.rejects(cancelReservation('unknown','token'),{code:'STORAGE_NOT_CONFIGURED'});
  } finally {if(previous === undefined) delete process.env.VERCEL; else process.env.VERCEL = previous;}
});
