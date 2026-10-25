/** Augen-Positionen für 1–6 auf einem 3 × 3-Raster (0 = links/oben, 2 = rechts/unten). */
const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [
    [0, 0],
    [2, 2],
  ],
  3: [
    [0, 0],
    [1, 1],
    [2, 2],
  ],
  4: [
    [0, 0],
    [2, 0],
    [0, 2],
    [2, 2],
  ],
  5: [
    [0, 0],
    [2, 0],
    [1, 1],
    [0, 2],
    [2, 2],
  ],
  6: [
    [0, 0],
    [2, 0],
    [0, 1],
    [2, 1],
    [0, 2],
    [2, 2],
  ],
};

/** Ein Würfel mit Augen (bei sechs Seiten) oder Zahl; `double` hebt einen Pasch hervor. */
export function Die({
  value,
  sides = 6,
  size = 56,
  double = false,
}: {
  value: number;
  sides?: number;
  size?: number;
  double?: boolean;
}) {
  const pips = sides === 6 ? PIPS[value] : undefined;
  return (
    <svg
      className={`die${double ? ' double' : ''}`}
      width={size}
      height={size}
      viewBox="0 0 60 60"
      aria-label={String(value)}
      role="img"
    >
      <rect className="die-edge" x="3" y="6" width="54" height="52" rx="13" />
      <rect className="die-body" x="3" y="2" width="54" height="52" rx="13" />
      {pips ? (
        pips.map(([cx, cy], i) => (
          <circle key={i} className="die-pip" cx={15 + cx * 15} cy={13 + cy * 15} r={5} />
        ))
      ) : (
        <text className="die-text" x="30" y="29" dy="0.36em" textAnchor="middle">
          {value}
        </text>
      )}
    </svg>
  );
}
