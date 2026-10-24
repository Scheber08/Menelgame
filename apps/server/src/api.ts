import {
  MAX_PACK_BYTES,
  MAX_PACKS_PER_PROFILE,
  MAX_RULESETS_PER_PROFILE,
  RuleSetInputSchema,
  type ApiError,
  type PackResponse,
  type PackSummary,
  type ProfileCredentials,
  type RuleSet,
} from '@menelgame/protocol';
import { parseBoardPack } from '@menelgame/schema';

/** Die Teile von D1, die die API braucht – in Tests ersetzt durch node:sqlite. */
export interface SqlStatement {
  bind(...values: unknown[]): SqlStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}

export interface SqlDatabase {
  prepare(query: string): SqlStatement;
}

export interface ApiDeps {
  db: SqlDatabase;
  now(): number;
}

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((b) => ID_ALPHABET[b % ID_ALPHABET.length]).join('');
}

export function randomSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const json = (body: unknown, status = 200) => Response.json(body, { status });
const fail = (error: ApiError, status: number, extra: object = {}) =>
  json({ error, ...extra }, status);

/** Profil aus dem Authorization-Header; null, wenn es fehlt oder nicht stimmt. */
async function authenticate(request: Request, deps: ApiDeps): Promise<string | null> {
  const header = request.headers.get('Authorization') ?? '';
  const match = header.match(/^Bearer ([a-z0-9]{16}):([a-f0-9]{64})$/);
  if (!match) return null;
  const row = await deps.db
    .prepare('SELECT secret_hash FROM profiles WHERE id = ?')
    .bind(match[1])
    .first<{ secret_hash: string }>();
  if (!row || row.secret_hash !== (await sha256(match[2]!))) return null;
  return match[1]!;
}

async function readJson(
  request: Request,
): Promise<{ ok: true; body: unknown } | { ok: false; error: Response }> {
  const text = await request.text();
  if (text.length > MAX_PACK_BYTES) return { ok: false, error: fail('tooLarge', 413) };
  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, error: fail('badRequest', 400) };
  }
}

interface PackRow {
  id: string;
  owner_id: string;
  name: string;
  version: string;
  json: string;
  share_key: string;
  updated_at: number;
}

function packResponse(row: PackRow, mine: boolean): PackResponse {
  return {
    id: row.id,
    pack: JSON.parse(row.json),
    mine,
    shareKey: mine ? row.share_key : null,
    updatedAt: row.updated_at,
  };
}

/**
 * Beantwortet /api/profile, /api/packs und /api/rulesets. Liefert null für andere Pfade.
 * Packs sind privat: Es gibt keinen Endpunkt, der fremde Packs auflistet; lesen darf nur
 * der Besitzer oder, wer den Teilen-Schlüssel kennt.
 */
