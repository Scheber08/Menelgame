import { requirePlayer } from './selectors';
import type { GameEvent, GameState, MoneyReason, Party, PlayerId } from './types';

/**
 * Arbeitskontext innerhalb eines apply-Aufrufs. `state` ist bereits eine Kopie und darf
 * verändert werden; nach außen bleibt apply rein.
 */
export interface Ctx {
  state: GameState;
  events: GameEvent[];
}

export function emit(ctx: Ctx, event: GameEvent): void {
  ctx.events.push(event);
}

function adjust(ctx: Ctx, party: Party, delta: number): void {
  if (party === 'bank') return;
  if (party === 'pot') {
    ctx.state.freeParkingPot += delta;
    return;
  }
  requirePlayer(ctx.state, party).cash += delta;
}

/** Bewegt Geld ohne Prüfung. Aufrufer stellen sicher, dass genug vorhanden ist. */
export function transfer(
  ctx: Ctx,
  from: Party,
  to: Party,
  amount: number,
  reason: MoneyReason,
): void {
  if (amount <= 0) return;
  adjust(ctx, from, -amount);
  adjust(ctx, to, amount);
  emit(ctx, { type: 'moneyTransferred', from, to, amount, reason });
}

/**
 * Fordert eine Zahlung. Reicht das Bargeld, wird sofort gezahlt; sonst entsteht eine
 * Schuld, die der Schuldner in der Phase awaitingDebt begleichen muss.
 */
export function charge(
  ctx: Ctx,
  debtor: PlayerId,
  creditor: Party,
  amount: number,
  reason: MoneyReason,
): void {
  if (amount <= 0) return;
  const player = requirePlayer(ctx.state, debtor);
  if (player.cash >= amount) {
    transfer(ctx, debtor, creditor, amount, reason);
    return;
  }
  ctx.state.debts.push({ debtor, creditor, amount, reason });
  emit(ctx, { type: 'debtIncurred', debtor, creditor, amount, reason });
}

/** Empfänger für Steuern und Kartenstrafen: Topf, falls die Hausregel aktiv ist. */
export function finesRecipient(ctx: Ctx): Party {
  return ctx.state.rules.freeParkingPot ? 'pot' : 'bank';
}
