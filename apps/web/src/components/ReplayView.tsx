import { apply, type GameEvent, type GameLog, type GameState } from '@menelgame/engine';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Board } from '../board/Board';
import { EventLog } from './EventLog';
import { PlayerList } from './PlayerList';

/** Alle so viele Aktionen wird ein Zwischenstand gemerkt; dazwischen wird nachgespielt. */
const CHECKPOINT = 100;
const SPEEDS = [1, 4, 16] as const;

interface Timeline {
  checkpoints: GameState[];
  events: GameEvent[];
  /** Anzahl Ereignisse nach Aktion k (Index 0 = Startzustand). */
  eventCount: number[];
  /** Aktionen, nach denen ein neuer Zug beginnt. */
  turnStarts: number[];
}

function buildTimeline(log: GameLog): Timeline {
  const checkpoints = [log.initial];
  const events: GameEvent[] = [];
  const eventCount = [0];
  const turnStarts: number[] = [];
  let state = log.initial;
  log.actions.forEach((action, i) => {
    const result = apply(state, action);
    state = result.state;
    events.push(...result.events);
    eventCount.push(events.length);
    if (result.events.some((e) => e.type === 'turnStarted')) turnStarts.push(i + 1);
    if ((i + 1) % CHECKPOINT === 0) checkpoints.push(state);
  });
  return { checkpoints, events, eventCount, turnStarts };
}

function stateAt(log: GameLog, timeline: Timeline, step: number): GameState {
  const base = Math.floor(step / CHECKPOINT);
  let state = timeline.checkpoints[base]!;
  for (let i = base * CHECKPOINT; i < step; i++) state = apply(state, log.actions[i]!).state;
  return state;
}

/** Ein beendetes Spiel Schritt für Schritt nachspielen – aus Startzustand und Aktionsliste. */
export function ReplayView({ log, onClose }: { log: GameLog; onClose: () => void }) {
  const { t } = useTranslation();
  const timeline = useMemo(() => buildTimeline(log), [log]);
  const total = log.actions.length;
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(4);
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);

  const state = useMemo(() => stateAt(log, timeline, step), [log, timeline, step]);
  const events = useMemo(
    () => timeline.events.slice(0, timeline.eventCount[step]),
    [timeline, step],
  );

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(
      () =>
        setStep((s) => {
          if (s >= total) {
            setPlaying(false);
            return s;
          }
          return s + 1;
        }),
      600 / speed,
    );
    return () => window.clearInterval(id);
  }, [playing, speed, total]);

  const nextTurn = timeline.turnStarts.find((k) => k > step) ?? total;
  const previousTurn = [...timeline.turnStarts].reverse().find((k) => k < step) ?? 0;

  return (
    <main className="game replay">
      <div className="board-wrap">
        <Board
          state={state}
          events={events}
          selectedTileId={selectedTileId}
          onSelectTile={setSelectedTileId}
        />
      </div>
      <aside className="sidebar">
        <section className="panel replay-panel">
          <div className="panel-header">
            <h2>{t('replay.heading')}</h2>
            <button type="button" className="link" onClick={onClose}>
              {t('replay.close')}
            </button>
          </div>
          <p className="muted small">{t('replay.position', { step, total, round: state.round })}</p>
          <input
            type="range"
            aria-label={t('replay.slider')}
            min={0}
            max={total}
            value={step}
            onChange={(e) => {
              setPlaying(false);
              setStep(Number(e.target.value));
            }}
          />
          <div className="action-buttons">
            <button type="button" onClick={() => setStep(0)} title={t('replay.start')}>
              ⏮
            </button>
            <button
              type="button"
              onClick={() => setStep(previousTurn)}
              title={t('replay.prevTurn')}
            >
              ⏪
            </button>
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              title={t('replay.back')}
            >
              ◀
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => {
                if (step >= total) setStep(0);
                setPlaying((p) => !p);
              }}
            >
              {playing ? t('replay.pause') : t('replay.play')}
            </button>
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(total, s + 1))}
              title={t('replay.forward')}
            >
              ▶
            </button>
            <button type="button" onClick={() => setStep(nextTurn)} title={t('replay.nextTurn')}>
              ⏩
            </button>
            <button type="button" onClick={() => setStep(total)} title={t('replay.end')}>
              ⏭
            </button>
          </div>
          <label className="field">
            {t('replay.speed')}
            <select
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value) as (typeof SPEEDS)[number])}
            >
              {SPEEDS.map((s) => (
                <option key={s} value={s}>
                  {s}×
                </option>
              ))}
            </select>
          </label>
        </section>
        <PlayerList
          state={state}
          selectedTileId={selectedTileId}
          onSelectTile={setSelectedTileId}
        />
        <EventLog state={state} events={events} />
      </aside>
    </main>
  );
}
