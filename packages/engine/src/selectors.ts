import {
  isOwnable,
  mortgageValueOf,
  type OwnableTile,
  type PropertyTile,
  type Tile,
} from '@menelgame/schema';
import type { GameState, Player, PlayerId, TileState } from './types';

export const HOTEL = 5;

export function getPlayer(state: GameState, id: PlayerId): Player | undefined {
  return state.players.find((p) => p.id === id);
}

export function requirePlayer(state: GameState, id: PlayerId): Player {
  const player = getPlayer(state, id);
  if (!player) throw new Error(`Unbekannter Spieler ${id}`);
  return player;
}

export function currentPlayer(state: GameState): Player {
  const player = state.players[state.currentPlayer];
  if (!player) throw new Error('Kein aktueller Spieler');
  return player;
}

/** Wer jetzt handeln darf: bei offenen Schulden der Schuldner, sonst der Spieler am Zug. */
export function actingPlayerId(state: GameState): PlayerId {
  if (state.phase.name === 'awaitingDebt' && state.debts[0]) return state.debts[0].debtor;
  if (state.phase.name === 'awaitingChoice') return state.phase.playerId;
  return currentPlayer(state).id;
}

export function activePlayers(state: GameState): Player[] {
  return state.players.filter((p) => !p.bankrupt);
}

export function tileAt(state: GameState, index: number): Tile {
  const tile = state.pack.tiles[index];
  if (!tile) throw new Error(`Kein Feld an Position ${index}`);
  return tile;
}

export function tileById(state: GameState, id: string): Tile | undefined {
  return state.pack.tiles.find((t) => t.id === id);
}

export function tileIndex(state: GameState, id: string): number {
  return state.pack.tiles.findIndex((t) => t.id === id);
}

export function ownableById(state: GameState, id: string): OwnableTile | undefined {
  const tile = tileById(state, id);
  return tile && isOwnable(tile) ? tile : undefined;
}

export function tileState(state: GameState, id: string): TileState {
  const ts = state.tiles[id];
  if (!ts) throw new Error(`Feld ${id} ist nicht kaufbar`);
  return ts;
}

export function jailIndex(state: GameState): number {
  return state.pack.tiles.findIndex((t) => t.type === 'jail');
}

export function groupTiles(state: GameState, groupId: string): OwnableTile[] {
  return state.pack.tiles.filter((t): t is OwnableTile => isOwnable(t) && t.group === groupId);
}

export function ownsWholeGroup(state: GameState, playerId: PlayerId, groupId: string): boolean {
  return groupTiles(state, groupId).every((t) => state.tiles[t.id]?.owner === playerId);
}

export function ownedCountInGroup(state: GameState, playerId: PlayerId, groupId: string): number {
  return groupTiles(state, groupId).filter((t) => state.tiles[t.id]?.owner === playerId).length;
}

export function ownedTiles(state: GameState, playerId: PlayerId): OwnableTile[] {
  return state.pack.tiles.filter(
    (t): t is OwnableTile => isOwnable(t) && state.tiles[t.id]?.owner === playerId,
  );
}

export function unmortgageCost(state: GameState, tile: OwnableTile): number {
  const value = mortgageValueOf(tile);
  return value + Math.ceil((value * state.rules.mortgageInterestPercent) / 100);
}

export function buildingRefund(state: GameState, tile: PropertyTile): number {
  return Math.floor((tile.houseCost * state.rules.buildingSellPercent) / 100);
}

/** Häuser und Hotels eines Spielers (für Renovierungskarten). */
export function buildingCounts(state: GameState, playerId: PlayerId) {
  let houses = 0;
  let hotels = 0;
  for (const tile of ownedTiles(state, playerId)) {
    const b = state.tiles[tile.id]?.buildings ?? 0;
    if (b === HOTEL) hotels++;
    else houses += b;
  }
  return { houses, hotels };
}

/**
 * Vermögen: Bargeld + Kaufpreis der Felder (bei Hypothek abzüglich Hypothekenwert)
 * + Baukosten aller Gebäude.
 */
export function netWorth(state: GameState, playerId: PlayerId): number {
  const player = requirePlayer(state, playerId);
  let worth = player.cash;
  for (const tile of ownedTiles(state, playerId)) {
    const ts = tileState(state, tile.id);
    worth += ts.mortgaged ? tile.price - mortgageValueOf(tile) : tile.price;
    if (tile.type === 'property') worth += ts.buildings * tile.houseCost;
  }
  return worth;
}

/** Rangliste: Nicht-Bankrotte zuerst, dann Vermögen, Bargeld und Sitzreihenfolge. */
export function ranking(state: GameState): { playerId: PlayerId; netWorth: number }[] {
  return state.players
    .map((p, seat) => ({ p, seat, worth: netWorth(state, p.id) }))
    .sort(
      (a, b) =>
        Number(a.p.bankrupt) - Number(b.p.bankrupt) ||
        b.worth - a.worth ||
        b.p.cash - a.p.cash ||
        a.seat - b.seat,
    )
    .map(({ p, worth }) => ({ playerId: p.id, netWorth: worth }));
}
