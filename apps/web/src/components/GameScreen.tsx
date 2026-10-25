import {
  actingPlayerId,
  activePlayers,
  getLegalActions,
  type Action,
  type GameEvent,
  type GameLog,
  type GameState,
} from '@menelgame/engine';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Board } from '../board/Board';
import { useTokenWalk } from '../board/useTokenWalk';
import { useSettings } from '../game/settings';
import { playSound, soundFor } from '../game/sound';
import { ActionBar, type UiError } from './ActionBar';
import { AuctionPanel } from './AuctionPanel';
import { EventLog } from './EventLog';
import { GameOver } from './GameOver';
import { PlayerList } from './PlayerList';
import { ReplayView } from './ReplayView';
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
  const { t } = useTranslation();
  const [settings, updateSettings] = useSettings();
  const positions = useTokenWalk(state, events, settings.animations);

  // Geräusche nur für neue Ereignisse, nicht für die Vorgeschichte beim Laden.
  const heard = useRef(events.length);
  useEffect(() => {
    const fresh = events.slice(heard.current);
    heard.current = events.length;
    if (!settings.sound) return;
    const sounds = new Set(fresh.map(soundFor).filter((s) => s !== null));
    for (const sound of sounds) playSound(sound);
  }, [events, settings.sound]);

  const [replayLog, setReplayLog] = useState<GameLog | null>(null);
  const canReplay = state.phase.name === 'gameOver' && !!(props.log || props.exportHref);
  const openReplay = async () => {
    const source = props.log ?? ((await fetch(props.exportHref!).then((r) => r.json())) as GameLog);
    setReplayLog(source);
  };

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

  if (replayLog) return <ReplayView log={replayLog} onClose={() => setReplayLog(null)} />;

  return (
    <main className="game">
      <div className="board-wrap">
        <Board
          state={state}
          events={events}
          selectedTileId={selectedTileId}
          onSelectTile={setSelectedTileId}
          positions={positions}
        />
      </div>
      <aside className="sidebar">
        <div className="settings-row">
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.sound}
              onChange={(e) => updateSettings({ sound: e.target.checked })}
            />
            {t('settings.sound')}
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.animations}
              onChange={(e) => updateSettings({ animations: e.target.checked })}
            />
            {t('settings.animations')}
          </label>
        </div>
        {props.sidebarTop}
        {canReplay && (
          <button type="button" className="primary" onClick={() => void openReplay()}>
            {t('replay.open')}
          </button>
        )}
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
          {...(canReplay && { onReplay: () => void openReplay() })}
        />
      )}
    </main>
  );
}
