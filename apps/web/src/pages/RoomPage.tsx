import { builtInPacks } from '@menelgame/packs';
import { roomInvitePath, type RoomInfoResponse, type RoomView } from '@menelgame/protocol';
import type { GameState } from '@menelgame/engine';
import type { Rules } from '@menelgame/schema';
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ColorPicker, firstFreeColor } from '../components/ColorPicker';
import { GameScreen } from '../components/GameScreen';
import { PackSelect } from '../components/PackSelect';
import { RulesForm } from '../components/RulesForm';
import { loadProfile, saveProfile, takePendingJoin } from '../game/profile';
import { useOnlineRoom, type OnlineRoom } from '../game/useOnlineRoom';
import { navigate } from '../router';

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

  // Wer den Raum angelegt hat, nimmt automatisch Platz.
  useEffect(() => {
    if (status !== 'open' || !room || seatId || room.status !== 'lobby') return;
    const pending = takePendingJoin(code);
    if (pending) send({ t: 'join', name: pending.name, color: pending.color });
  }, [status, room, seatId, code, send]);

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
      exportHref={`/api/rooms/${code}/log`}
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

function InviteBox({ code }: { code: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const link = `${location.origin}${roomInvitePath(code)}`;
  return (
    <div className="invite">
      <div className="room-code" aria-label={t('room.code')}>
        {code}
      </div>
      <div className="invite-link">
        <input
          readOnly
          value={link}
          onFocus={(e) => e.target.select()}
          aria-label={t('room.invite')}
        />
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(link).then(() => setCopied(true));
          }}
        >
          {copied ? t('room.copied') : t('room.copy')}
        </button>
      </div>
    </div>
  );
}

function Lobby({ online, room }: { online: OnlineRoom; room: RoomView }) {
  const { t } = useTranslation();
  const { seatId, send } = online;
  const isHost = seatId !== null && seatId === room.hostSeatId;
  const pack = builtInPacks.find((p) => p.meta.id === room.packId);
  const maxPlayers = pack?.maxPlayers ?? 0;
  const me = room.seats.find((s) => s.id === seatId);

  const configure = (patch: { packId?: string; rules?: Rules }) =>
    send({
      t: 'configure',
      packId: patch.packId ?? room.packId,
      rules: patch.rules ?? room.rules,
      dice: room.dice,
    });

  return (
    <main className="lobby">
      <section className="panel">
        <h1>{t('room.lobbyHeading')}</h1>
        <p className="muted small">{t('room.inviteText')}</p>
        <InviteBox code={room.code} />
      </section>

      <section className="panel">
        <h2>{t('room.seats', { count: room.seats.length, max: maxPlayers })}</h2>
        <ul className="seat-list">
          {room.seats.map((s) => (
            <li key={s.id}>
              <span className="dot" style={{ background: s.color }} />
              <span className="player-name">{s.name}</span>
              {s.id === room.hostSeatId && <span className="badge">{t('room.host')}</span>}
              {s.id === seatId && <span className="badge">{t('players.you')}</span>}
              {s.bot && (
                <span className="badge bot">
                  {t('room.botBadge', { level: t(`room.bot_${s.bot}`) })}
                </span>
              )}
              {!s.connected && <span className="badge offline">{t('players.offline')}</span>}
              {isHost && s.id !== seatId && (
                <button
                  type="button"
                  className="link"
                  onClick={() => send({ t: 'kick', seatId: s.id })}
                >
                  {t('room.kick')}
                </button>
              )}
            </li>
          ))}
        </ul>
        {isHost && room.seats.length < maxPlayers && (
          <div className="action-buttons add-bots">
            {(['easy', 'medium'] as const).map((level) => (
              <button key={level} type="button" onClick={() => send({ t: 'addBot', level })}>
                {t('room.addBot', { level: t(`room.bot_${level}`) })}
              </button>
            ))}
          </div>
        )}
        <TakeoverSetting
          room={room}
          disabled={!isHost}
          onChange={(s) => send({ t: 'roomSettings', botTakeoverSeconds: s })}
        />
        {!me && room.seats.length < maxPlayers && (
          <JoinForm room={room} onJoin={(name, color) => send({ t: 'join', name, color })} />
        )}
        {!me && room.seats.length >= maxPlayers && <p className="muted">{t('room.full')}</p>}
        {me && (
          <details>
            <summary className="small">{t('room.editSeat')}</summary>
            <JoinForm
              room={room}
              initial={{ name: me.name, color: me.color }}
              submitLabel={t('room.save')}
              onJoin={(name, color) => send({ t: 'updateSeat', name, color })}
            />
          </details>
        )}
      </section>

      <section className="panel">
        <h2>{t('setup.pack')}</h2>
        <PackSelect
          value={room.packId}
          disabled={!isHost}
          onChange={(next) => configure({ packId: next.meta.id, rules: next.rules })}
        />
        <details open={isHost}>
          <summary>{t('setup.rules')}</summary>
          <RulesForm
            rules={room.rules}
            showTimers
            disabled={!isHost}
            onChange={(rules) => configure({ rules })}
          />
        </details>
      </section>

      {online.error && (
        <p className="error" role="alert">
          {t(`roomErrors.${online.error.code}`, { defaultValue: online.error.code })}
        </p>
      )}

      {isHost ? (
        <button
          type="button"
          className="primary big"
          disabled={room.seats.length < 2}
          onClick={() => send({ t: 'start' })}
        >
          {room.seats.length < 2 ? t('room.needTwo') : t('room.start')}
        </button>
      ) : (
        <p className="muted center">{t('room.waitingForHost')}</p>
      )}
    </main>
  );
}

