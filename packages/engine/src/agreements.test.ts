import { describe, expect, it } from 'vitest';
import { replay } from './replay';
import { act, cash, expectError, give, landOn, newGame, patchPlayer } from './test/helpers';
import type { Action, AgreementTerm, GameState, PlayerAction, TradeBundle } from './types';

const bundle = (patch: Partial<TradeBundle> = {}): TradeBundle => ({
  cash: 0,
  tiles: [],
  jailFreeCards: 0,
  ...patch,
});

function propose(
  from: string,
  to: string,
  terms: AgreementTerm[],
  giveB: Partial<TradeBundle> = {},
  receiveB: Partial<TradeBundle> = {},
): PlayerAction {
  return {
    type: 'PROPOSE_TRADE',
    playerId: from,
    to,
    give: bundle(giveB),
    receive: bundle(receiveB),
    terms,
  };
}

/** Schlägt vor und lässt den Empfänger sofort annehmen. */
function agree(state: GameState, action: PlayerAction): GameState {
  if (action.type !== 'PROPOSE_TRADE') throw new Error('nur Angebote');
  const proposed = act(state, action).state;
  const trade = proposed.trades.at(-1)!;
  return act(proposed, { type: 'ACCEPT_TRADE', playerId: action.to, tradeId: trade.id }).state;
}

/** Beendet den aktuellen Zug ohne Würfeln (Phase direkt auf frei gesetzt). */
function endTurn(state: GameState): GameState {
  const current = state.players[state.currentPlayer]!;
  const free: GameState = { ...state, phase: { name: 'freePhase', extraRoll: false } };
  return act(free, { type: 'END_TURN', playerId: current.id }).state;
}

/** Spielt Züge, bis die nächste Runde beginnt. */
function endRound(state: GameState): GameState {
  const round = state.round;
  let s = state;
  while (s.round === round) s = endTurn(s);
  return s;
}

/** p1 besitzt den Busbahnhof (Miete 25). */
function market(players = 3): GameState {
  return give(newGame({ players, rules: { auctions: false } }), 'p1', 'busbahnhof');
}

