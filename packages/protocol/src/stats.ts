import type { PlayerGameStats } from '@menelgame/engine';

/** Ein gespeichertes Spielergebnis eines Profils. */
export interface GameResult {
  roomCode: string;
  packName: string;
  finishedAt: number;
  /** Mitspieler-Bots nach Stufe, z. B. { hard: 1 }. */
  bots: Partial<Record<'easy' | 'medium' | 'hard', number>>;
  stats: PlayerGameStats;
}

export interface ProfileTotals {
  games: number;
  wins: number;
  rentReceived: number;
  rentPaid: number;
  propertiesBought: number;
  housesBuilt: number;
  hotelsBuilt: number;
  trades: number;
  bestNetWorth: number;
}

export interface Achievement {
  id: string;
  /** Erfüllt, wenn diese Ergebnisse (alle Spiele des Profils) die Bedingung erfüllen. */
  check: (results: readonly GameResult[], totals: ProfileTotals) => boolean;
}

const any = (
  results: readonly GameResult[],
  test: (s: PlayerGameStats, r: GameResult) => boolean,
) => results.some((r) => test(r.stats, r));

/** Erfolge; Texte stehen in der Sprachdatei unter achievements.<id>. */
export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'firstGame', check: (_, t) => t.games >= 1 },
  { id: 'regular', check: (_, t) => t.games >= 10 },
  { id: 'firstWin', check: (_, t) => t.wins >= 1 },
  { id: 'fiveWins', check: (_, t) => t.wins >= 5 },
  { id: 'builder', check: (r) => any(r, (s) => s.housesBuilt + s.hotelsBuilt * 5 >= 15) },
  { id: 'hotelier', check: (r) => any(r, (s) => s.hotelsBuilt >= 3) },
  { id: 'landlord', check: (r) => any(r, (s) => s.rentReceived >= 2000) },
  { id: 'monopolist', check: (r) => any(r, (s) => s.completeGroups >= 3) },
  { id: 'cleanRecord', check: (r) => any(r, (s) => s.won && s.jailVisits === 0) },
  { id: 'jailbird', check: (r) => any(r, (s) => s.jailVisits >= 3) },
  { id: 'broke', check: (r) => any(r, (s) => s.bankrupt) },
  { id: 'dealer', check: (_, t) => t.trades >= 5 },
  { id: 'contractor', check: (r) => r.reduce((sum, x) => sum + x.stats.agreements, 0) >= 3 },
  { id: 'botSlayer', check: (r) => any(r, (s, x) => s.won && (x.bots.hard ?? 0) > 0) },
];

/** Titel nach Siegen; der höchste erreichte gilt. */
export const TITLES: readonly { id: string; wins: number }[] = [
  { id: 'newcomer', wins: 0 },
  { id: 'landowner', wins: 1 },
  { id: 'investor', wins: 3 },
  { id: 'tycoon', wins: 10 },
  { id: 'legend', wins: 25 },
];

export function totalsOf(results: readonly GameResult[]): ProfileTotals {
  const totals: ProfileTotals = {
    games: results.length,
    wins: 0,
    rentReceived: 0,
    rentPaid: 0,
    propertiesBought: 0,
    housesBuilt: 0,
    hotelsBuilt: 0,
    trades: 0,
    bestNetWorth: 0,
  };
  for (const { stats } of results) {
    if (stats.won) totals.wins++;
    totals.rentReceived += stats.rentReceived;
    totals.rentPaid += stats.rentPaid;
    totals.propertiesBought += stats.propertiesBought;
    totals.housesBuilt += stats.housesBuilt;
    totals.hotelsBuilt += stats.hotelsBuilt;
    totals.trades += stats.trades;
    totals.bestNetWorth = Math.max(totals.bestNetWorth, stats.netWorth);
  }
  return totals;
}

export function titleOf(wins: number): string {
  return [...TITLES].reverse().find((t) => wins >= t.wins)!.id;
}

/** IDs aller Erfolge, die diese Ergebnisse erfüllen. */
export function earnedAchievements(results: readonly GameResult[]): string[] {
  const totals = totalsOf(results);
  return ACHIEVEMENTS.filter((a) => a.check(results, totals)).map((a) => a.id);
}

export interface ProfileStatsResponse {
  totals: ProfileTotals;
  title: string;
  achievements: { id: string; unlockedAt: number }[];
  /** Die jüngsten Spiele, neueste zuerst. */
  recent: GameResult[];
}

export interface ClaimResponse {
  /** Erfolge, die mit diesem Spiel neu dazugekommen sind. */
  unlocked: string[];
  alreadyClaimed: boolean;
}
