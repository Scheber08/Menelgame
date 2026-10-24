import { replay, type Action, type GameState } from '@menelgame/engine';
import type { ClientMessage, ServerMessage } from '@menelgame/protocol';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  newRoomData,
  Room,
  type Connection,
  type GameRecord,
  type RoomData,
  type RoomHost,
} from './room';

/** Attrappe für das Durable Object: Verbindungen, Speicher und Uhr im Speicher. */
class FakeHost implements RoomHost {
  clock = 1_000_000;
  seed = 4242;
  tokens = 0;
  conns = new Map<string, Connection>();
  inbox = new Map<string, ServerMessage[]>();
  saved: { room: RoomData | null; game: GameRecord | null; actions: Action[] } = {
    room: null,
    game: null,
    actions: [],
  };
  alarmAt: number | null = null;

  now = () => this.clock;
  randomSeed = () => this.seed;
  newToken = () => `token-${++this.tokens}`;
  connections = () => [...this.conns.values()];
  send = (connId: string, message: ServerMessage) => {
    if (!this.conns.has(connId)) return;
    this.inbox.get(connId)!.push(structuredClone(message));
  };
  assignSeat = (connId: string, seatId: string | null) => {
    const conn = this.conns.get(connId);
    if (conn) conn.seatId = seatId;
  };
  saveRoom = (data: RoomData) => {
    this.saved.room = structuredClone(data);
  };
  saveGame = (game: GameRecord, appended: Action[]) => {
    if (appended.length === 0) this.saved.actions = [];
    this.saved.actions.push(...structuredClone(appended));
    this.saved.game = structuredClone(game);
  };
  setAlarm = (at: number | null) => {
    this.alarmAt = at;
  };

  open(id: string): void {
    this.conns.set(id, { id, seatId: null });
    this.inbox.set(id, []);
  }

  close(id: string): void {
    this.conns.delete(id);
  }

  take(id: string): ServerMessage[] {
    const messages = this.inbox.get(id) ?? [];
    this.inbox.set(id, []);
    return messages;
  }

  last<T extends ServerMessage['t']>(
    id: string,
    t: T,
  ): Extract<ServerMessage, { t: T }> | undefined {
    const all = (this.inbox.get(id) ?? []).filter((m) => m.t === t);
    return all.at(-1) as Extract<ServerMessage, { t: T }> | undefined;
  }
}

let host: FakeHost;
let room: Room;

function send(connId: string, message: ClientMessage): void {
  room.receive(connId, JSON.stringify(message));
}

function connect(connId: string, token?: string): void {
  host.open(connId);
  send(connId, token ? { t: 'hello', token } : { t: 'hello' });
}

function seat(connId: string, name: string, color: string): string {
  send(connId, { t: 'join', name, color });
  const welcome = host.last(connId, 'welcome');
  return welcome!.token!;
}

function state(): GameState {
  return room.game!.state;
}

/** Zwei Spieler in der Lobby: a = Host (p1), b = p2. */
function lobbyWithTwo() {
  connect('a');
  connect('b');
  const tokenA = seat('a', 'Anna', '#e5484d');
  const tokenB = seat('b', 'Ben', '#3e63dd');
  return { tokenA, tokenB };
}

function startGame() {
  const tokens = lobbyWithTwo();
  send('a', { t: 'start' });
  return tokens;
}

beforeEach(() => {
  host = new FakeHost();
  room = new Room(host, newRoomData('ABCDEF', host.clock), null);
});

