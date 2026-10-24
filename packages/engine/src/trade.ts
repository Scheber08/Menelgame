import { isOwnable } from '@menelgame/schema';
import { MAX_AGREEMENTS, startAgreements, validateTerms } from './agreements';
import { emit, transfer, type Ctx } from './context';
import { engineError, type ActionHandler } from './handler';
import { getPlayer, groupTiles, requirePlayer, tileById, tileState } from './selectors';
import type {
  AgreementTerm,
  EngineError,
  GameState,
  PhaseName,
  PlayerId,
  TradeBundle,
  TradeOffer,
} from './types';

/** Höchstzahl offener Angebote im ganzen Spiel. */
export const MAX_OPEN_TRADES = 20;

/** Handeln geht immer, außer während einer Auktion und nach Spielende. */
const TRADE_PHASES: readonly PhaseName[] = [
  'awaitingRoll',
  'awaitingPurchase',
  'freePhase',
  'awaitingDebt',
];

function validateBundle(
  state: GameState,
  owner: PlayerId,
  bundle: TradeBundle,
): EngineError | null {
  const ints = [bundle.cash, bundle.jailFreeCards];
  if (ints.some((n) => !Number.isInteger(n) || n < 0)) return engineError('invalidTrade');
  if (!Array.isArray(bundle.tiles) || new Set(bundle.tiles).size !== bundle.tiles.length)
    return engineError('invalidTrade');
  const player = requirePlayer(state, owner);
  for (const tileId of bundle.tiles) {
    const tile = tileById(state, tileId);
    if (!tile || !isOwnable(tile)) return engineError('unknownTile');
    if (tileState(state, tileId).owner !== owner) return engineError('notOwner');
    // Wie beim Hypothekieren: Gruppen mit Gebäuden lassen sich nicht handeln.
    if (
      tile.type === 'property' &&
      groupTiles(state, tile.group).some((t) => tileState(state, t.id).buildings > 0)
    )
      return engineError('groupHasBuildings');
  }
  if (player.cash < bundle.cash) return engineError('insufficientFunds');
  if (player.jailFreeCards.length < bundle.jailFreeCards) return engineError('noJailFreeCard');
  return null;
}

function isEmpty(bundle: TradeBundle): boolean {
  return bundle.cash === 0 && bundle.tiles.length === 0 && bundle.jailFreeCards === 0;
}

/** Prüft ein Angebot vollständig gegen den aktuellen Zustand. */
export function validateOffer(
  state: GameState,
  from: PlayerId,
  to: PlayerId,
  give: TradeBundle,
  receive: TradeBundle,
  terms: readonly AgreementTerm[] = [],
): EngineError | null {
  const target = getPlayer(state, to);
  if (!target || target.bankrupt || to === from) return engineError('invalidTrade');
  if (isEmpty(give) && isEmpty(receive) && terms.length === 0) return engineError('invalidTrade');
  return (
    validateBundle(state, from, give) ??
    validateBundle(state, to, receive) ??
    validateTerms(state, from, to, give, receive, terms)
  );
}

function requireTrade(state: GameState, tradeId: string): TradeOffer | EngineError {
  return state.trades.find((t) => t.id === tradeId) ?? engineError('unknownTrade');
}

function createOffer(
  ctx: Ctx,
  from: PlayerId,
  to: PlayerId,
  give: TradeBundle,
  receive: TradeBundle,
  terms: readonly AgreementTerm[],
  counterTo: string | null,
): void {
  const trade: TradeOffer = {
    id: `t${ctx.state.nextTradeId++}`,
    from,
    to,
    give: { cash: give.cash, tiles: [...give.tiles], jailFreeCards: give.jailFreeCards },
    receive: {
      cash: receive.cash,
      tiles: [...receive.tiles],
      jailFreeCards: receive.jailFreeCards,
    },
    terms: structuredClone([...terms]),
    counterTo,
  };
  ctx.state.trades.push(trade);
  emit(ctx, { type: 'tradeProposed', trade });
}

function removeTrade(ctx: Ctx, tradeId: string): void {
  ctx.state.trades = ctx.state.trades.filter((t) => t.id !== tradeId);
}

function moveBundle(ctx: Ctx, from: PlayerId, to: PlayerId, bundle: TradeBundle): void {
  transfer(ctx, from, to, bundle.cash, 'trade');
  for (const tileId of bundle.tiles) {
    tileState(ctx.state, tileId).owner = to;
    emit(ctx, { type: 'propertyTransferred', tileId, from, to });
  }
  const giver = requirePlayer(ctx.state, from);
  const cards = giver.jailFreeCards.splice(0, bundle.jailFreeCards);
  requirePlayer(ctx.state, to).jailFreeCards.push(...cards);
}

/**
 * Entfernt Angebote, die nicht mehr erfüllbar sind, weil ein Feld den Besitzer gewechselt
 * hat oder ein Beteiligter ausgeschieden ist. Fehlendes Bargeld zählt nicht: Das kann sich
 * bis zur Annahme ändern.
 */
