import { z } from 'zod';
import { ColorSchema, IdSchema, MoneySchema } from './common';
import { EffectSchema } from './effects';

/** Wann eine Regel eines eigenen Feldtyps greift. */
export const TriggerSchema = z.enum([
  /** Spieler beendet seine Bewegung auf dem Feld. */
  'land',
  /** Spieler zieht über das Feld hinweg. */
  'pass',
  /** Spieler beginnt seinen Zug auf dem Feld. */
  'turnStart',
  /** Spieler beendet seinen Zug auf dem Feld. */
  'turnEnd',
  /** Eine Runde ist vorbei: gilt für alle, die auf einem solchen Feld stehen. */
  'roundEnd',
]);

const compare = z.enum(['lt', 'gte']);

/** Bedingungen beziehen sich immer auf den betroffenen Spieler. */
export const ConditionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('cash'), op: compare, amount: MoneySchema }),
  z.object({
    kind: z.literal('diceTotal'),
    op: z.enum(['eq', 'lt', 'gte']),
    value: z.int().min(1).max(80),
  }),
  z.object({ kind: z.literal('double'), value: z.boolean() }),
  /** Anzahl eigener Gebäude (Hotel zählt als 5). */
  z.object({ kind: z.literal('buildings'), op: compare, count: z.int().min(0).max(500) }),
  /** Zufall mit dem Spiel-Zufallsgenerator – reproduzierbar im Replay. */
  z.object({ kind: z.literal('chance'), percent: z.int().min(1).max(99) }),
  /** Spieler besitzt die ganze Gruppe. */
  z.object({ kind: z.literal('ownsGroup'), group: IdSchema }),
]);

export const TileRuleSchema = z.object({
  trigger: TriggerSchema,
  conditions: z.array(ConditionSchema).max(5).default([]),
  effects: z.array(EffectSchema).min(1).max(10),
});

/**
 * Eigener Feldtyp: Name, Farbe und Regeln (Auslöser → Bedingungen → Aktionen). Felder vom
 * Typ `custom` verweisen über `tileType` darauf.
 */
export const CustomTileTypeSchema = z.object({
  id: IdSchema,
  name: z.string().trim().min(1).max(40),
  color: ColorSchema,
  description: z.string().max(200).optional(),
  rules: z.array(TileRuleSchema).max(10),
});

export type Trigger = z.infer<typeof TriggerSchema>;
export type Condition = z.infer<typeof ConditionSchema>;
export type TileRule = z.infer<typeof TileRuleSchema>;
export type CustomTileType = z.infer<typeof CustomTileTypeSchema>;
