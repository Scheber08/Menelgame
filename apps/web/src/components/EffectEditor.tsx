import type { BaseEffect, Effect, EffectKind } from '@menelgame/schema';
import { useTranslation } from 'react-i18next';
import { NumberField, TextField } from './fields';

export const BASE_EFFECT_KINDS: EffectKind[] = [
  'collect',
  'pay',
  'collectFromEach',
  'payEach',
  'payPercent',
  'moveTo',
  'moveBy',
  'moveToNearest',
  'moveToNextOfType',
  'goToJail',
  'jailFreeCard',
  'repairs',
  'drawCard',
  'blockTile',
  'skipTurns',
];

export const ALL_EFFECT_KINDS: EffectKind[] = [...BASE_EFFECT_KINDS, 'choice'];

interface Named {
  id: string;
  name: string;
}

/** Was im Pack zur Auswahl steht: Felder, Stapel, Feldtypen. */
export interface EffectContext {
  tiles: Named[];
  decks: Named[];
  tileTypes: Named[];
}

export function defaultEffect(kind: EffectKind, context: EffectContext): Effect {
  switch (kind) {
    case 'collect':
    case 'pay':
    case 'collectFromEach':
    case 'payEach':
      return { kind, amount: 50 };
    case 'payPercent':
      return { kind, percent: 10 };
    case 'moveTo':
      return { kind, tile: context.tiles[0]?.id ?? 'start', passTiles: true };
    case 'moveBy':
      return { kind, steps: -3 };
    case 'moveToNearest':
      return { kind, tileType: 'station' };
    case 'moveToNextOfType':
      return {
        kind,
        tileType: context.tileTypes[0]?.id ?? 'station',
        passTiles: false,
        land: false,
      };
    case 'repairs':
      return { kind, perHouse: 25, perHotel: 100 };
    case 'drawCard':
      return { kind, deck: context.decks[0]?.id ?? '' };
    case 'blockTile':
      return { kind, rounds: 2 };
    case 'skipTurns':
      return { kind, turns: 1 };
    case 'goToJail':
    case 'jailFreeCard':
      return { kind };
    case 'choice':
      return {
        kind,
        options: [
          { label: 'A', effects: [{ kind: 'collect', amount: 50 }] },
          { label: 'B', effects: [{ kind: 'pay', amount: 50 }] },
        ],
      };
  }
}

interface EffectEditorProps {
  effects: Effect[];
  onChange: (effects: Effect[]) => void;
  context: EffectContext;
  kinds?: EffectKind[];
  /** Obergrenze für Beträge (Lobby-Karten). */
  maxAmount?: number;
  maxEffects?: number;
}

