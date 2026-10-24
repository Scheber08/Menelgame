import { decideBot, newBotMemory, type BotMemory } from '@menelgame/bots';
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
  BOT_NAMES,
  ClientMessageSchema,
  PLAYER_COLORS,
  withPlayer,
  type BotLevel,
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
  /** Bot-Platz und seine Stufe; null für Menschen. */
  bot: BotLevel | null;
  /** Seit wann ein Mensch keine Verbindung mehr hat. */
  disconnectedAt: number | null;
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
  /** Nach so vielen Sekunden ohne Verbindung spielt ein Bot für den Menschen; null = nie. */
  botTakeoverSeconds: number | null;
  /** Nächster Bot-Zug (die Verzögerung macht Bot-Züge für Menschen nachvollziehbar). */
  botAt: number | null;
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
/** Pause vor jedem Bot-Zug, damit Menschen mitlesen können. */
export const BOT_DELAY_MS = 900;
/** Abwesende Menschen vertritt ein vorsichtiger Bot. */
export const STAND_IN_LEVEL: BotLevel = 'easy';
export const DEFAULT_TAKEOVER_SECONDS = 60;

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
    botTakeoverSeconds: DEFAULT_TAKEOVER_SECONDS,
    botAt: null,
    createdAt: now,
  };
}

/**
 * Ein Spielraum: Lobby, Plätze mit Reconnect-Token, Bots, autoritativer Spielzustand über
 * die Engine, Host-Rechte und Uhren. Die Klasse ist frei von Cloudflare-APIs.
 */
export class Room {
  private readonly memories = new Map<string, BotMemory>();

  constructor(
    private readonly host: RoomHost,
    public data: RoomData,
    public game: GameRecord | null,
  ) {
    // Ältere gespeicherte Räume kannten noch keine Bots.
    data.botTakeoverSeconds ??= DEFAULT_TAKEOVER_SECONDS;
    data.botAt ??= null;
    for (const seat of data.seats) {
      seat.bot ??= null;
      seat.disconnectedAt ??= null;
    }
  }

