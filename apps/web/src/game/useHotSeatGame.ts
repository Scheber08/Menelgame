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
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'menelgame.hotseat.v1';

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

/** Lokales Hot-Seat-Spiel: alle Aktionen laufen über die Engine und landen im Log. */
export function useHotSeatGame() {
  const [game, setGame] = useState<HotSeatGame | null>(load);
  const [error, setError] = useState<EngineError | null>(null);

  useEffect(() => save(game?.log ?? null), [game]);

  const start = useCallback((setup: GameSetup) => {
    const initial = createGame(setup);
    setError(null);
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
      setGame({
        log: { initial: game.log.initial, actions: [...game.log.actions, action] },
        state: result.state,
        events: [...game.events, ...result.events],
      });
    },
    [game],
  );

  const reset = useCallback(() => {
    setError(null);
    setGame(null);
  }, []);

  return { game, error, start, dispatch, reset, clearError: () => setError(null) };
}
