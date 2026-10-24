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
  player,
  stackDeck,
} from './test/helpers';
import type { GameState } from './types';

/** p1 hat 5 Geld und landet auf Schilfweg mit Hotel von p2 (Miete 560). */
function deepInDebt(options: Parameters<typeof newGame>[0] = {}): GameState {
  let state = give(newGame(options), 'p2', 'schilfweg', 'weidenufer', 'moewenkai');
  state = patchTiles(state, { schilfweg: { buildings: 5 } });
  state = patchPlayer(state, 'p1', { cash: 5 });
  return landOn(state, 'p1', 'schilfweg').state;
}

describe('Schulden', () => {
  it('wechselt in awaitingDebt, wenn die Miete nicht bezahlt werden kann', () => {
    const state = deepInDebt();
    expect(state.phase).toEqual({
      name: 'awaitingDebt',
      resume: { kind: 'freePhase', extraRoll: false },
    });
    expect(state.debts).toEqual([{ debtor: 'p1', creditor: 'p2', amount: 560, reason: 'rent' }]);
    expectError(state, { type: 'PAY_DEBT', playerId: 'p1' }, 'insufficientFunds');
    expectError(state, { type: 'END_TURN', playerId: 'p1' }, 'wrongPhase');
    expectError(state, { type: 'BUILD', playerId: 'p1', tileId: 'x' }, 'wrongPhase');
  });

  it('begleicht Schulden nach einer Hypothek und macht weiter', () => {
    let state = give(newGame(), 'p2', 'schilfweg');
    state = give(state, 'p1', 'kristallhoehe');
    state = patchPlayer(state, 'p1', { cash: 2 });
    state = landOn(state, 'p1', 'schilfweg').state;
    state = act(state, { type: 'MORTGAGE', playerId: 'p1', tileId: 'kristallhoehe' }).state;
    const { state: paid, events } = act(state, { type: 'PAY_DEBT', playerId: 'p1' });
    expect(events).toContainEqual({ type: 'debtPaid', debtor: 'p1', creditor: 'p2', amount: 7 });
    expect(cash(paid, 'p1')).toBe(195);
    expect(cash(paid, 'p2')).toBe(1507);
    expect(paid.phase).toEqual({ name: 'freePhase', extraRoll: false });
  });

  it('lässt Mitspieler ihre Schulden selbst begleichen', () => {
    let state = patchPlayer(newGame({ players: 3 }), 'p2', { cash: 0 });
    state = give(state, 'p2', 'kristallhoehe');
    state = landOn(stackDeck(state, 'stadtkasse', 'geburtstag'), 'p1', 'stadtkasse-2').state;
    expect(state.debts.map((d) => d.debtor)).toEqual(['p2']);
    expectError(state, { type: 'MORTGAGE', playerId: 'p1', tileId: 'x' }, 'notYourTurn');
    state = act(state, { type: 'MORTGAGE', playerId: 'p2', tileId: 'kristallhoehe' }).state;
    state = act(state, { type: 'PAY_DEBT', playerId: 'p2' }).state;
    expect(cash(state, 'p1')).toBe(1520);
    expect(state.phase).toEqual({ name: 'freePhase', extraRoll: false });
    expect(state.currentPlayer).toBe(0);
  });
});

