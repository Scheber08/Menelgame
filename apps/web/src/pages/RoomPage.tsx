import type { GameState } from '@menelgame/engine';
import type { RoomInfoResponse, RoomView } from '@menelgame/protocol';
import type { Rules } from '@menelgame/schema';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GameScreen } from '../components/GameScreen';
import { RulesForm } from '../components/RulesForm';
import { takePendingPack } from '../game/api';
import { takePendingJoin } from '../game/profile';
import { useOnlineRoom, type OnlineRoom } from '../game/useOnlineRoom';
import { navigate } from '../router';
import { Lobby, TakeoverSetting } from './Lobby';

type Lookup = { status: 'loading' } | { status: 'missing' } | { status: 'found' };

/** Prüft erst, ob es den Raum gibt, und verbindet dann. */
export function RoomPage({ code }: { code: string }) {
  const { t } = useTranslation();
  const [lookup, setLookup] = useState<Lookup>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/rooms/${code}`)
      .then((r) => (r.ok ? (r.json() as Promise<RoomInfoResponse>) : null))
      .then((info) => !cancelled && setLookup(info ? { status: 'found' } : { status: 'missing' }))
      .catch(() => !cancelled && setLookup({ status: 'missing' }));
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (lookup.status === 'loading')
    return <main className="center-page muted">{t('room.loading')}</main>;
  if (lookup.status === 'missing') {
    return (
      <main className="center-page">
        <p>{t('room.notFound', { code })}</p>
        <button type="button" onClick={() => navigate('/')}>
          {t('room.home')}
        </button>
      </main>
    );
  }
  return <ConnectedRoom code={code} />;
}

function ConnectedRoom({ code }: { code: string }) {
  const { t } = useTranslation();
  const online = useOnlineRoom(code);
  const { room, seatId, game, status, send } = online;

  // Wer den Raum angelegt hat, nimmt automatisch Platz …
  useEffect(() => {
    if (status !== 'open' || !room || seatId || room.status !== 'lobby') return;
    const pending = takePendingJoin(code);
    if (pending) send({ t: 'join', name: pending.name, color: pending.color });
  }, [status, room, seatId, code, send]);

  // … und stellt ein vorgemerktes Pack ein („Damit hosten“).
  useEffect(() => {
    if (!room || !seatId || seatId !== room.hostSeatId || room.status !== 'lobby') return;
    const pack = takePendingPack(code);
    if (pack)
      send({
        t: 'configure',
        packId: pack.meta.id,
        customPack: pack,
        rules: pack.rules,
        dice: pack.dice,
      });
  }, [room, seatId, code, send]);

  if (!room) return <main className="center-page muted">{t('room.connecting')}</main>;

  const banner = status !== 'open' && (
    <div className="banner warning" role="status">
      {t('room.reconnecting')}
    </div>
  );

  if (room.status === 'lobby' || !game) {
    return (
      <>
        {banner}
        <Lobby online={online} room={room} />
      </>
    );
  }

  const deadline = room.deadline ? room.deadline.at - online.clockOffset : null;
  const isHost = seatId !== null && seatId === room.hostSeatId;
  const connected = Object.fromEntries(room.seats.map((s) => [s.id, s.connected]));
  const badges = Object.fromEntries(
    room.seats.map((s) => [
      s.id,
      s.bot
        ? [t('room.botBadge', { level: t(`room.bot_${s.bot}`) })]
        : s.standIn
          ? [t('room.standIn')]
          : [],
    ]),
  );

  return (
    <GameScreen
      state={game.state}
      events={game.events}
      mode="online"
      me={seatId}
      dispatch={online.act}
      error={online.error}
      turnDeadline={room.deadline?.kind === 'turn' ? deadline : null}
      auctionDeadline={room.deadline?.kind === 'auction' ? deadline : null}
      connected={connected}
      badges={badges}
      exportHref={room.status === 'finished' ? `/api/rooms/${code}/log` : undefined}
      onNewGame={() => navigate('/')}
      sidebarTop={
        <>
          {banner}
          {room.paused && (
            <div className="banner" role="status">
              {t('room.paused')}
            </div>
          )}
          {!seatId && (
            <div className="banner" role="status">
              {t('room.spectating')}
            </div>
          )}
        </>
      }
      sidebarBottom={isHost && <HostPanel online={online} room={room} state={game.state} />}
    />
  );
}

function HostPanel({
  online,
  room,
  state,
}: {
  online: OnlineRoom;
  room: RoomView;
  state: GameState;
}) {
  const { t } = useTranslation();
  const [rules, setRules] = useState<Rules>(state.rules);
  const [dice, setDice] = useState(state.dice);
  const { send, seatId } = online;
  if (state.phase.name === 'gameOver') return null;

  return (
    <section className="panel host-panel">
      <h2>{t('host.heading')}</h2>
      <div className="action-buttons">
        <button type="button" onClick={() => send({ t: 'pause', paused: !room.paused })}>
          {room.paused ? t('host.resume') : t('host.pause')}
        </button>
      </div>
      <TakeoverSetting
        room={room}
        disabled={false}
        onChange={(s) => send({ t: 'roomSettings', botTakeoverSeconds: s })}
      />
      <h3>{t('host.players')}</h3>
      <ul className="seat-list">
        {state.players
          .filter((p) => !p.bankrupt && p.id !== seatId)
          .map((p) => (
            <li key={p.id}>
              <span className="dot" style={{ background: p.color }} />
              <span className="player-name">{p.name}</span>
              <button
                type="button"
                className="link danger-link"
                onClick={() => {
                  if (window.confirm(t('host.confirmKick', { name: p.name })))
                    send({ t: 'kick', seatId: p.id });
                }}
              >
                {t('host.kick')}
              </button>
            </li>
          ))}
      </ul>
      <details>
        <summary>{t('host.rules')}</summary>
        <p className="muted small">{t('host.rulesHint')}</p>
        <RulesForm
          rules={rules}
          onChange={setRules}
          dice={dice}
          onDiceChange={setDice}
          showTimers
        />
        <div className="action-buttons">
          <button
            type="button"
            className="primary"
            onClick={() => send({ t: 'updateRules', rules, dice })}
          >
            {t('host.applyRules')}
          </button>
          <button
            type="button"
            onClick={() => {
              setRules(state.rules);
              setDice(state.dice);
            }}
          >
            {t('host.resetRules')}
          </button>
        </div>
      </details>
    </section>
  );
}
