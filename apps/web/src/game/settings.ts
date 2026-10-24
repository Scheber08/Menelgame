import { useCallback, useState } from 'react';

const KEY = 'menelgame.settings';

export interface Settings {
  sound: boolean;
  animations: boolean;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

function load(): Settings {
  const defaults: Settings = { sound: true, animations: !prefersReducedMotion() };
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...defaults, ...(JSON.parse(raw) as Partial<Settings>) } : defaults;
  } catch {
    return defaults;
  }
}

/** Ton und Animationen, pro Browser gemerkt. */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(load);
  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // Ohne Speicher gilt die Einstellung nur bis zum Neuladen.
      }
      return next;
    });
  }, []);
  return [settings, update] as const;
}