describe('Lobby', () => {
  it('vergibt Plätze, Tokens und macht den ersten Spieler zum Host', () => {
    lobbyWithTwo();
    const view = room.view();
    expect(view.hostSeatId).toBe('p1');
    expect(view.seats).toEqual([
      { id: 'p1', name: 'Anna', color: '#e5484d', connected: true, bot: null, standIn: false },
      { id: 'p2', name: 'Ben', color: '#3e63dd', connected: true, bot: null, standIn: false },
    ]);
    expect(host.last('b', 'welcome')).toMatchObject({ seatId: 'p2', token: 'token-2' });
    // Tokens erscheinen nie in der öffentlichen Ansicht.
    expect(JSON.stringify(host.last('a', 'room'))).not.toContain('token-');
  });

  it('verhindert doppelte Farben und volle Räume', () => {
    connect('a');
    seat('a', 'Anna', '#e5484d');
    connect('b');
    send('b', { t: 'join', name: 'Ben', color: '#e5484d' });
    expect(host.last('b', 'error')).toEqual({ t: 'error', code: 'colorTaken' });
    send('a', { t: 'join', name: 'Anna2', color: '#000000' });
    expect(host.last('a', 'error')).toEqual({ t: 'error', code: 'alreadySeated' });
  });

  it('lässt nur den Host konfigurieren und starten', () => {
    lobbyWithTwo();
    send('b', { t: 'start' });
    expect(host.last('b', 'error')).toEqual({ t: 'error', code: 'notHost' });
    const rules = { ...room.data.rules, startingCash: 2000 };
    send('b', { t: 'configure', packId: 'standard', rules, dice: room.data.dice });
    expect(host.last('b', 'error')).toEqual({ t: 'error', code: 'notHost' });
    send('a', { t: 'configure', packId: 'standard', rules, dice: room.data.dice });
    expect(room.data.rules.startingCash).toBe(2000);
    send('a', { t: 'configure', packId: 'gibtsnicht', rules, dice: room.data.dice });
    expect(host.last('a', 'error')).toEqual({ t: 'error', code: 'unknownPack' });
    send('a', { t: 'configure', packId: 'standard', rules: { startingCash: -1 }, dice: {} });
    expect(host.last('a', 'error')).toEqual({ t: 'error', code: 'invalidRules' });
  });

  it('braucht mindestens zwei Spieler', () => {
    connect('a');
    seat('a', 'Anna', '#e5484d');
    send('a', { t: 'start' });
    expect(host.last('a', 'error')).toEqual({ t: 'error', code: 'tooFewPlayers' });
  });

  it('startet das Spiel mit den Regeln der Lobby und schickt allen den Zustand', () => {
    lobbyWithTwo();
    const rules = { ...room.data.rules, startingCash: 999 };
    send('a', { t: 'configure', packId: 'standard', rules, dice: room.data.dice });
    send('a', { t: 'start' });
    expect(room.data.status).toBe('playing');
    const game = host.last('b', 'game')!;
    expect(game.reset).toBe(true);
    expect(game.state.players.map((p) => [p.id, p.name, p.cash])).toEqual([
      ['p1', 'Anna', 999],
      ['p2', 'Ben', 999],
    ]);
    // Später Beitretende können keinen Platz mehr nehmen.
    connect('c');
    send('c', { t: 'join', name: 'Cleo', color: '#30a46c' });
    expect(host.last('c', 'error')).toEqual({ t: 'error', code: 'notInLobby' });
  });

  it('entfernt in der Lobby Plätze auf Wunsch des Hosts', () => {
    lobbyWithTwo();
    send('a', { t: 'kick', seatId: 'p2' });
    expect(room.data.seats.map((s) => s.id)).toEqual(['p1']);
    expect(host.last('b', 'error')).toEqual({ t: 'error', code: 'kicked' });
    expect(host.conns.get('b')!.seatId).toBeNull();
  });

  it('weist kaputte Nachrichten ab', () => {
    connect('a');
    room.receive('a', 'kein json');
    room.receive('a', JSON.stringify({ t: 'unbekannt' }));
    expect(host.take('a').filter((m) => m.t === 'error')).toEqual([
      { t: 'error', code: 'badMessage' },
      { t: 'error', code: 'badMessage' },
    ]);
  });
});

