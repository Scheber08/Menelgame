import type { Action } from '@menelgame/engine';
import type { RoomInfoResponse, ServerMessage } from '@menelgame/protocol';
import { DurableObject } from 'cloudflare:workers';
import {
  newRoomData,
  Room,
  type Connection,
  type GameRecord,
  type RoomData,
  type RoomHost,
} from './room';

export interface Env {
  ROOMS: DurableObjectNamespace<GameRoom>;
  ASSETS: Fetcher;
  DB: D1Database;
}

interface Attachment {
  id: string;
  seatId: string | null;
}

const OPEN = 1;

/**
 * Ein Durable Object pro Spielraum. Hält den autoritativen Zustand, nimmt WebSockets mit
 * Hibernation an und speichert alles in seinem SQLite-Speicher:
 * - KV `room`, `initial`, `state`, `events`
 * - Tabelle `actions` mit dem vollständigen Aktions-Log (für Replay und Export)
 */
export class GameRoom extends DurableObject<Env> implements RoomHost {
  private room: Room | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Pings beantwortet die Laufzeit selbst, ohne das Objekt aufzuwecken.
    ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong","serverTime":0}'),
    );
    void ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(
        'CREATE TABLE IF NOT EXISTS actions (seq INTEGER PRIMARY KEY AUTOINCREMENT, json TEXT NOT NULL)',
      );
      const data = await ctx.storage.get<RoomData>('room');
      if (!data) return;
      const [initial, state, events] = await Promise.all([
        ctx.storage.get<GameRecord['initial']>('initial'),
        ctx.storage.get<GameRecord['state']>('state'),
        ctx.storage.get<GameRecord['events']>('events'),
      ]);
      const game = initial && state ? { initial, state, events: events ?? [] } : null;
      this.room = new Room(this, data, game);
    });
  }

  // ---- RPC vom Worker ----------------------------------------------------------------

  /** Legt den Raum an; false, wenn es ihn schon gibt. */
  async init(code: string): Promise<boolean> {
    if (this.room) return false;
    const data = newRoomData(code, Date.now());
    this.room = new Room(this, data, null);
    this.saveRoom(data);
    return true;
  }

  async info(): Promise<RoomInfoResponse | null> {
    if (!this.room) return null;
    const { data } = this.room;
    return {
      code: data.code,
      status: data.status,
      seats: data.seats.length,
      maxPlayers: this.room.pack().maxPlayers,
    };
  }

  /**
   * Vollständiges Log (Startzustand + Aktionen) zum Export und Nachspielen. Erst nach
   * Spielende, weil der Startzustand den Zufallsgenerator enthält.
   */
  async log(): Promise<{ initial: unknown; actions: Action[] } | 'notFinished' | null> {
    if (this.room && this.room.data.status !== 'finished') return 'notFinished';
    const initial = await this.ctx.storage.get('initial');
    if (!initial) return null;
    const actions = this.ctx.storage.sql
      .exec<{ json: string }>('SELECT json FROM actions ORDER BY seq')
      .toArray()
      .map((row) => JSON.parse(row.json) as Action);
    return { initial, actions };
  }

  override async fetch(request: Request): Promise<Response> {
    if (!this.room) return new Response('Raum nicht gefunden', { status: 404 });
    if (request.headers.get('Upgrade') !== 'websocket')
      return new Response('WebSocket erwartet', { status: 426 });
    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id: crypto.randomUUID(), seatId: null } satisfies Attachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  // ---- WebSocket-Hibernation ---------------------------------------------------------

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const raw = typeof message === 'string' ? message : new TextDecoder().decode(message);
    const { id } = ws.deserializeAttachment() as Attachment;
    this.room?.receive(id, raw);
  }

  override async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try {
      ws.close(code === 1005 ? 1000 : code, 'bye');
    } catch {
      // Bereits geschlossen.
    }
    this.room?.disconnected();
  }

  override async webSocketError(): Promise<void> {
    this.room?.disconnected();
  }

  override async alarm(): Promise<void> {
    this.room?.alarm();
  }

  // ---- RoomHost ----------------------------------------------------------------------

  now(): number {
    return Date.now();
  }

  randomSeed(): number {
    return crypto.getRandomValues(new Uint32Array(1))[0]!;
  }

  newToken(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  private sockets(): { ws: WebSocket; att: Attachment }[] {
    return this.ctx
      .getWebSockets()
      .filter((ws) => ws.readyState === OPEN)
      .map((ws) => ({ ws, att: ws.deserializeAttachment() as Attachment }));
  }

  connections(): Connection[] {
    return this.sockets().map(({ att }) => ({ id: att.id, seatId: att.seatId }));
  }

  send(connId: string, message: ServerMessage): void {
    const target = this.sockets().find(({ att }) => att.id === connId);
    try {
      target?.ws.send(JSON.stringify(message));
    } catch {
      // Verbindung bricht gerade ab; der Client holt sich den Stand beim Reconnect.
    }
  }

  assignSeat(connId: string, seatId: string | null): void {
    const target = this.sockets().find(({ att }) => att.id === connId);
    target?.ws.serializeAttachment({ id: connId, seatId } satisfies Attachment);
  }

  saveRoom(data: RoomData): void {
    void this.ctx.storage.put('room', data);
  }

  saveGame(game: GameRecord, appended: Action[]): void {
    if (appended.length === 0) {
      this.ctx.storage.sql.exec('DELETE FROM actions');
      void this.ctx.storage.put('initial', game.initial);
    }
    for (const action of appended) {
      this.ctx.storage.sql.exec('INSERT INTO actions (json) VALUES (?)', JSON.stringify(action));
    }
    void this.ctx.storage.put({ state: game.state, events: game.events });
  }

  setAlarm(at: number | null): void {
    if (at === null) void this.ctx.storage.deleteAlarm();
    else void this.ctx.storage.setAlarm(at);
  }
}
