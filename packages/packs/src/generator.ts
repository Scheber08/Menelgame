import { BoardPackSchema, type BoardPack, type PropertyTile, type Tile } from '@menelgame/schema';

/** Kleiner gesetzter Zufallsgenerator (mulberry32), unabhängig von der Engine. */
function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Diese Felder bleiben an ihrem Platz (Ecken). */
const FIXED: readonly Tile['type'][] = ['start', 'jail', 'freeParking', 'goToJail'];

const round10 = (n: number) => Math.max(10, Math.round(n / 10) * 10);

/**
 * Zufallsbrett: mischt die Felder eines Packs neu. Start, Gefängnis, Frei Parken und „Ab ins
 * Gefängnis“ bleiben stehen; Farbgruppen bleiben als Block zusammen. Die Grundstückspreise
 * steigen danach wieder entlang des Bretts (die vorhandenen Preise werden neu verteilt);
 * Mieten und Baukosten wachsen im gleichen Verhältnis mit.
 */
export function randomizeBoard(pack: BoardPack, seed: number): BoardPack {
  const random = rng(seed);
  const fixed = new Set(
    pack.tiles.flatMap((t, i) => ((FIXED as readonly string[]).includes(t.type) ? [i] : [])),
  );

  // Blöcke: jede Grundstücksgruppe zusammen (nach Preis sortiert), alles andere einzeln.
  const blocks: Tile[][] = [];
  const seenGroups = new Set<string>();
  pack.tiles.forEach((tile, i) => {
    if (fixed.has(i)) return;
    if (tile.type === 'property') {
      if (seenGroups.has(tile.group)) return;
      seenGroups.add(tile.group);
      blocks.push(
        pack.tiles
          .filter((t): t is PropertyTile => t.type === 'property' && t.group === tile.group)
          .sort((a, b) => a.price - b.price),
      );
    } else {
      blocks.push([tile]);
    }
  });
  for (let i = blocks.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [blocks[i], blocks[j]] = [blocks[j]!, blocks[i]!];
  }

  const queue = blocks.flat();
  const tiles = pack.tiles.map((tile, i) => (fixed.has(i) ? tile : queue.shift()!));

  // Preise entlang des Bretts neu verteilen.
  const ladder = pack.tiles
    .filter((t): t is PropertyTile => t.type === 'property')
    .map((t) => t.price)
    .sort((a, b) => a - b);
  const factors = new Map<string, number[]>();
  const priced = tiles.map((tile) => {
    if (tile.type !== 'property') return tile;
    const price = ladder.shift()!;
    const factor = price / tile.price;
    factors.set(tile.group, [...(factors.get(tile.group) ?? []), factor]);
    return {
      ...tile,
      price,
      rent: tile.rent.map((r) => Math.max(1, Math.round(r * factor))),
      ...(tile.mortgageValue !== undefined && { mortgageValue: Math.floor(price / 2) }),
    };
  });
  // Baukosten einheitlich pro Gruppe.
  const final = priced.map((tile) => {
    if (tile.type !== 'property') return tile;
    const list = factors.get(tile.group)!;
    const factor = list.reduce((a, b) => a + b, 0) / list.length;
    return { ...tile, houseCost: round10(tile.houseCost * factor) };
  });

  return BoardPackSchema.parse({
    ...pack,
    meta: {
      ...pack.meta,
      id: `${pack.meta.id}-zufall`.slice(0, 64),
      name: `${pack.meta.name} (Zufall)`.slice(0, 80),
    },
    tiles: final,
  });
}
