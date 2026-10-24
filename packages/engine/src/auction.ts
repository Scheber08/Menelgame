import { emit, type Ctx } from './context';

/**
 * Hook für Auktionen. Wird aufgerufen, wenn ein Kauf abgelehnt wird (bei aktiver Regel
 * `auctions`) und bei Bankrott mit Modus `auction`.
 *
 * TODO(Phase 2): Auktionsphase mit Countdown und Verlängerung bei Gebot starten. Bis dahin
 * bleibt das Feld im Besitz der Bank und das Ereignis `auctionSkipped` wird protokolliert.
 */
export function startAuction(ctx: Ctx, tileId: string): void {
  emit(ctx, { type: 'auctionSkipped', tileId });
}
