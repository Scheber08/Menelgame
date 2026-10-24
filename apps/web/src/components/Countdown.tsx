import { useEffect, useState } from 'react';

interface CountdownProps {
  /** Zeitpunkt in ms nach der lokalen Uhr. */
  at: number;
  className?: string;
}

/** Restzeit in Sekunden, aktualisiert sich selbst. */
export function Countdown({ at, className }: CountdownProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);
  const seconds = Math.max(0, Math.ceil((at - now) / 1000));
  return (
    <span
      className={`countdown${seconds <= 5 ? ' urgent' : ''} ${className ?? ''}`}
      aria-live="off"
    >
      {seconds}s
    </span>
  );
}
