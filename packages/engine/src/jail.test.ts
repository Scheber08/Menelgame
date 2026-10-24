import { describe, expect, it } from 'vitest';
import {
  act,
  cash,
  expectError,
  landOn,
  newGame,
  patchPlayer,
  player,
  rigDice,
} from './test/helpers';
import type { GameState } from './types';

function jailed(state: GameState, patch = {}): GameState {
  return patchPlayer(state, 'p1', { inJail: true, position: 10, ...patch });
}

describe('Gefängnis', () => {
  it('Feld „Ab ins Gefängnis“ schickt ins Gefängnis und beendet den Pasch', () => {
    const { state, events } = landOn(newGame(), 'p1', 'ab-ins-gefaengnis', [3, 3]);
    expect(events).toContainEqual({ type: 'sentToJail', playerId: 'p1', reason: 'tile' });
    expect(player(state, 'p1')).toMatchObject({ inJail: true, position: 10 });
    expect(state.phase).toEqual({ name: 'freePhase', extraRoll: false });
  });

  it('„Nur zu Besuch“ hat keine Wirkung', () => {
    const { state } = landOn(newGame(), 'p1', 'gefaengnis');
    expect(player(state, 'p1').inJail).toBe(false);
    expect(cash(state, 'p1')).toBe(1500);
  });

  it('verlässt das Gefängnis mit einem Pasch ohne Extrawurf', () => {
    const state = rigDice(jailed(newGame()), [[4, 4]]);
    const { state: next, events } = act(state, { type: 'ROLL_DICE', playerId: 'p1' });
    expect(events).toContainEqual({ type: 'leftJail', playerId: 'p1', method: 'doubles' });
    expect(player(next, 'p1')).toMatchObject({ inJail: false, position: 18 });
    expect(next.phase).toMatchObject({ extraRoll: false });
  });

  it('bleibt nach einem Fehlwurf im Gefängnis', () => {
    const state = rigDice(jailed(newGame()), [[1, 2]]);
    const { state: next } = act(state, { type: 'ROLL_DICE', playerId: 'p1' });
    expect(player(next, 'p1')).toMatchObject({ inJail: true, position: 10, jailAttempts: 1 });
    expect(next.phase).toEqual({ name: 'freePhase', extraRoll: false });
  });

  it('muss nach dem letzten Fehlversuch Kaution zahlen und zieht dann', () => {
    const state = rigDice(jailed(newGame(), { jailAttempts: 2 }), [[1, 2]]);
    const { state: next, events } = act(state, { type: 'ROLL_DICE', playerId: 'p1' });
    expect(events).toContainEqual({ type: 'leftJail', playerId: 'p1', method: 'forcedBail' });
    expect(player(next, 'p1')).toMatchObject({ inJail: false, position: 13 });
    expect(cash(next, 'p1')).toBe(1450);
  });

  it('richtet sich nach maxTurns und der Kautionshöhe', () => {
    const rules = { jail: { maxTurns: 1, bail: 80 } };
    const state = rigDice(jailed(newGame({ rules })), [[1, 2]]);
    const { state: next } = act(state, { type: 'ROLL_DICE', playerId: 'p1' });
    expect(cash(next, 'p1')).toBe(1420);
  });

  it('zieht nach erzwungener Kaution erst, wenn die Schuld beglichen ist', () => {
    let state = rigDice(jailed(newGame(), { jailAttempts: 2, cash: 20 }), [[1, 2]]);
    state = {
      ...state,
      tiles: { ...state.tiles, fischergasse: { owner: 'p1', buildings: 0, mortgaged: false } },
    };
    state = act(state, { type: 'ROLL_DICE', playerId: 'p1' }).state;
    expect(state.phase).toEqual({
      name: 'awaitingDebt',
      resume: { kind: 'moveAfterBail', steps: 3 },
    });
    state = act(state, { type: 'MORTGAGE', playerId: 'p1', tileId: 'fischergasse' }).state;
    state = act(state, { type: 'PAY_DEBT', playerId: 'p1' }).state;
    expect(player(state, 'p1')).toMatchObject({ position: 13, cash: 0 });
    expect(state.phase).toMatchObject({ name: 'awaitingPurchase', tileId: 'fliederhof' });
  });

  it('zahlt freiwillig Kaution und würfelt dann normal', () => {
    let state = jailed(newGame());
    state = act(state, { type: 'PAY_BAIL', playerId: 'p1' }).state;
    expect(player(state, 'p1')).toMatchObject({ inJail: false, cash: 1450 });
    expect(state.phase).toEqual({ name: 'awaitingRoll' });
    state = rigDice(state, [[2, 2]]);
    state = act(state, { type: 'ROLL_DICE', playerId: 'p1' }).state;
    expect(state.phase).toMatchObject({ extraRoll: true });
  });

  it('lehnt Kaution ohne genug Geld und außerhalb des Gefängnisses ab', () => {
    expectError(
      jailed(newGame(), { cash: 10 }),
      { type: 'PAY_BAIL', playerId: 'p1' },
      'insufficientFunds',
    );
    expectError(newGame(), { type: 'PAY_BAIL', playerId: 'p1' }, 'notInJail');
  });

  it('nutzt eine Gefängnis-frei-Karte und legt sie zurück', () => {
    let state = jailed(newGame(), { jailFreeCards: [{ deckId: 'glueck', cardId: 'frei' }] });
    state = {
      ...state,
      decks: {
        ...state.decks,
        glueck: { drawPile: state.decks.glueck!.drawPile.filter((c) => c !== 'frei') },
      },
    };
    const { state: next } = act(state, { type: 'USE_JAIL_CARD', playerId: 'p1' });
    expect(player(next, 'p1')).toMatchObject({ inJail: false, jailFreeCards: [], cash: 1500 });
    expect(next.decks.glueck?.drawPile.at(-1)).toBe('frei');
    expectError(jailed(newGame()), { type: 'USE_JAIL_CARD', playerId: 'p1' }, 'noJailFreeCard');
  });
});
