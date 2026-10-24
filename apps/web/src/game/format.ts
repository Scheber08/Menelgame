import type { GameEvent, GameState, Party } from '@menelgame/engine';
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
    case 'auctionSkipped':
      return t('events.auctionSkipped', { tile: tileName(state, event.tileId) });
    case 'rentDue':
      return null;
    case 'noRent':
      return t(event.why === 'mortgaged' ? 'events.noRentMortgaged' : 'events.noRentOwnerInJail', {
        tile: tileName(state, event.tileId),
      });
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
