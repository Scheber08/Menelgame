import { decideBot, newBotMemory, type BotLevel, type BotMemory } from '@menelgame/bots';
import {
  actingPlayerId,
  apply,
  createGame,
  replay,
  STATE_VERSION,
  type Action,
  type EngineError,
  type GameEvent,
  type GameLog,
  type GameSetup,
  type GameState,
} from '@menelgame/engine';
import type { BoardPack } from '@menelgame/schema';
import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'menelgame.hotseat.v3';
const TEST_KEY = 'menelgame.testGame';
/** Pause vor jedem Bot-Zug, damit man mitlesen kann. */
const BOT_DELAY_MS = 700;

export type BotSeats = Record<string, BotLevel>;

export interface HotSeatGame {
  log: GameLog;
  state: GameState;
  events: GameEvent[];
  bots: BotSeats;
}

interface Stored extends GameLog {
  bots?: BotSeats;
}

function load(): HotSeatGame | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as Stored;
    if (stored.initial?.stateVersion !== STATE_VERSION) return null;
    const log = { initial: stored.initial, actions: stored.actions };
    const { state, events } = replay(log);
    return { log, state, events, bots: stored.bots ?? {} };
  } catch {
    return null;
  }
}

function save(game: HotSeatGame | null): void {
  try {
    if (game) localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...game.log, bots: game.bots }));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Speichern ist nur Komfort; ohne Speicher läuft das Spiel trotzdem.
  }
}

/** Testmodus aus dem Editor: das Pack wird beim nächsten Öffnen von /lokal sofort gespielt. */
export function saveTestGame(pack: BoardPack): void {
  try {
    sessionStorage.setItem(TEST_KEY, JSON.stringify(pack));
  } catch {
    // Ohne Speicher startet man den Test über das normale Setup.
  }
}

export function takeTestGame(): BoardPack | null {
  try {
    const raw = sessionStorage.getItem(TEST_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(TEST_KEY);
    return JSON.parse(raw) as BoardPack;
  } catch {
    return null;
  }
}

function auctionSeconds(state: GameState): number {
  return state.rules.timers.auctionSeconds * 1000;
}

/**
 * Lokales Spiel an einem Gerät, optional mit Bots: alle Aktionen laufen über die Engine und
 * landen im Log. Uhr für Auktionen und Bot-Züge laufen hier im Browser.
 */
export function useHotSeatGame() {
  const [game, setGame] = useState<HotSeatGame | null>(load);
  const [error, setError] = useState<EngineError | null>(null);
  const [auctionDeadline, setAuctionDeadline] = useState<number | null>(() => {
    const loaded = load();
    return loaded?.state.phase.name === 'auction'
      ? Date.now() + auctionSeconds(loaded.state)
      : null;
  });
  const memories = useRef(new Map<string, BotMemory>());

  useEffect(() => save(game), [game]);

  const start = useCallback((setup: GameSetup, bots: BotSeats = {}) => {
    const initial = createGame(setup);
    memories.current.clear();
    setError(null);
    setAuctionDeadline(null);
    setGame({ log: { initial, actions: [] }, state: initial, events: [], bots });
  }, []);

  const dispatch = useCallback(
    (action: Action) => {
      if (!game) return;
      const result = apply(game.state, action);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      const next = result.state;
      if (next.phase.name !== 'auction') {
        setAuctionDeadline(null);
      } else if (result.events.some((e) => e.type === 'auctionStarted')) {
        setAuctionDeadline(Date.now() + auctionSeconds(next));
      } else if (action.type === 'AUCTION_BID') {
        const extend = Date.now() + next.rules.timers.auctionExtendSeconds * 1000;
        setAuctionDeadline((d) => Math.max(d ?? 0, extend));
      }
      setGame({
        log: { initial: game.log.initial, actions: [...game.log.actions, action] },
        state: next,
        events: [...game.events, ...result.events],
        bots: game.bots,
      });
    },
    [game],
  );

  const dispatchRef = useRef(dispatch);
  useEffect(() => {
    dispatchRef.current = dispatch;
  }, [dispatch]);

  // Auktion schließen, wenn die Zeit abgelaufen ist.
  useEffect(() => {
    if (auctionDeadline === null) return;
    const id = window.setTimeout(
      () => dispatchRef.current({ type: 'AUCTION_CLOSE' }),
      Math.max(0, auctionDeadline - Date.now()),
    );
    return () => window.clearTimeout(id);
  }, [auctionDeadline]);

  // Bots ziehen mit kurzer Verzögerung: erst der Handelnde, dann alle anderen.
  useEffect(() => {
    if (!game || game.state.phase.name === 'gameOver') return;
    const ids = Object.keys(game.bots);
    if (ids.length === 0) return;
    const state = game.state;
    const acting = actingPlayerId(state);
    const order = [...ids].sort((a, b) => Number(b === acting) - Number(a === acting));
    let action: Action | null = null;
    for (const id of order) {
      let memory = memories.current.get(id);
      if (!memory) {
        memory = newBotMemory();
        memories.current.set(id, memory);
      }
      action = decideBot(state, id, game.bots[id]!, memory);
      if (action) break;
    }
    if (!action) return;
    const chosen = action;
    const id = window.setTimeout(() => dispatchRef.current(chosen), BOT_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [game]);

  const reset = useCallback(() => {
    setError(null);
    setAuctionDeadline(null);
    setGame(null);
  }, []);

  return { game, error, auctionDeadline, start, dispatch, reset };
}
