import { replay, type GameLog, type GameEvent, type GameState } from '@menelgame/engine';
import { publicGameState } from '@menelgame/protocol';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatEvent } from '../game/format';
import { Icon } from './Icon';

interface EventLogProps {
  state: GameState;
  events: GameEvent[];
  /** Lokales Log (Hot-Seat). */
  log?: GameLog;
  /** Online: Adresse, unter der der Server das Log liefert. */
  exportHref?: string;
}

const MAX_ENTRIES = 300;

export function EventLog({ state, events, log, exportHref }: EventLogProps) {
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

  const verify = async () => {
    try {
      const source = log ?? ((await fetch(exportHref!).then((r) => r.json())) as GameLog);
      const result = replay(source);
      // Online kennt der Browser nur den verdeckten Zustand.
      const replayed = log ? result.state : publicGameState(result.state);
      const same = JSON.stringify(replayed) === JSON.stringify(state);
      setVerdict(
        same
          ? { ok: true, text: t('log.verifyOk', { count: source.actions.length }) }
          : { ok: false, text: t('log.verifyFail', { error: 'state' }) },
      );
    } catch (error) {
      setVerdict({ ok: false, text: t('log.verifyFail', { error: String(error) }) });
    }
  };

  const exportLog = () => {
    if (!log) return;
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
        <h2>
          <Icon name="list" />
          {t('log.heading')}
        </h2>
        <div className="log-tools">
          {(log || exportHref) && (
            <button type="button" className="link" onClick={() => void verify()}>
              {t('log.verify')}
            </button>
          )}
          {log && (
            <button type="button" className="link" onClick={exportLog}>
              {t('log.export')}
            </button>
          )}
          {exportHref && (
            <a className="link" href={exportHref} download="menelgame-log.json">
              {t('log.export')}
            </a>
          )}
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