describe('Vereinbarungen', () => {
  it('Mietfreiheit gilt für die vereinbarten Runden und endet dann', () => {
    let state = agree(
      market(),
      propose('p2', 'p1', [{ kind: 'rentFree', owner: 'p1', tiles: ['busbahnhof'], rounds: 1 }], {
        cash: 50,
      }),
    );
    expect(state.agreements).toEqual([
      {
        id: 'a1',
        term: { kind: 'rentFree', owner: 'p1', tiles: ['busbahnhof'], rounds: 1 },
        parties: ['p2', 'p1'],
        remainingRounds: 1,
      },
    ]);
    const before = cash(state, 'p2');
    const landed = landOn(endTurn(state), 'p2', 'busbahnhof');
    expect(landed.events).toContainEqual({
      type: 'noRent',
      playerId: 'p2',
      tileId: 'busbahnhof',
      why: 'agreement',
    });
    expect(cash(landed.state, 'p2')).toBe(before);
    // Andere zahlen weiter Miete.
    state = endRound(state);
    expect(state.agreements).toEqual([]);
    const later = landOn(endTurn(state), 'p2', 'busbahnhof');
    expect(cash(later.state, 'p2')).toBe(before - 25);
  });

  it('erlaubt Mietfreiheit auf einem Feld, das man im selben Tausch abgibt', () => {
    const sale = propose(
      'p1',
      'p2',
      [{ kind: 'rentFree', owner: 'p2', tiles: ['busbahnhof'], rounds: 3 }],
      { tiles: ['busbahnhof'] },
      { cash: 150 },
    );
    const state = agree(market(), sale);
    expect(state.tiles.busbahnhof!.owner).toBe('p2');
    expect(state.agreements[0]!.parties).toEqual(['p1', 'p2']);
    // Gewährender muss nach dem Tausch Besitzer sein.
    const wrong = propose(
      'p1',
      'p2',
      [{ kind: 'rentFree', owner: 'p1', tiles: ['busbahnhof'], rounds: 3 }],
      { tiles: ['busbahnhof'] },
    );
    expectError(market(), wrong, 'notOwner');
  });

  it('Ratenzahlung zahlt am Rundenende, notfalls als Schuld', () => {
    let state = agree(
      market(),
      propose(
        'p2',
        'p1',
        [{ kind: 'installments', payer: 'p2', amount: 100, rounds: 2 }],
        {},
        {
          cash: 150,
        },
      ),
    );
    const p1 = cash(state, 'p1');
    const p2 = cash(state, 'p2');
    state = endRound(state);
    expect(cash(state, 'p1')).toBe(p1 + 100);
    expect(cash(state, 'p2')).toBe(p2 - 100);
    expect(state.agreements[0]!.remainingRounds).toBe(1);

    state = patchPlayer(state, 'p2', { cash: 30 });
    state = endRound(state);
    expect(state.agreements).toEqual([]);
    expect(state.debts).toEqual([
      { debtor: 'p2', creditor: 'p1', amount: 100, reason: 'agreement' },
    ]);
    expect(state.phase.name).toBe('awaitingDebt');
  });

  it('Gewinnbeteiligung teilt die Miete; der Begünstigte zahlt selbst weniger', () => {
    const state = agree(
      market(),
      propose(
        'p1',
        'p2',
        [{ kind: 'profitShare', owner: 'p1', tiles: ['busbahnhof'], percent: 50, rounds: 5 }],
        {},
        { cash: 100 },
      ),
    );
    const before = state.players.map((p) => p.cash);
    const third = landOn(endTurn(endTurn(state)), 'p3', 'busbahnhof');
    expect(third.events).toContainEqual({
      type: 'rentShared',
      agreementId: 'a1',
      from: 'p3',
      to: 'p2',
      tileId: 'busbahnhof',
      amount: 12,
    });
    expect(cash(third.state, 'p1')).toBe(before[0]! + 13);
    expect(cash(third.state, 'p2')).toBe(before[1]! + 12);
    expect(cash(third.state, 'p3')).toBe(before[2]! - 25);

    const own = landOn(endTurn(state), 'p2', 'busbahnhof');
    expect(cash(own.state, 'p2')).toBe(before[1]! - 13);
    expect(cash(own.state, 'p1')).toBe(before[0]! + 13);
  });

  it('endet bei Bankrott eines Beteiligten', () => {
    let state = agree(
      market(),
      propose(
        'p2',
        'p1',
        [{ kind: 'installments', payer: 'p2', amount: 10, rounds: 5 }],
        {},
        {
          cash: 10,
        },
      ),
    );
    state = { ...state, debts: [{ debtor: 'p2', creditor: 'bank', amount: 5000, reason: 'tax' }] };
    state = { ...state, phase: { name: 'awaitingDebt', resume: { kind: 'awaitingRoll' } } };
    state = { ...state, currentPlayer: 1 };
    const { state: after, events } = act(state, { type: 'DECLARE_BANKRUPTCY', playerId: 'p2' });
    expect(after.agreements).toEqual([]);
    expect(events).toContainEqual({
      type: 'agreementEnded',
      agreementId: 'a1',
      reason: 'bankrupt',
    });
  });

  it('prüft Laufzeit, Beträge, Beteiligte und Anzahl', () => {
    const state = market();
    const term = (t: AgreementTerm) => propose('p2', 'p1', [t]);
    expectError(
      state,
      term({ kind: 'installments', payer: 'p2', amount: 10, rounds: 0 }),
      'invalidTrade',
    );
    expectError(
      state,
      term({ kind: 'installments', payer: 'p2', amount: 0, rounds: 2 }),
      'invalidTrade',
    );
    expectError(
      state,
      term({ kind: 'installments', payer: 'p3', amount: 10, rounds: 2 }),
      'notTradeParty',
    );
    expectError(
      state,
      term({ kind: 'profitShare', owner: 'p1', tiles: ['busbahnhof'], percent: 0, rounds: 2 }),
      'invalidTrade',
    );
    expectError(
      state,
      term({ kind: 'rentFree', owner: 'p1', tiles: ['start'], rounds: 2 }),
      'unknownTile',
    );
    const many = Array.from({ length: 4 }, () => ({
      kind: 'installments' as const,
      payer: 'p2',
      amount: 10,
      rounds: 2,
    }));
    expectError(state, propose('p2', 'p1', many), 'invalidTrade');
    // Nur Vereinbarungen ohne Geld oder Felder sind ein gültiges Angebot.
    expect(
      act(state, term({ kind: 'installments', payer: 'p2', amount: 10, rounds: 2 })).state.trades,
    ).toHaveLength(1);
  });

  it('verwirft Angebote, deren Vereinbarung hinfällig wird', () => {
    let state = act(
      market(),
      propose('p2', 'p1', [{ kind: 'rentFree', owner: 'p1', tiles: ['busbahnhof'], rounds: 2 }], {
        cash: 10,
      }),
    ).state;
    state = agree(state, propose('p1', 'p3', [], { tiles: ['busbahnhof'] }, { cash: 200 }));
    expect(state.trades).toEqual([]);
  });

  it('läuft im Replay identisch', () => {
    const initial = market();
    const actions: Action[] = [
      propose(
        'p2',
        'p1',
        [{ kind: 'installments', payer: 'p2', amount: 40, rounds: 3 }],
        {},
        {
          cash: 100,
        },
      ),
      { type: 'ACCEPT_TRADE', playerId: 'p1', tradeId: 't1' },
    ];
    let state = initial;
    for (const a of actions) state = act(state, a).state;
    expect(replay({ initial, actions }).state).toEqual(state);
  });
});
