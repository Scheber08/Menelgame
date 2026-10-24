import { charge, emit, finesRecipient, transfer, type Ctx } from './context';
import { calculateRent } from './rent';
import {
  activePlayers,
  buildingCounts,
  getPlayer,
  jailIndex,
  ownableById,
  requirePlayer,
  tileAt,
  tileIndex,
  tileState,
} from './selectors';
import { tileHandler, type EngineEffect, type LandingModifiers } from './tileTypes';
import type { JailReason, Player, PlayerId } from './types';

/** Schutz gegen Endlosketten (z. B. Karte → Kartenfeld → Karte …). */
const MAX_LANDINGS = 16;

/**
 * Auflösung der Bewegung eines Spielers. Sammelt, ob ein Kaufangebot entsteht und ob der
 * Spieler ins Gefängnis musste; beides beendet die Kette.
 */
export interface Resolution {
  ctx: Ctx;
  playerId: PlayerId;
  offer: string | null;
  jailed: boolean;
  landings: number;
}

export function startResolution(ctx: Ctx, playerId: PlayerId): Resolution {
  return { ctx, playerId, offer: null, jailed: false, landings: 0 };
}

function player(r: Resolution): Player {
  return requirePlayer(r.ctx.state, r.playerId);
}

export function runEffects(r: Resolution, effects: readonly EngineEffect[]): void {
  for (const effect of effects) {
    if (r.jailed) return;
    runEffect(r, effect);
  }
}

function runEffect(r: Resolution, effect: EngineEffect): void {
  const { ctx } = r;
  const state = ctx.state;
  const others = () => activePlayers(state).filter((p) => p.id !== r.playerId);

  switch (effect.kind) {
    case 'collect':
      transfer(ctx, 'bank', r.playerId, effect.amount, 'card');
      return;
    case 'pay':
      charge(ctx, r.playerId, finesRecipient(ctx), effect.amount, 'card');
      return;
    case 'collectFromEach':
      for (const other of others()) charge(ctx, other.id, r.playerId, effect.amount, 'card');
      return;
    case 'payEach':
      for (const other of others()) charge(ctx, r.playerId, other.id, effect.amount, 'card');
      return;
    case 'repairs': {
      const { houses, hotels } = buildingCounts(state, r.playerId);
      const amount = houses * effect.perHouse + hotels * effect.perHotel;
      charge(ctx, r.playerId, finesRecipient(ctx), amount, 'card');
      return;
    }
    case 'moveTo':
      moveToTile(r, tileIndex(state, effect.tile), effect.passTiles);
      return;
    case 'moveBy':
      moveBy(r, effect.steps);
      return;
    case 'moveToNearest':
      moveToNearest(r, effect.tileType, {
        ...(effect.rentMultiplier !== undefined && { rentMultiplier: effect.rentMultiplier }),
        ...(effect.utilityDiceMultiplier !== undefined && {
          utilityDiceMultiplier: effect.utilityDiceMultiplier,
        }),
      });
      return;
    case 'goToJail':
      sendToJail(r, 'card');
      return;
    case 'sendToJail':
      sendToJail(r, effect.reason);
      return;
    case 'jailFreeCard':
      // Die Karte selbst wurde beim Ziehen schon dem Spieler gegeben (drawCard).
      return;
    case 'startBonus':
      transfer(ctx, 'bank', r.playerId, state.rules.passStartBonus, 'passStart');
      if (effect.landed)
        transfer(ctx, 'bank', r.playerId, state.rules.landOnStartExtra, 'landOnStart');
      return;
    case 'landOnOwnable':
      landOnOwnable(r, effect.tileId, effect.modifiers);
      return;
    case 'drawCard':
      drawCard(r, effect.deck);
      return;
    case 'tax':
      charge(ctx, r.playerId, finesRecipient(ctx), effect.amount, 'tax');
      return;
    case 'collectPot':
      if (state.rules.freeParkingPot)
        transfer(ctx, 'pot', r.playerId, state.freeParkingPot, 'freeParking');
      return;
  }
}

/** Löst das Feld aus, auf dem der Spieler gerade steht. */
export function landOnCurrentTile(r: Resolution, modifiers: LandingModifiers = {}): void {
  if (r.landings >= MAX_LANDINGS) return;
  r.landings++;
  const tile = tileAt(r.ctx.state, player(r).position);
  const effects = tileHandler(tile).onLand?.(tile, modifiers) ?? [];
  runEffects(r, effects);
}

