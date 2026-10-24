import { builtInPacks } from '@menelgame/packs';
import type { BoardPack } from '@menelgame/schema';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, useMyList } from '../game/api';

const loadPacks = () => api.listPacks();

/** Mitgelieferte Packs und – mit Profil – die eigenen. */
export function PackChooser({
  onBuiltIn,
  onCustom,
}: {
  onBuiltIn: (pack: BoardPack) => void;
  onCustom: (pack: BoardPack) => void;
}) {
  const { t } = useTranslation();
  const mine = useMyList(loadPacks);
  const [busy, setBusy] = useState(false);
  return (
    <select
      value=""
      disabled={busy}
      aria-label={t('lobby.choosePack')}
      onChange={(e) => {
        const [kind, id] = e.target.value.split(':');
        if (kind === 'builtin') {
          const pack = builtInPacks.find((p) => p.meta.id === id);
          if (pack) onBuiltIn(pack);
        } else if (kind === 'mine' && id) {
          setBusy(true);
          void api
            .getPack(id)
            .then((r) => onCustom(r.pack))
            .finally(() => setBusy(false));
        }
      }}
    >
      <option value="">{t('lobby.choosePack')}</option>
      <optgroup label={t('lobby.builtIn')}>
        {builtInPacks.map((p) => (
          <option key={p.meta.id} value={`builtin:${p.meta.id}`}>
            {p.meta.name}
          </option>
        ))}
      </optgroup>
      {mine.items.length > 0 && (
        <optgroup label={t('packs.myPacks')}>
          {mine.items.map((p) => (
            <option key={p.id} value={`mine:${p.id}`}>
              {p.name}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
