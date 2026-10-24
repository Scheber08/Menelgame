import { useTranslation } from 'react-i18next';
import { GameScreen } from '../components/GameScreen';
import { Setup } from '../components/Setup';
import { useHotSeatGame } from '../game/useHotSeatGame';

export function HotSeatPage() {
  const { t } = useTranslation();
  const { game, error, auctionDeadline, start, dispatch, reset } = useHotSeatGame();

  if (!game) {
    return (
      <main className="setup-main">
        <Setup onStart={start} />
      </main>
    );
  }

  const newGame = () => {
    if (game.state.phase.name !== 'gameOver' && !window.confirm(t('app.confirmNewGame'))) return;
    reset();
  };

  return (
    <GameScreen
      state={game.state}
      events={game.events}
      mode="hotseat"
      me={null}
      dispatch={dispatch}
      error={error}
      auctionDeadline={auctionDeadline}
      onAuctionClose={() => dispatch({ type: 'AUCTION_CLOSE' })}
      log={game.log}
      onNewGame={newGame}
      sidebarBottom={
        <button type="button" className="link" onClick={newGame}>
          {t('app.newGame')}
        </button>
      }
    />
  );
}
