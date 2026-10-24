import {
  activePlayers,
  groupTiles,
  MAX_INSTALLMENT,
  ownableById,
  ownsWholeGroup,
  unmortgageCost,
  type AgreementTerm,
  type GameState,
  type PlayerAction,
  type PlayerId,
} from '@menelgame/engine';
import { isOwnable, type OwnableTile, type PropertyTile } from '@menelgame/schema';
import { landingOdds, landingsPerRound } from './landing';
import { opponentMonopolyPenalty, unownedCount } from './medium';
import { all, find, type Strategy } from './strategy';
import {
  bundleWorth,
  cashOf,
  cashReserve,
  completesForOpponent,
  completesGroup,
  groupPrice,
  termsWorth,
  tileWorth,
} from './valuation';

/** Wie oft ein Feld im Vergleich zum Durchschnitt getroffen wird (1 = durchschnittlich). */
function hotness(view: GameState, odds: number[], tileId: string): number {
  const index = view.pack.tiles.findIndex((t) => t.id === tileId);
  return (odds[index] ?? 0) * view.pack.tiles.length;
}

/** Feldwert der Stufe Mittel, gewichtet mit der simulierten Landewahrscheinlichkeit. */
function worth(view: GameState, tile: OwnableTile, owner: PlayerId, gaining = false): number {
  const odds = landingOdds(view);
  return tileWorth(view, tile, owner, gaining) * (0.7 + 0.3 * hotness(view, odds, tile.id));
}

/** Mehreinnahmen pro Runde durch das nächste Haus, je investiertem Taler. */
function buildReturn(view: GameState, tile: PropertyTile, me: PlayerId): number {
  const level = view.tiles[tile.id]?.buildings ?? 0;
  const before =
    level === 0 ? tile.rent[0]! * view.rules.monopolyRentMultiplier : tile.rent[level]!;
  const gain = (tile.rent[level + 1] ?? 0) - before;
  return (gain * landingsPerRound(view, landingOdds(view), tile.id, me)) / tile.houseCost;
}

/** Reserve wie Mittel, plus anstehende eigene Raten der nächsten Runden. */
function hardReserve(view: GameState, me: PlayerId): number {
  let owed = 0;
  for (const a of view.agreements)
    if (a.term.kind === 'installments' && a.term.payer === me)
      owed += a.term.amount * Math.min(a.remainingRounds, 3);
  // Früh im Spiel sind Felder günstig und Mieten klein: Geld gehört aufs Brett.
  const total = Object.keys(view.tiles).length;
  const early = unownedCount(view) > total / 2 ? 0.3 : 1;
  return cashReserve(view, me) * early + owed;
}

/** Wie viele Häuser haben die Gegner – dann ist das Gefängnis ein sicherer Ort. */
function opponentHouses(view: GameState, me: PlayerId): number {
  let houses = 0;
  for (const [id, ts] of Object.entries(view.tiles))
    if (ts.owner && ts.owner !== me && ownableById(view, id)) houses += ts.buildings;
  return houses;
}

/**
 * Stufe Schwer: rechnet mit simulierten Landewahrscheinlichkeiten (Engine-Simulation pro
 * Brett), baut nach erwartetem Ertrag pro Runde, bietet strategisch (treibt Preise für
 * Felder hoch, die einem Gegner eine Gruppe vervollständigen), bewertet Vereinbarungen und
 * bietet fehlende Gruppenfelder auch gegen Ratenzahlung an.
 */
