import { parseBoardPack, type BoardPack, type Tile } from '@menelgame/schema';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EffectEditor, effectContext } from '../components/EffectEditor';
import { NumberField, TextField } from '../components/fields';
import { PackPreview } from '../components/PackPreview';
import { RulesForm } from '../components/RulesForm';
import { api, ApiFailure, downloadJson, shareLink } from '../game/api';
import { navigate } from '../router';

type Tab = 'general' | 'tiles' | 'groups' | 'cards' | 'rules' | 'json';
const TABS: Tab[] = ['general', 'tiles', 'groups', 'cards', 'rules', 'json'];

/**
 * Inhalts-Editor für eigene Packs: Felder, Gruppen, Karten und Standardregeln. Die Form des
 * Bretts (Anzahl und Reihenfolge der Felder) ändert erst der Brett-Editor in Phase 5.
 */
export function PackEditorPage({ id }: { id: string }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<BoardPack | null>(null);
  const [saved, setSaved] = useState<string>('');
  const [shareKey, setShareKey] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('tiles');
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    api
      .getPack(id)
      .then((r) => {
        if (!r.mine) {
          setLoadError(true);
          return;
        }
        setDraft(r.pack);
        setSaved(JSON.stringify(r.pack));
        setShareKey(r.shareKey);
      })
      .catch(() => setLoadError(true));
  }, [id]);

  const validation = useMemo(() => (draft ? parseBoardPack(draft) : null), [draft]);
  if (loadError) return <main className="center-page">{t('editor.notFound')}</main>;
  if (!draft || !validation) return <main className="center-page muted">{t('room.loading')}</main>;

  const dirty = JSON.stringify(draft) !== saved;
  const update = (patch: Partial<BoardPack>) => setDraft({ ...draft, ...patch });
  const setTile = (index: number, tile: Tile) =>
    update({ tiles: draft.tiles.map((x, i) => (i === index ? tile : x)) });

  const save = async () => {
    if (!validation.ok) return;
    try {
      const result = await api.updatePack(id, validation.pack);
      setDraft(result.pack);
      setSaved(JSON.stringify(result.pack));
      setStatus({ ok: true, text: t('editor.saved') });
    } catch (e) {
      const issues = e instanceof ApiFailure ? e.body?.issues : undefined;
      setStatus({
        ok: false,
        text: issues
          ? issues.map((i) => `${i.path}: ${i.message}`).join('\n')
          : t('editor.saveFailed'),
      });
    }
  };

  return (
    <main className="editor">
      <div className="editor-head">
        <div>
          <button type="button" className="link" onClick={() => navigate('/packs')}>
            ← {t('packs.heading')}
          </button>
          <h1>{draft.meta.name}</h1>
        </div>
        <div className="action-buttons">
          <button
            type="button"
            className="primary"
            disabled={!dirty || !validation.ok}
            onClick={() => void save()}
          >
            {dirty ? t('editor.save') : t('editor.allSaved')}
          </button>
          <button type="button" onClick={() => downloadJson(`${draft.meta.id}.json`, draft)}>
            {t('packs.export')}
          </button>
          {shareKey && (
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(shareLink(id, shareKey));
                setStatus({ ok: true, text: t('packs.linkCopied') });
              }}
            >
              {t('packs.copyLink')}
            </button>
          )}
        </div>
      </div>

      {!validation.ok && (
        <div className="panel issues" role="alert">
          <strong>{t('editor.invalid')}</strong>
          <ul>
            {validation.issues.slice(0, 12).map((issue, i) => (
              <li key={i}>
                <code>{issue.path || '–'}</code> {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {status && (
        <p
          className={status.ok ? 'success' : 'error'}
          role="status"
          style={{ whiteSpace: 'pre-line' }}
        >
          {status.text}
        </p>
      )}

      <nav className="tabs" role="tablist">
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            className={tab === name ? 'active' : ''}
            onClick={() => setTab(name)}
          >
            {t(`editor.tab_${name}`)}
          </button>
        ))}
      </nav>

      <div className="editor-body">
        <section className="panel editor-panel">
          {tab === 'general' && (
            <div className="rules-grid">
              <TextField
                label={t('editor.name')}
                value={draft.meta.name}
                onChange={(name) => update({ meta: { ...draft.meta, name } })}
              />
              <TextField
                label={t('editor.version')}
                value={draft.meta.version}
                maxLength={20}
                onChange={(version) => update({ meta: { ...draft.meta, version } })}
              />
              <TextField
                label={t('editor.author')}
                value={draft.meta.author ?? ''}
                onChange={(author) => update({ meta: { ...draft.meta, author } })}
              />
              <NumberField
                label={t('editor.maxPlayers')}
                value={draft.maxPlayers}
                min={2}
                max={8}
                onChange={(maxPlayers) => update({ maxPlayers })}
              />
              <TextField
                label={t('editor.description')}
                value={draft.meta.description ?? ''}
                maxLength={500}
                multiline
                onChange={(description) => update({ meta: { ...draft.meta, description } })}
              />
            </div>
          )}

          {tab === 'tiles' && (
            <ol className="tile-editor-list">
              {draft.tiles.map((tile, index) => (
                <li key={tile.id}>
                  <details>
                    <summary>
                      <span className="muted">{index}</span> {tile.name}{' '}
                      <span className="badge">{t(`tile.types.${tile.type}`)}</span>
                    </summary>
                    <TileEditor
                      pack={draft}
                      tile={tile}
                      onChange={(next) => setTile(index, next)}
                    />
                  </details>
                </li>
              ))}
            </ol>
          )}

          {tab === 'groups' && (
            <div className="group-editor">
              {draft.groups.map((group, gi) => (
                <div key={group.id} className="group-row">
                  <input
                    type="color"
                    aria-label={t('editor.color')}
                    value={group.color}
                    onChange={(e) =>
                      update({
                        groups: draft.groups.map((g, j) =>
                          j === gi ? { ...g, color: e.target.value } : g,
                        ),
                      })
                    }
                  />
                  <input
                    aria-label={t('editor.name')}
                    value={group.name}
                    maxLength={60}
                    onChange={(e) =>
                      update({
                        groups: draft.groups.map((g, j) =>
                          j === gi ? { ...g, name: e.target.value } : g,
                        ),
                      })
                    }
                  />
                </div>
              ))}
            </div>
          )}

          {tab === 'cards' && (
            <div className="deck-editor">
              {draft.decks.map((deck, di) => {
                const setDeck = (next: typeof deck) =>
                  update({ decks: draft.decks.map((d, j) => (j === di ? next : d)) });
                return (
                  <section key={deck.id} className="deck">
                    <h3>
                      <input
                        aria-label={t('editor.name')}
                        value={deck.name}
                        maxLength={60}
                        onChange={(e) => setDeck({ ...deck, name: e.target.value })}
                      />
                    </h3>
                    {deck.cards.map((card, ci) => (
                      <div key={card.id} className="card-row">
                        <TextField
                          label={t('editor.cardText')}
                          value={card.text}
                          maxLength={300}
                          multiline
                          onChange={(text) =>
                            setDeck({
                              ...deck,
                              cards: deck.cards.map((c, j) => (j === ci ? { ...c, text } : c)),
                            })
                          }
                        />
                        <EffectEditor
                          effects={card.effects}
                          context={effectContext(draft)}
                          onChange={(effects) =>
                            setDeck({
                              ...deck,
                              cards: deck.cards.map((c, j) => (j === ci ? { ...c, effects } : c)),
                            })
                          }
                        />
                        {deck.cards.length > 1 && (
                          <button
                            type="button"
                            className="link danger-link"
                            onClick={() =>
                              setDeck({ ...deck, cards: deck.cards.filter((_, j) => j !== ci) })
                            }
                          >
                            {t('editor.removeCard')}
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        const ids = new Set(deck.cards.map((c) => c.id));
                        let n = deck.cards.length + 1;
                        while (ids.has(`karte-${n}`)) n++;
                        setDeck({
                          ...deck,
                          cards: [
                            ...deck.cards,
                            {
                              id: `karte-${n}`,
                              text: t('editor.newCard'),
                              effects: [{ kind: 'collect', amount: 50 }],
                            },
                          ],
                        });
                      }}
                    >
                      {t('editor.addCard')}
                    </button>
                  </section>
                );
              })}
            </div>
          )}

          {tab === 'rules' && (
            <>
              <p className="muted small">{t('editor.rulesHint')}</p>
              <RulesForm
                rules={draft.rules}
                onChange={(rules) => update({ rules })}
                dice={draft.dice}
                onDiceChange={(dice) => update({ dice })}
                showTimers
              />
            </>
          )}

          {tab === 'json' && <JsonEditor pack={draft} onApply={setDraft} />}
        </section>
        <aside className="editor-preview">
          <PackPreview pack={validation.ok ? validation.pack : JSON.parse(saved)} />
        </aside>
      </div>
    </main>
  );
}

function TileEditor({
  pack,
  tile,
  onChange,
}: {
  pack: BoardPack;
  tile: Tile;
  onChange: (tile: Tile) => void;
}) {
  const { t } = useTranslation();
  const groups = (type: string) => {
    const used = new Set(
      pack.tiles
        .filter((x) => x.type === type && 'group' in x)
        .map((x) => ('group' in x ? x.group : '')),
    );
    return pack.groups.filter(
      (g) => used.has(g.id) || !pack.tiles.some((x) => 'group' in x && x.group === g.id),
    );
  };
  const money = (label: string, value: number, update: (n: number) => void) => (
    <NumberField
      key={label}
      label={label}
      value={value}
      step={10}
      max={100_000}
      onChange={update}
    />
  );

  return (
    <div className="tile-editor rules-grid">
      <TextField
        label={t('editor.name')}
        value={tile.name}
        maxLength={60}
        onChange={(name) => onChange({ ...tile, name })}
      />
      {'group' in tile && (
        <label className="field">
          {t('editor.group')}
          <select value={tile.group} onChange={(e) => onChange({ ...tile, group: e.target.value })}>
            {groups(tile.type).map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {'price' in tile &&
        money(t('tile.price'), tile.price, (price) => onChange({ ...tile, price }))}
      {tile.type === 'property' && (
        <>
          {money(t('tile.houseCost'), tile.houseCost, (houseCost) =>
            onChange({ ...tile, houseCost }),
          )}
          {tile.rent.map((rent, i) =>
            money(
              i === 0
                ? t('tile.rentBase')
                : i === 5
                  ? t('tile.rentHotel')
                  : t('tile.rentHouses', { count: i }),
              rent,
              (n) => onChange({ ...tile, rent: tile.rent.map((r, j) => (j === i ? n : r)) }),
            ),
          )}
        </>
      )}
      {tile.type === 'station' &&
        tile.rent.map((rent, i) =>
          money(t('tile.stationRent', { count: i + 1 }), rent, (n) =>
            onChange({ ...tile, rent: tile.rent.map((r, j) => (j === i ? n : r)) }),
          ),
        )}
      {tile.type === 'utility' &&
        tile.multipliers.map((m, i) => (
          <NumberField
            key={i}
            label={t('editor.utilityFactor', { count: i + 1 })}
            value={m}
            min={1}
            max={100}
            onChange={(n) =>
              onChange({ ...tile, multipliers: tile.multipliers.map((x, j) => (j === i ? n : x)) })
            }
          />
        ))}
      {tile.type === 'tax' &&
        money(t('editor.amount'), tile.amount, (amount) => onChange({ ...tile, amount }))}
      {tile.type === 'card' && (
        <label className="field">
          {t('editor.deck')}
          <select value={tile.deck} onChange={(e) => onChange({ ...tile, deck: e.target.value })}>
            {pack.decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

function JsonEditor({ pack, onApply }: { pack: BoardPack; onApply: (pack: BoardPack) => void }) {
  const { t } = useTranslation();
  const [text, setText] = useState(() => JSON.stringify(pack, null, 2));
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="json-editor">
      <p className="muted small">{t('editor.jsonHint')}</p>
      <textarea value={text} spellCheck={false} onChange={(e) => setText(e.target.value)} />
      <div className="action-buttons">
        <button
          type="button"
          onClick={() => {
            try {
              const parsed = parseBoardPack(JSON.parse(text));
              if (!parsed.ok) {
                setError(parsed.issues.map((i) => `${i.path}: ${i.message}`).join('\n'));
                return;
              }
              onApply(parsed.pack);
              setError(null);
            } catch (e) {
              setError(String(e));
            }
          }}
        >
          {t('editor.applyJson')}
        </button>
        <button
          type="button"
          className="link"
          onClick={() => setText(JSON.stringify(pack, null, 2))}
        >
          {t('editor.resetJson')}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
