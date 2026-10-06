import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameView } from '../engine/engine';
import type { Action } from '../engine/types';
import { pref, setPref } from './decks';

export interface LobbyInfo {
  code: string;
  seat: number;
  players: ({ name: string; deckSize: number; connected: boolean } | null)[];
}

export interface Net {
  connected: boolean;
  code: string | null;
  seat: number | null;
  lobby: LobbyInfo | null;
  view: GameView | null;
  errors: { id: number; text: string }[];
  create: (name: string, deck: string, format?: string) => void;
  join: (code: string, name: string, deck: string) => void;
  createAI: (name: string, deck: string, aiDeck: string, format?: string) => void;
  act: (a: Action) => void;
  rematch: () => void;
  leave: () => void;
  dismiss: (id: number) => void;
}

function wsUrl() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const override = (import.meta as any).env?.VITE_SERVER_URL as string | undefined;
  if (override) return override.replace(/^http/, 'ws').replace(/\/$/, '') + '/ws';
  return `${proto}://${location.host}/ws`;
}

export function useNet(): Net {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [seat, setSeat] = useState<number | null>(null);
  const [lobby, setLobby] = useState<LobbyInfo | null>(null);
  const [view, setView] = useState<GameView | null>(null);
  const [errors, setErrors] = useState<{ id: number; text: string }[]>([]);
  const queue = useRef<any[]>([]);
  const errId = useRef(1);

  const pushErr = (text: string) => {
    const id = errId.current++;
    setErrors((e) => [...e.slice(-3), { id, text }]);
    setTimeout(() => setErrors((e) => e.filter((x) => x.id !== id)), 5000);
  };

  const send = useCallback((m: any) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
    else queue.current.push(m);
  }, []);

  useEffect(() => {
    let closed = false;
    let retry: any;
    const connect = () => {
      const ws = new WebSocket(wsUrl());
      wsRef.current = ws;
      ws.onopen = () => {
        setConnected(true);
        const saved = pref('seat');
        if (saved) {
          try {
            const { code, token } = JSON.parse(saved);
            ws.send(JSON.stringify({ t: 'rejoin', code, token }));
          } catch {
            /* ignore */
          }
        }
        for (const m of queue.current.splice(0)) ws.send(JSON.stringify(m));
      };
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        switch (msg.t) {
          case 'joined':
            setCode(msg.code);
            setSeat(msg.seat);
            setPref('seat', JSON.stringify({ code: msg.code, token: msg.token }));
            break;
          case 'lobby':
            setLobby({ code: msg.code, seat: msg.seat, players: msg.players });
            setView(null);
            break;
          case 'state':
            setView(msg.view);
            break;
          case 'error':
            if (msg.message === 'Room not found' || msg.message === 'Seat not found') setPref('seat', '');
            pushErr(msg.message);
            break;
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (!closed) retry = setTimeout(connect, 1500);
      };
    };
    connect();
    const ping = setInterval(() => send({ t: 'ping' }), 25000);
    return () => {
      closed = true;
      clearTimeout(retry);
      clearInterval(ping);
      wsRef.current?.close();
    };
  }, [send]);

  return {
    connected,
    code,
    seat,
    lobby,
    view,
    errors,
    create: (name, deck, format) => send({ t: 'create', name, deck, format }),
    join: (c, name, deck) => send({ t: 'join', code: c, name, deck }),
    createAI: (name, deck, aiDeck, format) => send({ t: 'createAI', name, deck, aiDeck, format }),
    act: (action) => send({ t: 'action', action }),
    rematch: () => send({ t: 'rematch' }),
    leave: () => {
      send({ t: 'leave' });
      setPref('seat', '');
      setCode(null);
      setSeat(null);
      setLobby(null);
      setView(null);
    },
    dismiss: (id) => setErrors((e) => e.filter((x) => x.id !== id)),
  };
}
