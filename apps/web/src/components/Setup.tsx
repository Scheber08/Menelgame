import type { GameSetup } from '@menelgame/engine';
import { builtInPacks } from '@menelgame/packs';
import type { Rules } from '@menelgame/schema';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ColorPicker, firstFreeColor, PLAYER_COLORS } from './ColorPicker';
import { PackSelect } from './PackSelect';
import { RulesForm } from './RulesForm';

/** Hot-Seat: bis zu vier Spieler an einem Gerät. */
const HOT_SEAT_MAX = 4;

function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!;
}

interface SeatDraft {
  name: string;
  color: string;
}

export function Setup({ onStart }: { onStart: (setup: GameSetup) => void }) {
  const { t } = useTranslation();
  const [packId, setPackId] = useState(builtInPacks[0]!.meta.id);
  const pack = builtInPacks.find((p) => p.meta.id === packId) ?? builtInPacks[0]!;
  const maxSeats = Math.min(HOT_SEAT_MAX, pack.maxPlayers);

  const [seats, setSeats] = useState<SeatDraft[]>(() =>
    [1, 2].map((n) => ({ name: t('setup.defaultName', { n }), color: PLAYER_COLORS[n - 1]! })),
  );
  const [rules, setRules] = useState<Rules>(() => structuredClone(pack.rules));
  const [seed, setSeed] = useState(() => String(randomSeed()));
  const [error, setError] = useState<string | null>(null);

  const updateSeat = (i: number, patch: Partial<SeatDraft>) =>
    setSeats((list) => list.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const addSeat = () =>
    setSeats((list) => [
      ...list,
      {
        name: t('setup.defaultName', { n: list.length + 1 }),
        color: firstFreeColor(list.map((s) => s.color)),
      },
    ]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (seats.some((s) => s.name.trim() === '')) {
      setError(t('setup.nameRequired'));
      return;
    }
    const parsedSeed = Number.parseInt(seed, 10);
    onStart({
      pack,
      rules,
      seed: Number.isFinite(parsedSeed) ? parsedSeed >>> 0 : randomSeed(),
      players: seats.map((s, i) => ({ id: `p${i + 1}`, name: s.name.trim(), color: s.color })),
    });
  };

  return (
    <form className="setup" onSubmit={submit}>
      <h1>{t('setup.heading')}</h1>

      <fieldset className="panel">
        <legend>{t('setup.pack')}</legend>
        <PackSelect
          value={packId}
          onChange={(next) => {
            setPackId(next.meta.id);
            setRules(structuredClone(next.rules));
          }}
        />
      </fieldset>

      <fieldset className="panel">
        <legend>{t('setup.players')}</legend>
        <p className="muted small">{t('setup.maxPlayers', { max: maxSeats })}</p>
        {seats.map((seat, i) => (
          <div className="seat" key={i}>
            <input
              aria-label={t('setup.playerName', { n: i + 1 })}
              value={seat.name}
              maxLength={20}
              onChange={(e) => updateSeat(i, { name: e.target.value })}
            />
            <ColorPicker
              value={seat.color}
              taken={seats.filter((_, j) => j !== i).map((s) => s.color)}
              onChange={(color) => updateSeat(i, { color })}
            />
            {seats.length > 2 && (
              <button
                type="button"
                className="link"
                onClick={() => setSeats((list) => list.filter((_, j) => j !== i))}
              >
                {t('setup.removePlayer')}
              </button>
            )}
          </div>
        ))}
        {seats.length < maxSeats && (
          <button type="button" onClick={addSeat}>
            {t('setup.addPlayer')}
          </button>
        )}
      </fieldset>

      <details className="panel">
        <summary>{t('setup.rules')}</summary>
        <RulesForm rules={rules} onChange={setRules} />
        <label className="seed">
          {t('setup.seed')}
          <input
            inputMode="numeric"
            value={seed}
            onChange={(e) => setSeed(e.target.value.replace(/\D/g, ''))}
          />
          <span className="muted small">{t('setup.seedHint')}</span>
        </label>
      </details>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="primary big">
        {t('setup.start')}
      </button>
    </form>
  );
}