export function pruneTrades(ctx: Ctx): void {
  const state = ctx.state;
  const stale = (trade: TradeOffer) => {
    const parties = [trade.from, trade.to].map((id) => getPlayer(state, id));
    if (parties.some((p) => !p || p.bankrupt)) return true;
    const owns = (owner: PlayerId, tiles: string[]) =>
      tiles.every((id) => state.tiles[id]?.owner === owner);
    if (!owns(trade.from, trade.give.tiles) || !owns(trade.to, trade.receive.tiles)) return true;
    return (
      validateTerms(state, trade.from, trade.to, trade.give, trade.receive, trade.terms) !== null
    );
  };
  for (const trade of state.trades.filter(stale)) {
    removeTrade(ctx, trade.id);
    emit(ctx, { type: 'tradeCancelled', tradeId: trade.id, reason: 'invalid' });
  }
}

export const tradeHandlers: {
  PROPOSE_TRADE: ActionHandler<'PROPOSE_TRADE'>;
  COUNTER_TRADE: ActionHandler<'COUNTER_TRADE'>;
  ACCEPT_TRADE: ActionHandler<'ACCEPT_TRADE'>;
  REJECT_TRADE: ActionHandler<'REJECT_TRADE'>;
  CANCEL_TRADE: ActionHandler<'CANCEL_TRADE'>;
} = {
  PROPOSE_TRADE: {
    actor: 'anyPlayer',
    phases: TRADE_PHASES,
    validate: (state, action) => {
      if (state.trades.length >= MAX_OPEN_TRADES) return engineError('tooManyTrades');
      return validateOffer(
        state,
        action.playerId,
        action.to,
        action.give,
        action.receive,
        action.terms,
      );
    },
    execute: (ctx, action) =>
      createOffer(
        ctx,
        action.playerId,
        action.to,
        action.give,
        action.receive,
        action.terms ?? [],
        null,
      ),
  },

  COUNTER_TRADE: {
    actor: 'anyPlayer',
    phases: TRADE_PHASES,
    validate: (state, action) => {
      const trade = requireTrade(state, action.tradeId);
      if ('code' in trade) return trade;
      if (trade.to !== action.playerId) return engineError('notTradeParty');
      return validateOffer(
        state,
        action.playerId,
        trade.from,
        action.give,
        action.receive,
        action.terms,
      );
    },
    execute: (ctx, action) => {
      const trade = requireTrade(ctx.state, action.tradeId) as TradeOffer;
      removeTrade(ctx, trade.id);
      emit(ctx, { type: 'tradeCancelled', tradeId: trade.id, reason: 'countered' });
      createOffer(
        ctx,
        action.playerId,
        trade.from,
        action.give,
        action.receive,
        action.terms ?? [],
        trade.id,
      );
    },
  },

  ACCEPT_TRADE: {
    actor: 'anyPlayer',
    phases: TRADE_PHASES,
    validate: (state, action) => {
      const trade = requireTrade(state, action.tradeId);
      if ('code' in trade) return trade;
      if (trade.to !== action.playerId) return engineError('notTradeParty');
      if (state.agreements.length + trade.terms.length > MAX_AGREEMENTS)
        return engineError('tooManyTrades');
      return validateOffer(state, trade.from, trade.to, trade.give, trade.receive, trade.terms);
    },
    execute: (ctx, action) => {
      const trade = requireTrade(ctx.state, action.tradeId) as TradeOffer;
      removeTrade(ctx, trade.id);
      moveBundle(ctx, trade.from, trade.to, trade.give);
      moveBundle(ctx, trade.to, trade.from, trade.receive);
      startAgreements(ctx, trade);
      emit(ctx, { type: 'tradeAccepted', tradeId: trade.id, from: trade.from, to: trade.to });
      pruneTrades(ctx);
    },
  },

  REJECT_TRADE: {
    actor: 'anyPlayer',
    phases: TRADE_PHASES,
    validate: (state, action) => {
      const trade = requireTrade(state, action.tradeId);
      if ('code' in trade) return trade;
      return trade.to === action.playerId ? null : engineError('notTradeParty');
    },
    execute: (ctx, action) => {
      removeTrade(ctx, action.tradeId);
      emit(ctx, { type: 'tradeRejected', tradeId: action.tradeId, by: action.playerId });
    },
  },

  CANCEL_TRADE: {
    actor: 'anyPlayer',
    phases: TRADE_PHASES,
    validate: (state, action) => {
      const trade = requireTrade(state, action.tradeId);
      if ('code' in trade) return trade;
      return trade.from === action.playerId ? null : engineError('notTradeParty');
    },
    execute: (ctx, action) => {
      removeTrade(ctx, action.tradeId);
      emit(ctx, { type: 'tradeCancelled', tradeId: action.tradeId, reason: 'withdrawn' });
    },
  },
};
