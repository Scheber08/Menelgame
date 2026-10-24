import { mortgageValueOf, type OwnableTile, type PropertyTile } from '@menelgame/schema';
import { auctionHandlers, startAuctions } from './auction';
import { declareBankruptcy } from './bankruptcy';
import { charge, emit, transfer, type Ctx } from './context';
import {
  hasRules,
  moveForward,
  runCustomRules,
  runEffects,
  sendToJail,
  startResolution,
} from './effects';
import { engineError, type ActionHandler } from './handler';
import { hostHandlers } from './host';
import { nextInt } from './rng';
import {
  actingPlayerId,
  buildingRefund,
  currentPlayer,
  groupTiles,
  HOTEL,
  ownableById,
  ownsWholeGroup,
  requirePlayer,
  tileAt,
  tileState,
  unmortgageCost,
} from './selectors';
import { tradeHandlers } from './trade';
import { advanceTurn, extraRollOf, finishMovement, resume, settle, withChoice } from './turn';
import {
  isPlayerAction,
  type Action,
  type ActionType,
  type DiceRoll,
  type EngineError,
  type GameState,
  type Phase,
} from './types';

export { engineError };

function rollDice(state: GameState): DiceRoll {
  const dice = Array.from(
    { length: state.dice.count },
    () => 1 + nextInt(state.rng, state.dice.sides),
  );
  const total = dice.reduce((a, b) => a + b, 0);
  const isDouble = dice.length > 1 && dice.every((d) => d === dice[0]);
  return { dice, total, isDouble };
}

function requireOwnedTile(
  state: GameState,
  playerId: string,
  tileId: string,
): EngineError | OwnableTile {
  const tile = ownableById(state, tileId);
  if (!tile) return engineError('unknownTile');
  if (tileState(state, tileId).owner !== playerId) return engineError('notOwner');
  return tile;
}

function groupBuildings(state: GameState, tile: PropertyTile): number[] {
  return groupTiles(state, tile.group).map((t) => tileState(state, t.id).buildings);
}

const MANAGE_PHASES = ['awaitingRoll', 'awaitingPurchase', 'freePhase'] as const;
const LIQUIDATE_PHASES = [...MANAGE_PHASES, 'awaitingDebt'] as const;

