import { describe, expect, it } from 'vitest';
import { randomizeBoard } from './generator';
import { standardPack } from './index';

const corners = ['start', 'gefaengnis', 'stadtpark', 'ab-ins-gefaengnis'];

describe('Zufallsbrett-Generator', () => {
  it('ist mit gleichem Startwert reproduzierbar und mischt mit anderem neu', () => {
    const a = randomizeBoard(standardPack, 1);
    expect(randomizeBoard(standardPack, 1)).toEqual(a);
    expect(randomizeBoard(standardPack, 2).tiles.map((t) => t.id)).not.toEqual(
      a.tiles.map((t) => t.id),
    );
    expect(a.meta.name).toBe('Neustadt (Zufall)');
  });

  it('lässt die Ecken stehen und behält alle Felder', () => {
    const board = randomizeBoard(standardPack, 7);
    for (const id of corners) {
      expect(board.tiles.findIndex((t) => t.id === id)).toBe(
        standardPack.tiles.findIndex((t) => t.id === id),
      );
    }
    expect([...board.tiles.map((t) => t.id)].sort()).toEqual(
      [...standardPack.tiles.map((t) => t.id)].sort(),
    );
  });

  it('hält Farbgruppen zusammen und lässt die Preise entlang des Bretts steigen', () => {
    for (const seed of [3, 4, 5, 6]) {
      const board = randomizeBoard(standardPack, seed);
      const movable = board.tiles.filter((t) => !corners.includes(t.id));
      const props = movable.flatMap((t, i) => (t.type === 'property' ? [{ t, i }] : []));
      for (const group of new Set(props.map((p) => p.t.type === 'property' && p.t.group))) {
        const positions = props
          .filter((p) => p.t.type === 'property' && p.t.group === group)
          .map((p) => p.i);
        expect(positions.at(-1)! - positions[0]!).toBe(positions.length - 1);
      }
      const prices = board.tiles.flatMap((t) => (t.type === 'property' ? [t.price] : []));
      expect([...prices].sort((a, b) => a - b)).toEqual(prices);
    }
  });
});
