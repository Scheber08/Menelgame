import { standardPack } from '@menelgame/packs';
import type { PackResponse, PackSummary, ProfileCredentials, RuleSet } from '@menelgame/protocol';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { handleApi, serveImage, type ImageStore, type SqlDatabase, type SqlStatement } from './api';

/** D1-ähnliche Hülle um node:sqlite, damit die API ohne Cloudflare testbar ist. */
function sqliteDb(): SqlDatabase {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'));
  const statement = (query: string, values: unknown[] = []): SqlStatement => ({
    bind: (...next) => statement(query, next),
    first: async <T>() => (db.prepare(query).get(...(values as never[])) as T | undefined) ?? null,
    all: async <T>() => ({ results: db.prepare(query).all(...(values as never[])) as T[] }),
    run: async () => db.prepare(query).run(...(values as never[])),
  });
  return { prepare: (query) => statement(query) };
}

let db: SqlDatabase;
let clock = 1000;
const stored = new Map<string, { body: ArrayBuffer; contentType: string }>();
const images: ImageStore = {
  put: async (key, body, contentType) => {
    stored.set(key, { body, contentType });
  },
  get: async (key) => stored.get(key) ?? null,
};

async function call(
  method: string,
  path: string,
  options: { auth?: ProfileCredentials; body?: unknown } = {},
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {};
  if (options.auth) headers.Authorization = `Bearer ${options.auth.id}:${options.auth.secret}`;
  const request = new Request(`http://test${path}`, {
    method,
    headers,
    ...(options.body !== undefined && { body: JSON.stringify(options.body) }),
  });
  const response = await handleApi(request, { db, now: () => ++clock, images });
  if (!response) throw new Error(`Kein Handler für ${path}`);
  return { status: response.status, body: await response.json() };
}

async function newProfile(): Promise<ProfileCredentials> {
  const { body } = await call('POST', '/api/profile');
  return body as ProfileCredentials;
}

function myPack(name = 'Mein Brett') {
  return { ...structuredClone(standardPack), meta: { ...standardPack.meta, id: 'mein', name } };
}

beforeEach(() => {
  db = sqliteDb();
});

describe('Profile', () => {
  it('legt Profile an und prüft das Geheimnis', async () => {
    const me = await newProfile();
    expect(me.id).toMatch(/^[a-z0-9]{16}$/);
    expect(me.secret).toMatch(/^[a-f0-9]{64}$/);
    expect(await call('GET', '/api/profile', { auth: me })).toEqual({
      status: 200,
      body: { id: me.id },
    });
    const wrong = { ...me, secret: 'f'.repeat(64) };
    expect((await call('GET', '/api/profile', { auth: wrong })).status).toBe(401);
  });
});

describe('Packs', () => {
  it('speichert, listet und aktualisiert eigene Packs', async () => {
    const me = await newProfile();
    const created = await call('POST', '/api/packs', { auth: me, body: myPack() });
    expect(created.status).toBe(201);
    const pack = created.body as PackResponse;
    expect(pack).toMatchObject({ mine: true, pack: { meta: { name: 'Mein Brett' } } });
    expect(pack.shareKey).toMatch(/^[a-f0-9]{64}$/);

    const list = (await call('GET', '/api/packs', { auth: me })).body as PackSummary[];
    expect(list).toEqual([
      { id: pack.id, name: 'Mein Brett', version: '1.0.0', tiles: 40, updatedAt: pack.updatedAt },
    ]);

    const updated = await call('PUT', `/api/packs/${pack.id}`, { auth: me, body: myPack('Neu') });
    expect(updated.status).toBe(200);
    expect((updated.body as PackResponse).pack.meta.name).toBe('Neu');
  });

  it('weist ungültige Packs mit Fehlerliste ab', async () => {
    const me = await newProfile();
    const broken = myPack();
    broken.tiles = broken.tiles.filter((t) => t.type !== 'jail');
    const result = await call('POST', '/api/packs', { auth: me, body: broken });
    expect(result.status).toBe(422);
    expect(result.body).toMatchObject({ error: 'invalidPack' });
    expect(JSON.stringify(result.body)).toContain('Gefängnisfeld');
  });

  it('hält Packs privat: kein Zugriff ohne Besitz oder Schlüssel', async () => {
    const owner = await newProfile();
    const other = await newProfile();
    const pack = (await call('POST', '/api/packs', { auth: owner, body: myPack() }))
      .body as PackResponse;
    expect((await call('GET', `/api/packs/${pack.id}`, { auth: other })).status).toBe(404);
    expect((await call('GET', `/api/packs/${pack.id}`)).status).toBe(404);
    expect((await call('GET', `/api/packs/${pack.id}?k=${'0'.repeat(64)}`)).status).toBe(404);
    // Fremde Listen gibt es nicht: jeder sieht nur seine eigenen.
    expect((await call('GET', '/api/packs', { auth: other })).body).toEqual([]);
    expect(
      (await call('PUT', `/api/packs/${pack.id}`, { auth: other, body: myPack() })).status,
    ).toBe(404);
    expect((await call('DELETE', `/api/packs/${pack.id}`, { auth: other })).status).toBe(404);
  });

  it('teilt per Link: ansehen und kopieren ja, bearbeiten nein', async () => {
    const owner = await newProfile();
    const friend = await newProfile();
    const pack = (await call('POST', '/api/packs', { auth: owner, body: myPack() }))
      .body as PackResponse;
    const link = `/api/packs/${pack.id}?k=${pack.shareKey}`;

    const seen = await call('GET', link);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({
      mine: false,
      shareKey: null,
      pack: { meta: { name: 'Mein Brett' } },
    });
    expect((await call('PUT', link, { auth: friend, body: myPack('Gehackt') })).status).toBe(404);

    const copy = await call('POST', `/api/packs/${pack.id}/copy?k=${pack.shareKey}`, {
      auth: friend,
    });
    expect(copy.status).toBe(201);
    expect((copy.body as PackResponse).id).not.toBe(pack.id);
    expect(((await call('GET', '/api/packs', { auth: friend })).body as PackSummary[]).length).toBe(
      1,
    );
  });

  it('widerruft Teilen-Links durch einen neuen Schlüssel', async () => {
    const owner = await newProfile();
    const pack = (await call('POST', '/api/packs', { auth: owner, body: myPack() }))
      .body as PackResponse;
    const renewed = await call('POST', `/api/packs/${pack.id}/share`, { auth: owner });
    const { shareKey } = renewed.body as { shareKey: string };
    expect(shareKey).not.toBe(pack.shareKey);
    expect((await call('GET', `/api/packs/${pack.id}?k=${pack.shareKey}`)).status).toBe(404);
    expect((await call('GET', `/api/packs/${pack.id}?k=${shareKey}`)).status).toBe(200);
  });

  it('löscht Packs des Besitzers', async () => {
    const owner = await newProfile();
    const pack = (await call('POST', '/api/packs', { auth: owner, body: myPack() }))
      .body as PackResponse;
    expect((await call('DELETE', `/api/packs/${pack.id}`, { auth: owner })).status).toBe(200);
    expect((await call('GET', `/api/packs/${pack.id}`, { auth: owner })).status).toBe(404);
  });

  it('verlangt ein Profil zum Speichern', async () => {
    expect((await call('POST', '/api/packs', { body: myPack() })).status).toBe(401);
  });
});

