import { describe, expect, it } from 'vitest';
import {
  act,
  cash,
  expectError,
  newGame,
  patchPlayer,
  player,
  position,
  rigDice,
} from './test/helpers';

describe('Würfeln und Bewegen', () => {
  it('bewegt um die Augensumme und protokolliert den Wurf', () => {
    const { state, events } = act(rigDice(newGame(), [[2, 4]]), {
      type: 'ROLL_DICE',
      playerId: 'p1',
    });
    expect(player(state, 'p1').position).toBe(6);
    expect(state.lastRoll).toEqual({ dice: [2, 4], total: 6, isDouble: false });
    expect(events[0]).toMatchObject({ type: 'diceRolled', total: 6 });
    expect(events[1]).toMatchObject({ type: 'moved', from: 0, to: 6 });
  });

  it('beendet den Zug und gibt an den nächsten Spieler weiter', () => {
    let state = rigDice(newGame({ rules: { auctions: false } }), [[1, 2]]);
    state = act(state, { type: 'ROLL_DICE', playerId: 'p1' }).state;
    // Feld 3 ist ein Grundstück → ablehnen, dann Zug beenden.
    state = act(state, { type: 'DECLINE', playerId: 'p1' }).state;
    expect(state.phase).toEqual({ name: 'freePhase', extraRoll: false });
    expectError(state, { type: 'ROLL_DICE', playerId: 'p1' }, 'wrongPhase');
    const { state: next, events } = act(state, { type: 'END_TURN', playerId: 'p1' });
    expect(next.currentPlayer).toBe(1);
    expect(next.phase).toEqual({ name: 'awaitingRoll' });
    expect(events.map((e) => e.type)).toEqual(['turnEnded', 'turnStarted']);
  });

  it('zählt Runden, wenn der erste Spieler wieder dran ist', () => {
    let state = patchPlayer(newGame(), 'p1', { position: 30 });
    state = { ...state, phase: { name: 'freePhase', extraRoll: false } };
    state = act(state, { type: 'END_TURN', playerId: 'p1' }).state;
    expect(state.round).toBe(1);
    state = { ...state, phase: { name: 'freePhase', extraRoll: false } };
    state = act(state, { type: 'END_TURN', playerId: 'p2' }).state;
    expect(state.round).toBe(2);
    expect(state.currentPlayer).toBe(0);
  });

  it('zahlt den Los-Bonus beim Überqueren', () => {
    let state = patchPlayer(newGame(), 'p1', { position: 38 });
    state = rigDice(state, [[2, 3]]);
    const { state: next } = act(state, { type: 'ROLL_DICE', playerId: 'p1' });
    expect(player(next, 'p1').position).toBe(3);
    expect(cash(next, 'p1')).toBe(1700);
  });

  it('zahlt den Los-Bonus und optional einen Extra-Bonus beim Landen', () => {
    for (const [extra, expected] of [
      [0, 1700],
      [200, 1900],
    ] as const) {
      let state = patchPlayer(newGame({ rules: { landOnStartExtra: extra } }), 'p1', {
        position: 35,
      });
      state = rigDice(state, [[2, 3]]);
      const { state: next } = act(state, { type: 'ROLL_DICE', playerId: 'p1' });
      expect(player(next, 'p1').position).toBe(0);
      expect(cash(next, 'p1')).toBe(expected);
    }
  });

  it('gibt nach einem Pasch einen weiteren Wurf', () => {
    let state = rigDice(newGame(), [
      [2, 2],
      [3, 2],
    ]);
    state = act(state, { type: 'ROLL_DICE', playerId: 'p1' }).state;
    // Feld 4: Grundsteuer, danach freie Phase mit Extrawurf.
    expect(state.phase).toEqual({ name: 'freePhase', extraRoll: true });
    expectError(state, { type: 'END_TURN', playerId: 'p1' }, 'mustRollAgain');
    state = act(state, { type: 'ROLL_DICE', playerId: 'p1' }).state;
    expect(player(state, 'p1').position).toBe(9);
  });

  it('schickt bei dreimal Pasch ins Gefängnis', () => {
    let state = rigDice(newGame(), [
      [2, 2],
      [3, 3],
      [4, 4],
    ]);
    state = act(state, { type: 'ROLL_DICE', playerId: 'p1' }).state; // Feld 4: Grundsteuer
    state = act(state, { type: 'ROLL_DICE', playerId: 'p1' }).state; // Feld 10: nur zu Besuch
    expect(player(state, 'p1')).toMatchObject({ doublesInRow: 2, inJail: false });
    const { state: jailed, events } = act(state, { type: 'ROLL_DICE', playerId: 'p1' });
    expect(events).toContainEqual({ type: 'sentToJail', playerId: 'p1', reason: 'tripleDoubles' });
    expect(player(jailed, 'p1')).toMatchObject({
      inJail: true,
      position: position(jailed, 'gefaengnis'),
    });
    expect(jailed.phase).toEqual({ name: 'freePhase', extraRoll: false });
  });

  it('erlaubt dreimal Pasch, wenn die Regel aus ist', () => {
    let state = newGame({ rules: { tripleDoublesToJail: false } });
    state = patchPlayer(state, 'p1', { doublesInRow: 2, position: 20 });
    state = { ...state, phase: { name: 'freePhase', extraRoll: true } };
    state = rigDice(state, [[3, 3]]);
    const { state: next } = act(state, { type: 'ROLL_DICE', playerId: 'p1' });
    expect(player(next, 'p1').inJail).toBe(false);
    expect(player(next, 'p1').position).toBe(26);
  });

  it('würfelt mit konfigurierbaren Würfeln', () => {
    let state = newGame();
    state = { ...state, dice: { count: 3, sides: 4 } };
    state = rigDice(state, [[4, 4, 1]]);
    const { state: next } = act(state, { type: 'ROLL_DICE', playerId: 'p1' });
    expect(next.lastRoll).toEqual({ dice: [4, 4, 1], total: 9, isDouble: false });
    expect(player(next, 'p1').position).toBe(9);
  });

  it('kennt bei einem Würfel keinen Pasch', () => {
    let state = newGame();
    state = { ...state, dice: { count: 1, sides: 6 } };
    state = rigDice(state, [[5]]);
    const { state: next } = act(state, { type: 'ROLL_DICE', playerId: 'p1' });
    expect(next.lastRoll?.isDouble).toBe(false);
  });
});
