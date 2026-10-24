import { isOwnable } from '@menelgame/schema';
import { executeAction, validateAction } from './actions';
import type { Ctx } from './context';
import { actingPlayerId } from './selectors';
import type {
  Action,
  ApplyResult,
  GameState,
  PlayerAction,
  PlayerActionType,
  PlayerId,
} from './types';

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

/**
 * Alle Aktionen, die ein Spieler gerade ausführen darf (für UI und Bots); ohne Angabe der
 * handelnde Spieler. Frei parametrisierte Aktionen erscheinen in einer Grundform: ein Gebot
 * mit dem Mindestbetrag; neue Tauschangebote gar nicht.
 */
export function getLegalActions(
  state: GameState,
  playerId: PlayerId = actingPlayerId(state),
): PlayerAction[] {
  if (state.phase.name === 'gameOver') return [];
  const simple: PlayerActionType[] = [
    'ROLL_DICE',
    'BUY',
    'DECLINE',
    'END_TURN',
    'PAY_BAIL',
    'USE_JAIL_CARD',
    'PAY_DEBT',
    'DECLARE_BANKRUPTCY',
    'AUCTION_PASS',
  ];
  const candidates = simple.map((type) => ({ type, playerId }) as PlayerAction);
  if (state.auction) {
    candidates.push({ type: 'AUCTION_BID', playerId, amount: state.auction.highestBid + 1 });
  }
  if (state.phase.name === 'awaitingChoice') {
    state.phase.options.forEach((_, option) =>
      candidates.push({ type: 'CHOOSE', playerId, option }),
    );
  }
  for (const tile of state.pack.tiles) {
    if (!isOwnable(tile) || state.tiles[tile.id]?.owner !== playerId) continue;
    for (const type of ['BUILD', 'SELL_BUILDING', 'MORTGAGE', 'UNMORTGAGE'] as const) {
      candidates.push({ type, playerId, tileId: tile.id });
    }
  }
  for (const trade of state.trades) {
    candidates.push(
      { type: 'ACCEPT_TRADE', playerId, tradeId: trade.id },
      { type: 'REJECT_TRADE', playerId, tradeId: trade.id },
      { type: 'CANCEL_TRADE', playerId, tradeId: trade.id },
    );
  }
  return candidates.filter((action) => validateAction(state, action) === null);
}

/**
 * Zurückhaltende Standardaktion, wenn der Zugtimer abläuft: würfeln, nicht kaufen, Zug
 * beenden, Schulden durch Hypotheken und Verkäufe begleichen, sonst Bankrott.
 */
export function getDefaultAction(state: GameState): Action | null {
  switch (state.phase.name) {
    case 'gameOver':
      return null;
    case 'auction':
      return { type: 'AUCTION_CLOSE' };
    case 'awaitingChoice':
      return { type: 'CHOOSE', playerId: state.phase.playerId, option: 0 };
  }
  const legal = getLegalActions(state);
  const find = (...types: PlayerActionType[]) =>
    types.map((type) => legal.find((a) => a.type === type)).find((a) => a !== undefined) ?? null;

  switch (state.phase.name) {
    case 'awaitingRoll':
      return find('ROLL_DICE');
    case 'awaitingPurchase':
      return find('DECLINE');
    case 'freePhase':
      return find('ROLL_DICE', 'END_TURN');
    case 'awaitingDebt':
      return find('PAY_DEBT', 'MORTGAGE', 'SELL_BUILDING', 'DECLARE_BANKRUPTCY');
  }
}
