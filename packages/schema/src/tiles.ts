import { z } from 'zod';
import { IdSchema, MoneySchema } from './common';

const tileBase = {
  id: IdSchema,
  name: z.string().min(1).max(60),
};

/** Kaufbare Felder haben einen Preis und gehören zu einer Gruppe. */
const ownableBase = {
  ...tileBase,
  group: IdSchema,
  price: MoneySchema,
  /** Auszahlung bei Hypothek; Standard ist der halbe Preis. */
  mortgageValue: MoneySchema.optional(),
};

export const StartTileSchema = z.object({ ...tileBase, type: z.literal('start') });

export const PropertyTileSchema = z.object({
  ...ownableBase,
  type: z.literal('property'),
  /** Miete ohne Haus, mit 1–4 Häusern und mit Hotel (genau 6 Werte). */
  rent: z.array(MoneySchema).length(6),
  houseCost: MoneySchema,
});

export const StationTileSchema = z.object({
  ...ownableBase,
  type: z.literal('station'),
  /** Miete bei 1, 2, … Bahnhöfen derselben Gruppe im Besitz. */
  rent: z.array(MoneySchema).min(1).max(8),
});

export const UtilityTileSchema = z.object({
  ...ownableBase,
  type: z.literal('utility'),
  /** Würfelsumme × Faktor bei 1, 2, … Werken derselben Gruppe im Besitz. */
  multipliers: z.array(z.int().positive()).min(1).max(8),
});

export const TaxTileSchema = z.object({ ...tileBase, type: z.literal('tax'), amount: MoneySchema });

export const CardTileSchema = z.object({ ...tileBase, type: z.literal('card'), deck: IdSchema });

/** Gefängnis bzw. „nur zu Besuch“. */
export const JailTileSchema = z.object({ ...tileBase, type: z.literal('jail') });

export const GoToJailTileSchema = z.object({ ...tileBase, type: z.literal('goToJail') });

/** Frei Parken; sammelt bei aktiver Regel den Topf ein. */
export const FreeParkingTileSchema = z.object({ ...tileBase, type: z.literal('freeParking') });

export const TileSchema = z.discriminatedUnion('type', [
  StartTileSchema,
  PropertyTileSchema,
  StationTileSchema,
  UtilityTileSchema,
  TaxTileSchema,
  CardTileSchema,
  JailTileSchema,
  GoToJailTileSchema,
  FreeParkingTileSchema,
]);

export type Tile = z.infer<typeof TileSchema>;
export type TileType = Tile['type'];
export type TileOfType<T extends TileType> = Extract<Tile, { type: T }>;
export type PropertyTile = TileOfType<'property'>;
export type StationTile = TileOfType<'station'>;
export type UtilityTile = TileOfType<'utility'>;
export type OwnableTile = PropertyTile | StationTile | UtilityTile;

export const OWNABLE_TILE_TYPES = ['property', 'station', 'utility'] as const;

export function isOwnable(tile: Tile): tile is OwnableTile {
  return (OWNABLE_TILE_TYPES as readonly string[]).includes(tile.type);
}

export function mortgageValueOf(tile: OwnableTile): number {
  return tile.mortgageValue ?? Math.floor(tile.price / 2);
}
