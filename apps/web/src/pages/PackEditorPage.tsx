import { randomizeBoard } from '@menelgame/packs';
import { parseBoardPack, type BoardPack } from '@menelgame/schema';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EffectEditor, effectContext } from '../components/EffectEditor';
import { NumberField, TextField } from '../components/fields';
import { PackPreview } from '../components/PackPreview';
import { RulesForm } from '../components/RulesForm';
import { BoardTab } from '../editor/BoardTab';
import { ThemeTab } from '../editor/ThemeTab';
import { TileTypesTab } from '../editor/TileTypesTab';
import { api, ApiFailure, downloadJson, shareLink } from '../game/api';
import { saveTestGame } from '../game/useHotSeatGame';
import { navigate } from '../router';

type Tab = 'general' | 'board' | 'groups' | 'cards' | 'types' | 'theme' | 'rules' | 'json';
const TABS: Tab[] = ['general', 'board', 'groups', 'cards', 'types', 'theme', 'rules', 'json'];

/**
 * Pack-Editor: Brett (Form, Reihenfolge, Felder), Gruppen, Karten, eigene Feldtypen,
 * Aussehen und Standardregeln. Jede Änderung wird live mit dem Zod-Schema geprüft.
 */
export function PackEditorPage({ id }: { id: string }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<BoardPack | null>(null);
  const [saved, setSaved] = useState<string>('');
  const [shareKey, setShareKey] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('board');
  const [selected, setSelected] = useState<string | null>(null);
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

  const randomBoard = async () => {
    if (!validation.ok) return;
    const seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
    const created = await api.createPack(randomizeBoard(validation.pack, seed));
    navigate(`/packs/${created.id}`);
  };

  const testGame = () => {
    if (!validation.ok) return;
    saveTestGame(validation.pack);
    navigate('/lokal');
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
          <button type="button" disabled={!validation.ok} onClick={testGame}>
            {t('editor.testGame')}
          </button>
          <button type="button" disabled={!validation.ok} onClick={() => void randomBoard()}>
            {t('editor.randomBoard')}
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

          {tab === 'board' && (
            <BoardTab pack={draft} onChange={update} selected={selected} onSelect={setSelected} />
          )}

          {tab === 'groups' && <GroupsEditor pack={draft} onChange={update} />}

          {tab === 'cards' && <CardsEditor pack={draft} onChange={update} />}

          {tab === 'types' && (
            <TileTypesTab pack={draft} onChange={(tileTypes) => update({ tileTypes })} />
          )}

          {tab === 'theme' && (
            <ThemeTab theme={draft.theme} onChange={(theme) => update({ theme })} />
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
          <PackPreview
            pack={validation.ok ? validation.pack : JSON.parse(saved)}
            selected={selected}
            onSelect={setSelected}
          />
        </aside>
      </div>
    </main>
  );
}

function GroupsEditor({
  pack,
  onChange,
}: {
  pack: BoardPack;
  onChange: (patch: Partial<BoardPack>) => void;
}) {
  const { t } = useTranslation();
  const used = (id: string) => pack.tiles.some((x) => 'group' in x && x.group === id);
  const set = (i: number, patch: Partial<BoardPack['groups'][number]>) =>
    onChange({ groups: pack.groups.map((g, j) => (j === i ? { ...g, ...patch } : g)) });
  return (
    <div className="group-editor">
      {pack.groups.map((group, gi) => (
        <div key={group.id} className="group-row">
          <input
            type="color"
            aria-label={t('editor.color')}
            value={group.color}
            onChange={(e) => set(gi, { color: e.target.value })}
          />
          <input
            aria-label={t('editor.name')}
            value={group.name}
            maxLength={60}
            onChange={(e) => set(gi, { name: e.target.value })}
          />
          <button
            type="button"
            className="link danger-link"
            disabled={used(group.id)}
            title={used(group.id) ? t('editor.groupInUse') : undefined}
            onClick={() => onChange({ groups: pack.groups.filter((_, j) => j !== gi) })}
          >
            {t('editor.remove')}
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => {
          const ids = new Set(pack.groups.map((g) => g.id));
          let n = pack.groups.length + 1;
          while (ids.has(`gruppe-${n}`)) n++;
          onChange({
            groups: [
              ...pack.groups,
              { id: `gruppe-${n}`, name: t('editor.newGroup'), color: '#888888' },
            ],
          });
        }}
      >
        {t('editor.addGroup')}
      </button>
    </div>
  );
}

function CardsEditor({
  pack,
  onChange,
}: {
  pack: BoardPack;
  onChange: (patch: Partial<BoardPack>) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="deck-editor">
      {pack.decks.map((deck, di) => {
        const setDeck = (next: typeof deck) =>
          onChange({ decks: pack.decks.map((d, j) => (j === di ? next : d)) });
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
                  context={effectContext(pack)}
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
      {error && (
        <p className="error" style={{ whiteSpace: 'pre-line' }}>
          {error}
        </p>
      )}
    </div>
  );
}
