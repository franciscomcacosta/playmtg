// One WebSocket for everything (account, social, matchmaking, draft and the game table) and a tiny global store that
// any component can read with useStore(). Requests carry a rid and resolve when the server answers.
import { useSyncExternalStore } from 'react';
import type { GameView } from '../engine/engine';
import type { Action } from '../engine/types';

export interface Fx { kind: 'gold' | 'embers' | 'xp' | 'toast' | 'item' | 'level'; amt?: number; text?: string; id?: string; level?: number; reward?: string }
export interface Me {
  id: string; name: string; gold: number; embers: number; xp: number; xpPerLevel: number; level: number;
  season: { name: string; end: number; track: { level: number; reward: string; owned: boolean }[] };
  owned: string[]; equipped: Record<string, string>; rank: { tier: string; division: number; pips: number; mythic?: number; name: string };
  login: { count: number; claimedToday: boolean; track: string[] };
  quests: { id: string; title: string; goal: number; prog: number; gold: number; claimed: boolean }[];
  questSwapUsed: boolean; dailyWins: number; dailyWinRewards: { cur: string; amt: number }[]; draftPaid: boolean; collectionSize: number; stats: { games: number; wins: number };
}
export interface DeckData { main: Record<string, number>; side: Record<string, number>; commander: string | null; link: { site: string; url: string; text: string } | null }
export interface DeckSummary { id: string; name: string; format: 'standard' | 'commander'; face: string | null; faceArt: string | null; colors: string[]; cards: number; valid: boolean; why: string | null; updated: string; data: DeckData; local?: boolean }
export interface Note { id: string; kind: string; data: any; seen: boolean; created_at: string }
export interface Friend { id: string; name: string; art: string | null; st: 'game' | 'online' | 'away' | 'off'; txt: string; code?: string; pending?: 'in' | 'out' }
export interface Found { code?: string; seat?: number; token?: string; mode: string; kicker: string; title?: string; draft?: string; you: { name: string; sub: string; art: string | null }; opps: { name: string; sub: string; art: string | null; bot?: boolean }[]; at: number }
export interface SeatMeta { name: string; deckSize: number; connected: boolean; bot: boolean; cosmetics: any; sub: string | null }
export interface Toast { id: number; text: string; err?: boolean }

export interface State {
  connected: boolean;
  auth: 'dev' | 'supabase' | null;
  authReady: boolean;
  me: Me | null;
  guest: boolean;
  notes: Note[];
  friends: Friend[];
  decks: DeckSummary[] | null;
  queue: { mode: string; since: number; ranked?: boolean; seats?: { name: string }[] } | null;
  found: Found | null;
  draft: any | null;
  room: { code: string; seat: number; mode: string | null } | null;
  lobby: { code: string; seat: number; players: any[] } | null;
  view: GameView | null;
  meta: { mode: string | null; ranked: boolean; seats: SeatMeta[]; draft: any } | null;
  spectating: boolean;
  toasts: Toast[];
  fx: Fx[]; // currency/xp effects waiting to be animated
  inGame: { code: string; token: string; mode: string } | null; // a running game found on sign-in
}

let state: State = {
  connected: false, auth: null, authReady: false, me: null, guest: true, notes: [], friends: [], decks: null, queue: null, found: null, draft: null,
  room: null, lobby: null, view: null, meta: null, spectating: false, toasts: [], fx: [], inGame: null,
};
const subs = new Set<() => void>();
export const getState = () => state;
export function setState(p: Partial<State> | ((s: State) => Partial<State>)) {
  state = { ...state, ...(typeof p === 'function' ? p(state) : p) };
  for (const f of subs) f();
}
export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => sel(state),
  );
}

// ---------------------------------------------------------------------------------------------- server address
export function serverBase(): string {
  const o = (import.meta as any).env?.VITE_SERVER_URL as string | undefined;
  // the published site talks to the game server's public address; opened from the PC itself, it uses this server
  if (!o || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return '';
  const base = o.replace(/\/$/, '');
  return new URL(base).host === location.host ? '' : base;
}
export function api(path: string, init?: RequestInit) {
  return fetch(serverBase() + path, init);
}
function wsUrl() {
  const o = serverBase();
  if (o) return o.replace(/^http/, 'ws') + '/ws';
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
}

// ---------------------------------------------------------------------------------------------- toasts
let toastId = 1;
export function toast(text: string, err = false) {
  const id = toastId++;
  setState((s) => ({ toasts: [...s.toasts.slice(-2), { id, text, err }] }));
  setTimeout(() => setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3600);
}

// ---------------------------------------------------------------------------------------------- socket
let ws: WebSocket | null = null;
const outbox: any[] = [];
let rid = 1;
const pending = new Map<number, { ok: (m: any) => void; fail: (e: Error) => void }>();
let helloMsg: any = { t: 'hello' };
const pref = (k: string) => {
  try {
    return localStorage.getItem('manaforge.' + k);
  } catch {
    return null;
  }
};
const setPref = (k: string, v: string | null) => {
  try {
    if (v == null) localStorage.removeItem('manaforge.' + k);
    else localStorage.setItem('manaforge.' + k, v);
  } catch {}
};

export function send(m: any) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
  else outbox.push(m);
}
/** Send a message and wait for the server's ok / error. Errors are shown as a toast unless quiet. */
export function request<T = any>(m: any, quiet = false): Promise<T> {
  const id = rid++;
  return new Promise<T>((ok, fail) => {
    pending.set(id, { ok, fail });
    send({ ...m, rid: id });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        fail(new Error('The server did not answer.'));
      }
    }, 20000);
  }).catch((e) => {
    if (!quiet) toast(e.message, true);
    throw e;
  });
}

