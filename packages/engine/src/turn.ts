import { startAuctions } from './auction';
import { emit, type Ctx } from './context';
import { hasRules, moveForward, runCustomRules, startResolution, type Resolution } from './effects';
import { activePlayers, currentPlayer, netWorth, ranking, tileAt } from './selectors';
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
    case 'awaitingRoll':
      ctx.state.phase = { name: 'awaitingRoll' };
      return;
    case 'auction':
      startAuctions(ctx, point.tiles, point.then);
      return;
    case 'choice':
      ctx.state.phase = {
        name: 'awaitingChoice',
        playerId: point.playerId,
        options: point.options,
        then: point.then,
      };
      return;
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

/** Abschluss einer Bewegung: Auswahl, Kaufangebot, freie Phase oder Schulden. */
export function finishMovement(r: Resolution, rolledDouble: boolean): void {
  const p = currentPlayer(r.ctx.state);
  const extraRoll = rolledDouble && !p.inJail && !r.jailed;
  settle(
    r.ctx,
    withChoice(
      r,
      r.offer
        ? { kind: 'awaitingPurchase', tileId: r.offer, extraRoll }
        : { kind: 'freePhase', extraRoll },
    ),
  );
}

/** Steht noch eine Auswahl aus, kommt sie vor dem eigentlichen Weiter. */
export function withChoice(r: Resolution, next: ResumePoint): ResumePoint {
  return r.choice ? { kind: 'choice', playerId: r.playerId, options: r.choice, then: next } : next;
}

/** Darf der Spieler nach `point` (noch) würfeln? Für Kaufangebote aus Auswahl/Zugbeginn. */
export function extraRollOf(point: ResumePoint): boolean {
  if (point.kind === 'freePhase' || point.kind === 'awaitingPurchase') return point.extraRoll;
  return point.kind === 'awaitingRoll';
}

/** Regeln eigener Feldtypen am Rundenende für alle, die auf einem solchen Feld stehen. */
function roundEnd(ctx: Ctx): void {
  const state = ctx.state;
  for (const [tileId, rounds] of Object.entries(state.blockedTiles)) {
    if (rounds <= 1) {
      delete state.blockedTiles[tileId];
      emit(ctx, { type: 'tileUnblocked', tileId });
    } else {
      state.blockedTiles[tileId] = rounds - 1;
    }
  }
  for (const p of activePlayers(state)) {
    const tile = tileAt(state, p.position);
    if (tile.type !== 'custom' || state.blockedTiles[tile.id] || !hasRules(ctx, tile, 'roundEnd'))
      continue;
    // Kaufangebote und Auswahlen entfallen am Rundenende; Geld und Bewegung wirken.
    runCustomRules(startResolution(ctx, p.id), tile, 'roundEnd');
  }
}

/** Nächster aktiver Spieler ist dran; prüft Rundenende und Siegbedingungen. */
export function advanceTurn(ctx: Ctx): void {
  const state = ctx.state;
  const leaving = currentPlayer(state);
  emit(ctx, { type: 'turnEnded', playerId: leaving.id });

  if (checkVictory(ctx)) return;

  const n = state.players.length;
  let idx = state.currentPlayer;
  // Reihum zum nächsten aktiven Spieler; wer aussetzen muss, wird übersprungen.
  for (let guard = 0; guard < n * 12; guard++) {
    const prev = idx;
    idx = (idx + 1) % n;
    if (idx <= prev) {
      state.round++;
      const victory = state.rules.victory;
      if (victory.type === 'maxRounds' && state.round > victory.rounds) {
        endGame(ctx, 'maxRounds');
        return;
      }
      roundEnd(ctx);
      if (checkVictory(ctx)) return;
    }
    const candidate = state.players[idx];
    if (!candidate || candidate.bankrupt) continue;
    if (candidate.skipTurns > 0) {
      candidate.skipTurns--;
      emit(ctx, { type: 'turnSkipped', playerId: candidate.id, remaining: candidate.skipTurns });
      continue;
    }
    break;
  }

  state.currentPlayer = idx;
  state.turn++;
  const p = currentPlayer(state);
  p.doublesInRow = 0;
  emit(ctx, { type: 'turnStarted', playerId: p.id, round: state.round, turn: state.turn });

  // Zugbeginn auf einem eigenen Feld.
  const tile = tileAt(state, p.position);
  let next: ResumePoint = { kind: 'awaitingRoll' };
  if (tile.type === 'custom' && !state.blockedTiles[tile.id] && hasRules(ctx, tile, 'turnStart')) {
    const r = startResolution(ctx, p.id);
    runCustomRules(r, tile, 'turnStart');
    if (r.offer) next = { kind: 'awaitingPurchase', tileId: r.offer, extraRoll: true };
    next = withChoice(r, next);
  }
  settle(ctx, next);
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
  ctx.state.auction = null;
  ctx.state.trades = [];
  ctx.state.phase = { name: 'gameOver', winner };
  emit(ctx, { type: 'gameOver', winner, reason, ranking: order });
}
