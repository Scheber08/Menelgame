import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, type CreateRoomResponse } from '@menelgame/protocol';
import type { Env } from './gameRoom';

export { GameRoom } from './gameRoom';

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH));
  return [...bytes].map((b) => ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length]).join('');
}

const json = (body: unknown, status = 200) => Response.json(body, { status });

/**
 * Router: legt Räume an, beantwortet Raum-Infos und leitet WebSockets unter
 * /r/<code>/ws an das Durable Object des Raums weiter. Alles andere sind statische Dateien
 * der Web-App (mit SPA-Fallback, damit /r/<code> als Einladungslink funktioniert).
 */
export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const roomStub = (code: string) => env.ROOMS.get(env.ROOMS.idFromName(code));

    if (url.pathname === '/api/rooms') {
      if (request.method !== 'POST') return json({ error: 'method' }, 405);
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = randomCode();
        if (await roomStub(code).init(code))
          return json({ code } satisfies CreateRoomResponse, 201);
      }
      return json({ error: 'busy' }, 503);
    }

    const info = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]+)$/);
    if (info) {
      const result = await roomStub(info[1]!).info();
      return result ? json(result) : json({ error: 'notFound' }, 404);
    }

    const log = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]+)\/log$/);
    if (log) {
      const result = await roomStub(log[1]!).log();
      return result ? json(result) : json({ error: 'notFound' }, 404);
    }

    const socket = url.pathname.match(/^\/r\/([A-Z0-9]+)\/ws$/);
    if (socket) return roomStub(socket[1]!).fetch(request);

    if (url.pathname.startsWith('/api/')) return json({ error: 'notFound' }, 404);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
