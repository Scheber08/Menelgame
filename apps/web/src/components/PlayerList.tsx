import { actingPlayerId, netWorth, ownedTiles, type GameState } from '@menelgame/engine';
import { useTranslation } from 'react-i18next';
import { formatMoney } from '../game/format';
import { Avatar } from './Avatar';
import { Icon } from './Icon';

interface PlayerListProps {
  state: GameState;
  /** Online: eigener Platz, wird markiert. */
  me?: string | null;
  /** Online: wer gerade verbunden ist. */
  connected?: Record<string, boolean> | null;
  badges?: Record<string, string[]> | null;
  selectedTileId: string | null;
  onSelectTile: (tileId: string) => void;
}

export function PlayerList({
  state,
  me = null,
  connected = null,
  badges = null,
  selectedTileId,
  onSelectTile,
}: PlayerListProps) {
  const { t } = useTranslation();
  const acting = state.phase.name === 'gameOver' ? null : actingPlayerId(state);
  const groupColor = new Map(state.pack.groups.map((g) => [g.id, g.color]));

  return (
    <section className="panel">
      <h2>
        <Icon name="players" />
        {t('players.heading')}
      </h2>
      <ul className="player-list">
        {state.players.map((p) => {
          const tiles = ownedTiles(state, p.id);
          return (
            <li
              key={p.id}
              className={`player${p.id === acting ? ' acting' : ''}${p.bankrupt ? ' bankrupt' : ''}`}
            >
              <div className="player-row">
                <Avatar name={p.name} color={p.color} />
                <span className="player-name">{p.name}</span>
                {p.id === me && <span className="badge">{t('players.you')}</span>}
                {!p.bankrupt &&
                  badges?.[p.id]?.map((b) => (
                    <span key={b} className="badge bot">
                      {b}
                    </span>
                  ))}
                {connected && !p.bankrupt && connected[p.id] === false && (
                  <span className="badge offline">{t('players.offline')}</span>
                )}
                {p.inJail && <span className="badge">{t('turn.inJail')}</span>}
                {p.bankrupt && <span className="badge">{t('players.bankrupt')}</span>}
                <span className="player-cash" title={t('players.cash')}>
                  {formatMoney(t, p.cash)}
                </span>
              </div>
              {!p.bankrupt && (
                <div className="player-meta muted small">
                  {t('players.netWorth')}: {formatMoney(t, netWorth(state, p.id))}
                  {p.jailFreeCards.length > 0 &&
                    ` · ${t('players.jailFreeCards', { count: p.jailFreeCards.length })}`}
                  {state.pack.variables
                    .filter((v) => v.scope === 'player')
                    .map(
                      (v) => ` · ${v.name}: ${state.variables.players[p.id]?.[v.id] ?? v.initial}`,
                    )
                    .join('')}
                </div>
              )}
              {tiles.length > 0 && (
                <div className="chips">
                  {tiles.map((tile) => {
                    const ts = state.tiles[tile.id];
                    return (
                      <button
                        key={tile.id}
                        type="button"
                        className={`chip${ts?.mortgaged ? ' mortgaged' : ''}${
                          selectedTileId === tile.id ? ' selected' : ''
                        }`}
                        style={{ borderColor: groupColor.get(tile.group) }}
                        title={tile.name}
                        onClick={() => onSelectTile(tile.id)}
                      >
                        <span
                          className="chip-color"
                          style={{ background: groupColor.get(tile.group) }}
                        />
                        {tile.name}
                        {ts && ts.buildings > 0 && (
                          <span className="chip-buildings">
                            {ts.buildings === 5 ? 'H' : ts.buildings}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
