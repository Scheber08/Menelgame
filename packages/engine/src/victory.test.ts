import { describe, expect, it } from 'vitest';
import { netWorth, ranking } from './selectors';
import { act, give, newGame, patchPlayer, patchTiles } from './test/helpers';
import type { GameState } from './types';

function endTurn(state: GameState, playerId: string) {
  return act(
    { ...state, phase: { name: 'freePhase', extraRoll: false } },
    { type: 'END_TURN', playerId },
  );
}

describe('Siegbedingungen', () => {
  it('berechnet das Vermögen aus Geld, Feldern und Gebäuden', () => {
    let state = give(newGame(), 'p1', 'schilfweg', 'busbahnhof');
    state = patchTiles(state, { schilfweg: { buildings: 2 }, busbahnhof: { mortgaged: true } });
    expect(netWorth(state, 'p1')).toBe(1500 + 100 + 2 * 50 + (200 - 100));
  });

  it('endet nach der maximalen Rundenzahl mit dem höchsten Vermögen', () => {
    let state = newGame({ rules: { victory: { type: 'maxRounds', rounds: 1 } } });
    state = patchPlayer(state, 'p2', { cash: 1600 });
    state = endTurn(state, 'p1').state;
    const { state: over, events } = endTurn(state, 'p2');
    expect(over.phase).toEqual({ name: 'gameOver', winner: 'p2' });
    expect(events.at(-1)).toMatchObject({ type: 'gameOver', reason: 'maxRounds' });
  });

  it('endet, sobald jemand das Zielvermögen erreicht', () => {
    let state = newGame({ rules: { victory: { type: 'targetNetWorth', amount: 2000 } } });
    state = patchPlayer(state, 'p2', { cash: 2000 });
    const { state: over, events } = endTurn(state, 'p1');
    expect(over.phase).toEqual({ name: 'gameOver', winner: 'p2' });
    expect(events.at(-1)).toMatchObject({ type: 'gameOver', reason: 'targetNetWorth' });
  });

  it('sortiert die Rangliste stabil', () => {
    let state = newGame({ players: 3 });
    state = patchPlayer(state, 'p1', { bankrupt: true, cash: 9999 });
    expect(ranking(state).map((r) => r.playerId)).toEqual(['p2', 'p3', 'p1']);
  });
});
