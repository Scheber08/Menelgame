import { standardPack } from '@menelgame/packs';
import { describe, expect, it } from 'vitest';
import { apply, getLegalActions } from './apply';
import { createGame } from './create';
import { createRng, nextFloat, nextInt, shuffle } from './rng';
import { act, deepFreeze, expectError, newGame, rigDice } from './test/helpers';

describe('Zufallsgenerator', () => {
  it('ist mit gleichem Seed reproduzierbar', () => {
    const a = createRng(123);
    const b = createRng(123);
    const seqA = Array.from({ length: 20 }, () => nextFloat(a));
    const seqB = Array.from({ length: 20 }, () => nextFloat(b));
    expect(seqA).toEqual(seqB);
    expect(seqA.every((x) => x >= 0 && x < 1)).toBe(true);
  });

  it('liefert alle Würfelseiten', () => {
    const rng = createRng(7);
    const seen = new Set(Array.from({ length: 500 }, () => nextInt(rng, 6)));
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('mischt als Permutation', () => {
    const items = Array.from({ length: 12 }, (_, i) => i);
    const mixed = shuffle(createRng(1), items);
    expect([...mixed].sort((a, b) => a - b)).toEqual(items);
    expect(mixed).not.toEqual(items);
  });
});

describe('Spielstart', () => {
  it('setzt Startgeld, Startfeld und erste Phase', () => {
    const state = newGame({ players: 3 });
    expect(state.players.map((p) => p.cash)).toEqual([1500, 1500, 1500]);
    expect(state.players.every((p) => p.position === 0)).toBe(true);
    expect(state.phase).toEqual({ name: 'awaitingRoll' });
    expect(state.round).toBe(1);
    expect(state.bank).toEqual({ houses: 32, hotels: 12 });
    expect(Object.keys(state.tiles)).toHaveLength(28);
  });

  it('mischt die Decks abhängig vom Seed', () => {
    const a = newGame({ seed: 1 });
    const b = newGame({ seed: 1 });
    const c = newGame({ seed: 2 });
    expect(a.decks).toEqual(b.decks);
    expect(a.decks).not.toEqual(c.decks);
  });

  it('übernimmt Regeln getrennt vom Pack', () => {
    const state = newGame({ rules: { startingCash: 2000 } });
    expect(state.rules.startingCash).toBe(2000);
    expect(state.pack.rules.startingCash).toBe(1500);
  });

  it('prüft Spielerzahl und IDs', () => {
    const p = (id: string) => ({ id, name: id, color: '#000000' });
    expect(() => createGame({ pack: standardPack, seed: 1, players: [p('a')] })).toThrow();
    expect(() =>
      createGame({
        pack: standardPack,
        seed: 1,
        players: Array.from({ length: 7 }, (_, i) => p(`p${i}`)),
      }),
    ).toThrow();
    expect(() => createGame({ pack: standardPack, seed: 1, players: [p('a'), p('a')] })).toThrow();
    expect(() =>
      createGame({ pack: standardPack, seed: 1, players: [p('a'), p('bank')] }),
    ).toThrow();
  });
});

describe('apply', () => {
  it('verändert den Eingabezustand nicht', () => {
    const state = deepFreeze(rigDice(newGame(), [[3, 4]]));
    const before = JSON.stringify(state);
    const result = apply(state, { type: 'ROLL_DICE', playerId: 'p1' });
    expect(result.ok).toBe(true);
    expect(JSON.stringify(state)).toBe(before);
    expect(result.state).not.toBe(state);
  });

  it('teilt das Pack zwischen den Zuständen', () => {
    const state = newGame();
    const { state: next } = act(state, { type: 'ROLL_DICE', playerId: 'p1' });
    expect(next.pack).toBe(state.pack);
  });

  it('lehnt Aktionen anderer Spieler ab', () => {
    expectError(newGame(), { type: 'ROLL_DICE', playerId: 'p2' }, 'notYourTurn');
  });

  it('lehnt unbekannte Spieler ab', () => {
    expectError(newGame(), { type: 'ROLL_DICE', playerId: 'niemand' }, 'unknownPlayer');
  });

  it('lehnt Aktionen in der falschen Phase ab', () => {
    const state = newGame();
    expectError(state, { type: 'END_TURN', playerId: 'p1' }, 'wrongPhase');
    expectError(state, { type: 'BUY', playerId: 'p1' }, 'wrongPhase');
    expectError(state, { type: 'PAY_DEBT', playerId: 'p1' }, 'wrongPhase');
  });

  it('zählt angewandte Aktionen', () => {
    const { state } = act(rigDice(newGame(), [[1, 2]]), { type: 'ROLL_DICE', playerId: 'p1' });
    expect(state.actionCount).toBe(1);
  });

  it('listet nur gültige Aktionen', () => {
    const state = newGame();
    expect(getLegalActions(state)).toEqual([{ type: 'ROLL_DICE', playerId: 'p1' }]);
  });
});
