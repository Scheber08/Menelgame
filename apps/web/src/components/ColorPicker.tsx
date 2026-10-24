import { useTranslation } from 'react-i18next';

export const PLAYER_COLORS = [
  '#e5484d',
  '#3e63dd',
  '#30a46c',
  '#f5a524',
  '#8e4ec6',
  '#12a594',
  '#d6409f',
  '#6e6e6e',
];

interface ColorPickerProps {
  value: string;
  taken: string[];
  onChange: (color: string) => void;
}

export function firstFreeColor(taken: string[]): string {
  return PLAYER_COLORS.find((c) => !taken.includes(c)) ?? PLAYER_COLORS[0]!;
}

export function ColorPicker({ value, taken, onChange }: ColorPickerProps) {
  const { t } = useTranslation();
  return (
    <div className="swatches" role="radiogroup" aria-label={t('setup.color')}>
      {PLAYER_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value === color}
          aria-label={color}
          disabled={color !== value && taken.includes(color)}
          className={`swatch${value === color ? ' active' : ''}`}
          style={{ background: color }}
          onClick={() => onChange(color)}
        />
      ))}
    </div>
  );
}
