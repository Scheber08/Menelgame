import { isPlayerAction, type Action, type GameEvent, type GameState } from '@menelgame/engine';
import {
  roomSocketPath,
  type ActionInput,
  type ClientMessage,
  type RoomView,
  type ServerMessage,
} from '@menelgame/protocol';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { UiError } from '../components/ActionBar';

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting';

const MAX_EVENTS = 500;
const PING_MS = 25_000;

const tokenKey = (code: string) => `menelgame.room.${code}`;

function loadToken(code: string): string | undefined {
  try {
    return localStorage.getItem(tokenKey(code)) ?? undefined;
  } catch {
    return undefined;
  }
}

function storeToken(code: string, token: string | null): void {
  try {
    if (token) localStorage.setItem(tokenKey(code), token);
    else localStorage.removeItem(tokenKey(code));
  } catch {
    // Ohne Speicher klappt nur der Reconnect nach einem Neuladen nicht.
  }
}

export interface OnlineRoom {
  status: ConnectionStatus;
  room: RoomView | null;
  seatId: string | null;
  game: { state: GameState; events: GameEvent[] } | null;
  error: UiError | null;
  /** Serverzeit minus lokale Zeit in ms. */
  clockOffset: number;
  send: (message: ClientMessage) => void;
  /** Spielaktion schicken; der Server setzt den Spieler ein. */
  act: (action: Action) => void;
  clearError: () => void;
}

/**
 * WebSocket-Verbindung zu einem Spielraum mit automatischem Reconnect. Das geheime Token des
 * eigenen Platzes liegt im localStorage; damit holt sich der Browser denselben Platz zurück.
 */
export function useOnlineRoom(code: string): OnlineRoom {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [room, setRoom] = useState<RoomView | null>(null);
  const [seatId, setSeatId] = useState<string | null>(null);
  const [game, setGame] = useState<OnlineRoom['game']>(null);
  const [error, setError] = useState<UiError | null>(null);
  const [clockOffset, setClockOffset] = useState(0);
  const socket = useRef<WebSocket | null>(null);

  useEffect(() => {
    let closed = false;
    let attempt = 0;
    let retry: number | undefined;
    let ping: number | undefined;

    const handle = (message: ServerMessage) => {
      switch (message.t) {
        case 'welcome':
          setSeatId(message.seatId);
          if (message.token) storeToken(code, message.token);
          setRoom(message.room);
          setClockOffset(message.room.serverTime - Date.now());
          return;
        case 'room':
          setRoom(message.room);
          setClockOffset(message.room.serverTime - Date.now());
          return;
        case 'game':
          setGame((current) => ({
            state: message.state,
            events: message.reset
              ? message.events
              : [...(current?.events ?? []), ...message.events].slice(-MAX_EVENTS),
          }));
          setError(null);
          return;
        case 'error':
          if (message.code === 'kicked') {
            storeToken(code, null);
            setSeatId(null);
          }
          setError({
            code: message.engineCode ?? message.code,
            ...(message.message !== undefined && { message: message.message }),
          });
          return;
        case 'pong':
          return;
      }
    };

    const connect = () => {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${location.host}${roomSocketPath(code)}`);
      socket.current = ws;
      ws.onopen = () => {
        attempt = 0;
        setStatus('open');
        const token = loadToken(code);
        ws.send(JSON.stringify({ t: 'hello', ...(token && { token }) } satisfies ClientMessage));
        ping = window.setInterval(() => ws.send('{"t":"ping"}'), PING_MS);
      };
      ws.onmessage = (event) => {
        try {
          handle(JSON.parse(String(event.data)) as ServerMessage);
        } catch {
          // Unlesbare Nachricht ignorieren.
        }
      };
      ws.onclose = () => {
        window.clearInterval(ping);
        if (closed) return;
        setStatus('reconnecting');
        const delay = Math.min(10_000, 500 * 2 ** attempt++);
        retry = window.setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      closed = true;
      window.clearTimeout(retry);
      window.clearInterval(ping);
      socket.current?.close();
    };
  }, [code]);

  const send = useCallback((message: ClientMessage) => {
    const ws = socket.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
  }, []);

  const act = useCallback(
    (action: Action) => {
      if (!isPlayerAction(action)) return;
      const { playerId, ...input } = action;
      send({ t: 'action', action: input as ActionInput });
    },
    [send],
  );

  return {
    status,
    room,
    seatId,
    game,
    error,
    clockOffset,
    send,
    act,
    clearError: () => setError(null),
  };
}
