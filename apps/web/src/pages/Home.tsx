import { ROOM_CODE_PATTERN, type CreateRoomResponse } from '@menelgame/protocol';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ColorPicker } from '../components/ColorPicker';
import { loadProfile, savePendingJoin, saveProfile } from '../game/profile';
import { navigate } from '../router';

export function Home() {
  const { t } = useTranslation();
  const [profile, setProfile] = useState(loadProfile);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile.name.trim()) {
      setError(t('home.nameRequired'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/rooms', { method: 'POST' });
      if (!response.ok) throw new Error(String(response.status));
      const { code: created } = (await response.json()) as CreateRoomResponse;
      saveProfile(profile);
      savePendingJoin(created, profile);
      navigate(`/r/${created}`);
    } catch {
      setError(t('home.createFailed'));
    } finally {
      setBusy(false);
    }
  };

  const join = (e: FormEvent) => {
    e.preventDefault();
    const normalized = code.trim().toUpperCase();
    if (!ROOM_CODE_PATTERN.test(normalized)) {
      setError(t('home.badCode'));
      return;
    }
    saveProfile(profile);
    navigate(`/r/${normalized}`);
  };

  return (
    <main className="home">
      <section className="hero">
        <h1>{t('home.heading')}</h1>
        <p className="muted">{t('home.intro')}</p>
      </section>

      <form className="panel home-card" onSubmit={create}>
        <h2>{t('home.onlineHeading')}</h2>
        <p className="muted small">{t('home.onlineText')}</p>
        <label>
          {t('home.yourName')}
          <input
            value={profile.name}
            maxLength={20}
            onChange={(e) => setProfile({ ...profile, name: e.target.value })}
          />
        </label>
        <ColorPicker
          value={profile.color}
          taken={[]}
          onChange={(color) => setProfile({ ...profile, color })}
        />
        <button type="submit" className="primary" disabled={busy}>
          {t('home.create')}
        </button>
      </form>

      <form className="panel home-card" onSubmit={join}>
        <h2>{t('home.joinHeading')}</h2>
        <p className="muted small">{t('home.joinText')}</p>
        <label>
          {t('home.code')}
          <input
            value={code}
            maxLength={6}
            autoCapitalize="characters"
            className="code-input"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </label>
        <button type="submit">{t('home.join')}</button>
      </form>

      <section className="panel home-card">
        <h2>{t('home.localHeading')}</h2>
        <p className="muted small">{t('home.localText')}</p>
        <button type="button" onClick={() => navigate('/lokal')}>
          {t('home.local')}
        </button>
      </section>

      {error && (
        <p className="error home-error" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}
