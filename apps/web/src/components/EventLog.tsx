import { replay, type GameLog, type GameEvent, type GameState } from '@menelgame/engine';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatEvent } from '../game/format';

interface EventLogProps {
  state: GameState;
  events: GameEvent[];
  log: GameLog;
}

const MAX_ENTRIES = 300;

export function EventLog({ state, events, log }: EventLogProps) {
  const { t } = useTranslation();
  const [verdict, setVerdict] = useState<{ ok: boolean; text: string } | null>(null);

  const entries = useMemo(() => {
    const out: { key: number; text: string; turn: boolean }[] = [];
    for (let i = events.length - 1; i >= 0 && out.length < MAX_ENTRIES; i--) {
      const event = events[i]!;
      const text = formatEvent(t, state, event);
      if (text) out.push({ key: i, text, turn: event.type === 'turnStarted' });
    }
    return out;
  }, [events, state, t]);

  const verify = () => {
    try {
      const result = replay(log);
      const same = JSON.stringify(result.state) === JSON.stringify(state);
      setVerdict(
        same
          ? { ok: true, text: t('log.verifyOk', { count: log.actions.length }) }
          : { ok: false, text: t('log.verifyFail', { error: 'state' }) },
      );
    } catch (error) {
      setVerdict({ ok: false, text: t('log.verifyFail', { error: String(error) }) });
    }
  };

  const exportLog = () => {
    const blob = new Blob([JSON.stringify(log, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `menelgame-log-${log.initial.rng.state}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="panel log-panel">
      <div className="panel-header">
        <h2>{t('log.heading')}</h2>
        <div className="log-tools">
          <button type="button" className="link" onClick={verify}>
            {t('log.verify')}
          </button>
          <button type="button" className="link" onClick={exportLog}>
            {t('log.export')}
          </button>
        </div>
      </div>
      {verdict && (
        <p className={verdict.ok ? 'success small' : 'error small'} role="status">
          {verdict.text}
        </p>
      )}
      <ol className="event-log">
        {entries.map((entry) => (
          <li key={entry.key} className={entry.turn ? 'turn' : ''}>
            {entry.text}
          </li>
        ))}
      </ol>
    </section>
  );
}
