import { actingPlayerId, apply, createGame, replay, type Action } from '@menelgame/engine';
import { fantasyPack, wienPack } from '@menelgame/packs';
import type { BoardPack } from '@menelgame/schema';
import { describe, expect, it } from 'vitest';
import { decideBot, newBotMemory, type BotLevel } from './index';

function play(pack: BoardPack, levels: BotLevel[], seed: number) {
  const initial = createGame({
    pack,
    seed,
    players: levels.map((_, i) => ({ id: `p${i + 1}`, name: `Bot ${i + 1}`, color: '#000000' })),
  });
  const memories = new Map(initial.players.map((p) => [p.id, newBotMemory()]));
  const actions: Action[] = [];
  let state = initial;
  while (state.phase.name !== 'gameOver' && actions.length < 40_000) {
    const acting = actingPlayerId(state);
    const order = [acting, ...state.players.map((p) => p.id).filter((id) => id !== acting)];
    let action: Action | null = null;
    for (const id of order) {
      action = decideBot(state, id, levels[Number(id.slice(1)) - 1]!, memories.get(id));
      if (action) break;
    }
    action ??= state.phase.name === 'auction' ? { type: 'AUCTION_CLOSE' } : null;
    if (!action) throw new Error(`Hänger in ${state.phase.name}`);
    const result = apply(state, action);
    if (!result.ok) throw new Error(`${action.type}: ${result.error.code}`);
    actions.push(action);
    state = result.state;
  }
  return { initial, actions, state };
}

describe('Bots auf den mitgelieferten Packs', () => {
  it.each<[string, BoardPack, BotLevel[], number]>([
    ['Wien', wienPack, ['hard', 'medium', 'easy'], 51],
    ['Fantasy', fantasyPack, ['hard', 'medium', 'easy'], 52],
    ['Fantasy', fantasyPack, ['hard', 'hard'], 53],
  ])('%s: Spiel endet und lässt sich nachspielen', (_, pack, levels, seed) => {
    const game = play(pack, levels, seed);
    expect(game.state.phase.name).toBe('gameOver');
    expect(replay({ initial: game.initial, actions: game.actions }).state).toEqual(game.state);
  });

  it('Fantasy: Variablen und eigene Feldtypen kommen im Spiel vor', () => {
    const game = play(fantasyPack, ['medium', 'medium', 'medium'], 54);
    const { events } = replay({ initial: game.initial, actions: game.actions });
    const types = new Set(events.map((e) => e.type));
    expect(types).toContain('variableChanged');
    expect(types).toContain('tileEffect');
    expect(types).toContain('teleported');
  });
});