const handlers: { [T in ActionType]: ActionHandler<T> } = {
  ROLL_DICE: {
    phases: ['awaitingRoll', 'freePhase'],
    validate: (state) =>
      state.phase.name === 'freePhase' && !state.phase.extraRoll ? engineError('wrongPhase') : null,
    execute: (ctx) => {
      const state = ctx.state;
      const p = currentPlayer(state);
      const roll = rollDice(state);
      state.lastRoll = roll;
      emit(ctx, { type: 'diceRolled', playerId: p.id, ...roll });
      const r = startResolution(ctx, p.id);

      if (p.inJail) {
        if (roll.isDouble) {
          p.inJail = false;
          p.jailAttempts = 0;
          emit(ctx, { type: 'leftJail', playerId: p.id, method: 'doubles' });
          moveForward(r, roll.total);
          finishMovement(r, false);
          return;
        }
        p.jailAttempts++;
        emit(ctx, { type: 'jailRollFailed', playerId: p.id, attempt: p.jailAttempts });
        if (p.jailAttempts < state.rules.jail.maxTurns) {
          settle(ctx, { kind: 'freePhase', extraRoll: false });
          return;
        }
        p.inJail = false;
        p.jailAttempts = 0;
        emit(ctx, { type: 'leftJail', playerId: p.id, method: 'forcedBail' });
        charge(ctx, p.id, 'bank', state.rules.jail.bail, 'bail');
        settle(ctx, { kind: 'moveAfterBail', steps: roll.total });
        return;
      }

      p.doublesInRow = roll.isDouble ? p.doublesInRow + 1 : 0;
      if (roll.isDouble && p.doublesInRow >= 3 && state.rules.tripleDoublesToJail) {
        sendToJail(r, 'tripleDoubles');
        settle(ctx, { kind: 'freePhase', extraRoll: false });
        return;
      }
      moveForward(r, roll.total);
      finishMovement(r, roll.isDouble);
    },
  },

  BUY: {
    phases: ['awaitingPurchase'],
    validate: (state) => {
      const phase = state.phase as Extract<Phase, { name: 'awaitingPurchase' }>;
      const tile = ownableById(state, phase.tileId);
      if (!tile) return engineError('unknownTile');
      return currentPlayer(state).cash < tile.price ? engineError('insufficientFunds') : null;
    },
    execute: (ctx, action) => {
      const phase = ctx.state.phase as Extract<Phase, { name: 'awaitingPurchase' }>;
      const tile = ownableById(ctx.state, phase.tileId)!;
      transfer(ctx, action.playerId, 'bank', tile.price, 'purchase');
      tileState(ctx.state, tile.id).owner = action.playerId;
      emit(ctx, {
        type: 'purchased',
        playerId: action.playerId,
        tileId: tile.id,
        price: tile.price,
      });
      ctx.state.phase = { name: 'freePhase', extraRoll: phase.extraRoll };
    },
  },

  DECLINE: {
    phases: ['awaitingPurchase'],
    execute: (ctx, action) => {
      const phase = ctx.state.phase as Extract<Phase, { name: 'awaitingPurchase' }>;
      emit(ctx, { type: 'purchaseDeclined', playerId: action.playerId, tileId: phase.tileId });
      const next = { kind: 'freePhase', extraRoll: phase.extraRoll } as const;
      if (ctx.state.rules.auctions) startAuctions(ctx, [phase.tileId], next);
      else resume(ctx, next);
    },
  },

  END_TURN: {
    phases: ['freePhase'],
    validate: (state) =>
      state.phase.name === 'freePhase' && state.phase.extraRoll
        ? engineError('mustRollAgain')
        : null,
    execute: (ctx) => {
      const state = ctx.state;
      const p = currentPlayer(state);
      const tile = tileAt(state, p.position);
      // Zugende-Regeln eigener Feldtypen laufen einmal pro Zug.
      if (
        state.turnEndHandled !== state.turn &&
        tile.type === 'custom' &&
        !state.blockedTiles[tile.id] &&
        hasRules(ctx, tile, 'turnEnd')
      ) {
        state.turnEndHandled = state.turn;
        const r = startResolution(ctx, p.id);
        runCustomRules(r, tile, 'turnEnd');
        if (r.offer || r.choice || state.debts.length > 0) {
          settle(
            ctx,
            withChoice(
              r,
              r.offer
                ? { kind: 'awaitingPurchase', tileId: r.offer, extraRoll: false }
                : { kind: 'freePhase', extraRoll: false },
            ),
          );
          return;
        }
      }
      advanceTurn(ctx);
    },
  },

  CHOOSE: {
    phases: ['awaitingChoice'],
    validate: (state, action) => {
      const phase = state.phase as Extract<Phase, { name: 'awaitingChoice' }>;
      return Number.isInteger(action.option) && phase.options[action.option]
        ? null
        : engineError('unknownOption');
    },
    execute: (ctx, action) => {
      const phase = ctx.state.phase as Extract<Phase, { name: 'awaitingChoice' }>;
      const option = phase.options[action.option]!;
      emit(ctx, {
        type: 'choiceMade',
        playerId: action.playerId,
        option: action.option,
        label: option.label,
      });
      const r = startResolution(ctx, action.playerId);
      runEffects(r, option.effects);
      let next = phase.then;
      if (r.jailed && next.kind === 'freePhase') next = { kind: 'freePhase', extraRoll: false };
      if (r.offer)
        next = { kind: 'awaitingPurchase', tileId: r.offer, extraRoll: extraRollOf(next) };
      settle(ctx, next);
    },
  },

  PAY_BAIL: {
    phases: ['awaitingRoll'],
    validate: (state) => {
      const p = currentPlayer(state);
      if (!p.inJail) return engineError('notInJail');
      return p.cash < state.rules.jail.bail ? engineError('insufficientFunds') : null;
    },
    execute: (ctx, action) => {
      const p = requirePlayer(ctx.state, action.playerId);
      transfer(ctx, p.id, 'bank', ctx.state.rules.jail.bail, 'bail');
      p.inJail = false;
      p.jailAttempts = 0;
      emit(ctx, { type: 'leftJail', playerId: p.id, method: 'bail' });
    },
  },

  USE_JAIL_CARD: {
    phases: ['awaitingRoll'],
    validate: (state) => {
      const p = currentPlayer(state);
      if (!p.inJail) return engineError('notInJail');
      return p.jailFreeCards.length === 0 ? engineError('noJailFreeCard') : null;
    },
    execute: (ctx, action) => {
      const p = requirePlayer(ctx.state, action.playerId);
      const card = p.jailFreeCards.shift()!;
      ctx.state.decks[card.deckId]?.drawPile.push(card.cardId);
      p.inJail = false;
      p.jailAttempts = 0;
      emit(ctx, { type: 'leftJail', playerId: p.id, method: 'card' });
    },
  },

  BUILD: {
    phases: MANAGE_PHASES,
    validate: (state, action) => {
      const tile = requireOwnedTile(state, action.playerId, action.tileId);
      if ('code' in tile) return tile;
      if (tile.type !== 'property') return engineError('notBuildable');
      if (!ownsWholeGroup(state, action.playerId, tile.group))
        return engineError('incompleteGroup');
      if (groupTiles(state, tile.group).some((t) => tileState(state, t.id).mortgaged))
        return engineError('groupMortgaged');
      const current = tileState(state, tile.id).buildings;
      if (current >= HOTEL) return engineError('maxBuildings');
      if (state.rules.evenBuilding && current > Math.min(...groupBuildings(state, tile)))
        return engineError('unevenBuilding');
      if (requirePlayer(state, action.playerId).cash < tile.houseCost)
        return engineError('insufficientFunds');
      if (current === HOTEL - 1 && state.bank.hotels === 0) return engineError('bankOutOfHotels');
      if (current < HOTEL - 1 && state.bank.houses === 0) return engineError('bankOutOfHouses');
      return null;
    },
    execute: (ctx, action) => {
      const state = ctx.state;
      const tile = ownableById(state, action.tileId) as PropertyTile;
      const ts = tileState(state, tile.id);
      transfer(ctx, action.playerId, 'bank', tile.houseCost, 'build');
      ts.buildings++;
      if (ts.buildings === HOTEL) {
        if (state.bank.hotels !== null) state.bank.hotels--;
        if (state.bank.houses !== null) state.bank.houses += HOTEL - 1;
      } else if (state.bank.houses !== null) {
        state.bank.houses--;
      }
      emit(ctx, {
        type: 'built',
        playerId: action.playerId,
        tileId: tile.id,
        buildings: ts.buildings,
        cost: tile.houseCost,
      });
    },
  },

  SELL_BUILDING: {
    phases: LIQUIDATE_PHASES,
    validate: (state, action) => {
      const tile = requireOwnedTile(state, action.playerId, action.tileId);
      if ('code' in tile) return tile;
      if (tile.type !== 'property') return engineError('notBuildable');
      const current = tileState(state, tile.id).buildings;
      if (current === 0) return engineError('noBuildings');
      if (state.rules.evenBuilding && current < Math.max(...groupBuildings(state, tile)))
        return engineError('unevenBuilding');
      if (current === HOTEL && state.bank.houses !== null && state.bank.houses < HOTEL - 1)
        return engineError('bankOutOfHouses');
      return null;
    },
    execute: (ctx, action) => {
      const state = ctx.state;
      const tile = ownableById(state, action.tileId) as PropertyTile;
      const ts = tileState(state, tile.id);
      if (ts.buildings === HOTEL) {
        if (state.bank.hotels !== null) state.bank.hotels++;
        if (state.bank.houses !== null) state.bank.houses -= HOTEL - 1;
      } else if (state.bank.houses !== null) {
        state.bank.houses++;
      }
      ts.buildings--;
      const refund = buildingRefund(state, tile);
      transfer(ctx, 'bank', action.playerId, refund, 'sellBuilding');
      emit(ctx, {
        type: 'buildingSold',
        playerId: action.playerId,
        tileId: tile.id,
        buildings: ts.buildings,
        refund,
      });
    },
  },

  MORTGAGE: {
    phases: LIQUIDATE_PHASES,
    validate: (state, action) => {
      const tile = requireOwnedTile(state, action.playerId, action.tileId);
      if ('code' in tile) return tile;
      if (tileState(state, tile.id).mortgaged) return engineError('mortgaged');
      if (
        tile.type === 'property' &&
        groupTiles(state, tile.group).some((t) => tileState(state, t.id).buildings > 0)
      )
        return engineError('groupHasBuildings');
      return null;
    },
    execute: (ctx, action) => {
      const tile = ownableById(ctx.state, action.tileId)!;
      const amount = mortgageValueOf(tile);
      tileState(ctx.state, tile.id).mortgaged = true;
      transfer(ctx, 'bank', action.playerId, amount, 'mortgage');
      emit(ctx, { type: 'mortgaged', playerId: action.playerId, tileId: tile.id, amount });
    },
  },

  UNMORTGAGE: {
    phases: MANAGE_PHASES,
    validate: (state, action) => {
      const tile = requireOwnedTile(state, action.playerId, action.tileId);
      if ('code' in tile) return tile;
      if (!tileState(state, tile.id).mortgaged) return engineError('notMortgaged');
      if (requirePlayer(state, action.playerId).cash < unmortgageCost(state, tile))
        return engineError('insufficientFunds');
      return null;
    },
    execute: (ctx, action) => {
      const tile = ownableById(ctx.state, action.tileId)!;
      const amount = unmortgageCost(ctx.state, tile);
      tileState(ctx.state, tile.id).mortgaged = false;
      transfer(ctx, action.playerId, 'bank', amount, 'unmortgage');
      emit(ctx, { type: 'unmortgaged', playerId: action.playerId, tileId: tile.id, amount });
    },
  },

  PAY_DEBT: {
    phases: ['awaitingDebt'],
    validate: (state, action) => {
      const debt = state.debts[0]!;
      return requirePlayer(state, action.playerId).cash < debt.amount
        ? engineError('insufficientFunds')
        : null;
    },
    execute: (ctx) => {
      const state = ctx.state;
      const debt = state.debts.shift()!;
      transfer(ctx, debt.debtor, debt.creditor, debt.amount, debt.reason);
      emit(ctx, {
        type: 'debtPaid',
        debtor: debt.debtor,
        creditor: debt.creditor,
        amount: debt.amount,
      });
      if (state.debts.length === 0 && state.phase.name === 'awaitingDebt') {
        resume(ctx, state.phase.resume);
      }
    },
  },

  DECLARE_BANKRUPTCY: {
    phases: ['awaitingDebt'],
    execute: (ctx, action) => declareBankruptcy(ctx, action.playerId),
  },

  ...auctionHandlers,
  ...tradeHandlers,
  ...hostHandlers,
};

/** Prüft eine Aktion gegen den Zustand, ohne ihn zu verändern. */
export function validateAction(state: GameState, action: Action): EngineError | null {
  if (state.phase.name === 'gameOver') return engineError('gameOver');
  const handler = handlers[action.type] as ActionHandler<ActionType> | undefined;
  if (!handler) return engineError('wrongPhase');
  const actor = handler.actor ?? 'acting';
  if (actor === 'system') {
    if (isPlayerAction(action)) return engineError('wrongPhase');
  } else {
    if (!isPlayerAction(action)) return engineError('unknownPlayer');
    const player = state.players.find((p) => p.id === action.playerId);
    if (!player || player.bankrupt) return engineError('unknownPlayer');
    if (actor === 'acting' && actingPlayerId(state) !== action.playerId)
      return engineError('notYourTurn');
  }
  if (!handler.phases.includes(state.phase.name)) return engineError('wrongPhase');
  return handler.validate?.(state, action as never) ?? null;
}

export function executeAction(ctx: Ctx, action: Action): void {
  const handler = handlers[action.type] as ActionHandler<ActionType>;
  handler.execute(ctx, action as never);
}
