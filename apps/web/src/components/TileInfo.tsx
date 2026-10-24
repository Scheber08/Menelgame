import {
  buildingRefund,
  HOTEL,
  unmortgageCost,
  type Action,
  type GameState,
} from '@menelgame/engine';
import { isOwnable, mortgageValueOf, type Tile } from '@menelgame/schema';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { buildingsLabel, formatMoney, playerName } from '../game/format';

interface TileInfoProps {
  state: GameState;
  tileId: string | null;
  legal: Action[];
  dispatch: (action: Action) => void;
}

export function TileInfo({ state, tileId, legal, dispatch }: TileInfoProps) {
  const { t } = useTranslation();
  const tile = state.pack.tiles.find((x) => x.id === tileId);
  if (!tile) {
    return (
      <section className="panel">
        <h2>{t('tile.heading')}</h2>
        <p className="muted">{t('tile.none')}</p>
      </section>
    );
  }

  const money = (n: number) => formatMoney(t, n);
  const group = 'group' in tile ? state.pack.groups.find((g) => g.id === tile.group) : undefined;
  const ts = state.tiles[tile.id];
  const tileActions = legal.filter((a) => 'tileId' in a && a.tileId === tile.id);

  const label = (action: Action): string => {
    if (!isOwnable(tile)) return action.type;
    switch (action.type) {
      case 'BUILD':
        return tile.type === 'property'
          ? t(ts?.buildings === HOTEL - 1 ? 'actions.BUILD_HOTEL' : 'actions.BUILD', {
              cost: money(tile.houseCost),
            })
          : action.type;
      case 'SELL_BUILDING':
        return tile.type === 'property'
          ? t('actions.SELL_BUILDING', { refund: money(buildingRefund(state, tile)) })
          : action.type;
      case 'MORTGAGE':
        return t('actions.MORTGAGE', { amount: money(mortgageValueOf(tile)) });
      case 'UNMORTGAGE':
        return t('actions.UNMORTGAGE', { amount: money(unmortgageCost(state, tile)) });
      default:
        return action.type;
    }
  };

  return (
    <section className="panel tile-info">
      <div className="tile-info-header" style={{ borderColor: group?.color ?? 'var(--border)' }}>
        <div className="muted small">
          {t(`tile.types.${tile.type}`)}
          {group && ` · ${group.name}`}
        </div>
        <h2>{tile.name}</h2>
      </div>
      <dl className="facts">
        {isOwnable(tile) && (
          <>
            <dt>{t('tile.price')}</dt>
            <dd>{money(tile.price)}</dd>
            <dt>{t('tile.owner')}</dt>
            <dd>
              {ts?.owner ? playerName(state, ts.owner) : t('tile.bank')}
              {ts?.mortgaged && <span className="badge">{t('tile.mortgaged')}</span>}
            </dd>
            <dt>{t('tile.mortgageValue')}</dt>
            <dd>{money(mortgageValueOf(tile))}</dd>
          </>
        )}
        {tile.type === 'property' && (
          <>
            <dt>{t('tile.houseCost')}</dt>
            <dd>{money(tile.houseCost)}</dd>
            {ts && ts.buildings > 0 && (
              <>
                <dt>{t('tile.buildings')}</dt>
                <dd>{buildingsLabel(t, ts.buildings)}</dd>
              </>
            )}
          </>
        )}
        {tile.type === 'tax' && (
          <>
            <dt>{t('tile.types.tax')}</dt>
            <dd>{money(tile.amount)}</dd>
          </>
        )}
      </dl>
      <RentTable t={t} state={state} tile={tile} />
      {tileActions.length > 0 && (
        <div className="action-buttons">
          {tileActions.map((action) => (
            <button key={action.type} type="button" onClick={() => dispatch(action)}>
              {label(action)}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function RentTable({ t, state, tile }: { t: TFunction; state: GameState; tile: Tile }) {
  const money = (n: number) => formatMoney(t, n);
  const buildings = state.tiles[tile.id]?.buildings ?? 0;
  let rows: [string, string, boolean][] = [];

  if (tile.type === 'property') {
    rows = tile.rent.map((rent, i) => [
      i === 0
        ? t('tile.rentBase')
        : i === HOTEL
          ? t('tile.rentHotel')
          : t('tile.rentHouses', { count: i }),
      money(rent),
      i === buildings,
    ]);
  } else if (tile.type === 'station') {
    rows = tile.rent.map((rent, i) => [
      t('tile.stationRent', { count: i + 1 }),
      money(rent),
      false,
    ]);
  } else if (tile.type === 'utility') {
    rows = tile.multipliers.map((factor, i) => [
      t('tile.utilityRent', { count: i + 1, factor }),
      '',
      false,
    ]);
  }
  if (rows.length === 0) return null;

  return (
    <div>
      <h3>{t('tile.rentTable')}</h3>
      <table className="rent-table">
        <tbody>
          {rows.map(([label, value, active]) => (
            <tr key={label} className={active ? 'active' : ''}>
              <td>{label}</td>
              <td>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {tile.type === 'property' && (
        <p className="muted small">
          {t('tile.groupBonus', { factor: state.rules.monopolyRentMultiplier })}
        </p>
      )}
    </div>
  );
}
