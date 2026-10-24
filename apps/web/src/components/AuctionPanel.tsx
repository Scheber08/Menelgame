import { remainingBidders, type Action, type GameState, type Player } from '@menelgame/engine';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatMoney, playerName, tileName } from '../game/format';
import { Countdown } from './Countdown';

interface AuctionPanelProps {
  state: GameState;
  /** Spieler, für die dieser Bildschirm bieten darf. */
  controls: string[];
  dispatch: (action: Action) => void;
  /** Ende der Auktion (lokale Uhr). */
  deadline: number | null;
  /** Hot-Seat: Zuschlag per Knopf möglich. */
  onClose?: () => void;
}

const STEPS = [1, 10, 50, 100];

export function AuctionPanel({ state, controls, dispatch, deadline, onClose }: AuctionPanelProps) {
  const { t } = useTranslation();
  const auction = state.auction;
  if (!auction) return null;
  const tile = state.pack.tiles.find((x) => x.id === auction.tileId);
  const price = tile && 'price' in tile ? tile.price : 0;
  const bidders = remainingBidders(state).filter((p) => controls.includes(p.id));

  return (
    <section className="panel auction-panel" aria-live="polite">
      <div className="panel-header">
        <h2>{t('auction.heading', { tile: tileName(state, auction.tileId) })}</h2>
        {deadline && <Countdown at={deadline} />}
      </div>
      <p className="muted small">{t('auction.listPrice', { price: formatMoney(t, price) })}</p>
      <p className="auction-high">
        {auction.highestBidder
          ? t('auction.highest', {
              amount: formatMoney(t, auction.highestBid),
              player: playerName(state, auction.highestBidder),
            })
          : t('auction.noBids')}
      </p>
      {auction.queue.length > 0 && (
        <p className="muted small">{t('auction.queue', { count: auction.queue.length })}</p>
      )}
      {bidders.map((p) => (
        <BidderRow
          key={p.id}
          player={p}
          showName={controls.length > 1}
          highestBid={auction.highestBid}
          isHighest={auction.highestBidder === p.id}
          dispatch={dispatch}
        />
      ))}
      {controls.length > 0 && bidders.length === 0 && (
        <p className="muted small">{t('auction.out')}</p>
      )}
      {onClose && (
        <button type="button" className="link" onClick={onClose}>
          {t('auction.close')}
        </button>
      )}
    </section>
  );
}

function BidderRow({
  player,
  showName,
  highestBid,
  isHighest,
  dispatch,
}: {
  player: Player;
  showName: boolean;
  highestBid: number;
  isHighest: boolean;
  dispatch: (action: Action) => void;
}) {
  const { t } = useTranslation();
  const [custom, setCustom] = useState('');
  const bid = (amount: number) => dispatch({ type: 'AUCTION_BID', playerId: player.id, amount });
  const customAmount = Number.parseInt(custom, 10);

  return (
    <div className="bidder">
      {showName && (
        <div className="bidder-name">
          <span className="dot" style={{ background: player.color }} />
          {player.name} · {formatMoney(t, player.cash)}
        </div>
      )}
      <div className="action-buttons">
        {STEPS.map((step) => {
          const amount = highestBid + step;
          return (
            <button
              key={step}
              type="button"
              disabled={amount > player.cash}
              onClick={() => bid(amount)}
            >
              {formatMoney(t, amount)}
            </button>
          );
        })}
        <form
          className="custom-bid"
          onSubmit={(e) => {
            e.preventDefault();
            if (customAmount > highestBid) bid(customAmount);
            setCustom('');
          }}
        >
          <input
            inputMode="numeric"
            placeholder={t('auction.custom')}
            aria-label={t('auction.custom')}
            value={custom}
            onChange={(e) => setCustom(e.target.value.replace(/\D/g, ''))}
          />
          <button
            type="submit"
            disabled={!(customAmount > highestBid && customAmount <= player.cash)}
          >
            {t('auction.bid')}
          </button>
        </form>
        <button
          type="button"
          className="danger"
          disabled={isHighest}
          onClick={() => dispatch({ type: 'AUCTION_PASS', playerId: player.id })}
        >
          {t('auction.pass')}
        </button>
      </div>
    </div>
  );
}
