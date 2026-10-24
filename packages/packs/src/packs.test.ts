import { describe, expect, it } from 'vitest';
import { parseBoardPack } from '@menelgame/schema';
import standardJson from './standard.json';
import { builtInPacks, fantasyPack, standardPack, wienPack } from './index';

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

describe('Mitgelieferte Packs', () => {
  it('haben eindeutige IDs und nutzen alle Gruppen, Stapel und Feldtypen', () => {
    expect(new Set(builtInPacks.map((p) => p.meta.id)).size).toBe(builtInPacks.length);
    for (const pack of builtInPacks) {
      const used = new Set(pack.tiles.flatMap((t) => ('group' in t ? [t.group] : [])));
      expect(pack.groups.map((g) => g.id).filter((id) => !used.has(id))).toEqual([]);
      const decks = new Set(pack.tiles.flatMap((t) => (t.type === 'card' ? [t.deck] : [])));
      expect(pack.decks.map((d) => d.id).filter((id) => !decks.has(id))).toEqual([]);
      const types = new Set(pack.tiles.flatMap((t) => (t.type === 'custom' ? [t.tileType] : [])));
      expect(pack.tileTypes.map((t) => t.id).filter((id) => !types.has(id))).toEqual([]);
    }
  });

  it('Wien-Edition und Fantasy-Welt', () => {
    expect(wienPack.tiles).toHaveLength(40);
    expect(fantasyPack.tiles).toHaveLength(32);
    expect(fantasyPack.layout.shape).toBe('square');
    expect(fantasyPack.variables.map((v) => v.id)).toEqual(['ruhm', 'schatz']);
  });
});