function onMessage(msg: any) {
  const p = msg.rid != null ? pending.get(msg.rid) : undefined;
  if (p) {
    pending.delete(msg.rid);
    if (msg.t === 'error') p.fail(new Error(msg.message));
    else p.ok(msg);
    if (msg.t === 'ok' || msg.t === 'error') return;
  } else if (msg.t === 'error') {
    if (msg.message === 'Room not found' || msg.message === 'Seat not found') setPref('seat', null);
    toast(msg.message, true);
    return;
  }
  switch (msg.t) {
    case 'guest':
      setState({ me: null, guest: true, notes: [], friends: [], decks: null, auth: msg.auth, authReady: true });
      break;
    case 'me': {
      const wasGuest = state.guest;
      setState((s) => ({ me: msg.me, guest: false, authReady: true, fx: msg.fx?.length ? [...s.fx, ...msg.fx] : s.fx }));
      if (wasGuest) import('./localDecks').then((m) => m.migrateToAccount()).catch(() => {});
      for (const f of msg.fx ?? []) {
        if (f.kind === 'toast') toast(f.text);
        if (f.kind === 'level') toast(`Season level ${f.level} · ${f.reward} unlocked`);
      }
      break;
    }
    case 'notes':
      setState({ notes: msg.list });
      break;
    case 'friends':
      setState({ friends: msg.list });
      break;
    case 'decks':
      setState({ decks: msg.list });
      break;
    case 'queue':
      setState({ queue: msg.state });
      break;
    case 'found':
      setState({ found: { ...msg, at: Date.now() }, queue: null });
      break;
    case 'draft':
      setState({ draft: msg.state });
      break;
    case 'draftMatch':
      setState({ found: { code: msg.code, seat: msg.seat, token: msg.token, mode: 'draft', kicker: `DRAFT NIGHT · ROUND ${msg.round}`, title: `Round ${msg.round} vs ${msg.opp}`, you: { name: state.me?.name ?? 'You', sub: 'Draft deck', art: null }, opps: [{ name: msg.opp, sub: 'Drafter', art: null }], at: Date.now() } });
      break;
    case 'inGame':
      setState({ inGame: { code: msg.code, token: msg.token, mode: msg.mode } });
      break;
    case 'toast':
      toast(msg.text);
      break;
    case 'joined':
      setState({ room: { code: msg.code, seat: msg.seat, mode: msg.mode ?? null }, spectating: false, inGame: null });
      setPref('seat', JSON.stringify({ code: msg.code, token: msg.token }));
      break;
    case 'lobby':
      setState({ lobby: { code: msg.code, seat: msg.seat, players: msg.players }, view: null });
      break;
    case 'state':
      setState({ view: msg.view, meta: msg.meta ?? null, spectating: !!msg.spectating, lobby: null });
      break;
    case 'left':
      setState({ room: null, lobby: null, view: null, meta: null, spectating: false });
      break;
  }
}

export function connect() {
  let retry: any;
  const open = () => {
    ws = new WebSocket(wsUrl());
    ws.onopen = () => {
      setState({ connected: true });
      ws!.send(JSON.stringify(helloMsg));
      const saved = pref('seat');
      if (saved) {
        try {
          const { code, token } = JSON.parse(saved);
          ws!.send(JSON.stringify({ t: 'rejoin', code, token }));
        } catch {}
      }
      for (const m of outbox.splice(0)) ws!.send(JSON.stringify(m));
    };
    ws.onmessage = (ev) => onMessage(JSON.parse(ev.data));
    ws.onclose = () => {
      setState({ connected: false });
      for (const [, p] of pending) p.fail(new Error('Connection lost. Reconnecting…'));
      pending.clear();
      retry = setTimeout(open, 1500);
    };
  };
  open();
  setInterval(() => send({ t: 'ping' }), 25000);
  return () => clearTimeout(retry);
}

/** Change who this socket is signed in as (re-sent automatically after reconnects). */
export function hello(m: any) {
  helloMsg = { t: 'hello', ...m };
  return request(helloMsg, true).catch(() => null);
}

// ---------------------------------------------------------------------------------------------- game table
export const game = {
  act: (action: Action) => send({ t: 'action', action }),
  rematch: () => send({ t: 'rematch' }),
  leave: () => {
    send(getState().spectating ? { t: 'spectate.leave' } : { t: 'leave' });
    setPref('seat', null);
    setState({ room: null, lobby: null, view: null, meta: null, spectating: false });
  },
  join: (code: string, token: string) => send({ t: 'rejoin', code, token }),
  create: (name: string, deck: string, format?: string) => send({ t: 'create', name, deck, format }),
  joinCode: (code: string, name: string, deck: string) => send({ t: 'join', code, name, deck }),
  createAI: (name: string, deck: string, aiDeck: string, format?: string) => send({ t: 'createAI', name, deck, aiDeck, format }),
};
