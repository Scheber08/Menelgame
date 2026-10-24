import type { GameState, PlayerId } from '@menelgame/engine';

/**
 * Sicht eines Bots auf das Spiel: alles, was auch Menschen am Bildschirm sehen. Verborgen
 * sind der Zufallsgenerator (künftige Würfe) und die Reihenfolge der Kartenstapel – so
 * kann ein Bot nicht schummeln.
 */
export function botView(state: GameState): GameState {
  return {
    ...state,
    rng: { state: 0 },
    decks: Object.fromEntries(Object.keys(state.decks).map((id) => [id, { drawPile: [] }])),
  };
}

/** Deterministische Pseudozufallszahl in [0, 1) aus Spielstand, Spieler und Anlass. */
export function chance(state: GameState, playerId: PlayerId, salt: string): number {
  const input = `${state.actionCount}|${state.turn}|${playerId}|${salt}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 4294967296;
}

/** Kleines Gedächtnis pro Bot, z. B. um Angebote nicht ständig zu wiederholen. */
export interface BotMemory {
  lastProposalTurn: number;
}

export function newBotMemory(): BotMemory {
  return { lastProposalTurn: -1 };
}
