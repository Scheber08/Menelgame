import { HOTEL, type GameEvent, type GameState, type Player } from '@menelgame/engine';
import { isOwnable, type Theme, type Tile } from '@menelgame/schema';
import { useMemo, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Die } from '../components/Die';
import { formatMoney } from '../game/format';
import { boardGeometry, type Side, type TileRect } from './geometry';

const STRIPE = 20;
const OWNER_BAND = 5;
const TOKEN_R = 11;
/** Abstand zwischen den Feldern und Innenabstand der Streifen. */
const GAP = 1.5;
const INSET = 3.5;
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

/** Farben und Schrift des Packs als CSS-Variablen; ohne Angabe gilt das App-Farbschema. */
function themeStyle(theme: Theme | undefined): CSSProperties {
  const vars: Record<string, string> = {};
  if (theme?.boardColor) vars['--board-bg'] = theme.boardColor;
  if (theme?.tileColor) vars['--tile-bg'] = theme.tileColor;
  if (theme?.centerColor) vars['--center-bg'] = theme.centerColor;
  if (theme?.textColor) vars['--board-text'] = theme.textColor;
  return vars as CSSProperties;
}

interface BoardProps {
  state: GameState;
  events: GameEvent[];
  selectedTileId: string | null;
  onSelectTile: (tileId: string) => void;
  /** Angezeigte Figurenpositionen (Animation); ohne Angabe die aus dem Zustand. */
  positions?: Record<string, number>;
}

