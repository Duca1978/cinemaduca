import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { getSessions } from './catalog.js';

export class ReservationError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
export interface Reservation {
  id: string; sessionId: string; seats: string[]; totalBRL: number;
  status: 'reserved' | 'cancelled'; createdAt: string; cancellationHash: string;
}
export interface ReservationStore {
  list(sessionId: string): Promise<Reservation[]>;
  create(reservation: Reservation): Promise<Reservation>;
  cancel(id: string, cancellationHash: string): Promise<Reservation>;
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const publicReservation = ({cancellationHash, ...reservation}: Reservation) => ({...reservation, simulated: true});

export class JsonReservationStore implements ReservationStore {
  constructor(private path: string) {}
  private async read(): Promise<Reservation[]> {
    try {
      const data: unknown = JSON.parse(await readFile(this.path, 'utf8'));
      if (!Array.isArray(data)) throw new Error('Invalid reservations file');
      return data as Reservation[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }
  private async update(change: (items: Reservation[]) => Reservation): Promise<Reservation> {
    await mkdir(dirname(this.path), {recursive: true});
    const lock = this.path + '.lock';
    let acquired = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try { await mkdir(lock); acquired = true; break; }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
    }
    if (!acquired) throw new ReservationError('STORAGE_BUSY', 'Armazenamento ocupado. Tente novamente.');
    const temp = this.path + '.' + randomUUID() + '.tmp';
    try {
      const items = await this.read();
      const result = change(items);
      await writeFile(temp, JSON.stringify(items, null, 2), {mode: 0o600});
      await rename(temp, this.path);
      return result;
    } finally {
      await rm(temp, {force: true});
      await rm(lock, {recursive: true, force: true});
    }
  }
  async list(sessionId: string) { return (await this.read()).filter(r => r.sessionId === sessionId && r.status === 'reserved'); }
  async create(reservation: Reservation) {
    return this.update(items => {
      if (items.some(r => r.sessionId === reservation.sessionId && r.status === 'reserved' && r.seats.some(s => reservation.seats.includes(s)))) {
        throw new ReservationError('SEAT_UNAVAILABLE', 'Um ou mais assentos já estão reservados. Consulte a disponibilidade.');
      }
      items.push(reservation); return reservation;
    });
  }
  async cancel(id: string, cancellationHash: string) {
    return this.update(items => {
      const reservation = items.find(r => r.id === id && r.cancellationHash === cancellationHash);
      if (!reservation) throw new ReservationError('RESERVATION_NOT_FOUND', 'Reserva ou código de cancelamento inválido.');
      reservation.status = 'cancelled'; return reservation;
    });
  }
}
export function getReservationStore(): ReservationStore {
  if (process.env.VERCEL) throw new ReservationError('STORAGE_NOT_CONFIGURED', 'Reservas disponíveis apenas na demonstração local em JSON; a Vercel está em modo de consulta.');
  return new JsonReservationStore(resolve(process.env.CINEMA_RESERVATIONS_FILE ?? '.local/reservations.json'));
}
function sessionById(id: string) {
  const session = getSessions().find(s => s.id === id);
  if (!session) throw new ReservationError('SESSION_NOT_FOUND', 'Sessão não encontrada.');
  return session;
}
export async function getSeatAvailability(sessionId: string, store?: ReservationStore) {
  const session = sessionById(sessionId);
  if (!store && process.env.VERCEL) return {sessionId, occupiedSeats: session.occupiedSeats, reservedSeats: [], availableSeats: session.availableSeats, simulated: true, reservationMode: 'disabled', message: 'Vercel: somente consultas; reservas disponíveis apenas na demonstração local em JSON.'};
  const reservedSeats = (await (store ?? getReservationStore()).list(sessionId)).flatMap(r => r.seats);
  return {sessionId, occupiedSeats: session.occupiedSeats, reservedSeats,
    availableSeats: session.availableSeats.filter(s => !reservedSeats.includes(s)), simulated: true, reservationMode: 'local-json'};
}
export async function createReservation(sessionId: string, seats: string[], store = getReservationStore()) {
  const session = sessionById(sessionId);
  const normalized = seats.map(s => s.trim().toUpperCase());
  if (!normalized.length || normalized.length > 24 || new Set(normalized).size !== normalized.length) {
    throw new ReservationError('INVALID_SEATS', 'Escolha de 1 a 24 assentos distintos.');
  }
  if (normalized.some(s => !session.availableSeats.includes(s))) {
    throw new ReservationError('SEAT_UNAVAILABLE', 'Assento inválido ou ocupado. Consulte a disponibilidade.');
  }
  const cancellationToken = randomBytes(24).toString('hex');
  const reservation = await store.create({id: randomUUID(), sessionId, seats: normalized,
    totalBRL: Math.round(session.priceBRL * normalized.length * 100) / 100,
    status: 'reserved', createdAt: new Date().toISOString(), cancellationHash: hash(cancellationToken)});
  return {...publicReservation(reservation), cancellationToken};
}
export async function cancelReservation(reservationId: string, cancellationToken: string, store = getReservationStore()) {
  return publicReservation(await store.cancel(reservationId, hash(cancellationToken)));
}

export async function getSessionsWithReservations(movieId?: string, date?: string) {
  return Promise.all(getSessions(movieId, date).map(async session => ({...session, ...await getSeatAvailability(session.id)})));
}