describe('Spiel über den Raum', () => {
  it('wendet Aktionen an und verteilt Zustand und Ereignisse', () => {
    startGame();
    host.take('a');
    host.take('b');
    send('a', { t: 'action', action: { type: 'ROLL_DICE' } });
    const forB = host.last('b', 'game')!;
    expect(forB.reset).toBe(false);
    expect(forB.events[0]).toMatchObject({ type: 'diceRolled', playerId: 'p1' });
    expect(forB.state.actionCount).toBe(1);
  });

  it('setzt den Spieler immer aus der Verbindung ein', () => {
    startGame();
    // b versucht, als p1 zu würfeln – die Nachricht enthält gar keinen Spieler,
    // und der Raum setzt p2 ein, der nicht am Zug ist.
    send('b', { t: 'action', action: { type: 'ROLL_DICE', playerId: 'p1' } as never });
    expect(host.last('b', 'error')).toMatchObject({ code: 'engine', engineCode: 'notYourTurn' });
    expect(state().actionCount).toBe(0);
  });

  it('lässt Zuschauer nicht mitspielen', () => {
    startGame();
    connect('z');
    expect(host.last('z', 'welcome')).toMatchObject({ seatId: null, token: null });
    expect(host.last('z', 'game')?.reset).toBe(true);
    send('z', { t: 'action', action: { type: 'ROLL_DICE' } });
    expect(host.last('z', 'error')).toEqual({ t: 'error', code: 'notSeated' });
  });

  it('übernimmt beim Reconnect mit Token denselben Platz', () => {
    const { tokenA } = startGame();
    send('a', { t: 'action', action: { type: 'ROLL_DICE' } });
    host.close('a');
    room.disconnected();
    expect(room.view().seats[0]!.connected).toBe(false);

    connect('a2', tokenA);
    expect(host.last('a2', 'welcome')).toMatchObject({ seatId: 'p1', token: tokenA });
    const snapshot = host.last('a2', 'game')!;
    expect(snapshot.reset).toBe(true);
    expect(snapshot.state).toEqual(state());
    expect(snapshot.events.length).toBeGreaterThan(0);
    expect(room.view().seats[0]!.connected).toBe(true);
    // Und kann weiterspielen.
    const phase = state().phase.name;
    send('a2', {
      t: 'action',
      action: phase === 'awaitingPurchase' ? { type: 'DECLINE' } : { type: 'END_TURN' },
    });
    expect(host.last('a2', 'error')).toBeUndefined();
  });

  it('lehnt ein falsches Token ab und macht zum Zuschauer', () => {
    startGame();
    connect('x', 'falsch');
    expect(host.last('x', 'welcome')).toMatchObject({ seatId: null });
  });

  it('pausiert und setzt fort (nur Host)', () => {
    startGame();
    send('b', { t: 'pause', paused: true });
    expect(host.last('b', 'error')).toEqual({ t: 'error', code: 'notHost' });
    send('a', { t: 'pause', paused: true });
    send('a', { t: 'action', action: { type: 'ROLL_DICE' } });
    expect(host.last('a', 'error')).toEqual({ t: 'error', code: 'paused' });
    send('a', { t: 'pause', paused: false });
    send('a', { t: 'action', action: { type: 'ROLL_DICE' } });
    expect(state().actionCount).toBe(1);
  });

  it('nimmt Spieler auf Wunsch des Hosts aus dem Spiel', () => {
    connect('a');
    connect('b');
    connect('c');
    seat('a', 'Anna', '#e5484d');
    seat('b', 'Ben', '#3e63dd');
    seat('c', 'Cleo', '#30a46c');
    send('a', { t: 'start' });
    send('a', { t: 'kick', seatId: 'p3' });
    expect(state().players.find((p) => p.id === 'p3')?.bankrupt).toBe(true);
    expect(host.last('c', 'game')!.events).toContainEqual({
      type: 'playerRemoved',
      playerId: 'p3',
    });
  });

  it('ändert Regeln live über das Log', () => {
    startGame();
    const rules = { ...room.data.rules, passStartBonus: 500 };
    send('a', { t: 'updateRules', rules, dice: room.data.dice });
    expect(state().rules.passStartBonus).toBe(500);
    expect(room.data.rules.passStartBonus).toBe(500);
    expect(host.saved.actions.at(-1)).toMatchObject({ type: 'UPDATE_RULES' });
    send('b', { t: 'updateRules', rules, dice: room.data.dice });
    expect(host.last('b', 'error')).toEqual({ t: 'error', code: 'notHost' });
  });

  it('beendet nach Ablauf des Zugtimers den Zug mit der Standardaktion', () => {
    lobbyWithTwo();
    const rules = { ...room.data.rules, timers: { ...room.data.rules.timers, turnSeconds: 30 } };
    send('a', { t: 'configure', packId: 'standard', rules, dice: room.data.dice });
    send('a', { t: 'start' });
    expect(room.data.deadline).toEqual({ kind: 'turn', at: host.clock + 30_000 });
    expect(host.alarmAt).toBe(host.clock + 30_000);

    // Zu früh: nichts passiert, Alarm wird neu gestellt.
    host.clock += 10_000;
    room.alarm();
    expect(state().actionCount).toBe(0);

    host.clock += 20_000;
    room.alarm();
    expect(state().actionCount).toBe(1);
    expect(room.game!.events[0]).toMatchObject({ type: 'diceRolled', playerId: 'p1' });
    expect(room.data.deadline?.at).toBe(host.clock + 30_000);
  });

  it('schließt Auktionen nach Ablauf und verlängert bei Geboten', () => {
    startGame();
    // Vorbereitung: p1 steht vor dem Busbahnhof (Feld 5).
    room.game!.state = {
      ...state(),
      phase: { name: 'awaitingPurchase', tileId: 'busbahnhof', extraRoll: false },
    };
    send('a', { t: 'action', action: { type: 'DECLINE' } });
    expect(state().phase.name).toBe('auction');
    const start = host.clock;
    expect(room.data.deadline).toEqual({ kind: 'auction', at: start + 15_000 });

    host.clock += 12_000;
    send('b', { t: 'action', action: { type: 'AUCTION_BID', amount: 40 } });
    expect(room.data.deadline).toEqual({ kind: 'auction', at: host.clock + 8_000 });

    host.clock += 8_000;
    room.alarm();
    expect(state().auction).toBeNull();
    expect(state().tiles.busbahnhof?.owner).toBe('p2');
    expect(room.data.deadline).toBeNull();
  });

  it('übersteht einen Neustart des Durable Objects', () => {
    startGame();
    send('a', { t: 'action', action: { type: 'ROLL_DICE' } });
    // Neu aufbauen nur aus dem Gespeicherten.
    const saved = structuredClone(host.saved);
    const reborn = new Room(host, saved.room!, saved.game!);
    expect(reborn.game!.state).toEqual(state());
    expect(replay({ initial: saved.game!.initial, actions: saved.actions }).state).toEqual(state());
  });
});

