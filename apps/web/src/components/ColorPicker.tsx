import { PLAYER_COLORS } from '@menelgame/protocol';
import { useTranslation } from 'react-i18next';

export { PLAYER_COLORS };

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
