/** Illustration für die Startseite: eine Brettecke mit Häusern, Figuren und zwei Würfeln. */
export function HeroArt() {
  const tiles = [
    { x: 40, color: '#ff6b5b' },
    { x: 104, color: '#ff6b5b' },
    { x: 168, color: '#4aa3ff' },
    { x: 232, color: '#ffc83d' },
  ];
  return (
    <svg className="hero-art" viewBox="0 0 360 300" role="img" aria-hidden="true">
      <defs>
        <filter id="hero-shadow" x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="6" stdDeviation="7" floodColor="#2b2238" floodOpacity="0.16" />
        </filter>
      </defs>
      {/* Brett */}
      <g filter="url(#hero-shadow)">
        <rect x="20" y="40" width="320" height="230" rx="26" fill="#c9ecd7" />
      </g>
      <rect x="36" y="56" width="288" height="198" rx="18" fill="#e7f7ed" />
      {tiles.map((t, i) => (
        <g key={i}>
          <rect
            x={t.x}
            y={188}
            width="56"
            height="58"
            rx="8"
            fill="#fffdf8"
            stroke="#e6d7c1"
            strokeWidth="2"
          />
          <rect x={t.x} y={188} width="56" height="14" rx="6" fill={t.color} />
        </g>
      ))}
      <rect
        x="296"
        y="188"
        width="36"
        height="58"
        rx="8"
        fill="#fffdf8"
        stroke="#e6d7c1"
        strokeWidth="2"
      />
      {/* Häuser und Hotel */}
      <g stroke="#2b2238" strokeWidth="2" strokeLinejoin="round">
        <path d="M50 196 58 189 66 196v8H50z" fill="#22a663" />
        <path d="M70 196 78 189 86 196v8H70z" fill="#22a663" />
        <path d="M112 194 124 185 136 194v10h-24z" fill="#e2465c" />
      </g>
      {/* Würfel */}
      <g transform="rotate(-12 120 112)" filter="url(#hero-shadow)">
        <rect
          x="88"
          y="80"
          width="64"
          height="64"
          rx="15"
          fill="#ffffff"
          stroke="#2b2238"
          strokeWidth="3"
        />
        <circle cx="105" cy="97" r="5.5" fill="#2b2238" />
        <circle cx="120" cy="112" r="5.5" fill="#2b2238" />
        <circle cx="135" cy="127" r="5.5" fill="#2b2238" />
      </g>
      <g transform="rotate(14 204 100)" filter="url(#hero-shadow)">
        <rect
          x="174"
          y="70"
          width="60"
          height="60"
          rx="14"
          fill="#ffc83d"
          stroke="#2b2238"
          strokeWidth="3"
        />
        <circle cx="190" cy="86" r="5" fill="#2b2238" />
        <circle cx="218" cy="86" r="5" fill="#2b2238" />
        <circle cx="190" cy="114" r="5" fill="#2b2238" />
        <circle cx="218" cy="114" r="5" fill="#2b2238" />
      </g>
      {/* Figuren */}
      <g stroke="#2b2238" strokeWidth="2.5">
        <path d="M262 168c0-14 6-22 12-22s12 8 12 22z" fill="#9b6dff" />
        <circle cx="274" cy="138" r="9" fill="#9b6dff" />
        <path d="M290 172c0-12 5-19 10-19s10 7 10 19z" fill="#4aa3ff" />
        <circle cx="300" cy="146" r="7.5" fill="#4aa3ff" />
      </g>
      {/* Münzen */}
      <g stroke="#a8740a" strokeWidth="2.5">
        <ellipse cx="62" cy="150" rx="18" ry="7" fill="#ffc83d" />
        <path d="M44 150v8c0 4 8 7 18 7s18-3 18-7v-8" fill="#ffc83d" />
        <ellipse cx="62" cy="138" rx="18" ry="7" fill="#ffd96b" />
        <path d="M44 138v8c0 4 8 7 18 7s18-3 18-7v-8" fill="#ffd96b" />
      </g>
      {/* Funkeln */}
      <g fill="#ffc83d" stroke="#2b2238" strokeWidth="2" strokeLinejoin="round">
        <path d="M300 40l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" />
        <path d="M46 26l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" />
      </g>
    </svg>
  );
}
