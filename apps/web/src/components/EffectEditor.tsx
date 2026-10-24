import type { Effect, EffectKind, Tile } from '@menelgame/schema';
import { useTranslation } from 'react-i18next';
import { NumberField } from './fields';

export const ALL_EFFECT_KINDS: EffectKind[] = [
  'collect',
  'pay',
  'collectFromEach',
  'payEach',
  'moveTo',
  'moveBy',
  'moveToNearest',
  'goToJail',
  'jailFreeCard',
  'repairs',
];

export function defaultEffect(kind: EffectKind, tiles: Pick<Tile, 'id'>[]): Effect {
  switch (kind) {
    case 'collect':
    case 'pay':
    case 'collectFromEach':
    case 'payEach':
      return { kind, amount: 50 };
    case 'moveTo':
      return { kind, tile: tiles[0]?.id ?? 'start', passTiles: true };
    case 'moveBy':
      return { kind, steps: -3 };
    case 'moveToNearest':
      return { kind, tileType: 'station' };
    case 'repairs':
      return { kind, perHouse: 25, perHotel: 100 };
    case 'goToJail':
    case 'jailFreeCard':
      return { kind };
  }
}

interface EffectEditorProps {
  effects: Effect[];
  onChange: (effects: Effect[]) => void;
  tiles: Pick<Tile, 'id' | 'name'>[];
  kinds?: EffectKind[];
  /** Obergrenze für Beträge (Lobby-Karten). */
  maxAmount?: number;
  maxEffects?: number;
}

/** Feste Aktionen einer Karte bearbeiten: Art wählen, Werte eintragen. */
export function EffectEditor({
  effects,
  onChange,
  tiles,
  kinds = ALL_EFFECT_KINDS,
  maxAmount = 100_000,
  maxEffects = 10,
}: EffectEditorProps) {
  const { t } = useTranslation();
  const set = (i: number, effect: Effect) =>
    onChange(effects.map((e, j) => (j === i ? effect : e)));
  const amount = (label: string, value: number, update: (n: number) => void) => (
    <NumberField label={label} value={value} max={maxAmount} step={10} onChange={update} />
  );

  return (
    <div className="effects">
      {effects.map((effect, i) => (
        <div className="effect" key={i}>
          <select
            aria-label={t('editor.effectKind')}
            value={effect.kind}
            onChange={(e) => set(i, defaultEffect(e.target.value as EffectKind, tiles))}
          >
            {kinds.map((k) => (
              <option key={k} value={k}>
                {t(`effects.${k}`)}
              </option>
            ))}
          </select>
          {'amount' in effect &&
            amount(t('editor.amount'), effect.amount, (n) => set(i, { ...effect, amount: n }))}
          {effect.kind === 'moveTo' && (
            <label className="field">
              {t('editor.targetTile')}
              <select
                value={effect.tile}
                onChange={(e) => set(i, { ...effect, tile: e.target.value })}
              >
                {tiles.map((tile) => (
                  <option key={tile.id} value={tile.id}>
                    {tile.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {effect.kind === 'moveBy' && (
            <NumberField
              label={t('editor.steps')}
              value={effect.steps}
              min={-12}
              max={12}
              onChange={(n) => set(i, { ...effect, steps: n })}
            />
          )}
          {effect.kind === 'moveToNearest' && (
            <>
              <label className="field">
                {t('editor.tileType')}
                <select
                  value={effect.tileType}
                  onChange={(e) =>
                    set(i, { ...effect, tileType: e.target.value as 'station' | 'utility' })
                  }
                >
                  <option value="station">{t('tile.types.station')}</option>
                  <option value="utility">{t('tile.types.utility')}</option>
                </select>
              </label>
              <NumberField
                label={t('editor.rentMultiplier')}
                value={effect.rentMultiplier ?? 1}
                min={1}
                max={10}
                onChange={(n) => set(i, { ...effect, rentMultiplier: n })}
              />
            </>
          )}
          {effect.kind === 'repairs' && (
            <>
              {amount(t('editor.perHouse'), effect.perHouse, (n) =>
                set(i, { ...effect, perHouse: n }),
              )}
              {amount(t('editor.perHotel'), effect.perHotel, (n) =>
                set(i, { ...effect, perHotel: n }),
              )}
            </>
          )}
          {effects.length > 1 && (
            <button
              type="button"
              className="link danger-link"
              onClick={() => onChange(effects.filter((_, j) => j !== i))}
            >
              {t('editor.remove')}
            </button>
          )}
        </div>
      ))}
      {effects.length < maxEffects && (
        <button
          type="button"
          className="link"
          onClick={() => onChange([...effects, defaultEffect(kinds[0]!, tiles)])}
        >
          {t('editor.addEffect')}
        </button>
      )}
    </div>
  );
}
