import type { Agreement, AgreementTerm, GameEvent, GameState, Party } from '@menelgame/engine';
import type { BoardPack, Condition, Effect, TileRule } from '@menelgame/schema';
import type { TFunction } from 'i18next';

const numberFormat = new Intl.NumberFormat('de-DE');

export function formatMoney(t: TFunction, amount: number): string {
  return t('money', { amount: numberFormat.format(amount) });
}

export function playerName(state: GameState, id: string): string {
  return state.players.find((p) => p.id === id)?.name ?? id;
}

export function partyName(t: TFunction, state: GameState, party: Party): string {
  if (party === 'bank') return t('party.bank');
  if (party === 'pot') return t('party.pot');
  return playerName(state, party);
}

export function tileName(state: GameState, idOrIndex: string | number): string {
  const tile =
    typeof idOrIndex === 'number'
      ? state.pack.tiles[idOrIndex]
      : state.pack.tiles.find((t) => t.id === idOrIndex);
  return tile?.name ?? String(idOrIndex);
}

export function deckName(state: GameState, deckId: string): string {
  return state.pack.decks.find((d) => d.id === deckId)?.name ?? deckId;
}

const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

export function diceFace(value: number, sides: number): string {
  return sides === 6 ? (DICE_FACES[value - 1] ?? String(value)) : String(value);
}

/**
 * Lesbarer Text für ein Ereignis. Liefert null für Ereignisse, die schon durch ein anderes
 * abgedeckt sind (z. B. die Geldbuchung zu einem Kauf).
 */
