import { z } from 'zod';
import { ColorSchema, IdSchema } from './common';
import { CustomTileTypeSchema, type Condition } from './customTypes';
import { EffectSchema, type Effect } from './effects';
import { DiceSchema, RulesSchema } from './rules';
import { BUILT_IN_TILE_TYPES, ImageUrlSchema, TileSchema } from './tiles';

/** Version des Pack-Formats. Bei inkompatiblen Änderungen erhöhen und migrieren. */
export const PACK_SCHEMA_VERSION = 1;

export const PackMetaSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(80),
  /** Inhaltsversion des Packs (z. B. 1.0.0), unabhängig von schemaVersion. */
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version als x.y.z'),
  author: z.string().max(80).optional(),
  description: z.string().max(500).optional(),
});

export const PointSchema = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
});

export const LayoutSchema = z.discriminatedUnion('shape', [
  /** Gleich viele Felder pro Seite, Ecken auf 0, n/4, n/2, 3n/4. */
  z.object({ shape: z.literal('square') }),
  /** Spalten × Zeilen inklusive Ecken; Felder = 2 × (Spalten + Zeilen) − 4. */
  z.object({
    shape: z.literal('rectangle'),
    columns: z.int().min(3).max(30),
    rows: z.int().min(3).max(30),
  }),
  /** Felder gleichmäßig auf einem Kreis. */
  z.object({ shape: z.literal('ring') }),
  /** Freier Pfad: ein Punkt (0–100) pro Feld, in Spielreihenfolge. */
  z.object({ shape: z.literal('path'), points: z.array(PointSchema).max(100) }),
]);

/** Aussehen des Bretts. Alles optional; ohne Angabe gilt das Farbschema der App. */
export const ThemeSchema = z.object({
  boardColor: ColorSchema.optional(),
  tileColor: ColorSchema.optional(),
  centerColor: ColorSchema.optional(),
  textColor: ColorSchema.optional(),
  font: z.enum(['system', 'serif', 'rounded', 'mono']).default('system'),
  /** Darstellung der Spielfiguren. */
  tokens: z.enum(['initials', 'dots', 'pawns']).default('initials'),
  centerImage: ImageUrlSchema.optional(),
});

export const GroupSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(60),
  color: ColorSchema,
});

export const CardSchema = z.object({
  id: IdSchema,
  text: z.string().min(1).max(300),
  effects: z.array(EffectSchema).min(1).max(10),
});

export const DeckSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(60),
  color: ColorSchema.optional(),
  cards: z.array(CardSchema).min(1).max(200),
});

