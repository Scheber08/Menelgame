import type { Layout } from '@menelgame/schema';

/** Seite des Bretts; `none` bei freien Formen (Ring, Pfad) – dort sind alle Felder Kacheln. */
export type Side = 'bottom' | 'left' | 'top' | 'right' | 'none';

export interface TileRect {
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
  corner: boolean;
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
/** Kantenlänge einer Kachel bei Ring und Pfad. */
export const CELL = 84;

export function boardGeometry(layout: Layout, tileCount: number): BoardGeometry {
  switch (layout.shape) {
    case 'ring':
      return ringGeometry(tileCount);
    case 'path':
      return pathGeometry(layout.points, tileCount);
    case 'square':
      return edgeGeometry(tileCount / 4 + 1, tileCount / 4 + 1, tileCount);
    case 'rectangle':
      return edgeGeometry(layout.columns, layout.rows, tileCount);
  }
}

/**
 * Klassisches Brett: Feld 0 in der Ecke unten rechts, dann nach links, die linke Seite
 * hinauf, oben nach rechts und rechts wieder hinunter.
 */
function edgeGeometry(columns: number, rows: number, tileCount: number): BoardGeometry {
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

/** Kacheln gleichmäßig auf einem Kreis, Feld 0 unten, dann im Uhrzeigersinn. */
function ringGeometry(tileCount: number): BoardGeometry {
  // Achsparallele Kacheln: Abstand ≥ Diagonale, damit sie sich auch bei 45° nicht überlappen.
  const radius = Math.max(260, (CELL * 1.45 * tileCount) / (2 * Math.PI));
  const size = Math.ceil(2 * radius + CELL + 20);
  const c = size / 2;
  const tiles: TileRect[] = Array.from({ length: tileCount }, (_, i) => {
    const angle = Math.PI / 2 + (i * 2 * Math.PI) / tileCount;
    return {
      index: i,
      x: c + radius * Math.cos(angle) - CELL / 2,
      y: c + radius * Math.sin(angle) - CELL / 2,
      w: CELL,
      h: CELL,
      corner: false,
      side: 'none',
    };
  });
  const inner = (radius - CELL / 2) * Math.SQRT2 * 0.92;
  return {
    width: size,
    height: size,
    tiles,
    center: { x: c - inner / 2, y: c - inner / 2, w: inner, h: inner },
  };
}

/** Freier Pfad: Punkte 0–100 werden auf die Brettfläche verteilt. */
function pathGeometry(points: { x: number; y: number }[], tileCount: number): BoardGeometry {
  const size = 900;
  const span = size - CELL - 20;
  const tiles: TileRect[] = Array.from({ length: tileCount }, (_, i) => {
    const p = points[i] ?? { x: (i / Math.max(1, tileCount - 1)) * 100, y: 50 };
    return {
      index: i,
      x: 10 + (p.x / 100) * span,
      y: 10 + (p.y / 100) * span,
      w: CELL,
      h: CELL,
      corner: false,
      side: 'none',
    };
  });
  return {
    width: size,
    height: size,
    tiles,
    center: { x: size * 0.3, y: size * 0.3, w: size * 0.4, h: size * 0.4 },
  };
}

/** Punkte für einen neuen freien Pfad: eine Schlangenlinie über das Brett. */
export function defaultPathPoints(tileCount: number): { x: number; y: number }[] {
  const perRow = Math.ceil(Math.sqrt(tileCount * 1.5));
  const rows = Math.ceil(tileCount / perRow);
  return Array.from({ length: tileCount }, (_, i) => {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const x = perRow === 1 ? 50 : ((row % 2 === 0 ? col : perRow - 1 - col) / (perRow - 1)) * 100;
    const y = rows === 1 ? 50 : (row / (rows - 1)) * 100;
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  });
}
