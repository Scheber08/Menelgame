import type { CSSProperties, ReactNode } from 'react';

/** Kleine, selbst gezeichnete Linien-Icons (24 × 24), damit keine Icon-Bibliothek nötig ist. */
const ICONS = {
  dice: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="15.5" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  friends: (
    <>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3 19.5c.6-3.3 3-5.2 6-5.2s5.4 1.9 6 5.2" />
      <circle cx="17" cy="9.5" r="2.5" />
      <path d="M16.2 14.4c2.6-.3 4.4 1.3 4.9 4.1" />
    </>
  ),
  door: (
    <>
      <path d="M13 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5" />
      <path d="M3.5 12h11" />
      <path d="M11 8l4 4-4 4" />
    </>
  ),
  couch: (
    <>
      <path d="M5 11V8.5A2.5 2.5 0 0 1 7.5 6h9A2.5 2.5 0 0 1 19 8.5V11" />
      <path d="M3 13a2 2 0 0 1 4 0v1.5h10V13a2 2 0 0 1 4 0v4a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17z" />
      <path d="M6 18.5V20M18 18.5V20" />
    </>
  ),
  house: (
    <>
      <path d="M4 11.5 12 5l8 6.5" />
      <path d="M6.5 10v9.5h11V10" />
      <path d="M10.5 19.5v-5h3v5" />
    </>
  ),
  coins: (
    <>
      <ellipse cx="9" cy="7" rx="5.5" ry="2.5" />
      <path d="M3.5 7v4c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5V7" />
      <path d="M9.5 16.5c.7 1.2 2.7 2 5 2 3 0 5.5-1.1 5.5-2.5v-4c0-1.2-1.7-2.2-4-2.4" />
    </>
  ),
  trade: (
    <>
      <path d="M4 8h13l-3.5-3.5" />
      <path d="M20 16H7l3.5 3.5" />
    </>
  ),
  gavel: (
    <>
      <path d="m13.5 4.5 6 6" />
      <path d="m10.5 7.5 6 6" />
      <path d="m12 6 4.5 4.5" />
      <path d="m11.5 11.5-7 7" />
      <path d="M13 21h7" />
    </>
  ),
  trophy: (
    <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0z" />
      <path d="M8 6H5a2.5 2.5 0 0 0 3 3.5M16 6h3a2.5 2.5 0 0 1-3 3.5" />
      <path d="M12 13v3.5M8.5 20h7M9.5 20c0-2 1-3.5 2.5-3.5s2.5 1.5 2.5 3.5" />
    </>
  ),
  star: <path d="m12 3.8 2.5 5.2 5.6.7-4.1 3.9 1 5.6-5-2.7-5 2.7 1-5.6-4.1-3.9 5.6-.7z" />,
  chart: (
    <>
      <path d="M4 20h16" />
      <rect x="6" y="11" width="3" height="6" rx="1" />
      <rect x="10.5" y="7" width="3" height="10" rx="1" />
      <rect x="15" y="13" width="3" height="4" rx="1" />
    </>
  ),
  layers: (
    <>
      <path d="m12 4 8.5 4.5L12 13 3.5 8.5z" />
      <path d="m3.5 12.5 8.5 4.5 8.5-4.5" />
      <path d="m3.5 16.5 8.5 4.5 8.5-4.5" />
    </>
  ),
  players: (
    <>
      <circle cx="12" cy="7.5" r="3" />
      <path d="M8.5 20c-.4-4.5 1.3-7 3.5-7s3.9 2.5 3.5 7z" />
    </>
  ),
  list: (
    <>
      <path d="M9 6.5h11M9 12h11M9 17.5h11" />
      <circle cx="4.8" cy="6.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="4.8" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="4.8" cy="17.5" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5" />
      <circle cx="12" cy="7.8" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  bot: (
    <>
      <rect x="4.5" y="8" width="15" height="11" rx="3.5" />
      <path d="M12 8V5" />
      <circle cx="12" cy="4" r="1.2" />
      <circle cx="9.5" cy="13" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="13" r="1.2" fill="currentColor" stroke="none" />
      <path d="M10 16.2h4" />
    </>
  ),
  play: <path d="M8 5.5v13l10.5-6.5z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  sparkles: (
    <>
      <path d="M12 3.5 13.6 9l5.4 1.5-5.4 1.6L12 17.5l-1.6-5.4L5 10.5 10.4 9z" />
      <path d="M18.5 16v4M16.5 18h4" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size = 20,
  className,
  style,
}: {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      className={`icon${className ? ` ${className}` : ''}`}
      style={style}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  );
}

/** Logo: ein Würfel, aus dem ein kleines Haus wächst. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <rect x="4" y="9" width="36" height="36" rx="10" fill="#138556" />
      <rect x="4" y="5" width="36" height="36" rx="10" fill="#1fa971" />
      <circle cx="14" cy="15" r="3.2" fill="#fff" />
      <circle cx="30" cy="31" r="3.2" fill="#fff" />
      <path d="M33 4.5 41.5 11v9.5h-17V11z" fill="#ffc83d" stroke="#2b2238" strokeWidth="2.2" />
      <path d="M31 20.5v-5h4v5" fill="#ff6b5b" stroke="#2b2238" strokeWidth="2" />
    </svg>
  );
}
