import { builtInPacks } from '@menelgame/packs';
import type { BoardPack } from '@menelgame/schema';

interface PackSelectProps {
  value: string;
  onChange: (pack: BoardPack) => void;
  disabled?: boolean;
}

export function PackSelect({ value, onChange, disabled = false }: PackSelectProps) {
  const pack = builtInPacks.find((p) => p.meta.id === value);
  return (
    <>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const next = builtInPacks.find((p) => p.meta.id === e.target.value);
          if (next) onChange(next);
        }}
      >
        {builtInPacks.map((p) => (
          <option key={p.meta.id} value={p.meta.id}>
            {p.meta.name}
          </option>
        ))}
      </select>
      {pack?.meta.description && <p className="muted small">{pack.meta.description}</p>}
    </>
  );
}