const TAKEOVER_OPTIONS = [30, 60, 120, 300];

function TakeoverSetting({
  room,
  disabled,
  onChange,
}: {
  room: RoomView;
  disabled: boolean;
  onChange: (seconds: number | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <label className="takeover">
      {t('room.takeover')}
      <select
        value={room.botTakeoverSeconds ?? ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      >
        <option value="">{t('room.never')}</option>
        {TAKEOVER_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {t('setup.seconds', { count: s })}
          </option>
        ))}
      </select>
    </label>
  );
}

function JoinForm({
  room,
  initial,
  submitLabel,
  onJoin,
}: {
  room: RoomView;
  initial?: { name: string; color: string };
  submitLabel?: string;
  onJoin: (name: string, color: string) => void;
}) {
  const { t } = useTranslation();
  const taken = room.seats.filter((s) => s.color !== initial?.color).map((s) => s.color);
  const [profile, setProfile] = useState(() => {
    const p = initial ?? loadProfile();
    return { ...p, color: taken.includes(p.color) ? firstFreeColor(taken) : p.color };
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!profile.name.trim()) return;
    saveProfile(profile);
    onJoin(profile.name.trim(), profile.color);
  };

  return (
    <form className="join-form" onSubmit={submit}>
      <label>
        {t('home.yourName')}
        <input
          value={profile.name}
          maxLength={20}
          onChange={(e) => setProfile({ ...profile, name: e.target.value })}
        />
      </label>
      <ColorPicker
        value={profile.color}
        taken={taken}
        onChange={(color) => setProfile({ ...profile, color })}
      />
      <button type="submit" className="primary" disabled={!profile.name.trim()}>
        {submitLabel ?? t('room.takeSeat')}
      </button>
    </form>
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
  const { send, seatId } = online;
  const finished = state.phase.name === 'gameOver';
  if (finished) return null;

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
        <RulesForm rules={rules} onChange={setRules} showTimers />
        <div className="action-buttons">
          <button
            type="button"
            className="primary"
            onClick={() => send({ t: 'updateRules', rules, dice: state.dice })}
          >
            {t('host.applyRules')}
          </button>
          <button type="button" onClick={() => setRules(state.rules)}>
            {t('host.resetRules')}
          </button>
        </div>
      </details>
    </section>
  );
}
