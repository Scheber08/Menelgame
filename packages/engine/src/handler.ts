import type { Ctx } from './context';
import type { Action, ActionType, EngineError, ErrorCode, GameState, PhaseName } from './types';

export type ActionOf<T extends ActionType> = Extract<Action, { type: T }>;

/**
 * Wer eine Aktion auslösen darf:
 * - acting: nur der handelnde Spieler (am Zug bzw. Schuldner)
 * - anyPlayer: jeder aktive Spieler (Auktion, Handel)
 * - system: Uhr bzw. Host, ohne Spieler
 */
export type Actor = 'acting' | 'anyPlayer' | 'system';

export interface ActionHandler<T extends ActionType> {
  actor?: Actor;
  /** Phasen, in denen die Aktion erlaubt ist. */
  phases: readonly PhaseName[];
  /** Zusätzliche Prüfungen; Spieler und Phase sind schon geprüft. */
  validate?: (state: GameState, action: ActionOf<T>) => EngineError | null;
  execute: (ctx: Ctx, action: ActionOf<T>) => void;
}

export const ALL_PHASES: readonly PhaseName[] = [
  'awaitingRoll',
  'awaitingPurchase',
  'freePhase',
  'awaitingDebt',
  'auction',
  'awaitingChoice',
];

const MESSAGES: Record<ErrorCode, string> = {
  gameOver: 'Das Spiel ist vorbei.',
  unknownPlayer: 'Unbekannter Spieler.',
  unknownTile: 'Unbekanntes Feld.',
  notYourTurn: 'Du bist nicht am Zug.',
  wrongPhase: 'Diese Aktion ist gerade nicht möglich.',
  insufficientFunds: 'Nicht genug Geld.',
  notInJail: 'Du bist nicht im Gefängnis.',
  inJail: 'Im Gefängnis nicht möglich.',
  noJailFreeCard: 'Keine Gefängnis-frei-Karte vorhanden.',
  mustRollAgain: 'Nach einem Pasch musst du noch einmal würfeln.',
  notOwner: 'Das Feld gehört dir nicht.',
  notBuildable: 'Auf diesem Feld kann nicht gebaut werden.',
  incompleteGroup: 'Dir gehört nicht die ganze Gruppe.',
  groupMortgaged: 'Ein Feld der Gruppe ist mit einer Hypothek belastet.',
  maxBuildings: 'Hier steht schon ein Hotel.',
  noBuildings: 'Hier stehen keine Gebäude.',
  unevenBuilding: 'Es muss gleichmäßig gebaut werden.',
  bankOutOfHouses: 'Die Bank hat keine Häuser mehr.',
  bankOutOfHotels: 'Die Bank hat keine Hotels mehr.',
  mortgaged: 'Das Feld ist bereits mit einer Hypothek belastet.',
  notMortgaged: 'Das Feld hat keine Hypothek.',
  groupHasBuildings: 'Erst alle Gebäude der Gruppe verkaufen.',
  bidTooLow: 'Das Gebot ist zu niedrig.',
  alreadyPassed: 'Du bist aus dieser Auktion ausgestiegen.',
  highestBidder: 'Du hast das Höchstgebot und kannst nicht aussteigen.',
  unknownTrade: 'Dieses Angebot gibt es nicht mehr.',
  notTradeParty: 'Das Angebot betrifft dich nicht.',
  invalidTrade: 'Das Angebot ist so nicht möglich.',
  tooManyTrades: 'Zu viele offene Angebote.',
  invalidRules: 'Ungültige Regelwerte.',
  unknownOption: 'Diese Möglichkeit gibt es nicht.',
};

export function engineError(code: ErrorCode): EngineError {
  return { code, message: MESSAGES[code] };
}
