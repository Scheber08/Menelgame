import type { BoardPack, ChoiceOption, DiceConfig, Rules } from '@menelgame/schema';
import type { RngState } from './rng';

export type PlayerId = string;

/** Wer Geld bekommt oder bekommen soll: ein Spieler, die Bank oder der Frei-Parken-Topf. */
export type Party = PlayerId | 'bank' | 'pot';

export interface JailFreeCardRef {
  deckId: string;
  cardId: string;
}

export interface Player {
  id: PlayerId;
  name: string;
  color: string;
  cash: number;
  /** Index des Felds in pack.tiles. */
  position: number;
  inJail: boolean;
  /** Erfolglose Pasch-Versuche im Gefängnis. */
  jailAttempts: number;
  jailFreeCards: JailFreeCardRef[];
  /** Pasch in Folge in diesem Zug. */
  doublesInRow: number;
  /** So viele Züge setzt der Spieler noch aus. */
  skipTurns: number;
  bankrupt: boolean;
}

export interface TileState {
  owner: PlayerId | null;
  /** 0–4 Häuser, 5 = Hotel. */
  buildings: number;
  mortgaged: boolean;
}

export interface DeckState {
  /** Ziehstapel; gezogen wird vorne, abgelegt hinten. Gehaltene Gefängnis-frei-Karten fehlen. */
  drawPile: string[];
}

export interface Debt {
  debtor: PlayerId;
  creditor: Party;
  amount: number;
  reason: MoneyReason;
}

export interface DiceRoll {
  dice: number[];
  total: number;
  isDouble: boolean;
}

/** Wohin es nach Schulden oder einer Auktion weitergeht. */
export type ResumePoint =
  | { kind: 'awaitingRoll' }
  | { kind: 'awaitingPurchase'; tileId: string; extraRoll: boolean }
  | { kind: 'freePhase'; extraRoll: boolean }
  /** Nach erzwungener Kaution: Spieler zieht die gewürfelte Augenzahl. */
  | { kind: 'moveAfterBail'; steps: number }
  | { kind: 'advanceTurn' }
  /** Erst diese Felder versteigern, dann weiter. */
  | { kind: 'auction'; tiles: string[]; then: ResumePoint }
  /** Erst wählen lassen, dann weiter. */
  | { kind: 'choice'; playerId: PlayerId; options: ChoiceOption[]; then: ResumePoint };

export type Phase =
  | { name: 'awaitingRoll' }
  | { name: 'awaitingPurchase'; tileId: string; extraRoll: boolean }
  | { name: 'freePhase'; extraRoll: boolean }
  | { name: 'awaitingDebt'; resume: ResumePoint }
  /** Versteigerung läuft; Details in state.auction. Alle aktiven Spieler dürfen bieten. */
  | { name: 'auction' }
  /** Ein Spieler muss eine Möglichkeit wählen (eigene Feldtypen). */
  | { name: 'awaitingChoice'; playerId: PlayerId; options: ChoiceOption[]; then: ResumePoint }
  | { name: 'gameOver'; winner: PlayerId | null };

export type PhaseName = Phase['name'];

export interface AuctionState {
  tileId: string;
  highestBid: number;
  highestBidder: PlayerId | null;
  /** Spieler, die ausgestiegen sind. */
  passed: PlayerId[];
  /** Weitere Felder, die danach versteigert werden. */
  queue: string[];
  /** Wohin es nach der letzten Versteigerung geht. */
  then: ResumePoint;
}

/** Was eine Seite eines Tauschs abgibt. */
export interface TradeBundle {
  cash: number;
  tiles: string[];
  jailFreeCards: number;
}

/**
 * Vereinbarung mit Laufzeit als Teil eines Tauschs. Begünstigt ist immer die andere Seite
 * des Tauschs.
 *
 * - `rentFree`: Die andere Seite zahlt auf diesen Feldern von `owner` keine Miete.
 * - `installments`: `payer` zahlt der anderen Seite am Ende jeder Runde `amount`.
 * - `profitShare`: Von jeder Miete auf diesen Feldern von `owner` geht `percent` an die
 *   andere Seite.
 */
