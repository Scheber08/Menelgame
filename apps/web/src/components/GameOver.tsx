import { netWorth, type GameEvent, type GameState } from '@menelgame/engine';
import { useTranslation } from 'react-i18next';
import { formatMoney, playerName } from '../game/format';
import { Avatar } from './Avatar';
import { Icon } from './Icon';

/** Feste Konfetti-Stücke: Position, Farbe, Verzögerung, Drehung. */
const CONFETTI = Array.from({ length: 24 }, (_, i) => ({
  x: (i * 37) % 100,
  color: ['#ffc83d', '#ff6b5b', '#1fa971', '#4aa3ff', '#9b6dff'][i % 5]!,
  delay: (i % 6) * 0.18,
  turn: (i * 47) % 360,
}));

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
      <div className="dialog game-over">
        <div className="confetti" aria-hidden="true">
          {CONFETTI.map((c, i) => (
            <span
              key={i}
              style={{
                left: `${c.x}%`,
                background: c.color,
                animationDelay: `${c.delay}s`,
                transform: `rotate(${c.turn}deg)`,
              }}
            />
          ))}
        </div>
        <span className="trophy" aria-hidden="true">
          <Icon name="trophy" size={40} />
        </span>
        <h2 id="game-over-title">{t('gameOver.heading', { winner: winner?.name ?? '–' })}</h2>
        <p className="muted">{t(`gameOver.reason_${end.reason}`)}</p>
        <h3>{t('gameOver.ranking')}</h3>
        <ol className="ranking">
          {end.ranking.map((r, i) => {
            const p = state.players.find((x) => x.id === r.playerId);
            return (
              <li key={r.playerId} className={i === 0 ? 'first' : undefined}>
                <span className="rank">{i + 1}</span>
                <Avatar name={playerName(state, r.playerId)} color={p?.color ?? '#999999'} />
                <span className="ranking-name">{playerName(state, r.playerId)}</span>
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
