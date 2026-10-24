import {
  actingPlayerId,
  apply,
  createGame,
  getDefaultAction,
  type Action,
  type ApplyResult,
  type GameEvent,
  type GameState,
} from '@menelgame/engine';
import { builtInPacks, standardPack } from '@menelgame/packs';
import {
  ClientMessageSchema,
  withPlayer,
  type ClientMessage,
  type Deadline,
  type ErrorCode,
  type RoomView,
  type ServerMessage,
} from '@menelgame/protocol';
import {
  DiceSchema,
  RulesSchema,
  type BoardPack,
  type DiceConfig,
  type Rules,
} from '@menelgame/schema';

export interface Seat {
  id: string;
  name: string;
  color: string;
  /** Geheimes Reconnect-Token; bleibt im Browser des Spielers. */
  token: string;
}

/** Dauerhaft gespeicherte Raumdaten (ohne Spielzustand). */
export interface RoomData {
  code: string;
  status: RoomView['status'];
  hostSeatId: string | null;
  seats: Seat[];
  nextSeat: number;
  packId: string;
  rules: Rules;
  dice: DiceConfig;
  paused: boolean;
  deadline: Deadline | null;
  createdAt: number;
}

/** Spielzustand im Raum: Start fürs Replay, aktueller Stand, jüngste Ereignisse. */
export interface GameRecord {
  initial: GameState;
  state: GameState;
  events: GameEvent[];
}

export interface Connection {
  id: string;
  seatId: string | null;
}

/**
 * Alles, was der Raum von seiner Umgebung braucht. Im Worker ist das das Durable Object,
 * in Tests eine Attrappe.
 */
export interface RoomHost {
  now(): number;
  randomSeed(): number;
  newToken(): string;
  connections(): Connection[];
  send(connId: string, message: ServerMessage): void;
  assignSeat(connId: string, seatId: string | null): void;
  saveRoom(data: RoomData): void;
  /** Speichert den Spielstand; `appended` sind die neuen Aktionen fürs Log (leer beim Start). */
  saveGame(game: GameRecord, appended: Action[]): void;
  setAlarm(at: number | null): void;
}

/** So viele Ereignisse bekommt ein Client nach dem (Wieder-)Verbinden. */
export const RECENT_EVENTS = 300;

export function findPack(packId: string): BoardPack | undefined {
  return builtInPacks.find((p) => p.meta.id === packId);
}

export function newRoomData(code: string, now: number): RoomData {
  return {
    code,
    status: 'lobby',
    hostSeatId: null,
    seats: [],
    nextSeat: 1,
    packId: standardPack.meta.id,
    rules: structuredClone(standardPack.rules),
    dice: structuredClone(standardPack.dice),
    paused: false,
    deadline: null,
    createdAt: now,
  };
}

/**
 * Ein Spielraum: Lobby, Plätze mit Reconnect-Token, autoritativer Spielzustand über die
 * Engine, Host-Rechte und Uhren. Die Klasse ist frei von Cloudflare-APIs.
 */
export class Room {
  constructor(
    private readonly host: RoomHost,
    public data: RoomData,
    public game: GameRecord | null,
  ) {}

  view(): RoomView {
    const online = new Set(this.host.connections().map((c) => c.seatId));
    return {
      code: this.data.code,
      status: this.data.status,
      hostSeatId: this.data.hostSeatId,
      seats: this.data.seats.map((s) => ({
        id: s.id,
        name: s.name,
        color: s.color,
        connected: online.has(s.id),
      })),
      packId: this.data.packId,
      rules: this.data.rules,
      dice: this.data.dice,
      paused: this.data.paused,
      deadline: this.data.deadline,
      serverTime: this.host.now(),
    };
  }

