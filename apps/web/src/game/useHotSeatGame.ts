import {
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
import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'menelgame.hotseat.v2';

export interface HotSeatGame {
  log: GameLog;
  state: GameState;
  events: GameEvent[];
}

function load(): HotSeatGame | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const log = JSON.parse(raw) as GameLog;
    if (log.initial?.stateVersion !== STATE_VERSION) return null;
    const { state, events } = replay(log);
    return { log, state, events };
  } catch {
    return null;
  }
}

function save(log: GameLog | null): void {
  try {
    if (log) localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Speichern ist nur Komfort; ohne Speicher läuft das Spiel trotzdem.
  }
}

function auctionSeconds(state: GameState): number {
  return state.rules.timers.auctionSeconds * 1000;
}

/**
 * Lokales Hot-Seat-Spiel: alle Aktionen laufen über die Engine und landen im Log. Die Uhr
 * für Auktionen läuft hier im Browser (online übernimmt das der Server).
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

  useEffect(() => save(game?.log ?? null), [game]);

  const start = useCallback((setup: GameSetup) => {
    const initial = createGame(setup);
    setError(null);
    setAuctionDeadline(null);
    setGame({ log: { initial, actions: [] }, state: initial, events: [] });
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
      });
    },
    [game],
  );

  // Auktion schließen, wenn die Zeit abgelaufen ist.
  const dispatchRef = useRef(dispatch);
  useEffect(() => {
    dispatchRef.current = dispatch;
  }, [dispatch]);
  useEffect(() => {
    if (auctionDeadline === null) return;
    const id = window.setTimeout(
      () => dispatchRef.current({ type: 'AUCTION_CLOSE' }),
      Math.max(0, auctionDeadline - Date.now()),
    );
    return () => window.clearTimeout(id);
  }, [auctionDeadline]);

  const reset = useCallback(() => {
    setError(null);
    setAuctionDeadline(null);
    setGame(null);
  }, []);

  return { game, error, auctionDeadline, start, dispatch, reset };
}
