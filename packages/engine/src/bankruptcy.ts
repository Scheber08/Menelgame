import { startAuction } from './auction';
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
import { checkVictory, resume } from './turn';
import type { Party, PlayerId, ResumePoint } from './types';

/**
 * Bankrott des Schuldners der ersten offenen Schuld.
 *
 * - Gebäude gehen zum halben Preis (buildingSellPercent) an die Bank zurück.
 * - Modus toCreditor und Gläubiger ist ein Spieler: Bargeld, Felder (samt Hypotheken) und
 *   Gefängnis-frei-Karten gehen an ihn.
 * - Sonst (Bank, Topf oder Modus auction): Bargeld an den Gläubiger, Felder zurück an die
 *   Bank (bei auction über den Auktions-Hook), Karten zurück unter ihren Stapel.
 */
export function declareBankruptcy(ctx: Ctx, playerId: PlayerId): void {
  const state = ctx.state;
  const debt = state.debts[0];
  if (!debt) return;
  const creditor: Party = debt.creditor;
  const player = requirePlayer(state, playerId);
  const toPlayer =
    state.rules.bankruptcy.mode === 'toCreditor' && creditor !== 'bank' && creditor !== 'pot';

  player.bankrupt = true;
  emit(ctx, { type: 'bankrupt', playerId, creditor });

  // Gebäude liquidieren.
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
      if (state.rules.bankruptcy.mode === 'auction') startAuction(ctx, tile.id);
    }
  }

  const heir = toPlayer ? getPlayer(state, creditor) : undefined;
  for (const card of player.jailFreeCards) {
    if (heir) heir.jailFreeCards.push(card);
    else state.decks[card.deckId]?.drawPile.push(card.cardId);
  }
  player.jailFreeCards = [];

  // Offene Schulden des Bankrotten verfallen; Forderungen an ihn gehen an die Bank.
  state.debts = state.debts
    .filter((d) => d.debtor !== playerId)
    .map((d) => (d.creditor === playerId ? { ...d, creditor: 'bank' } : d));

  if (checkVictory(ctx)) return;

  const phase = state.phase;
  let next: ResumePoint =
    phase.name === 'awaitingDebt' ? phase.resume : { kind: 'freePhase', extraRoll: false };
  if (currentPlayer(state).id === playerId) next = { kind: 'advanceTurn' };

  if (state.debts.length > 0) state.phase = { name: 'awaitingDebt', resume: next };
  else resume(ctx, next);
}
