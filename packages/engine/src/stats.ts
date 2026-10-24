import { groupTiles, netWorth } from './selectors';
import type { GameEvent, GameState, PlayerId } from './types';

/** Zahlen eines Spielers aus einem beendeten Spiel – Grundlage für Statistiken und Erfolge. */
export interface PlayerGameStats {
  players: number;
  rounds: number;
  /** Platz in der Rangliste (1 = gewonnen). */
  rank: number;
  won: boolean;
  bankrupt: boolean;
  netWorth: number;
  rentPaid: number;
  rentReceived: number;
  propertiesBought: number;
  housesBuilt: number;
  hotelsBuilt: number;
  trades: number;
  agreements: number;
  jailVisits: number;
  doubles: number;
  passedStart: number;
  /** Komplette Grundstücksgruppen am Spielende. */
  completeGroups: number;
}

/** Wertet die Ereignisse eines Spiels für einen Spieler aus. */
export function playerGameStats(
  state: GameState,
  events: readonly GameEvent[],
  playerId: PlayerId,
): PlayerGameStats {
  const end = [...events].reverse().find((e) => e.type === 'gameOver');
  const ranking = end?.type === 'gameOver' ? end.ranking : [];
  const rankIndex = ranking.findIndex((r) => r.playerId === playerId);
  const stats: PlayerGameStats = {
    players: state.players.length,
    rounds: state.round,
    rank: rankIndex < 0 ? state.players.length : rankIndex + 1,
    won: end?.type === 'gameOver' && end.winner === playerId,
    bankrupt: state.players.find((p) => p.id === playerId)?.bankrupt ?? false,
    netWorth: netWorth(state, playerId),
    rentPaid: 0,
    rentReceived: 0,
    propertiesBought: 0,
    housesBuilt: 0,
    hotelsBuilt: 0,
    trades: 0,
    agreements: 0,
    jailVisits: 0,
    doubles: 0,
    passedStart: 0,
    completeGroups: 0,
  };

  for (const e of events) {
    switch (e.type) {
      case 'moneyTransferred':
        if (e.reason === 'rent' && e.from === playerId) stats.rentPaid += e.amount;
        if (e.reason === 'rent' && e.to === playerId) stats.rentReceived += e.amount;
        if (e.reason === 'passStart' && e.to === playerId) stats.passedStart++;
        break;
      case 'purchased':
      case 'auctionWon':
        if (e.playerId === playerId) stats.propertiesBought++;
        break;
      case 'built':
        if (e.playerId !== playerId) break;
        if (e.buildings >= 5) stats.hotelsBuilt++;
        else stats.housesBuilt++;
        break;
      case 'tradeAccepted':
        if (e.from === playerId || e.to === playerId) stats.trades++;
        break;
      case 'agreementStarted':
        if (e.agreement.parties.includes(playerId)) stats.agreements++;
        break;
      case 'sentToJail':
        if (e.playerId === playerId) stats.jailVisits++;
        break;
      case 'diceRolled':
        if (e.playerId === playerId && e.isDouble) stats.doubles++;
        break;
      default:
        break;
    }
  }

  const groups = new Set(state.pack.tiles.flatMap((t) => (t.type === 'property' ? [t.group] : [])));
  for (const group of groups) {
    const tiles = groupTiles(state, group);
    if (tiles.length > 0 && tiles.every((t) => state.tiles[t.id]?.owner === playerId))
      stats.completeGroups++;
  }
  return stats;
}
