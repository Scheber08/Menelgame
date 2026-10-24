import { isOwnable, type BoardPack, type DiceConfig, type Rules } from '@menelgame/schema';
import { createRng, shuffle } from './rng';
import {
  STATE_VERSION,
  type DeckState,
  type GameState,
  type Player,
  type TileState,
} from './types';

export interface PlayerSetup {
  id: string;
  name: string;
  color: string;
}

export interface GameSetup {
  pack: BoardPack;
  players: PlayerSetup[];
  /** Startwert für den Zufallsgenerator (uint32). */
  seed: number;
  /** Regeln abweichend vom Pack, z. B. aus einem Regelset. */
  rules?: Rules;
  dice?: DiceConfig;
}

const RESERVED_IDS = new Set(['bank', 'pot']);

/** Erzeugt den Startzustand. Wirft bei ungültiger Konfiguration (keine Spielaktion). */
export function createGame(setup: GameSetup): GameState {
  const { pack, players } = setup;
  if (players.length < 2) throw new Error('Mindestens zwei Spieler erforderlich');
  if (players.length > pack.maxPlayers)
    throw new Error(`Dieses Pack erlaubt höchstens ${pack.maxPlayers} Spieler`);
  const ids = new Set(players.map((p) => p.id));
  if (ids.size !== players.length) throw new Error('Spieler-IDs müssen eindeutig sein');
  for (const id of ids) if (RESERVED_IDS.has(id)) throw new Error(`Reservierte Spieler-ID ${id}`);

  const rules = structuredClone(setup.rules ?? pack.rules);
  const dice = structuredClone(setup.dice ?? pack.dice);
  const rng = createRng(setup.seed);
  const start = pack.tiles.findIndex((t) => t.type === 'start');

  const tiles: Record<string, TileState> = {};
  for (const tile of pack.tiles) {
    if (isOwnable(tile)) tiles[tile.id] = { owner: null, buildings: 0, mortgaged: false };
  }

  const decks: Record<string, DeckState> = {};
  for (const deck of pack.decks) {
    decks[deck.id] = {
      drawPile: shuffle(
        rng,
        deck.cards.map((c) => c.id),
      ),
    };
  }

  const initialPlayers: Player[] = players.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    cash: rules.startingCash,
    position: Math.max(0, start),
    inJail: false,
    jailAttempts: 0,
    jailFreeCards: [],
    doublesInRow: 0,
    skipTurns: 0,
    bankrupt: false,
  }));

  return {
    stateVersion: STATE_VERSION,
    pack,
    rules,
    dice,
    rng,
    players: initialPlayers,
    tiles,
    bank: { houses: rules.buildingLimit.houses, hotels: rules.buildingLimit.hotels },
    decks,
    freeParkingPot: 0,
    currentPlayer: 0,
    phase: { name: 'awaitingRoll' },
    debts: [],
    auction: null,
    trades: [],
    nextTradeId: 1,
    blockedTiles: {},
    turnEndHandled: 0,
    agreements: [],
    lastRoll: null,
    round: 1,
    turn: 1,
    actionCount: 0,
  };
}