describe('Bankrott', () => {
  it('übergibt Besitz und Bargeld an den Gläubiger', () => {
    let state = give(deepInDebt({ players: 3 }), 'p1', 'busbahnhof', 'kristallhoehe');
    state = patchTiles(state, { kristallhoehe: { mortgaged: true } });
    state = patchPlayer(state, 'p1', { jailFreeCards: [{ deckId: 'glueck', cardId: 'frei' }] });
    const { state: next, events } = act(state, { type: 'DECLARE_BANKRUPTCY', playerId: 'p1' });
    expect(events).toContainEqual({ type: 'bankrupt', playerId: 'p1', creditor: 'p2' });
    expect(player(next, 'p1')).toMatchObject({ bankrupt: true, cash: 0, jailFreeCards: [] });
    expect(cash(next, 'p2')).toBe(1505);
    expect(next.tiles.busbahnhof?.owner).toBe('p2');
    expect(next.tiles.kristallhoehe).toEqual({ owner: 'p2', buildings: 0, mortgaged: true });
    expect(player(next, 'p2').jailFreeCards).toHaveLength(1);
    expect(next.currentPlayer).toBe(1);
    expect(next.phase).toEqual({ name: 'awaitingRoll' });
  });

  it('verkauft Gebäude des Bankrotten an die Bank', () => {
    let state = give(deepInDebt({ players: 3 }), 'p1', 'rosenbogen', 'fliederhof', 'lavendelplatz');
    state = patchTiles(state, {
      rosenbogen: { buildings: 2 },
      fliederhof: { buildings: 2 },
      lavendelplatz: { buildings: 5 },
    });
    state = { ...state, bank: { houses: 10, hotels: 5 } };
    const next = act(state, { type: 'DECLARE_BANKRUPTCY', playerId: 'p1' }).state;
    expect(next.tiles.rosenbogen).toEqual({ owner: 'p2', buildings: 0, mortgaged: false });
    expect(next.bank).toEqual({ houses: 14, hotels: 6 });
    // 5 + (2 + 2 + 5) × 50 Erlös
    expect(cash(next, 'p2')).toBe(1500 + 5 + 450);
  });

  it('gibt bei Schulden an die Bank alles an die Bank zurück', () => {
    let state = patchPlayer(newGame({ players: 3 }), 'p1', {
      cash: 50,
      jailFreeCards: [{ deckId: 'glueck', cardId: 'frei' }],
    });
    state = give(state, 'p1', 'busbahnhof');
    state = patchTiles(state, { busbahnhof: { mortgaged: true } });
    state = landOn(state, 'p1', 'grundsteuer', [1, 3]).state;
    const next = act(state, { type: 'DECLARE_BANKRUPTCY', playerId: 'p1' }).state;
    expect(next.tiles.busbahnhof).toEqual({ owner: null, buildings: 0, mortgaged: false });
    expect(next.decks.glueck?.drawPile.at(-1)).toBe('frei');
    expect(cash(next, 'p2')).toBe(1500);
  });

  it('versteigert im Modus auction die Felder des Bankrotten', () => {
    const state = give(
      deepInDebt({ players: 3, rules: { bankruptcy: { mode: 'auction' } } }),
      'p1',
      'busbahnhof',
    );
    const { state: next, events } = act(state, { type: 'DECLARE_BANKRUPTCY', playerId: 'p1' });
    expect(events).toContainEqual({ type: 'auctionStarted', tileId: 'busbahnhof' });
    expect(next.phase).toEqual({ name: 'auction' });
    expect(next.auction).toMatchObject({ tileId: 'busbahnhof', then: { kind: 'advanceTurn' } });
    expect(next.tiles.busbahnhof?.owner).toBeNull();
    expect(cash(next, 'p2')).toBe(1505);
    // p2 ersteigert die Station, danach ist p2 am Zug.
    let s = act(next, { type: 'AUCTION_BID', playerId: 'p2', amount: 120 }).state;
    s = act(s, { type: 'AUCTION_PASS', playerId: 'p3' }).state;
    expect(s.tiles.busbahnhof?.owner).toBe('p2');
    expect(s.currentPlayer).toBe(1);
    expect(s.phase).toEqual({ name: 'awaitingRoll' });
  });

  it('beendet das Spiel, wenn nur noch einer übrig ist', () => {
    const { state, events } = act(deepInDebt(), { type: 'DECLARE_BANKRUPTCY', playerId: 'p1' });
    expect(state.phase).toEqual({ name: 'gameOver', winner: 'p2' });
    expect(events.at(-1)).toMatchObject({ type: 'gameOver', winner: 'p2', reason: 'lastStanding' });
    expectError(state, { type: 'ROLL_DICE', playerId: 'p2' }, 'gameOver');
  });

  it('überspringt bankrotte Spieler bei der Zugreihenfolge', () => {
    let state = patchPlayer(newGame({ players: 3 }), 'p2', { bankrupt: true });
    state = { ...state, phase: { name: 'freePhase', extraRoll: false } };
    state = act(state, { type: 'END_TURN', playerId: 'p1' }).state;
    expect(state.currentPlayer).toBe(2);
  });
});
