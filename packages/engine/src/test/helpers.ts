import { standardPack } from '@menelgame/packs';
import type { BoardPack, Rules } from '@menelgame/schema';
import { expect } from 'vitest';
import { apply } from '../apply';
import { createGame } from '../create';
import { createRng, nextInt } from '../rng';
import type { Action, GameEvent, GameState, Player, TileState } from '../types';

export const COLORS = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#46f0f0'];

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

export function withRules(base: Rules, patch: DeepPartial<Rules>): Rules {
  const merged = structuredClone(base) as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    const current = merged[key];
    merged[key] =
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      current &&
      typeof current === 'object'
        ? { ...(current as object), ...(value as object) }
        : value;
  }
  return merged as Rules;
}

export interface NewGameOptions {
  players?: number;
  seed?: number;
  rules?: DeepPartial<Rules>;
  pack?: BoardPack;
}

/** Neues Spiel mit dem Standard-Pack; Spieler heißen p1, p2, … */
export function newGame(options: NewGameOptions = {}): GameState {
  const pack = options.pack ?? standardPack;
  const count = options.players ?? 2;
  return createGame({
    pack,
    seed: options.seed ?? 42,
    rules: withRules(pack.rules, options.rules ?? {}),
    players: Array.from({ length: count }, (_, i) => ({
      id: `p${i + 1}`,
      name: `Spieler ${i + 1}`,
      color: COLORS[i]!,
    })),
  });
}

/**
 * Sucht einen RNG-Zustand, der genau diese Würfe ergibt, und setzt ihn. So bleiben Tests
 * deterministisch, ohne dass die Engine eine Hintertür für feste Würfel braucht.
 */
export function rigDice(state: GameState, rolls: number[][]): GameState {
  for (let candidate = 1; candidate < 5_000_000; candidate++) {
    const rng = createRng(candidate);
    const matches = rolls.every((roll) =>
      roll.every((face) => 1 + nextInt(rng, state.dice.sides) === face),
    );
    if (matches) return { ...state, rng: createRng(candidate) };
  }
  throw new Error(`Keine passenden Würfe gefunden: ${JSON.stringify(rolls)}`);
}

export function patchPlayer(state: GameState, id: string, patch: Partial<Player>): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === id ? { ...p, ...patch } : p)),
  };
}

export function patchTiles(state: GameState, patch: Record<string, Partial<TileState>>): GameState {
  const tiles = { ...state.tiles };
  for (const [id, value] of Object.entries(patch)) {
    if (!tiles[id]) throw new Error(`Feld ${id} ist nicht kaufbar`);
    tiles[id] = { ...tiles[id], ...value };
  }
  return { ...state, tiles };
}

/** Besitz für einen Spieler setzen. */
export function give(state: GameState, owner: string, ...tileIds: string[]): GameState {
  return patchTiles(state, Object.fromEntries(tileIds.map((id) => [id, { owner }])));
}

/** Legt eine Karte oben auf den Stapel. */
export function stackDeck(state: GameState, deckId: string, cardId: string): GameState {
  const pile = state.decks[deckId]!.drawPile.filter((c) => c !== cardId);
  return { ...state, decks: { ...state.decks, [deckId]: { drawPile: [cardId, ...pile] } } };
}

export function position(state: GameState, tileId: string): number {
  return state.pack.tiles.findIndex((t) => t.id === tileId);
}

/** Wendet eine Aktion an und erwartet Erfolg. */
export function act(state: GameState, action: Action): { state: GameState; events: GameEvent[] } {
  const result = apply(state, action);
  if (!result.ok) throw new Error(`${action.type} abgelehnt: ${result.error.code}`);
  return { state: result.state, events: result.events };
}

export function expectError(state: GameState, action: Action, code: string): void {
  const result = apply(state, action);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.code).toBe(code);
    expect(result.state).toBe(state);
  }
}

export function cash(state: GameState, id: string): number {
  return state.players.find((p) => p.id === id)!.cash;
}

export function player(state: GameState, id: string): Player {
  return state.players.find((p) => p.id === id)!;
}

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/** Spieler so vor ein Feld setzen und würfeln lassen, dass er genau dort landet. */
export function landOn(
  state: GameState,
  playerId: string,
  tileId: string,
  dice: number[] = [2, 3],
): { state: GameState; events: GameEvent[] } {
  const n = state.pack.tiles.length;
  const total = dice.reduce((a, b) => a + b, 0);
  const start = (((position(state, tileId) - total) % n) + n) % n;
  let s = patchPlayer(state, playerId, { position: start });
  s = rigDice(s, [dice]);
  return act(s, { type: 'ROLL_DICE', playerId });
}