/** Lässt die Uhr bis zum jeweils nächsten Alarm laufen. */
function runAlarms(maxSteps: number): number {
  let steps = 0;
  while (host.alarmAt !== null && steps < maxSteps) {
    host.clock = Math.max(host.clock, host.alarmAt);
    room.alarm();
    steps++;
  }
  return steps;
}

describe('Bots im Raum', () => {
  it('fügt Bots nur als Host in der Lobby hinzu', () => {
    lobbyWithTwo();
    send('b', { t: 'addBot', level: 'easy' });
    expect(host.last('b', 'error')).toEqual({ t: 'error', code: 'notHost' });
    send('a', { t: 'addBot', level: 'medium' });
    send('a', { t: 'addBot', level: 'easy' });
    expect(room.view().seats.slice(2)).toEqual([
      {
        id: 'p3',
        name: 'Bot Anton',
        color: '#30a46c',
        connected: true,
        bot: 'medium',
        standIn: false,
      },
      {
        id: 'p4',
        name: 'Bot Berta',
        color: '#f5a524',
        connected: true,
        bot: 'easy',
        standIn: false,
      },
    ]);
    // Bots lassen sich wie Menschen wieder entfernen.
    send('a', { t: 'kick', seatId: 'p4' });
    expect(room.view().seats).toHaveLength(3);
  });

  it('lässt Bots mit kurzer Verzögerung ziehen', () => {
    connect('a');
    seat('a', 'Anna', '#e5484d');
    send('a', { t: 'addBot', level: 'medium' });
    send('a', { t: 'start' });
    expect(room.data.botAt).toBeNull();
    send('a', { t: 'action', action: { type: 'ROLL_DICE' } });
    // Anna zieht zu Ende; danach ist der Bot dran.
    while (room.game!.state.currentPlayer === 0 && room.game!.state.phase.name !== 'gameOver') {
      const phase = room.game!.state.phase;
      if (phase.name === 'auction') {
        runAlarms(1);
        continue;
      }
      const action =
        phase.name === 'awaitingPurchase'
          ? ({ type: 'DECLINE' } as const)
          : phase.name === 'freePhase' && phase.extraRoll
            ? ({ type: 'ROLL_DICE' } as const)
            : ({ type: 'END_TURN' } as const);
      send('a', { t: 'action', action });
    }
    const count = room.game!.state.actionCount;
    expect(room.data.botAt).toBe(host.clock + 900);
    // Vor Ablauf passiert nichts.
    host.clock += 500;
    room.alarm();
    expect(room.game!.state.actionCount).toBe(count);
    host.clock += 400;
    room.alarm();
    expect(room.game!.state.actionCount).toBe(count + 1);
    expect(room.game!.events.some((e) => e.type === 'diceRolled' && e.playerId === 'p2')).toBe(
      true,
    );
  });

  it('vertritt abwesende Spieler nach der eingestellten Zeit', () => {
    const { tokenB } = lobbyWithTwo();
    send('a', { t: 'roomSettings', botTakeoverSeconds: 30 });
    send('a', { t: 'start' });
    // Anna (p1) ist dran und geht offline.
    host.close('a');
    room.disconnected();
    expect(room.data.seats[0]!.disconnectedAt).toBe(host.clock);
    expect(host.alarmAt).toBe(host.clock + 30_000);
    expect(room.view().seats[0]!.standIn).toBe(false);

    host.clock += 30_000;
    room.alarm();
    expect(room.view().seats[0]!.standIn).toBe(true);
    // Der Vertreter zieht nach der kurzen Verzögerung.
    runAlarms(1);
    expect(room.game!.events.some((e) => e.type === 'diceRolled' && e.playerId === 'p1')).toBe(
      true,
    );

    // Ben bleibt Mensch und wird nicht vertreten.
    expect(room.view().seats[1]).toMatchObject({ standIn: false, connected: true });
    expect(tokenB).toBeTruthy();
  });

  it('beendet die Vertretung, sobald der Spieler zurück ist', () => {
    const { tokenA } = lobbyWithTwo();
    send('a', { t: 'roomSettings', botTakeoverSeconds: 10 });
    send('a', { t: 'start' });
    host.close('a');
    room.disconnected();
    host.clock += 10_000;
    room.alarm();
    expect(room.view().seats[0]!.standIn).toBe(true);
    connect('a2', tokenA);
    expect(room.view().seats[0]!.standIn).toBe(false);
    expect(room.data.seats[0]!.disconnectedAt).toBeNull();
  });

  it('übernimmt nie, wenn der Host das abschaltet', () => {
    lobbyWithTwo();
    send('a', { t: 'roomSettings', botTakeoverSeconds: null });
    send('a', { t: 'start' });
    host.close('a');
    room.disconnected();
    expect(host.alarmAt).toBeNull();
  });

  it('spielt ein Spiel nur mit Bots über den Alarm bis zum Ende', () => {
    connect('a');
    seat('a', 'Anna', '#e5484d');
    send('a', { t: 'addBot', level: 'medium' });
    send('a', { t: 'addBot', level: 'easy' });
    send('a', { t: 'addBot', level: 'medium' });
    send('a', { t: 'roomSettings', botTakeoverSeconds: 10 });
    send('a', { t: 'start' });
    // Der Host geht; ab jetzt spielen nur noch Bots (einer davon als Vertretung).
    host.close('a');
    room.disconnected();
    const steps = runAlarms(50_000);
    expect(room.game!.state.phase.name).toBe('gameOver');
    expect(room.data.status).toBe('finished');
    expect(steps).toBeLessThan(50_000);
    expect(host.alarmAt).toBeNull();
    // Auch dieses Spiel lässt sich exakt nachspielen.
    expect(
      replay({ initial: host.saved.game!.initial, actions: host.saved.actions }).state,
    ).toEqual(room.game!.state);
  });
});
