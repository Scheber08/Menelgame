import { describe, expect, it } from 'vitest';
import { act, cash, expectError, give, newGame, patchPlayer, patchTiles } from './test/helpers';
import type { Action, GameState } from './types';

const UFER = ['schilfweg', 'weidenufer', 'moewenkai'];

function owningUfer(options: Parameters<typeof newGame>[0] = {}): GameState {
  return give(newGame(options), 'p1', ...UFER);
}

const build = (tileId: string): Action => ({ type: 'BUILD', playerId: 'p1', tileId });
const sell = (tileId: string): Action => ({ type: 'SELL_BUILDING', playerId: 'p1', tileId });

describe('Bauen', () => {
  it('baut ein Haus bei vollständiger Gruppe', () => {
    const { state, events } = act(owningUfer(), build('schilfweg'));
    expect(state.tiles.schilfweg?.buildings).toBe(1);
    expect(cash(state, 'p1')).toBe(1450);
    expect(state.bank.houses).toBe(31);
    expect(events).toContainEqual({
      type: 'built',
      playerId: 'p1',
      tileId: 'schilfweg',
      buildings: 1,
      cost: 50,
    });
  });

  it('verlangt die ganze Gruppe und ein Grundstück', () => {
    const state = give(newGame(), 'p1', 'schilfweg', 'weidenufer', 'busbahnhof');
    expectError(state, build('schilfweg'), 'incompleteGroup');
    expectError(state, build('busbahnhof'), 'notBuildable');
    expectError(owningUfer(), { type: 'BUILD', playerId: 'p1', tileId: 'rosenbogen' }, 'notOwner');
    expectError(
      owningUfer(),
      { type: 'BUILD', playerId: 'p1', tileId: 'gibtsnicht' },
      'unknownTile',
    );
  });

  it('erzwingt gleichmäßiges Bauen, wenn die Regel aktiv ist', () => {
    const state = act(owningUfer(), build('schilfweg')).state;
    expectError(state, build('schilfweg'), 'unevenBuilding');
    const free = act(owningUfer({ rules: { evenBuilding: false } }), build('schilfweg')).state;
    expect(act(free, build('schilfweg')).state.tiles.schilfweg?.buildings).toBe(2);
  });

  it('macht aus vier Häusern ein Hotel und gibt die Häuser zurück', () => {
    let state = patchTiles(owningUfer(), {
      schilfweg: { buildings: 4 },
      weidenufer: { buildings: 4 },
      moewenkai: { buildings: 4 },
    });
    state = { ...state, bank: { houses: 20, hotels: 12 } };
    const next = act(state, build('schilfweg')).state;
    expect(next.tiles.schilfweg?.buildings).toBe(5);
    expect(next.bank).toEqual({ houses: 24, hotels: 11 });
    expectError(next, build('schilfweg'), 'maxBuildings');
  });

  it('beachtet das Baulimit der Bank', () => {
    let state = owningUfer();
    state = { ...state, bank: { houses: 0, hotels: 0 } };
    expectError(state, build('schilfweg'), 'bankOutOfHouses');
    state = patchTiles(state, {
      schilfweg: { buildings: 4 },
      weidenufer: { buildings: 4 },
      moewenkai: { buildings: 4 },
    });
    expectError(state, build('schilfweg'), 'bankOutOfHotels');
  });

  it('kennt unbegrenzte Gebäude', () => {
    const state = owningUfer({ rules: { buildingLimit: { houses: null, hotels: null } } });
    expect(state.bank).toEqual({ houses: null, hotels: null });
    expect(act(state, build('schilfweg')).state.bank).toEqual({ houses: null, hotels: null });
  });

  it('verlangt genug Geld und keine Hypothek in der Gruppe', () => {
    expectError(
      patchPlayer(owningUfer(), 'p1', { cash: 49 }),
      build('schilfweg'),
      'insufficientFunds',
    );
    expectError(
      patchTiles(owningUfer(), { moewenkai: { mortgaged: true } }),
      build('schilfweg'),
      'groupMortgaged',
    );
  });

  it('erlaubt Bauen in mehreren Phasen, aber nicht für andere Spieler', () => {
    const state = { ...owningUfer(), phase: { name: 'freePhase', extraRoll: false } } as GameState;
    expect(act(state, build('schilfweg')).state.tiles.schilfweg?.buildings).toBe(1);
    expectError(state, { type: 'BUILD', playerId: 'p2', tileId: 'schilfweg' }, 'notYourTurn');
  });
});

