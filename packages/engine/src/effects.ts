import type { ChoiceOption, Condition, CustomTile, Trigger } from '@menelgame/schema';
import { otherParty, rentAgreements } from './agreements';
import { charge, emit, finesRecipient, transfer, type Ctx } from './context';
import { calculateRent } from './rent';
import { nextFloat } from './rng';
import {
  activePlayers,
  buildingCounts,
  getPlayer,
  ownsWholeGroup,
  jailIndex,
  ownableById,
  requirePlayer,
  tileAt,
  tileIndex,
  tileState,
} from './selectors';
import { tileHandler, type EngineEffect, type LandingModifiers } from './tileTypes';
import type { GameState, JailReason, Player, PlayerId } from './types';

/** Schutz gegen Endlosketten (z. B. Karte → Kartenfeld → Karte …). */
const MAX_LANDINGS = 16;

/**
 * Auflösung der Bewegung eines Spielers. Sammelt, ob ein Kaufangebot entsteht, ob der
 * Spieler ins Gefängnis musste und ob er etwas wählen soll; Gefängnis und Auswahl beenden
 * die Kette.
 */
export interface Resolution {
  ctx: Ctx;
  playerId: PlayerId;
  offer: string | null;
  jailed: boolean;
  choice: ChoiceOption[] | null;
  landings: number;
}

export function startResolution(ctx: Ctx, playerId: PlayerId): Resolution {
  return { ctx, playerId, offer: null, jailed: false, choice: null, landings: 0 };
}

function stopped(r: Resolution): boolean {
  return r.jailed || r.choice !== null;
}

function player(r: Resolution): Player {
  return requirePlayer(r.ctx.state, r.playerId);
}

export function runEffects(r: Resolution, effects: readonly EngineEffect[]): void {
  for (const effect of effects) {
    if (stopped(r)) return;
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
    case 'payPercent': {
      const amount = Math.floor((player(r).cash * effect.percent) / 100);
      charge(ctx, r.playerId, finesRecipient(ctx), amount, 'card');
      return;
    }
    case 'moveToNextOfType':
      moveToNextOfType(r, effect.tileType, effect.passTiles, effect.land);
      return;
    case 'blockTile': {
      const tile = tileAt(state, player(r).position);
      state.blockedTiles[tile.id] = effect.rounds;
      emit(ctx, { type: 'tileBlocked', tileId: tile.id, rounds: effect.rounds });
      return;
    }
    case 'skipTurns':
      player(r).skipTurns += effect.turns;
      emit(ctx, { type: 'skipTurnsAdded', playerId: r.playerId, turns: effect.turns });
      return;
    case 'setVariable':
      setVariable(r, effect.variable, effect.op, effect.value);
      return;
    case 'collectVariable': {
      const amount = Math.trunc(
        (variableValue(state, effect.variable, r.playerId) * effect.percent) / 100,
      );
      if (amount > 0) transfer(ctx, 'bank', r.playerId, amount, 'variable');
      else charge(ctx, r.playerId, finesRecipient(ctx), -amount, 'variable');
      return;
    }
    case 'choice':
      r.choice = effect.options;
      emit(ctx, {
        type: 'choiceOffered',
        playerId: r.playerId,
        options: effect.options.map((o) => o.label),
      });
      return;
    case 'customRules': {
      const tile = state.pack.tiles.find((t) => t.id === effect.tileId);
      if (tile?.type === 'custom') runCustomRules(r, tile, effect.trigger);
      return;
    }
  }
}

/** Hat ein eigener Feldtyp Regeln für diesen Auslöser? */
export function hasRules(r: Resolution | Ctx, tile: CustomTile, trigger: Trigger): boolean {
  const state = 'ctx' in r ? r.ctx.state : r.state;
  const type = state.pack.tileTypes.find((t) => t.id === tile.tileType);
  return type?.rules.some((rule) => rule.trigger === trigger) ?? false;
}

/** Regeln eines eigenen Feldtyps: Bedingungen prüfen, dann die Aktionen ausführen. */
export function runCustomRules(r: Resolution, tile: CustomTile, trigger: Trigger): void {
  const state = r.ctx.state;
  const type = state.pack.tileTypes.find((t) => t.id === tile.tileType);
  if (!type) return;
  for (const rule of type.rules) {
    if (stopped(r)) return;
    if (rule.trigger !== trigger || !rule.conditions.every((c) => conditionHolds(r, c))) continue;
    emit(r.ctx, { type: 'tileEffect', playerId: r.playerId, tileId: tile.id, trigger });
    runEffects(r, rule.effects);
  }
}

