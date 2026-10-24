import {
  actingPlayerId,
  activePlayers,
  getLegalActions,
  type Action,
  type GameEvent,
  type GameLog,
  type GameState,
} from '@menelgame/engine';
import { useMemo, useState, type ReactNode } from 'react';
import { Board } from '../board/Board';
import { ActionBar, type UiError } from './ActionBar';
import { AuctionPanel } from './AuctionPanel';
import { EventLog } from './EventLog';
import { GameOver } from './GameOver';
import { PlayerList } from './PlayerList';
import { TileInfo } from './TileInfo';
import { TradePanel } from './TradePanel';

export interface GameScreenProps {
  state: GameState;
  events: GameEvent[];
  /** hotseat: dieser Bildschirm steuert alle Spieler; online: nur `me`. */
  mode: 'hotseat' | 'online';
  me: string | null;
  /** Hot-Seat: Plätze, die Bots spielen (nicht von Hand steuerbar). */
  botIds?: string[];
  dispatch: (action: Action) => void;
  error: UiError | null;
  turnDeadline?: number | null;
  auctionDeadline?: number | null;
  onAuctionClose?: () => void;
  connected?: Record<string, boolean>;
  /** Zusätzliche Kennzeichen je Spieler, z. B. „Bot“. */
  badges?: Record<string, string[]>;
  /** Für Replay-Prüfung und Export (Hot-Seat). */
  log?: GameLog;
  exportHref?: string;
  sidebarTop?: ReactNode;
  sidebarBottom?: ReactNode;
  onNewGame: () => void;
}

/** Spielansicht für Hot-Seat und Online: Brett, Aktionen, Auktion, Handel, Spieler, Log. */
export function GameScreen(props: GameScreenProps) {
  const { state, events, mode, me, dispatch, error } = props;
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [gameOverDismissed, setGameOverDismissed] = useState(false);

  const actor = state.phase.name === 'gameOver' ? null : actingPlayerId(state);
  const controls = useMemo(
    () =>
      mode === 'hotseat'
        ? activePlayers(state)
            .map((p) => p.id)
            .filter((id) => !props.botIds?.includes(id))
        : me && !state.players.find((p) => p.id === me)?.bankrupt
          ? [me]
          : [],
    [mode, me, state, props.botIds],
  );
  const canAct = actor !== null && controls.includes(actor);
  const actorLegal = useMemo(
    () => (canAct && actor ? getLegalActions(state, actor) : []),
    [canAct, actor, state],
  );
  // Felder verwaltet im Hot-Seat der Handelnde, online immer der eigene Spieler.
  const tileLegal = useMemo(
    () => (mode === 'hotseat' ? actorLegal : me ? getLegalActions(state, me) : []),
    [mode, me, actorLegal, state],
  );

  return (
    <main className="game">
      <div className="board-wrap">
        <Board
          state={state}
          events={events}
          selectedTileId={selectedTileId}
          onSelectTile={setSelectedTileId}
        />
      </div>
      <aside className="sidebar">
        {props.sidebarTop}
        {state.phase.name === 'auction' ? (
          <AuctionPanel
            state={state}
            controls={controls}
            dispatch={dispatch}
            deadline={props.auctionDeadline ?? null}
            {...(props.onAuctionClose && { onClose: props.onAuctionClose })}
          />
        ) : (
          <ActionBar
            state={state}
            legal={actorLegal}
            canAct={canAct}
            error={error}
            dispatch={dispatch}
            turnDeadline={props.turnDeadline ?? null}
          />
        )}
        {state.phase.name === 'auction' && error && (
          <p className="error panel" role="alert">
            {error.message ?? error.code}
          </p>
        )}
        <TileInfo state={state} tileId={selectedTileId} legal={tileLegal} dispatch={dispatch} />
        <TradePanel state={state} controls={controls} dispatch={dispatch} />
        <PlayerList
          state={state}
          me={mode === 'online' ? me : null}
          connected={props.connected ?? null}
          badges={props.badges ?? null}
          selectedTileId={selectedTileId}
          onSelectTile={setSelectedTileId}
        />
        <EventLog
          state={state}
          events={events}
          {...(props.log && { log: props.log })}
          {...(props.exportHref && { exportHref: props.exportHref })}
        />
        {props.sidebarBottom}
      </aside>
      {state.phase.name === 'gameOver' && !gameOverDismissed && (
        <GameOver
          state={state}
          events={events}
          onClose={() => setGameOverDismissed(true)}
          onNewGame={props.onNewGame}
        />
      )}
    </main>
  );
}
