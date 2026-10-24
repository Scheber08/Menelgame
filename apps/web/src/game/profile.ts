import { PLAYER_COLORS } from '../components/ColorPicker';

/** Name und Farbe merkt sich der Browser für das nächste Mal. */
export interface Profile {
  name: string;
  color: string;
}

const PROFILE_KEY = 'menelgame.profile';
const PENDING_KEY = 'menelgame.pendingJoin';

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) return JSON.parse(raw) as Profile;
  } catch {
    // Kein Speicher: Standardwerte.
  }
  return { name: '', color: PLAYER_COLORS[0]! };
}

export function saveProfile(profile: Profile): void {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...profile, name: profile.name.trim() }));
  } catch {
    // Nur Komfort.
  }
}

/** Wer einen Raum anlegt, setzt sich nach dem Verbinden automatisch auf einen Platz. */
export function savePendingJoin(code: string, profile: Profile): void {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({ code, ...profile }));
  } catch {
    // Dann muss man den Namen in der Lobby erneut eingeben.
  }
}

export function takePendingJoin(code: string): Profile | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const pending = JSON.parse(raw) as Profile & { code: string };
    if (pending.code !== code) return null;
    sessionStorage.removeItem(PENDING_KEY);
    return { name: pending.name, color: pending.color };
  } catch {
    return null;
  }
}
