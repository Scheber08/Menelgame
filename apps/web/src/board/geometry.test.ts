import { describe, expect, it } from 'vitest';
import { boardGeometry, TILE_DEPTH, TILE_WIDTH } from './geometry';

function overlaps(a: { x: number; y: number; w: number; h: number }, b: typeof a) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

describe('Brett-Geometrie', () => {
  it('legt 40 Felder quadratisch ohne Überlappung an', () => {
    const g = boardGeometry({ shape: 'square' }, 40);
    expect(g.width).toBe(2 * TILE_DEPTH + 9 * TILE_WIDTH);
    expect(g.height).toBe(g.width);
    expect(g.tiles.filter((t) => t.corner).map((t) => t.index)).toEqual([0, 10, 20, 30]);
    expect(g.tiles[0]).toMatchObject({ x: g.width - TILE_DEPTH, y: g.height - TILE_DEPTH });
    expect(g.tiles[20]).toMatchObject({ x: 0, y: 0 });
    for (const a of g.tiles) {
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.y + a.h).toBeLessThanOrEqual(g.height);
      for (const b of g.tiles) if (a !== b) expect(overlaps(a, b)).toBe(false);
      expect(overlaps(a, g.center)).toBe(false);
    }
  });

  it('unterstützt Rechtecke', () => {
    const g = boardGeometry({ shape: 'rectangle', columns: 6, rows: 4 }, 16);
    expect(g.tiles.filter((t) => t.corner).map((t) => t.index)).toEqual([0, 5, 8, 13]);
    expect(g.width).toBe(2 * TILE_DEPTH + 4 * TILE_WIDTH);
    expect(g.height).toBe(2 * TILE_DEPTH + 2 * TILE_WIDTH);
    // Felder grenzen lückenlos aneinander.
    const area = g.tiles.reduce((sum, t) => sum + t.w * t.h, 0);
    expect(area + g.center.w * g.center.h).toBe(g.width * g.height);
  });
});

describe('Freie Formen', () => {
  it('legt einen Ring ohne Überlappung an', () => {
    const g = boardGeometry({ shape: 'ring' }, 30);
    for (const a of g.tiles) {
      expect(a.side).toBe('none');
      for (const b of g.tiles) if (a !== b) expect(overlaps(a, b)).toBe(false);
    }
  });

  it('folgt beim Pfad den Punkten', () => {
    const g = boardGeometry(
      {
        shape: 'path',
        points: [
          { x: 0, y: 0 },
          { x: 100, y: 100 },
        ],
      },
      2,
    );
    expect(g.tiles[0]!.x).toBeLessThan(g.tiles[1]!.x);
    expect(g.tiles[0]!.y).toBeLessThan(g.tiles[1]!.y);
  });
});
