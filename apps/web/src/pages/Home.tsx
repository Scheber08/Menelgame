import { ROOM_CODE_PATTERN, type CreateRoomResponse } from '@menelgame/protocol';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ColorPicker } from '../components/ColorPicker';
import { HeroArt } from '../components/HeroArt';
import { Icon } from '../components/Icon';
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
        <div className="hero-text">
          <span className="hero-kicker">
            <Icon name="sparkles" size={16} /> {t('home.kicker')}
          </span>
          <h1>{t('home.heading')}</h1>
          <p className="hero-intro">{t('home.intro')}</p>
          <ul className="hero-points">
            <li>
              <Icon name="friends" size={18} /> {t('home.pointFriends')}
            </li>
            <li>
              <Icon name="bot" size={18} /> {t('home.pointBots')}
            </li>
            <li>
              <Icon name="layers" size={18} /> {t('home.pointPacks')}
            </li>
          </ul>
        </div>
        <HeroArt />
      </section>

      <div className="home-cards">
        <form className="panel home-card home-card-main" onSubmit={create}>
          <span className="card-icon green">
            <Icon name="friends" size={26} />
          </span>
          <h2>{t('home.onlineHeading')}</h2>
          <p className="muted">{t('home.onlineText')}</p>
          <label>
            {t('home.yourName')}
            <input
              value={profile.name}
              maxLength={20}
              placeholder={t('home.namePlaceholder')}
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
            />
          </label>
          <ColorPicker
            value={profile.color}
            taken={[]}
            onChange={(color) => setProfile({ ...profile, color })}
          />
          <button type="submit" className="primary big" disabled={busy}>
            {t('home.create')}
          </button>
        </form>

        <form className="panel home-card" onSubmit={join}>
          <span className="card-icon sky">
            <Icon name="door" size={26} />
          </span>
          <h2>{t('home.joinHeading')}</h2>
          <p className="muted">{t('home.joinText')}</p>
          <label>
            {t('home.code')}
            <input
              value={code}
              maxLength={6}
              autoCapitalize="characters"
              placeholder="ABC123"
              className="code-input"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
          </label>
          <button type="submit" className="sunny">
            {t('home.join')}
          </button>
        </form>

        <section className="panel home-card">
          <span className="card-icon grape">
            <Icon name="couch" size={26} />
          </span>
          <h2>{t('home.localHeading')}</h2>
          <p className="muted">{t('home.localText')}</p>
          <button type="button" onClick={() => navigate('/lokal')}>
            {t('home.local')}
          </button>
        </section>
      </div>

      {error && (
        <p className="error home-error" role="alert">
          {error}
        </p>
      )}

      <section className="how-to">
        <h2>{t('home.howHeading')}</h2>
        <ol className="steps">
          {(['step1', 'step2', 'step3'] as const).map((step, i) => (
            <li key={step}>
              <span className="step-number">{i + 1}</span>
              <div>
                <strong>{t(`home.${step}Title`)}</strong>
                <p className="muted">{t(`home.${step}Text`)}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
