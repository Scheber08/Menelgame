import { describe, expect, it } from 'vitest';
import {
  act,
  cash,
  expectError,
  give,
  landOn,
  newGame,
  patchPlayer,
  patchTiles,
  rigDice,
} from './test/helpers';

describe('Kaufen', () => {
  it('bietet ein freies Feld zum Kauf an und kauft es', () => {
    const { state, events } = landOn(newGame(), 'p1', 'busbahnhof');
    expect(state.phase).toEqual({
      name: 'awaitingPurchase',
      tileId: 'busbahnhof',
      extraRoll: false,
    });
    expect(events).toContainEqual({
      type: 'purchaseOffered',
      playerId: 'p1',
      tileId: 'busbahnhof',
      price: 200,
    });
    const bought = act(state, { type: 'BUY', playerId: 'p1' }).state;
    expect(bought.tiles.busbahnhof?.owner).toBe('p1');
    expect(cash(bought, 'p1')).toBe(1300);
    expect(bought.phase).toEqual({ name: 'freePhase', extraRoll: false });
  });

  it('lehnt den Kauf ohne genug Geld ab', () => {
    let state = patchPlayer(newGame(), 'p1', { cash: 100 });
    state = landOn(state, 'p1', 'busbahnhof').state;
    expectError(state, { type: 'BUY', playerId: 'p1' }, 'insufficientFunds');
  });

  it('startet beim Ablehnen eine Auktion, wenn Auktionen aktiv sind', () => {
    const on = landOn(newGame({ rules: { auctions: true } }), 'p1', 'busbahnhof').state;
    const declined = act(on, { type: 'DECLINE', playerId: 'p1' });
    expect(declined.events).toContainEqual({ type: 'auctionStarted', tileId: 'busbahnhof' });
    expect(declined.state.phase).toEqual({ name: 'auction' });
    expect(declined.state.tiles.busbahnhof?.owner).toBeNull();

    const off = landOn(newGame({ rules: { auctions: false } }), 'p1', 'busbahnhof').state;
    const plain = act(off, { type: 'DECLINE', playerId: 'p1' });
    expect(plain.events.map((e) => e.type)).toEqual(['purchaseDeclined']);
  });

  it('behält den Extrawurf über die Kaufentscheidung', () => {
    let state = rigDice(newGame(), [[3, 3]]);
    state = act(state, { type: 'ROLL_DICE', playerId: 'p1' }).state;
    expect(state.phase).toEqual({ name: 'awaitingPurchase', tileId: 'schilfweg', extraRoll: true });
    state = act(state, { type: 'BUY', playerId: 'p1' }).state;
    expect(state.phase).toEqual({ name: 'freePhase', extraRoll: true });
  });
});

