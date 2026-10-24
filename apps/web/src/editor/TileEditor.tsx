import type { BoardPack, Tile } from '@menelgame/schema';
import { useTranslation } from 'react-i18next';
import { NumberField, TextField } from '../components/fields';
import { ImageUpload } from './ImageUpload';

/** Typen, die sich im Editor anlegen lassen (Start und Gefängnis gibt es genau einmal). */
export const ADDABLE_TYPES = [
  'property',
  'station',
  'utility',
  'tax',
  'card',
  'freeParking',
  'goToJail',
  'custom',
] as const;
export type AddableType = (typeof ADDABLE_TYPES)[number];

/** Gruppe für ein neues Feld: die Gruppe eines Felds gleichen Typs, sonst die erste. */
function groupFor(pack: BoardPack, type: Tile['type']): string {
  const existing = pack.tiles.find((t) => t.type === type);
  if (existing && 'group' in existing) return existing.group;
  return pack.groups[0]?.id ?? '';
}

/** Neues Feld eines Typs mit sinnvollen Standardwerten; behält Name und ID, wenn angegeben. */
export function newTile(
  pack: BoardPack,
  type: AddableType,
  base: { id: string; name: string },
): Tile {
  const common = { id: base.id, name: base.name };
  switch (type) {
    case 'property':
      return {
        ...common,
        type,
        group: groupFor(pack, 'property'),
        price: 100,
        houseCost: 50,
        rent: [6, 30, 90, 270, 400, 550],
      };
    case 'station':
      return {
        ...common,
        type,
        group: groupFor(pack, 'station'),
        price: 200,
        rent: [25, 50, 100, 200],
      };
    case 'utility':
      return {
        ...common,
        type,
        group: groupFor(pack, 'utility'),
        price: 150,
        multipliers: [4, 10],
      };
    case 'tax':
      return { ...common, type, amount: 100 };
    case 'card':
      return { ...common, type, deck: pack.decks[0]?.id ?? '' };
    case 'custom':
      return { ...common, type, tileType: pack.tileTypes[0]?.id ?? '' };
    case 'freeParking':
    case 'goToJail':
      return { ...common, type };
  }
}

export function TileEditor({
  pack,
  tile,
  onChange,
}: {
  pack: BoardPack;
  tile: Tile;
  onChange: (tile: Tile) => void;
}) {
  const { t } = useTranslation();
  const money = (label: string, value: number, update: (n: number) => void) => (
    <NumberField
      key={label}
      label={label}
      value={value}
      step={10}
      max={100_000}
      onChange={update}
    />
  );
  const changeType = (type: AddableType) =>
    onChange(newTile(pack, type, { id: tile.id, name: tile.name }));
  const fixedType = tile.type === 'start' || tile.type === 'jail';

  return (
    <div className="tile-editor rules-grid">
      <TextField
        label={t('editor.name')}
        value={tile.name}
        maxLength={60}
        onChange={(name) => onChange({ ...tile, name })}
      />
      <label className="field">
        {t('editor.tileKind')}
        <select
          value={tile.type}
          disabled={fixedType}
          onChange={(e) => changeType(e.target.value as AddableType)}
        >
          {(fixedType ? [tile.type] : ADDABLE_TYPES).map((type) => (
            <option
              key={type}
              value={type}
              disabled={type === 'custom' && pack.tileTypes.length === 0}
            >
              {t(`tile.types.${type}`)}
            </option>
          ))}
        </select>
      </label>
      {'group' in tile && (
        <label className="field">
          {t('editor.group')}
          <select value={tile.group} onChange={(e) => onChange({ ...tile, group: e.target.value })}>
            {pack.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {tile.type === 'custom' && (
        <label className="field">
          {t('editor.customType')}
          <select
            value={tile.tileType}
            onChange={(e) => onChange({ ...tile, tileType: e.target.value })}
          >
            {pack.tileTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {'price' in tile &&
        money(t('tile.price'), tile.price, (price) => onChange({ ...tile, price }))}
      {tile.type === 'property' && (
        <>
          {money(t('tile.houseCost'), tile.houseCost, (houseCost) =>
            onChange({ ...tile, houseCost }),
          )}
          {tile.rent.map((rent, i) =>
            money(
              i === 0
                ? t('tile.rentBase')
                : i === 5
                  ? t('tile.rentHotel')
                  : t('tile.rentHouses', { count: i }),
              rent,
              (n) => onChange({ ...tile, rent: tile.rent.map((r, j) => (j === i ? n : r)) }),
            ),
          )}
        </>
      )}
      {tile.type === 'station' &&
        tile.rent.map((rent, i) =>
          money(t('tile.stationRent', { count: i + 1 }), rent, (n) =>
            onChange({ ...tile, rent: tile.rent.map((r, j) => (j === i ? n : r)) }),
          ),
        )}
      {tile.type === 'utility' &&
        tile.multipliers.map((m, i) => (
          <NumberField
            key={i}
            label={t('editor.utilityFactor', { count: i + 1 })}
            value={m}
            min={1}
            max={100}
            onChange={(n) =>
              onChange({ ...tile, multipliers: tile.multipliers.map((x, j) => (j === i ? n : x)) })
            }
          />
        ))}
      {tile.type === 'tax' &&
        money(t('editor.amount'), tile.amount, (amount) => onChange({ ...tile, amount }))}
      {tile.type === 'card' && (
        <label className="field">
          {t('editor.deck')}
          <select value={tile.deck} onChange={(e) => onChange({ ...tile, deck: e.target.value })}>
            {pack.decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <ImageUpload
        label={t('editor.tileImage')}
        value={tile.image}
        onChange={(image) => {
          const { image: _old, ...rest } = tile;
          onChange((image ? { ...rest, image } : rest) as Tile);
        }}
      />
    </div>
  );
}
