import { emit, transfer, type Ctx } from './context';
import { engineError, type ActionHandler } from './handler';
import { activePlayers, requirePlayer, tileState } from './selectors';
import { resume } from './turn';
import type { AuctionState, GameState, Player, PlayerId, ResumePoint } from './types';

/**
 * Versteigert die Felder nacheinander und macht danach bei `then` weiter. Die Engine kennt
 * keine Zeit: Das Ende einer Auktion löst die Uhr von außen mit AUCTION_CLOSE aus (Server
 * bzw. Hot-Seat-Oberfläche). Steigen alle außer dem Höchstbietenden aus, endet sie sofort.
 */
export function startAuctions(ctx: Ctx, tiles: string[], then: ResumePoint): void {
  const [first, ...queue] = tiles;
  if (first === undefined) {
    resume(ctx, then);
    return;
  }
  ctx.state.auction = {
    tileId: first,
    highestBid: 0,
    highestBidder: null,
    passed: [],
    queue,
    then,
  };
  ctx.state.phase = { name: 'auction' };
  emit(ctx, { type: 'auctionStarted', tileId: first });
}

function requireAuction(state: GameState): AuctionState {
  if (!state.auction) throw new Error('Keine Auktion aktiv');
  return state.auction;
}

/** Spieler, die noch mitbieten. */
export function remainingBidders(state: GameState): Player[] {
  const auction = state.auction;
  if (!auction) return [];
  return activePlayers(state).filter((p) => !auction.passed.includes(p.id));
}

function closeAuction(ctx: Ctx): void {
  const state = ctx.state;
  const auction = requireAuction(state);
  if (auction.highestBidder) {
    transfer(ctx, auction.highestBidder, 'bank', auction.highestBid, 'auction');
    const ts = tileState(state, auction.tileId);
    ts.owner = auction.highestBidder;
    ts.mortgaged = false;
    emit(ctx, {
      type: 'auctionWon',
      playerId: auction.highestBidder,
      tileId: auction.tileId,
      amount: auction.highestBid,
    });
  } else {
    emit(ctx, { type: 'auctionUnsold', tileId: auction.tileId });
  }
  state.auction = null;
  startAuctions(ctx, auction.queue, auction.then);
}

function closeIfDecided(ctx: Ctx): void {
  const auction = requireAuction(ctx.state);
  const remaining = remainingBidders(ctx.state);
  const decided = auction.highestBidder
    ? remaining.every((p) => p.id === auction.highestBidder)
    : remaining.length === 0;
  if (decided) closeAuction(ctx);
}

/** Entfernt einen ausscheidenden Spieler aus der laufenden Auktion. */
export function leaveAuction(ctx: Ctx, playerId: PlayerId): void {
  const auction = ctx.state.auction;
  if (!auction) return;
  if (!auction.passed.includes(playerId)) auction.passed.push(playerId);
  if (auction.highestBidder === playerId) {
    auction.highestBidder = null;
    auction.highestBid = 0;
  }
  closeIfDecided(ctx);
}

export const auctionHandlers: {
  AUCTION_BID: ActionHandler<'AUCTION_BID'>;
  AUCTION_PASS: ActionHandler<'AUCTION_PASS'>;
  AUCTION_CLOSE: ActionHandler<'AUCTION_CLOSE'>;
} = {
  AUCTION_BID: {
    actor: 'anyPlayer',
    phases: ['auction'],
    validate: (state, action) => {
      const auction = requireAuction(state);
      if (auction.passed.includes(action.playerId)) return engineError('alreadyPassed');
      if (
        !Number.isInteger(action.amount) ||
        action.amount <= auction.highestBid ||
        action.amount < 1
      )
        return engineError('bidTooLow');
      if (requirePlayer(state, action.playerId).cash < action.amount)
        return engineError('insufficientFunds');
      return null;
    },
    execute: (ctx, action) => {
      const auction = requireAuction(ctx.state);
      auction.highestBid = action.amount;
      auction.highestBidder = action.playerId;
      emit(ctx, {
        type: 'auctionBid',
        playerId: action.playerId,
        tileId: auction.tileId,
        amount: action.amount,
      });
      closeIfDecided(ctx);
    },
  },

  AUCTION_PASS: {
    actor: 'anyPlayer',
    phases: ['auction'],
    validate: (state, action) => {
      const auction = requireAuction(state);
      if (auction.passed.includes(action.playerId)) return engineError('alreadyPassed');
      if (auction.highestBidder === action.playerId) return engineError('highestBidder');
      return null;
    },
    execute: (ctx, action) => {
      const auction = requireAuction(ctx.state);
      auction.passed.push(action.playerId);
      emit(ctx, { type: 'auctionPassed', playerId: action.playerId, tileId: auction.tileId });
      closeIfDecided(ctx);
    },
  },

  AUCTION_CLOSE: {
    actor: 'system',
    phases: ['auction'],
    execute: (ctx) => closeAuction(ctx),
  },
};
