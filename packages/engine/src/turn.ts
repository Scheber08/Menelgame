import { emit, type Ctx } from './context';
import { moveForward, startResolution, type Resolution } from './effects';
import { activePlayers, currentPlayer, netWorth, ranking } from './selectors';
import type { GameEvent, ResumePoint } from './types';

/**
 * Nach einer Auflösung: Bei offenen Schulden in awaitingDebt wechseln und merken, wohin es
 * danach geht; sonst direkt weiter.
 */
export function settle(ctx: Ctx, next: ResumePoint): void {
  if (ctx.state.phase.name === 'gameOver') return;
  if (ctx.state.debts.length > 0) {
    ctx.state.phase = { name: 'awaitingDebt', resume: next };
    return;
  }
  resume(ctx, next);
}

export function resume(ctx: Ctx, point: ResumePoint): void {
  switch (point.kind) {
    case 'awaitingPurchase':
      ctx.state.phase = {
        name: 'awaitingPurchase',
        tileId: point.tileId,
        extraRoll: point.extraRoll,
      };
      return;
    case 'freePhase':
      ctx.state.phase = { name: 'freePhase', extraRoll: point.extraRoll };
      return;
    case 'moveAfterBail': {
      const r = startResolution(ctx, currentPlayer(ctx.state).id);
      moveForward(r, point.steps);
      finishMovement(r, false);
      return;
    }
    case 'advanceTurn':
      advanceTurn(ctx);
      return;
  }
}

/** Abschluss einer Bewegung: Kaufangebot, freie Phase oder Schulden. */
export function finishMovement(r: Resolution, rolledDouble: boolean): void {
  const p = currentPlayer(r.ctx.state);
  const extraRoll = rolledDouble && !p.inJail && !r.jailed;
  settle(
    r.ctx,
    r.offer
      ? { kind: 'awaitingPurchase', tileId: r.offer, extraRoll }
      : { kind: 'freePhase', extraRoll },
  );
}

/** Nächster aktiver Spieler ist dran; prüft Rundenende und Siegbedingungen. */
export function advanceTurn(ctx: Ctx): void {
  const state = ctx.state;
  const leaving = currentPlayer(state);
  emit(ctx, { type: 'turnEnded', playerId: leaving.id });

  if (checkVictory(ctx)) return;

  const n = state.players.length;
  let next = state.currentPlayer;
  for (let i = 1; i <= n; i++) {
    const idx = (state.currentPlayer + i) % n;
    if (!state.players[idx]?.bankrupt) {
      next = idx;
      break;
    }
  }
  if (next <= state.currentPlayer) {
    state.round++;
    const victory = state.rules.victory;
    if (victory.type === 'maxRounds' && state.round > victory.rounds) {
      endGame(ctx, 'maxRounds');
      return;
    }
  }

  state.currentPlayer = next;
  state.turn++;
  const p = currentPlayer(state);
  p.doublesInRow = 0;
  state.phase = { name: 'awaitingRoll' };
  emit(ctx, { type: 'turnStarted', playerId: p.id, round: state.round, turn: state.turn });
}

/** Prüft „Letzter übrig“ und Zielvermögen. Liefert true, wenn das Spiel endet. */
export function checkVictory(ctx: Ctx): boolean {
  const state = ctx.state;
  if (state.phase.name === 'gameOver') return true;
  if (activePlayers(state).length <= 1) {
    endGame(ctx, 'lastStanding');
    return true;
  }
  const victory = state.rules.victory;
  if (
    victory.type === 'targetNetWorth' &&
    activePlayers(state).some((p) => netWorth(state, p.id) >= victory.amount)
  ) {
    endGame(ctx, 'targetNetWorth');
    return true;
  }
  return false;
}

export function endGame(
  ctx: Ctx,
  reason: Extract<GameEvent, { type: 'gameOver' }>['reason'],
): void {
  const order = ranking(ctx.state);
  const winner = order[0]?.playerId ?? null;
  ctx.state.debts = [];
  ctx.state.phase = { name: 'gameOver', winner };
  emit(ctx, { type: 'gameOver', winner, reason, ranking: order });
}
