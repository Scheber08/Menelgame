/** Runder Spieler-Kopf in der Spielerfarbe mit Anfangsbuchstaben. */
export function Avatar({
  name,
  color,
  size = 'normal',
}: {
  name: string;
  color: string;
  size?: 'small' | 'normal' | 'large';
}) {
  const initial = name.trim().slice(0, 1).toUpperCase() || '?';
  return (
    <span className={`avatar avatar-${size}`} style={{ background: color }} aria-hidden="true">
      {initial}
    </span>
  );
}