export function formatEvent(t: TFunction, state: GameState, event: GameEvent): string | null {
  const name = (id: string) => playerName(state, id);
  const money = (amount: number) => formatMoney(t, amount);

  switch (event.type) {
    case 'gameStarted':
      return null;
    case 'turnStarted':
      return t('events.turnStarted', { round: event.round, player: name(event.playerId) });
    case 'diceRolled':
      return t(event.isDouble ? 'events.diceRolledDouble' : 'events.diceRolled', {
        player: name(event.playerId),
        dice: event.dice.join(' + '),
        total: event.total,
      });
    case 'moved':
      return t('events.moved', { player: name(event.playerId), tile: tileName(state, event.to) });
    case 'teleported':
      return t('events.teleported', {
        player: name(event.playerId),
        tile: tileName(state, event.to),
      });
    case 'moneyTransferred': {
      const from = partyName(t, state, event.from);
      const to = partyName(t, state, event.to);
      const amount = money(event.amount);
      switch (event.reason) {
        case 'passStart':
          return t('events.passStart', { player: to, amount });
        case 'landOnStart':
          return t('events.landOnStart', { player: to, amount });
        case 'freeParking':
          return t('events.freeParking', { player: to, amount });
        case 'card':
          return event.from === 'bank'
            ? t('events.cardCollect', { from, to, amount })
            : t('events.cardPay', { from, to, amount });
        case 'tax':
          return t('events.tax', { from, to, amount });
        case 'rent':
          return t('events.rentPaid', { from, to, amount });
        case 'bail':
          return t('events.bailPaid', { from, amount });
        case 'bankruptcy':
          return t('events.bankruptcyTransfer', { from, to, amount });
        case 'trade':
          return t('events.tradeMoney', { from, to, amount });
        case 'agreement':
          return t('events.agreementMoney', { from, to, amount });
        case 'variable':
          return event.from === 'bank'
            ? t('events.cardCollect', { from, to, amount })
            : t('events.cardPay', { from, to, amount });
        default:
          return null;
      }
    }
    case 'purchaseOffered':
      return t('events.purchaseOffered', {
        tile: tileName(state, event.tileId),
        price: money(event.price),
      });
    case 'purchased':
      return t('events.purchased', {
        player: name(event.playerId),
        tile: tileName(state, event.tileId),
        price: money(event.price),
      });
    case 'purchaseDeclined':
      return t('events.purchaseDeclined', {
        player: name(event.playerId),
        tile: tileName(state, event.tileId),
      });
    case 'auctionStarted':
      return t('events.auctionStarted', { tile: tileName(state, event.tileId) });
    case 'auctionBid':
      return t('events.auctionBid', {
        player: name(event.playerId),
        amount: money(event.amount),
      });
    case 'auctionPassed':
      return t('events.auctionPassed', { player: name(event.playerId) });
    case 'auctionWon':
      return t('events.auctionWon', {
        player: name(event.playerId),
        tile: tileName(state, event.tileId),
        amount: money(event.amount),
      });
    case 'auctionUnsold':
      return t('events.auctionUnsold', { tile: tileName(state, event.tileId) });
    case 'tradeProposed':
      return t('events.tradeProposed', {
        from: name(event.trade.from),
        to: name(event.trade.to),
      });
    case 'tradeAccepted':
      return t('events.tradeAccepted', { from: name(event.from), to: name(event.to) });
    case 'tradeRejected':
      return t('events.tradeRejected', { player: name(event.by) });
    case 'tradeCancelled':
      return event.reason === 'countered' ? null : t(`events.tradeCancelled_${event.reason}`);
    case 'agreementStarted':
      return t('events.agreementStarted', {
        text: describeTerm(t, state, event.agreement.term, event.agreement.parties),
      });
    case 'agreementEnded':
      return t(`events.agreementEnded_${event.reason}`);
    case 'rentShared':
      return null;
    case 'variableChanged': {
      const variable =
        state.pack.variables.find((v) => v.id === event.variable)?.name ?? event.variable;
      return event.playerId
        ? t('events.variableChangedPlayer', {
            variable,
            player: name(event.playerId),
            from: event.from,
            to: event.to,
          })
        : t('events.variableChanged', { variable, from: event.from, to: event.to });
    }
    case 'rulesUpdated':
      return t('events.rulesUpdated', {
        changes: event.changes.map((c) => t(`ruleNames.${c}`, { defaultValue: c })).join(', '),
      });
    case 'playerRemoved':
      return t('events.playerRemoved', { player: name(event.playerId) });
    case 'tileEffect':
      return t('events.tileEffect', { tile: tileName(state, event.tileId) });
    case 'choiceOffered':
      return t('events.choiceOffered', { player: name(event.playerId) });
    case 'choiceMade':
      return t('events.choiceMade', { player: name(event.playerId), label: event.label });
    case 'tileBlocked':
      return t('events.tileBlocked', { tile: tileName(state, event.tileId), count: event.rounds });
    case 'tileUnblocked':
      return t('events.tileUnblocked', { tile: tileName(state, event.tileId) });
    case 'blockedTileLanded':
      return t('events.blockedTileLanded', { tile: tileName(state, event.tileId) });
    case 'skipTurnsAdded':
      return t('events.skipTurnsAdded', { player: name(event.playerId), count: event.turns });
    case 'turnSkipped':
      return t('events.turnSkipped', { player: name(event.playerId) });
    case 'rentDue':
      return null;
    case 'noRent': {
      const key = {
        mortgaged: 'events.noRentMortgaged',
        ownerInJail: 'events.noRentOwnerInJail',
        agreement: 'events.noRentAgreement',
      }[event.why];
      return t(key, { tile: tileName(state, event.tileId) });
    }
    case 'cardDrawn':
      return t('events.cardDrawn', {
        player: name(event.playerId),
        deck: deckName(state, event.deckId),
        text: event.text,
      });
    case 'deckEmpty':
      return t('events.deckEmpty', { deck: deckName(state, event.deckId) });
    case 'jailFreeCardKept':
      return t('events.jailFreeCardKept', { player: name(event.playerId) });
    case 'sentToJail':
      return t(
        event.reason === 'tripleDoubles' ? 'events.sentToJailTripleDoubles' : 'events.sentToJail',
        {
          player: name(event.playerId),
        },
      );
    case 'leftJail': {
      const key = {
        doubles: 'events.leftJailDoubles',
        bail: 'events.leftJailBail',
        card: 'events.leftJailCard',
        forcedBail: 'events.leftJailForcedBail',
      }[event.method];
      return t(key, { player: name(event.playerId) });
    }
    case 'jailRollFailed':
      return t('events.jailRollFailed', { player: name(event.playerId), attempt: event.attempt });
    case 'built':
      return t('events.built', {
        player: name(event.playerId),
        tile: tileName(state, event.tileId),
        buildings: buildingsLabel(t, event.buildings),
      });
    case 'buildingSold':
      return t('events.buildingSold', {
        player: name(event.playerId),
        tile: tileName(state, event.tileId),
        refund: money(event.refund),
      });
    case 'mortgaged':
      return t('events.mortgaged', {
        player: name(event.playerId),
        tile: tileName(state, event.tileId),
        amount: money(event.amount),
      });
    case 'unmortgaged':
      return t('events.unmortgaged', {
        player: name(event.playerId),
        tile: tileName(state, event.tileId),
        amount: money(event.amount),
      });
    case 'debtIncurred':
      return t('events.debtIncurred', {
        debtor: name(event.debtor),
        creditor: partyName(t, state, event.creditor),
        amount: money(event.amount),
      });
    case 'debtPaid':
      return t('events.debtPaid', {
        debtor: name(event.debtor),
        creditor: partyName(t, state, event.creditor),
        amount: money(event.amount),
      });
    case 'bankrupt':
      return t('events.bankrupt', { player: name(event.playerId) });
    case 'propertyTransferred':
      return t('events.propertyTransferred', {
        tile: tileName(state, event.tileId),
        to: event.to ? name(event.to) : t('party.bank'),
      });
    case 'turnEnded':
      return null;
    case 'gameOver':
      return event.winner
        ? t('events.gameOver', { winner: name(event.winner) })
        : t('events.gameOverNoWinner');
  }
}

export function buildingsLabel(t: TFunction, buildings: number): string {
  return buildings >= 5
    ? t('events.buildingsHotel')
    : t('events.buildingsHouses', { count: buildings });
}

