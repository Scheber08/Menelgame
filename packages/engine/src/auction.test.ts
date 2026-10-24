import { describe, expect, it } from 'vitest';
import { getDefaultAction, getLegalActions } from './apply';
import { act, cash, expectError, landOn, newGame, patchPlayer, rigDice } from './test/helpers';
import type { GameState } from './types';

/** p1 landet auf dem Busbahnhof (200) und lehnt ab → Auktion unter drei Spielern. */
function auction(options: Parameters<typeof newGame>[0] = {}): GameState {
  const state = landOn(newGame({ players: 3, ...options }), 'p1', 'busbahnhof').state;
  return act(state, { type: 'DECLINE', playerId: 'p1' }).state;
}

const bid = (playerId: string, amount: number) =>
  ({ type: 'AUCTION_BID', playerId, amount }) as const;
const pass = (playerId: string) => ({ type: 'AUCTION_PASS', playerId }) as const;

describe('Auktion', () => {
  it('startet mit leerem Gebot und lässt alle Spieler bieten', () => {
    const state = auction();
    expect(state.auction).toEqual({
      tileId: 'busbahnhof',
      highestBid: 0,
      highestBidder: null,
      passed: [],
      queue: [],
      then: { kind: 'freePhase', extraRoll: false },
    });
    // Auch wer nicht am Zug ist, darf bieten.
    const next = act(state, bid('p3', 50)).state;
    expect(next.auction).toMatchObject({ highestBid: 50, highestBidder: 'p3' });
  });

  it('verlangt ein höheres Gebot, das man bezahlen kann', () => {
    const state = act(auction(), bid('p2', 50)).state;
    expectError(state, bid('p3', 50), 'bidTooLow');
    expectError(state, bid('p3', 0.5), 'bidTooLow');
    expectError(patchPlayer(state, 'p3', { cash: 60 }), bid('p3', 70), 'insufficientFunds');
  });

  it('erlaubt dem Höchstbietenden nicht auszusteigen', () => {
    const state = act(auction(), bid('p2', 50)).state;
    expectError(state, pass('p2'), 'highestBidder');
  });

  it('endet, sobald alle anderen ausgestiegen sind', () => {
    let state = act(auction(), bid('p2', 120)).state;
    state = act(state, pass('p1')).state;
    expectError(state, bid('p1', 130), 'alreadyPassed');
    const { state: done, events } = act(state, pass('p3'));
    expect(events).toContainEqual({
      type: 'auctionWon',
      playerId: 'p2',
      tileId: 'busbahnhof',
      amount: 120,
    });
    expect(done.tiles.busbahnhof?.owner).toBe('p2');
    expect(cash(done, 'p2')).toBe(1380);
    expect(done.auction).toBeNull();
    // Zurück zum Spieler am Zug.
    expect(done.phase).toEqual({ name: 'freePhase', extraRoll: false });
  });

  it('bleibt unverkauft, wenn alle aussteigen', () => {
    let state = auction();
    state = act(state, pass('p1')).state;
    state = act(state, pass('p2')).state;
    const { state: done, events } = act(state, pass('p3'));
    expect(events).toContainEqual({ type: 'auctionUnsold', tileId: 'busbahnhof' });
    expect(done.tiles.busbahnhof?.owner).toBeNull();
  });

  it('wird von der Uhr mit AUCTION_CLOSE beendet', () => {
    const state = act(auction(), bid('p3', 10)).state;
    expect(getDefaultAction(state)).toEqual({ type: 'AUCTION_CLOSE' });
    const { state: done } = act(state, { type: 'AUCTION_CLOSE' });
    expect(done.tiles.busbahnhof?.owner).toBe('p3');
    expect(cash(done, 'p3')).toBe(1490);
  });

  it('nimmt AUCTION_CLOSE nur als Systemaktion und nur während einer Auktion an', () => {
    expectError(newGame(), { type: 'AUCTION_CLOSE' }, 'wrongPhase');
  });

  it('behält den Extrawurf nach einem Pasch', () => {
    let state = rigDice(newGame({ players: 2 }), [[3, 3]]);
    state = act(state, { type: 'ROLL_DICE', playerId: 'p1' }).state;
    state = act(state, { type: 'DECLINE', playerId: 'p1' }).state;
    state = act(state, { type: 'AUCTION_CLOSE' }).state;
    expect(state.phase).toEqual({ name: 'freePhase', extraRoll: true });
  });

  it('sperrt Bauen, Handel und Zugende während der Auktion', () => {
    const state = auction();
    expectError(state, { type: 'END_TURN', playerId: 'p1' }, 'wrongPhase');
    expectError(
      state,
      {
        type: 'PROPOSE_TRADE',
        playerId: 'p1',
        to: 'p2',
        give: { cash: 10, tiles: [], jailFreeCards: 0 },
        receive: { cash: 0, tiles: [], jailFreeCards: 0 },
      },
      'wrongPhase',
    );
  });

  it('listet Gebot und Aussteigen für jeden Spieler', () => {
    const state = act(auction(), bid('p2', 30)).state;
    expect(getLegalActions(state, 'p3').map((a) => a.type)).toEqual([
      'AUCTION_PASS',
      'AUCTION_BID',
    ]);
    expect(getLegalActions(state, 'p3')).toContainEqual(bid('p3', 31));
    expect(getLegalActions(state, 'p2').map((a) => a.type)).toEqual(['AUCTION_BID']);
  });
});