function conditionHolds(r: Resolution, condition: Condition): boolean {
  const state = r.ctx.state;
  const p = player(r);
  const cmp = (value: number, op: 'lt' | 'gte' | 'eq', target: number) =>
    op === 'lt' ? value < target : op === 'gte' ? value >= target : value === target;
  switch (condition.kind) {
    case 'cash':
      return cmp(p.cash, condition.op, condition.amount);
    case 'diceTotal':
      return cmp(state.lastRoll?.total ?? 0, condition.op, condition.value);
    case 'double':
      return (state.lastRoll?.isDouble ?? false) === condition.value;
    case 'buildings': {
      const { houses, hotels } = buildingCounts(state, p.id);
      return cmp(houses + hotels * 5, condition.op, condition.count);
    }
    case 'chance':
      // Über den Spiel-Zufallsgenerator, damit das Replay dasselbe Ergebnis liefert.
      return nextFloat(state.rng) * 100 < condition.percent;
    case 'ownsGroup':
      return ownsWholeGroup(state, p.id, condition.group);
    case 'variable':
      return cmp(variableValue(state, condition.variable, p.id), condition.op, condition.value);
  }
}

/** Löst das Feld aus, auf dem der Spieler gerade steht. */
export function landOnCurrentTile(r: Resolution, modifiers: LandingModifiers = {}): void {
  if (r.landings >= MAX_LANDINGS) return;
  r.landings++;
  const tile = tileAt(r.ctx.state, player(r).position);
  if (r.ctx.state.blockedTiles[tile.id]) {
    emit(r.ctx, { type: 'blockedTileLanded', playerId: r.playerId, tileId: tile.id });
    return;
  }
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
  for (let i = 1; i < steps && !stopped(r); i++) {
    const tile = tileAt(state, (from + i) % n);
    const onPass = tileHandler(tile).onPass;
    if (onPass && !state.blockedTiles[tile.id]) runEffects(r, onPass(tile));
  }
  if (!stopped(r)) landOnCurrentTile(r, modifiers);
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

/** Zum nächsten Feld eines eingebauten oder eigenen Typs, z. B. Teleporter. */
function moveToNextOfType(r: Resolution, type: string, passTiles: boolean, land: boolean): void {
  const state = r.ctx.state;
  const n = state.pack.tiles.length;
  const p = player(r);
  const from = p.position;
  for (let k = 1; k < n; k++) {
    const tile = tileAt(state, (from + k) % n);
    const matches = tile.type === type || (tile.type === 'custom' && tile.tileType === type);
    if (!matches) continue;
    if (passTiles) {
      // Zieht regulär; das Zielfeld wird dabei immer ausgelöst.
      moveForward(r, k);
      return;
    }
    p.position = (from + k) % n;
    emit(r.ctx, { type: 'teleported', playerId: p.id, from, to: p.position });
    if (land) landOnCurrentTile(r);
    return;
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
  const { free, shares } = rentAgreements(state, tileId, ts.owner, r.playerId);
  if (free) {
    emit(r.ctx, { type: 'noRent', playerId: r.playerId, tileId, why: 'agreement' });
    return;
  }
  const amount = calculateRent(state, tile, ts.owner, modifiers);
  emit(r.ctx, { type: 'rentDue', playerId: r.playerId, owner: ts.owner, tileId, amount });
  // Gewinnbeteiligung: der Anteil geht direkt an den Begünstigten (zahlt er selbst, spart er).
  let rest = amount;
  for (const share of shares) {
    if (share.term.kind !== 'profitShare') continue;
    const part = Math.min(rest, Math.floor((amount * share.term.percent) / 100));
    const beneficiary = otherParty(share, ts.owner);
    rest -= part;
    if (part <= 0 || beneficiary === r.playerId) continue;
    emit(r.ctx, {
      type: 'rentShared',
      agreementId: share.id,
      from: r.playerId,
      to: beneficiary,
      tileId,
      amount: part,
    });
    charge(r.ctx, r.playerId, beneficiary, part, 'agreement');
  }
  charge(r.ctx, r.playerId, ts.owner, rest, 'rent');
}

/** Wert einer Variable für einen Spieler (bzw. fürs Spiel). */
export function variableValue(state: GameState, variable: string, playerId: PlayerId): number {
  const scope = state.pack.variables.find((v) => v.id === variable)?.scope;
  return (
    (scope === 'game'
      ? state.variables.game[variable]
      : state.variables.players[playerId]?.[variable]) ?? 0
  );
}

function setVariable(r: Resolution, variable: string, op: 'set' | 'add', value: number): void {
  const state = r.ctx.state;
  const definition = state.pack.variables.find((v) => v.id === variable);
  if (!definition) return;
  const from = variableValue(state, variable, r.playerId);
  // Gleicher Wertebereich wie im Schema, damit nichts überläuft.
  const to = Math.max(-1_000_000, Math.min(1_000_000, op === 'set' ? value : from + value));
  if (definition.scope === 'game') state.variables.game[variable] = to;
  else (state.variables.players[r.playerId] ??= {})[variable] = to;
  emit(r.ctx, {
    type: 'variableChanged',
    variable,
    playerId: definition.scope === 'game' ? null : r.playerId,
    from,
    to,
  });
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
