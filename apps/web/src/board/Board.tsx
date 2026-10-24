import { HOTEL, type GameEvent, type GameState, type Player } from '@menelgame/engine';
import { isOwnable, type Tile } from '@menelgame/schema';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { diceFace, formatMoney } from '../game/format';
import { boardGeometry, type TileRect } from './geometry';

const STRIPE = 20;
const OWNER_BAND = 5;
const TOKEN_R = 9;
const LABEL_FONT = 10;

/** Schriftgröße, bei der das längste Wort ohne Trennung in die Breite passt. */
function fitFontSize(name: string, width: number): number {
  const longest = Math.max(...name.split(/[\s-]+/).map((w) => w.length));
  return Math.max(7.5, Math.min(LABEL_FONT, (width - 6) / (0.6 * longest)));
}

/** Kurzzeichen für Spielfiguren; bei gleichen Anfangsbuchstaben mit Platznummer. */
export function tokenLabels(players: Player[]): Map<string, string> {
  const initial = (p: Player) => p.name.trim().slice(0, 1).toUpperCase() || '?';
  return new Map(
    players.map((p, seat) => {
      const shared = players.filter((o) => initial(o) === initial(p)).length > 1;
      return [p.id, shared ? `${initial(p)}${seat + 1}` : initial(p)];
    }),
  );
}

interface BoardProps {
  state: GameState;
  events: GameEvent[];
  selectedTileId: string | null;
  onSelectTile: (tileId: string) => void;
}

export function Board({ state, events, selectedTileId, onSelectTile }: BoardProps) {
  const geometry = useMemo(
    () => boardGeometry(state.pack.layout, state.pack.tiles.length),
    [state.pack],
  );
  const groupColor = useMemo(
    () => new Map(state.pack.groups.map((g) => [g.id, g.color])),
    [state.pack],
  );

  const playersAt = (index: number) =>
    state.players.filter((p) => !p.bankrupt && p.position === index);
  const current = state.players[state.currentPlayer];
  const labels = useMemo(() => tokenLabels(state.players), [state.players]);

  return (
    <svg
      className="board"
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
      role="img"
      aria-label={state.pack.meta.name}
    >
      <defs>
        <pattern
          id="hatch"
          width="8"
          height="8"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" y2="8" className="hatch-line" />
        </pattern>
      </defs>
      <rect className="board-bg" x={0} y={0} width={geometry.width} height={geometry.height} />
      <BoardCenter state={state} events={events} rect={geometry.center} current={current} />
      {geometry.tiles.map((rect) => {
        const tile = state.pack.tiles[rect.index]!;
        return (
          <TileView
            key={tile.id}
            rect={rect}
            tile={tile}
            state={state}
            color={'group' in tile ? groupColor.get(tile.group) : undefined}
            players={playersAt(rect.index)}
            labels={labels}
            selected={selectedTileId === tile.id}
            onSelect={() => onSelectTile(tile.id)}
          />
        );
      })}
    </svg>
  );
}

interface TileViewProps {
  rect: TileRect;
  tile: Tile;
  state: GameState;
  color: string | undefined;
  players: Player[];
  labels: Map<string, string>;
  selected: boolean;
  onSelect: () => void;
}

