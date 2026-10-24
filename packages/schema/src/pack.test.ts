import { describe, expect, it } from 'vitest';
import { parseBoardPack, type BoardPackInput } from './pack';

function minimalPack(): BoardPackInput {
  return {
    schemaVersion: 1,
    meta: { id: 'mini', name: 'Mini', version: '1.0.0' },
    maxPlayers: 4,
    layout: { shape: 'square' },
    groups: [{ id: 'g', name: 'Gruppe', color: '#123456' }],
    tiles: [
      { id: 'start', name: 'Start', type: 'start' },
      {
        id: 'a',
        name: 'A',
        type: 'property',
        group: 'g',
        price: 60,
        houseCost: 50,
        rent: [2, 10, 30, 90, 160, 250],
      },
      { id: 'karte', name: 'Karte', type: 'card', deck: 'd' },
      {
        id: 'b',
        name: 'B',
        type: 'property',
        group: 'g',
        price: 60,
        houseCost: 50,
        rent: [4, 20, 60, 180, 320, 450],
      },
      { id: 'jail', name: 'Gefängnis', type: 'jail' },
      { id: 'tax', name: 'Steuer', type: 'tax', amount: 100 },
      { id: 'park', name: 'Park', type: 'freeParking' },
      { id: 'gtj', name: 'Ab ins Gefängnis', type: 'goToJail' },
    ],
    decks: [
      {
        id: 'd',
        name: 'Deck',
        cards: [{ id: 'c1', text: 'Zum Start', effects: [{ kind: 'moveTo', tile: 'start' }] }],
      },
    ],
  };
}

function issuesOf(input: unknown): string[] {
  const result = parseBoardPack(input);
  return result.ok ? [] : result.issues.map((i) => i.message);
}

describe('BoardPackSchema', () => {
  it('akzeptiert ein minimales Pack und füllt Standardregeln', () => {
    const result = parseBoardPack(minimalPack());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pack.rules.startingCash).toBe(1500);
    expect(result.pack.rules.jail.bail).toBe(50);
    expect(result.pack.rules.buildingLimit).toEqual({ houses: 32, hotels: 12 });
    expect(result.pack.rules.victory).toEqual({ type: 'lastStanding' });
    expect(result.pack.rules.bankruptcy.mode).toBe('toCreditor');
    expect(result.pack.dice).toEqual({ count: 2, sides: 6 });
  });

  it('lehnt eine falsche Schema-Version ab', () => {
    expect(issuesOf({ ...minimalPack(), schemaVersion: 2 })).not.toEqual([]);
  });

  it('erkennt doppelte Feld-IDs', () => {
    const pack = minimalPack();
    pack.tiles[5] = { id: 'a', name: 'Steuer', type: 'tax', amount: 100 };
    expect(issuesOf(pack)).toContain('Doppelte Feld-ID a');
  });

  it('verlangt genau ein Start- und ein Gefängnisfeld', () => {
    const pack = minimalPack();
    pack.tiles[4] = { id: 'park2', name: 'Park', type: 'freeParking' };
    expect(issuesOf(pack)).toContain('Genau ein Gefängnisfeld erforderlich');
  });

  it('prüft Verweise auf Gruppen, Decks und Zielfelder', () => {
    const pack = minimalPack();
    pack.tiles[1] = { ...(pack.tiles[1] as object), group: 'fehlt' } as never;
    pack.tiles[2] = { id: 'karte', name: 'Karte', type: 'card', deck: 'unbekannt' };
    pack.decks[0]!.cards[0]!.effects = [{ kind: 'moveTo', tile: 'nirgendwo' }];
    const issues = issuesOf(pack);
    expect(issues).toContain('Unbekannte Gruppe fehlt');
    expect(issues).toContain('Unbekanntes Deck unbekannt');
    expect(issues).toContain('Unbekanntes Zielfeld nirgendwo');
  });

  it('verlangt ein Ziel für moveToNearest', () => {
    const pack = minimalPack();
    pack.decks[0]!.cards[0]!.effects = [{ kind: 'moveToNearest', tileType: 'station' }];
    expect(issuesOf(pack)).toContain('Kein Feld vom Typ station vorhanden');
  });

  it('prüft die Feldanzahl gegen das Layout', () => {
    const pack = minimalPack();
    pack.layout = { shape: 'rectangle', columns: 3, rows: 3 };
    expect(issuesOf(pack)).toEqual([]);
    pack.layout = { shape: 'rectangle', columns: 4, rows: 3 };
    expect(issuesOf(pack)).toContain('Rechteck: Feldanzahl muss 2 × (Spalten + Zeilen) − 4 sein');
  });

  it('verlangt genau sechs Mietwerte bei Grundstücken', () => {
    const pack = minimalPack();
    pack.tiles[1] = {
      id: 'a',
      name: 'A',
      type: 'property',
      group: 'g',
      price: 60,
      houseCost: 50,
      rent: [2, 10],
    };
    expect(issuesOf(pack)).not.toEqual([]);
  });

  it('lehnt Kommabeträge ab', () => {
    const pack = minimalPack();
    pack.tiles[5] = { id: 'tax', name: 'Steuer', type: 'tax', amount: 99.5 };
    expect(issuesOf(pack)).not.toEqual([]);
  });
});
