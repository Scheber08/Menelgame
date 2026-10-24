import {
  actingPlayerId,
  apply,
  createGame,
  replay,
  type Action,
  type GameState,
} from '@menelgame/engine';
import { standardPack } from '@menelgame/packs';
import type { Rules } from '@menelgame/schema';
import { describe, expect, it } from 'vitest';
import { decideBot, newBotMemory, type BotLevel, type BotMemory } from './index';

function newGame(levels: BotLevel[], seed: number, rules: Partial<Rules> = {}): GameState {
  return createGame({
    pack: standardPack,
    seed,
    rules: { ...standardPack.rules, ...rules },
    players: levels.map((_, i) => ({ id: `p${i + 1}`, name: `Bot ${i + 1}`, color: '#000000' })),
  });
}

/**
 * Lässt nur Bots spielen, wie es der Server tut: erst der Handelnde, dann alle anderen
 * (Auktion, Angebote). Tut niemand etwas, schließt die Uhr eine Auktion – sonst wäre das
 * ein Hänger.
 */
function playBots(
  levels: BotLevel[],
  seed: number,
  maxActions: number,
  rules: Partial<Rules> = {},
) {
  const initial = newGame(levels, seed, rules);
  const memories = new Map<string, BotMemory>(initial.players.map((p) => [p.id, newBotMemory()]));
  const level = (id: string) => levels[Number(id.slice(1)) - 1]!;
  let state = initial;
  const actions: Action[] = [];
  while (state.phase.name !== 'gameOver' && actions.length < maxActions) {
    const acting = actingPlayerId(state);
    const order = [acting, ...state.players.map((p) => p.id).filter((id) => id !== acting)];
    let action: Action | null = null;
    for (const id of order) {
      action = decideBot(state, id, level(id), memories.get(id));
      if (action) break;
    }
    if (!action && state.phase.name === 'auction') action = { type: 'AUCTION_CLOSE' };
    if (!action)
      throw new Error(`Hänger in Phase ${state.phase.name} nach ${actions.length} Aktionen`);
    const result = apply(state, action);
    if (!result.ok) throw new Error(`Ungültige Bot-Aktion ${action.type}: ${result.error.code}`);
    actions.push(action);
    state = result.state;
  }
  return { initial, state, actions };
}

describe('Bots spielen allein', () => {
  it.each<[BotLevel[], number]>([
    [['easy', 'easy'], 11],
    [['medium', 'medium'], 12],
    [['medium', 'medium', 'medium'], 13],
    [['easy', 'medium', 'easy', 'medium'], 14],
    [['medium', 'easy', 'medium', 'medium', 'easy', 'medium'], 15],
  ])('%j mit Seed %i spielen ohne Hänger bis zum Ende', (levels, seed) => {
    const game = playBots(levels, seed, 40_000);
    expect(game.state.phase.name).toBe('gameOver');
    expect(replay({ initial: game.initial, actions: game.actions }).state).toEqual(game.state);
  });

  it('beendet ein Spiel mit Rundenlimit', () => {
    const game = playBots(['easy', 'easy', 'easy'], 21, 40_000, {
      victory: { type: 'maxRounds', rounds: 25 },
    });
    expect(game.state.phase.name).toBe('gameOver');
    expect(game.state.round).toBeLessThanOrEqual(26);
  });

  it('bietet in Auktionen mit und kauft Gruppen per Tausch zusammen', () => {
    const game = playBots(['medium', 'medium', 'medium'], 13, 40_000);
    const types = new Set(game.actions.map((a) => a.type));
    expect(types).toContain('AUCTION_BID');
    expect(types).toContain('PROPOSE_TRADE');
    expect(types).toContain('BUILD');
  });
});

describe('Bots schummeln nicht', () => {
  it('entscheiden unabhängig von künftigen Würfen und Kartenreihenfolge', () => {
    const game = playBots(['medium', 'easy', 'medium'], 31, 3_000);
    let state = game.initial;
    for (const action of game.actions.slice(0, 1_500)) {
      const tampered: GameState = {
        ...state,
        rng: { state: (state.rng.state ^ 0x5bd1e995) >>> 0 },
        decks: Object.fromEntries(
          Object.entries(state.decks).map(([id, d]) => [
            id,
            { drawPile: [...d.drawPile].reverse() },
          ]),
        ),
      };
      for (const p of state.players) {
        for (const level of ['easy', 'medium'] as const) {
          expect(decideBot(tampered, p.id, level, newBotMemory())).toEqual(
            decideBot(state, p.id, level, newBotMemory()),
          );
        }
      }
      state = apply(state, action).state;
    }
  });
});

