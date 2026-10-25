import { HOTEL, type GameEvent, type GameState, type Player } from '@menelgame/engine';
import { isOwnable, type Theme, type Tile } from '@menelgame/schema';
import { useMemo, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Die } from '../components/Die';
import { Icon, Logo, type IconName } from '../components/Icon';
import { formatMoney } from '../game/format';
import { boardGeometry, type Side, type TileRect } from './geometry';

const STRIPE = 20;
const OWNER_BAND = 6;
/** Platz, den das Besitzerband samt Abstand am Rand belegt. */
const BAND_SPACE = OWNER_BAND + 3.5;
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
  // Feld, auf dem der Spieler am Zug gerade steht (mit Animation: wo seine Figur gerade ist).
  const active = state.phase.name !== 'gameOver' && current && !current.bankrupt ? current : null;
  const hereIndex = active ? (positions?.[active.id] ?? active.position) : -1;
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
        <pattern id="board-dots" width="14" height="14" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="3" r="1.3" className="board-dot" />
          <circle cx="10" cy="10" r="1.3" className="board-dot" />
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
      <rect
        className="board-pattern"
        x={0}
        y={0}
        width={geometry.width}
        height={geometry.height}
        rx={22}
        fill="url(#board-dots)"
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
            here={rect.index === hereIndex ? (active?.color ?? null) : null}
            currentId={active?.id ?? null}
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
  // Besitzerband am äußeren Rand, mit etwas Abstand zur Feldkante.
  const e = INSET;
  const band: Record<Side, Box> = {
    bottom: { x: x + e, y: y + h - OWNER_BAND - e, w: w - 2 * e, h: OWNER_BAND },
    top: { x: x + e, y: y + e, w: w - 2 * e, h: OWNER_BAND },
    left: { x: x + e, y: y + e, w: OWNER_BAND, h: h - 2 * e },
    right: { x: x + w - OWNER_BAND - e, y: y + e, w: OWNER_BAND, h: h - 2 * e },
    none: { x: x + e, y: y + h - OWNER_BAND - e, w: w - 2 * e, h: OWNER_BAND },
  };
  const content: Record<Side, Box> = {
    bottom: { x, y: y + STRIPE, w, h: h - STRIPE - BAND_SPACE },
    top: { x, y: y + BAND_SPACE, w, h: h - STRIPE - BAND_SPACE },
    left: { x: x + BAND_SPACE, y, w: w - STRIPE - BAND_SPACE, h },
    right: { x: x + STRIPE, y, w: w - STRIPE - BAND_SPACE, h },
    none: { x, y: y + STRIPE * 0.8, w, h: h - STRIPE * 0.8 - BAND_SPACE },
  };
  const inset = (b: Box): Box => ({
    x: b.x + INSET,
    y: b.y + INSET,
    w: Math.max(0, b.w - 2 * INSET),
    h: Math.max(0, b.h - 2 * INSET),
  });
  return {
    stripe: inset(stripe[side]),
    band: band[side],
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
  /** Farbe des Spielers am Zug, wenn er auf diesem Feld steht. */
  here: string | null;
  currentId: string | null;
  onSelect: () => void;
}

/** Symbol je Feldtyp; Grundstücke haben stattdessen den Farbstreifen. */
const TILE_ICONS: Partial<Record<Tile['type'], IconName>> = {
  station: 'train',
  utility: 'bolt',
  tax: 'coins',
  jail: 'bars',
  freeParking: 'coffee',
  goToJail: 'siren',
  start: 'arrowLeft',
  custom: 'sparkles',
};

/** Typname unter eigenen Feldern – nur, wenn er nicht schon im Feldnamen steckt. */
function customSubtitle(name: string, typeName: string | undefined): string | null {
  if (!typeName || name.toLowerCase().includes(typeName.toLowerCase())) return null;
  return typeName;
}

