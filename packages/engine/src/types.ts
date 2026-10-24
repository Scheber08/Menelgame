import type { BoardPack, DiceConfig, Rules } from '@menelgame/schema';
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

/** Wohin es nach dem Begleichen aller Schulden weitergeht. */
export type ResumePoint =
  | { kind: 'awaitingPurchase'; tileId: string; extraRoll: boolean }
  | { kind: 'freePhase'; extraRoll: boolean }
  /** Nach erzwungener Kaution: Spieler zieht die gewürfelte Augenzahl. */
  | { kind: 'moveAfterBail'; steps: number }
  | { kind: 'advanceTurn' };

export type Phase =
  | { name: 'awaitingRoll' }
  | { name: 'awaitingPurchase'; tileId: string; extraRoll: boolean }
  | { name: 'freePhase'; extraRoll: boolean }
  | { name: 'awaitingDebt'; resume: ResumePoint }
  | { name: 'gameOver'; winner: PlayerId | null };

/**
 * Laufende Vereinbarung zwischen Spielern (Phase 6: Mietfreiheit, Ratenzahlung,
 * Gewinnbeteiligung). In Phase 1 immer leer, aber bereits Teil des Zustands.
 */
export interface Agreement {
  id: string;
  kind: string;
  parties: PlayerId[];
  /** Restlaufzeit in Runden; null = unbefristet. */
  remainingRounds: number | null;
  data: Record<string, unknown>;
}

export const STATE_VERSION = 1;

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
  agreements: Agreement[];
  lastRoll: DiceRoll | null;
  /** Zählt ab 1; erhöht sich, wenn der erste aktive Spieler wieder dran ist. */
  round: number;
  /** Fortlaufende Nummer des Zugs. */
  turn: number;
  /** Anzahl angewandter Aktionen. */
  actionCount: number;
}

export type Action =
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
  | { type: 'DECLARE_BANKRUPTCY'; playerId: PlayerId };

export type ActionType = Action['type'];

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
  | { type: 'auctionSkipped'; tileId: string }
  | { type: 'rentDue'; playerId: PlayerId; owner: PlayerId; tileId: string; amount: number }
  | { type: 'noRent'; playerId: PlayerId; tileId: string; why: 'mortgaged' | 'ownerInJail' }
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
  | 'groupHasBuildings';

export interface EngineError {
  code: ErrorCode;
  message: string;
}

export type ApplyResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; state: GameState; events: []; error: EngineError };
