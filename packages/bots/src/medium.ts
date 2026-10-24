import {
  activePlayers,
  groupTiles,
  ownableById,
  ownsWholeGroup,
  unmortgageCost,
  type GameState,
  type PlayerAction,
  type PlayerId,
} from '@menelgame/engine';
import { isOwnable, type PropertyTile } from '@menelgame/schema';
import { all, find, type Strategy } from './strategy';
import {
  bundleWorth,
  cashOf,
  cashReserve,
  completesForOpponent,
  completesGroup,
  groupPrice,
  tileWorth,
} from './valuation';

/** Wie viele Grundstücke noch frei sind – früh im Spiel lohnt es sich, unterwegs zu sein. */
function unownedCount(view: GameState): number {
  return Object.values(view.tiles).filter((t) => t.owner === null).length;
}

/** Bekäme ein Gegner durch diesen Tausch eine neue komplette Gruppe? */
function opponentMonopolyPenalty(
  view: GameState,
  me: PlayerId,
  tiles: string[],
  to: PlayerId,
): number {
  let penalty = 0;
  for (const id of tiles) {
    const tile = ownableById(view, id);
    if (tile && completesGroup(view, tile, to) && !ownsWholeGroup(view, to, tile.group))
      penalty += 300 + groupPrice(view, tile.group) * 0.5;
  }
  return me === to ? 0 : penalty;
}

/** Ertrag pro investiertem Taler beim nächsten Haus. */
function buildYield(view: GameState, tile: PropertyTile): number {
  const level = view.tiles[tile.id]?.buildings ?? 0;
  const gain =
    (tile.rent[level + 1] ?? 0) - (level === 0 ? tile.rent[0]! * 2 : (tile.rent[level] ?? 0));
  return gain / tile.houseCost;
}

/**
 * Stufe Mittel: bewertet Grundstücke nach Gruppenvollständigkeit und Mietrendite, hält eine
 * Reserve nach Mietrisiko, bietet bis zum eigenen Wert, baut gezielt und macht einfache
 * Tauschangebote für fehlende Gruppenfelder.
 */
export const medium: Strategy = {
  respondTrade(view, me, offer) {
    const gain = bundleWorth(view, offer.give, me, true);
    const loss = bundleWorth(view, offer.receive, me, false);
    const penalty = opponentMonopolyPenalty(view, me, offer.receive.tiles, offer.from);
    const keepsReserve = cashOf(view, me) - offer.receive.cash >= cashReserve(view, me) * 0.5;
    return gain - loss - penalty >= 0 && keepsReserve
      ? { type: 'ACCEPT_TRADE', playerId: me, tradeId: offer.id }
      : { type: 'REJECT_TRADE', playerId: me, tradeId: offer.id };
  },

  auction(view, me) {
    const auction = view.auction!;
    const tile = ownableById(view, auction.tileId)!;
    const worth = tileWorth(view, tile, me, true);
    const limit = completesForOpponent(view, tile, me)
      ? Math.max(worth, tile.price * 1.2)
      : worth * 0.9;
    const budget = cashOf(view, me) - cashReserve(view, me);
    const step = auction.highestBid < 100 ? 10 : 20;
    const amount = auction.highestBid + step;
    if (amount <= Math.min(limit, budget)) return { type: 'AUCTION_BID', playerId: me, amount };
    return { type: 'AUCTION_PASS', playerId: me };
  },

  beforeRoll(view, me, legal, memory) {
    const player = view.players.find((p) => p.id === me)!;
    const reserve = cashReserve(view, me);
    if (player.inJail) {
      // Früh raus, um noch Felder zu kaufen; später lieber sitzen und Miete kassieren.
      if (unownedCount(view) > 6) {
        const card = find(legal, 'USE_JAIL_CARD');
        if (card) return card;
        const bail = find(legal, 'PAY_BAIL');
        if (bail && player.cash - view.rules.jail.bail >= reserve) return bail;
      }
      return null;
    }
    if (memory.lastProposalTurn !== view.turn && !view.trades.some((t) => t.from === me)) {
      memory.lastProposalTurn = view.turn;
      const offer = groupOffer(view, me, reserve);
      if (offer) return offer;
    }
    return medium.manage(view, me, legal);
  },

  buy(view, me, tile) {
    const cash = cashOf(view, me);
    const reserve = cashReserve(view, me);
    if (cash - tile.price >= reserve) return true;
    const strategic = completesGroup(view, tile, me) || completesForOpponent(view, tile, me);
    return strategic && cash - tile.price >= reserve / 3;
  },

  manage(view, me, legal) {
    const cash = cashOf(view, me);
    const reserve = cashReserve(view, me);

    const builds = all(legal, 'BUILD');
    if (builds.length > 0) {
      const best = builds
        .map((a) => ({ a, tile: ownableById(view, a.tileId) as PropertyTile }))
        .filter(({ tile }) => cash - tile.houseCost >= reserve)
        .sort((x, y) => buildYield(view, y.tile) - buildYield(view, x.tile))[0];
      if (best) return best.a;
    }

    // Hypotheken ablösen: zuerst in kompletten Gruppen (danach kann man bauen).
    const unmortgages = all(legal, 'UNMORTGAGE')
      .map((a) => ({ a, tile: ownableById(view, a.tileId)! }))
      .filter(({ tile }) => cash - unmortgageCost(view, tile) >= reserve + 200)
      .sort(
        (x, y) =>
          Number(ownsWholeGroup(view, me, y.tile.group)) -
          Number(ownsWholeGroup(view, me, x.tile.group)),
      );
    return unmortgages[0]?.a ?? null;
  },
};

/** Bietet einem Gegner Geld für das letzte Feld, das mir zu einer Gruppe fehlt. */
function groupOffer(view: GameState, me: PlayerId, reserve: number): PlayerAction | null {
  const cash = cashOf(view, me);
  const seen = new Set<string>();
  for (const tile of view.pack.tiles) {
    if (!isOwnable(tile) || tile.type !== 'property' || seen.has(tile.group)) continue;
    seen.add(tile.group);
    const group = groupTiles(view, tile.group);
    const missing = group.filter((t) => view.tiles[t.id]?.owner !== me);
    if (missing.length !== 1 || group.length < 2) continue;
    const target = missing[0]!;
    const owner = view.tiles[target.id]?.owner;
    if (!owner || !activePlayers(view).some((p) => p.id === owner)) continue;
    if (group.some((t) => (view.tiles[t.id]?.buildings ?? 0) > 0)) continue;
    // So viel, dass ein vorsichtiger Gegner zustimmen kann.
    const price =
      Math.ceil(
        (tileWorth(view, target, owner) + 300 + groupPrice(view, tile.group) * 0.5 + 20) / 10,
      ) * 10;
    if (cash - price < reserve) continue;
    return {
      type: 'PROPOSE_TRADE',
      playerId: me,
      to: owner,
      give: { cash: price, tiles: [], jailFreeCards: 0 },
      receive: { cash: 0, tiles: [target.id], jailFreeCards: 0 },
    };
  }
  return null;
}
