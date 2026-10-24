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

export const BotLevelSchema = z.enum(['easy', 'medium']);
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
  }),
  z.object({
    type: z.literal('COUNTER_TRADE'),
    tradeId: Id,
    give: TradeBundleSchema,
    receive: TradeBundleSchema,
  }),
  onTrade('ACCEPT_TRADE'),
  onTrade('REJECT_TRADE'),
  onTrade('CANCEL_TRADE'),
]);

export type ActionInput = z.infer<typeof ActionInputSchema>;

export function withPlayer(input: ActionInput, playerId: PlayerId): PlayerAction {
  return { ...input, playerId } as PlayerAction;
}

export const SeatNameSchema = z.string().trim().min(1).max(20);

export const ClientMessageSchema = z.discriminatedUnion('t', [
  /** Erste Nachricht: mit Token den eigenen Platz zurückholen, sonst zuschauen. */
  z.object({ t: z.literal('hello'), token: z.string().max(128).optional() }),
  /** In der Lobby einen Platz nehmen. */
  z.object({ t: z.literal('join'), name: SeatNameSchema, color: ColorSchema }),
  z.object({ t: z.literal('updateSeat'), name: SeatNameSchema, color: ColorSchema }),
  /** Host in der Lobby: Bot-Platz hinzufügen. */
  z.object({ t: z.literal('addBot'), level: BotLevelSchema }),
  /** Host: nach wie vielen Sekunden Abwesenheit ein Bot übernimmt (null = nie). */
  z.object({
    t: z.literal('roomSettings'),
    botTakeoverSeconds: z.int().min(10).max(3600).nullable(),
  }),
  /** Host in der Lobby: Brett und Regeln wählen. */
  z.object({
    t: z.literal('configure'),
    packId: Id,
    rules: z.unknown(),
    dice: z.unknown(),
  }),
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
  rules: Rules;
  dice: DiceConfig;
  paused: boolean;
  deadline: Deadline | null;
  botTakeoverSeconds: number | null;
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