export const BoardPackSchema = z
  .object({
    schemaVersion: z.literal(PACK_SCHEMA_VERSION),
    meta: PackMetaSchema,
    maxPlayers: z.int().min(2).max(8),
    dice: DiceSchema.prefault({}),
    rules: RulesSchema.prefault({}),
    layout: LayoutSchema,
    theme: ThemeSchema.prefault({}),
    groups: z.array(GroupSchema).max(40),
    tileTypes: z.array(CustomTileTypeSchema).max(20).default([]),
    tiles: z.array(TileSchema).min(8).max(100),
    decks: z.array(DeckSchema).max(10),
  })
  .superRefine((pack, ctx) => {
    const issue = (message: string, path: (string | number)[]) =>
      ctx.addIssue({ code: 'custom', message, path });

    const dupes = (ids: string[]) => ids.filter((id, i) => ids.indexOf(id) !== i);
    for (const id of dupes(pack.tiles.map((t) => t.id))) issue(`Doppelte Feld-ID ${id}`, ['tiles']);
    for (const id of dupes(pack.groups.map((g) => g.id)))
      issue(`Doppelte Gruppen-ID ${id}`, ['groups']);
    for (const id of dupes(pack.decks.map((d) => d.id))) issue(`Doppelte Deck-ID ${id}`, ['decks']);
    for (const id of dupes(pack.tileTypes.map((t) => t.id)))
      issue(`Doppelte Feldtyp-ID ${id}`, ['tileTypes']);
    pack.decks.forEach((deck, d) => {
      for (const id of dupes(deck.cards.map((c) => c.id)))
        issue(`Doppelte Karten-ID ${id}`, ['decks', d, 'cards']);
    });

    const count = (type: string) => pack.tiles.filter((t) => t.type === type).length;
    if (count('start') !== 1) issue('Genau ein Startfeld erforderlich', ['tiles']);
    if (count('jail') !== 1) issue('Genau ein Gefängnisfeld erforderlich', ['tiles']);

    const groupIds = new Set(pack.groups.map((g) => g.id));
    const deckIds = new Set(pack.decks.map((d) => d.id));
    const tileIds = new Set(pack.tiles.map((t) => t.id));
    const typeIds = new Set(pack.tileTypes.map((t) => t.id));
    const groupTypes = new Map<string, string>();

    pack.tileTypes.forEach((type, i) => {
      if ((BUILT_IN_TILE_TYPES as readonly string[]).includes(type.id))
        issue(`Feldtyp-ID ${type.id} ist reserviert`, ['tileTypes', i, 'id']);
    });

    pack.tiles.forEach((tile, i) => {
      if ('group' in tile) {
        if (!groupIds.has(tile.group))
          issue(`Unbekannte Gruppe ${tile.group}`, ['tiles', i, 'group']);
        const seen = groupTypes.get(tile.group);
        if (seen && seen !== tile.type)
          issue(`Gruppe ${tile.group} mischt Feldtypen`, ['tiles', i, 'group']);
        groupTypes.set(tile.group, tile.type);
      }
      if (tile.type === 'card' && !deckIds.has(tile.deck))
        issue(`Unbekanntes Deck ${tile.deck}`, ['tiles', i, 'deck']);
      if (tile.type === 'custom' && !typeIds.has(tile.tileType))
        issue(`Unbekannter Feldtyp ${tile.tileType}`, ['tiles', i, 'tileType']);
    });

    const typeExists = (type: string) =>
      typeIds.has(type)
        ? pack.tiles.some((t) => t.type === 'custom' && t.tileType === type)
        : count(type) > 0;

    const checkEffect = (effect: Effect, path: (string | number)[]) => {
      if (effect.kind === 'moveTo' && !tileIds.has(effect.tile))
        issue(`Unbekanntes Zielfeld ${effect.tile}`, path);
      if (effect.kind === 'moveToNearest' && count(effect.tileType) === 0)
        issue(`Kein Feld vom Typ ${effect.tileType} vorhanden`, path);
      if (effect.kind === 'moveToNextOfType' && !typeExists(effect.tileType))
        issue(`Kein Feld vom Typ ${effect.tileType} vorhanden`, path);
      if (effect.kind === 'drawCard' && !deckIds.has(effect.deck))
        issue(`Unbekanntes Deck ${effect.deck}`, path);
      if (effect.kind === 'choice')
        effect.options.forEach((option, o) =>
          option.effects.forEach((inner, e) =>
            checkEffect(inner, [...path, 'options', o, 'effects', e]),
          ),
        );
    };
    const checkCondition = (condition: Condition, path: (string | number)[]) => {
      if (condition.kind === 'ownsGroup' && !groupIds.has(condition.group))
        issue(`Unbekannte Gruppe ${condition.group}`, path);
    };

    pack.decks.forEach((deck, d) =>
      deck.cards.forEach((card, c) =>
        card.effects.forEach((effect, e) =>
          checkEffect(effect, ['decks', d, 'cards', c, 'effects', e]),
        ),
      ),
    );
    pack.tileTypes.forEach((type, t) =>
      type.rules.forEach((rule, r) => {
        rule.effects.forEach((effect, e) =>
          checkEffect(effect, ['tileTypes', t, 'rules', r, 'effects', e]),
        );
        rule.conditions.forEach((condition, c) =>
          checkCondition(condition, ['tileTypes', t, 'rules', r, 'conditions', c]),
        );
      }),
    );

    const n = pack.tiles.length;
    if (pack.layout.shape === 'square' && n % 4 !== 0)
      issue('Quadratisches Brett braucht eine durch 4 teilbare Feldanzahl', ['layout']);
    if (pack.layout.shape === 'rectangle' && 2 * (pack.layout.columns + pack.layout.rows) - 4 !== n)
      issue('Rechteck: Feldanzahl muss 2 × (Spalten + Zeilen) − 4 sein', ['layout']);
    if (pack.layout.shape === 'path' && pack.layout.points.length !== n)
      issue('Freier Pfad: genau ein Punkt pro Feld nötig', ['layout', 'points']);
  });

export type BoardPack = z.infer<typeof BoardPackSchema>;
export type BoardPackInput = z.input<typeof BoardPackSchema>;
export type Layout = z.infer<typeof LayoutSchema>;
export type Theme = z.infer<typeof ThemeSchema>;
export type Point = z.infer<typeof PointSchema>;
export type Group = z.infer<typeof GroupSchema>;
export type Deck = z.infer<typeof DeckSchema>;
export type Card = z.infer<typeof CardSchema>;

export type PackParseResult =
  { ok: true; pack: BoardPack } | { ok: false; issues: { path: string; message: string }[] };

/** Validiert ein unbekanntes JSON-Objekt als Board Pack. */
export function parseBoardPack(input: unknown): PackParseResult {
  const result = BoardPackSchema.safeParse(input);
  if (result.success) return { ok: true, pack: result.data };
  return {
    ok: false,
    issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  };
}
