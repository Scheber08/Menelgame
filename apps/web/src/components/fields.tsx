import type { ReactNode } from 'react';

/** Ganzzahl-Eingabe mit Grenzen; leere Eingabe wird zu `min`. */
export function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max = 1_000_000,
  step = 1,
  disabled = false,
}: {
  label: ReactNode;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}) {
  return (
    <label className="field">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const n = Math.trunc(Number(e.target.value));
          onChange(Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min);
        }}
      />
    </label>
  );
}

export function TextField({
  label,
  value,
  onChange,
  maxLength = 80,
  multiline = false,
}: {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  multiline?: boolean;
}) {
  return (
    <label className="field">
      {label}
      {multiline ? (
        <textarea
          value={value}
          maxLength={maxLength}
          rows={2}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input value={value} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  );
}
