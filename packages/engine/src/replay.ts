import { apply } from './apply';
import type { Action, GameEvent, GameState } from './types';

/** Ereignis-Log eines Spiels: Startzustand plus alle angewandten Aktionen. */
export interface GameLog {
  initial: GameState;
  actions: Action[];
}

export interface ReplayResult {
  state: GameState;
  events: GameEvent[];
}

/**
 * Spielt ein Log erneut ab. Wirft, wenn eine Aktion ungültig ist – dann passt das Log nicht
 * zum Startzustand.
 */
export function replay(log: GameLog): ReplayResult {
  let state = log.initial;
  const events: GameEvent[] = [];
  log.actions.forEach((action, i) => {
    const result = apply(state, action);
    if (!result.ok) {
      throw new Error(
        `Replay fehlgeschlagen bei Aktion ${i} (${action.type}): ${result.error.code}`,
      );
    }
    state = result.state;
    events.push(...result.events);
  });
  return { state, events };
}
