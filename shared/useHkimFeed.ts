/**
 * @file useHkimFeed.ts
 * @description Hook Socket.IO (namespace /hkim) pour le fil d'actualité
 * temps réel des hkim. Implémentation WS brute (protocole Engine.IO),
 * cohérente avec useGameSocket. Auth via le paquet CONNECT de namespace.
 *
 * Émet  : hkim:completed, hkim:comment
 * Reçoit: hkim:feed, hkim:comment
 *
 * Robuste : si le socket échoue, l'écran retombe sur le REST (polling).
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { SOCKET_URL } from './api';

export interface FeedEvent {
  hkimId: string;
  username: string;
  userId: string;
  name: string;
  from: string;
  to: string;
  distanceMeters: number;
  completedAt: string;
}
export interface CommentEvent {
  hkimId: string;
  username: string;
  userId: string;
  text: string;
  createdAt: string;
}

const NS = '/hkim';

export function useHkimFeed(authToken: string | null) {
  const [connected, setConnected] = useState(false);
  const [lastFeed, setLastFeed] = useState<FeedEvent | null>(null);
  const [lastComment, setLastComment] = useState<CommentEvent | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const toRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!authToken) return;

    const connect = () => {
      if (retryRef.current >= 5) return;
      try {
        const proto = SOCKET_URL.startsWith('https') ? 'wss' : 'ws';
        const host = SOCKET_URL.replace(/^https?:\/\//, '');
        const ws = new WebSocket(
          `${proto}://${host}/socket.io/?EIO=4&transport=websocket`,
        );

        ws.onmessage = (e) => {
          const raw = e.data;
          if (typeof raw !== 'string') return;

          // Engine.IO open → connecte le namespace /hkim avec auth
          if (raw.startsWith('0')) {
            ws.send(`40${NS},${JSON.stringify({ token: authToken })}`);
            return;
          }
          if (raw === '2') {
            ws.send('3');
            return;
          }
          // namespace connecté
          if (raw.startsWith(`40${NS}`)) {
            setConnected(true);
            retryRef.current = 0;
            return;
          }
          // événement namespacé : 42/hkim,[event,payload]
          if (raw.startsWith(`42${NS},`)) {
            try {
              const arr = JSON.parse(raw.slice(`42${NS},`.length));
              if (Array.isArray(arr) && arr.length >= 2) {
                if (arr[0] === 'hkim:feed') setLastFeed(arr[1]);
                else if (arr[0] === 'hkim:comment') setLastComment(arr[1]);
              }
            } catch {}
            return;
          }
          // erreur namespace
          if (raw.startsWith(`44${NS}`)) {
            setConnected(false);
          }
        };

        ws.onclose = () => {
          setConnected(false);
          if (retryRef.current < 5) {
            retryRef.current++;
            toRef.current = setTimeout(connect, Math.min(3000 * retryRef.current, 12000));
          }
        };
        ws.onerror = () => setConnected(false);

        wsRef.current = ws;
      } catch {
        setConnected(false);
      }
    };

    connect();
    return () => {
      if (toRef.current) clearTimeout(toRef.current);
      wsRef.current?.close(1000, 'unmount');
      wsRef.current = null;
    };
  }, [authToken]);

  const emit = useCallback((event: string, payload: any) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(`42${NS},${JSON.stringify([event, payload])}`);
    return true;
  }, []);

  const announceCompleted = useCallback(
    (p: { hkimId: string; name: string; from: string; to: string; distanceMeters?: number }) =>
      emit('hkim:completed', p),
    [emit],
  );
  const announceComment = useCallback(
    (p: { hkimId: string; text: string }) => emit('hkim:comment', p),
    [emit],
  );

  return { connected, lastFeed, lastComment, announceCompleted, announceComment };
}
