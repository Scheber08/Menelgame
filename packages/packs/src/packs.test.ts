import { describe, expect, it } from 'vitest';
import { parseBoardPack } from '@menelgame/schema';
import standardJson from './standard.json';
import { standardPack } from './index';

describe('Standard-Pack', () => {
  it('ist gültig und hat 40 Felder', () => {
    const result = parseBoardPack(standardJson);
    expect(result.ok).toBe(true);
    expect(standardPack.tiles).toHaveLength(40);
  });

  it('nutzt jede Gruppe und jedes Deck', () => {
    for (const group of standardPack.groups) {
      expect(standardPack.tiles.some((t) => 'group' in t && t.group === group.id)).toBe(true);
    }
    for (const deck of standardPack.decks) {
      expect(standardPack.tiles.some((t) => t.type === 'card' && t.deck === deck.id)).toBe(true);
    }
  });

  it('hat steigende Preise je Brettseite', () => {
    const prices = standardPack.tiles.flatMap((t) => (t.type === 'property' ? [t.price] : []));
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
  });
});
