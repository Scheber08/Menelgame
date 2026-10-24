import {
  CustomTileTypeSchema,
  type BoardPack,
  type Condition,
  type CustomTileType,
  type TileRule,
  type Trigger,
  type Variable,
} from '@menelgame/schema';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EffectEditor, effectContext } from '../components/EffectEditor';
import { NumberField, TextField } from '../components/fields';
import { describeRule } from '../game/format';

const TRIGGERS: Trigger[] = ['land', 'pass', 'turnStart', 'turnEnd', 'roundEnd'];
const CONDITION_KINDS: Condition['kind'][] = [
  'cash',
  'diceTotal',
  'double',
  'buildings',
  'chance',
  'ownsGroup',
  'variable',
];

function defaultCondition(kind: Condition['kind'], pack: BoardPack): Condition {
  switch (kind) {
    case 'cash':
      return { kind, op: 'gte', amount: 500 };
    case 'diceTotal':
      return { kind, op: 'eq', value: 7 };
    case 'double':
      return { kind, value: true };
    case 'buildings':
      return { kind, op: 'gte', count: 1 };
    case 'chance':
      return { kind, percent: 50 };
    case 'ownsGroup':
      return { kind, group: pack.groups[0]?.id ?? '' };
    case 'variable':
      return { kind, variable: pack.variables[0]?.id ?? '', op: 'gte', value: 1 };
  }
}

