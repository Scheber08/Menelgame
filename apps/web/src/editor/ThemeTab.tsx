import type { Theme } from '@menelgame/schema';
import { useTranslation } from 'react-i18next';
import { ImageUpload } from './ImageUpload';

const COLORS = ['boardColor', 'tileColor', 'centerColor', 'textColor'] as const;
const DEFAULTS: Record<(typeof COLORS)[number], string> = {
  boardColor: '#dfe9df',
  tileColor: '#fbfaf6',
  centerColor: '#e8efe6',
  textColor: '#1f2421',
};

/** Aussehen: Farben, Schrift, Figuren und Bild in der Brettmitte. */
export function ThemeTab({ theme, onChange }: { theme: Theme; onChange: (theme: Theme) => void }) {
  const { t } = useTranslation();
  const without = (key: keyof Theme): Theme => {
    const copy = { ...theme };
    delete copy[key];
    return copy;
  };

  return (
    <div className="rules-grid theme-tab">
      {COLORS.map((key) => (
        <div key={key} className="field">
          <span>{t(`editor.theme_${key}`)}</span>
          <div className="color-row">
            <input
              type="color"
              value={theme[key] ?? DEFAULTS[key]}
              disabled={!theme[key]}
              onChange={(e) => onChange({ ...theme, [key]: e.target.value })}
            />
            <label className="check small">
              <input
                type="checkbox"
                checked={!theme[key]}
                onChange={(e) =>
                  onChange(e.target.checked ? without(key) : { ...theme, [key]: DEFAULTS[key] })
                }
              />
              {t('editor.themeDefault')}
            </label>
          </div>
        </div>
      ))}
      <label className="field">
        {t('editor.font')}
        <select
          value={theme.font}
          onChange={(e) => onChange({ ...theme, font: e.target.value as Theme['font'] })}
        >
          {(['system', 'serif', 'rounded', 'mono'] as const).map((f) => (
            <option key={f} value={f}>
              {t(`editor.font_${f}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        {t('editor.tokens')}
        <select
          value={theme.tokens}
          onChange={(e) => onChange({ ...theme, tokens: e.target.value as Theme['tokens'] })}
        >
          {(['initials', 'dots', 'pawns'] as const).map((f) => (
            <option key={f} value={f}>
              {t(`editor.tokens_${f}`)}
            </option>
          ))}
        </select>
      </label>
      <ImageUpload
        label={t('editor.centerImage')}
        value={theme.centerImage}
        onChange={(url) => onChange(url ? { ...theme, centerImage: url } : without('centerImage'))}
      />
    </div>
  );
}
