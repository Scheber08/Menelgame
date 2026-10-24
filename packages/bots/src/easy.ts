import { ownableById, type PlayerAction } from '@menelgame/engine';
import { all, find, type Strategy } from './strategy';
import { bundleWorth, cashOf } from './valuation';
import { chance } from './view';

/**
 * Stufe Leicht: kauft, wenn danach eine feste Reserve bleibt, baut selten, bietet
 * zurückhaltend und lehnt Tauschangebote meistens ab.
 */
export const easy: Strategy = {
  respondTrade(view, me, offer) {
    const gain = bundleWorth(view, offer.give, me, true);
    const loss = bundleWorth(view, offer.receive, me, false);
    // Nur sehr gute Angebote annehmen.
    return gain >= loss * 2 + 50
      ? { type: 'ACCEPT_TRADE', playerId: me, tradeId: offer.id }
      : { type: 'REJECT_TRADE', playerId: me, tradeId: offer.id };
  },

  auction(view, me) {
    const auction = view.auction!;
    const tile = ownableById(view, auction.tileId)!;
    const amount = auction.highestBid + 10;
    const cash = cashOf(view, me);
    if (amount <= tile.price * 0.6 && cash - amount >= 400)
      return { type: 'AUCTION_BID', playerId: me, amount };
    return { type: 'AUCTION_PASS', playerId: me };
  },

  beforeRoll(_view, _me, legal) {
    return find(legal, 'USE_JAIL_CARD') ?? null;
  },

  buy(view, me, tile) {
    return cashOf(view, me) - tile.price >= 300;
  },

  manage(view, me, legal) {
    const cash = cashOf(view, me);
    const unmortgage = find(legal, 'UNMORTGAGE');
    if (unmortgage && cash > 1200) return unmortgage;
    const builds = all(legal, 'BUILD');
    if (builds.length > 0 && cash > 1000 && chance(view, me, 'build') < 0.3) {
      return builds.reduce((cheapest, a) => {
        const cost = (x: PlayerAction & { tileId: string }) => {
          const tile = ownableById(view, x.tileId);
          return tile?.type === 'property' ? tile.houseCost : Infinity;
        };
        return cost(a) < cost(cheapest) ? a : cheapest;
      });
    }
    return null;
  },
};
