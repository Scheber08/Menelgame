import type { CreateRoomResponse, PackResponse } from '@menelgame/protocol';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PackPreview } from '../components/PackPreview';
import { api, savePendingPack } from '../game/api';
import { loadProfile, savePendingJoin } from '../game/profile';
import { navigate } from '../router';

/** Ansicht eines geteilten Packs: ansehen, damit hosten, eigene Kopie anlegen. */
export function SharedPackPage({ id }: { id: string }) {
  const { t } = useTranslation();
  const key = new URLSearchParams(location.search).get('k');
  const [data, setData] = useState<PackResponse | null | 'missing'>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getPack(id, key)
      .then(setData)
      .catch(() => setData('missing'));
  }, [id, key]);

  if (data === null) return <main className="center-page muted">{t('room.loading')}</main>;
  if (data === 'missing') return <main className="center-page">{t('shared.missing')}</main>;
  const { pack } = data;

  const host = async () => {
    setBusy(true);
    try {
      const response = await fetch('/api/rooms', { method: 'POST' });
      const { code } = (await response.json()) as CreateRoomResponse;
      const profile = loadProfile();
      savePendingJoin(code, { name: profile.name || t('shared.hostName'), color: profile.color });
      savePendingPack(code, pack);
      navigate(`/r/${code}`);
    } catch {
      setError(t('home.createFailed'));
      setBusy(false);
    }
  };

  const copy = async () => {
    setBusy(true);
    try {
      const created = await api.copyPack(id, key ?? '');
      navigate(`/packs/${created.id}`);
    } catch {
      setError(t('shared.copyFailed'));
      setBusy(false);
    }
  };

  return (
    <main className="shared-pack">
      <section className="panel">
        <p className="muted small">{t('shared.label')}</p>
        <h1>{pack.meta.name}</h1>
        {pack.meta.description && <p>{pack.meta.description}</p>}
        <p className="muted small">
          {t('shared.facts', {
            tiles: pack.tiles.length,
            groups: pack.groups.length,
            cards: pack.decks.reduce((n, d) => n + d.cards.length, 0),
            max: pack.maxPlayers,
          })}
        </p>
        <div className="action-buttons">
          <button type="button" className="primary" disabled={busy} onClick={() => void host()}>
            {t('shared.host')}
          </button>
          {data.mine ? (
            <button type="button" onClick={() => navigate(`/packs/${id}`)}>
              {t('packs.edit')}
            </button>
          ) : (
            <button type="button" disabled={busy} onClick={() => void copy()}>
              {t('shared.copy')}
            </button>
          )}
        </div>
        {error && <p className="error">{error}</p>}
      </section>
      <PackPreview pack={pack} />
    </main>
  );
}