export const hard: Strategy = {
  respondTrade(view, me, offer) {
    const odds = landingOdds(view);
    const gain = bundleWorth(view, offer.give, me, true);
    const loss = bundleWorth(view, offer.receive, me, false);
    const penalty = opponentMonopolyPenalty(view, me, offer.receive.tiles, offer.from);
    const terms = termsWorth(view, offer.terms, me, odds);
    const keepsReserve = cashOf(view, me) - offer.receive.cash >= cashReserve(view, me) * 0.4;
    return gain - loss - penalty + terms >= 0 && keepsReserve
      ? { type: 'ACCEPT_TRADE', playerId: me, tradeId: offer.id }
      : { type: 'REJECT_TRADE', playerId: me, tradeId: offer.id };
  },

  auction(view, me) {
    const auction = view.auction!;
    const tile = ownableById(view, auction.tileId)!;
    const mine = worth(view, tile, me, true);
    // Was der stärkste Gegner dafür zahlen würde, wenn es ihm eine Gruppe vervollständigt.
    const blocking = completesForOpponent(view, tile, me)
      ? Math.max(tile.price * 1.3, mine * 1.1)
      : 0;
    const limit = Math.max(mine, blocking);
    // Auktionen sind die günstigste Gelegenheit: dafür geht Schwer fast an die Reserve.
    const budget = cashOf(view, me) - hardReserve(view, me) * 0.2;
    // Bis zum halben Wert in großen Schritten, danach knapp überbieten.
    const step = auction.highestBid < limit * 0.5 ? Math.max(10, Math.round(limit / 100) * 10) : 10;
    const amount = auction.highestBid + step;
    if (amount <= Math.min(limit, budget)) return { type: 'AUCTION_BID', playerId: me, amount };
    return { type: 'AUCTION_PASS', playerId: me };
  },

  beforeRoll(view, me, legal, memory) {
    const player = view.players.find((p) => p.id === me)!;
    const reserve = hardReserve(view, me);
    if (player.inJail) {
      // Sind kaum noch Felder frei, ist das Gefängnis ein sicherer Ort.
      const stay = unownedCount(view) <= 6 || opponentHouses(view, me) >= 8;
      if (!stay) {
        const card = find(legal, 'USE_JAIL_CARD');
        if (card) return card;
        const bail = find(legal, 'PAY_BAIL');
        if (bail && player.cash - view.rules.jail.bail >= reserve) return bail;
      }
      return null;
    }
    if (memory.lastProposalTurn !== view.turn && !view.trades.some((t) => t.from === me)) {
      memory.lastProposalTurn = view.turn;
      const offer = swapOffer(view, me, reserve) ?? groupOffer(view, me, reserve);
      if (offer) return offer;
    }
    return hard.manage(view, me, legal);
  },

  buy(view, me, tile) {
    const cash = cashOf(view, me);
    const reserve = hardReserve(view, me);
    if (cash - tile.price >= reserve) return true;
    const strategic = completesGroup(view, tile, me) || completesForOpponent(view, tile, me);
    const hot = hotness(view, landingOdds(view), tile.id) > 1.15;
    return (strategic || hot) && cash - tile.price >= reserve / 3;
  },

  manage(view, me, legal) {
    const cash = cashOf(view, me);
    const reserve = hardReserve(view, me);

    const builds = all(legal, 'BUILD');
    if (builds.length > 0) {
      const best = builds
        .map((a) => ({ a, tile: ownableById(view, a.tileId) as PropertyTile }))
        .filter(({ tile }) => cash - tile.houseCost >= reserve)
        .sort((x, y) => buildReturn(view, y.tile, me) - buildReturn(view, x.tile, me))[0];
      if (best) return best.a;
      // Kein Geld für das nächste Haus: Einzelfelder beleihen, um die Gruppe auszubauen.
      const funding = fundBuilding(view, me, legal, cash, reserve);
      if (funding) return funding;
    }

    const unmortgages = all(legal, 'UNMORTGAGE')
      .map((a) => ({ a, tile: ownableById(view, a.tileId)! }))
      .filter(({ tile }) => cash - unmortgageCost(view, tile) >= reserve + 150)
      .sort(
        (x, y) =>
          Number(ownsWholeGroup(view, me, y.tile.group)) -
            Number(ownsWholeGroup(view, me, x.tile.group)) ||
          hotness(view, landingOdds(view), y.tile.id) - hotness(view, landingOdds(view), x.tile.id),
      );
    return unmortgages[0]?.a ?? null;
  },
};

/**
 * Beleiht ein Feld außerhalb eigener (fast) kompletter Gruppen, wenn das Geld dann für ein
 * Haus bis zur dritten Stufe reicht – dort steigt die Miete am stärksten.
 */
function fundBuilding(
  view: GameState,
  me: PlayerId,
  legal: PlayerAction[],
  cash: number,
  reserve: number,
): PlayerAction | null {
  const target = all(legal, 'BUILD')
    .map((a) => ownableById(view, a.tileId) as PropertyTile)
    .filter((t) => (view.tiles[t.id]?.buildings ?? 0) < 3)
    .sort((x, y) => x.houseCost - y.houseCost)[0];
  if (!target) return null;
  const needed = target.houseCost + reserve * 0.6 - cash;
  if (needed <= 0) return null;
  const candidates = all(legal, 'MORTGAGE')
    .map((a) => ({ a, tile: ownableById(view, a.tileId)! }))
    .filter(({ tile }) => {
      const group = groupTiles(view, tile.group);
      const owned = group.filter((t) => view.tiles[t.id]?.owner === me).length;
      return tile.type !== 'property' || owned < group.length - 1;
    })
    .sort((x, y) => worth(view, x.tile, me) - worth(view, y.tile, me));
  const total = candidates.reduce((sum, c) => sum + Math.floor(c.tile.price / 2), 0);
  // Nur beleihen, wenn es am Ende tatsächlich für das Haus reicht.
  return total >= needed ? (candidates[0]?.a ?? null) : null;
}

