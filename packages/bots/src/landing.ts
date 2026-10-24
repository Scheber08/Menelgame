import {
  apply,
  createGame,
  getDefaultAction,
  type GameState,
  type PlayerId,
} from '@menelgame/engine';

/** So viele Würfe simuliert die Stufe Schwer pro Brett (einmal, dann aus dem Speicher). */
export const SIMULATED_ROLLS = 800;
/** Obergrenze an Aktionen, falls ein eigenes Pack die Simulation ausbremst. */
const MAX_ACTIONS = 6000;

const cache = new Map<string, number[]>();

function cacheKey(state: GameState): string {
  const { pack, dice, rules } = state;
  return [
    pack.meta.id,
    pack.meta.version,
    pack.tiles.length,
    pack.tiles.map((t) => t.type).join(','),
    `${dice.count}d${dice.sides}`,
    rules.tripleDoublesToJail,
    rules.jail.maxTurns,
  ].join('|');
}

/**
 * Wahrscheinlichkeit pro Feld, dass ein Wurf dort endet. Ermittelt durch Simulation mit
 * der Engine selbst: Karten, Gefängnis, Teleporter und eigene Feldtypen wirken genau wie
 * im Spiel. Niemand kauft, Geld ist unbegrenzt, Auswahlen nehmen die erste Möglichkeit.
 * Das Ergebnis ist leicht mit der Gleichverteilung geglättet.
 */
export function landingOdds(state: GameState): number[] {
  const key = cacheKey(state);
  const cached = cache.get(key);
  if (cached) return cached;

  const n = state.pack.tiles.length;
  const counts = new Array<number>(n).fill(0);
  let sim = createGame({
    pack: state.pack,
    seed: 20260915,
    dice: state.dice,
    rules: {
      ...state.rules,
      startingCash: 100_000_000,
      auctions: false,
      victory: { type: 'lastStanding' },
    },
    players: [
      { id: 'sim-a', name: 'A', color: '#000000' },
      { id: 'sim-b', name: 'B', color: '#ffffff' },
    ],
  });
  let rolls = 0;
  for (let i = 0; i < MAX_ACTIONS && rolls < SIMULATED_ROLLS; i++) {
    const action = getDefaultAction(sim);
    if (!action) break;
    const result = apply(sim, action);
    if (!result.ok) break;
    sim = result.state;
    if (action.type === 'ROLL_DICE') {
      const pos = sim.players.find((p) => p.id === action.playerId)?.position ?? 0;
      counts[pos]!++;
      rolls++;
    }
  }
  const total = Math.max(1, rolls);
  const odds = counts.map((c) => 0.85 * (c / total) + 0.15 / n);
  if (cache.size > 50) cache.clear();
  cache.set(key, odds);
  return odds;
}

/** Gleichverteilung für Stufen ohne Simulation. */
export function uniformOdds(state: GameState): number[] {
  const n = state.pack.tiles.length;
  return new Array<number>(n).fill(1 / n);
}

/** Wahrscheinlichkeit für ein Feld nach ID. */
export function oddsOf(state: GameState, odds: number[], tileId: string): number {
  const index = state.pack.tiles.findIndex((t) => t.id === tileId);
  return odds[index] ?? 0;
}

/** Würfe pro Spieler und Runde (Pasch gibt Extrawürfe). */
export const ROLLS_PER_TURN = 1.15;

/** Erwartete Landungen anderer Spieler pro Runde auf einem Feld. */
export function landingsPerRound(
  state: GameState,
  odds: number[],
  tileId: string,
  except: PlayerId,
): number {
  const others = state.players.filter((p) => !p.bankrupt && p.id !== except).length;
  return oddsOf(state, odds, tileId) * ROLLS_PER_TURN * others;
}
