import { endAgreementsOf } from './agreements';
import { leaveAuction } from './auction';
import { emit, transfer, type Ctx } from './context';
import {
  buildingRefund,
  currentPlayer,
  getPlayer,
  HOTEL,
  ownedTiles,
  requirePlayer,
  tileState,
} from './selectors';
import { pruneTrades } from './trade';
import { checkVictory, resume } from './turn';
import type { Party, Phase, PlayerId, ResumePoint } from './types';

/** Bankrott des Schuldners gegenüber dem Gläubiger der ersten offenen Schuld. */
export function declareBankruptcy(ctx: Ctx, playerId: PlayerId): void {
  const creditor = ctx.state.debts[0]?.creditor ?? 'bank';
  eliminatePlayer(ctx, playerId, creditor, 'bankrupt');
}

function phaseAsResume(phase: Phase): ResumePoint {
  switch (phase.name) {
    case 'awaitingPurchase':
      return { kind: 'awaitingPurchase', tileId: phase.tileId, extraRoll: phase.extraRoll };
    case 'freePhase':
      return { kind: 'freePhase', extraRoll: phase.extraRoll };
    case 'awaitingDebt':
      return phase.resume;
    default:
      return { kind: 'awaitingRoll' };
  }
}

/**
 * Scheidet einen Spieler aus (Bankrott oder vom Host entfernt).
 *
 * - Gebäude gehen zum Verkaufspreis (buildingSellPercent) an die Bank zurück.
 * - Bankrott, Modus toCreditor und Gläubiger ist ein Spieler: Bargeld, Felder (samt
 *   Hypotheken) und Gefängnis-frei-Karten gehen an ihn.
 * - Sonst: Bargeld an den Gläubiger, Felder ohne Hypothek zurück an die Bank, Karten unter
 *   ihren Stapel. Im Modus auction werden die Felder danach versteigert.
 */
export function eliminatePlayer(
  ctx: Ctx,
  playerId: PlayerId,
  creditor: Party,
  reason: 'bankrupt' | 'removed',
): void {
  const state = ctx.state;
  const player = requirePlayer(state, playerId);
  const wasCurrent = currentPlayer(state).id === playerId;
  const creditorIsPlayer = creditor !== 'bank' && creditor !== 'pot';
  const toPlayer =
    reason === 'bankrupt' && state.rules.bankruptcy.mode === 'toCreditor' && creditorIsPlayer;
  const auctionTiles: string[] = [];

  player.bankrupt = true;
  emit(
    ctx,
    reason === 'removed'
      ? { type: 'playerRemoved', playerId }
      : { type: 'bankrupt', playerId, creditor },
  );

  for (const tile of ownedTiles(state, playerId)) {
    const ts = tileState(state, tile.id);
    if (tile.type !== 'property' || ts.buildings === 0) continue;
    if (ts.buildings === HOTEL) {
      if (state.bank.hotels !== null) state.bank.hotels++;
    } else if (state.bank.houses !== null) {
      state.bank.houses += ts.buildings;
    }
    transfer(ctx, 'bank', playerId, ts.buildings * buildingRefund(state, tile), 'sellBuilding');
    ts.buildings = 0;
  }

  transfer(ctx, playerId, creditor, player.cash, 'bankruptcy');

  for (const tile of ownedTiles(state, playerId)) {
    const ts = tileState(state, tile.id);
    if (toPlayer) {
      ts.owner = creditor;
      emit(ctx, { type: 'propertyTransferred', tileId: tile.id, from: playerId, to: creditor });
    } else {
      ts.owner = null;
      ts.mortgaged = false;
      emit(ctx, { type: 'propertyTransferred', tileId: tile.id, from: playerId, to: null });
      if (reason === 'bankrupt' && state.rules.bankruptcy.mode === 'auction')
        auctionTiles.push(tile.id);
    }
  }

  const heir = toPlayer ? getPlayer(state, creditor) : undefined;
  for (const card of player.jailFreeCards) {
    if (heir) heir.jailFreeCards.push(card);
    else state.decks[card.deckId]?.drawPile.push(card.cardId);
  }
  player.jailFreeCards = [];

  // Offene Schulden des Ausgeschiedenen verfallen; Forderungen an ihn gehen an die Bank.
  state.debts = state.debts
    .filter((d) => d.debtor !== playerId)
    .map((d) => (d.creditor === playerId ? { ...d, creditor: 'bank' } : d));
  endAgreementsOf(ctx, playerId);
  pruneTrades(ctx);

  if (checkVictory(ctx)) return;

  if (state.phase.name === 'auction' && state.auction) {
    const auction = state.auction;
    if (wasCurrent) auction.then = { kind: 'advanceTurn' };
    auction.queue.push(...auctionTiles);
    leaveAuction(ctx, playerId);
    return;
  }

  let next = phaseAsResume(state.phase);
  if (wasCurrent) next = { kind: 'advanceTurn' };
  if (auctionTiles.length > 0) next = { kind: 'auction', tiles: auctionTiles, then: next };

  if (state.debts.length > 0) state.phase = { name: 'awaitingDebt', resume: next };
  else resume(ctx, next);
}
