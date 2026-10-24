import { DiceSchema, RulesSchema } from '@menelgame/schema';
import { eliminatePlayer } from './bankruptcy';
import { emit } from './context';
import { ALL_PHASES, engineError, type ActionHandler } from './handler';
import { HOTEL } from './selectors';
import type { GameState } from './types';

/** Gebaute Häuser und Hotels auf dem ganzen Brett. */
function builtBuildings(state: GameState) {
  let houses = 0;
  let hotels = 0;
  for (const ts of Object.values(state.tiles)) {
    if (ts.buildings === HOTEL) hotels++;
    else houses += ts.buildings;
  }
  return { houses, hotels };
}

/**
 * Host-Rechte als Systemaktionen. Brett und Feldtypen bleiben fix; nur Regelwerte und
 * Würfel lassen sich ändern. Die Änderung landet im Log und wird beim Replay mit angewandt.
 */
export const hostHandlers: {
  UPDATE_RULES: ActionHandler<'UPDATE_RULES'>;
  REMOVE_PLAYER: ActionHandler<'REMOVE_PLAYER'>;
} = {
  UPDATE_RULES: {
    actor: 'system',
    phases: ALL_PHASES,
    validate: (_state, action) =>
      RulesSchema.safeParse(action.rules).success && DiceSchema.safeParse(action.dice).success
        ? null
        : engineError('invalidRules'),
    execute: (ctx, action) => {
      const state = ctx.state;
      const rules = RulesSchema.parse(action.rules);
      const dice = DiceSchema.parse(action.dice);
      const changes = Object.keys(rules).filter(
        (key) =>
          JSON.stringify(rules[key as keyof typeof rules]) !==
          JSON.stringify(state.rules[key as keyof typeof rules]),
      );
      if (JSON.stringify(dice) !== JSON.stringify(state.dice)) changes.push('dice');

      // Neuer Gebäudevorrat: Limit minus bereits gebaute Gebäude.
      const built = builtBuildings(state);
      const { houses, hotels } = rules.buildingLimit;
      if (changes.includes('buildingLimit')) {
        state.bank = {
          houses: houses === null ? null : Math.max(0, houses - built.houses),
          hotels: hotels === null ? null : Math.max(0, hotels - built.hotels),
        };
      }
      state.rules = rules;
      state.dice = dice;
      emit(ctx, { type: 'rulesUpdated', changes });
    },
  },

  REMOVE_PLAYER: {
    actor: 'system',
    phases: ALL_PHASES,
    validate: (state, action) => {
      const target = state.players.find((p) => p.id === action.targetId);
      return target && !target.bankrupt ? null : engineError('unknownPlayer');
    },
    execute: (ctx, action) => eliminatePlayer(ctx, action.targetId, 'bank', 'removed'),
  },
};
