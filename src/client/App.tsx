import React, { useEffect, useMemo } from 'react';
import { useRoute, navigate } from './router';
import { game, useStore, send } from './store';
import { Lobby } from './Lobby';
import { DeckBuilder } from './DeckBuilder';
import { Shop } from './Shop';
import { Treasury } from './Treasury';
import { DraftPage } from './Draft';
import { Assets } from './Assets';
import { Game } from './Game';
import { Toasts } from './Toasts';

const TITLES: Record<string, string> = {
  '/': 'PlayMTG Online: Play MTG Online Free (Commander, Draft & Ranked)',
  '/decks': 'MTG Deck Builder: Every Card, Import & Export | PlayMTG Online',
  '/draft': 'MTG Draft Online: Draft Night | PlayMTG Online',
  '/shop': 'Arcana Shop: Sleeves, Playmats & Card Backs | PlayMTG Online',
  '/treasury': 'Treasury | PlayMTG Online',
  '/table': 'At the table | PlayMTG Online',
  '/assets': 'Assets | PlayMTG Online',
};

export function App() {
  const { path } = useRoute();
  const view = useStore((s) => s.view);
  const lobby = useStore((s) => s.lobby);
  const draft = useStore((s) => s.draft);
  const meta = useStore((s) => s.meta);
  const spectating = useStore((s) => s.spectating);
  // spectators get a neutral view (no seat): show it from seat 0's side, with no actions
  const shown = useMemo(() => (view && spectating ? ({ ...view, you: 0 } as any) : view), [view, spectating]);

  // a running game takes you to the table; leaving it brings you back
  useEffect(() => {
    if (view && path !== '/table') navigate('/table');
  }, [!!view]);
  useEffect(() => {
    document.title = TITLES[path] ?? TITLES['/'];
  }, [path]);
  useEffect(() => {
    const a = path === '/decks' ? 'decks' : path === '/shop' || path === '/treasury' ? 'shop' : path === '/draft' ? 'draft' : path === '/table' ? 'game' : 'lobby';
    send({ t: 'activity', a });
  }, [path]);

  let body: React.ReactNode;
  if (path === '/table') {
    body = view ? (
      <Game
        view={shown!}
        act={spectating ? () => {} : game.act}
        meta={meta}
        spectating={spectating}
        onLeave={() => {
          game.leave();
          navigate(draft || meta?.mode === 'draft' ? '/draft' : '/');
        }}
        onRematch={game.rematch}
      />
    ) : (
      <WaitingTable code={lobby?.code ?? null} />
    );
  } else if (path === '/decks') body = <DeckBuilder />;
  else if (path === '/shop') body = <Shop />;
  else if (path === '/treasury') body = <Treasury />;
  else if (path === '/draft') body = <DraftPage />;
  else if (path === '/assets') body = <Assets />;
  else body = <Lobby />;
  return (
    <>
      {body}
      <Offline />
      {path !== '/' && <Toasts />}
    </>
  );
}

function WaitingTable({ code }: { code: string | null }) {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'radial-gradient(1400px 900px at 50% 50%,#141c24 0%,#0b1015 70%,#07090c 100%)', color: '#e7ebf1', fontFamily: 'Manrope,system-ui,sans-serif' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, textAlign: 'center' }}>
        <mf-loader size="52"></mf-loader>
        <span style={{ fontFamily: 'Cinzel,serif', fontSize: 22, fontWeight: 700, color: '#f7dc9a' }}>{code ? `Room ${code}` : 'Setting up the table…'}</span>
        <span style={{ fontSize: 14, color: '#8d98a8' }}>{code ? 'Waiting for your opponent to sit down.' : 'If nothing happens, go back to the lobby.'}</span>
        <button
          onClick={() => {
            game.leave();
            navigate('/');
          }}
          style={{ height: 40, padding: '0 22px', border: '1px solid rgba(255,255,255,.18)', background: 'transparent', color: '#c8d0dc', borderRadius: 2, cursor: 'pointer', fontFamily: 'Cinzel,serif', fontWeight: 700, letterSpacing: '.16em' }}
        >
          BACK TO LOBBY
        </button>
      </div>
    </div>
  );
}

/** Shown when the game server can't be reached for a few seconds (the PC is off, or the tunnel is down). */
function Offline() {
  const connected = useStore((s) => s.connected);
  const [show, setShow] = React.useState(false);
  useEffect(() => {
    if (connected) return setShow(false);
    const t = setTimeout(() => setShow(true), 3500);
    return () => clearTimeout(t);
  }, [connected]);
  if (!show) return null;
  return (
    <div role="status" style={{ position: 'fixed', left: '50%', bottom: 18, transform: 'translateX(-50%)', zIndex: 300, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px', borderRadius: 999, background: 'rgba(40,14,10,.95)', boxShadow: '0 0 0 1px rgba(224,105,79,.5),0 10px 30px rgba(0,0,0,.6)', color: '#ffc9b8', fontFamily: 'Manrope,system-ui,sans-serif', fontSize: 13, fontWeight: 700 }}>
      <mf-loader size="18"></mf-loader>
      Can’t reach the game server. Reconnecting…
    </div>
  );
}
