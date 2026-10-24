import { z } from 'zod';
import { IdSchema, MoneySchema } from './common';

/**
 * Feste, deklarative Aktionen. Karten und eigene Feldtypen nutzen sie direkt; eingebaute
 * Feldtypen erzeugen dieselben Effekte. Es wird niemals Code aus Packs ausgeführt.
 */
const baseEffects = [
  /** Spieler erhält Geld von der Bank. */
  z.object({ kind: z.literal('collect'), amount: MoneySchema }),
  /** Spieler zahlt an die Bank (oder in den Frei-Parken-Topf, falls aktiv). */
  z.object({ kind: z.literal('pay'), amount: MoneySchema }),
  /** Jeder andere Spieler zahlt dem Spieler. */
  z.object({ kind: z.literal('collectFromEach'), amount: MoneySchema }),
  /** Spieler zahlt jedem anderen Spieler. */
  z.object({ kind: z.literal('payEach'), amount: MoneySchema }),
  /** Einen Prozentsatz des eigenen Bargelds zahlen (abgerundet). */
  z.object({ kind: z.literal('payPercent'), percent: z.int().min(1).max(100) }),
  /** Vorwärts zu einem Feld ziehen; überquerte Felder lösen ihren Überquer-Effekt aus. */
  z.object({
    kind: z.literal('moveTo'),
    tile: IdSchema,
    passTiles: z.boolean().default(true),
  }),
  /** Um feste Anzahl Felder ziehen (negativ = rückwärts, ohne Überquer-Effekte). */
  z.object({ kind: z.literal('moveBy'), steps: z.int().min(-100).max(100) }),
  /** Vorwärts zum nächsten Bahnhof bzw. Werk ziehen, optional mit Mietaufschlag. */
  z.object({
    kind: z.literal('moveToNearest'),
    tileType: z.enum(['station', 'utility']),
    /** Faktor auf die normale Miete (z. B. doppelte Bahnhofsmiete). */
    rentMultiplier: z.int().min(1).max(10).optional(),
    /** Werksmiete = Würfelsumme × dieser Wert statt der normalen Multiplikatoren. */
    utilityDiceMultiplier: z.int().min(1).max(100).optional(),
  }),
  /**
   * Zum nächsten Feld eines Typs (eingebauter oder eigener Feldtyp), z. B. Teleporter.
   * Ohne `land` wird das Zielfeld nicht ausgelöst – so springen Teleporter nicht hin und her.
   */
  z.object({
    kind: z.literal('moveToNextOfType'),
    tileType: IdSchema,
    passTiles: z.boolean().default(false),
    land: z.boolean().default(false),
  }),
  z.object({ kind: z.literal('goToJail') }),
  /** Die Karte bleibt beim Spieler, bis sie eingesetzt wird. */
  z.object({ kind: z.literal('jailFreeCard') }),
  /** Zahlung pro Haus und pro Hotel des Spielers. */
  z.object({ kind: z.literal('repairs'), perHouse: MoneySchema, perHotel: MoneySchema }),
  /** Eine Karte von einem Stapel ziehen. */
  z.object({ kind: z.literal('drawCard'), deck: IdSchema }),
  /** Das Feld, auf dem der Spieler steht, wirkt so viele Runden nicht (keine Miete, nichts). */
  z.object({ kind: z.literal('blockTile'), rounds: z.int().min(1).max(20) }),
  /** Der Spieler setzt so viele Züge aus. */
  z.object({ kind: z.literal('skipTurns'), turns: z.int().min(1).max(5) }),
] as const;

export const BaseEffectSchema = z.discriminatedUnion('kind', [...baseEffects]);

export const ChoiceOptionSchema = z.object({
  label: z.string().trim().min(1).max(60),
  effects: z.array(BaseEffectSchema).min(1).max(5),
});

export const EffectSchema = z.discriminatedUnion('kind', [
  ...baseEffects,
  /** Der Spieler wählt eine von mehreren Möglichkeiten (beendet die laufende Kette). */
  z.object({ kind: z.literal('choice'), options: z.array(ChoiceOptionSchema).min(2).max(4) }),
]);

export type Effect = z.infer<typeof EffectSchema>;
export type BaseEffect = z.infer<typeof BaseEffectSchema>;
export type EffectKind = Effect['kind'];
export type ChoiceOption = z.infer<typeof ChoiceOptionSchema>;
