import {
  ownableById,
  type GameState,
  type PlayerAction,
  type PlayerId,
  type TradeOffer,
} from '@menelgame/engine';
import type { OwnableTile } from '@menelgame/schema';
import type { BotMemory } from './view';
import { tileWorth } from './valuation';

/** Entscheidungen, in denen sich die Bot-Stufen unterscheiden. */
export interface Strategy {
  /** Auf ein Angebot an mich antworten. */
  respondTrade(view: GameState, me: PlayerId, offer: TradeOffer): PlayerAction;
  /** Laufende Auktion: bieten oder aussteigen. */
  auction(view: GameState, me: PlayerId): PlayerAction;
  /** Vor dem Würfeln: Gefängnis verlassen, Angebote machen, verwalten. null = würfeln. */
  beforeRoll(
    view: GameState,
    me: PlayerId,
    legal: PlayerAction[],
    memory: BotMemory,
  ): PlayerAction | null;
  /** Freies Feld kaufen? */
  buy(view: GameState, me: PlayerId, tile: OwnableTile): boolean;
  /** Nach dem Zug: bauen, Hypotheken ablösen. null = weiter/Zug beenden. */
  manage(view: GameState, me: PlayerId, legal: PlayerAction[]): PlayerAction | null;
}

const of = <T extends PlayerAction['type']>(legal: PlayerAction[], type: T) =>
  legal.filter((a): a is Extract<PlayerAction, { type: T }> => a.type === type);

export function find<T extends PlayerAction['type']>(legal: PlayerAction[], type: T) {
  return of(legal, type)[0];
}

export function all<T extends PlayerAction['type']>(legal: PlayerAction[], type: T) {
  return of(legal, type);
}

/** Schulden: zahlen, sonst das am wenigsten Wertvolle beleihen, dann Gebäude verkaufen. */
export function settleDebt(view: GameState, me: PlayerId, legal: PlayerAction[]): PlayerAction {
  const pay = find(legal, 'PAY_DEBT');
  if (pay) return pay;
  const mortgages = all(legal, 'MORTGAGE');
  if (mortgages.length > 0) {
    const worth = (a: (typeof mortgages)[number]) =>
      tileWorth(view, ownableById(view, a.tileId)!, me);
    return mortgages.reduce((best, a) => (worth(a) < worth(best) ? a : best));
  }
  const sell = find(legal, 'SELL_BUILDING');
  if (sell) return sell;
  return { type: 'DECLARE_BANKRUPTCY', playerId: me };
}
