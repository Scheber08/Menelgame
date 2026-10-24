import { describe, expect, it } from 'vitest';
import { apply, getLegalActions } from './apply';
import { replay } from './replay';
import { HOTEL } from './selectors';
import { newGame, type NewGameOptions } from './test/helpers';
import type { Action, GameEvent, GameState } from './types';

/**
 * Einfache, deterministische Strategie für Testspiele: kauft alles, baut mit Reserve,
 * liquidiert in Schulden und gibt erst auf, wenn nichts mehr geht.
 */
function choose(state: GameState, actions: Action[]): Action {
  const find = (type: Action['type']) => actions.find((a) => a.type === type);
  const me = state.players.find((p) => p.id === actions[0]!.playerId)!;

  if (state.phase.name === 'awaitingDebt') {
    return (
      find('PAY_DEBT') ?? find('SELL_BUILDING') ?? find('MORTGAGE') ?? find('DECLARE_BANKRUPTCY')!
    );
  }
  if (state.phase.name === 'awaitingPurchase') return find('BUY') ?? find('DECLINE')!;
  if (me.inJail && find('USE_JAIL_CARD')) return find('USE_JAIL_CARD')!;
  if (me.cash > 600 && find('UNMORTGAGE')) return find('UNMORTGAGE')!;
  if (me.cash > 300 && find('BUILD')) return find('BUILD')!;
  return find('ROLL_DICE') ?? find('END_TURN')!;
}

function playGame(
  seed: number,
  players: number,
  maxActions = 20_000,
  rules: NewGameOptions['rules'] = {},
) {
  const initial = newGame({ seed, players, rules });
  let state = initial;
  const actions: Action[] = [];
  const events: GameEvent[] = [];
  while (state.phase.name !== 'gameOver' && actions.length < maxActions) {
    const legal = getLegalActions(state);
    expect(legal.length).toBeGreaterThan(0);
    const action = choose(state, legal);
    const result = apply(state, action);
    expect(result.ok).toBe(true);
    actions.push(action);
    events.push(...result.events);
    state = result.state;
    checkInvariants(state);
  }
  return { initial, state, actions, events };
}

function checkInvariants(state: GameState): void {
  for (const p of state.players) expect(p.cash).toBeGreaterThanOrEqual(0);
  let houses = 0;
  let hotels = 0;
  for (const ts of Object.values(state.tiles)) {
    if (ts.buildings === HOTEL) hotels++;
    else houses += ts.buildings;
    if (ts.owner) expect(state.players.find((p) => p.id === ts.owner)?.bankrupt).toBe(false);
  }
  expect(houses + (state.bank.houses ?? 0)).toBe(32);
  expect(hotels + (state.bank.hotels ?? 0)).toBe(12);
  // Jede Karte liegt genau einmal im Stapel oder bei einem Spieler.
  for (const deck of state.pack.decks) {
    const held = state.players.flatMap((p) => p.jailFreeCards.filter((c) => c.deckId === deck.id));
    expect(state.decks[deck.id]!.drawPile.length + held.length).toBe(deck.cards.length);
  }
}

describe('Komplettes Spiel', () => {
  // Ohne Handel (ab Phase 2) entstehen mit Standardregeln nicht immer Farbgruppen; daher
  // laufen manche Spiele auch mit knapperem Startgeld, damit sie sicher enden.
  it.each([
    [3, 2, {}],
    [7, 3, {}],
    [4, 4, {}],
    [2026, 4, { startingCash: 800, passStartBonus: 50 }],
    [1, 2, { passStartBonus: 0, freeParkingPot: true, bankruptcy: { mode: 'auction' as const } }],
  ])(
    'Seed %i mit %i Spielern (%o) endet und lässt sich exakt nachspielen',
    (seed, players, rules) => {
      const game = playGame(seed, players, 20_000, rules);
      expect(game.state.phase.name).toBe('gameOver');
      const winner = game.state.phase.name === 'gameOver' ? game.state.phase.winner : null;
      expect(game.state.players.filter((p) => !p.bankrupt).map((p) => p.id)).toEqual([winner]);

      const replayed = replay({ initial: game.initial, actions: game.actions });
      expect(replayed.state).toEqual(game.state);
      expect(replayed.events).toEqual(game.events);
      // Auch nach JSON-Serialisierung (wie später über das Netzwerk) identisch.
      const fromJson = replay(
        JSON.parse(JSON.stringify({ initial: game.initial, actions: game.actions })),
      );
      expect(JSON.stringify(fromJson.state)).toBe(JSON.stringify(game.state));
    },
  );

  it('ergibt mit gleichem Seed dasselbe Spiel', () => {
    const a = playGame(99, 2, 400);
    const b = playGame(99, 2, 400);
    expect(a.actions).toEqual(b.actions);
    expect(a.state).toEqual(b.state);
  });

  it('erkennt ein Log, das nicht zum Startzustand passt', () => {
    const game = playGame(5, 2, 50);
    const tampered = [...game.actions, { type: 'END_TURN', playerId: 'niemand' } as Action];
    expect(() => replay({ initial: game.initial, actions: tampered })).toThrow(
      /Replay fehlgeschlagen/,
    );
  });
});
