import type { Rules } from '@menelgame/schema';
import { useTranslation } from 'react-i18next';

interface RulesFormProps {
  rules: Rules;
  onChange: (rules: Rules) => void;
  /** Zeitlimits sind nur online sinnvoll. */
  showTimers?: boolean;
  disabled?: boolean;
}

const num = (value: string) => Math.max(0, Math.floor(Number(value) || 0));
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** Schalter und Zahlen für die wichtigsten Regelwerte. */
export function RulesForm({
  rules,
  onChange,
  showTimers = false,
  disabled = false,
}: RulesFormProps) {
  const { t } = useTranslation();
  const patch = (p: Partial<Rules>) => onChange({ ...rules, ...p });

  return (
    <fieldset className="rules-grid" disabled={disabled}>
      <label>
        {t('setup.startingCash')}
        <input
          type="number"
          min={0}
          step={50}
          value={rules.startingCash}
          onChange={(e) => patch({ startingCash: num(e.target.value) })}
        />
      </label>
      <label>
        {t('setup.passStartBonus')}
        <input
          type="number"
          min={0}
          step={50}
          value={rules.passStartBonus}
          onChange={(e) => patch({ passStartBonus: num(e.target.value) })}
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
            onChange={(e) => patch({ [key]: e.target.checked })}
          />
          {t(`setup.${key}`)}
        </label>
      ))}
      <label className="check">
        <input
          type="checkbox"
          checked={rules.jail.collectRentInJail}
          onChange={(e) => patch({ jail: { ...rules.jail, collectRentInJail: e.target.checked } })}
        />
        {t('setup.collectRentInJail')}
      </label>
      <label>
        {t('setup.bankruptcy')}
        <select
          value={rules.bankruptcy.mode}
          onChange={(e) =>
            patch({ bankruptcy: { mode: e.target.value as Rules['bankruptcy']['mode'] } })
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
            patch({
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
              patch({ victory: { type: 'maxRounds', rounds: clamp(num(e.target.value), 1, 1000) } })
            }
          />
        </label>
      )}
      {showTimers && (
        <>
          <label>
            {t('setup.turnSeconds')}
            <select
              value={rules.timers.turnSeconds ?? ''}
              onChange={(e) =>
                patch({
                  timers: {
                    ...rules.timers,
                    turnSeconds: e.target.value === '' ? null : Number(e.target.value),
                  },
                })
              }
            >
              <option value="">{t('setup.noTimer')}</option>
              {[30, 60, 90, 120, 180].map((s) => (
                <option key={s} value={s}>
                  {t('setup.seconds', { count: s })}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('setup.auctionSeconds')}
            <input
              type="number"
              min={5}
              max={120}
              value={rules.timers.auctionSeconds}
              onChange={(e) =>
                patch({
                  timers: { ...rules.timers, auctionSeconds: clamp(num(e.target.value), 5, 120) },
                })
              }
            />
          </label>
        </>
      )}
    </fieldset>
  );
}
