import type { GameEvent, GameState, PlayerAction, PlayerId } from '@menelgame/engine';
import { ColorSchema, type DiceConfig, type Rules } from '@menelgame/schema';
import { z } from 'zod';

/**
 * Protokoll zwischen Browser und Spielraum (WebSocket, JSON). Clients schicken nur Wünsche
 * und Aktionen; der Raum hält den autoritativen Zustand und verteilt ihn.
 */

/** Farben für Spielfiguren (auch für Bots). */
export const PLAYER_COLORS = [
  '#e5484d',
  '#3e63dd',
  '#30a46c',
  '#f5a524',
  '#8e4ec6',
  '#12a594',
  '#d6409f',
  '#6e6e6e',
] as const;

export const BotLevelSchema = z.enum(['easy', 'medium', 'hard']);
export type BotLevel = z.infer<typeof BotLevelSchema>;

export const BOT_NAMES = [
  'Bot Anton',
  'Bot Berta',
  'Bot Carlo',
  'Bot Dora',
  'Bot Emil',
  'Bot Fiona',
  'Bot Gustav',
  'Bot Hanna',
];

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;

/** Pfade, die der Worker selbst beantwortet; alles andere sind statische Dateien. */
export const roomSocketPath = (code: string) => `/r/${code}/ws`;
export const roomInvitePath = (code: string) => `/r/${code}`;

const Id = z.string().min(1).max(64);
const Money = z.int().min(0).max(1_000_000_000);

export const TradeBundleSchema = z.object({
  cash: Money,
  tiles: z.array(Id).max(60),
  jailFreeCards: z.int().min(0).max(20),
});

const Rounds = z.int().min(1).max(20);

/** Vereinbarungen mit Laufzeit im Handel; die Engine prüft Besitz und Beteiligte. */
export const AgreementTermSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('rentFree'),
    owner: Id,
    tiles: z.array(Id).min(1).max(12),
    rounds: Rounds,
  }),
  z.object({
    kind: z.literal('installments'),
    payer: Id,
    amount: z.int().min(1).max(5000),
    rounds: Rounds,
  }),
  z.object({
    kind: z.literal('profitShare'),
    owner: Id,
    tiles: z.array(Id).min(1).max(12),
    percent: z.int().min(1).max(100),
    rounds: Rounds,
  }),
]);
const Terms = z.array(AgreementTermSchema).max(3).default([]);

const plain = <T extends string>(type: T) => z.object({ type: z.literal(type) });
const onTile = <T extends string>(type: T) => z.object({ type: z.literal(type), tileId: Id });
const onTrade = <T extends string>(type: T) => z.object({ type: z.literal(type), tradeId: Id });

/** Aktion ohne playerId – der Raum setzt den Spieler aus der Verbindung ein. */
export const ActionInputSchema = z.discriminatedUnion('type', [
  plain('ROLL_DICE'),
  plain('BUY'),
  plain('DECLINE'),
  plain('END_TURN'),
  plain('PAY_BAIL'),
  plain('USE_JAIL_CARD'),
  plain('PAY_DEBT'),
  plain('DECLARE_BANKRUPTCY'),
  plain('AUCTION_PASS'),
  onTile('BUILD'),
  onTile('SELL_BUILDING'),
  onTile('MORTGAGE'),
  onTile('UNMORTGAGE'),
  z.object({ type: z.literal('AUCTION_BID'), amount: Money }),
  z.object({
    type: z.literal('PROPOSE_TRADE'),
    to: Id,
    give: TradeBundleSchema,
    receive: TradeBundleSchema,
    terms: Terms,
  }),
  z.object({
    type: z.literal('COUNTER_TRADE'),
    tradeId: Id,
    give: TradeBundleSchema,
    receive: TradeBundleSchema,
    terms: Terms,
  }),
  onTrade('ACCEPT_TRADE'),
  onTrade('REJECT_TRADE'),
  onTrade('CANCEL_TRADE'),
  z.object({ type: z.literal('CHOOSE'), option: z.int().min(0).max(3) }),
]);