  /** Rohe Nachricht vom WebSocket. */
  receive(connId: string, raw: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.error(connId, 'badMessage');
      return;
    }
    const message = ClientMessageSchema.safeParse(parsed);
    if (!message.success) {
      this.error(connId, 'badMessage');
      return;
    }
    const conn = this.host.connections().find((c) => c.id === connId) ?? {
      id: connId,
      seatId: null,
    };
    this.handle(conn, message.data);
  }

  disconnected(): void {
    this.broadcastRoom();
  }

  handle(conn: Connection, message: ClientMessage): void {
    switch (message.t) {
      case 'hello':
        return this.hello(conn, message.token);
      case 'join':
        return this.join(conn, message.name, message.color);
      case 'updateSeat':
        return this.updateSeat(conn, message.name, message.color);
      case 'configure':
        return this.configure(conn, message.packId, message.rules, message.dice);
      case 'start':
        return this.start(conn);
      case 'action':
        return this.playerAction(conn, message.action);
      case 'kick':
        return this.kick(conn, message.seatId);
      case 'pause':
        return this.pause(conn, message.paused);
      case 'updateRules':
        return this.updateRules(conn, message.rules, message.dice);
      case 'ping':
        this.host.send(conn.id, { t: 'pong', serverTime: this.host.now() });
        return;
    }
  }

  /** Uhr abgelaufen: Auktion schließen oder Standardaktion für den Spieler am Zug. */
  alarm(): void {
    const deadline = this.data.deadline;
    if (!deadline || !this.game || this.data.paused || this.data.status !== 'playing') return;
    if (this.host.now() < deadline.at - 25) {
      this.host.setAlarm(deadline.at);
      return;
    }
    const action =
      deadline.kind === 'auction'
        ? ({ type: 'AUCTION_CLOSE' } as const)
        : getDefaultAction(this.game.state);
    if (!action || !this.run(action, null)) {
      this.setDeadline(null);
      this.persistRoom();
      this.broadcastRoom();
    }
  }

  // ---- Lobby ---------------------------------------------------------------------------

  private hello(conn: Connection, token: string | undefined): void {
    const seat = token ? this.data.seats.find((s) => s.token === token) : undefined;
    this.host.assignSeat(conn.id, seat?.id ?? null);
    this.host.send(conn.id, {
      t: 'welcome',
      seatId: seat?.id ?? null,
      token: seat?.token ?? null,
      room: this.view(),
    });
    if (this.game) {
      this.host.send(conn.id, {
        t: 'game',
        state: this.game.state,
        events: this.game.events,
        reset: true,
      });
    }
    this.broadcastRoom();
  }

  private join(conn: Connection, name: string, color: string): void {
    if (conn.seatId) return this.error(conn.id, 'alreadySeated');
    if (this.data.status !== 'lobby') return this.error(conn.id, 'notInLobby');
    const pack = findPack(this.data.packId) ?? standardPack;
    if (this.data.seats.length >= pack.maxPlayers) return this.error(conn.id, 'roomFull');
    if (this.data.seats.some((s) => s.color === color)) return this.error(conn.id, 'colorTaken');

    const seat: Seat = { id: `p${this.data.nextSeat++}`, name, color, token: this.host.newToken() };
    this.data.seats.push(seat);
    this.data.hostSeatId ??= seat.id;
    this.host.assignSeat(conn.id, seat.id);
    this.persistRoom();
    this.host.send(conn.id, {
      t: 'welcome',
      seatId: seat.id,
      token: seat.token,
      room: this.view(),
    });
    this.broadcastRoom();
  }

  private updateSeat(conn: Connection, name: string, color: string): void {
    if (this.data.status !== 'lobby') return this.error(conn.id, 'notInLobby');
    const seat = this.data.seats.find((s) => s.id === conn.seatId);
    if (!seat) return this.error(conn.id, 'notSeated');
    if (this.data.seats.some((s) => s.id !== seat.id && s.color === color))
      return this.error(conn.id, 'colorTaken');
    seat.name = name;
    seat.color = color;
    this.persistRoom();
    this.broadcastRoom();
  }

  private configure(conn: Connection, packId: string, rules: unknown, dice: unknown): void {
    if (!this.isHost(conn)) return this.error(conn.id, 'notHost');
    if (this.data.status !== 'lobby') return this.error(conn.id, 'notInLobby');
    const pack = findPack(packId);
    if (!pack) return this.error(conn.id, 'unknownPack');
    const parsedRules = RulesSchema.safeParse(rules);
    const parsedDice = DiceSchema.safeParse(dice);
    if (!parsedRules.success || !parsedDice.success) return this.error(conn.id, 'invalidRules');
    if (this.data.seats.length > pack.maxPlayers) return this.error(conn.id, 'tooManyPlayers');
    this.data.packId = pack.meta.id;
    this.data.rules = parsedRules.data;
    this.data.dice = parsedDice.data;
    this.persistRoom();
    this.broadcastRoom();
  }

  private start(conn: Connection): void {
    if (!this.isHost(conn)) return this.error(conn.id, 'notHost');
    if (this.data.status !== 'lobby') return this.error(conn.id, 'notInLobby');
    if (this.data.seats.length < 2) return this.error(conn.id, 'tooFewPlayers');
    const pack = findPack(this.data.packId) ?? standardPack;
    const initial = createGame({
      pack,
      rules: this.data.rules,
      dice: this.data.dice,
      seed: this.host.randomSeed(),
      players: this.data.seats.map((s) => ({ id: s.id, name: s.name, color: s.color })),
    });
    this.game = { initial, state: initial, events: [] };
    this.data.status = 'playing';
    this.setDeadline(this.nextDeadline(initial, initial, null, []));
    this.host.saveGame(this.game, []);
    this.persistRoom();
    this.broadcast({ t: 'game', state: initial, events: [], reset: true });
    this.broadcastRoom();
  }

  // ---- Spiel ----------------------------------------------------------------------------

  private playerAction(conn: Connection, input: Parameters<typeof withPlayer>[0]): void {
    if (this.data.status !== 'playing' || !this.game) return this.error(conn.id, 'notPlaying');
    if (!conn.seatId) return this.error(conn.id, 'notSeated');
    if (this.data.paused) return this.error(conn.id, 'paused');
    // Der Spieler kommt immer aus der Verbindung, nie aus der Nachricht.
    this.run(withPlayer(input, conn.seatId), conn.id);
  }

  private kick(conn: Connection, seatId: string): void {
    if (!this.isHost(conn)) return this.error(conn.id, 'notHost');
    const seat = this.data.seats.find((s) => s.id === seatId);
    if (!seat || seat.id === conn.seatId) return this.error(conn.id, 'unknownSeat');

    if (this.data.status === 'lobby') {
      this.data.seats = this.data.seats.filter((s) => s.id !== seatId);
      for (const c of this.host.connections().filter((c) => c.seatId === seatId)) {
        this.host.assignSeat(c.id, null);
        this.error(c.id, 'kicked');
      }
      this.persistRoom();
      this.broadcastRoom();
      return;
    }
    if (this.game) this.run({ type: 'REMOVE_PLAYER', targetId: seatId }, conn.id);
  }

  private pause(conn: Connection, paused: boolean): void {
    if (!this.isHost(conn)) return this.error(conn.id, 'notHost');
    if (this.data.status !== 'playing' || !this.game) return this.error(conn.id, 'notPlaying');
    this.data.paused = paused;
    // Nach der Pause beginnt die Uhr neu.
    this.setDeadline(paused ? null : this.nextDeadline(this.game.state, this.game.state, null, []));
    this.persistRoom();
    this.broadcastRoom();
  }

  private updateRules(conn: Connection, rules: unknown, dice: unknown): void {
    if (!this.isHost(conn)) return this.error(conn.id, 'notHost');
    if (this.data.status === 'lobby') return this.configure(conn, this.data.packId, rules, dice);
    if (!this.game) return this.error(conn.id, 'notPlaying');
    const parsedRules = RulesSchema.safeParse(rules);
    const parsedDice = DiceSchema.safeParse(dice);
    if (!parsedRules.success || !parsedDice.success) return this.error(conn.id, 'invalidRules');
    this.run({ type: 'UPDATE_RULES', rules: parsedRules.data, dice: parsedDice.data }, conn.id);
  }

  /** Wendet eine Aktion an. Liefert false, wenn die Engine sie ablehnt. */
  private run(action: Action, replyTo: string | null): boolean {
    if (!this.game) return false;
    const result = apply(this.game.state, action);
    if (!result.ok) {
      if (replyTo) {
        this.host.send(replyTo, {
          t: 'error',
          code: 'engine',
          engineCode: result.error.code,
          message: result.error.message,
        });
      }
      return false;
    }
    this.commit(action, result);
    return true;
  }

  private commit(action: Action, result: Extract<ApplyResult, { ok: true }>): void {
    const game = this.game!;
    const before = game.state;
    game.state = result.state;
    game.events = [...game.events, ...result.events].slice(-RECENT_EVENTS);
    if (result.state.phase.name === 'gameOver') this.data.status = 'finished';
    if (action.type === 'UPDATE_RULES') {
      this.data.rules = result.state.rules;
      this.data.dice = result.state.dice;
    }
    this.setDeadline(this.nextDeadline(before, result.state, action, result.events));
    this.host.saveGame(game, [action]);
    this.persistRoom();
    this.broadcast({ t: 'game', state: result.state, events: result.events, reset: false });
    this.broadcastRoom();
  }

  /**
   * Nächste Frist. Auktion: Startdauer, bei Geboten mindestens die Verlängerung. Zugtimer:
   * neu, sobald jemand anderes handeln muss oder der Handelnde etwas getan hat.
   */
  private nextDeadline(
    before: GameState,
    after: GameState,
    action: Action | null,
    events: GameEvent[],
  ): Deadline | null {
    if (this.data.paused || after.phase.name === 'gameOver') return null;
    const timers = after.rules.timers;
    const now = this.host.now();
    const previous = this.data.deadline;

    if (after.phase.name === 'auction') {
      const fresh =
        !previous || previous.kind !== 'auction' || events.some((e) => e.type === 'auctionStarted');
      if (fresh) return { kind: 'auction', at: now + timers.auctionSeconds * 1000 };
      if (action?.type === 'AUCTION_BID')
        return {
          kind: 'auction',
          at: Math.max(previous.at, now + timers.auctionExtendSeconds * 1000),
        };
      return previous;
    }

    if (timers.turnSeconds === null) return null;
    const actor = actingPlayerId(after);
    const reset =
      !previous ||
      previous.kind !== 'turn' ||
      action === null ||
      action.type === 'UPDATE_RULES' ||
      actingPlayerId(before) !== actor ||
      before.phase.name !== after.phase.name ||
      ('playerId' in action && action.playerId === actor);
    return reset ? { kind: 'turn', at: now + timers.turnSeconds * 1000 } : previous;
  }

  private setDeadline(deadline: Deadline | null): void {
    this.data.deadline = deadline;
    this.host.setAlarm(deadline?.at ?? null);
  }

  // ---- Hilfen ---------------------------------------------------------------------------

  private isHost(conn: Connection): boolean {
    return conn.seatId !== null && conn.seatId === this.data.hostSeatId;
  }

  private persistRoom(): void {
    this.host.saveRoom(this.data);
  }

  private broadcast(message: ServerMessage): void {
    for (const conn of this.host.connections()) this.host.send(conn.id, message);
  }

  private broadcastRoom(): void {
    this.broadcast({ t: 'room', room: this.view() });
  }

  private error(connId: string, code: ErrorCode): void {
    this.host.send(connId, { t: 'error', code });
  }
}