function TileView({
  rect,
  tile,
  state,
  color,
  players,
  labels,
  selected,
  onSelect,
}: TileViewProps) {
  const { t } = useTranslation();
  const ts = isOwnable(tile) ? state.tiles[tile.id] : undefined;
  const owner = ts?.owner ? state.players.find((p) => p.id === ts.owner) : undefined;
  const { x, y, w, h, side } = rect;
  const horizontal = side === 'bottom' || side === 'top';
  const hasStripe = color !== undefined && !rect.corner;

  // Farbstreifen an der Innenkante, Besitzerband an der Außenkante.
  const stripe = {
    bottom: { x, y, w, h: STRIPE },
    top: { x, y: y + h - STRIPE, w, h: STRIPE },
    left: { x: x + w - STRIPE, y, w: STRIPE, h },
    right: { x, y, w: STRIPE, h },
  }[side];
  const band = {
    bottom: { x, y: y + h - OWNER_BAND, w, h: OWNER_BAND },
    top: { x, y, w, h: OWNER_BAND },
    left: { x, y, w: OWNER_BAND, h },
    right: { x: x + w - OWNER_BAND, y, w: OWNER_BAND, h },
  }[side];
  const content = hasStripe
    ? {
        bottom: { x, y: y + STRIPE, w, h: h - STRIPE - OWNER_BAND },
        top: { x, y: y + OWNER_BAND, w, h: h - STRIPE - OWNER_BAND },
        left: { x: x + OWNER_BAND, y, w: w - STRIPE - OWNER_BAND, h },
        right: { x: x + STRIPE, y, w: w - STRIPE - OWNER_BAND, h },
      }[side]
    : { x, y, w, h };

  const subtitle =
    'price' in tile
      ? formatMoney(t, tile.price)
      : tile.type === 'tax'
        ? formatMoney(t, tile.amount)
        : null;
  const deck = tile.type === 'card' ? state.pack.decks.find((d) => d.id === tile.deck) : undefined;

  return (
    <g
      className={`tile tile-${tile.type}${selected ? ' selected' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={tile.name}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <rect className="tile-bg" x={x} y={y} width={w} height={h} />
      {hasStripe && (
        <rect x={stripe.x} y={stripe.y} width={stripe.w} height={stripe.h} fill={color} />
      )}
      {hasStripe && ts && ts.buildings > 0 && (
        <Buildings stripe={stripe} horizontal={horizontal} count={ts.buildings} />
      )}
      {owner && <rect x={band.x} y={band.y} width={band.w} height={band.h} fill={owner.color} />}
      <foreignObject x={content.x} y={content.y} width={content.w} height={content.h}>
        <div className={`tile-label${rect.corner ? ' corner' : ''}`} lang="de">
          {deck && (
            <span className="tile-symbol" style={{ color: deck.color }}>
              ?
            </span>
          )}
          <span
            className="tile-name"
            style={rect.corner ? undefined : { fontSize: fitFontSize(tile.name, content.w) }}
          >
            {tile.name}
          </span>
          {subtitle && <span className="tile-price">{subtitle}</span>}
        </div>
      </foreignObject>
      {ts?.mortgaged && (
        <rect
          className="mortgaged"
          x={content.x}
          y={content.y}
          width={content.w}
          height={content.h}
          fill="url(#hatch)"
        />
      )}
      <Tokens players={players} labels={labels} area={content} />
      <rect className="tile-outline" x={x} y={y} width={w} height={h} />
    </g>
  );
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function Buildings({
  stripe,
  horizontal,
  count,
}: {
  stripe: Box;
  horizontal: boolean;
  count: number;
}) {
  if (count === HOTEL) {
    const size = { w: horizontal ? 26 : 12, h: horizontal ? 12 : 26 };
    return (
      <rect
        className="hotel"
        x={stripe.x + (stripe.w - size.w) / 2}
        y={stripe.y + (stripe.h - size.h) / 2}
        width={size.w}
        height={size.h}
        rx={2}
      />
    );
  }
  const size = 10;
  const gap = 3;
  const total = count * size + (count - 1) * gap;
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const offset = i * (size + gap);
        const hx = horizontal
          ? stripe.x + (stripe.w - total) / 2 + offset
          : stripe.x + (stripe.w - size) / 2;
        const hy = horizontal
          ? stripe.y + (stripe.h - size) / 2
          : stripe.y + (stripe.h - total) / 2 + offset;
        return <rect key={i} className="house" x={hx} y={hy} width={size} height={size} rx={1.5} />;
      })}
    </>
  );
}

function Tokens({
  players,
  labels,
  area,
}: {
  players: Player[];
  labels: Map<string, string>;
  area: Box;
}) {
  if (players.length === 0) return null;
  const perRow = Math.max(1, Math.floor((area.w - 4) / (TOKEN_R * 2 + 2)));
  return (
    <g className="tokens">
      {players.map((p, i) => {
        const row = Math.floor(i / perRow);
        const col = i % perRow;
        const cx = area.x + 4 + TOKEN_R + col * (TOKEN_R * 2 + 2);
        const cy = area.y + area.h - 4 - TOKEN_R - row * (TOKEN_R * 2 + 2);
        return (
          <g key={p.id} className={`token${p.inJail ? ' jailed' : ''}`}>
            <circle cx={cx} cy={cy} r={TOKEN_R} fill={p.color} />
            <text
              x={cx}
              y={cy}
              dy="0.35em"
              textAnchor="middle"
              className={labels.get(p.id)!.length > 1 ? 'narrow' : ''}
            >
              {labels.get(p.id)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function BoardCenter({
  state,
  events,
  rect,
  current,
}: {
  state: GameState;
  events: GameEvent[];
  rect: Box;
  current: Player | undefined;
}) {
  const { t } = useTranslation();
  const lastCard = [...events].reverse().find((e) => e.type === 'cardDrawn');
  const deck = lastCard ? state.pack.decks.find((d) => d.id === lastCard.deckId) : undefined;
  const supply = (n: number | null) => (n === null ? t('center.unlimited') : n);

  return (
    <foreignObject x={rect.x} y={rect.y} width={rect.w} height={rect.h}>
      <div className="board-center">
        <div className="center-title">Menelgame</div>
        <div className="center-pack">{state.pack.meta.name}</div>
        {current && state.phase.name !== 'gameOver' && (
          <div className="center-turn">
            <span className="dot" style={{ background: current.color }} />
            {current.name} · {t('turn.round', { round: state.round })}
          </div>
        )}
        {state.lastRoll && (
          <div className="center-dice" aria-label={state.lastRoll.dice.join(' + ')}>
            {state.lastRoll.dice.map((d, i) => (
              <span key={i} className={state.dice.sides === 6 ? 'die-face' : 'die-number'}>
                {diceFace(d, state.dice.sides)}
              </span>
            ))}
          </div>
        )}
        {lastCard?.type === 'cardDrawn' && (
          <div className="center-card" style={{ borderColor: deck?.color }}>
            <div className="center-card-deck">{deck?.name ?? t('center.lastCard')}</div>
            <div>{lastCard.text}</div>
          </div>
        )}
        <div className="center-meta">
          {state.rules.freeParkingPot && (
            <span>{t('center.pot', { amount: formatMoney(t, state.freeParkingPot) })}</span>
          )}
          <span>
            {t('center.bankSupply', {
              houses: supply(state.bank.houses),
              hotels: supply(state.bank.hotels),
            })}
          </span>
        </div>
      </div>
    </foreignObject>
  );
}
