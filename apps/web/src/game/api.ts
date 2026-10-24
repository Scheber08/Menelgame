import {
  parseRecoveryCode,
  recoveryCode,
  type ApiErrorResponse,
  type ClaimResponse,
  type PackResponse,
  type PackSummary,
  type ProfileCredentials,
  type ProfileStatsResponse,
  type RuleSet,
  type RuleSetInput,
} from '@menelgame/protocol';
import type { BoardPack } from '@menelgame/schema';
import { useCallback, useEffect, useState } from 'react';

const CREDENTIALS_KEY = 'menelgame.credentials';

export class ApiFailure extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiErrorResponse | null,
  ) {
    super(body?.error ?? `HTTP ${status}`);
  }
}

export function loadCredentials(): ProfileCredentials | null {
  try {
    const raw = localStorage.getItem(CREDENTIALS_KEY);
    return raw ? (JSON.parse(raw) as ProfileCredentials) : null;
  } catch {
    return null;
  }
}

function storeCredentials(credentials: ProfileCredentials | null): void {
  try {
    if (credentials) localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(credentials));
    else localStorage.removeItem(CREDENTIALS_KEY);
  } catch {
    // Ohne Speicher gibt es kein dauerhaftes Profil.
  }
  window.dispatchEvent(new Event('menelgame:profile'));
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  const credentials = loadCredentials();
  if (options.auth !== false && credentials)
    headers.Authorization = `Bearer ${credentials.id}:${credentials.secret}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(path, {
    method: options.method ?? 'GET',
    headers,
    ...(options.body !== undefined && { body: JSON.stringify(options.body) }),
  });
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) throw new ApiFailure(response.status, body as ApiErrorResponse | null);
  return body as T;
}

let creating: Promise<ProfileCredentials> | null = null;

/**
 * Legt bei Bedarf ein Profil an. Ein Profil ist nur eine ID mit Geheimnis – kein Account.
 * Gleichzeitige Aufrufe teilen sich eine Anfrage, sonst entstünden zwei Profile.
 */
export async function ensureProfile(): Promise<ProfileCredentials> {
  const existing = loadCredentials();
  if (existing) return existing;
  creating ??= request<ProfileCredentials>('/api/profile', { method: 'POST', auth: false })
    .then((created) => {
      storeCredentials(created);
      return created;
    })
    .finally(() => {
      creating = null;
    });
  return creating;
}

/** Profil von einem anderen Gerät übernehmen. */
export async function restoreProfile(code: string): Promise<boolean> {
  const credentials = parseRecoveryCode(code);
  if (!credentials) return false;
  const response = await fetch('/api/profile', {
    headers: { Authorization: `Bearer ${credentials.id}:${credentials.secret}` },
  });
  if (!response.ok) return false;
  storeCredentials(credentials);
  return true;
}

export function forgetProfile(): void {
  storeCredentials(null);
}

/** Aktuelles Profil, aktualisiert sich bei Änderungen. */
export function useProfile() {
  const [credentials, setCredentials] = useState(loadCredentials);
  useEffect(() => {
    const update = () => setCredentials(loadCredentials());
    window.addEventListener('menelgame:profile', update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener('menelgame:profile', update);
      window.removeEventListener('storage', update);
    };
  }, []);
  return { credentials, code: credentials ? recoveryCode(credentials) : null };
}

export const api = {
  listPacks: () => request<PackSummary[]>('/api/packs'),
  getPack: (id: string, key?: string | null) =>
    request<PackResponse>(`/api/packs/${id}${key ? `?k=${encodeURIComponent(key)}` : ''}`),
  createPack: async (pack: unknown) => {
    await ensureProfile();
    return request<PackResponse>('/api/packs', { method: 'POST', body: pack });
  },
  updatePack: (id: string, pack: BoardPack) =>
    request<PackResponse>(`/api/packs/${id}`, { method: 'PUT', body: pack }),
  deletePack: (id: string) => request<unknown>(`/api/packs/${id}`, { method: 'DELETE' }),
  renewShareKey: (id: string) =>
    request<{ shareKey: string }>(`/api/packs/${id}/share`, { method: 'POST' }),
  copyPack: async (id: string, key: string) => {
    await ensureProfile();
    return request<PackResponse>(`/api/packs/${id}/copy?k=${encodeURIComponent(key)}`, {
      method: 'POST',
    });
  },
  listRuleSets: () => request<RuleSet[]>('/api/rulesets'),
  saveRuleSet: async (input: RuleSetInput) => {
    await ensureProfile();
    return request<RuleSet>('/api/rulesets', { method: 'POST', body: input });
  },
  deleteRuleSet: (id: string) => request<unknown>(`/api/rulesets/${id}`, { method: 'DELETE' }),
  /** Ergebnis eines beendeten Online-Spiels in die eigene Statistik übernehmen. */
  claimStats: async (code: string, token: string) => {
    await ensureProfile();
    return request<ClaimResponse>('/api/stats/claim', { method: 'POST', body: { code, token } });
  },
  stats: () => request<ProfileStatsResponse>('/api/stats'),
  /** Bild hochladen (PNG, JPEG, WebP, GIF bis 1 MB); liefert die URL unter /img/…. */
  uploadImage: async (file: File) => {
    const credentials = await ensureProfile();
    const response = await fetch('/api/images', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credentials.id}:${credentials.secret}`,
        'Content-Type': file.type,
      },
      body: file,
    });
    const body = (await response.json().catch(() => null)) as { url?: string } | null;
    if (!response.ok || !body?.url) throw new ApiFailure(response.status, null);
    return body.url;
  },
};

export function shareLink(id: string, key: string): string {
  return `${location.origin}/pack/${id}?k=${key}`;
}

/** Lädt eine Liste, sobald ein Profil existiert; `reload` holt sie neu. */
export function useMyList<T>(load: () => Promise<T[]>) {
  const { credentials } = useProfile();
  const [items, setItems] = useState<T[]>([]);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    if (!credentials) {
      setItems([]);
      return;
    }
    load()
      .then((list) => {
        setItems(list);
        setError(null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [credentials, load]);
  useEffect(reload, [reload]);
  return { items, error, reload, hasProfile: credentials !== null };
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Pack, das eine Raumseite nach dem Anlegen automatisch einstellt („Damit hosten“). */
const PENDING_PACK_KEY = 'menelgame.pendingPack';

export function savePendingPack(code: string, pack: BoardPack): void {
  try {
    sessionStorage.setItem(PENDING_PACK_KEY, JSON.stringify({ code, pack }));
  } catch {
    // Dann wählt der Host das Pack in der Lobby selbst.
  }
}

export function takePendingPack(code: string): BoardPack | null {
  try {
    const raw = sessionStorage.getItem(PENDING_PACK_KEY);
    if (!raw) return null;
    const pending = JSON.parse(raw) as { code: string; pack: BoardPack };
    if (pending.code !== code) return null;
    sessionStorage.removeItem(PENDING_PACK_KEY);
    return pending.pack;
  } catch {
    return null;
  }
}