/** Vorlagen, die zeigen, was der Baukasten kann. */
function presets(t: (key: string) => string): CustomTileType[] {
  return [
    {
      id: 'teleporter',
      name: t('presets.teleporter'),
      color: '#7c3aed',
      description: t('presets.teleporterText'),
      rules: [
        {
          trigger: 'land',
          conditions: [],
          effects: [
            { kind: 'moveToNextOfType', tileType: 'teleporter', passTiles: false, land: false },
          ],
        },
      ],
    },
    {
      id: 'kreuzung',
      name: t('presets.crossing'),
      color: '#0891b2',
      description: t('presets.crossingText'),
      rules: [
        {
          trigger: 'land',
          conditions: [],
          effects: [
            {
              kind: 'choice',
              options: [
                { label: t('presets.takeMoney'), effects: [{ kind: 'collect', amount: 100 }] },
                { label: t('presets.walkOn'), effects: [{ kind: 'moveBy', steps: 3 }] },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'baustelle',
      name: t('presets.roadworks'),
      color: '#ea580c',
      description: t('presets.roadworksText'),
      rules: [{ trigger: 'land', conditions: [], effects: [{ kind: 'skipTurns', turns: 1 }] }],
    },
  ];
}

/** Effekt-Baukasten: eigene Feldtypen aus Auslöser → Bedingungen → Aktionen. */
export function TileTypesTab({
  pack,
  onChange,
  onVariablesChange,
}: {
  pack: BoardPack;
  onChange: (types: CustomTileType[]) => void;
  onVariablesChange: (variables: Variable[]) => void;
}) {
  const { t } = useTranslation();
  const types = pack.tileTypes;
  const used = (id: string) => pack.tiles.some((x) => x.type === 'custom' && x.tileType === id);
  const setType = (i: number, type: CustomTileType) =>
    onChange(types.map((x, j) => (j === i ? type : x)));

  const add = (template?: CustomTileType) => {
    const ids = new Set(types.map((x) => x.id));
    let id = template?.id ?? 'typ';
    let n = 1;
    while (ids.has(id)) id = `${template?.id ?? 'typ'}-${++n}`;
    const base: CustomTileType = template ?? {
      id,
      name: t('editor.newType'),
      color: '#7c3aed',
      rules: [{ trigger: 'land', conditions: [], effects: [{ kind: 'collect', amount: 50 }] }],
    };
    // Vorlagen verweisen ggf. auf sich selbst (Teleporter): ID mitziehen.
    const json = JSON.stringify({ ...base, id }).replaceAll(
      `"tileType":"${base.id}"`,
      `"tileType":"${id}"`,
    );
    onChange([...types, JSON.parse(json) as CustomTileType]);
  };

  return (
    <div className="types-tab">
      <VariablesSection pack={pack} onChange={onVariablesChange} />
      <p className="muted small">{t('editor.typesIntro')}</p>
      <div className="action-buttons">
        <button type="button" onClick={() => add()}>
          {t('editor.addType')}
        </button>
        {presets(t).map((preset) => (
          <button key={preset.id} type="button" className="link" onClick={() => add(preset)}>
            + {preset.name}
          </button>
        ))}
      </div>
      {types.length === 0 && <p className="muted">{t('editor.noTypes')}</p>}
      {types.map((type, i) => (
        <TypeEditor
          key={i}
          pack={pack}
          type={type}
          used={used(type.id)}
          onChange={(next) => setType(i, next)}
          onRemove={() => onChange(types.filter((_, j) => j !== i))}
        />
      ))}
    </div>
  );
}

function TypeEditor({
  pack,
  type,
  used,
  onChange,
  onRemove,
}: {
  pack: BoardPack;
  type: CustomTileType;
  used: boolean;
  onChange: (type: CustomTileType) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const [json, setJson] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const setRule = (i: number, rule: TileRule) =>
    onChange({ ...type, rules: type.rules.map((r, j) => (j === i ? rule : r)) });

  return (
    <section className="type-editor panel">
      <div className="type-head">
        <input
          type="color"
          aria-label={t('editor.color')}
          value={type.color}
          onChange={(e) => onChange({ ...type, color: e.target.value })}
        />
        <input
          aria-label={t('editor.name')}
          value={type.name}
          maxLength={40}
          onChange={(e) => onChange({ ...type, name: e.target.value })}
        />
        <code className="muted small">{type.id}</code>
        <button
          type="button"
          className="link"
          onClick={() => {
            setJson(json === null ? JSON.stringify(type, null, 2) : null);
            setError(null);
          }}
        >
          {json === null ? t('editor.jsonView') : t('editor.blockView')}
        </button>
        <button
          type="button"
          className="link danger-link"
          disabled={used}
          title={used ? t('editor.typeInUse') : undefined}
          onClick={onRemove}
        >
          {t('editor.remove')}
        </button>
      </div>
      <TextField
        label={t('editor.description')}
        value={type.description ?? ''}
        maxLength={200}
        onChange={(description) => onChange({ ...type, description })}
      />

      {json !== null ? (
        <div className="json-editor">
          <textarea value={json} spellCheck={false} onChange={(e) => setJson(e.target.value)} />
          <button
            type="button"
            onClick={() => {
              try {
                const parsed = CustomTileTypeSchema.safeParse(JSON.parse(json));
                if (!parsed.success) {
                  setError(
                    parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n'),
                  );
                  return;
                }
                onChange(parsed.data);
                setJson(null);
                setError(null);
              } catch (e) {
                setError(String(e));
              }
            }}
          >
            {t('editor.applyJson')}
          </button>
          {error && (
            <p className="error small" style={{ whiteSpace: 'pre-line' }}>
              {error}
            </p>
          )}
        </div>
      ) : (
        <>
          {type.rules.map((rule, r) => (
            <div key={r} className="rule-block">
              <div className="rule-row">
                <span className="block-label">{t('editor.when')}</span>
                <select
                  value={rule.trigger}
                  onChange={(e) => setRule(r, { ...rule, trigger: e.target.value as Trigger })}
                >
                  {TRIGGERS.map((trigger) => (
                    <option key={trigger} value={trigger}>
                      {t(`triggers.${trigger}`)}
                    </option>
                  ))}
                </select>
                {type.rules.length > 0 && (
                  <button
                    type="button"
                    className="link danger-link"
                    onClick={() =>
                      onChange({ ...type, rules: type.rules.filter((_, j) => j !== r) })
                    }
                  >
                    {t('editor.removeRule')}
                  </button>
                )}
              </div>
              <div className="rule-row">
                <span className="block-label">{t('editor.if')}</span>
                <ConditionList
                  pack={pack}
                  conditions={rule.conditions}
                  onChange={(conditions) => setRule(r, { ...rule, conditions })}
                />
              </div>
              <div className="rule-row">
                <span className="block-label">{t('editor.then')}</span>
                <EffectEditor
                  effects={rule.effects}
                  context={effectContext(pack)}
                  onChange={(effects) => setRule(r, { ...rule, effects })}
                />
              </div>
              <p className="muted small">{describeRule(t, pack, rule)}</p>
            </div>
          ))}
          {type.rules.length < 10 && (
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...type,
                  rules: [
                    ...type.rules,
                    { trigger: 'land', conditions: [], effects: [{ kind: 'collect', amount: 50 }] },
                  ],
                })
              }
            >
              {t('editor.addRule')}
            </button>
          )}
        </>
      )}
    </section>
  );
}

function ConditionList({
  pack,
  conditions,
  onChange,
}: {
  pack: BoardPack;
  conditions: Condition[];
  onChange: (conditions: Condition[]) => void;
}) {
  const { t } = useTranslation();
  const set = (i: number, c: Condition) => onChange(conditions.map((x, j) => (j === i ? c : x)));
  const op = (value: string, options: string[], update: (v: string) => void) => (
    <select
      value={value}
      onChange={(e) => update(e.target.value)}
      aria-label={t('editor.operator')}
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {t(`editor.op_${o}`)}
        </option>
      ))}
    </select>
  );

  return (
    <div className="conditions">
      {conditions.length === 0 && <span className="muted small">{t('editor.always')}</span>}
      {conditions.map((c, i) => (
        <div key={i} className="effect">
          <select
            value={c.kind}
            aria-label={t('editor.condition')}
            onChange={(e) => set(i, defaultCondition(e.target.value as Condition['kind'], pack))}
          >
            {CONDITION_KINDS.filter((k) => k !== 'variable' || pack.variables.length > 0).map(
              (k) => (
                <option key={k} value={k}>
                  {t(`conditions.${k}`)}
                </option>
              ),
            )}
          </select>
          {c.kind === 'cash' && (
            <>
              {op(c.op, ['lt', 'gte'], (v) => set(i, { ...c, op: v as 'lt' | 'gte' }))}
              <NumberField
                label={t('editor.amount')}
                value={c.amount}
                step={50}
                onChange={(n) => set(i, { ...c, amount: n })}
              />
            </>
          )}
          {c.kind === 'diceTotal' && (
            <>
              {op(c.op, ['eq', 'lt', 'gte'], (v) => set(i, { ...c, op: v as 'eq' | 'lt' | 'gte' }))}
              <NumberField
                label={t('editor.value')}
                value={c.value}
                min={1}
                max={80}
                onChange={(n) => set(i, { ...c, value: n })}
              />
            </>
          )}
          {c.kind === 'double' &&
            op(c.value ? 'yes' : 'no', ['yes', 'no'], (v) => set(i, { ...c, value: v === 'yes' }))}
          {c.kind === 'buildings' && (
            <>
              {op(c.op, ['lt', 'gte'], (v) => set(i, { ...c, op: v as 'lt' | 'gte' }))}
              <NumberField
                label={t('editor.count')}
                value={c.count}
                max={500}
                onChange={(n) => set(i, { ...c, count: n })}
              />
            </>
          )}
          {c.kind === 'chance' && (
            <NumberField
              label={t('editor.percent')}
              value={c.percent}
              min={1}
              max={99}
              onChange={(n) => set(i, { ...c, percent: n })}
            />
          )}
          {c.kind === 'ownsGroup' && (
            <select
              value={c.group}
              aria-label={t('editor.group')}
              onChange={(e) => set(i, { ...c, group: e.target.value })}
            >
              {pack.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          )}
          {c.kind === 'variable' && (
            <>
              <select
                value={c.variable}
                aria-label={t('editor.variable')}
                onChange={(e) => set(i, { ...c, variable: e.target.value })}
              >
                {pack.variables.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
              {op(c.op, ['eq', 'lt', 'gte'], (v) => set(i, { ...c, op: v as 'eq' | 'lt' | 'gte' }))}
              <NumberField
                label={t('editor.value')}
                value={c.value}
                min={-1_000_000}
                max={1_000_000}
                onChange={(n) => set(i, { ...c, value: n })}
              />
            </>
          )}
          <button
            type="button"
            className="link danger-link"
            onClick={() => onChange(conditions.filter((_, j) => j !== i))}
          >
            {t('editor.remove')}
          </button>
        </div>
      ))}
      {conditions.length < 5 && (
        <button
          type="button"
          className="link"
          onClick={() => onChange([...conditions, defaultCondition('cash', pack)])}
        >
          {t('editor.addCondition')}
        </button>
      )}
    </div>
  );
}

/** Zähler pro Spieler oder fürs ganze Spiel, die Feldtypen und Karten nutzen können. */
function VariablesSection({
  pack,
  onChange,
}: {
  pack: BoardPack;
  onChange: (variables: Variable[]) => void;
}) {
  const { t } = useTranslation();
  const variables = pack.variables;
  const set = (i: number, patch: Partial<Variable>) =>
    onChange(variables.map((v, j) => (j === i ? { ...v, ...patch } : v)));
  const used = (id: string) =>
    JSON.stringify([pack.tileTypes, pack.decks]).includes(`"variable":"${id}"`);
  const add = () => {
    const ids = new Set(variables.map((v) => v.id));
    let n = variables.length + 1;
    while (ids.has(`var${n}`)) n++;
    onChange([
      ...variables,
      { id: `var${n}`, name: t('editor.newVariable', { n }), scope: 'player', initial: 0 },
    ]);
  };

  return (
    <section className="panel variables">
      <h3>{t('editor.variablesHeading')}</h3>
      <p className="muted small">{t('editor.variablesIntro')}</p>
      {variables.map((v, i) => (
        <div key={i} className="effect">
          <input
            aria-label={t('editor.name')}
            value={v.name}
            maxLength={40}
            onChange={(e) => set(i, { name: e.target.value })}
          />
          <code className="muted small">{v.id}</code>
          <select
            aria-label={t('editor.scope')}
            value={v.scope}
            onChange={(e) => set(i, { scope: e.target.value as Variable['scope'] })}
          >
            <option value="player">{t('editor.scope_player')}</option>
            <option value="game">{t('editor.scope_game')}</option>
          </select>
          <NumberField
            label={t('editor.initial')}
            value={v.initial}
            min={-1_000_000}
            max={1_000_000}
            onChange={(initial) => set(i, { initial })}
          />
          <button
            type="button"
            className="link danger-link"
            disabled={used(v.id)}
            title={used(v.id) ? t('editor.variableInUse') : undefined}
            onClick={() => onChange(variables.filter((_, j) => j !== i))}
          >
            {t('editor.remove')}
          </button>
        </div>
      ))}
      {variables.length < 10 && (
        <button type="button" className="link" onClick={add}>
          {t('editor.addVariable')}
        </button>
      )}
    </section>
  );
}