export function Board({ state, events, selectedTileId, onSelectTile, positions }: BoardProps) {
  const pack = state.pack;
  const geometry = useMemo(() => boardGeometry(pack.layout, pack.tiles.length), [pack]);
  const colors = useMemo(
    () =>
      new Map([
        ...pack.groups.map((g) => [g.id, g.color] as const),
        ...pack.tileTypes.map((t) => [`type:${t.id}`, t.color] as const),
      ]),
    [pack],
  );

  const playersAt = (index: number) =>
    state.players.filter((p) => !p.bankrupt && (positions?.[p.id] ?? p.position) === index);
  const current = state.players[state.currentPlayer];
  const labels = useMemo(() => tokenLabels(state.players), [state.players]);
  const theme = pack.theme;

  return (
    <svg
      className={`board font-${theme?.font ?? 'system'}`}
      style={themeStyle(theme)}
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
      role="img"
      aria-label={pack.meta.name}
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
        <pattern
          id="blocked"
          width="12"
          height="12"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(-45)"
        >
          <rect width="6" height="12" className="blocked-stripe" />
        </pattern>
      </defs>
      <rect
        className="board-bg"
        x={0}
        y={0}
        width={geometry.width}
        height={geometry.height}
        rx={22}
      />
      <BoardCenter state={state} events={events} rect={geometry.center} current={current} />
      {geometry.tiles.map((rect) => {
        const tile = pack.tiles[rect.index]!;
        const color =
          'group' in tile
            ? colors.get(tile.group)
            : tile.type === 'custom'
              ? colors.get(`type:${tile.tileType}`)
              : undefined;
        return (
          <TileView
            key={tile.id}
            rect={rect}
            tile={tile}
            state={state}
            color={color}
            players={playersAt(rect.index)}
            labels={labels}
            tokens={theme?.tokens ?? 'initials'}
            selected={selectedTileId === tile.id}
            onSelect={() => onSelectTile(tile.id)}
          />
        );
      })}
    </svg>
  );
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Farbstreifen innen, Besitzerband außen; Kacheln (Ring, Pfad) haben den Streifen oben. */
function tileParts(rect: TileRect, hasStripe: boolean) {
  const { x, y, w, h } = rect;
  const side: Side = rect.side;
  const stripe: Record<Side, Box> = {
    bottom: { x, y, w, h: STRIPE },
    top: { x, y: y + h - STRIPE, w, h: STRIPE },
    left: { x: x + w - STRIPE, y, w: STRIPE, h },
    right: { x, y, w: STRIPE, h },
    none: { x, y, w, h: STRIPE * 0.8 },
  };
  const band: Record<Side, Box> = {
    bottom: { x, y: y + h - OWNER_BAND, w, h: OWNER_BAND },
    top: { x, y, w, h: OWNER_BAND },
    left: { x, y, w: OWNER_BAND, h },
    right: { x: x + w - OWNER_BAND, y, w: OWNER_BAND, h },
    none: { x, y: y + h - OWNER_BAND, w, h: OWNER_BAND },
  };
  const content: Record<Side, Box> = {
    bottom: { x, y: y + STRIPE, w, h: h - STRIPE - OWNER_BAND },
    top: { x, y: y + OWNER_BAND, w, h: h - STRIPE - OWNER_BAND },
    left: { x: x + OWNER_BAND, y, w: w - STRIPE - OWNER_BAND, h },
    right: { x: x + STRIPE, y, w: w - STRIPE - OWNER_BAND, h },
    none: { x, y: y + STRIPE * 0.8, w, h: h - STRIPE * 0.8 - OWNER_BAND },
  };
  const inset = (b: Box): Box => ({
    x: b.x + INSET,
    y: b.y + INSET,
    w: Math.max(0, b.w - 2 * INSET),
    h: Math.max(0, b.h - 2 * INSET),
  });
  return {
    stripe: inset(stripe[side]),
    band: inset(band[side]),
    content: hasStripe ? content[side] : { x, y, w, h },
  };
}

interface TileViewProps {
  rect: TileRect;
  tile: Tile;
  state: GameState;
  color: string | undefined;
  players: Player[];
  labels: Map<string, string>;
  tokens: Theme['tokens'];
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
  tokens,
  selected,
  onSelect,
}: TileViewProps) {
  const { t } = useTranslation();
  const ts = isOwnable(tile) ? state.tiles[tile.id] : undefined;
  const owner = ts?.owner ? state.players.find((p) => p.id === ts.owner) : undefined;
  const { x, y, w, h } = rect;
  const horizontal = rect.side === 'bottom' || rect.side === 'top' || rect.side === 'none';
  const hasStripe = color !== undefined && !rect.corner;
  const { stripe, band, content } = tileParts(rect, hasStripe);
  const blocked = (state.blockedTiles?.[tile.id] ?? 0) > 0;

  const subtitle =
    'price' in tile
      ? formatMoney(t, tile.price)
      : tile.type === 'tax'
        ? formatMoney(t, tile.amount)
        : tile.type === 'custom'
          ? (state.pack.tileTypes.find((x) => x.id === tile.tileType)?.name ?? null)
          : null;
  const deck = tile.type === 'card' ? state.pack.decks.find((d) => d.id === tile.deck) : undefined;
  const corner = rect.corner || rect.side === 'none';

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
      <rect
        className="tile-bg"
        x={x + GAP}
        y={y + GAP}
        width={w - 2 * GAP}
        height={h - 2 * GAP}
        rx={8}
      />
      {hasStripe && (
        <rect
          className="tile-stripe"
          x={stripe.x}
          y={stripe.y}
          width={stripe.w}
          height={stripe.h}
          rx={5}
          fill={color}
        />
      )}
      {hasStripe && ts && ts.buildings > 0 && (
        <Buildings stripe={stripe} horizontal={horizontal} count={ts.buildings} />
      )}
      {owner && (
        <rect
          className="owner-band"
          x={band.x}
          y={band.y}
          width={band.w}
          height={band.h}
          rx={2.5}
          fill={owner.color}
        />
      )}
      {tile.image && (
        <image
          href={tile.image}
          x={content.x + 4}
          y={content.y + 2}
          width={content.w - 8}
          height={content.h * 0.45}
          preserveAspectRatio="xMidYMid meet"
        />
      )}
      <foreignObject
        x={content.x}
        y={tile.image ? content.y + content.h * 0.45 : content.y}
        width={content.w}
        height={tile.image ? content.h * 0.55 : content.h}
      >
        <div className={`tile-label${corner && !tile.image ? ' corner' : ''}`} lang="de">
          {deck && !tile.image && (
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
      {blocked && (
        <rect className="blocked" x={x} y={y} width={w} height={h} fill="url(#blocked)">
          <title>{t('tile.blocked')}</title>
        </rect>
      )}
      <Tokens players={players} labels={labels} area={content} style={tokens} />
      <rect
        className="tile-outline"
        x={x + GAP}
        y={y + GAP}
        width={w - 2 * GAP}
        height={h - 2 * GAP}
        rx={8}
      />
    </g>
  );
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
  style,
}: {
  players: Player[];
  labels: Map<string, string>;
  area: Box;
  style: Theme['tokens'];
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
        const label = labels.get(p.id) ?? '?';
        return (
          <g key={p.id} className={`token${p.inJail ? ' jailed' : ''}`}>
            <title>{p.name}</title>
            {style === 'pawns' ? (
              <g className="pawn" fill={p.color}>
                <circle cx={cx} cy={cy - TOKEN_R + 4.5} r={4.8} />
                <path d={`M ${cx - 8} ${cy + TOKEN_R - 1} q 0 -11 8 -13 q 8 2 8 13 z`} />
              </g>
            ) : (
              <circle cx={cx} cy={cy} r={TOKEN_R} fill={p.color} />
            )}
            {style === 'initials' && (
              <text
                x={cx}
                y={cy}
                dy="0.35em"
                textAnchor="middle"
                className={label.length > 1 ? 'narrow' : ''}
              >
                {label}
              </text>
            )}
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
  const image = state.pack.theme?.centerImage;
  // Neuer Schlüssel bei jedem Wurf, damit die Würfel-Animation erneut läuft.
  let rollKey = events.length - 1;
  while (rollKey >= 0 && events[rollKey]!.type !== 'diceRolled') rollKey--;

  return (
    <foreignObject x={rect.x} y={rect.y} width={rect.w} height={rect.h}>
      <div className="board-center">
        {image ? (
          <img className="center-image" src={image} alt="" />
        ) : (
          <div className="center-title">Menelgame</div>
        )}
        <div className="center-pack">{state.pack.meta.name}</div>
        {current && state.phase.name !== 'gameOver' && (
          <div className="center-turn">
            <span className="dot" style={{ background: current.color }} />
            {current.name} · {t('turn.round', { round: state.round })}
          </div>
        )}
        {state.lastRoll && (
          <div key={rollKey} className="center-dice" aria-label={state.lastRoll.dice.join(' + ')}>
            {state.lastRoll.dice.map((d, i) => (
              <Die
                key={i}
                value={d}
                sides={state.dice.sides}
                size={58}
                double={state.lastRoll!.isDouble}
              />
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
          {state.pack.variables
            .filter((v) => v.scope === 'game')
            .map((v) => (
              <span key={v.id}>
                {v.name}: {state.variables.game[v.id] ?? v.initial}
              </span>
            ))}
        </div>
      </div>
    </foreignObject>
  );
}