export type ActionInput = z.infer<typeof ActionInputSchema>;

export function withPlayer(input: ActionInput, playerId: PlayerId): PlayerAction {
  return { ...input, playerId } as PlayerAction;
}

export const SeatNameSchema = z.string().trim().min(1).max(20);

/** Geheime Lobby-Karten: einfache feste Aktionen, Beträge begrenzt durch den Host. */
export const MAX_LOBBY_CARDS = 2;

export const LobbyCardEffectSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('collect'), amount: Money }),
  z.object({ kind: z.literal('pay'), amount: Money }),
  z.object({ kind: z.literal('collectFromEach'), amount: Money }),
  z.object({ kind: z.literal('payEach'), amount: Money }),
  z.object({ kind: z.literal('moveTo'), tile: Id }),
  z.object({ kind: z.literal('moveBy'), steps: z.int().min(-12).max(12) }),
  z.object({ kind: z.literal('goToJail') }),
  z.object({ kind: z.literal('jailFreeCard') }),
]);

export const LobbyCardSchema = z.object({
  text: z.string().trim().min(1).max(160),
  effects: z.array(LobbyCardEffectSchema).min(1).max(3),
});

export type LobbyCard = z.infer<typeof LobbyCardSchema>;
export type LobbyCardEffect = z.infer<typeof LobbyCardEffectSchema>;

export const LobbyCardRulesSchema = z.object({
  enabled: z.boolean(),
  /** Höchstbetrag pro Geld-Aktion. */
  maxAmount: z.int().min(0).max(5000),
});

export type LobbyCardRules = z.infer<typeof LobbyCardRulesSchema>;

/** Höchster Betrag einer Lobby-Karte (für die Prüfung gegen das Limit des Hosts). */
export function lobbyCardMaxAmount(card: LobbyCard): number {
  return Math.max(0, ...card.effects.map((e) => ('amount' in e ? e.amount : 0)));
}

export const LOBBY_CARD_PREFIX = 'lobby-';

/** Größe eines eigenen Packs in einer WebSocket-Nachricht (wie bei der API). */
export const MAX_CUSTOM_PACK_BYTES = 256 * 1024;