describe('Regelsets', () => {
  it('speichert, ändert und löscht Regelsets getrennt vom Brett', async () => {
    const me = await newProfile();
    const rules = { ...standardPack.rules, startingCash: 2500 };
    const created = await call('POST', '/api/rulesets', {
      auth: me,
      body: { name: 'Reich', rules, dice: { count: 3, sides: 6 } },
    });
    expect(created.status).toBe(201);
    const set = created.body as RuleSet;
    expect(set).toMatchObject({ name: 'Reich', rules: { startingCash: 2500 }, dice: { count: 3 } });

    const renamed = await call('PUT', `/api/rulesets/${set.id}`, {
      auth: me,
      body: { name: 'Sehr reich', rules, dice: set.dice },
    });
    expect((renamed.body as RuleSet).name).toBe('Sehr reich');
    expect(
      ((await call('GET', '/api/rulesets', { auth: me })).body as RuleSet[]).map((r) => r.name),
    ).toEqual(['Sehr reich']);

    const other = await newProfile();
    expect((await call('GET', '/api/rulesets', { auth: other })).body).toEqual([]);
    expect(
      (
        await call('PUT', `/api/rulesets/${set.id}`, {
          auth: other,
          body: { name: 'x', rules, dice: set.dice },
        })
      ).status,
    ).toBe(404);

    await call('DELETE', `/api/rulesets/${set.id}`, { auth: me });
    expect((await call('GET', '/api/rulesets', { auth: me })).body).toEqual([]);
  });

  it('prüft Regelwerte mit dem Schema', async () => {
    const me = await newProfile();
    const result = await call('POST', '/api/rulesets', {
      auth: me,
      body: { name: 'Kaputt', rules: { startingCash: -1 }, dice: {} },
    });
    expect(result).toEqual({ status: 422, body: { error: 'invalidRuleSet' } });
  });
});

describe('Bilder', () => {
  async function upload(auth: ProfileCredentials | undefined, type: string, bytes: number) {
    const headers: Record<string, string> = { 'Content-Type': type };
    if (auth) headers.Authorization = `Bearer ${auth.id}:${auth.secret}`;
    const request = new Request('http://test/api/images', {
      method: 'POST',
      headers,
      body: new Uint8Array(bytes).fill(7),
    });
    const response = (await handleApi(request, { db, now: () => ++clock, images }))!;
    return { status: response.status, body: (await response.json()) as { url?: string } };
  }

  it('speichert Bilder eines Profils und liefert sie aus', async () => {
    const me = await newProfile();
    const result = await upload(me, 'image/png', 100);
    expect(result.status).toBe(201);
    expect(result.body.url).toMatch(new RegExp(`^/img/${me.id}/[a-z0-9]{16}[.]png$`));
    const served = await serveImage(result.body.url!, images);
    expect(served.status).toBe(200);
    expect(served.headers.get('Content-Type')).toBe('image/png');
    expect((await served.arrayBuffer()).byteLength).toBe(100);
  });

  it('verlangt Profil, Bildformat und Größenlimit', async () => {
    const me = await newProfile();
    expect((await upload(undefined, 'image/png', 10)).status).toBe(401);
    expect((await upload(me, 'text/html', 10)).status).toBe(415);
    expect((await upload(me, 'image/png', 1024 * 1024 + 1)).status).toBe(413);
    expect((await serveImage('/img/../etwas', images)).status).toBe(404);
  });
});
