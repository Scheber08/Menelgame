import { describe, expect, it } from 'vitest';
import { getDefaultAction } from './apply';
import { replay } from './replay';
import {
  act,
  cash,
  expectError,
  give,
  landOn,
  newGame,
  patchPlayer,
  patchTiles,
  player,
  withRules,
} from './test/helpers';
import type { GameState } from './types';

describe('Regeln live ändern', () => {
  it('übernimmt neue Regelwerte und protokolliert die Änderung', () => {
    const state = newGame();
    const rules = withRules(state.rules, { passStartBonus: 400, freeParkingPot: true });
    const { state: next, events } = act(state, { type: 'UPDATE_RULES', rules, dice: state.dice });
    expect(next.rules.passStartBonus).toBe(400);
    expect(next.pack.rules.passStartBonus).toBe(200);
    expect(events).toEqual([
      { type: 'rulesUpdated', changes: ['passStartBonus', 'freeParkingPot'] },
    ]);
  });

  it('wirkt sich sofort auf das Spiel aus', () => {
    let state = newGame();
    const rules = withRules(state.rules, { passStartBonus: 400 });
    state = act(state, { type: 'UPDATE_RULES', rules, dice: state.dice }).state;
    const landed = landOn(state, 'p1', 'start').state;
    expect(cash(landed, 'p1')).toBe(1900);
  });

  it('ändert Würfel und passt den Gebäudevorrat an', () => {
    let state = give(newGame(), 'p1', 'schilfweg', 'weidenufer', 'moewenkai');
    state = patchTiles(state, { schilfweg: { buildings: 3 }, weidenufer: { buildings: 5 } });
    const rules = withRules(state.rules, { buildingLimit: { houses: 10, hotels: null } });
    const { state: next, events } = act(state, {
      type: 'UPDATE_RULES',
      rules,
      dice: { count: 3, sides: 6 },
    });
    expect(next.bank).toEqual({ houses: 7, hotels: null });
    expect(next.dice).toEqual({ count: 3, sides: 6 });
    expect(events).toEqual([{ type: 'rulesUpdated', changes: ['buildingLimit', 'dice'] }]);
  });

  it('lehnt ungültige Werte ab', () => {
    const state = newGame();
    const rules = withRules(state.rules, { startingCash: -5 });
    expectError(state, { type: 'UPDATE_RULES', rules, dice: state.dice }, 'invalidRules');
    expectError(
      state,
      { type: 'UPDATE_RULES', rules: state.rules, dice: { count: 9, sides: 6 } },
      'invalidRules',
    );
  });

  it('wird beim Replay mit angewandt', () => {
    const initial = newGame();
    const rules = withRules(initial.rules, { passStartBonus: 0 });
    const actions = [{ type: 'UPDATE_RULES' as const, rules, dice: initial.dice }];
    expect(replay({ initial, actions }).state.rules.passStartBonus).toBe(0);
  });
});

describe('Spieler entfernen', () => {
  it('gibt den Besitz an die Bank zurück und überspringt den Spieler', () => {
    let state = give(newGame({ players: 3 }), 'p2', 'schilfweg');
    state = patchTiles(state, { schilfweg: { mortgaged: true } });
    const { state: next, events } = act(state, { type: 'REMOVE_PLAYER', targetId: 'p2' });
    expect(events[0]).toEqual({ type: 'playerRemoved', playerId: 'p2' });
    expect(player(next, 'p2')).toMatchObject({ bankrupt: true, cash: 0 });
    expect(next.tiles.schilfweg).toEqual({ owner: null, buildings: 0, mortgaged: false });
    expect(next.phase).toEqual({ name: 'awaitingRoll' });
    expect(next.currentPlayer).toBe(0);
  });

  it('beendet den Zug, wenn der Spieler am Zug entfernt wird', () => {
    const state: GameState = {
      ...newGame({ players: 3 }),
      phase: { name: 'freePhase', extraRoll: true },
    };
    const next = act(state, { type: 'REMOVE_PLAYER', targetId: 'p1' }).state;
    expect(next.currentPlayer).toBe(1);
    expect(next.phase).toEqual({ name: 'awaitingRoll' });
  });

  it('beendet das Spiel, wenn nur einer bleibt', () => {
    const next = act(newGame(), { type: 'REMOVE_PLAYER', targetId: 'p2' }).state;
    expect(next.phase).toEqual({ name: 'gameOver', winner: 'p1' });
  });

  it('löst offene Schulden des Entfernten auf', () => {
    let state = patchPlayer(newGame({ players: 3 }), 'p2', { cash: 0 });
    state = {
      ...state,
      phase: { name: 'awaitingDebt', resume: { kind: 'freePhase', extraRoll: false } },
      debts: [{ debtor: 'p2', creditor: 'p1', amount: 10, reason: 'card' }],
    };
    const next = act(state, { type: 'REMOVE_PLAYER', targetId: 'p2' }).state;
    expect(next.debts).toEqual([]);
    expect(next.phase).toEqual({ name: 'freePhase', extraRoll: false });
  });

  it('nimmt den Spieler aus einer laufenden Auktion', () => {
    let state = landOn(newGame({ players: 3 }), 'p1', 'busbahnhof').state;
    state = act(state, { type: 'DECLINE', playerId: 'p1' }).state;
    state = act(state, { type: 'AUCTION_BID', playerId: 'p2', amount: 80 }).state;
    state = act(state, { type: 'AUCTION_PASS', playerId: 'p3' }).state;
    // p2 hat das Höchstgebot und wird entfernt → Gebot verfällt, p1 bietet weiter.
    state = act(state, { type: 'REMOVE_PLAYER', targetId: 'p2' }).state;
    expect(state.auction).toMatchObject({ highestBid: 0, highestBidder: null });
    state = act(state, { type: 'AUCTION_BID', playerId: 'p1', amount: 5 }).state;
    expect(state.tiles.busbahnhof?.owner).toBe('p1');
  });

  it('ist eine Systemaktion', () => {
    expectError(newGame(), { type: 'REMOVE_PLAYER', targetId: 'x' }, 'unknownPlayer');
  });
});

describe('Standardaktion für den Zugtimer', () => {
  it('würfelt, lehnt Käufe ab und beendet den Zug', () => {
    const state = newGame();
    expect(getDefaultAction(state)).toEqual({ type: 'ROLL_DICE', playerId: 'p1' });
    const offer = landOn(newGame(), 'p1', 'busbahnhof').state;
    expect(getDefaultAction(offer)).toEqual({ type: 'DECLINE', playerId: 'p1' });
    const free: GameState = { ...newGame(), phase: { name: 'freePhase', extraRoll: false } };
    expect(getDefaultAction(free)).toEqual({ type: 'END_TURN', playerId: 'p1' });
  });

  it('begleicht Schulden über Hypotheken oder erklärt Bankrott', () => {
    let state = give(patchPlayer(newGame(), 'p1', { cash: 0 }), 'p1', 'busbahnhof');
    state = {
      ...state,
      phase: { name: 'awaitingDebt', resume: { kind: 'freePhase', extraRoll: false } },
      debts: [{ debtor: 'p1', creditor: 'bank', amount: 50, reason: 'tax' }],
    };
    expect(getDefaultAction(state)).toEqual({
      type: 'MORTGAGE',
      playerId: 'p1',
      tileId: 'busbahnhof',
    });
    const broke = {
      ...state,
      tiles: { ...state.tiles, busbahnhof: { owner: null, buildings: 0, mortgaged: false } },
    };
    expect(getDefaultAction(broke)).toEqual({ type: 'DECLARE_BANKRUPTCY', playerId: 'p1' });
  });
});
