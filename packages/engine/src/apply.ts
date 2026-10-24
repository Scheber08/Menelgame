import { isOwnable } from '@menelgame/schema';
import { executeAction, validateAction } from './actions';
import type { Ctx } from './context';
import { actingPlayerId } from './selectors';
import type { Action, ApplyResult, GameState } from './types';

/** Tiefe Kopie des veränderlichen Zustands; das Pack bleibt geteilt (es ist unveränderlich). */
function cloneState(state: GameState): GameState {
  const { pack, ...rest } = state;
  return { ...structuredClone(rest), pack };
}

/**
 * Kernfunktion der Engine: wendet eine Aktion an und liefert neuen Zustand und Ereignisse.
 * Ungültige Aktionen liefern einen typisierten Fehler; der Zustand bleibt dann unverändert.
 */
export function apply(state: GameState, action: Action): ApplyResult {
  const error = validateAction(state, action);
  if (error) return { ok: false, state, events: [], error };

  const ctx: Ctx = { state: cloneState(state), events: [] };
  executeAction(ctx, action);
  ctx.state.actionCount++;
  return { ok: true, state: ctx.state, events: ctx.events };
}

/** Alle Aktionen, die der handelnde Spieler gerade ausführen darf (für UI und Bots). */
export function getLegalActions(state: GameState): Action[] {
  if (state.phase.name === 'gameOver') return [];
  const playerId = actingPlayerId(state);
  const candidates: Action[] = [
    { type: 'ROLL_DICE', playerId },
    { type: 'BUY', playerId },
    { type: 'DECLINE', playerId },
    { type: 'END_TURN', playerId },
    { type: 'PAY_BAIL', playerId },
    { type: 'USE_JAIL_CARD', playerId },
    { type: 'PAY_DEBT', playerId },
    { type: 'DECLARE_BANKRUPTCY', playerId },
  ];
  for (const tile of state.pack.tiles) {
    if (!isOwnable(tile) || state.tiles[tile.id]?.owner !== playerId) continue;
    for (const type of ['BUILD', 'SELL_BUILDING', 'MORTGAGE', 'UNMORTGAGE'] as const) {
      candidates.push({ type, playerId, tileId: tile.id });
    }
  }
  return candidates.filter((action) => validateAction(state, action) === null);
}
