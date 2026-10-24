import type { GameEvent, GameState } from '@menelgame/engine';
import { useEffect, useRef, useState } from 'react';

type Positions = Record<string, number>;

function positionsOf(state: GameState): Positions {
  return Object.fromEntries(state.players.map((p) => [p.id, p.position]));
}

/** Ist die letzte Bewegung des Spielers ein normaler Zug vorwärts (nicht Teleport/Gefängnis)? */
function walkedLast(events: readonly GameEvent[], playerId: string): boolean {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    if (e.type === 'moved' && e.playerId === playerId) return e.steps > 0;
    if ((e.type === 'teleported' || e.type === 'sentToJail') && e.playerId === playerId)
      return false;
  }
  return false;
}

/**
 * Angezeigte Positionen der Figuren: Bei einem normalen Zug laufen sie Feld für Feld zum
 * Ziel, Teleports und der Weg ins Gefängnis springen direkt. Lange Wege laufen schneller,
 * damit ein Zug nie länger als etwa eine Sekunde dauert.
 */
export function useTokenWalk(state: GameState, events: readonly GameEvent[], enabled: boolean) {
  const [shown, setShown] = useState<Positions>(() => positionsOf(state));
  const shownRef = useRef(shown);
  shownRef.current = shown;

  useEffect(() => {
    const target = positionsOf(state);
    const n = state.pack.tiles.length;
    const current = shownRef.current;
    const walking = Object.keys(target).filter((id) => {
      const from = current[id];
      if (from === undefined || from === target[id]) return false;
      return enabled && walkedLast(events, id);
    });
    // Alles, was nicht läuft, springt sofort.
    const jumped = { ...current, ...target };
    for (const id of walking) jumped[id] = current[id]!;
    setShown(jumped);
    if (walking.length === 0) return;

    const longest = Math.max(...walking.map((id) => (target[id]! - current[id]! + n) % n));
    const stepMs = Math.max(45, Math.min(160, 1000 / longest));
    const timer = window.setInterval(() => {
      setShown((prev) => {
        const next = { ...prev };
        let moving = false;
        for (const id of walking) {
          if (next[id] === target[id]) continue;
          next[id] = (next[id]! + 1) % n;
          moving = true;
        }
        if (!moving) window.clearInterval(timer);
        return moving ? next : prev;
      });
    }, stepMs);
    return () => window.clearInterval(timer);
  }, [state, events, enabled]);

  return shown;
}