/** Feste Aktionen bearbeiten: Art wählen, Werte eintragen. Auswahlen enthalten wieder Aktionen. */
export function EffectEditor({
  effects,
  onChange,
  context,
  kinds = ALL_EFFECT_KINDS,
  maxAmount = 100_000,
  maxEffects = 10,
}: EffectEditorProps) {
  const { t } = useTranslation();
  const set = (i: number, effect: Effect) =>
    onChange(effects.map((e, j) => (j === i ? effect : e)));
  const amount = (label: string, value: number, update: (n: number) => void) => (
    <NumberField
      key={label}
      label={label}
      value={value}
      max={maxAmount}
      step={10}
      onChange={update}
    />
  );
  const select = (label: string, value: string, options: Named[], update: (v: string) => void) => (
    <label className="field">
      {label}
      <select value={value} onChange={(e) => update(e.target.value)}>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
  const builtInTypes: Named[] = [
    'station',
    'utility',
    'card',
    'tax',
    'start',
    'jail',
    'freeParking',
  ].map((id) => ({ id, name: t(`tile.types.${id}`) }));

  return (
    <div className="effects">
      {effects.map((effect, i) => (
        <div className={`effect${effect.kind === 'choice' ? ' choice' : ''}`} key={i}>
          <select
            aria-label={t('editor.effectKind')}
            value={effect.kind}
            onChange={(e) => set(i, defaultEffect(e.target.value as EffectKind, context))}
          >
            {kinds.map((k) => (
              <option key={k} value={k}>
                {t(`effects.${k}`)}
              </option>
            ))}
          </select>
          {'amount' in effect &&
            amount(t('editor.amount'), effect.amount, (n) => set(i, { ...effect, amount: n }))}
          {effect.kind === 'payPercent' && (
            <NumberField
              label={t('editor.percent')}
              value={effect.percent}
              min={1}
              max={100}
              onChange={(n) => set(i, { ...effect, percent: n })}
            />
          )}
          {effect.kind === 'moveTo' &&
            select(t('editor.targetTile'), effect.tile, context.tiles, (tile) =>
              set(i, { ...effect, tile }),
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
              {select(t('editor.tileType'), effect.tileType, builtInTypes.slice(0, 2), (v) =>
                set(i, { ...effect, tileType: v as 'station' | 'utility' }),
              )}
              <NumberField
                label={t('editor.rentMultiplier')}
                value={effect.rentMultiplier ?? 1}
                min={1}
                max={10}
                onChange={(n) => set(i, { ...effect, rentMultiplier: n })}
              />
            </>
          )}
          {effect.kind === 'moveToNextOfType' && (
            <>
              {select(
                t('editor.tileType'),
                effect.tileType,
                [...context.tileTypes, ...builtInTypes],
                (v) => set(i, { ...effect, tileType: v }),
              )}
              <label className="check small">
                <input
                  type="checkbox"
                  checked={effect.passTiles}
                  onChange={(e) => set(i, { ...effect, passTiles: e.target.checked })}
                />
                {t('editor.passTiles')}
              </label>
              <label className="check small">
                <input
                  type="checkbox"
                  checked={effect.land}
                  onChange={(e) => set(i, { ...effect, land: e.target.checked })}
                />
                {t('editor.landOnTarget')}
              </label>
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
          {effect.kind === 'drawCard' &&
            select(t('editor.deck'), effect.deck, context.decks, (deck) =>
              set(i, { ...effect, deck }),
            )}
          {effect.kind === 'blockTile' && (
            <NumberField
              label={t('editor.rounds')}
              value={effect.rounds}
              min={1}
              max={20}
              onChange={(n) => set(i, { ...effect, rounds: n })}
            />
          )}
          {effect.kind === 'skipTurns' && (
            <NumberField
              label={t('editor.turns')}
              value={effect.turns}
              min={1}
              max={5}
              onChange={(n) => set(i, { ...effect, turns: n })}
            />
          )}
          {effect.kind === 'choice' && (
            <div className="choice-options">
              {effect.options.map((option, o) => {
                const setOption = (patch: Partial<typeof option>) =>
                  set(i, {
                    ...effect,
                    options: effect.options.map((x, k) => (k === o ? { ...x, ...patch } : x)),
                  });
                return (
                  <div key={o} className="choice-option">
                    <TextField
                      label={t('editor.optionLabel', { n: o + 1 })}
                      value={option.label}
                      maxLength={60}
                      onChange={(label) => setOption({ label })}
                    />
                    <EffectEditor
                      effects={option.effects}
                      context={context}
                      kinds={BASE_EFFECT_KINDS}
                      maxEffects={5}
                      onChange={(next) => setOption({ effects: next as BaseEffect[] })}
                    />
                    {effect.options.length > 2 && (
                      <button
                        type="button"
                        className="link danger-link"
                        onClick={() =>
                          set(i, { ...effect, options: effect.options.filter((_, k) => k !== o) })
                        }
                      >
                        {t('editor.removeOption')}
                      </button>
                    )}
                  </div>
                );
              })}
              {effect.options.length < 4 && (
                <button
                  type="button"
                  className="link"
                  onClick={() =>
                    set(i, {
                      ...effect,
                      options: [
                        ...effect.options,
                        {
                          label: String.fromCharCode(65 + effect.options.length),
                          effects: [{ kind: 'collect', amount: 10 }],
                        },
                      ],
                    })
                  }
                >
                  {t('editor.addOption')}
                </button>
              )}
            </div>
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
          onClick={() => onChange([...effects, defaultEffect(kinds[0]!, context)])}
        >
          {t('editor.addEffect')}
        </button>
      )}
    </div>
  );
}

/** Kontext aus einem Pack. */
export function effectContext(pack: {
  tiles: Named[];
  decks: Named[];
  tileTypes?: Named[];
}): EffectContext {
  return {
    tiles: pack.tiles.map((t) => ({ id: t.id, name: t.name })),
    decks: pack.decks.map((d) => ({ id: d.id, name: d.name })),
    tileTypes: (pack.tileTypes ?? []).map((x) => ({ id: x.id, name: x.name })),
  };
}
