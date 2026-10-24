import { ACHIEVEMENTS, TITLES, type ProfileStatsResponse } from '@menelgame/protocol';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, loadCredentials } from '../game/api';
import { formatMoney } from '../game/format';

/** Statistik, Titel und Erfolge des eigenen Profils aus beendeten Online-Spielen. */
export function StatsPage() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<ProfileStatsResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const hasProfile = loadCredentials() !== null;

  useEffect(() => {
    if (!hasProfile) return;
    api
      .stats()
      .then(setStats)
      .catch(() => setFailed(true));
  }, [hasProfile]);

  if (!hasProfile)
    return (
      <main className="packs-page">
        <h1>{t('stats.heading')}</h1>
        <p className="muted">{t('stats.noProfile')}</p>
      </main>
    );
  if (failed)
    return (
      <main className="packs-page">
        <h1>{t('stats.heading')}</h1>
        <p className="error">{t('stats.loadFailed')}</p>
      </main>
    );
  if (!stats)
    return (
      <main className="packs-page">
        <p className="muted">{t('stats.loading')}</p>
      </main>
    );

  const { totals } = stats;
  const unlocked = new Map(stats.achievements.map((a) => [a.id, a.unlockedAt]));
  const nextTitle = TITLES.find((x) => x.wins > totals.wins);
  const numbers: [string, string][] = [
    ['games', String(totals.games)],
    ['wins', String(totals.wins)],
    ['winRate', totals.games ? `${Math.round((totals.wins / totals.games) * 100)} %` : '–'],
    ['rentReceived', formatMoney(t, totals.rentReceived)],
    ['rentPaid', formatMoney(t, totals.rentPaid)],
    ['propertiesBought', String(totals.propertiesBought)],
    ['buildings', `${totals.housesBuilt} / ${totals.hotelsBuilt}`],
    ['trades', String(totals.trades)],
    ['bestNetWorth', formatMoney(t, totals.bestNetWorth)],
  ];

  return (
    <main className="packs-page stats-page">
      <h1>{t('stats.heading')}</h1>
      <section className="panel title-panel">
        <div className="muted small">{t('stats.title')}</div>
        <div className="title-name">{t(`titles.${stats.title}`)}</div>
        {nextTitle && (
          <div className="muted small">
            {t('stats.nextTitle', {
              title: t(`titles.${nextTitle.id}`),
              count: nextTitle.wins - totals.wins,
            })}
          </div>
        )}
      </section>

      <section className="panel">
        <h2>{t('stats.numbers')}</h2>
        {totals.games === 0 && <p className="muted">{t('stats.empty')}</p>}
        <dl className="stat-grid">
          {numbers.map(([key, value]) => (
            <div key={key}>
              <dt className="muted small">{t(`stats.${key}`)}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="panel">
        <h2>{t('stats.achievements', { count: unlocked.size, total: ACHIEVEMENTS.length })}</h2>
        <ul className="achievements">
          {ACHIEVEMENTS.map((a) => (
            <li key={a.id} className={unlocked.has(a.id) ? 'unlocked' : 'locked'}>
              <span className="achievement-icon" aria-hidden="true">
                {unlocked.has(a.id) ? '★' : '☆'}
              </span>
              <div>
                <strong>{t(`achievements.${a.id}.name`)}</strong>
                <div className="muted small">{t(`achievements.${a.id}.text`)}</div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {stats.recent.length > 0 && (
        <section className="panel">
          <h2>{t('stats.recent')}</h2>
          <ul className="recent-games">
            {stats.recent.map((g) => (
              <li key={g.roomCode}>
                <span>{new Date(g.finishedAt).toLocaleDateString('de-DE')}</span>
                <span>{g.packName}</span>
                <span>
                  {g.stats.won
                    ? t('stats.won')
                    : t('stats.rank', { rank: g.stats.rank, players: g.stats.players })}
                </span>
                <span className="muted">{formatMoney(t, g.stats.netWorth)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="muted small">{t('stats.onlineOnly')}</p>
    </main>
  );
}