/** Erwartete Miete pro Runde einer kompletten Gruppe mit drei Häusern. */
function groupIncome(view: GameState, groupId: string, owner: PlayerId): number {
  const odds = landingOdds(view);
  return groupTiles(view, groupId).reduce(
    (sum, t) =>
      sum +
      (t.type === 'property' ? (t.rent[3] ?? 0) : 0) * landingsPerRound(view, odds, t.id, owner),
    0,
  );
}

/** Die Grundstücksgruppe, der `me` genau ein Feld fehlt, das `other` gehört. */
function missingFrom(view: GameState, me: PlayerId, other: PlayerId) {
  const result: { group: string; tile: PropertyTile }[] = [];
  const seen = new Set<string>();
  for (const tile of view.pack.tiles) {
    if (tile.type !== 'property' || seen.has(tile.group)) continue;
    seen.add(tile.group);
    const group = groupTiles(view, tile.group);
    const missing = group.filter((t) => view.tiles[t.id]?.owner !== me);
    if (group.length < 2 || missing.length !== 1) continue;
    if (view.tiles[missing[0]!.id]?.owner !== other) continue;
    if (group.some((t) => (view.tiles[t.id]?.buildings ?? 0) > 0)) continue;
    result.push({ group: tile.group, tile: missing[0] as PropertyTile });
  }
  return result;
}

/**
 * Tausch, der beiden eine Gruppe bringt – nur wenn meine Gruppe nach simulierten
 * Landewahrscheinlichkeiten mehr einbringt. Die Differenz für den Gegner gleiche ich mit
 * Geld aus, so knapp, dass ein vorsichtiger Gegner gerade zustimmt.
 */
function swapOffer(view: GameState, me: PlayerId, reserve: number): PlayerAction | null {
  const cash = cashOf(view, me);
  for (const other of activePlayers(view)) {
    if (other.id === me) continue;
    for (const mine of missingFrom(view, me, other.id)) {
      for (const theirs of missingFrom(view, other.id, me)) {
        const advantage =
          (groupIncome(view, mine.group, me) - groupIncome(view, theirs.group, other.id)) * 12;
        // Was der Gegner mindestens verlangt (Bewertung wie Stufe Mittel).
        const gain = tileWorth(view, theirs.tile, other.id, true);
        const loss = tileWorth(view, mine.tile, other.id);
        const penalty = 300 + groupPrice(view, mine.group) * 0.5;
        const sweetener = Math.max(0, Math.ceil((loss + penalty - gain + 30) / 10) * 10);
        const houses = mine.tile.houseCost * groupTiles(view, mine.group).length;
        if (advantage < sweetener) continue;
        if (cash - sweetener < reserve + houses / 2) continue;
        return {
          type: 'PROPOSE_TRADE',
          playerId: me,
          to: other.id,
          give: { cash: sweetener, tiles: [theirs.tile.id], jailFreeCards: 0 },
          receive: { cash: 0, tiles: [mine.tile.id], jailFreeCards: 0 },
          terms: [],
        };
      }
    }
  }
  return null;
}

/**
 * Angebot für das letzte fehlende Feld einer Gruppe. Reicht das Bargeld nicht, wird der
 * Rest als Ratenzahlung über einige Runden angeboten.
 */
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
    const price =
      Math.ceil(
        (tileWorth(view, target, owner) + 300 + groupPrice(view, tile.group) * 0.5 + 40) / 10,
      ) * 10;
    const upfront = Math.max(0, Math.min(price, Math.floor((cash - reserve) / 10) * 10));
    const rest = price - upfront;
    const terms: AgreementTerm[] = [];
    if (rest > 0) {
      // Nur ein kleiner Rest auf Raten, mit etwas Aufschlag für das Ausfallrisiko.
      const rounds = Math.min(10, Math.max(3, Math.ceil(rest / 150)));
      const amount = Math.ceil((rest * 1.05) / rounds / 10) * 10;
      if (amount > MAX_INSTALLMENT || upfront < price * 0.75) continue;
      terms.push({ kind: 'installments', payer: me, amount, rounds });
    }
    return {
      type: 'PROPOSE_TRADE',
      playerId: me,
      to: owner,
      give: { cash: upfront, tiles: [], jailFreeCards: 0 },
      receive: { cash: 0, tiles: [target.id], jailFreeCards: 0 },
      terms,
    };
  }
  return null;
}
