import { actingPlayerId, netWorth, ownedTiles, type GameState } from '@menelgame/engine';
import { useTranslation } from 'react-i18next';
import { formatMoney } from '../game/format';

interface PlayerListProps {
  state: GameState;
  /** Online: eigener Platz, wird markiert. */
  me?: string | null;
  /** Online: wer gerade verbunden ist. */
  connected?: Record<string, boolean> | null;
  selectedTileId: string | null;
  onSelectTile: (tileId: string) => void;
}

export function PlayerList({
  state,
  me = null,
  connected = null,
  selectedTileId,
  onSelectTile,
}: PlayerListProps) {
  const { t } = useTranslation();
  const acting = state.phase.name === 'gameOver' ? null : actingPlayerId(state);
  const groupColor = new Map(state.pack.groups.map((g) => [g.id, g.color]));

  return (
    <section className="panel">
      <h2>{t('players.heading')}</h2>
      <ul className="player-list">
        {state.players.map((p) => {
          const tiles = ownedTiles(state, p.id);
          return (
            <li
              key={p.id}
              className={`player${p.id === acting ? ' acting' : ''}${p.bankrupt ? ' bankrupt' : ''}`}
            >
              <div className="player-row">
                <span className="dot" style={{ background: p.color }} />
                <span className="player-name">{p.name}</span>
                {p.id === me && <span className="badge">{t('players.you')}</span>}
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