describe('Verkaufen', () => {
  it('verkauft zum eingestellten Prozentsatz', () => {
    const state = patchTiles(owningUfer(), { schilfweg: { buildings: 1 } });
    expect(cash(act(state, sell('schilfweg')).state, 'p1')).toBe(1525);
    const generous = patchTiles(owningUfer({ rules: { buildingSellPercent: 80 } }), {
      schilfweg: { buildings: 1 },
    });
    expect(cash(act(generous, sell('schilfweg')).state, 'p1')).toBe(1540);
  });

  it('verkauft gleichmäßig und nur vorhandene Gebäude', () => {
    const state = patchTiles(owningUfer(), {
      schilfweg: { buildings: 1 },
      weidenufer: { buildings: 2 },
    });
    expectError(state, sell('schilfweg'), 'unevenBuilding');
    expectError(state, sell('moewenkai'), 'noBuildings');
    expect(act(state, sell('weidenufer')).state.tiles.weidenufer?.buildings).toBe(1);
  });

  it('wandelt ein Hotel zurück in vier Häuser', () => {
    let state = patchTiles(owningUfer(), {
      schilfweg: { buildings: 5 },
      weidenufer: { buildings: 5 },
      moewenkai: { buildings: 5 },
    });
    state = { ...state, bank: { houses: 10, hotels: 9 } };
    const next = act(state, sell('schilfweg')).state;
    expect(next.tiles.schilfweg?.buildings).toBe(4);
    expect(next.bank).toEqual({ houses: 6, hotels: 10 });
    expectError({ ...state, bank: { houses: 3, hotels: 9 } }, sell('schilfweg'), 'bankOutOfHouses');
  });
});

describe('Hypotheken', () => {
  const mortgage = (tileId: string): Action => ({ type: 'MORTGAGE', playerId: 'p1', tileId });
  const unmortgage = (tileId: string): Action => ({ type: 'UNMORTGAGE', playerId: 'p1', tileId });

  it('zahlt den halben Preis aus', () => {
    const { state } = act(owningUfer(), mortgage('moewenkai'));
    expect(state.tiles.moewenkai?.mortgaged).toBe(true);
    expect(cash(state, 'p1')).toBe(1560);
    expectError(state, mortgage('moewenkai'), 'mortgaged');
  });

  it('verlangt eine gebäudefreie Gruppe', () => {
    const state = patchTiles(owningUfer(), { schilfweg: { buildings: 1 } });
    expectError(state, mortgage('moewenkai'), 'groupHasBuildings');
  });

  it('löst mit Zinsen ab', () => {
    let state = patchTiles(owningUfer(), { moewenkai: { mortgaged: true } });
    expectError(state, unmortgage('schilfweg'), 'notMortgaged');
    state = act(state, unmortgage('moewenkai')).state;
    expect(cash(state, 'p1')).toBe(1500 - 66);
    const custom = patchTiles(owningUfer({ rules: { mortgageInterestPercent: 0 } }), {
      moewenkai: { mortgaged: true },
    });
    expect(cash(act(custom, unmortgage('moewenkai')).state, 'p1')).toBe(1440);
    expectError(
      patchPlayer(patchTiles(owningUfer(), { moewenkai: { mortgaged: true } }), 'p1', { cash: 65 }),
      unmortgage('moewenkai'),
      'insufficientFunds',
    );
  });
});
