import { isOwnable, type OwnableTile } from '@menelgame/schema';
import { getLegalActions } from '../apply';
import { remainingBidders } from '../auction';
import { groupTiles, ownableById } from '../selectors';
import type { Action, GameState, PlayerAction } from '../types';

/**
 * Einfache, deterministische Strategie für Testspiele (kein Bot für echte Spiele):
 * kauft alles, bietet bis zum Kaufpreis, baut mit Reserve, kauft fehlende Gruppenfelder per
 * Tausch, nimmt gültige Angebote an, liquidiert in Schulden und gibt erst auf, wenn nichts
 * mehr geht.
 */
export function nextTestMove(state: GameState): Action {
  // Offene Angebote zuerst beantworten.
  const trade = state.trades[0];
  if (trade && state.phase.name !== 'auction') {
    const accept: PlayerAction = { type: 'ACCEPT_TRADE', playerId: trade.to, tradeId: trade.id };
    const legal = getLegalActions(state, trade.to);
    return legal.some((a) => a.type === 'ACCEPT_TRADE')
      ? accept
      : { type: 'REJECT_TRADE', playerId: trade.to, tradeId: trade.id };
  }

  if (state.phase.name === 'auction' && state.auction) {
    const auction = state.auction;
    const tile = ownableById(state, auction.tileId)!;
    const bidder = remainingBidders(state).find((p) => p.id !== auction.highestBidder);
    if (!bidder) return { type: 'AUCTION_CLOSE' };
    const amount = auction.highestBid + 10;
    if (amount <= tile.price && bidder.cash - amount > 100)
      return { type: 'AUCTION_BID', playerId: bidder.id, amount };
    return { type: 'AUCTION_PASS', playerId: bidder.id };
  }

  const legal = getLegalActions(state);
  const find = (type: Action['type']) => legal.find((a) => a.type === type);
  const me = state.players.find((p) => p.id === legal[0]!.playerId)!;

  if (state.phase.name === 'awaitingDebt') {
    return (
      find('PAY_DEBT') ?? find('SELL_BUILDING') ?? find('MORTGAGE') ?? find('DECLARE_BANKRUPTCY')!
    );
  }
  if (state.phase.name === 'awaitingPurchase') return find('BUY') ?? find('DECLINE')!;
  if (me.inJail && find('USE_JAIL_CARD')) return find('USE_JAIL_CARD')!;
  if (me.cash > 600 && find('UNMORTGAGE')) return find('UNMORTGAGE')!;
  if (me.cash > 300 && find('BUILD')) return find('BUILD')!;
  if (state.phase.name === 'freePhase') {
    const offer = completeGroupOffer(state, me.id, me.cash);
    if (offer) return offer;
  }
  return find('ROLL_DICE') ?? find('END_TURN')!;
}

/** Bietet für das letzte fehlende Feld einer Gruppe den doppelten Preis. */
function completeGroupOffer(state: GameState, playerId: string, cash: number): Action | null {
  for (const tile of state.pack.tiles) {
    if (!isOwnable(tile) || tile.type !== 'property') continue;
    const group: OwnableTile[] = groupTiles(state, tile.group);
    const mine = group.filter((t) => state.tiles[t.id]?.owner === playerId);
    const missing = group.filter((t) => state.tiles[t.id]?.owner !== playerId);
    const target = missing[0];
    const owner = target && state.tiles[target.id]?.owner;
    if (mine.length === 0 || missing.length !== 1 || !target || !owner) continue;
    const price = target.price * 2;
    if (cash - price < 200) continue;
    const action: Action = {
      type: 'PROPOSE_TRADE',
      playerId,
      to: owner,
      give: { cash: price, tiles: [], jailFreeCards: 0 },
      receive: { cash: 0, tiles: [target.id], jailFreeCards: 0 },
    };
    return action;
  }
  return null;
}