/** Leichte Tönung der Feldfläche in der Gruppen-, Typ- oder Stapelfarbe. */
function tint(color: string | undefined, percent: number): CSSProperties | undefined {
  return color ? { fill: `color-mix(in srgb, ${color} ${percent}%, var(--tile-bg))` } : undefined;
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
  here,
  currentId,
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
          ? customSubtitle(
              tile.name,
              state.pack.tileTypes.find((x) => x.id === tile.tileType)?.name,
            )
          : null;
  const deck = tile.type === 'card' ? state.pack.decks.find((d) => d.id === tile.deck) : undefined;
  const corner = rect.corner || rect.side === 'none';
  const icon = TILE_ICONS[tile.type];
  const fill = deck ? tint(deck.color, 12) : tint(color, tile.type === 'custom' ? 18 : 15);

  return (
    <g
      className={`tile tile-${tile.type}${rect.corner ? ' corner' : ''}${selected ? ' selected' : ''}`}
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
        style={fill}
      />
      {hasStripe && (
        <>
          <rect
            className="tile-stripe"
            x={stripe.x}
            y={stripe.y}
            width={stripe.w}
            height={stripe.h}
            rx={5}
            fill={color}
          />
          <rect
            className="stripe-gloss"
            x={stripe.x + 2}
            y={stripe.y + 1.5}
            width={horizontal ? stripe.w - 4 : stripe.w * 0.4}
            height={horizontal ? stripe.h * 0.4 : stripe.h - 3}
            rx={3}
          />
        </>
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
            <span className="tile-minicard" style={{ background: deck.color }} aria-hidden="true">
              ?
            </span>
          )}
          {icon && !tile.image && (
            <span
              className={`tile-icon${corner ? ' big' : ''}`}
              style={tile.type === 'custom' && color ? { color } : undefined}
            >
              <Icon name={icon} size={corner ? 30 : 17} />
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
      <Tokens
        players={players}
        labels={labels}
        area={content}
        style={tokens}
        currentId={currentId}
      />
      {here && (
        <rect
          className="tile-here"
          x={x + GAP}
          y={y + GAP}
          width={w - 2 * GAP}
          height={h - 2 * GAP}
          rx={8}
          stroke={here}
        />
      )}
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
    // Breites Hotel auf waagrechten Streifen, hohes auf senkrechten.
    const hw = horizontal ? 28 : 17;
    const hh = horizontal ? 16 : 26;
    const roof = horizontal ? 6 : 7;
    const hx = stripe.x + (stripe.w - hw) / 2;
    const hy = stripe.y + (stripe.h - hh) / 2;
    return (
      <g className="hotel-group">
        <path
          className="hotel"
          d={`M ${hx} ${hy + roof} L ${hx + hw / 2} ${hy} L ${hx + hw} ${hy + roof} V ${hy + hh} H ${hx} Z`}
        />
        <rect
          className="hotel-door"
          x={hx + hw / 2 - 2.5}
          y={hy + hh - 6}
          width={5}
          height={6}
          rx={1}
        />
      </g>
    );
  }
  const size = 13;
  const gap = 1.5;
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
        return (
          <path
            key={i}
            className="house"
            d={`M ${hx} ${hy + size * 0.45} L ${hx + size / 2} ${hy} L ${hx + size} ${hy + size * 0.45} V ${hy + size} H ${hx} Z`}
          />
        );
      })}
    </>
  );
}

function Tokens({
  players,
  labels,
  area,
  style,
  currentId,
}: {
  players: Player[];
  labels: Map<string, string>;
  area: Box;
  style: Theme['tokens'];
  currentId: string | null;
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
          <g
            key={p.id}
            className={`token${p.inJail ? ' jailed' : ''}${p.id === currentId ? ' current' : ''}`}
          >
            <title>{p.name}</title>
            {p.id === currentId && (
              <circle className="token-halo" cx={cx} cy={cy} r={TOKEN_R + 3} fill={p.color} />
            )}
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
          <div className="center-brand">
            <Logo className="center-logo" />
            <div className="center-title">Menelgame</div>
          </div>
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
