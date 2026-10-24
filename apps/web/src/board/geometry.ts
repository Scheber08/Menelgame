import type { Layout } from '@menelgame/schema';

export type Side = 'bottom' | 'left' | 'top' | 'right';

export interface TileRect {
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
  corner: boolean;
  /** Seite des Bretts; bei Ecken die Seite, die an diesem Feld beginnt. */
  side: Side;
}

export interface BoardGeometry {
  width: number;
  height: number;
  tiles: TileRect[];
  /** Freie Fläche in der Mitte. */
  center: { x: number; y: number; w: number; h: number };
}

/** Breite eines normalen Felds entlang der Kante und Tiefe (= Kantenlänge der Ecken). */
export const TILE_WIDTH = 68;
export const TILE_DEPTH = 100;

/**
 * Felder laufen wie gewohnt: Feld 0 in der Ecke unten rechts, dann nach links, die linke
 * Seite hinauf, oben nach rechts und rechts wieder hinunter.
 */
export function boardGeometry(layout: Layout, tileCount: number): BoardGeometry {
  const columns = layout.shape === 'rectangle' ? layout.columns : tileCount / 4 + 1;
  const rows = layout.shape === 'rectangle' ? layout.rows : tileCount / 4 + 1;
  const W = TILE_WIDTH;
  const D = TILE_DEPTH;
  const width = 2 * D + (columns - 2) * W;
  const height = 2 * D + (rows - 2) * W;

  const bottomLeft = columns - 1;
  const topLeft = bottomLeft + rows - 1;
  const topRight = topLeft + columns - 1;

  const tiles: TileRect[] = [];
  for (let i = 0; i < tileCount; i++) {
    const corner = i === 0 || i === bottomLeft || i === topLeft || i === topRight;
    if (i < bottomLeft) {
      // Unten, von rechts nach links.
      const x = i === 0 ? width - D : width - D - i * W;
      tiles.push({ index: i, x, y: height - D, w: i === 0 ? D : W, h: D, corner, side: 'bottom' });
    } else if (i < topLeft) {
      const k = i - bottomLeft;
      const y = k === 0 ? height - D : height - D - k * W;
      tiles.push({ index: i, x: 0, y, w: D, h: k === 0 ? D : W, corner, side: 'left' });
    } else if (i < topRight) {
      const k = i - topLeft;
      const x = k === 0 ? 0 : D + (k - 1) * W;
      tiles.push({ index: i, x, y: 0, w: k === 0 ? D : W, h: D, corner, side: 'top' });
    } else {
      const k = i - topRight;
      const y = k === 0 ? 0 : D + (k - 1) * W;
      tiles.push({ index: i, x: width - D, y, w: D, h: k === 0 ? D : W, corner, side: 'right' });
    }
  }
  return { width, height, tiles, center: { x: D, y: D, w: width - 2 * D, h: height - 2 * D } };
}
