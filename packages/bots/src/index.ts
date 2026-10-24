import {
  actingPlayerId,
  getLegalActions,
  ownableById,
  validateAction,
  type GameState,
  type PlayerAction,
  type PlayerId,
} from '@menelgame/engine';
import { easy } from './easy';
import { hard } from './hard';
import { medium } from './medium';
import { find, settleDebt, type Strategy } from './strategy';
import { estimateEffects } from './valuation';
import { botView, chance, newBotMemory, type BotMemory } from './view';

export { botView, newBotMemory, type BotMemory } from './view';
export { landingOdds } from './landing';
export { cashReserve, termsWorth, tileWorth } from './valuation';

export type BotLevel = 'easy' | 'medium' | 'hard';
export const BOT_LEVELS: readonly BotLevel[] = ['easy', 'medium', 'hard'];

const strategies: Record<BotLevel, Strategy> = { easy, medium, hard };

/**
 * Nächste Aktion eines Bots – oder null, wenn er gerade nichts tun muss. Der Bot sieht nur,
 * was auch Menschen sehen (botView), und liefert dieselben Aktionen wie ein Mensch. Ist
 * eine Idee ungültig, fällt er auf eine sichere Aktion zurück.
 */
export function decideBot(
  state: GameState,
  playerId: PlayerId,
  level: BotLevel,
  memory: BotMemory = newBotMemory(),
): PlayerAction | null {
  const view = botView(state);
  const me = view.players.find((p) => p.id === playerId);
  if (!me || me.bankrupt || view.phase.name === 'gameOver') return null;
  const strategy = strategies[level];
  const valid = (action: PlayerAction | null | undefined): action is PlayerAction =>
    !!action && validateAction(view, action) === null;

  // 1. Angebote an mich beantworten.
  const offer = view.trades.find((t) => t.to === playerId);
  if (offer && view.phase.name !== 'auction') {
    const answer = strategy.respondTrade(view, playerId, offer);
    return valid(answer) ? answer : { type: 'REJECT_TRADE', playerId, tradeId: offer.id };
  }

  // 2. Auktion: alle bieten mit, nicht nur der Spieler am Zug.
  if (view.phase.name === 'auction' && view.auction) {
    const auction = view.auction;
    if (auction.passed.includes(playerId) || auction.highestBidder === playerId) return null;
    const action = strategy.auction(view, playerId);
    return valid(action) ? action : { type: 'AUCTION_PASS', playerId };
  }

  // 3. Eigener Zug bzw. eigene Schulden.
  if (actingPlayerId(view) !== playerId) return null;
  const legal = getLegalActions(view, playerId);
  const roll = find(legal, 'ROLL_DICE');
  let choice: PlayerAction | null | undefined;

  switch (view.phase.name) {
    case 'awaitingRoll':
      choice = strategy.beforeRoll(view, playerId, legal, memory) ?? roll;
      break;
    case 'awaitingPurchase': {
      const tile = ownableById(view, view.phase.tileId)!;
      choice = strategy.buy(view, playerId, tile) ? find(legal, 'BUY') : undefined;
      choice ??= find(legal, 'DECLINE');
      break;
    }
    case 'freePhase':
      choice = strategy.manage(view, playerId, legal) ?? roll ?? find(legal, 'END_TURN');
      break;
    case 'awaitingDebt':
      choice = settleDebt(view, playerId, legal);
      break;
    case 'awaitingChoice': {
      const options = view.phase.options;
      // Mittel und Schwer nehmen die Möglichkeit mit dem besten geschätzten Geldwert, Leicht würfelt.
      const option =
        level !== 'easy'
          ? options.reduce(
              (best, o, i) =>
                estimateEffects(view, playerId, o.effects) >
                estimateEffects(view, playerId, options[best]!.effects)
                  ? i
                  : best,
              0,
            )
          : Math.floor(chance(view, playerId, 'choice') * options.length);
      choice = { type: 'CHOOSE', playerId, option };
      break;
    }
  }
  if (valid(choice)) return choice;
  // Rückfall: das Erste, was sicher geht.
  return (
    roll ??
    find(legal, 'DECLINE') ??
    find(legal, 'END_TURN') ??
    find(legal, 'PAY_DEBT') ??
    legal.find((a) => a.type !== 'DECLARE_BANKRUPTCY') ??
    legal[0] ??
    null
  );
}
