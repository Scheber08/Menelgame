import { standardPack } from '@menelgame/packs';
import { parseBoardPack } from '@menelgame/schema';
import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  api,
  ApiFailure,
  downloadJson,
  ensureProfile,
  forgetProfile,
  restoreProfile,
  shareLink,
  useMyList,
  useProfile,
} from '../game/api';
import { navigate } from '../router';

const loadPacks = () => api.listPacks();
const loadRuleSets = () => api.listRuleSets();

function issuesText(e: unknown): string {
  if (e instanceof ApiFailure && e.body?.issues)
    return e.body.issues.map((i) => `${i.path}: ${i.message}`).join('\n');
  return e instanceof Error ? e.message : String(e);
}

/** „Meine Packs“: eigene Packs und Regelsets, Profil und Wiederherstellung. */
export function MyPacksPage() {
  const { t } = useTranslation();
  const packs = useMyList(loadPacks);
  const ruleSets = useMyList(loadRuleSets);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const createFromStandard = async () => {
    const copy = structuredClone(standardPack);
    copy.meta = { ...copy.meta, id: 'mein-pack', name: t('packs.newName'), author: '' };
    const created = await api.createPack(copy);
    navigate(`/packs/${created.id}`);
  };

  const importFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const parsed = parseBoardPack(JSON.parse(await file.text()));
      if (!parsed.ok) {
        setMessage({
          ok: false,
          text: `${t('packs.importInvalid')}\n${parsed.issues.map((i) => `${i.path}: ${i.message}`).join('\n')}`,
        });
        return;
      }
      const created = await api.createPack(parsed.pack);
      navigate(`/packs/${created.id}`);
    } catch (error) {
      setMessage({ ok: false, text: `${t('packs.importFailed')} ${issuesText(error)}` });
    }
  };

  const copyLink = async (id: string, renew: boolean) => {
    const key = renew ? (await api.renewShareKey(id)).shareKey : (await api.getPack(id)).shareKey;
    if (!key) return;
    await navigator.clipboard?.writeText(shareLink(id, key));
    setMessage({ ok: true, text: renew ? t('packs.linkRenewed') : t('packs.linkCopied') });
  };

  return (
    <main className="packs-page">
      <h1>{t('packs.heading')}</h1>
      <p className="muted">{t('packs.intro')}</p>

      <section className="panel">
        <div className="panel-header">
          <h2>{t('packs.myPacks')}</h2>
          <div className="action-buttons">
            <button type="button" className="primary" onClick={() => void createFromStandard()}>
              {t('packs.new')}
            </button>
            <label className="button-like">
              {t('packs.import')}
              <input type="file" accept="application/json,.json" hidden onChange={importFile} />
            </label>
          </div>
        </div>
        {message && (
          <p
            className={message.ok ? 'success' : 'error'}
            role="status"
            style={{ whiteSpace: 'pre-line' }}
          >
            {message.text}
          </p>
        )}
        {packs.items.length === 0 && <p className="muted">{t('packs.none')}</p>}
        <ul className="item-list">
          {packs.items.map((p) => (
            <li key={p.id}>
              <div>
                <strong>{p.name}</strong>
                <div className="muted small">
                  {t('packs.summary', { version: p.version, tiles: p.tiles })}
                </div>
              </div>
              <div className="action-buttons">
                <button type="button" onClick={() => navigate(`/packs/${p.id}`)}>
                  {t('packs.edit')}
                </button>
                <button type="button" onClick={() => void copyLink(p.id, false)}>
                  {t('packs.copyLink')}
                </button>
                <button type="button" className="link" onClick={() => void copyLink(p.id, true)}>
                  {t('packs.renewLink')}
                </button>
                <button
                  type="button"
                  className="link"
                  onClick={() =>
                    void api
                      .getPack(p.id)
                      .then((r) => downloadJson(`${r.pack.meta.id}.json`, r.pack))
                  }
                >
                  {t('packs.export')}
                </button>
                <button
                  type="button"
                  className="link danger-link"
                  onClick={() => {
                    if (window.confirm(t('packs.confirmDelete', { name: p.name })))
                      void api.deletePack(p.id).then(packs.reload);
                  }}
                >
                  {t('packs.delete')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>{t('packs.ruleSets')}</h2>
        <p className="muted small">{t('packs.ruleSetsHint')}</p>
        {ruleSets.items.length === 0 && <p className="muted">{t('packs.noRuleSets')}</p>}
        <ul className="item-list">
          {ruleSets.items.map((r) => (
            <li key={r.id}>
              <strong>{r.name}</strong>
              <button
                type="button"
                className="link danger-link"
                onClick={() => void api.deleteRuleSet(r.id).then(ruleSets.reload)}
              >
                {t('packs.delete')}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <ProfilePanel />
    </main>
  );
}

function ProfilePanel() {
  const { t } = useTranslation();
  const { credentials, code } = useProfile();
  const [show, setShow] = useState(false);
  const [restore, setRestore] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus((await restoreProfile(restore)) ? t('profile.restored') : t('profile.restoreFailed'));
    setRestore('');
  };

  return (
    <section className="panel">
      <h2>{t('profile.heading')}</h2>
      <p className="muted small">{t('profile.intro')}</p>
      {credentials ? (
        <>
          <p>
            {t('profile.id')}: <code>{credentials.id}</code>
          </p>
          <div className="action-buttons">
            <button type="button" onClick={() => setShow((s) => !s)}>
              {show ? t('profile.hideCode') : t('profile.showCode')}
            </button>
            {show && code && (
              <button type="button" onClick={() => void navigator.clipboard?.writeText(code)}>
                {t('profile.copyCode')}
              </button>
            )}
            <button
              type="button"
              className="link danger-link"
              onClick={() => {
                if (window.confirm(t('profile.confirmForget'))) forgetProfile();
              }}
            >
              {t('profile.forget')}
            </button>
          </div>
          {show && code && (
            <p className="recovery">
              <code>{code}</code>
              <span className="muted small">{t('profile.codeHint')}</span>
            </p>
          )}
        </>
      ) : (
        <button type="button" onClick={() => void ensureProfile()}>
          {t('profile.create')}
        </button>
      )}
      <form className="restore" onSubmit={(e) => void submit(e)}>
        <label>
          {t('profile.restoreLabel')}
          <input value={restore} onChange={(e) => setRestore(e.target.value)} />
        </label>
        <button type="submit" disabled={!restore.trim()}>
          {t('profile.restore')}
        </button>
      </form>
      {status && <p className="muted small">{status}</p>}
    </section>
  );
}
