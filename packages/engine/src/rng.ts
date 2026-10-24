/**
 * Gesetzter Zufallsgenerator (mulberry32). Der Zustand ist eine einzelne uint32-Zahl und
 * Teil des Spielzustands, damit Replays exakt dieselben Würfe ergeben.
 */
export interface RngState {
  state: number;
}

export function createRng(seed: number): RngState {
  return { state: seed >>> 0 };
}

/** Liefert eine Zahl in [0, 1) und schreibt den neuen Zustand in `rng`. */
export function nextFloat(rng: RngState): number {
  rng.state = (rng.state + 0x6d2b79f5) >>> 0;
  let t = rng.state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Ganze Zahl in [0, maxExclusive). */
export function nextInt(rng: RngState, maxExclusive: number): number {
  return Math.floor(nextFloat(rng) * maxExclusive);
}

/** Fisher-Yates; gibt eine neue, gemischte Liste zurück. */
export function shuffle<T>(rng: RngState, items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = nextInt(rng, i + 1);
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}
