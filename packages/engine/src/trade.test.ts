import { describe, expect, it } from 'vitest';
import { getLegalActions } from './apply';
import {
  act,
  cash,
  expectError,
  give,
  newGame,
  patchPlayer,
  patchTiles,
  player,
} from './test/helpers';
import type { GameState, PlayerAction, TradeBundle } from './types';

const bundle = (patch: Partial<TradeBundle> = {}): TradeBundle => ({
  cash: 0,
  tiles: [],
  jailFreeCards: 0,
  ...patch,
});

function propose(
  from: string,
  to: string,
  giveB: Partial<TradeBundle>,
  receiveB: Partial<TradeBundle>,
): PlayerAction {
  return {
    type: 'PROPOSE_TRADE',
    playerId: from,
    to,
    give: bundle(giveB),
    receive: bundle(receiveB),
  };
}

/** p1 besitzt Schilfweg, p2 Weidenufer und Busbahnhof. */
function market(): GameState {
  let state = newGame({ players: 3 });
  state = give(state, 'p1', 'schilfweg');
  state = give(state, 'p2', 'weidenufer', 'busbahnhof');
  return state;
}

describe('Handel', () => {
  it('legt ein Angebot an und führt es beim Annehmen aus', () => {
    let state = act(
      market(),
      propose('p1', 'p2', { cash: 150, tiles: ['schilfweg'] }, { tiles: ['weidenufer'] }),
    ).state;
    expect(state.trades).toEqual([
      {
        id: 't1',
        from: 'p1',
        to: 'p2',
        give: bundle({ cash: 150, tiles: ['schilfweg'] }),
        receive: bundle({ tiles: ['weidenufer'] }),
        terms: [],
        counterTo: null,
      },
    ]);
    const { state: done, events } = act(state, {
      type: 'ACCEPT_TRADE',
      playerId: 'p2',
      tradeId: 't1',
    });
    state = done;
    expect(state.tiles.schilfweg?.owner).toBe('p2');
    expect(state.tiles.weidenufer?.owner).toBe('p1');
    expect(cash(state, 'p1')).toBe(1350);
    expect(cash(state, 'p2')).toBe(1650);
    expect(state.trades).toEqual([]);
    expect(events).toContainEqual({ type: 'tradeAccepted', tradeId: 't1', from: 'p1', to: 'p2' });
  });

  it('ist auch für Spieler möglich, die nicht am Zug sind', () => {
    const state = act(
      market(),
      propose('p2', 'p3', { tiles: ['busbahnhof'] }, { cash: 220 }),
    ).state;
    const done = act(state, { type: 'ACCEPT_TRADE', playerId: 'p3', tradeId: 't1' }).state;
    expect(done.tiles.busbahnhof?.owner).toBe('p3');
  });

  it('überträgt Gefängnis-frei-Karten', () => {
    let state = patchPlayer(market(), 'p1', {
      jailFreeCards: [{ deckId: 'glueck', cardId: 'frei' }],
    });
    state = act(state, propose('p1', 'p2', { jailFreeCards: 1 }, { cash: 40 })).state;
    state = act(state, { type: 'ACCEPT_TRADE', playerId: 'p2', tradeId: 't1' }).state;
    expect(player(state, 'p2').jailFreeCards).toEqual([{ deckId: 'glueck', cardId: 'frei' }]);
    expect(player(state, 'p1').jailFreeCards).toEqual([]);
  });

  it('prüft Besitz, Geld, Karten und Gebäude', () => {
    const state = market();
    expectError(state, propose('p1', 'p2', { tiles: ['weidenufer'] }, {}), 'notOwner');
    expectError(state, propose('p1', 'p2', { cash: 5000 }, {}), 'insufficientFunds');
    expectError(state, propose('p1', 'p2', { jailFreeCards: 1 }, {}), 'noJailFreeCard');
    expectError(state, propose('p1', 'p2', { tiles: ['start'] }, {}), 'unknownTile');
    expectError(state, propose('p1', 'p2', {}, {}), 'invalidTrade');
    expectError(state, propose('p1', 'p1', { cash: 1 }, {}), 'invalidTrade');
    expectError(state, propose('p1', 'p2', { cash: -5 }, {}), 'invalidTrade');
    const built = patchTiles(give(state, 'p1', 'weidenufer', 'moewenkai'), {
      moewenkai: { buildings: 1 },
    });
    expectError(built, propose('p1', 'p2', { tiles: ['schilfweg'] }, {}), 'groupHasBuildings');
  });

  it('lässt nur den Empfänger annehmen oder ablehnen und nur den Absender zurückziehen', () => {
    const state = act(market(), propose('p1', 'p2', { cash: 10 }, { tiles: ['busbahnhof'] })).state;
    expectError(state, { type: 'ACCEPT_TRADE', playerId: 'p3', tradeId: 't1' }, 'notTradeParty');
    expectError(state, { type: 'ACCEPT_TRADE', playerId: 'p1', tradeId: 't1' }, 'notTradeParty');
    expectError(state, { type: 'CANCEL_TRADE', playerId: 'p2', tradeId: 't1' }, 'notTradeParty');
    expectError(state, { type: 'ACCEPT_TRADE', playerId: 'p2', tradeId: 'x' }, 'unknownTrade');

    const rejected = act(state, { type: 'REJECT_TRADE', playerId: 'p2', tradeId: 't1' });
    expect(rejected.state.trades).toEqual([]);
    expect(rejected.events).toEqual([{ type: 'tradeRejected', tradeId: 't1', by: 'p2' }]);

    const cancelled = act(state, { type: 'CANCEL_TRADE', playerId: 'p1', tradeId: 't1' });
    expect(cancelled.events).toEqual([
      { type: 'tradeCancelled', tradeId: 't1', reason: 'withdrawn' },
    ]);
  });

  it('ersetzt ein Angebot durch ein Gegenangebot', () => {
    let state = act(market(), propose('p1', 'p2', { cash: 100 }, { tiles: ['busbahnhof'] })).state;
    state = act(state, {
      type: 'COUNTER_TRADE',
      playerId: 'p2',
      tradeId: 't1',
      give: bundle({ tiles: ['busbahnhof'] }),
      receive: bundle({ cash: 180 }),
    }).state;
    expect(state.trades).toEqual([
      {
        id: 't2',
        from: 'p2',
        to: 'p1',
        give: bundle({ tiles: ['busbahnhof'] }),
        receive: bundle({ cash: 180 }),
        terms: [],
        counterTo: 't1',
      },
    ]);
    state = act(state, { type: 'ACCEPT_TRADE', playerId: 'p1', tradeId: 't2' }).state;
    expect(state.tiles.busbahnhof?.owner).toBe('p1');
    expect(cash(state, 'p1')).toBe(1320);
  });

  it('prüft beim Annehmen erneut und räumt ungültige Angebote auf', () => {
    let state = market();
    state = act(state, propose('p1', 'p2', { cash: 100 }, { tiles: ['busbahnhof'] })).state;
    state = act(state, propose('p3', 'p2', { cash: 120 }, { tiles: ['busbahnhof'] })).state;
    // Nach dem ersten Tausch gehört der Busbahnhof p1 – das zweite Angebot ist hinfällig.
    const { state: done, events } = act(state, {
      type: 'ACCEPT_TRADE',
      playerId: 'p2',
      tradeId: 't1',
    });
    expect(done.trades).toEqual([]);
    expect(events).toContainEqual({ type: 'tradeCancelled', tradeId: 't2', reason: 'invalid' });

    expectError(
      patchPlayer(state, 'p1', { cash: 50 }),
      { type: 'ACCEPT_TRADE', playerId: 'p2', tradeId: 't1' },
      'insufficientFunds',
    );
  });

  it('übergibt Felder mit Hypothek unverändert', () => {
    let state = patchTiles(market(), { busbahnhof: { mortgaged: true } });
    state = act(state, propose('p1', 'p2', { cash: 50 }, { tiles: ['busbahnhof'] })).state;
    state = act(state, { type: 'ACCEPT_TRADE', playerId: 'p2', tradeId: 't1' }).state;
    expect(state.tiles.busbahnhof).toEqual({ owner: 'p1', buildings: 0, mortgaged: true });
  });

  it('hilft in der Schuldenphase und listet Antworten als legale Aktionen', () => {
    let state = act(market(), propose('p3', 'p2', { cash: 200 }, { tiles: ['busbahnhof'] })).state;
    state = {
      ...state,
      phase: { name: 'awaitingDebt', resume: { kind: 'freePhase', extraRoll: false } },
    };
    state = { ...state, debts: [{ debtor: 'p2', creditor: 'bank', amount: 1600, reason: 'tax' }] };
    expect(getLegalActions(state, 'p2').map((a) => a.type)).toEqual(
      expect.arrayContaining(['ACCEPT_TRADE', 'REJECT_TRADE', 'MORTGAGE']),
    );
    state = act(state, { type: 'ACCEPT_TRADE', playerId: 'p2', tradeId: 't1' }).state;
    expect(cash(state, 'p2')).toBe(1700);
    state = act(state, { type: 'PAY_DEBT', playerId: 'p2' }).state;
    expect(state.phase).toEqual({ name: 'freePhase', extraRoll: false });
  });

  it('löscht Angebote eines ausgeschiedenen Spielers', () => {
    let state = act(market(), propose('p3', 'p2', { cash: 10 }, { tiles: ['busbahnhof'] })).state;
    state = act(state, { type: 'REMOVE_PLAYER', targetId: 'p3' }).state;
    expect(state.trades).toEqual([]);
  });
});
