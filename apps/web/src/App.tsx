import { getLegalActions } from '@menelgame/engine';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Board } from './board/Board';
import { ActionBar } from './components/ActionBar';
import { EventLog } from './components/EventLog';
import { GameOver } from './components/GameOver';
import { PlayerList } from './components/PlayerList';
import { Setup } from './components/Setup';
import { TileInfo } from './components/TileInfo';
import { useHotSeatGame } from './game/useHotSeatGame';

export function App() {
  const { t } = useTranslation();
  const { game, error, start, dispatch, reset } = useHotSeatGame();
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [gameOverDismissed, setGameOverDismissed] = useState(false);
  const legal = useMemo(() => (game ? getLegalActions(game.state) : []), [game]);

  const newGame = () => {
    if (game && game.state.phase.name !== 'gameOver' && !window.confirm(t('app.confirmNewGame')))
      return;
    setSelectedTileId(null);
    setGameOverDismissed(false);
    reset();
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="logo" aria-hidden="true">
            M
          </span>
          <div>
            <div className="brand-name">{t('app.title')}</div>
            <div className="muted small">{t('app.tagline')}</div>
          </div>
        </div>
        {game && (
          <button type="button" onClick={newGame}>
            {t('app.newGame')}
          </button>
        )}
      </header>

      {!game ? (
        <main className="setup-main">
          <Setup onStart={start} />
        </main>
      ) : (
        <main className="game">
          <div className="board-wrap">
            <Board
              state={game.state}
              events={game.events}
              selectedTileId={selectedTileId}
              onSelectTile={setSelectedTileId}
            />
          </div>
          <aside className="sidebar">
            <ActionBar state={game.state} legal={legal} error={error} dispatch={dispatch} />
            <TileInfo
              state={game.state}
              tileId={selectedTileId}
              legal={legal}
              dispatch={dispatch}
            />
            <PlayerList
              state={game.state}
              selectedTileId={selectedTileId}
              onSelectTile={setSelectedTileId}
            />
            <EventLog state={game.state} events={game.events} log={game.log} />
          </aside>
          {game.state.phase.name === 'gameOver' && !gameOverDismissed && (
            <GameOver
              state={game.state}
              events={game.events}
              onClose={() => setGameOverDismissed(true)}
              onNewGame={newGame}
            />
          )}
        </main>
      )}
    </div>
  );
}