export async function handleApi(request: Request, deps: ApiDeps): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // ---- Profil ----------------------------------------------------------------------------
  if (path === '/api/profile') {
    if (method === 'POST') {
      const credentials: ProfileCredentials = { id: randomId(), secret: randomSecret() };
      await deps.db
        .prepare('INSERT INTO profiles (id, secret_hash, created_at) VALUES (?, ?, ?)')
        .bind(credentials.id, await sha256(credentials.secret), deps.now())
        .run();
      return json(credentials, 201);
    }
    if (method === 'GET') {
      const me = await authenticate(request, deps);
      return me ? json({ id: me }) : fail('unauthorized', 401);
    }
    return fail('badRequest', 405);
  }

  // ---- Packs -----------------------------------------------------------------------------
  if (path === '/api/packs') {
    const me = await authenticate(request, deps);
    if (!me) return fail('unauthorized', 401);
    if (method === 'GET') {
      const { results } = await deps.db
        .prepare(
          'SELECT id, name, version, json, updated_at FROM packs WHERE owner_id = ? ORDER BY updated_at DESC',
        )
        .bind(me)
        .all<PackRow>();
      const list: PackSummary[] = results.map((r) => ({
        id: r.id,
        name: r.name,
        version: r.version,
        tiles: (JSON.parse(r.json) as { tiles: unknown[] }).tiles.length,
        updatedAt: r.updated_at,
      }));
      return json(list);
    }
    if (method === 'POST') {
      const count = await deps.db
        .prepare('SELECT COUNT(*) AS n FROM packs WHERE owner_id = ?')
        .bind(me)
        .first<{ n: number }>();
      if ((count?.n ?? 0) >= MAX_PACKS_PER_PROFILE) return fail('tooMany', 409);
      const body = await readJson(request);
      if (!body.ok) return body.error;
      const parsed = parseBoardPack(body.body);
      if (!parsed.ok) return fail('invalidPack', 422, { issues: parsed.issues });
      const id = randomId();
      const now = deps.now();
      const row: PackRow = {
        id,
        owner_id: me,
        name: parsed.pack.meta.name,
        version: parsed.pack.meta.version,
        json: JSON.stringify(parsed.pack),
        share_key: randomSecret(),
        updated_at: now,
      };
      await deps.db
        .prepare(
          'INSERT INTO packs (id, owner_id, name, version, schema_version, json, share_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .bind(
          id,
          me,
          row.name,
          row.version,
          parsed.pack.schemaVersion,
          row.json,
          row.share_key,
          now,
          now,
        )
        .run();
      return json(packResponse(row, true), 201);
    }
    return fail('badRequest', 405);
  }

  const packMatch = path.match(/^\/api\/packs\/([a-z0-9]{16})(\/share|\/copy)?$/);
  if (packMatch) {
    const [, id, action] = packMatch;
    const me = await authenticate(request, deps);
    const row = await deps.db.prepare('SELECT * FROM packs WHERE id = ?').bind(id).first<PackRow>();
    const key = url.searchParams.get('k');
    const mine = row !== null && me !== null && row.owner_id === me;
    const shared = row !== null && key !== null && key === row.share_key;
    // Ohne Recht sieht man nicht einmal, ob es das Pack gibt.
    if (!row || (!mine && !shared)) return fail('notFound', 404);

    if (action === '/share') {
      if (method !== 'POST' || !mine) return fail('notFound', 404);
      const shareKey = randomSecret();
      await deps.db.prepare('UPDATE packs SET share_key = ? WHERE id = ?').bind(shareKey, id).run();
      return json({ shareKey });
    }

    if (action === '/copy') {
      if (method !== 'POST') return fail('badRequest', 405);
      if (!me) return fail('unauthorized', 401);
      const copy = new Request(new URL('/api/packs', url), {
        method: 'POST',
        headers: request.headers,
        body: row.json,
      });
      return handleApi(copy, deps);
    }

    if (method === 'GET') return json(packResponse(row, mine));
    if (!mine) return fail('notFound', 404);

    if (method === 'PUT') {
      const body = await readJson(request);
      if (!body.ok) return body.error;
      const parsed = parseBoardPack(body.body);
      if (!parsed.ok) return fail('invalidPack', 422, { issues: parsed.issues });
      const now = deps.now();
      const updated: PackRow = {
        ...row,
        name: parsed.pack.meta.name,
        version: parsed.pack.meta.version,
        json: JSON.stringify(parsed.pack),
        updated_at: now,
      };
      await deps.db
        .prepare(
          'UPDATE packs SET name = ?, version = ?, schema_version = ?, json = ?, updated_at = ? WHERE id = ?',
        )
        .bind(updated.name, updated.version, parsed.pack.schemaVersion, updated.json, now, id)
        .run();
      return json(packResponse(updated, true));
    }
    if (method === 'DELETE') {
      await deps.db.prepare('DELETE FROM packs WHERE id = ?').bind(id).run();
      return json({ deleted: id });
    }
    return fail('badRequest', 405);
  }

  // ---- Regelsets -------------------------------------------------------------------------
  if (path === '/api/rulesets' || /^\/api\/rulesets\/[a-z0-9]{16}$/.test(path)) {
    const me = await authenticate(request, deps);
    if (!me) return fail('unauthorized', 401);
    const id = path.split('/')[3];

    if (!id && method === 'GET') {
      const { results } = await deps.db
        .prepare('SELECT id, name, json, updated_at FROM rulesets WHERE owner_id = ? ORDER BY name')
        .bind(me)
        .all<{ id: string; name: string; json: string; updated_at: number }>();
      const list: RuleSet[] = results.map((r) => ({
        id: r.id,
        name: r.name,
        ...(JSON.parse(r.json) as Pick<RuleSet, 'rules' | 'dice'>),
        updatedAt: r.updated_at,
      }));
      return json(list);
    }

    if (method === 'POST' || method === 'PUT') {
      const body = await readJson(request);
      if (!body.ok) return body.error;
      const parsed = RuleSetInputSchema.safeParse(body.body);
      if (!parsed.success) return fail('invalidRuleSet', 422);
      const { name, rules, dice } = parsed.data;
      const now = deps.now();
      const data = JSON.stringify({ rules, dice });
      if (method === 'POST' && !id) {
        const count = await deps.db
          .prepare('SELECT COUNT(*) AS n FROM rulesets WHERE owner_id = ?')
          .bind(me)
          .first<{ n: number }>();
        if ((count?.n ?? 0) >= MAX_RULESETS_PER_PROFILE) return fail('tooMany', 409);
        const newId = randomId();
        await deps.db
          .prepare(
            'INSERT INTO rulesets (id, owner_id, name, json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
          )
          .bind(newId, me, name, data, now, now)
          .run();
        return json({ id: newId, name, rules, dice, updatedAt: now } satisfies RuleSet, 201);
      }
      if (method === 'PUT' && id) {
        const owned = await deps.db
          .prepare('SELECT id FROM rulesets WHERE id = ? AND owner_id = ?')
          .bind(id, me)
          .first();
        if (!owned) return fail('notFound', 404);
        await deps.db
          .prepare('UPDATE rulesets SET name = ?, json = ?, updated_at = ? WHERE id = ?')
          .bind(name, data, now, id)
          .run();
        return json({ id, name, rules, dice, updatedAt: now } satisfies RuleSet);
      }
    }

    if (method === 'DELETE' && id) {
      await deps.db
        .prepare('DELETE FROM rulesets WHERE id = ? AND owner_id = ?')
        .bind(id, me)
        .run();
      return json({ deleted: id });
    }
    return fail('badRequest', 405);
  }

  return null;
}
