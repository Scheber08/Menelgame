import { actingPlayerId, type Action, type GameState, type PlayerAction } from '@menelgame/engine';
import { useTranslation } from 'react-i18next';
import { formatMoney, partyName, tileName } from '../game/format';
import { Countdown } from './Countdown';
import { Avatar } from './Avatar';
import { Icon } from './Icon';

export interface UiError {
  code: string;
  message?: string;
}

interface ActionBarProps {
  state: GameState;
  /** Legale Aktionen des Handelnden – leer, wenn dieser Bildschirm ihn nicht steuert. */
  legal: PlayerAction[];
  /** Steuert dieser Bildschirm den handelnden Spieler? */
  canAct: boolean;
  error: UiError | null;
  dispatch: (action: Action) => void;
  /** Ablauf des Zugtimers (lokale Uhr). */
  turnDeadline?: number | null;
}

/** Aktionen des handelnden Spieler, die nicht an ein Feld gebunden sind. */
const GLOBAL_ACTIONS: Action['type'][] = [
  'CHOOSE',
  'ROLL_DICE',
  'BUY',
  'DECLINE',
  'PAY_BAIL',
  'USE_JAIL_CARD',
  'PAY_DEBT',
  'END_TURN',
  'DECLARE_BANKRUPTCY',
];

export function ActionBar({ state, legal, canAct, error, dispatch, turnDeadline }: ActionBarProps) {
  const { t } = useTranslation();
  if (state.phase.name === 'gameOver') {
    return (
      <section className="panel turn-panel">
        <p>{t('turn.gameOver')}</p>
      </section>
    );
  }

  const actor = state.players.find((p) => p.id === actingPlayerId(state))!;
  const money = (n: number) => formatMoney(t, n);
  const phase = state.phase;
  const debt = state.debts[0];

  let hint: string;
  switch (phase.name) {
    case 'awaitingRoll':
      hint = actor.inJail ? t('turn.awaitingRollJail') : t('turn.awaitingRoll');
      break;
    case 'awaitingPurchase':
      hint = t('turn.awaitingPurchase', { tile: tileName(state, phase.tileId) });
      break;
    case 'freePhase':
      hint = phase.extraRoll ? t('turn.freePhaseExtraRoll') : t('turn.freePhase');
      break;
    case 'auction':
      hint = t('turn.auction');
      break;
    case 'awaitingChoice':
      hint = t('turn.awaitingChoice', { name: actor.name });
      break;
    case 'awaitingDebt':
      hint = debt
        ? t('turn.awaitingDebt', {
            debtor: actor.name,
            creditor: partyName(t, state, debt.creditor),
            amount: money(debt.amount),
          })
        : '';
      break;
  }
  if (!canAct && phase.name !== 'auction') hint = t('turn.waitingFor', { name: actor.name });

  const label = (action: Action): string => {
    switch (action.type) {
      case 'ROLL_DICE':
        return actor.inJail ? t('actions.ROLL_DICE_JAIL') : t('actions.ROLL_DICE');
      case 'BUY': {
        const tileId = phase.name === 'awaitingPurchase' ? phase.tileId : '';
        const tile = state.pack.tiles.find((x) => x.id === tileId);
        return t('actions.BUY', { price: money(tile && 'price' in tile ? tile.price : 0) });
      }
      case 'PAY_BAIL':
        return t('actions.PAY_BAIL', { amount: money(state.rules.jail.bail) });
      case 'PAY_DEBT':
        return t('actions.PAY_DEBT', { amount: money(debt?.amount ?? 0) });
      case 'CHOOSE':
        return phase.name === 'awaitingChoice'
          ? (phase.options[action.option]?.label ?? String(action.option))
          : '';
      default:
        return t(`actions.${action.type}`);
    }
  };

  const run = (action: Action) => {
    if (
      action.type === 'DECLARE_BANKRUPTCY' &&
      !window.confirm(t('actions.confirmBankruptcy', { name: actor.name }))
    )
      return;
    dispatch(action);
  };

  const buttons = GLOBAL_ACTIONS.flatMap((type) => legal.filter((a) => a.type === type));
  const primary = buttons[0]?.type;
  // Bankrott ist auch legal, wenn man noch zahlen könnte; daher nur anbieten, wenn nötig.
  const visible = buttons.filter(
    (a) => a.type !== 'DECLARE_BANKRUPTCY' || !legal.some((l) => l.type === 'PAY_DEBT'),
  );

  return (
    <section className={`panel turn-panel${canAct ? ' my-turn' : ''}`} aria-live="polite">
      <div className="turn-header">
        <Avatar name={actor.name} color={actor.color} size="large" />
        <div>
          <div className="turn-label">{t('turn.heading')}</div>
          <div className="turn-name">
            {actor.name}
            {actor.inJail && <span className="badge">{t('turn.inJail')}</span>}
          </div>
        </div>
        <div className="turn-cash">
          {turnDeadline && phase.name !== 'auction' && <Countdown at={turnDeadline} />}
          {money(actor.cash)}
        </div>
      </div>
      <p className="turn-hint">{hint}</p>
      {visible.length > 0 && (
        <div className="action-buttons">
          {visible.map((action) => (
            <button
              key={action.type === 'CHOOSE' ? `choose-${action.option}` : action.type}
              type="button"
              className={
                action.type === primary && action.type !== 'CHOOSE'
                  ? `primary${action.type === 'ROLL_DICE' ? ' big icon-button' : ''}`
                  : action.type === 'DECLARE_BANKRUPTCY'
                    ? 'danger'
                    : ''
              }
              onClick={() => run(action)}
            >
              {action.type === 'ROLL_DICE' && <Icon name="dice" size={22} />}
              {label(action)}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {t(`errors.${error.code}`, { defaultValue: error.message ?? error.code })}
        </p>
      )}
      {canAct && phase.name === 'freePhase' && (
        <p className="muted small">{t('turn.manageHint')}</p>
      )}
    </section>
  );
}
