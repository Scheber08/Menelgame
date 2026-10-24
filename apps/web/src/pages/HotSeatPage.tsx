import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { PLAYER_COLORS } from '../components/ColorPicker';
import { GameScreen } from '../components/GameScreen';
import { Setup } from '../components/Setup';
import { loadProfile } from '../game/profile';
import { takeTestGame, useHotSeatGame } from '../game/useHotSeatGame';

export function HotSeatPage() {
  const { t } = useTranslation();
  const { game, error, auctionDeadline, start, dispatch, reset } = useHotSeatGame();

  // Testmodus aus dem Editor: sofort gegen zwei Bots spielen.
  useEffect(() => {
    const pack = takeTestGame();
    if (!pack) return;
    const me = loadProfile();
    start(
      {
        pack,
        seed: crypto.getRandomValues(new Uint32Array(1))[0]!,
        players: [
          {
            id: 'p1',
            name: me.name || t('setup.defaultName', { n: 1 }),
            color: me.color || PLAYER_COLORS[0]!,
          },
          { id: 'p2', name: 'Bot Anton', color: PLAYER_COLORS[1]! },
          { id: 'p3', name: 'Bot Berta', color: PLAYER_COLORS[2]! },
        ].slice(0, Math.max(2, Math.min(3, pack.maxPlayers))),
      },
      { p2: 'medium', p3: 'medium' },
    );
  }, [start, t]);

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
  const botIds = Object.keys(game.bots);

  return (
    <GameScreen
      state={game.state}
      events={game.events}
      mode="hotseat"
      me={null}
      botIds={botIds}
      dispatch={dispatch}
      error={error}
      auctionDeadline={auctionDeadline}
      onAuctionClose={() => dispatch({ type: 'AUCTION_CLOSE' })}
      log={game.log}
      onNewGame={newGame}
      badges={Object.fromEntries(
        botIds.map((id) => [id, [t('room.botBadge', { level: t(`room.bot_${game.bots[id]}`) })]]),
      )}
      sidebarBottom={
        <button type="button" className="link" onClick={newGame}>
          {t('app.newGame')}
        </button>
      }
    />
  );
}