/** Name eines Feldtyps (eingebaut oder eigen) für Texte. */
export function tileTypeName(t: TFunction, pack: BoardPack, type: string): string {
  return (
    pack.tileTypes.find((x) => x.id === type)?.name ??
    t(`tile.types.${type}`, { defaultValue: type })
  );
}

/** Kurzbeschreibung einer festen Aktion, z. B. „Zahle 50 Taler“. */
export function describeEffect(t: TFunction, pack: BoardPack, effect: Effect): string {
  const money = (n: number) => formatMoney(t, n);
  const tile = (id: string) => pack.tiles.find((x) => x.id === id)?.name ?? id;
  switch (effect.kind) {
    case 'collect':
    case 'pay':
    case 'collectFromEach':
    case 'payEach':
      return t(`describe.${effect.kind}`, { amount: money(effect.amount) });
    case 'payPercent':
      return t('describe.payPercent', { percent: effect.percent });
    case 'moveTo':
      return t('describe.moveTo', { tile: tile(effect.tile) });
    case 'moveBy':
      return t(effect.steps < 0 ? 'describe.moveBack' : 'describe.moveBy', {
        count: Math.abs(effect.steps),
      });
    case 'moveToNearest':
    case 'moveToNextOfType':
      return t('describe.moveToNext', { type: tileTypeName(t, pack, effect.tileType) });
    case 'goToJail':
      return t('describe.goToJail');
    case 'jailFreeCard':
      return t('describe.jailFreeCard');
    case 'repairs':
      return t('describe.repairs', {
        house: money(effect.perHouse),
        hotel: money(effect.perHotel),
      });
    case 'drawCard':
      return t('describe.drawCard', {
        deck: pack.decks.find((d) => d.id === effect.deck)?.name ?? effect.deck,
      });
    case 'blockTile':
      return t('describe.blockTile', { count: effect.rounds });
    case 'skipTurns':
      return t('describe.skipTurns', { count: effect.turns });
    case 'choice':
      return t('describe.choice', { options: effect.options.map((o) => o.label).join(' / ') });
    case 'setVariable':
      return t(
        effect.op === 'set'
          ? 'describe.setVariable'
          : effect.value < 0
            ? 'describe.decreaseVariable'
            : 'describe.increaseVariable',
        { variable: variableName(pack, effect.variable), value: Math.abs(effect.value) },
      );
    case 'collectVariable':
      return t(
        effect.percent === 100 ? 'describe.collectVariable' : 'describe.collectVariablePercent',
        {
          variable: variableName(pack, effect.variable),
          percent: effect.percent,
        },
      );
  }
}

export function variableName(pack: BoardPack, id: string): string {
  return pack.variables.find((v) => v.id === id)?.name ?? id;
}

export function describeCondition(t: TFunction, pack: BoardPack, c: Condition): string {
  switch (c.kind) {
    case 'cash':
      return t(`describe.cash_${c.op}`, { amount: formatMoney(t, c.amount) });
    case 'diceTotal':
      return t(`describe.dice_${c.op}`, { value: c.value });
    case 'double':
      return t(c.value ? 'describe.double' : 'describe.noDouble');
    case 'buildings':
      return t(`describe.buildings_${c.op}`, { count: c.count });
    case 'chance':
      return t('describe.chance', { percent: c.percent });
    case 'ownsGroup':
      return t('describe.ownsGroup', {
        group: pack.groups.find((g) => g.id === c.group)?.name ?? c.group,
      });
    case 'variable':
      return t(`describe.variable_${c.op}`, {
        variable: variableName(pack, c.variable),
        value: c.value,
      });
  }
}

export function describeRule(t: TFunction, pack: BoardPack, rule: TileRule): string {
  const when = t(`triggers.${rule.trigger}`);
  const conditions = rule.conditions.map((c) => describeCondition(t, pack, c));
  const effects = rule.effects.map((e) => describeEffect(t, pack, e)).join(', ');
  return conditions.length > 0
    ? t('describe.ruleIf', { when, conditions: conditions.join(t('describe.and')), effects })
    : t('describe.rule', { when, effects });
}

/** Text einer Vereinbarung, z. B. „Bea zahlt 3 Runden keine Miete auf Mühlweg (Anton)“. */
export function describeTerm(
  t: TFunction,
  state: GameState,
  term: AgreementTerm,
  parties: Agreement['parties'],
): string {
  const giver = term.kind === 'installments' ? term.payer : term.owner;
  const other = parties[0] === giver ? parties[1] : parties[0];
  const tiles = 'tiles' in term ? term.tiles.map((id) => tileName(state, id)).join(', ') : '';
  return t(`trade.term_${term.kind}`, {
    count: term.rounds,
    giver: playerName(state, giver),
    other: playerName(state, other),
    tiles,
    amount: term.kind === 'installments' ? formatMoney(t, term.amount) : '',
    percent: term.kind === 'profitShare' ? term.percent : 0,
  });
}