export const ClientMessageSchema = z.discriminatedUnion('t', [
  /** Erste Nachricht: mit Token den eigenen Platz zurückholen, sonst zuschauen. */
  z.object({ t: z.literal('hello'), token: z.string().max(128).optional() }),
  /** In der Lobby einen Platz nehmen. */
  z.object({ t: z.literal('join'), name: SeatNameSchema, color: ColorSchema }),
  z.object({ t: z.literal('updateSeat'), name: SeatNameSchema, color: ColorSchema }),
  /** Host in der Lobby: Bot-Platz hinzufügen. */
  z.object({ t: z.literal('addBot'), level: BotLevelSchema }),
  /** Host: Bot-Vertretung (null = nie) und Lobby-Karten einstellen. */
  z.object({
    t: z.literal('roomSettings'),
    botTakeoverSeconds: z.int().min(10).max(3600).nullable().optional(),
    lobbyCards: LobbyCardRulesSchema.optional(),
  }),
  /**
   * Host in der Lobby: Brett und Regeln wählen. Eigene Packs schickt der Browser vollständig
   * mit; der Raum prüft und speichert sie als Schnappschuss.
   */
  z.object({
    t: z.literal('configure'),
    packId: Id,
    customPack: z.unknown().optional(),
    rules: z.unknown(),
    dice: z.unknown(),
  }),
  /** Eigene geheime Lobby-Karten setzen (ersetzt die bisherigen). */
  z.object({ t: z.literal('setLobbyCards'), cards: z.array(LobbyCardSchema).max(MAX_LOBBY_CARDS) }),
  z.object({ t: z.literal('start') }),
  z.object({ t: z.literal('action'), action: ActionInputSchema }),
  /** Host: Platz entfernen (Lobby) bzw. Spieler aus dem Spiel nehmen. */
  z.object({ t: z.literal('kick'), seatId: Id }),
  z.object({ t: z.literal('pause'), paused: z.boolean() }),
  /** Host im Spiel: Regelwerte live ändern. */
  z.object({ t: z.literal('updateRules'), rules: z.unknown(), dice: z.unknown() }),
  z.object({ t: z.literal('ping') }),
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export interface SeatView {
  id: PlayerId;
  name: string;
  color: string;
  connected: boolean;
  /** Bot-Platz und Stufe; null für Menschen. */
  bot: BotLevel | null;
  /** Ein Bot vertritt den abwesenden Menschen. */
  standIn: boolean;
}

export interface Deadline {
  kind: 'turn' | 'auction';
  /** Zeitpunkt in ms (Uhr des Servers). */
  at: number;
}

export interface RoomView {
  code: string;
  status: 'lobby' | 'playing' | 'finished';
  hostSeatId: PlayerId | null;
  seats: SeatView[];
  packId: string;
  pack: {
    name: string;
    tiles: { id: string; name: string }[];
    maxPlayers: number;
    custom: boolean;
  };
  rules: Rules;
  dice: DiceConfig;
  paused: boolean;
  deadline: Deadline | null;
  botTakeoverSeconds: number | null;
  lobbyCards: LobbyCardRules & { counts: Record<PlayerId, number> };
  /** Serverzeit beim Senden, damit Clients ihre Uhr abgleichen können. */
  serverTime: number;
}

export type ErrorCode =
  | 'badMessage'
  | 'notInLobby'
  | 'notPlaying'
  | 'roomFull'
  | 'colorTaken'
  | 'alreadySeated'
  | 'notSeated'
  | 'notHost'
  | 'unknownPack'
  | 'invalidRules'
  | 'tooFewPlayers'
  | 'tooManyPlayers'
  | 'paused'
  | 'unknownSeat'
  | 'kicked'
  | 'invalidPack'
  | 'lobbyCardsDisabled'
  | 'lobbyCardTooExpensive'
  | 'unknownTile'
  | 'engine';

export type ServerMessage =
  | { t: 'welcome'; seatId: PlayerId | null; token: string | null; room: RoomView }
  | { t: 'room'; room: RoomView }
  /**
   * Neuer Spielzustand. `reset` heißt: `events` ist der jüngste Verlauf (z. B. nach einem
   * Reconnect), sonst nur die Ereignisse der letzten Aktion.
   */
  | { t: 'game'; state: GameState; events: GameEvent[]; reset: boolean }
  | { t: 'error'; code: ErrorCode; engineCode?: string; message?: string }
  /** Die eigenen Lobby-Karten (nur an den Besitzer). */
  | { t: 'myLobbyCards'; cards: LobbyCard[] }
  | { t: 'pong'; serverTime: number };

export interface CreateRoomResponse {
  code: string;
}

export interface RoomInfoResponse {
  code: string;
  status: RoomView['status'];
  seats: number;
  maxPlayers: number;
}
export * from './api';
export * from './stats';

/**
 * Zustand für Clients: ohne Zufallszustand (künftige Würfe), ohne Kartenreihenfolge und
 * ohne Text geheimer Lobby-Karten. Gezogene Karten erscheinen weiterhin im Ereignis.
 */
export function publicGameState(state: GameState): GameState {
  return {
    ...state,
    rng: { state: 0 },
    decks: Object.fromEntries(Object.keys(state.decks).map((id) => [id, { drawPile: [] }])),
    pack: {
      ...state.pack,
      decks: state.pack.decks.map((deck) => ({
        ...deck,
        cards: deck.cards.map((card) =>
          card.id.startsWith(LOBBY_CARD_PREFIX)
            ? { ...card, text: '???', effects: [{ kind: 'collect' as const, amount: 0 }] }
            : card,
        ),
      })),
    },
  };
}
