import type { DiceConfig, Rules } from '@menelgame/schema';
import { RulesSchema, DiceSchema } from '@menelgame/schema';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, useMyList } from '../game/api';

const load = () => api.listRuleSets();

/** Regelsets laden und speichern – unabhängig vom gewählten Brett. */
export function RuleSetPicker({
  rules,
  dice,
  onLoad,
  disabled = false,
}: {
  rules: Rules;
  dice: DiceConfig;
  onLoad: (rules: Rules, dice: DiceConfig) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const sets = useMyList(load);
  const [status, setStatus] = useState<string | null>(null);

  const save = async () => {
    const name = window.prompt(t('ruleSets.namePrompt'))?.trim();
    if (!name) return;
    try {
      await api.saveRuleSet({ name, rules, dice });
      sets.reload();
      setStatus(t('ruleSets.saved', { name }));
    } catch {
      setStatus(t('ruleSets.saveFailed'));
    }
  };

  return (
    <div className="ruleset-picker">
      <select
        aria-label={t('ruleSets.load')}
        value=""
        disabled={disabled || sets.items.length === 0}
        onChange={(e) => {
          const set = sets.items.find((s) => s.id === e.target.value);
          if (!set) return;
          // Gespeicherte Sets können älter sein: über das Schema ergänzen.
          onLoad(RulesSchema.parse(set.rules), DiceSchema.parse(set.dice));
          setStatus(t('ruleSets.loaded', { name: set.name }));
        }}
      >
        <option value="">
          {sets.items.length === 0 ? t('ruleSets.none') : t('ruleSets.load')}
        </option>
        {sets.items.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <button type="button" disabled={disabled} onClick={() => void save()}>
        {t('ruleSets.save')}
      </button>
      {status && <span className="muted small">{status}</span>}
    </div>
  );
}