export type AgreementTerm =
  | { kind: 'rentFree'; owner: PlayerId; tiles: string[]; rounds: number }
  | { kind: 'installments'; payer: PlayerId; amount: number; rounds: number }
  | { kind: 'profitShare'; owner: PlayerId; tiles: string[]; percent: number; rounds: number };

export type AgreementKind = AgreementTerm['kind'];

/** Offenes Tauschangebot, optional mit Vereinbarungen. */
export interface TradeOffer {
  id: string;
  from: PlayerId;
  to: PlayerId;
  /** Was `from` abgibt. */
  give: TradeBundle;
  /** Was `from` dafür bekommt. */
  receive: TradeBundle;
  /** Vereinbarungen, die beim Annehmen beginnen. */
  terms: AgreementTerm[];
  /** Antwort auf dieses Angebot (Gegenangebot), sonst null. */
  counterTo: string | null;
}

/** Laufende Vereinbarung zwischen zwei Spielern. */
export interface Agreement {
  id: string;
  term: AgreementTerm;
  /** Die beiden Seiten des Tauschs. */
  parties: [PlayerId, PlayerId];
  /** Restlaufzeit in Runden; zählt am Rundenende herunter. */
  remainingRounds: number;
}

/** Werte der Pack-Variablen: für das ganze Spiel und pro Spieler. */
export interface VariableState {
  game: Record<string, number>;
  players: Record<PlayerId, Record<string, number>>;
}

export const STATE_VERSION = 4;

export interface GameState {
  stateVersion: typeof STATE_VERSION;
  /** Schnappschuss des Packs beim Spielstart; Brett und Feldtypen bleiben fix. */
  pack: BoardPack;
  /** Aktive Regeln, getrennt vom Pack, damit sie live geändert werden können. */
  rules: Rules;
  dice: DiceConfig;
  rng: RngState;
  players: Player[];
  tiles: Record<string, TileState>;
  bank: { houses: number | null; hotels: number | null };
  decks: Record<string, DeckState>;
  freeParkingPot: number;
  currentPlayer: number;
  phase: Phase;
  debts: Debt[];
  auction: AuctionState | null;
  trades: TradeOffer[];
  /** Gesperrte Felder mit verbleibenden Runden. */
  blockedTiles: Record<string, number>;
  /** Zug, in dem die Zugende-Regeln schon gelaufen sind (sie laufen nur einmal pro Zug). */
  turnEndHandled: number;
  nextTradeId: number;
  agreements: Agreement[];
  nextAgreementId: number;
  variables: VariableState;
  lastRoll: DiceRoll | null;
  /** Zählt ab 1; erhöht sich, wenn der erste aktive Spieler wieder dran ist. */
  round: number;
  /** Fortlaufende Nummer des Zugs. */
  turn: number;
  /** Anzahl angewandter Aktionen. */
  actionCount: number;
}

/** Aktionen, die ein Spieler auslöst. */
export type PlayerAction =
  | { type: 'ROLL_DICE'; playerId: PlayerId }
  | { type: 'BUY'; playerId: PlayerId }
  | { type: 'DECLINE'; playerId: PlayerId }
  | { type: 'END_TURN'; playerId: PlayerId }
  | { type: 'BUILD'; playerId: PlayerId; tileId: string }
  | { type: 'SELL_BUILDING'; playerId: PlayerId; tileId: string }
  | { type: 'MORTGAGE'; playerId: PlayerId; tileId: string }
  | { type: 'UNMORTGAGE'; playerId: PlayerId; tileId: string }
  | { type: 'PAY_BAIL'; playerId: PlayerId }
  | { type: 'USE_JAIL_CARD'; playerId: PlayerId }
  | { type: 'PAY_DEBT'; playerId: PlayerId }
  | { type: 'DECLARE_BANKRUPTCY'; playerId: PlayerId }
  | { type: 'AUCTION_BID'; playerId: PlayerId; amount: number }
  | { type: 'AUCTION_PASS'; playerId: PlayerId }
  | {
      type: 'PROPOSE_TRADE';
      playerId: PlayerId;
      to: PlayerId;
      give: TradeBundle;
      receive: TradeBundle;
      terms?: AgreementTerm[];
    }
  | {
      type: 'COUNTER_TRADE';
      playerId: PlayerId;
      tradeId: string;
      give: TradeBundle;
      receive: TradeBundle;
      terms?: AgreementTerm[];
    }
  | { type: 'ACCEPT_TRADE'; playerId: PlayerId; tradeId: string }
  | { type: 'REJECT_TRADE'; playerId: PlayerId; tradeId: string }
  | { type: 'CANCEL_TRADE'; playerId: PlayerId; tradeId: string }
  | { type: 'CHOOSE'; playerId: PlayerId; option: number };

