import {
  activePlayers,
  groupTiles,
  ownedTiles,
  type Action,
  type GameState,
  type TradeBundle,
  type TradeOffer,
} from '@menelgame/engine';
import type { TFunction } from 'i18next';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { formatMoney, playerName, tileName } from '../game/format';

interface TradePanelProps {
  state: GameState;
  /** Spieler, für die dieser Bildschirm handeln darf. */
  controls: string[];
  dispatch: (action: Action) => void;
}

const EMPTY: TradeBundle = { cash: 0, tiles: [], jailFreeCards: 0 };

interface Draft {
  from: string;
  to: string;
  give: TradeBundle;
  receive: TradeBundle;
  /** Gegenangebot zu diesem Angebot. */
  counterTo: string | null;
}

/** Felder, die sich handeln lassen: eigene Felder ohne Gebäude in der Gruppe. */
function tradableTiles(state: GameState, playerId: string) {
  return ownedTiles(state, playerId).filter(
    (tile) =>
      tile.type !== 'property' ||
      groupTiles(state, tile.group).every((t) => (state.tiles[t.id]?.buildings ?? 0) === 0),
  );
}

function describe(t: TFunction, state: GameState, bundle: TradeBundle): string {
  const parts = [
    ...bundle.tiles.map((id) => tileName(state, id)),
    ...(bundle.cash > 0 ? [formatMoney(t, bundle.cash)] : []),
    ...(bundle.jailFreeCards > 0 ? [t('trade.cards', { count: bundle.jailFreeCards })] : []),
  ];
  return parts.length > 0 ? parts.join(', ') : t('trade.nothing');
}