describe('Miete', () => {
  it('zahlt die Grundmiete an den Besitzer', () => {
    const state = give(newGame(), 'p2', 'schilfweg');
    const { state: next, events } = landOn(state, 'p1', 'schilfweg');
    expect(events).toContainEqual({
      type: 'rentDue',
      playerId: 'p1',
      owner: 'p2',
      tileId: 'schilfweg',
      amount: 7,
    });
    expect(cash(next, 'p1')).toBe(1493);
    expect(cash(next, 'p2')).toBe(1507);
  });

  it('verdoppelt die Miete bei vollständiger Gruppe (Faktor einstellbar)', () => {
    for (const [multiplier, rent] of [
      [2, 14],
      [3, 21],
    ] as const) {
      const state = give(
        newGame({ rules: { monopolyRentMultiplier: multiplier } }),
        'p2',
        'schilfweg',
        'weidenufer',
        'moewenkai',
      );
      expect(cash(landOn(state, 'p1', 'schilfweg').state, 'p2')).toBe(1500 + rent);
    }
  });

  it('nutzt die Miete für Häuser und Hotel', () => {
    let state = give(newGame(), 'p2', 'schilfweg', 'weidenufer', 'moewenkai');
    state = patchTiles(state, { schilfweg: { buildings: 3 } });
    expect(cash(landOn(state, 'p1', 'schilfweg').state, 'p2')).toBe(1500 + 280);
    state = patchTiles(state, { schilfweg: { buildings: 5 } });
    expect(cash(landOn(state, 'p1', 'schilfweg').state, 'p2')).toBe(1500 + 560);
  });

  it('kassiert keine Miete für Felder mit Hypothek', () => {
    let state = give(newGame(), 'p2', 'schilfweg');
    state = patchTiles(state, { schilfweg: { mortgaged: true } });
    const { state: next, events } = landOn(state, 'p1', 'schilfweg');
    expect(events).toContainEqual({
      type: 'noRent',
      playerId: 'p1',
      tileId: 'schilfweg',
      why: 'mortgaged',
    });
    expect(cash(next, 'p1')).toBe(1500);
  });

  it('berechnet Bahnhofsmiete nach Anzahl im Besitz', () => {
    let state = give(newGame(), 'p2', 'busbahnhof');
    expect(cash(landOn(state, 'p1', 'busbahnhof').state, 'p2')).toBe(1525);
    state = give(state, 'p2', 'faehrhafen', 'seilbahn');
    expect(cash(landOn(state, 'p1', 'busbahnhof').state, 'p2')).toBe(1600);
  });

  it('berechnet Werksmiete aus der Würfelsumme', () => {
    let state = give(newGame(), 'p2', 'kraftwerk');
    // landOn würfelt 5: 5 × 4
    expect(cash(landOn(state, 'p1', 'kraftwerk').state, 'p2')).toBe(1520);
    state = give(state, 'p2', 'wasserturm');
    expect(cash(landOn(state, 'p1', 'kraftwerk').state, 'p2')).toBe(1550);
  });

  it('richtet sich nach der Gefängnisregel für Besitzer', () => {
    for (const [collect, expected] of [
      [true, 1507],
      [false, 1500],
    ] as const) {
      let state = give(
        newGame({ rules: { jail: { collectRentInJail: collect } } }),
        'p2',
        'schilfweg',
      );
      state = patchPlayer(state, 'p2', { inJail: true, position: 10 });
      expect(cash(landOn(state, 'p1', 'schilfweg').state, 'p2')).toBe(expected);
    }
  });

  it('zahlt keine Miete auf eigenen Feldern', () => {
    const state = give(newGame(), 'p1', 'schilfweg');
    const { state: next } = landOn(state, 'p1', 'schilfweg');
    expect(cash(next, 'p1')).toBe(1500);
    expect(next.phase).toEqual({ name: 'freePhase', extraRoll: false });
  });
});

describe('Steuern und Frei Parken', () => {
  it('zahlt Steuern an die Bank', () => {
    const { state } = landOn(newGame(), 'p1', 'grundsteuer', [1, 3]);
    expect(cash(state, 'p1')).toBe(1300);
    expect(state.freeParkingPot).toBe(0);
  });

  it('sammelt Steuern im Topf und zahlt ihn auf Frei Parken aus, wenn aktiv', () => {
    let state = newGame({ rules: { freeParkingPot: true } });
    state = landOn(state, 'p1', 'grundsteuer', [1, 3]).state;
    expect(state.freeParkingPot).toBe(200);
    state = { ...state, phase: { name: 'awaitingRoll' } };
    const { state: next } = landOn(state, 'p1', 'stadtpark');
    expect(cash(next, 'p1')).toBe(1500);
    expect(next.freeParkingPot).toBe(0);
  });

  it('zahlt ohne Hausregel nichts auf Frei Parken aus', () => {
    let state = newGame();
    state = { ...state, freeParkingPot: 300 };
    expect(cash(landOn(state, 'p1', 'stadtpark').state, 'p1')).toBe(1500);
  });
});
