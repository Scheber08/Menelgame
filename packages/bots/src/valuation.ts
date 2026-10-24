import {
  activePlayers,
  buildingCounts,
  calculateRent,
  groupTiles,
  ownedCountInGroup,
  variableValue,
  type AgreementTerm,
  type GameState,
  type PlayerId,
  type TradeBundle,
} from '@menelgame/engine';
import { isOwnable, mortgageValueOf, type BaseEffect, type OwnableTile } from '@menelgame/schema';
import { landingsPerRound, oddsOf, ROLLS_PER_TURN } from './landing';

export function cashOf(state: GameState, playerId: PlayerId): number {
  return state.players.find((p) => p.id === playerId)?.cash ?? 0;
}

/**
 * Wert eines Felds für einen Besitzer: Kaufpreis, mehr je vollständiger die Gruppe ist.
 * Eine komplette Grundstücksgruppe ist deutlich mehr wert, weil man darauf bauen kann.
 */
export function tileWorth(
  state: GameState,
  tile: OwnableTile,
  owner: PlayerId,
  gaining = false,
): number {
  const group = groupTiles(state, tile.group);
  const alreadyMine = state.tiles[tile.id]?.owner === owner;
  const owned = ownedCountInGroup(state, owner, tile.group) + (gaining && !alreadyMine ? 1 : 0);
  const base = state.tiles[tile.id]?.mortgaged ? tile.price - mortgageValueOf(tile) : tile.price;
  if (tile.type === 'property' && owned >= group.length) return base * 2.2;
  return base * (1 + (0.4 * (owned - 1)) / Math.max(1, group.length - 1));
}

/** Würde dieses Feld dem Besitzer eine Grundstücksgruppe vervollständigen? */
export function completesGroup(state: GameState, tile: OwnableTile, owner: PlayerId): boolean {
  if (tile.type !== 'property') return false;
  const group = groupTiles(state, tile.group);
  const owned = group.filter((t) => t.id === tile.id || state.tiles[t.id]?.owner === owner);
  return owned.length === group.length;
}

/** Bekäme irgendein Gegner mit diesem Feld eine komplette Gruppe? */
export function completesForOpponent(state: GameState, tile: OwnableTile, me: PlayerId): boolean {
  return activePlayers(state).some((p) => p.id !== me && completesGroup(state, tile, p.id));
}

/** Höchste Miete, die mir auf einem Gegnerfeld gerade drohen könnte. */
export function maxRentRisk(state: GameState, me: PlayerId): number {
  let worst = 0;
  for (const tile of state.pack.tiles) {
    if (!isOwnable(tile)) continue;
    const ts = state.tiles[tile.id];
    if (!ts?.owner || ts.owner === me || ts.mortgaged) continue;
    // Für Werke mit einem mittleren Wurf (7) rechnen statt mit dem letzten Wurf.
    const owned = ownedCountInGroup(state, ts.owner, tile.group);
    const rent =
      tile.type === 'utility'
        ? 7 * (tile.multipliers[Math.min(owned, tile.multipliers.length) - 1] ?? 0)
        : calculateRent(state, tile, ts.owner);
    worst = Math.max(worst, rent);
  }
  return worst;
}

/** Bargeld, das ein vorsichtiger Spieler zurückhält. */
export function cashReserve(state: GameState, me: PlayerId): number {
  return Math.min(600, 150 + Math.round(maxRentRisk(state, me) * 0.35));
}

/** Wert eines Tausch-Pakets aus Sicht von `me`, der es bekommt (`gaining`) oder abgibt. */
export function bundleWorth(
  state: GameState,
  bundle: TradeBundle,
  me: PlayerId,
  gaining: boolean,
): number {
  let worth = bundle.cash + bundle.jailFreeCards * 50;
  for (const id of bundle.tiles) {
    const tile = state.pack.tiles.find((t) => t.id === id);
    if (tile && isOwnable(tile)) worth += tileWorth(state, tile, me, gaining);
  }
  return worth;
}

/** Miete, die ein Feld gerade bringt (Werke mit mittlerem Wurf 7). */
export function currentRent(state: GameState, tile: OwnableTile, owner: PlayerId): number {
  if (state.tiles[tile.id]?.mortgaged) return 0;
  if (tile.type === 'utility') {
    const owned = ownedCountInGroup(state, owner, tile.group);
    return 7 * (tile.multipliers[Math.min(owned, tile.multipliers.length) - 1] ?? 0);
  }
  return calculateRent(state, tile, owner);
}

/**
 * Geldwert von Vereinbarungen aus Sicht von `me` (positiv = gut für mich). `odds` sind
 * Landewahrscheinlichkeiten pro Feld; Raten werden leicht abgezinst (Ausfallrisiko).
 */
export function termsWorth(
  state: GameState,
  terms: readonly AgreementTerm[],
  me: PlayerId,
  odds: number[],
): number {
  let worth = 0;
  for (const term of terms) {
    switch (term.kind) {
      case 'installments':
        worth += (term.payer === me ? -1 : 0.85) * term.amount * term.rounds;
        break;
      case 'rentFree':
      case 'profitShare': {
        // Erwartete Miete, die der Begünstigte zahlen würde bzw. die geteilt wird.
        let perRound = 0;
        for (const tileId of term.tiles) {
          const tile = state.pack.tiles.find((t) => t.id === tileId);
          if (!tile || !isOwnable(tile)) continue;
          const rent = currentRent(state, tile, term.owner) * 1.2;
          const landings = landingsPerRound(state, odds, tileId, term.owner);
          perRound +=
            term.kind === 'rentFree'
              ? rent * oddsOf(state, odds, tileId) * ROLLS_PER_TURN
              : (rent * landings * term.percent) / 100;
        }
        const value = perRound * term.rounds;
        worth += term.owner === me ? -value : value;
        break;
      }
    }
  }
  return worth;
}

/** Summe der Grundstückspreise einer Gruppe. */
export function groupPrice(state: GameState, groupId: string): number {
  return groupTiles(state, groupId).reduce((sum, t) => sum + t.price, 0);
}

/** Grobe Geldwirkung fester Aktionen für einen Spieler (für Auswahlen). */
export function estimateEffects(
  state: GameState,
  me: PlayerId,
  effects: readonly BaseEffect[],
): number {
  const others = activePlayers(state).length - 1;
  const cash = cashOf(state, me);
  const { houses, hotels } = buildingCounts(state, me);
  let value = 0;
  for (const e of effects) {
    switch (e.kind) {
      case 'collect':
        value += e.amount;
        break;
      case 'pay':
        value -= e.amount;
        break;
      case 'collectFromEach':
        value += e.amount * others;
        break;
      case 'payEach':
        value -= e.amount * others;
        break;
      case 'payPercent':
        value -= Math.floor((cash * e.percent) / 100);
        break;
      case 'repairs':
        value -= houses * e.perHouse + hotels * e.perHotel;
        break;
      case 'goToJail':
        value -= 100;
        break;
      case 'skipTurns':
        value -= 80 * e.turns;
        break;
      case 'jailFreeCard':
        value += 50;
        break;
      case 'collectVariable':
        value += Math.trunc((variableValue(state, e.variable, me) * e.percent) / 100);
        break;
      default:
        break;
    }
  }
  return value;
}
