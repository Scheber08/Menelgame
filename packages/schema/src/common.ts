import { z } from 'zod';

/** Stabile, maschinenlesbare ID (Felder, Gruppen, Decks, Karten). */
export const IdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9_-]*$/i, 'Nur Buchstaben, Ziffern, "-" und "_"');

/** Geldbeträge sind immer ganze Zahlen. */
export const MoneySchema = z.int().nonnegative();

/** Hex-Farbe wie #1f6feb. */
export const ColorSchema = z.string().regex(/^#[0-9a-f]{6}$/i, 'Farbe als #rrggbb');
