import { z } from 'zod';
import { IdSchema, MoneySchema } from './common';

/**
 * Feste, deklarative Aktionen. Karten nutzen sie direkt; eingebaute und später eigene
 * Feldtypen erzeugen dieselben Effekte. Es wird niemals Code aus Packs ausgeführt.
 */
export const EffectSchema = z.discriminatedUnion('kind', [
  /** Spieler erhält Geld von der Bank. */
  z.object({ kind: z.literal('collect'), amount: MoneySchema }),
  /** Spieler zahlt an die Bank (oder in den Frei-Parken-Topf, falls aktiv). */
  z.object({ kind: z.literal('pay'), amount: MoneySchema }),
  /** Jeder andere Spieler zahlt dem Spieler. */
  z.object({ kind: z.literal('collectFromEach'), amount: MoneySchema }),
  /** Spieler zahlt jedem anderen Spieler. */
  z.object({ kind: z.literal('payEach'), amount: MoneySchema }),
  /** Vorwärts zu einem Feld ziehen; überquerte Felder lösen ihren Überquer-Effekt aus. */
  z.object({
    kind: z.literal('moveTo'),
    tile: IdSchema,
    passTiles: z.boolean().default(true),
  }),
  /** Um feste Anzahl Felder ziehen (negativ = rückwärts, ohne Überquer-Effekte). */
  z.object({ kind: z.literal('moveBy'), steps: z.int().min(-100).max(100) }),
  /** Vorwärts zum nächsten Feld eines Typs ziehen, optional mit Mietaufschlag. */
  z.object({
    kind: z.literal('moveToNearest'),
    tileType: z.enum(['station', 'utility']),
    /** Faktor auf die normale Miete (z. B. doppelte Bahnhofsmiete). */
    rentMultiplier: z.int().min(1).max(10).optional(),
    /** Werksmiete = Würfelsumme × dieser Wert statt der normalen Multiplikatoren. */
    utilityDiceMultiplier: z.int().min(1).max(100).optional(),
  }),
  z.object({ kind: z.literal('goToJail') }),
  /** Die Karte bleibt beim Spieler, bis sie eingesetzt wird. */
  z.object({ kind: z.literal('jailFreeCard') }),
  /** Zahlung pro Haus und pro Hotel des Spielers. */
  z.object({ kind: z.literal('repairs'), perHouse: MoneySchema, perHotel: MoneySchema }),
]);

export type Effect = z.infer<typeof EffectSchema>;
export type EffectKind = Effect['kind'];
