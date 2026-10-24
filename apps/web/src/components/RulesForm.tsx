import type { DiceConfig, Rules } from '@menelgame/schema';
import { useTranslation } from 'react-i18next';
import { NumberField } from './fields';

interface RulesFormProps {
  rules: Rules;
  onChange: (rules: Rules) => void;
  /** Würfel mit bearbeiten (nur, wenn gesetzt). */
  dice?: DiceConfig;
  onDiceChange?: (dice: DiceConfig) => void;
  /** Zeitlimits sind nur online sinnvoll. */
  showTimers?: boolean;
  disabled?: boolean;
}

/** Regel-Panel: Schalter und Zahlen für alle Regelwerte, gruppiert. */
export function RulesForm({
  rules,
  onChange,
  dice,
  onDiceChange,
  showTimers = false,
  disabled = false,
}: RulesFormProps) {
  const { t } = useTranslation();
  const patch = (p: Partial<Rules>) => onChange({ ...rules, ...p });
  const check = (key: string, checked: boolean, update: (v: boolean) => void) => (
    <label key={key} className="check">
      <input type="checkbox" checked={checked} onChange={(e) => update(e.target.checked)} />
      {t(`setup.${key}`)}
    </label>
  );

  return (
    <fieldset className="rules-form" disabled={disabled}>
      <div className="rules-grid">
        <NumberField
          label={t('setup.startingCash')}
          value={rules.startingCash}
          step={50}
          max={100_000}
          onChange={(n) => patch({ startingCash: n })}
        />
        <NumberField
          label={t('setup.passStartBonus')}
          value={rules.passStartBonus}
          step={50}
          max={10_000}
          onChange={(n) => patch({ passStartBonus: n })}
        />
        {check('freeParkingPot', rules.freeParkingPot, (v) => patch({ freeParkingPot: v }))}
        {check('auctions', rules.auctions, (v) => patch({ auctions: v }))}
        {check('evenBuilding', rules.evenBuilding, (v) => patch({ evenBuilding: v }))}
        {check('tripleDoublesToJail', rules.tripleDoublesToJail, (v) =>
          patch({ tripleDoublesToJail: v }),
        )}
        {check('collectRentInJail', rules.jail.collectRentInJail, (v) =>
          patch({ jail: { ...rules.jail, collectRentInJail: v } }),
        )}
        <label className="field">
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
        <label className="field">
          {t('setup.victory')}
          <select
            value={rules.victory.type}
            onChange={(e) =>
              patch({
                victory:
                  e.target.value === 'maxRounds'
                    ? { type: 'maxRounds', rounds: 30 }
                    : e.target.value === 'targetNetWorth'
                      ? { type: 'targetNetWorth', amount: 5000 }
                      : { type: 'lastStanding' },
              })
            }
          >
            <option value="lastStanding">{t('setup.victoryLastStanding')}</option>
            <option value="maxRounds">{t('setup.victoryMaxRounds')}</option>
            <option value="targetNetWorth">{t('setup.victoryTarget')}</option>
          </select>
        </label>
        {rules.victory.type === 'maxRounds' && (
          <NumberField
            label={t('setup.rounds')}
            value={rules.victory.rounds}
            min={1}
            max={1000}
            onChange={(n) => patch({ victory: { type: 'maxRounds', rounds: n } })}
          />
        )}
        {rules.victory.type === 'targetNetWorth' && (
          <NumberField
            label={t('setup.targetAmount')}
            value={rules.victory.amount}
            step={500}
            onChange={(n) => patch({ victory: { type: 'targetNetWorth', amount: n } })}
          />
        )}
        {showTimers && (
          <>
            <label className="field">
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
            <NumberField
              label={t('setup.auctionSeconds')}
              value={rules.timers.auctionSeconds}
              min={5}
              max={120}
              onChange={(n) => patch({ timers: { ...rules.timers, auctionSeconds: n } })}
            />
          </>
        )}
      </div>

      <details className="rules-more">
        <summary>{t('setup.moreRules')}</summary>
        <div className="rules-grid">
          <NumberField
            label={t('setup.landOnStartExtra')}
            value={rules.landOnStartExtra}
            step={50}
            max={10_000}
            onChange={(n) => patch({ landOnStartExtra: n })}
          />
          <NumberField
            label={t('setup.bail')}
            value={rules.jail.bail}
            step={10}
            max={10_000}
            onChange={(n) => patch({ jail: { ...rules.jail, bail: n } })}
          />
          <NumberField
            label={t('setup.jailTurns')}
            value={rules.jail.maxTurns}
            min={1}
            max={10}
            onChange={(n) => patch({ jail: { ...rules.jail, maxTurns: n } })}
          />
          <NumberField
            label={t('setup.monopolyMultiplier')}
            value={rules.monopolyRentMultiplier}
            min={1}
            max={10}
            onChange={(n) => patch({ monopolyRentMultiplier: n })}
          />
          <NumberField
            label={t('setup.sellPercent')}
            value={rules.buildingSellPercent}
            max={100}
            step={5}
            onChange={(n) => patch({ buildingSellPercent: n })}
          />
          <NumberField
            label={t('setup.interestPercent')}
            value={rules.mortgageInterestPercent}
            max={100}
            onChange={(n) => patch({ mortgageInterestPercent: n })}
          />
          {(['houses', 'hotels'] as const).map((kind) => {
            const value = rules.buildingLimit[kind];
            return (
              <div key={kind} className="field">
                <NumberField
                  label={t(`setup.limit_${kind}`)}
                  value={value ?? 0}
                  disabled={value === null}
                  max={500}
                  onChange={(n) => patch({ buildingLimit: { ...rules.buildingLimit, [kind]: n } })}
                />
                <label className="check small">
                  <input
                    type="checkbox"
                    checked={value === null}
                    onChange={(e) =>
                      patch({
                        buildingLimit: {
                          ...rules.buildingLimit,
                          [kind]: e.target.checked ? null : kind === 'houses' ? 32 : 12,
                        },
                      })
                    }
                  />
                  {t('setup.unlimited')}
                </label>
              </div>
            );
          })}
          {dice && onDiceChange && (
            <>
              <NumberField
                label={t('setup.diceCount')}
                value={dice.count}
                min={1}
                max={4}
                onChange={(n) => onDiceChange({ ...dice, count: n })}
              />
              <NumberField
                label={t('setup.diceSides')}
                value={dice.sides}
                min={2}
                max={20}
                onChange={(n) => onDiceChange({ ...dice, sides: n })}
              />
            </>
          )}
        </div>
      </details>
    </fieldset>
  );
}