/**
 * Aktionen ohne Spieler: Uhr (Auktionsende) und Host-Rechte. Der Server bzw. die
 * Hot-Seat-Oberfläche entscheidet, wer sie auslösen darf.
 */
export type SystemAction =
  | { type: 'AUCTION_CLOSE' }
  | { type: 'UPDATE_RULES'; rules: Rules; dice: DiceConfig }
  | { type: 'REMOVE_PLAYER'; targetId: PlayerId };

export type Action = PlayerAction | SystemAction;
export type ActionType = Action['type'];
export type PlayerActionType = PlayerAction['type'];

export function isPlayerAction(action: Action): action is PlayerAction {
  return 'playerId' in action;
}

export type MoneyReason =
  | 'passStart'
  | 'landOnStart'
  | 'purchase'
  | 'rent'
  | 'tax'
  | 'card'
  | 'bail'
  | 'build'
  | 'sellBuilding'
  | 'mortgage'
  | 'unmortgage'
  | 'freeParking'
  | 'auction'
  | 'trade'
  | 'agreement'
  | 'variable'
  | 'bankruptcy';

export type JailReason = 'tile' | 'card' | 'tripleDoubles';

export type GameEvent =
  | { type: 'gameStarted'; playerIds: PlayerId[] }
  | { type: 'turnStarted'; playerId: PlayerId; round: number; turn: number }
  | { type: 'diceRolled'; playerId: PlayerId; dice: number[]; total: number; isDouble: boolean }
  | { type: 'moved'; playerId: PlayerId; from: number; to: number; steps: number }
  | { type: 'teleported'; playerId: PlayerId; from: number; to: number }
  | { type: 'moneyTransferred'; from: Party; to: Party; amount: number; reason: MoneyReason }
  | { type: 'purchaseOffered'; playerId: PlayerId; tileId: string; price: number }
  | { type: 'purchased'; playerId: PlayerId; tileId: string; price: number }
  | { type: 'purchaseDeclined'; playerId: PlayerId; tileId: string }
  | { type: 'auctionStarted'; tileId: string }
  | { type: 'auctionBid'; playerId: PlayerId; tileId: string; amount: number }
  | { type: 'auctionPassed'; playerId: PlayerId; tileId: string }
  | { type: 'auctionWon'; playerId: PlayerId; tileId: string; amount: number }
  | { type: 'auctionUnsold'; tileId: string }
  | { type: 'tradeProposed'; trade: TradeOffer }
  | { type: 'tradeAccepted'; tradeId: string; from: PlayerId; to: PlayerId }
  | { type: 'tradeRejected'; tradeId: string; by: PlayerId }
  | { type: 'tradeCancelled'; tradeId: string; reason: 'withdrawn' | 'invalid' | 'countered' }
  | { type: 'agreementStarted'; agreement: Agreement }
  | { type: 'agreementEnded'; agreementId: string; reason: 'expired' | 'bankrupt' }
  | {
      type: 'rentShared';
      agreementId: string;
      from: PlayerId;
      to: PlayerId;
      tileId: string;
      amount: number;
    }
  | {
      type: 'variableChanged';
      variable: string;
      playerId: PlayerId | null;
      from: number;
      to: number;
    }
  | { type: 'rulesUpdated'; changes: string[] }
  | { type: 'tileEffect'; playerId: PlayerId; tileId: string; trigger: string }
  | { type: 'choiceOffered'; playerId: PlayerId; options: string[] }
  | { type: 'choiceMade'; playerId: PlayerId; option: number; label: string }
  | { type: 'tileBlocked'; tileId: string; rounds: number }
  | { type: 'tileUnblocked'; tileId: string }
  | { type: 'blockedTileLanded'; playerId: PlayerId; tileId: string }
  | { type: 'skipTurnsAdded'; playerId: PlayerId; turns: number }
  | { type: 'turnSkipped'; playerId: PlayerId; remaining: number }
  | { type: 'playerRemoved'; playerId: PlayerId }
  | { type: 'rentDue'; playerId: PlayerId; owner: PlayerId; tileId: string; amount: number }
  | {
      type: 'noRent';
      playerId: PlayerId;
      tileId: string;
      why: 'mortgaged' | 'ownerInJail' | 'agreement';
    }
  | { type: 'cardDrawn'; playerId: PlayerId; deckId: string; cardId: string; text: string }
  | { type: 'deckEmpty'; playerId: PlayerId; deckId: string }
  | { type: 'jailFreeCardKept'; playerId: PlayerId; deckId: string }
  | { type: 'sentToJail'; playerId: PlayerId; reason: JailReason }
  | { type: 'leftJail'; playerId: PlayerId; method: 'doubles' | 'bail' | 'card' | 'forcedBail' }
  | { type: 'jailRollFailed'; playerId: PlayerId; attempt: number }
  | { type: 'built'; playerId: PlayerId; tileId: string; buildings: number; cost: number }
  | { type: 'buildingSold'; playerId: PlayerId; tileId: string; buildings: number; refund: number }
  | { type: 'mortgaged'; playerId: PlayerId; tileId: string; amount: number }
  | { type: 'unmortgaged'; playerId: PlayerId; tileId: string; amount: number }
  | { type: 'debtIncurred'; debtor: PlayerId; creditor: Party; amount: number; reason: MoneyReason }
  | { type: 'debtPaid'; debtor: PlayerId; creditor: Party; amount: number }
  | { type: 'bankrupt'; playerId: PlayerId; creditor: Party }
  | { type: 'propertyTransferred'; tileId: string; from: PlayerId; to: PlayerId | null }
  | { type: 'turnEnded'; playerId: PlayerId }
  | {
      type: 'gameOver';
      winner: PlayerId | null;
      reason: 'lastStanding' | 'maxRounds' | 'targetNetWorth';
      ranking: { playerId: PlayerId; netWorth: number }[];
    };

export type ErrorCode =
  | 'gameOver'
  | 'unknownPlayer'
  | 'unknownTile'
  | 'notYourTurn'
  | 'wrongPhase'
  | 'insufficientFunds'
  | 'notInJail'
  | 'inJail'
  | 'noJailFreeCard'
  | 'mustRollAgain'
  | 'notOwner'
  | 'notBuildable'
  | 'incompleteGroup'
  | 'groupMortgaged'
  | 'maxBuildings'
  | 'noBuildings'
  | 'unevenBuilding'
  | 'bankOutOfHouses'
  | 'bankOutOfHotels'
  | 'mortgaged'
  | 'notMortgaged'
  | 'groupHasBuildings'
  | 'bidTooLow'
  | 'alreadyPassed'
  | 'highestBidder'
  | 'unknownTrade'
  | 'notTradeParty'
  | 'invalidTrade'
  | 'tooManyTrades'
  | 'invalidRules'
  | 'unknownOption';

export interface EngineError {
  code: ErrorCode;
  message: string;
}

export type ApplyResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; state: GameState; events: []; error: EngineError };
