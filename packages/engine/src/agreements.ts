import { isOwnable } from '@menelgame/schema';
import { charge, emit, type Ctx } from './context';
import { engineError } from './handler';
import { tileById } from './selectors';
import type {
  Agreement,
  AgreementTerm,
  EngineError,
  GameState,
  PlayerId,
  TradeBundle,
  TradeOffer,
} from './types';

/** Höchstzahl an Vereinbarungen pro Angebot und laufend im ganzen Spiel. */
export const MAX_TERMS_PER_TRADE = 3;
export const MAX_AGREEMENTS = 30;
export const MAX_AGREEMENT_ROUNDS = 20;
export const MAX_INSTALLMENT = 5000;

/** Die andere Seite einer Vereinbarung, also die begünstigte. */
export function otherParty(agreement: Agreement, player: PlayerId): PlayerId {
  return agreement.parties[0] === player ? agreement.parties[1] : agreement.parties[0];
}

/** Wer gibt bei dieser Vereinbarung etwas her? */
export function grantor(term: AgreementTerm): PlayerId {
  return term.kind === 'installments' ? term.payer : term.owner;
}

/** Besitzer eines Felds, nachdem der Tausch ausgeführt wäre. */
function ownerAfter(
  state: GameState,
  tileId: string,
  from: PlayerId,
  to: PlayerId,
  give: TradeBundle,
  receive: TradeBundle,
): PlayerId | null {
  if (give.tiles.includes(tileId)) return to;
  if (receive.tiles.includes(tileId)) return from;
  return state.tiles[tileId]?.owner ?? null;
}

/**
 * Prüft die Vereinbarungen eines Angebots. Felder müssen nach dem Tausch dem Gewährenden
 * gehören, so kann man z. B. ein Feld verkaufen und sich Mietfreiheit darauf ausbedingen.
 */
export function validateTerms(
  state: GameState,
  from: PlayerId,
  to: PlayerId,
  give: TradeBundle,
  receive: TradeBundle,
  terms: readonly AgreementTerm[],
): EngineError | null {
  if (!Array.isArray(terms) || terms.length > MAX_TERMS_PER_TRADE)
    return engineError('invalidTrade');
  const int = (n: unknown, min: number, max: number) =>
    Number.isInteger(n) && (n as number) >= min && (n as number) <= max;
  for (const term of terms) {
    if (!int(term.rounds, 1, MAX_AGREEMENT_ROUNDS)) return engineError('invalidTrade');
    if (![from, to].includes(grantor(term))) return engineError('notTradeParty');
    if (term.kind === 'profitShare' && !int(term.percent, 1, 100))
      return engineError('invalidTrade');
    switch (term.kind) {
      case 'installments':
        if (!int(term.amount, 1, MAX_INSTALLMENT)) return engineError('invalidTrade');
        break;
      case 'profitShare':
      case 'rentFree': {
        const tiles = term.tiles;
        if (!Array.isArray(tiles) || tiles.length === 0 || tiles.length > 12)
          return engineError('invalidTrade');
        if (new Set(tiles).size !== tiles.length) return engineError('invalidTrade');
        for (const tileId of tiles) {
          const tile = tileById(state, tileId);
          if (!tile || !isOwnable(tile)) return engineError('unknownTile');
          if (ownerAfter(state, tileId, from, to, give, receive) !== term.owner)
            return engineError('notOwner');
        }
        break;
      }
      default:
        return engineError('invalidTrade');
    }
  }
  return null;
}

/** Nach einem angenommenen Tausch: die Vereinbarungen beginnen. */
export function startAgreements(ctx: Ctx, trade: TradeOffer): void {
  for (const term of trade.terms) {
    const agreement: Agreement = {
      id: `a${ctx.state.nextAgreementId++}`,
      term: structuredClone(term),
      parties: [trade.from, trade.to],
      remainingRounds: term.rounds,
    };
    ctx.state.agreements.push(agreement);
    emit(ctx, { type: 'agreementStarted', agreement });
  }
}

/** Am Rundenende: Raten zahlen, Laufzeiten herunterzählen, abgelaufene beenden. */
export function agreementsRoundEnd(ctx: Ctx): void {
  const state = ctx.state;
  for (const agreement of [...state.agreements]) {
    const { term } = agreement;
    if (term.kind === 'installments')
      charge(ctx, term.payer, otherParty(agreement, term.payer), term.amount, 'agreement');
    agreement.remainingRounds--;
  }
  for (const agreement of state.agreements.filter((a) => a.remainingRounds <= 0))
    emit(ctx, { type: 'agreementEnded', agreementId: agreement.id, reason: 'expired' });
  state.agreements = state.agreements.filter((a) => a.remainingRounds > 0);
}

/** Bankrott oder entfernt: Vereinbarungen mit diesem Spieler enden sofort. */
export function endAgreementsOf(ctx: Ctx, playerId: PlayerId): void {
  const state = ctx.state;
  for (const agreement of state.agreements.filter((a) => a.parties.includes(playerId)))
    emit(ctx, { type: 'agreementEnded', agreementId: agreement.id, reason: 'bankrupt' });
  state.agreements = state.agreements.filter((a) => !a.parties.includes(playerId));
}

/** Vereinbarungen, die auf eine Miete wirken: Mietfreiheit und Gewinnbeteiligungen. */
export function rentAgreements(
  state: GameState,
  tileId: string,
  owner: PlayerId,
  payer: PlayerId,
): { free: Agreement | null; shares: Agreement[] } {
  const applies = (a: Agreement) =>
    (a.term.kind === 'rentFree' || a.term.kind === 'profitShare') &&
    a.term.owner === owner &&
    a.term.tiles.includes(tileId);
  const relevant = state.agreements.filter(applies);
  const free =
    relevant.find((a) => a.term.kind === 'rentFree' && otherParty(a, owner) === payer) ?? null;
  return { free, shares: relevant.filter((a) => a.term.kind === 'profitShare') };
}
