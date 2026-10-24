import { netWorth, type GameEvent, type GameState } from '@menelgame/engine';
import { useTranslation } from 'react-i18next';
import { formatMoney, playerName } from '../game/format';

interface GameOverProps {
  state: GameState;
  events: GameEvent[];
  onClose: () => void;
  onNewGame: () => void;
  onReplay?: () => void;
}

export function GameOver({ state, events, onClose, onNewGame, onReplay }: GameOverProps) {
  const { t } = useTranslation();
  const end = [...events].reverse().find((e) => e.type === 'gameOver');
  if (end?.type !== 'gameOver') return null;
  const winner = end.winner ? state.players.find((p) => p.id === end.winner) : undefined;

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="game-over-title">
      <div className="dialog">
        <h2 id="game-over-title">
          {winner && <span className="dot large" style={{ background: winner.color }} />}
          {t('gameOver.heading', { winner: winner?.name ?? '–' })}
        </h2>
        <p className="muted">{t(`gameOver.reason_${end.reason}`)}</p>
        <h3>{t('gameOver.ranking')}</h3>
        <ol className="ranking">
          {end.ranking.map((r) => {
            const p = state.players.find((x) => x.id === r.playerId);
            return (
              <li key={r.playerId}>
                <span className="dot" style={{ background: p?.color }} />
                <span>{playerName(state, r.playerId)}</span>
                <span className="muted">
                  {p?.bankrupt
                    ? t('players.bankrupt')
                    : formatMoney(t, netWorth(state, r.playerId))}
                </span>
              </li>
            );
          })}
        </ol>
        <div className="action-buttons">
          <button type="button" className="primary" onClick={onNewGame}>
            {t('app.newGame')}
          </button>
          {onReplay && (
            <button type="button" onClick={onReplay}>
              {t('replay.open')}
            </button>
          )}
          <button type="button" onClick={onClose}>
            {t('gameOver.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