describe('Bot-Entscheidungen', () => {
  function withTiles(state: GameState, owners: Record<string, string>): GameState {
    const tiles = { ...state.tiles };
    for (const [id, owner] of Object.entries(owners)) tiles[id] = { ...tiles[id]!, owner };
    return { ...state, tiles };
  }

  it('Mittel bietet für das letzte fehlende Gruppenfeld, ein mittlerer Gegner nimmt an', () => {
    let state = withTiles(newGame(['medium', 'medium'], 1), {
      schilfweg: 'p1',
      weidenufer: 'p1',
      moewenkai: 'p2',
    });
    const offer = decideBot(state, 'p1', 'medium');
    expect(offer).toMatchObject({
      type: 'PROPOSE_TRADE',
      to: 'p2',
      receive: { tiles: ['moewenkai'] },
    });
    state = apply(state, offer!).state;
    const answer = decideBot(state, 'p2', 'medium');
    expect(answer).toMatchObject({ type: 'ACCEPT_TRADE', playerId: 'p2' });
    // Leicht nimmt nur sehr großzügige Angebote an.
    expect(decideBot(state, 'p2', 'easy')).toMatchObject({ type: 'ACCEPT_TRADE' });
  });

  it('Leicht lehnt normale Angebote ab', () => {
    let state = withTiles(newGame(['easy', 'easy'], 1), { moewenkai: 'p2' });
    state = apply(state, {
      type: 'PROPOSE_TRADE',
      playerId: 'p1',
      to: 'p2',
      give: { cash: 200, tiles: [], jailFreeCards: 0 },
      receive: { cash: 0, tiles: ['moewenkai'], jailFreeCards: 0 },
    }).state;
    expect(decideBot(state, 'p2', 'easy')).toMatchObject({ type: 'REJECT_TRADE' });
  });

  it('Mittel verschenkt keine Gruppe für wenig Geld', () => {
    let state = withTiles(newGame(['medium', 'medium'], 1), {
      schilfweg: 'p1',
      weidenufer: 'p1',
      moewenkai: 'p2',
    });
    state = apply(state, {
      type: 'PROPOSE_TRADE',
      playerId: 'p1',
      to: 'p2',
      give: { cash: 130, tiles: [], jailFreeCards: 0 },
      receive: { cash: 0, tiles: ['moewenkai'], jailFreeCards: 0 },
    }).state;
    expect(decideBot(state, 'p2', 'medium')).toMatchObject({ type: 'REJECT_TRADE' });
  });

  it('begleicht Schulden, bevor er aufgibt', () => {
    let state = withTiles(newGame(['medium', 'medium'], 1), { kristallhoehe: 'p1' });
    state = {
      ...state,
      players: state.players.map((p) => (p.id === 'p1' ? { ...p, cash: 0 } : p)),
      phase: { name: 'awaitingDebt', resume: { kind: 'freePhase', extraRoll: false } },
      debts: [{ debtor: 'p1', creditor: 'bank', amount: 100, reason: 'tax' }],
    };
    expect(decideBot(state, 'p1', 'medium')).toEqual({
      type: 'MORTGAGE',
      playerId: 'p1',
      tileId: 'kristallhoehe',
    });
  });

  it('macht nichts, wenn er nicht dran ist', () => {
    const state = newGame(['medium', 'medium'], 1);
    expect(decideBot(state, 'p2', 'medium')).toBeNull();
    expect(decideBot(state, 'p1', 'medium')).toEqual({ type: 'ROLL_DICE', playerId: 'p1' });
  });
});

describe('Bots auf Brettern mit eigenen Feldtypen', () => {
  it('spielen ohne Hänger auf einem Brett mit Teleportern, Auswahl und Aussetzen', () => {
    const pack = structuredClone(standardPack);
    pack.tileTypes = [
      {
        id: 'teleporter',
        name: 'Teleporter',
        color: '#7c3aed',
        rules: [
          {
            trigger: 'land',
            conditions: [],
            effects: [
              { kind: 'moveToNextOfType', tileType: 'teleporter', passTiles: false, land: false },
            ],
          },
        ],
      },
      {
        id: 'kreuzung',
        name: 'Kreuzung',
        color: '#0088aa',
        rules: [
          {
            trigger: 'land',
            conditions: [],
            effects: [
              {
                kind: 'choice',
                options: [
                  { label: 'Geld', effects: [{ kind: 'collect', amount: 50 }] },
                  {
                    label: 'Aussetzen',
                    effects: [
                      { kind: 'skipTurns', turns: 1 },
                      { kind: 'collect', amount: 200 },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ];
    pack.tiles = pack.tiles.map((t) =>
      t.id === 'grundsteuer' || t.id === 'luxusabgabe'
        ? { id: t.id, name: 'Teleporter', type: 'custom' as const, tileType: 'teleporter' }
        : t.id === 'glueck-2'
          ? { id: t.id, name: 'Kreuzung', type: 'custom' as const, tileType: 'kreuzung' }
          : t,
    );
    for (const seed of [41, 42, 43]) {
      const initial = createGame({
        pack,
        seed,
        players: ['p1', 'p2', 'p3'].map((id) => ({ id, name: id, color: '#000000' })),
      });
      let state = initial;
      const memories = new Map(state.players.map((p) => [p.id, newBotMemory()]));
      let steps = 0;
      while (state.phase.name !== 'gameOver' && steps++ < 40_000) {
        const acting = actingPlayerId(state);
        const order = [acting, ...state.players.map((p) => p.id).filter((id) => id !== acting)];
        let action: Action | null = null;
        for (const id of order) {
          action = decideBot(state, id, id === 'p2' ? 'easy' : 'medium', memories.get(id));
          if (action) break;
        }
        action ??= state.phase.name === 'auction' ? { type: 'AUCTION_CLOSE' } : null;
        if (!action) throw new Error(`Hänger in ${state.phase.name}`);
        const result = apply(state, action);
        if (!result.ok) throw new Error(`${action.type}: ${result.error.code}`);
        state = result.state;
      }
      expect(state.phase.name).toBe('gameOver');
    }
  });
});
