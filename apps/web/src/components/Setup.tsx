import type { GameSetup } from '@menelgame/engine';
import { builtInPacks } from '@menelgame/packs';
import type { Rules } from '@menelgame/schema';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

export const PLAYER_COLORS = ['#e5484d', '#3e63dd', '#30a46c', '#f5a524', '#8e4ec6', '#12a594'];
/** Hot-Seat in Phase 1: bis zu vier Spieler an einem Gerät. */
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

  const patchRules = (patch: Partial<Rules>) => setRules((r) => ({ ...r, ...patch }));
  const updateSeat = (i: number, patch: Partial<SeatDraft>) =>
    setSeats((list) => list.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const addSeat = () =>
    setSeats((list) => {
      const free = PLAYER_COLORS.find((c) => !list.some((s) => s.color === c)) ?? PLAYER_COLORS[0]!;
      return [...list, { name: t('setup.defaultName', { n: list.length + 1 }), color: free }];
    });

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

  const num = (value: string) => Math.max(0, Math.floor(Number(value) || 0));

  return (
    <form className="setup" onSubmit={submit}>
      <h1>{t('setup.heading')}</h1>

      <fieldset className="panel">
        <legend>{t('setup.pack')}</legend>
        <select
          value={packId}
          onChange={(e) => {
            setPackId(e.target.value);
            const next = builtInPacks.find((p) => p.meta.id === e.target.value);
            if (next) setRules(structuredClone(next.rules));
          }}
        >
          {builtInPacks.map((p) => (
            <option key={p.meta.id} value={p.meta.id}>
              {p.meta.name}
            </option>
          ))}
        </select>
        {pack.meta.description && <p className="muted small">{pack.meta.description}</p>}
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
            <div className="swatches" role="radiogroup" aria-label={t('setup.color')}>
              {PLAYER_COLORS.map((color) => {
                const taken = seats.some((s, j) => j !== i && s.color === color);
                return (
                  <button
                    key={color}
                    type="button"
                    role="radio"
                    aria-checked={seat.color === color}
                    aria-label={color}
                    disabled={taken}
                    className={`swatch${seat.color === color ? ' active' : ''}`}
                    style={{ background: color }}
                    onClick={() => updateSeat(i, { color })}
                  />
                );
              })}
            </div>
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
        <div className="rules-grid">
          <label>
            {t('setup.startingCash')}
            <input
              type="number"
              min={0}
              step={50}
              value={rules.startingCash}
              onChange={(e) => patchRules({ startingCash: num(e.target.value) })}
            />
          </label>
          <label>
            {t('setup.passStartBonus')}
            <input
              type="number"
              min={0}
              step={50}
              value={rules.passStartBonus}
              onChange={(e) => patchRules({ passStartBonus: num(e.target.value) })}
            />
          </label>
          {(
            [
              ['freeParkingPot', rules.freeParkingPot],
              ['auctions', rules.auctions],
              ['evenBuilding', rules.evenBuilding],
              ['tripleDoublesToJail', rules.tripleDoublesToJail],
            ] as const
          ).map(([key, value]) => (
            <label key={key} className="check">
              <input
                type="checkbox"
                checked={value}
                onChange={(e) => patchRules({ [key]: e.target.checked })}
              />
              {t(`setup.${key}`)}
            </label>
          ))}
          <label className="check">
            <input
              type="checkbox"
              checked={rules.jail.collectRentInJail}
              onChange={(e) =>
                patchRules({ jail: { ...rules.jail, collectRentInJail: e.target.checked } })
              }
            />
            {t('setup.collectRentInJail')}
          </label>
          <label>
            {t('setup.bankruptcy')}
            <select
              value={rules.bankruptcy.mode}
              onChange={(e) =>
                patchRules({ bankruptcy: { mode: e.target.value as Rules['bankruptcy']['mode'] } })
              }
            >
              <option value="toCreditor">{t('setup.bankruptcyToCreditor')}</option>
              <option value="auction">{t('setup.bankruptcyAuction')}</option>
            </select>
          </label>
          <label>
            {t('setup.victory')}
            <select
              value={rules.victory.type === 'maxRounds' ? 'maxRounds' : 'lastStanding'}
              onChange={(e) =>
                patchRules({
                  victory:
                    e.target.value === 'maxRounds'
                      ? { type: 'maxRounds', rounds: 30 }
                      : { type: 'lastStanding' },
                })
              }
            >
              <option value="lastStanding">{t('setup.victoryLastStanding')}</option>
              <option value="maxRounds">{t('setup.victoryMaxRounds')}</option>
            </select>
          </label>
          {rules.victory.type === 'maxRounds' && (
            <label>
              {t('setup.rounds')}
              <input
                type="number"
                min={1}
                max={1000}
                value={rules.victory.rounds}
                onChange={(e) =>
                  patchRules({
                    victory: {
                      type: 'maxRounds',
                      rounds: Math.min(1000, Math.max(1, num(e.target.value))),
                    },
                  })
                }
              />
            </label>
          )}
          <label>
            {t('setup.seed')}
            <input
              inputMode="numeric"
              value={seed}
              onChange={(e) => setSeed(e.target.value.replace(/\D/g, ''))}
            />
            <span className="muted small">{t('setup.seedHint')}</span>
          </label>
        </div>
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