  view(): RoomView {
    const online = new Set(this.host.connections().map((c) => c.seatId));
    const now = this.host.now();
    return {
      code: this.data.code,
      status: this.data.status,
      hostSeatId: this.data.hostSeatId,
      seats: this.data.seats.map((s) => ({
        id: s.id,
        name: s.name,
        color: s.color,
        connected: s.bot !== null || online.has(s.id),
        bot: s.bot,
        standIn: s.bot === null && this.isStandIn(s, now),
      })),
      packId: this.data.packId,
      rules: this.data.rules,
      dice: this.data.dice,
      paused: this.data.paused,
      deadline: this.data.deadline,
      botTakeoverSeconds: this.data.botTakeoverSeconds,
      serverTime: now,
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

  /** Eine Verbindung ist weg: Abwesenheit merken, damit später ein Bot übernehmen kann. */
  disconnected(): void {
    const online = new Set(this.host.connections().map((c) => c.seatId));
    const now = this.host.now();
    for (const seat of this.data.seats) {
      if (seat.bot === null && !online.has(seat.id) && seat.disconnectedAt === null)
        seat.disconnectedAt = now;
    }
    this.scheduleBots();
    this.persistRoom();
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
      case 'addBot':
        return this.addBot(conn, message.level);
      case 'configure':
        return this.configure(conn, message.packId, message.rules, message.dice);
      case 'roomSettings':
        return this.roomSettings(conn, message.botTakeoverSeconds);
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

  /**
   * Alarm: zuerst ein fälliger Bot-Zug, sonst eine abgelaufene Uhr (Auktion schließen bzw.
   * Standardaktion für den Spieler am Zug). Danach wird der nächste Alarm gestellt.
   */
  alarm(): void {
    if (!this.game || this.data.status !== 'playing' || this.data.paused) {
      this.armAlarm();
      return;
    }
    const now = this.host.now();
    let acted = false;

    if (this.data.botAt !== null && now >= this.data.botAt - 25) {
      this.data.botAt = null;
      const step = this.nextBotAction(false);
      if (step) acted = this.run(step, null);
    }

    const deadline = this.data.deadline;
    if (!acted && deadline && now >= deadline.at - 25) {
      const action =
        deadline.kind === 'auction'
          ? ({ type: 'AUCTION_CLOSE' } as const)
          : getDefaultAction(this.game.state);
      acted = action !== null && this.run(action, null);
      if (!acted) this.data.deadline = null;
    }

    if (!acted) {
      // Nichts passiert (z. B. Vertretung beginnt jetzt): neu planen und alle informieren.
      this.scheduleBots();
      this.persistRoom();
      this.broadcastRoom();
    }
  }

  // ---- Lobby ---------------------------------------------------------------------------

  private hello(conn: Connection, token: string | undefined): void {
    const seat = token
      ? this.data.seats.find((s) => s.bot === null && s.token === token)
      : undefined;
    this.host.assignSeat(conn.id, seat?.id ?? null);
    if (seat) seat.disconnectedAt = null;
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
    if (seat) {
      this.scheduleBots();
      this.persistRoom();
    }
    this.broadcastRoom();
  }

  private join(conn: Connection, name: string, color: string): void {
    if (conn.seatId) return this.error(conn.id, 'alreadySeated');
    if (this.data.status !== 'lobby') return this.error(conn.id, 'notInLobby');
    if (this.isFull()) return this.error(conn.id, 'roomFull');
    if (this.data.seats.some((s) => s.color === color)) return this.error(conn.id, 'colorTaken');

    const seat = this.addSeat(name, color, null);
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

  private addBot(conn: Connection, level: BotLevel): void {
    if (!this.isHost(conn)) return this.error(conn.id, 'notHost');
    if (this.data.status !== 'lobby') return this.error(conn.id, 'notInLobby');
    if (this.isFull()) return this.error(conn.id, 'roomFull');
    const names = new Set(this.data.seats.map((s) => s.name));
    const colors = new Set(this.data.seats.map((s) => s.color));
    const name = BOT_NAMES.find((n) => !names.has(n)) ?? `Bot ${this.data.nextSeat}`;
    const color = PLAYER_COLORS.find((c) => !colors.has(c)) ?? PLAYER_COLORS[0]!;
    this.addSeat(name, color, level);
    this.persistRoom();
    this.broadcastRoom();
  }

  private addSeat(name: string, color: string, bot: BotLevel | null): Seat {
    const seat: Seat = {
      id: `p${this.data.nextSeat++}`,
      name,
      color,
      token: this.host.newToken(),
      bot,
      disconnectedAt: null,
    };
    this.data.seats.push(seat);
    return seat;
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

  private roomSettings(conn: Connection, botTakeoverSeconds: number | null): void {
    if (!this.isHost(conn)) return this.error(conn.id, 'notHost');
    this.data.botTakeoverSeconds = botTakeoverSeconds;
    this.scheduleBots();
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
    this.data.deadline = this.nextDeadline(initial, initial, null, []);
    this.scheduleBots();
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
    this.data.deadline = paused
      ? null
      : this.nextDeadline(this.game.state, this.game.state, null, []);
    this.scheduleBots();
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
    this.data.deadline = this.nextDeadline(before, result.state, action, result.events);
    this.scheduleBots();
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

  // ---- Bots -----------------------------------------------------------------------------

  /** Vertritt gerade ein Bot diesen (abwesenden) Menschen? */
  private isStandIn(seat: Seat, now: number): boolean {
    const limit = this.data.botTakeoverSeconds;
    return (
      seat.bot === null &&
      this.data.status === 'playing' &&
      seat.disconnectedAt !== null &&
      limit !== null &&
      now - seat.disconnectedAt >= limit * 1000
    );
  }

  private botLevel(seat: Seat, now: number): BotLevel | null {
    return seat.bot ?? (this.isStandIn(seat, now) ? STAND_IN_LEVEL : null);
  }

  /**
   * Nächste Aktion eines Bots: erst der Spieler am Zug, dann alle anderen (Auktion,
   * Angebote). `probe` prüft nur, ohne das Gedächtnis der Bots zu verändern.
   */
  private nextBotAction(probe: boolean): Action | null {
    const state = this.game?.state;
    if (!state || state.phase.name === 'gameOver') return null;
    const now = this.host.now();
    const acting = actingPlayerId(state);
    const seats = [...this.data.seats].sort(
      (a, b) => Number(b.id === acting) - Number(a.id === acting),
    );
    for (const seat of seats) {
      const level = this.botLevel(seat, now);
      if (!level) continue;
      let memory = this.memories.get(seat.id);
      if (!memory) {
        memory = newBotMemory();
        this.memories.set(seat.id, memory);
      }
      const action = decideBot(state, seat.id, level, probe ? structuredClone(memory) : memory);
      if (action) return action;
    }
    return null;
  }

  /** Plant den nächsten Bot-Zug und stellt den Alarm. */
  private scheduleBots(): void {
    const now = this.host.now();
    const active = this.data.status === 'playing' && !this.data.paused && this.game !== null;
    if (active && this.nextBotAction(true)) {
      this.data.botAt =
        this.data.botAt !== null && this.data.botAt > now ? this.data.botAt : now + BOT_DELAY_MS;
    } else {
      this.data.botAt = null;
    }
    this.armAlarm();
  }

  /** Ein Alarm für alles: Bot-Zug, Uhr und der Moment, ab dem ein Bot vertritt. */
  private armAlarm(): void {
    const times: number[] = [];
    if (this.data.status === 'playing' && !this.data.paused) {
      if (this.data.deadline) times.push(this.data.deadline.at);
      if (this.data.botAt !== null) times.push(this.data.botAt);
      const limit = this.data.botTakeoverSeconds;
      const now = this.host.now();
      if (limit !== null) {
        for (const seat of this.data.seats) {
          if (seat.bot !== null || seat.disconnectedAt === null) continue;
          const at = seat.disconnectedAt + limit * 1000;
          if (at > now) times.push(at);
        }
      }
    }
    this.host.setAlarm(times.length > 0 ? Math.min(...times) : null);
  }

  // ---- Hilfen ---------------------------------------------------------------------------

  private isFull(): boolean {
    const pack = findPack(this.data.packId) ?? standardPack;
    return this.data.seats.length >= pack.maxPlayers;
  }

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
