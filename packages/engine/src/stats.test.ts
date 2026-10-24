import { describe, expect, it } from 'vitest';
import { playerGameStats } from './stats';
import { act, give, landOn, newGame, patchTiles } from './test/helpers';
import type { GameEvent } from './types';

describe('Spielstatistik', () => {
  it('zählt Miete, Käufe, Gebäude, Gruppen und Rang aus den Ereignissen', () => {
    let state = give(newGame({ rules: { auctions: false } }), 'p2', 'schilfweg', 'weidenufer');
    state = patchTiles(state, { moewenkai: { owner: 'p2' } });
    const events: GameEvent[] = [];
    let step = landOn(state, 'p1', 'schilfweg');
    events.push(...step.events);
    state = act(
      { ...step.state, phase: { name: 'freePhase', extraRoll: false } },
      {
        type: 'END_TURN',
        playerId: 'p1',
      },
    ).state;
    step = act(state, { type: 'BUILD', playerId: 'p2', tileId: 'schilfweg' });
    events.push(...step.events);
    events.push({
      type: 'gameOver',
      winner: 'p2',
      reason: 'maxRounds',
      ranking: [
        { playerId: 'p2', netWorth: 2000 },
        { playerId: 'p1', netWorth: 1400 },
      ],
    });

    const p1 = playerGameStats(step.state, events, 'p1');
    const p2 = playerGameStats(step.state, events, 'p2');
    expect(p1).toMatchObject({ rank: 2, won: false, rentPaid: 14, players: 2 });
    expect(p2).toMatchObject({
      rank: 1,
      won: true,
      rentReceived: 14,
      housesBuilt: 1,
      completeGroups: 1,
    });
  });
});
