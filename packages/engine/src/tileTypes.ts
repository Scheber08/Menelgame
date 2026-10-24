import type { Effect, Tile, TileOfType, TileType } from '@menelgame/schema';
import type { JailReason } from './types';

/** Zusatzwirkungen beim Landen, z. B. von Karten („zahle doppelte Miete“). */
export interface LandingModifiers {
  rentMultiplier?: number;
  utilityDiceMultiplier?: number;
}

/**
 * Alle Effekte, die der Interpreter kennt: die festen Kartenaktionen aus dem Schema plus
 * eingebaute Effekte, die Feldtypen erzeugen. Eigene Feldtypen (Phase 5) liefern ebenfalls
 * nur solche Effekte.
 */
export type EngineEffect =
  | Effect
  | { kind: 'startBonus'; landed: boolean }
  | { kind: 'landOnOwnable'; tileId: string; modifiers: LandingModifiers }
  | { kind: 'drawCard'; deck: string }
  | { kind: 'tax'; amount: number }
  | { kind: 'collectPot' }
  | { kind: 'sendToJail'; reason: JailReason };

export interface TileTypeHandler<T extends Tile = Tile> {
  /** Spieler beendet seine Bewegung auf dem Feld („betreten“). */
  onLand?: (tile: T, modifiers: LandingModifiers) => EngineEffect[];
  /** Spieler zieht über das Feld hinweg („überqueren“). */
  onPass?: (tile: T) => EngineEffect[];
}

type Registry = { [K in TileType]: TileTypeHandler<TileOfType<K>> };

const ownable = {
  onLand: (tile: Tile, modifiers: LandingModifiers): EngineEffect[] => [
    { kind: 'landOnOwnable', tileId: tile.id, modifiers },
  ],
};

/**
 * Eingebaute Feldtypen. Sie beschreiben ihr Verhalten nur über Effekte; die Engine
 * selbst kennt keine konkreten Felder.
 */
export const builtInTileTypes: Registry = {
  start: {
    onLand: () => [{ kind: 'startBonus', landed: true }],
    onPass: () => [{ kind: 'startBonus', landed: false }],
  },
  property: ownable,
  station: ownable,
  utility: ownable,
  tax: { onLand: (tile) => [{ kind: 'tax', amount: tile.amount }] },
  card: { onLand: (tile) => [{ kind: 'drawCard', deck: tile.deck }] },
  jail: {},
  goToJail: { onLand: () => [{ kind: 'sendToJail', reason: 'tile' }] },
  freeParking: { onLand: () => [{ kind: 'collectPot' }] },
};

export function tileHandler(tile: Tile): TileTypeHandler {
  return builtInTileTypes[tile.type] as TileTypeHandler;
}
