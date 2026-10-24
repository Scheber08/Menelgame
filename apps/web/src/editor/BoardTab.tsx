import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { BoardPack, Layout, Tile } from '@menelgame/schema';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { defaultPathPoints } from '../board/geometry';
import { NumberField } from '../components/fields';
import { ADDABLE_TYPES, newTile, TileEditor, type AddableType } from './TileEditor';

interface BoardTabProps {
  pack: BoardPack;
  onChange: (patch: Partial<BoardPack>) => void;
  selected: string | null;
  onSelect: (tileId: string | null) => void;
}

function uniqueId(pack: BoardPack, prefix: string): string {
  const ids = new Set(pack.tiles.map((t) => t.id));
  let n = pack.tiles.length + 1;
  while (ids.has(`${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}

/**
 * Brett-Editor: Form, Felder per Drag and Drop umsortieren, Felder hinzufügen und
 * entfernen, Eigenschaften des gewählten Felds. Beim freien Pfad gehören die Punkte zu den
 * Plätzen; die Felder wandern zwischen ihnen.
 */
export function BoardTab({ pack, onChange, selected, onSelect }: BoardTabProps) {
  const { t } = useTranslation();
  const [addType, setAddType] = useState<AddableType>('property');
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const layout = pack.layout;
  const selectedIndex = pack.tiles.findIndex((x) => x.id === selected);
  const selectedTile = pack.tiles[selectedIndex];

  const setLayout = (next: Layout) => onChange({ layout: next });
  const setTiles = (tiles: Tile[], points?: { x: number; y: number }[]) =>
    onChange({
      tiles,
      ...(layout.shape === 'path' && {
        layout: { shape: 'path', points: points ?? layout.points },
      }),
    });

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = pack.tiles.findIndex((x) => x.id === active.id);
    const to = pack.tiles.findIndex((x) => x.id === over.id);
    setTiles(arrayMove(pack.tiles, from, to));
  };

  const add = () => {
    const id = uniqueId(pack, 'feld');
    const tile = newTile(pack, addType, { id, name: t(`tile.types.${addType}`) });
    const at = selectedIndex >= 0 ? selectedIndex + 1 : pack.tiles.length;
    const tiles = [...pack.tiles.slice(0, at), tile, ...pack.tiles.slice(at)];
    let points: { x: number; y: number }[] | undefined;
    if (layout.shape === 'path') {
      const last = layout.points.at(-1) ?? { x: 50, y: 50 };
      points = [...layout.points, { x: Math.min(100, last.x + 5), y: last.y }];
    }
    setTiles(tiles, points);
    onSelect(id);
  };

  const remove = (index: number) => {
    const tiles = pack.tiles.filter((_, i) => i !== index);
    const points =
      layout.shape === 'path' ? layout.points.filter((_, i) => i !== index) : undefined;
    setTiles(tiles, points);
    onSelect(null);
  };

  return (
    <div className="board-tab">
      <div className="rules-grid">
        <label className="field">
          {t('editor.shape')}
          <select
            value={layout.shape}
            onChange={(e) => {
              const shape = e.target.value as Layout['shape'];
              const n = pack.tiles.length;
              if (shape === 'square') setLayout({ shape });
              else if (shape === 'ring') setLayout({ shape });
              else if (shape === 'path') setLayout({ shape, points: defaultPathPoints(n) });
              else {
                const columns = Math.max(3, Math.round(n / 4) + 2);
                setLayout({ shape, columns, rows: Math.max(3, n / 2 + 2 - columns) });
              }
            }}
          >
            {(['square', 'rectangle', 'ring', 'path'] as const).map((s) => (
              <option key={s} value={s}>
                {t(`editor.shape_${s}`)}
              </option>
            ))}
          </select>
        </label>
        {layout.shape === 'rectangle' && (
          <>
            <NumberField
              label={t('editor.columns')}
              value={layout.columns}
              min={3}
              max={30}
              onChange={(columns) => setLayout({ ...layout, columns })}
            />
            <NumberField
              label={t('editor.rows')}
              value={layout.rows}
              min={3}
              max={30}
              onChange={(rows) => setLayout({ ...layout, rows })}
            />
            <p className="muted small">
              {t('editor.rectangleHint', {
                count: 2 * (layout.columns + layout.rows) - 4,
                tiles: pack.tiles.length,
              })}
            </p>
          </>
        )}
        {layout.shape === 'square' && (
          <p className="muted small">{t('editor.squareHint', { tiles: pack.tiles.length })}</p>
        )}
        {layout.shape === 'path' && (
          <button
            type="button"
            onClick={() =>
              setLayout({ shape: 'path', points: defaultPathPoints(pack.tiles.length) })
            }
          >
            {t('editor.snake')}
          </button>
        )}
      </div>

      <div className="board-tab-body">
        <div>
          <div className="action-buttons add-tile">
            <select
              value={addType}
              onChange={(e) => setAddType(e.target.value as AddableType)}
              aria-label={t('editor.tileKind')}
            >
              {ADDABLE_TYPES.map((type) => (
                <option
                  key={type}
                  value={type}
                  disabled={type === 'custom' && pack.tileTypes.length === 0}
                >
                  {t(`tile.types.${type}`)}
                </option>
              ))}
            </select>
            <button type="button" onClick={add} disabled={pack.tiles.length >= 100}>
              {t('editor.addTile')}
            </button>
          </div>
          <p className="muted small">{t('editor.dragHint')}</p>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext
              items={pack.tiles.map((x) => x.id)}
              strategy={verticalListSortingStrategy}
            >
              <ol className="sortable-tiles">
                {pack.tiles.map((tile, index) => (
                  <SortableTile
                    key={tile.id}
                    tile={tile}
                    index={index}
                    pack={pack}
                    selected={tile.id === selected}
                    onSelect={() => onSelect(tile.id)}
                    onRemove={
                      tile.type === 'start' || tile.type === 'jail' ? null : () => remove(index)
                    }
                  />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
        </div>
        <div className="properties">
          {selectedTile ? (
            <>
              <h3>{t('editor.properties')}</h3>
              <TileEditor
                pack={pack}
                tile={selectedTile}
                onChange={(next) =>
                  setTiles(pack.tiles.map((x, i) => (i === selectedIndex ? next : x)))
                }
              />
              {layout.shape === 'path' && layout.points[selectedIndex] && (
                <div className="rules-grid">
                  {(['x', 'y'] as const).map((axis) => (
                    <NumberField
                      key={axis}
                      label={t(`editor.pos_${axis}`)}
                      value={Math.round(layout.points[selectedIndex]![axis])}
                      max={100}
                      onChange={(v) =>
                        setLayout({
                          shape: 'path',
                          points: layout.points.map((p, i) =>
                            i === selectedIndex ? { ...p, [axis]: v } : p,
                          ),
                        })
                      }
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="muted">{t('editor.selectTile')}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function SortableTile({
  tile,
  index,
  pack,
  selected,
  onSelect,
  onRemove,
}: {
  tile: Tile;
  index: number;
  pack: BoardPack;
  selected: boolean;
  onSelect: () => void;
  onRemove: (() => void) | null;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tile.id,
  });
  const color =
    'group' in tile
      ? pack.groups.find((g) => g.id === tile.group)?.color
      : tile.type === 'custom'
        ? pack.tileTypes.find((x) => x.id === tile.tileType)?.color
        : undefined;
  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
      className={`sortable-tile${selected ? ' selected' : ''}`}
    >
      <button
        type="button"
        className="drag-handle"
        aria-label={t('editor.drag')}
        {...attributes}
        {...listeners}
      >
        ⋮⋮
      </button>
      <button type="button" className="tile-pick" onClick={onSelect}>
        <span className="muted">{index}</span>
        <span className="chip-color" style={{ background: color ?? 'transparent' }} />
        {tile.name}
        <span className="badge">{t(`tile.types.${tile.type}`)}</span>
      </button>
      {onRemove && (
        <button
          type="button"
          className="link danger-link"
          aria-label={t('editor.removeTile')}
          onClick={onRemove}
        >
          ✕
        </button>
      )}
    </li>
  );
}