export function TradePanel({ state, controls, dispatch }: TradePanelProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Draft | null>(null);
  const tradingOpen = !['auction', 'gameOver'].includes(state.phase.name);
  const active = activePlayers(state);
  const proposers = active.filter((p) => controls.includes(p.id));
  if (proposers.length === 0 && state.trades.length === 0) return null;

  const startDraft = () => {
    const from = proposers[0]!.id;
    const to = active.find((p) => p.id !== from)?.id ?? '';
    setDraft({ from, to, give: EMPTY, receive: EMPTY, counterTo: null });
  };

  const counter = (offer: TradeOffer) =>
    setDraft({
      from: offer.to,
      to: offer.from,
      give: offer.receive,
      receive: offer.give,
      counterTo: offer.id,
    });

  return (
    <section className="panel trade-panel">
      <div className="panel-header">
        <h2>{t('trade.heading')}</h2>
        {tradingOpen && proposers.length > 0 && !draft && active.length > 1 && (
          <button type="button" onClick={startDraft}>
            {t('trade.new')}
          </button>
        )}
      </div>

      {state.trades.length === 0 && !draft && <p className="muted small">{t('trade.none')}</p>}
      <ul className="offers">
        {state.trades.map((offer) => (
          <li key={offer.id} className="offer">
            <div className="offer-title">
              {t('trade.offerTitle', {
                from: playerName(state, offer.from),
                to: playerName(state, offer.to),
              })}
              {offer.counterTo && <span className="badge">{t('trade.counter')}</span>}
            </div>
            <div className="offer-terms">
              <div>
                <span className="muted">
                  {t('trade.gives', { name: playerName(state, offer.from) })}
                </span>{' '}
                {describe(t, state, offer.give)}
              </div>
              <div>
                <span className="muted">
                  {t('trade.gets', { name: playerName(state, offer.from) })}
                </span>{' '}
                {describe(t, state, offer.receive)}
              </div>
            </div>
            {tradingOpen && (
              <div className="action-buttons">
                {controls.includes(offer.to) && (
                  <>
                    <button
                      type="button"
                      className="primary"
                      onClick={() =>
                        dispatch({ type: 'ACCEPT_TRADE', playerId: offer.to, tradeId: offer.id })
                      }
                    >
                      {t('trade.accept')}
                    </button>
                    <button type="button" onClick={() => counter(offer)}>
                      {t('trade.counterAction')}
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() =>
                        dispatch({ type: 'REJECT_TRADE', playerId: offer.to, tradeId: offer.id })
                      }
                    >
                      {t('trade.reject')}
                    </button>
                  </>
                )}
                {controls.includes(offer.from) && (
                  <button
                    type="button"
                    className="link"
                    onClick={() =>
                      dispatch({ type: 'CANCEL_TRADE', playerId: offer.from, tradeId: offer.id })
                    }
                  >
                    {t('trade.cancel')}
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {draft && tradingOpen && (
        <TradeForm
          state={state}
          draft={draft}
          proposers={proposers.map((p) => p.id)}
          onChange={setDraft}
          onCancel={() => setDraft(null)}
          onSubmit={(d) => {
            dispatch(
              d.counterTo
                ? {
                    type: 'COUNTER_TRADE',
                    playerId: d.from,
                    tradeId: d.counterTo,
                    give: d.give,
                    receive: d.receive,
                  }
                : {
                    type: 'PROPOSE_TRADE',
                    playerId: d.from,
                    to: d.to,
                    give: d.give,
                    receive: d.receive,
                  },
            );
            setDraft(null);
          }}
        />
      )}
    </section>
  );
}

interface TradeFormProps {
  state: GameState;
  draft: Draft;
  proposers: string[];
  onChange: (draft: Draft) => void;
  onCancel: () => void;
  onSubmit: (draft: Draft) => void;
}

function TradeForm({ state, draft, proposers, onChange, onCancel, onSubmit }: TradeFormProps) {
  const { t } = useTranslation();
  const others = activePlayers(state).filter((p) => p.id !== draft.from);
  const fixed = draft.counterTo !== null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(draft);
  };

  return (
    <form className="trade-form" onSubmit={submit}>
      <div className="trade-parties">
        <label>
          {t('trade.from')}
          <select
            value={draft.from}
            disabled={fixed || proposers.length < 2}
            onChange={(e) =>
              onChange({
                ...draft,
                from: e.target.value,
                to: draft.to === e.target.value ? '' : draft.to,
                give: EMPTY,
              })
            }
          >
            {proposers.map((id) => (
              <option key={id} value={id}>
                {playerName(state, id)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('trade.to')}
          <select
            value={draft.to}
            disabled={fixed}
            onChange={(e) => onChange({ ...draft, to: e.target.value, receive: EMPTY })}
          >
            <option value="" disabled>
              –
            </option>
            {others.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="trade-sides">
        <BundleEditor
          title={t('trade.youGive')}
          state={state}
          owner={draft.from}
          bundle={draft.give}
          onChange={(give) => onChange({ ...draft, give })}
        />
        {draft.to && (
          <BundleEditor
            title={t('trade.youGet')}
            state={state}
            owner={draft.to}
            bundle={draft.receive}
            onChange={(receive) => onChange({ ...draft, receive })}
          />
        )}
      </div>
      <div className="action-buttons">
        <button type="submit" className="primary" disabled={!draft.to}>
          {fixed ? t('trade.sendCounter') : t('trade.send')}
        </button>
        <button type="button" onClick={onCancel}>
          {t('trade.discard')}
        </button>
      </div>
    </form>
  );
}

function BundleEditor({
  title,
  state,
  owner,
  bundle,
  onChange,
}: {
  title: string;
  state: GameState;
  owner: string;
  bundle: TradeBundle;
  onChange: (bundle: TradeBundle) => void;
}) {
  const { t } = useTranslation();
  const player = state.players.find((p) => p.id === owner);
  const tiles = tradableTiles(state, owner);
  const toggle = (id: string) =>
    onChange({
      ...bundle,
      tiles: bundle.tiles.includes(id)
        ? bundle.tiles.filter((x) => x !== id)
        : [...bundle.tiles, id],
    });

  return (
    <fieldset className="bundle">
      <legend>{title}</legend>
      {tiles.length === 0 && <p className="muted small">{t('trade.noTiles')}</p>}
      <div className="bundle-tiles">
        {tiles.map((tile) => (
          <label key={tile.id} className="check">
            <input
              type="checkbox"
              checked={bundle.tiles.includes(tile.id)}
              onChange={() => toggle(tile.id)}
            />
            {tile.name}
            {state.tiles[tile.id]?.mortgaged && (
              <span className="badge">{t('tile.mortgaged')}</span>
            )}
          </label>
        ))}
      </div>
      <label>
        {t('trade.cash', { max: formatMoney(t, player?.cash ?? 0) })}
        <input
          type="number"
          min={0}
          max={player?.cash ?? 0}
          step={10}
          value={bundle.cash}
          onChange={(e) =>
            onChange({ ...bundle, cash: Math.max(0, Math.floor(Number(e.target.value) || 0)) })
          }
        />
      </label>
      {(player?.jailFreeCards.length ?? 0) > 0 && (
        <label>
          {t('trade.jailCards')}
          <input
            type="number"
            min={0}
            max={player?.jailFreeCards.length ?? 0}
            value={bundle.jailFreeCards}
            onChange={(e) =>
              onChange({
                ...bundle,
                jailFreeCards: Math.max(0, Math.floor(Number(e.target.value) || 0)),
              })
            }
          />
        </label>
      )}
    </fieldset>
  );
}
