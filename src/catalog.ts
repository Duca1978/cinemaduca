import { readFileSync } from 'node:fs';
interface Movie { id: string; title: string; genre: string; year: number; synopsis: string; durationMinutes: number; ageRating: number; director: string; cast: string[]; protagonist: { name: string; imageUrl: string; imageAlt: string; fictional: boolean; generatedByAI: boolean } }
interface Room { id: string; name: string; capacity: number; rows: string[]; seatsPerRow: number }
interface Session { id: string; movieId: string; roomId: string; date: string; time: string; priceBRL: number; occupiedSeats: string[] }
const data = JSON.parse(readFileSync(new URL('../data/cinema.json', import.meta.url), 'utf8')) as { movies: Movie[]; rooms: Room[]; sessions: Session[] };
const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function searchMovies(query = '', genre = '', actor = '', year?: number) {
  return data.movies.filter(m => normalize(m.title).includes(normalize(query)) && normalize(m.genre).includes(normalize(genre)) && (!actor.trim() || m.cast.some(name => normalize(name).includes(normalize(actor.trim())))) && (year === undefined || m.year === year));
}
export function getMovie(movieId: string) {
  return data.movies.find(movie => movie.id === movieId);
}
export function getSessions(movieId?: string, date?: string) {
  return data.sessions.filter(s => (!movieId || s.movieId === movieId) && (!date || s.date === date)).map(s => {
    const room = data.rooms.find(r => r.id === s.roomId)!;
    return { ...s, movieTitle: data.movies.find(m => m.id === s.movieId)!.title, roomName: room.name,
      availableSeats: room.rows.flatMap(row => Array.from({length: room.seatsPerRow}, (_, i) => `${row}${i+1}`)).filter(seat => !s.occupiedSeats.includes(seat)) };
  });
}
export const manifest = { id: 'cinema-duca', name: 'Cinema Duca', description: 'Cinema virtual da GTA7 Lab. Catálogo e sessões fictícias de demonstração.', capabilities: ['Consultar filmes', 'Consultar sessões, preços e assentos disponíveis', 'Consultar detalhes de filmes', 'Criar e cancelar reservas simuladas (requer armazenamento)'], tools: ['search_movies', 'get_sessions', 'get_movie', 'get_seat_availability', 'create_reservation', 'cancel_reservation'], mcp: { endpoint: '/api/mcp', transport: 'streamable-http', authentication: 'none' }, version: '0.1.0' };
