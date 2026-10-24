import type { OwnableTile } from '@menelgame/schema';
import { ownedCountInGroup, ownsWholeGroup, tileState } from './selectors';
import type { LandingModifiers } from './tileTypes';
import type { GameState, PlayerId } from './types';

/** Miete für ein Feld mit Besitzer; Hypothek und Gefängnis prüft der Aufrufer. */
export function calculateRent(
  state: GameState,
  tile: OwnableTile,
  owner: PlayerId,
  modifiers: LandingModifiers = {},
): number {
  const multiplier = modifiers.rentMultiplier ?? 1;
  const owned = ownedCountInGroup(state, owner, tile.group);

  switch (tile.type) {
    case 'property': {
      const buildings = tileState(state, tile.id).buildings;
      if (buildings > 0) return (tile.rent[buildings] ?? 0) * multiplier;
      const bonus = ownsWholeGroup(state, owner, tile.group)
        ? state.rules.monopolyRentMultiplier
        : 1;
      return (tile.rent[0] ?? 0) * bonus * multiplier;
    }
    case 'station': {
      const rent = tile.rent[Math.min(owned, tile.rent.length) - 1] ?? 0;
      return rent * multiplier;
    }
    case 'utility': {
      const roll = state.lastRoll?.total ?? 0;
      const factor =
        modifiers.utilityDiceMultiplier ??
        tile.multipliers[Math.min(owned, tile.multipliers.length) - 1] ??
        0;
      return roll * factor * multiplier;
    }
  }
}
