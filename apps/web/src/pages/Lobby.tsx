import {
  MAX_LOBBY_CARDS,
  roomInvitePath,
  type LobbyCard,
  type RoomView,
} from '@menelgame/protocol';
import type { BoardPack, DiceConfig, Effect, EffectKind, Rules } from '@menelgame/schema';
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ColorPicker, firstFreeColor } from '../components/ColorPicker';
import { EffectEditor } from '../components/EffectEditor';
import { PackChooser } from '../components/PackChooser';
import { NumberField, TextField } from '../components/fields';
import { RuleSetPicker } from '../components/RuleSetPicker';
import { RulesForm } from '../components/RulesForm';
import { loadProfile, saveProfile } from '../game/profile';
import type { OnlineRoom } from '../game/useOnlineRoom';

const LOBBY_EFFECT_KINDS: EffectKind[] = [
  'collect',
  'pay',
  'collectFromEach',
  'payEach',
  'moveTo',
  'moveBy',
  'goToJail',
  'jailFreeCard',
];

export function InviteBox({ code }: { code: string }) {
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
          onClick={() => void navigator.clipboard?.writeText(link).then(() => setCopied(true))}
        >
          {copied ? t('room.copied') : t('room.copy')}
        </button>
      </div>
    </div>
  );
}

export function Lobby({ online, room }: { online: OnlineRoom; room: RoomView }) {
  const { t } = useTranslation();
  const { seatId, send } = online;
  const isHost = seatId !== null && seatId === room.hostSeatId;
  const maxPlayers = room.pack.maxPlayers;
  const me = room.seats.find((s) => s.id === seatId);

  const configure = (patch: {
    pack?: BoardPack;
    builtIn?: string;
    rules?: Rules;
    dice?: DiceConfig;
  }) =>
    send({
      t: 'configure',
      packId: patch.pack?.meta.id ?? patch.builtIn ?? room.packId,
      ...(patch.pack && { customPack: patch.pack }),
      rules: patch.rules ?? room.rules,
      dice: patch.dice ?? room.dice,
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
              {room.lobbyCards.enabled && (room.lobbyCards.counts[s.id] ?? 0) > 0 && (
                <span className="badge">
                  {t('lobbyCards.count', { count: room.lobbyCards.counts[s.id] })}
                </span>
              )}
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
        <p>
          <strong>{room.pack.name}</strong>{' '}
          {room.pack.custom && <span className="badge">{t('lobby.customPack')}</span>}
        </p>
        {isHost && (
          <PackChooser
            onBuiltIn={(p) => configure({ builtIn: p.meta.id, rules: p.rules, dice: p.dice })}
            onCustom={(p) => configure({ pack: p, rules: p.rules, dice: p.dice })}
          />
        )}
        <details open={isHost}>
          <summary>{t('setup.rules')}</summary>
          {isHost && (
            <RuleSetPicker
              rules={room.rules}
              dice={room.dice}
              onLoad={(rules, dice) => configure({ rules, dice })}
            />
          )}
          <RulesForm
            rules={room.rules}
            dice={room.dice}
            onDiceChange={(dice) => configure({ dice })}
            showTimers
            disabled={!isHost}
            onChange={(rules) => configure({ rules })}
          />
        </details>
      </section>

      <LobbyCardsPanel online={online} room={room} isHost={isHost} />

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

export function TakeoverSetting({
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

function LobbyCardsPanel({
  online,
  room,
  isHost,
}: {
  online: OnlineRoom;
  room: RoomView;
  isHost: boolean;
}) {
  const { t } = useTranslation();
  const rules = room.lobbyCards;
  const [draft, setDraft] = useState<LobbyCard[]>(online.myLobbyCards);
  useEffect(() => setDraft(online.myLobbyCards), [online.myLobbyCards]);
  const seated = online.seatId !== null;
  const tiles = room.pack.tiles;
  const saved = JSON.stringify(draft) === JSON.stringify(online.myLobbyCards);

  return (
    <section className="panel lobby-cards">
      <h2>{t('lobbyCards.heading')}</h2>
      <p className="muted small">{t('lobbyCards.intro')}</p>
      {isHost && (
        <div className="rules-grid">
          <label className="check">
            <input
              type="checkbox"
              checked={rules.enabled}
              onChange={(e) =>
                online.send({
                  t: 'roomSettings',
                  lobbyCards: { enabled: e.target.checked, maxAmount: rules.maxAmount },
                })
              }
            />
            {t('lobbyCards.enabled')}
          </label>
          <NumberField
            label={t('lobbyCards.maxAmount')}
            value={rules.maxAmount}
            step={50}
            max={5000}
            onChange={(n) =>
              online.send({
                t: 'roomSettings',
                lobbyCards: { enabled: rules.enabled, maxAmount: n },
              })
            }
          />
        </div>
      )}
      {!isHost && (
        <p className="small">
          {rules.enabled
            ? t('lobbyCards.limit', { amount: rules.maxAmount })
            : t('lobbyCards.disabled')}
        </p>
      )}
      {rules.enabled && seated && (
        <div className="my-cards">
          {draft.map((card, i) => (
            <div key={i} className="card-row">
              <TextField
                label={t('lobbyCards.text', { n: i + 1 })}
                value={card.text}
                maxLength={160}
                multiline
                onChange={(text) => setDraft(draft.map((c, j) => (j === i ? { ...c, text } : c)))}
              />
              <EffectEditor
                effects={card.effects as Effect[]}
                context={{ tiles, decks: [], tileTypes: [] }}
                kinds={LOBBY_EFFECT_KINDS}
                maxAmount={rules.maxAmount}
                maxEffects={3}
                onChange={(effects) =>
                  setDraft(
                    draft.map((c, j) =>
                      j === i ? { ...c, effects: effects as LobbyCard['effects'] } : c,
                    ),
                  )
                }
              />
              <button
                type="button"
                className="link danger-link"
                onClick={() => setDraft(draft.filter((_, j) => j !== i))}
              >
                {t('editor.removeCard')}
              </button>
            </div>
          ))}
          <div className="action-buttons">
            {draft.length < MAX_LOBBY_CARDS && (
              <button
                type="button"
                onClick={() =>
                  setDraft([
                    ...draft,
                    {
                      text: t('lobbyCards.example'),
                      effects: [{ kind: 'collect', amount: Math.min(50, rules.maxAmount) }],
                    },
                  ])
                }
              >
                {t('lobbyCards.add')}
              </button>
            )}
            <button
              type="button"
              className="primary"
              disabled={saved}
              onClick={() => online.send({ t: 'setLobbyCards', cards: draft })}
            >
              {saved ? t('lobbyCards.saved') : t('lobbyCards.save')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export function JoinForm({
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
