import { useEffect, useCallback, useRef, useState } from 'react';

const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL || 'http://localhost:3001';

export interface GameState {
  roomCode: string;
  gameType: string;
  players: Array<{
    id: string;
    username: string;
    isCurrentPlayer: boolean;
  }>;
  tableCards: string[];
  handCards: string[];
  status: 'waiting' | 'playing' | 'finished';
  currentTurn?: string;
  winner?: string;
}

export interface GameAction {
  playerId: string;
  type: string;
  payload: Record<string, unknown>;
}

export function useGameSocket(
  roomCode: string,
  gameType: string,
  authToken: string | null
) {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectCountRef = useRef(0);
  const maxReconnects = 5;

  useEffect(() => {
    // Don't connect if no room code or no auth token
    if (!roomCode || !authToken) return;

    const connectSocket = () => {
      if (reconnectCountRef.current >= maxReconnects) {
        setError('Max reconnection attempts reached');
        return;
      }

      try {
        const protocol = SOCKET_URL.startsWith('https') ? 'wss' : 'ws';
        const host = SOCKET_URL.replace(/^https?:\/\//, '');
        const wsUrl = `${protocol}://${host}/socket.io/?EIO=4&transport=websocket`;

        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.log('Game socket connected to room:', roomCode);
          setIsConnected(true);
          setError(null);
          reconnectCountRef.current = 0;

          // Engine.IO expects a probe, wait for server handshake first
        };

        ws.onmessage = (event) => {
          const raw = event.data;

          // Engine.IO protocol: messages start with a digit
          // 0 = open, 2 = ping, 3 = pong, 4 = message
          if (typeof raw === 'string') {
            // Engine.IO open packet
            if (raw.startsWith('0')) {
              try {
                const handshake = JSON.parse(raw.slice(1));
                console.log('Engine.IO handshake, sid:', handshake.sid);
              } catch {}
              // Send Socket.IO connect packet for default namespace
              ws.send('40');
              return;
            }

            // Engine.IO ping — respond with pong
            if (raw === '2') {
              ws.send('3');
              return;
            }

            // Engine.IO pong
            if (raw === '3') return;

            // Socket.IO connect ack
            if (raw.startsWith('40')) {
              console.log('Socket.IO connected to namespace');
              // Now authenticate and join room
              const authPayload = JSON.stringify([
                'auth',
                { token: authToken, roomCode, gameType },
              ]);
              ws.send('42' + authPayload);
              return;
            }

            // Socket.IO message (event)
            if (raw.startsWith('42')) {
              try {
                const payload = JSON.parse(raw.slice(2));
                if (Array.isArray(payload) && payload.length >= 2) {
                  handleSocketMessage({ type: payload[0], payload: payload[1] });
                }
              } catch (e) {
                console.error('Failed to parse socket.io message:', e);
              }
              return;
            }

            // Socket.IO error
            if (raw.startsWith('44')) {
              console.error('Socket.IO error:', raw.slice(2));
              setError('Server error');
              return;
            }
          }
        };

        ws.onerror = (event: any) => {
          console.error('Game socket error:', event.message || event);
          setError('Connection error');
          setIsConnected(false);
        };

        ws.onclose = (event) => {
          console.log('Game socket disconnected, code:', event.code);
          setIsConnected(false);

          // Only reconnect if we haven't exceeded max attempts
          if (reconnectCountRef.current < maxReconnects) {
            reconnectCountRef.current++;
            const delay = Math.min(3000 * reconnectCountRef.current, 15000);
            reconnectTimeoutRef.current = setTimeout(() => {
              console.log(`Reconnecting (attempt ${reconnectCountRef.current})...`);
              connectSocket();
            }, delay);
          }
        };

        socketRef.current = ws;
      } catch (e) {
        console.error('Failed to create socket:', e);
        setError('Failed to connect');
      }
    };

    connectSocket();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (socketRef.current) {
        socketRef.current.close(1000, 'Component unmounted');
        socketRef.current = null;
      }
    };
  }, [roomCode, gameType, authToken]);

  const handleSocketMessage = useCallback((message: any) => {
    const { type, payload } = message;

    switch (type) {
      case 'game:state':
        setGameState(payload);
        break;

      case 'game:action':
        console.log('Game action:', payload);
        break;

      case 'game:started':
        setGameState((prev) =>
          prev ? { ...prev, status: 'playing' } : null
        );
        break;

      case 'game:ended':
        setGameState((prev) =>
          prev ? { ...prev, status: 'finished', winner: payload.winner } : null
        );
        break;

      case 'error':
        console.error('Game error:', payload.message);
        setError(payload.message);
        break;

      default:
        console.log('Socket event:', type, payload);
    }
  }, []);

  const sendAction = useCallback(
    (action: Omit<GameAction, 'playerId'>) => {
      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        console.error('Socket not connected');
        return;
      }

      const message = JSON.stringify([
        'game:action',
        action,
      ]);
      socketRef.current.send('42' + message);
    },
    []
  );

  return {
    gameState,
    isConnected,
    error,
    sendAction,
  };
}
