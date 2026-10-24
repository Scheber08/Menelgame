import { describe, expect, it } from 'vitest';
import {
  cash,
  give,
  landOn,
  newGame,
  patchPlayer,
  patchTiles,
  player,
  position,
  stackDeck,
} from './test/helpers';
import type { GameState } from './types';

/** p1 landet auf Glückskarte 1 (Feld 7) und zieht die gewünschte Karte. */
function drawGlueck(state: GameState, cardId: string, dice: number[] = [2, 3]) {
  return landOn(stackDeck(state, 'glueck', cardId), 'p1', 'glueck-1', dice);
}

function drawStadtkasse(state: GameState, cardId: string) {
  return landOn(stackDeck(state, 'stadtkasse', cardId), 'p1', 'stadtkasse-2');
}

describe('Ereigniskarten', () => {
  it('protokolliert die Karte und legt sie unter den Stapel', () => {
    const { state, events } = drawGlueck(newGame(), 'dividende');
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'cardDrawn', deckId: 'glueck', cardId: 'dividende' }),
    );
    expect(state.decks.glueck?.drawPile.at(-1)).toBe('dividende');
    expect(cash(state, 'p1')).toBe(1550);
  });

  it('zahlt Strafen an die Bank bzw. in den Topf', () => {
    expect(cash(drawGlueck(newGame(), 'falschparker').state, 'p1')).toBe(1485);
    const pot = drawGlueck(newGame({ rules: { freeParkingPot: true } }), 'falschparker').state;
    expect(pot.freeParkingPot).toBe(15);
  });

  it('kassiert von jedem Mitspieler', () => {
    const { state } = drawStadtkasse(newGame({ players: 3 }), 'geburtstag');
    expect(state.players.map((p) => p.cash)).toEqual([1520, 1490, 1490]);
  });

  it('zahlt jedem Mitspieler', () => {
    const { state } = drawGlueck(newGame({ players: 3 }), 'vorsitz');
    expect(state.players.map((p) => p.cash)).toEqual([1400, 1550, 1550]);
  });

  it('zieht zu einem Feld und zahlt beim Überqueren den Los-Bonus', () => {
    const { state } = drawGlueck(newGame(), 'zum-start');
    expect(player(state, 'p1').position).toBe(0);
    expect(cash(state, 'p1')).toBe(1700);

    const later = landOn(stackDeck(newGame(), 'glueck', 'orchester'), 'p1', 'glueck-3').state;
    expect(player(later, 'p1').position).toBe(position(later, 'orchesterring'));
    expect(cash(later, 'p1')).toBe(1700);
    expect(later.phase).toMatchObject({ name: 'awaitingPurchase', tileId: 'orchesterring' });
  });

  it('geht Felder zurück ohne Los-Bonus', () => {
    const { state } = drawGlueck(newGame(), 'zurueck');
    expect(player(state, 'p1').position).toBe(4);
    expect(cash(state, 'p1')).toBe(1300); // Grundsteuer
  });

  it('zieht zum nächsten Bahnhof und zahlt doppelte Miete', () => {
    const state = give(newGame(), 'p2', 'faehrhafen');
    const { state: next } = drawGlueck(state, 'naechste-station');
    expect(player(next, 'p1').position).toBe(position(next, 'faehrhafen'));
    expect(cash(next, 'p2')).toBe(1550);
  });

  it('zieht zum nächsten Versorger und zahlt das Zehnfache des Wurfs', () => {
    const state = give(newGame(), 'p2', 'kraftwerk');
    const { state: next } = drawGlueck(state, 'naechster-versorger', [2, 3]);
    expect(player(next, 'p1').position).toBe(position(next, 'kraftwerk'));
    expect(cash(next, 'p2')).toBe(1550);
  });

  it('schickt ins Gefängnis ohne Los-Bonus', () => {
    const { state } = drawGlueck(newGame(), 'gefaengnis');
    expect(player(state, 'p1')).toMatchObject({ inJail: true, position: 10, cash: 1500 });
  });

  it('behält Gefängnis-frei-Karten beim Spieler', () => {
    const { state } = drawGlueck(newGame(), 'frei');
    expect(player(state, 'p1').jailFreeCards).toEqual([{ deckId: 'glueck', cardId: 'frei' }]);
    expect(state.decks.glueck?.drawPile).not.toContain('frei');
  });

  it('berechnet Renovierungen pro Haus und Hotel', () => {
    let state = give(newGame(), 'p1', 'schilfweg', 'weidenufer', 'moewenkai');
    state = patchTiles(state, {
      schilfweg: { buildings: 2 },
      weidenufer: { buildings: 1 },
      moewenkai: { buildings: 5 },
    });
    const { state: next } = drawGlueck(state, 'renovierung');
    expect(cash(next, 'p1')).toBe(1500 - 3 * 25 - 100);
  });

  it('verursacht Schulden, wenn das Geld nicht reicht', () => {
    const state = patchPlayer(newGame(), 'p1', { cash: 10 });
    const { state: next } = drawStadtkasse(state, 'kurklinik');
    expect(next.phase).toMatchObject({ name: 'awaitingDebt' });
    expect(next.debts).toEqual([{ debtor: 'p1', creditor: 'bank', amount: 100, reason: 'card' }]);
  });

  it('meldet einen leeren Stapel', () => {
    let state = newGame();
    state = { ...state, decks: { ...state.decks, glueck: { drawPile: [] } } };
    const { events } = landOn(state, 'p1', 'glueck-1');
    expect(events).toContainEqual({ type: 'deckEmpty', playerId: 'p1', deckId: 'glueck' });
  });
});
