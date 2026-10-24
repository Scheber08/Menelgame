import { z } from 'zod';
import { ColorSchema, IdSchema } from './common';
import { EffectSchema, type Effect } from './effects';
import { DiceSchema, RulesSchema } from './rules';
import { TileSchema } from './tiles';

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

export const LayoutSchema = z.discriminatedUnion('shape', [
  /** Gleich viele Felder pro Seite, Ecken auf 0, n/4, n/2, 3n/4. */
  z.object({ shape: z.literal('square') }),
  /** Spalten × Zeilen inklusive Ecken; Felder = 2 × (Spalten + Zeilen) − 4. */
  z.object({
    shape: z.literal('rectangle'),
    columns: z.int().min(3).max(30),
    rows: z.int().min(3).max(30),
  }),
]);

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
    groups: z.array(GroupSchema).max(40),
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
    const groupTypes = new Map<string, string>();
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
    });

    const checkEffect = (effect: Effect, path: (string | number)[]) => {
      if (effect.kind === 'moveTo' && !tileIds.has(effect.tile))
        issue(`Unbekanntes Zielfeld ${effect.tile}`, path);
      if (effect.kind === 'moveToNearest' && count(effect.tileType) === 0)
        issue(`Kein Feld vom Typ ${effect.tileType} vorhanden`, path);
    };
    pack.decks.forEach((deck, d) =>
      deck.cards.forEach((card, c) =>
        card.effects.forEach((effect, e) =>
          checkEffect(effect, ['decks', d, 'cards', c, 'effects', e]),
        ),
      ),
    );

    const n = pack.tiles.length;
    if (pack.layout.shape === 'square' && n % 4 !== 0)
      issue('Quadratisches Brett braucht eine durch 4 teilbare Feldanzahl', ['layout']);
    if (pack.layout.shape === 'rectangle' && 2 * (pack.layout.columns + pack.layout.rows) - 4 !== n)
      issue('Rechteck: Feldanzahl muss 2 × (Spalten + Zeilen) − 4 sein', ['layout']);
  });

export type BoardPack = z.infer<typeof BoardPackSchema>;
export type BoardPackInput = z.input<typeof BoardPackSchema>;
export type Layout = z.infer<typeof LayoutSchema>;
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