/** Vorwärts ziehen; überquerte Felder lösen onPass aus, das Zielfeld onLand. */
export function moveForward(r: Resolution, steps: number, modifiers: LandingModifiers = {}): void {
  const state = r.ctx.state;
  const p = player(r);
  const n = state.pack.tiles.length;
  const from = p.position;
  const to = (from + steps) % n;
  p.position = to;
  emit(r.ctx, { type: 'moved', playerId: p.id, from, to, steps });
  for (let i = 1; i < steps && !r.jailed; i++) {
    const tile = tileAt(state, (from + i) % n);
    const onPass = tileHandler(tile).onPass;
    if (onPass) runEffects(r, onPass(tile));
  }
  if (!r.jailed) landOnCurrentTile(r, modifiers);
}

function moveBy(r: Resolution, steps: number): void {
  if (steps >= 0) {
    moveForward(r, steps);
    return;
  }
  const p = player(r);
  const n = r.ctx.state.pack.tiles.length;
  const from = p.position;
  p.position = (((from + steps) % n) + n) % n;
  emit(r.ctx, { type: 'moved', playerId: p.id, from, to: p.position, steps });
  landOnCurrentTile(r);
}

function moveToTile(r: Resolution, target: number, passTiles: boolean): void {
  const p = player(r);
  const n = r.ctx.state.pack.tiles.length;
  const steps = (target - p.position + n) % n;
  if (passTiles && steps > 0) {
    moveForward(r, steps);
    return;
  }
  const from = p.position;
  p.position = target;
  emit(r.ctx, { type: 'teleported', playerId: p.id, from, to: target });
  landOnCurrentTile(r);
}

function moveToNearest(r: Resolution, type: string, modifiers: LandingModifiers): void {
  const state = r.ctx.state;
  const n = state.pack.tiles.length;
  const from = player(r).position;
  for (let k = 1; k <= n; k++) {
    if (tileAt(state, (from + k) % n).type === type) {
      moveForward(r, k, modifiers);
      return;
    }
  }
}

export function sendToJail(r: Resolution, reason: JailReason): void {
  const p = player(r);
  p.position = jailIndex(r.ctx.state);
  p.inJail = true;
  p.jailAttempts = 0;
  p.doublesInRow = 0;
  r.jailed = true;
  emit(r.ctx, { type: 'sentToJail', playerId: p.id, reason });
}

function landOnOwnable(r: Resolution, tileId: string, modifiers: LandingModifiers): void {
  const state = r.ctx.state;
  const tile = ownableById(state, tileId);
  if (!tile) return;
  const ts = tileState(state, tileId);

  if (ts.owner === null) {
    r.offer = tileId;
    emit(r.ctx, { type: 'purchaseOffered', playerId: r.playerId, tileId, price: tile.price });
    return;
  }
  if (ts.owner === r.playerId) return;

  if (ts.mortgaged) {
    emit(r.ctx, { type: 'noRent', playerId: r.playerId, tileId, why: 'mortgaged' });
    return;
  }
  const owner = getPlayer(state, ts.owner);
  if (owner?.inJail && !state.rules.jail.collectRentInJail) {
    emit(r.ctx, { type: 'noRent', playerId: r.playerId, tileId, why: 'ownerInJail' });
    return;
  }
  const amount = calculateRent(state, tile, ts.owner, modifiers);
  emit(r.ctx, { type: 'rentDue', playerId: r.playerId, owner: ts.owner, tileId, amount });
  charge(r.ctx, r.playerId, ts.owner, amount, 'rent');
}

function drawCard(r: Resolution, deckId: string): void {
  const state = r.ctx.state;
  const deck = state.decks[deckId];
  const definition = state.pack.decks.find((d) => d.id === deckId);
  const cardId = deck?.drawPile.shift();
  const card = definition?.cards.find((c) => c.id === cardId);
  if (!deck || !card) {
    emit(r.ctx, { type: 'deckEmpty', playerId: r.playerId, deckId });
    return;
  }
  emit(r.ctx, {
    type: 'cardDrawn',
    playerId: r.playerId,
    deckId,
    cardId: card.id,
    text: card.text,
  });

  if (card.effects.some((e) => e.kind === 'jailFreeCard')) {
    player(r).jailFreeCards.push({ deckId, cardId: card.id });
    emit(r.ctx, { type: 'jailFreeCardKept', playerId: r.playerId, deckId });
  } else {
    deck.drawPile.push(card.id);
  }
  runEffects(r, card.effects);
}
