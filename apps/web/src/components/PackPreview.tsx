import { createGame } from '@menelgame/engine';
import type { BoardPack } from '@menelgame/schema';
import { useMemo, useState } from 'react';
import { Board } from '../board/Board';

/** Brett eines Packs zur Ansicht, ohne Spiel. */
export function PackPreview({
  pack,
  selected: selectedProp,
  onSelect,
}: {
  pack: BoardPack;
  selected?: string | null;
  onSelect?: (tileId: string) => void;
}) {
  const [own, setOwn] = useState<string | null>(null);
  const selected = selectedProp !== undefined ? selectedProp : own;
  const setSelected = onSelect ?? setOwn;
  const state = useMemo(() => {
    try {
      return createGame({
        pack,
        seed: 1,
        players: [
          { id: 'a', name: 'A', color: '#e5484d' },
          { id: 'b', name: 'B', color: '#3e63dd' },
        ],
      });
    } catch {
      return null;
    }
  }, [pack]);
  if (!state) return null;
  return (
    <div className="pack-preview">
      <Board
        state={{ ...state, players: [] }}
        events={[]}
        selectedTileId={selected}
        onSelectTile={setSelected}
      />
    </div>
  );
}
