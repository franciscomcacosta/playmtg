// Draft Night: open boosters (the design's mf-booster), pick one card per pass against the clock, build a 40-card deck
// from your picks plus basic lands, then play three rounds against the pod. All of it runs on the server; this page
// shows the pod's state and sends picks / the deck.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { game, request, setState, toast, useStore } from './store';
import { navigate } from './router';
import { css, cx, pc, fmt, PIP } from './dc';
import { SignIn } from './auth';

interface PCard { id: string; name: string; rarity: 'common' | 'uncommon' | 'rare' | 'mythic'; image: string | null; colors: string[]; cmc: number; type: string }
const RC: Record<string, string> = { common: '#9aa3ae', uncommon: '#c9d6e6', rare: '#e8c46a', mythic: '#f07a3a' };
const BASICS: [string, string][] = [['W', 'Plains'], ['U', 'Island'], ['B', 'Swamp'], ['R', 'Mountain'], ['G', 'Forest']];
const IMG = (c: PCard) => c.image ?? 'https://api.scryfall.com/cards/named?exact=' + encodeURIComponent(c.name).replace(/'/g, '%27') + '&format=image&version=normal';
const ART = (n: string) => 'https://api.scryfall.com/cards/named?exact=' + encodeURIComponent(n).replace(/'/g, '%27') + '&format=image&version=art_crop';
const secs = (t: number, now: number) => Math.max(0, Math.ceil((t - now) / 1000));
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

const BG = 'radial-gradient(1100px 600px at 50% 0%,rgba(90,120,255,.10),rgba(90,120,255,0) 70%),radial-gradient(1500px 1000px at 50% 45%,#141a24 0%,#0b0d11 62%,#040506 100%)';
const H = 'font-family:Cinzel,serif;font-weight:700;color:#f4efe4';
const KICK = 'font-family:Cinzel,serif;font-size:12px;font-weight:700;letter-spacing:.3em;color:#c9a050';

function GoldButton({ onClick, disabled, children, small }: { onClick: () => void; disabled?: boolean; children: React.ReactNode; small?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className={cx('', pc([['hover', 'filter:brightness(1.1)'], ['active', 'transform:scale(.98)']]))} style={css(`padding:2px;border:0;cursor:${disabled ? 'default' : 'pointer'};opacity:${disabled ? 0.45 : 1};background:linear-gradient(180deg,#f7dc9a,#a8742a 50%,#f0c56a);clip-path:polygon(14px 0,calc(100% - 14px) 0,100% 50%,calc(100% - 14px) 100%,14px 100%,0 50%)`)}>
      <span style={css(`display:block;padding:${small ? '10px 26px' : '14px 38px'};background:linear-gradient(180deg,#f5b44b,#b8621a);clip-path:polygon(13px 0,calc(100% - 13px) 0,100% 50%,calc(100% - 13px) 100%,13px 100%,0 50%);font-family:Cinzel,serif;font-size:${small ? 12 : 14}px;font-weight:800;letter-spacing:.14em;color:#1b1206;white-space:nowrap`)}>{children}</span>
    </button>
  );
}
function GhostButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cx('', pc([['hover', 'background:rgba(255,255,255,.1)']]))} style={css('height:40px;padding:0 20px;border:1px solid rgba(255,255,255,.16);border-radius:2px;background:transparent;cursor:pointer;font-family:Cinzel,serif;font-size:12px;font-weight:700;letter-spacing:.16em;color:#c8d0dc')}>
      {children}
    </button>
  );
}

export function DraftPage() {
  const me = useStore((s) => s.me);
  const authReady = useStore((s) => s.authReady);
  const st = useStore((s) => s.draft);
  const queue = useStore((s) => s.queue);
  const found = useStore((s) => s.found);
  const [now, setNow] = useState(Date.now());
  const [signIn, setSignIn] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (me) request({ t: 'draft.state' }, true).catch(() => {});
  }, [!!me]);
  // a round's table is ready: sit down
  useEffect(() => {
    if (found?.mode === 'draft' && found.code && found.token) {
      const t = setTimeout(() => {
        game.join(found.code!, found.token!);
        navigate('/table');
      }, 1800);
      return () => clearTimeout(t);
    }
  }, [found?.code]);

  let body: React.ReactNode;
  if (!authReady) body = <Center><mf-loader size="48"></mf-loader></Center>;
  else if (!me)
    body = (
      <Center>
        <span style={css(KICK)}>DRAFT NIGHT</span>
        <h1 style={css(`${H};margin:0;font-size:48px`)}>Sign in to draft</h1>
        <p style={css('margin:0;max-width:460px;font-size:15px;line-height:1.6;color:#aab3c0')}>Draft Night costs 750 embers once a day. Every card you pick joins your collection.</p>
        <GoldButton onClick={() => setSignIn(true)}>SIGN IN</GoldButton>
      </Center>
    );
  else if (!st) body = <Landing me={me} queue={queue} />;
  else if (st.phase === 'seating') body = <Seating st={st} />;
  else if (st.phase === 'drafting') body = <Drafting st={st} now={now} />;
  else if (st.phase === 'building') body = <Building st={st} now={now} />;
  else body = <Rounds st={st} found={found} />;

  return (
    <div style={css(`min-height:100vh;display:flex;flex-direction:column;color:#e7ebf1;font-family:Manrope,system-ui,sans-serif;background:${BG}`)}>
      <header style={css('display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap;padding:16px 32px;background:linear-gradient(180deg,rgba(16,17,20,.9),rgba(12,13,15,.6))')}>
        <div style={css('display:flex;align-items:center;gap:28px')}>
          <a href="/" style={css('font-family:Cinzel,serif;font-size:19px;font-weight:800;letter-spacing:.34em;color:#f7dc9a')}>PLAYMTG</a>
          <span style={css(KICK)}>DRAFT NIGHT</span>
        </div>
        <div style={css('display:flex;align-items:center;gap:14px')}>
          {me && (
            <span style={css('display:flex;align-items:center;gap:6px;height:34px;padding:0 14px 0 4px;border-radius:17px;background:rgba(5,6,7,.7);box-shadow:inset 0 0 0 1px rgba(224,122,58,.4);font-size:14px;font-weight:800;color:#ffcfae')}>
              <mf-ember size="24"></mf-ember>
              {fmt(me.embers)}
            </span>
          )}
          {st && st.phase !== 'done' ? (
            <GhostButton
              onClick={() => {
                if (st.phase === 'playing' || st.phase === 'building' || st.phase === 'drafting') {
                  if (!(window as any).__mfLeaveDraft) {
                    (window as any).__mfLeaveDraft = 1;
                    toast('Press LEAVE again to forfeit the draft. Your picks stay in your collection.');
                    setTimeout(() => ((window as any).__mfLeaveDraft = 0), 4000);
                    return;
                  }
                }
                request({ t: 'draft.leave' }).then(() => navigate('/')).catch(() => {});
              }}
            >
              LEAVE
            </GhostButton>
          ) : (
            <GhostButton onClick={() => navigate('/')}>LOBBY</GhostButton>
          )}
        </div>
      </header>
      <main style={css('flex:1;display:flex;flex-direction:column;min-height:0')}>{body}</main>
      {signIn && <SignIn onClose={() => setSignIn(false)} />}
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div style={css('flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:40px 24px;text-align:center')}>{children}</div>;
}

function Landing({ me, queue }: { me: any; queue: any }) {
  const inQ = queue?.mode === 'draft';
  return (
    <Center>
      <span style={css(KICK)}>DRAFT NIGHT</span>
      <h1 style={css(`${H};margin:0;font-size:clamp(40px,5vw,64px)`)}>{inQ ? 'Seating the pod…' : 'Crack packs. Build. Battle.'}</h1>
      <p style={css('margin:0;max-width:520px;font-size:15px;line-height:1.6;color:#aab3c0')}>
        Four players, three boosters of 14 cards passed left, right, left. Build 40 cards from your picks plus basic lands, then play three rounds. Every pick joins your collection. Prizes: 300 / 700 / 1,200 embers for 1 / 2 / 3 wins.
      </p>
      {inQ ? (
        <>
          <div style={css('display:flex;gap:14px')}>
            {Array.from({ length: 4 }, (_, i) => (
              <span key={i} style={css(`width:46px;height:46px;border-radius:50%;border:${i < (queue.seats?.length ?? 1) ? '2px solid #5a8ac0' : '1.5px dashed rgba(255,255,255,.25)'};background:${i < (queue.seats?.length ?? 1) ? '#1a212c' : 'transparent'}`)} />
            ))}
          </div>
          <span style={css('font-size:13px;color:#8d98a8')}>Empty seats are filled by bots after a few seconds.</span>
          <GhostButton onClick={() => request({ t: 'queue.leave' }).catch(() => {})}>CANCEL</GhostButton>
        </>
      ) : (
        <GoldButton onClick={() => request({ t: 'queue.join', mode: 'draft' }).catch(() => {})} disabled={!me.draftPaid && me.embers < 750}>
          {me.draftPaid ? 'JOIN DRAFT · PAID TODAY' : 'ENTER · 750 EMBERS'}
        </GoldButton>
      )}
      {!me.draftPaid && me.embers < 750 && <span style={css('font-size:13px;font-weight:700;color:#ffb38a')}>You need {750 - me.embers} more embers. Win games to earn them.</span>}
    </Center>
  );
}

function Seats({ st }: { st: any }) {
  return (
    <div style={css('display:flex;gap:10px;flex-wrap:wrap')}>
      {st.seats.map((s: any, i: number) => (
        <div key={i} style={css(`display:flex;align-items:center;gap:8px;padding:6px 12px 6px 6px;border-radius:20px;background:${i === st.seat ? 'rgba(240,169,59,.14)' : 'rgba(255,255,255,.04)'}`)}>
          <span style={css(`width:28px;height:28px;border-radius:50%;background:#1a212c url('${s.art ?? ''}') center 25%/cover;box-shadow:0 0 0 1px rgba(255,255,255,.15)`)} />
          <span style={css('font-size:13px;font-weight:700')}>{i === st.seat ? 'You' : s.name}</span>
          {st.phase === 'drafting' && <span style={css('font-size:11px;color:#8d98a8')}>{s.picks} picks{s.waiting > 1 ? ` · ${s.waiting} packs waiting` : ''}</span>}
          {st.phase === 'building' && <span style={css(`font-size:11px;font-weight:700;color:${s.ready ? '#9af5c8' : '#8d98a8'}`)}>{s.ready ? 'Ready' : 'Building'}</span>}
          {(st.phase === 'playing' || st.phase === 'done') && <span style={css('font-size:12px;font-weight:800;color:#f7dc9a')}>{s.wins}-{s.losses}</span>}
        </div>
      ))}
    </div>
  );
}

function Seating({ st }: { st: any }) {
  return (
    <Center>
      <mf-loader size="48"></mf-loader>
      <h1 style={css(`${H};margin:0;font-size:36px`)}>The pod is sitting down</h1>
      <Seats st={st} />
    </Center>
  );
}

// ------------------------------------------------------------------------------------------------ drafting
function Drafting({ st, now }: { st: any; now: number }) {
  const pack: PCard[] | null = st.current;
  const opened = useRef<Set<string>>(new Set());
  const key = `${st.id}:${st.pack}`;
  const isFresh = !!pack && st.pickNo === 1 && !opened.current.has(key);
  const [, force] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setSel(null), [pack?.length, st.pack]);
  const left = secs(st.pickDeadline, now);

  const pick = (id: string) => {
    if (busy) return;
    setBusy(true);
    request({ t: 'draft.pick', card: id })
      .catch(() => {})
      .finally(() => setBusy(false));
  };
  return (
    <div style={css('flex:1;display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:24px;padding:20px 32px 28px;min-height:0')}>
      <section style={css('display:flex;flex-direction:column;gap:16px;min-width:0')}>
        <div style={css('display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap')}>
          <div style={css('display:flex;flex-direction:column;gap:4px')}>
            <span style={css(KICK)}>
              PACK {st.pack} OF {st.packs} · PASSING {st.direction.toUpperCase()} {st.direction === 'left' ? '←' : '→'}
            </span>
            <h1 style={css(`${H};margin:0;font-size:34px`)}>{pack ? `Pick ${st.pickNo}` : 'Waiting for the next pack…'}</h1>
          </div>
          {pack && !isFresh && (
            <div style={css('display:flex;align-items:center;gap:14px')}>
              <span style={css(`font-family:Cinzel,serif;font-size:26px;font-weight:800;font-variant-numeric:tabular-nums;color:${left <= 10 ? '#ff8a6a' : '#f7dc9a'}`)}>{mmss(left)}</span>
              <GoldButton small disabled={!sel || busy} onClick={() => sel && pick(sel)}>
                {busy ? '…' : 'PICK'}
              </GoldButton>
            </div>
          )}
        </div>
        <Seats st={st} />
        {isFresh ? (
          <Booster
            pack={pack!}
            packNo={st.pack}
            onOpened={() => {
              opened.current.add(key);
              force((x) => x + 1);
            }}
          />
        ) : pack ? (
          <div style={css('display:grid;grid-template-columns:repeat(auto-fill,minmax(min(170px,100%),1fr));gap:18px 14px;padding:4px')}>
            {pack.map((c) => (
              <button
                key={c.id}
                onClick={() => setSel(c.id)}
                onDoubleClick={() => pick(c.id)}
                aria-pressed={sel === c.id}
                aria-label={`${c.name}, ${c.rarity}`}
                style={css(`position:relative;display:block;width:100%;aspect-ratio:488/680;padding:0;border:0;border-radius:4.75%/3.5%;cursor:pointer;background:#1a1f27 url('${IMG(c)}') center/cover;transition:transform .15s,box-shadow .15s;transform:${sel === c.id ? 'translateY(-6px)' : 'none'};box-shadow:${sel === c.id ? '0 0 0 3px #f0a93b,0 0 26px rgba(240,169,59,.45),0 16px 28px rgba(0,0,0,.65)' : `0 0 0 1px ${RC[c.rarity]}55,0 16px 28px rgba(0,0,0,.6)`}`)}
              />
            ))}
          </div>
        ) : (
          <Center>
            <mf-loader size="40"></mf-loader>
            <span style={css('font-size:14px;color:#8d98a8')}>Your neighbour is still picking.</span>
          </Center>
        )}
        {pack && !isFresh && <span style={css('font-size:12px;color:#6b7688')}>Click a card to select it, then PICK. Double-click picks at once. When time runs out the best card is picked for you.</span>}
      </section>
      <PicksPanel picks={st.picks} />
    </div>
  );
}

function Booster({ pack, packNo, onOpened }: { pack: PCard[]; packNo: number; onOpened: () => void }) {
  const ref = useRef<any>(null);
  const cards = useMemo(() => JSON.stringify([...pack].sort((a, b) => ['common', 'uncommon', 'rare', 'mythic'].indexOf(a.rarity) - ['common', 'uncommon', 'rare', 'mythic'].indexOf(b.rarity)).map((c) => ({ img: IMG(c), rarity: c.rarity }))), [pack]);
  const best = pack.find((c) => c.rarity === 'mythic') ?? pack.find((c) => c.rarity === 'rare') ?? pack[0];
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let t: any;
    const done = () => (t = setTimeout(onOpened, 1400));
    el.addEventListener('mf-opened', done);
    return () => {
      el.removeEventListener('mf-opened', done);
      clearTimeout(t);
    };
  }, []);
  return (
    <div style={css('display:flex;flex-direction:column;align-items:center;gap:14px')}>
      <div style={css('position:relative;width:min(100%,880px);height:min(62vh,560px)')}>
        <mf-booster ref={ref} art={ART(best.name)} name="DRAFT NIGHT" sub={`BOOSTER ${packNo} OF 3`} color={['blue', 'red', 'gold'][packNo - 1] ?? 'blue'} cards={cards}></mf-booster>
      </div>
      <div style={css('display:flex;gap:12px')}>
        <GhostButton onClick={() => ref.current?.revealAll?.()}>REVEAL ALL</GhostButton>
        <GhostButton onClick={onOpened}>SKIP TO PICKING</GhostButton>
      </div>
      <span style={css('font-size:12px;color:#6b7688')}>Drag across the top of the pack to tear it open, then tap cards to flip them.</span>
    </div>
  );
}

function PicksPanel({ picks }: { picks: PCard[] }) {
  const counts = Array(8).fill(0);
  picks.forEach((c) => !/Land/.test(c.type) && counts[Math.min(7, Math.floor(c.cmc))]++);
  const max = Math.max(1, ...counts);
  const col: Record<string, number> = {};
  picks.forEach((c) => c.colors.forEach((x) => (col[x] = (col[x] ?? 0) + 1)));
  return (
    <aside style={css('display:flex;flex-direction:column;gap:14px;min-height:0;padding:16px;border-radius:10px;background:linear-gradient(180deg,#1a1b20,#111317);box-shadow:0 24px 60px rgba(0,0,0,.65)')}>
      <div style={css('display:flex;justify-content:space-between;align-items:baseline')}>
        <span style={css(`${H};font-size:18px`)}>Your picks</span>
        <span style={css('font-size:13px;font-weight:700;color:#8d98a8')}>{picks.length}</span>
      </div>
      <div style={css('display:flex;gap:8px;flex-wrap:wrap')}>
        {'WUBRG'.split('').filter((c) => col[c]).map((c) => (
          <span key={c} style={css('display:flex;align-items:center;gap:4px;font-size:12px;font-weight:700;color:#c3c8d0')}>
            <img src={PIP(c)} alt={c} width={16} height={16} />
            {col[c]}
          </span>
        ))}
      </div>
      <div aria-label="Mana curve" style={css('display:flex;align-items:flex-end;gap:4px;height:54px')}>
        {counts.map((n, i) => (
          <div key={i} style={css('flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;height:100%;justify-content:flex-end')}>
            <span style={css(`width:100%;height:${Math.round((n / max) * 38)}px;min-height:${n ? 3 : 0}px;border-radius:2px 2px 0 0;background:linear-gradient(180deg,#f5b44b,#8a5418)`)} />
            <span style={css('font-size:10px;color:#6b7688')}>{i === 7 ? '7+' : i}</span>
          </div>
        ))}
      </div>
      <div style={css('flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:3px;scrollbar-width:thin')}>
        {[...picks].reverse().map((c, i) => (
          <div key={c.id + i} title={c.name} style={css(`display:flex;align-items:center;gap:8px;height:30px;padding:0 8px;border-radius:4px;background:linear-gradient(90deg,rgba(12,13,16,.95) 40%,rgba(12,13,16,.55)),url('${ART(c.name)}') right center/60% auto no-repeat`)}>
            <span style={css(`width:6px;height:6px;transform:rotate(45deg);background:${RC[c.rarity]}`)} />
            <span style={css('flex:1;min-width:0;font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{c.name}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}

// ------------------------------------------------------------------------------------------------ building
function suggest(picks: PCard[]): Record<string, number> {
  const RW: Record<string, number> = { common: 1, uncommon: 2, rare: 3.4, mythic: 4 };
  const w: Record<string, number> = {};
  for (const c of picks) for (const x of c.colors) w[x] = (w[x] ?? 0) + RW[c.rarity];
  const cols = Object.entries(w).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([c]) => c);
  const fit = picks.filter((c) => c.colors.every((x) => cols.includes(x)) && !/\bLand\b/.test(c.type)).sort((a, b) => RW[b.rarity] - RW[a.rarity] || a.cmc - b.cmc).slice(0, 23);
  const deck: Record<string, number> = {};
  for (const c of fit) deck[c.name] = (deck[c.name] ?? 0) + 1;
  const weight: Record<string, number> = {};
  for (const c of fit) for (const x of c.colors) weight[x] = (weight[x] ?? 0) + 1;
  const use = cols.length ? cols : ['G'];
  const total = use.reduce((a, c) => a + (weight[c] ?? 1), 0);
  let left = 40 - fit.length;
  use.forEach((c, i) => {
    const n = i === use.length - 1 ? left : Math.round(((40 - fit.length) * (weight[c] ?? 1)) / total);
    left -= n;
    const basic = BASICS.find(([k]) => k === c)![1];
    if (n > 0) deck[basic] = (deck[basic] ?? 0) + n;
  });
  return deck;
}

function Building({ st, now }: { st: any; now: number }) {
  const picks: PCard[] = st.picks;
  const [deck, setDeck] = useState<Record<string, number>>(() => st.deck ?? suggest(picks));
  const [busy, setBusy] = useState(false);
  const have = useMemo(() => {
    const h: Record<string, number> = {};
    picks.forEach((c) => (h[c.name] = (h[c.name] ?? 0) + 1));
    return h;
  }, [picks]);
  const byName = useMemo(() => Object.fromEntries(picks.map((c) => [c.name, c])), [picks]);
  const total = Object.values(deck).reduce((a, b) => a + b, 0);
  const ready = st.seats[st.seat]?.ready;
  const left = secs(st.buildDeadline, now);
  const add = (n: string) => setDeck((d) => (BASICS.some(([, b]) => b === n) || (d[n] ?? 0) < (have[n] ?? 0) ? { ...d, [n]: (d[n] ?? 0) + 1 } : d));
  const rem = (n: string) =>
    setDeck((d) => {
      const x = { ...d };
      if ((x[n] ?? 0) <= 1) delete x[n];
      else x[n]--;
      return x;
    });
  const pool = Object.keys(have)
    .map((n) => byName[n])
    .sort((a, b) => +/Land/.test(a.type) - +/Land/.test(b.type) || a.cmc - b.cmc || a.name.localeCompare(b.name));
  const submit = () => {
    setBusy(true);
    request({ t: 'draft.deck', main: deck })
      .then(() => toast('Deck locked in'))
      .catch(() => {})
      .finally(() => setBusy(false));
  };
  return (
    <div style={css('flex:1;display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:24px;padding:20px 32px 28px;min-height:0')}>
      <section style={css('display:flex;flex-direction:column;gap:14px;min-width:0;min-height:0')}>
        <div style={css('display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap')}>
          <div style={css('display:flex;flex-direction:column;gap:4px')}>
            <span style={css(KICK)}>DECK BUILDING · {mmss(left)} LEFT</span>
            <h1 style={css(`${H};margin:0;font-size:34px`)}>Build 40 cards</h1>
          </div>
          <div style={css('display:flex;gap:10px')}>
            <GhostButton onClick={() => setDeck(suggest(picks))}>SUGGEST A DECK</GhostButton>
            <GhostButton onClick={() => setDeck({})}>CLEAR</GhostButton>
          </div>
        </div>
        <Seats st={st} />
        <span style={css('font-size:13px;color:#8d98a8')}>Click a card to add it. Your pool: {picks.length} cards. If time runs out, a deck is built for you.</span>
        <div style={css('flex:1;min-height:0;overflow-y:auto;scrollbar-width:thin;padding:6px 6px 20px')}>
          <div style={css('display:grid;grid-template-columns:repeat(auto-fill,minmax(min(150px,100%),1fr));gap:16px 12px')}>
            {pool.map((c) => {
              const used = deck[c.name] ?? 0, n = have[c.name];
              return (
                <button
                  key={c.name}
                  onClick={() => add(c.name)}
                  disabled={used >= n}
                  aria-label={`Add ${c.name}, ${used} of ${n} in deck`}
                  style={css(`position:relative;display:block;width:100%;aspect-ratio:488/680;padding:0;border:0;border-radius:4.75%/3.5%;cursor:${used >= n ? 'default' : 'pointer'};background:#1a1f27 url('${IMG(c)}') center/cover;opacity:${used >= n ? 0.4 : 1};box-shadow:${used ? '0 0 0 2px #e3a246,0 14px 24px rgba(0,0,0,.6)' : '0 0 0 1px rgba(0,0,0,.7),0 14px 24px rgba(0,0,0,.6)'}`)}
                >
                  {n > 1 && <span style={css('position:absolute;top:6px;right:6px;padding:2px 7px;border-radius:9px;background:rgba(0,0,0,.75);font-size:11px;font-weight:800;color:#f7dc9a')}>{used}/{n}</span>}
                </button>
              );
            })}
          </div>
        </div>
      </section>
      <aside style={css('display:flex;flex-direction:column;gap:12px;min-height:0;padding:16px;border-radius:10px;background:linear-gradient(180deg,#1a1b20,#111317);box-shadow:0 24px 60px rgba(0,0,0,.65)')}>
        <div style={css('display:flex;justify-content:space-between;align-items:baseline')}>
          <span style={css(`${H};font-size:18px`)}>Your deck</span>
          <span style={css(`font-family:Cinzel,serif;font-size:18px;font-weight:800;color:${total >= 40 ? '#9af5c8' : '#ffc98a'}`)}>{total} / 40</span>
        </div>
        <div style={css('display:grid;grid-template-columns:repeat(5,1fr);gap:6px')}>
          {BASICS.map(([c, b]) => (
            <div key={c} style={css('display:flex;flex-direction:column;align-items:center;gap:4px;padding:6px 0;border-radius:6px;background:rgba(255,255,255,.04)')}>
              <img src={PIP(c)} alt={b} width={20} height={20} />
              <span style={css('font-size:13px;font-weight:800')}>{deck[b] ?? 0}</span>
              <div style={css('display:flex;gap:2px')}>
                <button aria-label={`Remove a ${b}`} onClick={() => rem(b)} style={css('width:22px;height:22px;border:0;border-radius:4px;background:#2a2c33;color:#e7ebf1;cursor:pointer')}>−</button>
                <button aria-label={`Add a ${b}`} onClick={() => add(b)} style={css('width:22px;height:22px;border:0;border-radius:4px;background:#b8621a;color:#1b1206;font-weight:800;cursor:pointer')}>+</button>
              </div>
            </div>
          ))}
        </div>
        <div style={css('flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:3px;scrollbar-width:thin')}>
          {Object.entries(deck)
            .filter(([n]) => !BASICS.some(([, b]) => b === n))
            .sort((a, b) => (byName[a[0]]?.cmc ?? 0) - (byName[b[0]]?.cmc ?? 0) || a[0].localeCompare(b[0]))
            .map(([n, q]) => (
              <button key={n} onClick={() => rem(n)} title="Click to remove" style={css(`display:flex;align-items:center;gap:8px;height:30px;padding:0 8px;border:0;border-radius:4px;cursor:pointer;text-align:left;color:#e7ebf1;background:linear-gradient(90deg,rgba(12,13,16,.95) 40%,rgba(12,13,16,.55)),url('${ART(n)}') right center/60% auto no-repeat`)}>
                <span style={css('width:18px;font-size:12px;font-weight:800;color:#f7dc9a')}>{q}</span>
                <span style={css('flex:1;min-width:0;font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{n}</span>
              </button>
            ))}
        </div>
        {ready && <span style={css('font-size:13px;font-weight:700;color:#9af5c8')}>Deck locked in. You can still change it until everyone is ready.</span>}
        <GoldButton onClick={submit} disabled={busy || total < 40}>
          {busy ? '…' : ready ? 'UPDATE DECK' : total < 40 ? `${40 - total} MORE CARDS` : 'LOCK IN DECK'}
        </GoldButton>
      </aside>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ rounds
function Rounds({ st, found }: { st: any; found: any }) {
  const done = st.phase === 'done';
  const me = st.seats[st.seat];
  const standings = st.seats.map((s: any, i: number) => ({ ...s, i })).sort((a: any, b: any) => b.wins - a.wins || a.losses - b.losses);
  const prize = st.prizes[Math.min(me?.wins ?? 0, st.prizes.length - 1)];
  return (
    <Center>
      <span style={css(KICK)}>{done ? 'DRAFT COMPLETE' : `ROUND ${st.round} OF ${st.rounds}`}</span>
      <h1 style={css(`${H};margin:0;font-size:clamp(36px,4.4vw,56px)`)}>{done ? `You went ${me?.wins ?? 0}-${me?.losses ?? 0}` : st.match ? 'Your table is ready' : 'Waiting for the round to finish'}</h1>
      {done && <span style={css('display:flex;align-items:center;gap:8px;font-size:18px;font-weight:800;color:#ffcfae')}>{prize ? <><mf-ember size="24"></mf-ember>+{fmt(prize)} embers</> : 'No prize this time. Better luck next draft!'}</span>}
      <div style={css('display:flex;flex-direction:column;gap:6px;min-width:min(420px,100%)')}>
        {standings.map((s: any, r: number) => (
          <div key={s.i} style={css(`display:flex;align-items:center;gap:12px;padding:8px 14px;border-radius:6px;background:${s.i === st.seat ? 'rgba(240,169,59,.12)' : 'rgba(255,255,255,.04)'}`)}>
            <span style={css('width:18px;font-family:Cinzel,serif;font-weight:800;color:#c9a050')}>{r + 1}</span>
            <span style={css(`width:30px;height:30px;border-radius:50%;background:#1a212c url('${s.art ?? ''}') center 25%/cover`)} />
            <span style={css('flex:1;text-align:left;font-weight:700')}>{s.i === st.seat ? 'You' : s.name}{s.bot ? ' (bot)' : ''}</span>
            <span style={css('font-family:Cinzel,serif;font-size:18px;font-weight:800;color:#f7dc9a')}>{s.wins}-{s.losses}</span>
          </div>
        ))}
      </div>
      {!done && st.match && (
        <GoldButton
          onClick={() => {
            game.join(st.match.code, st.match.token);
            navigate('/table');
          }}
        >
          {found?.mode === 'draft' ? 'TAKING YOUR SEAT…' : 'GO TO YOUR TABLE'}
        </GoldButton>
      )}
      {!done && !st.match && <span style={css('font-size:14px;color:#8d98a8')}>The next round starts when every table has finished.</span>}
      {done && (
        <div style={css('display:flex;gap:12px')}>
          <GoldButton
            onClick={() => {
              request({ t: 'draft.leave' }, true).catch(() => {});
              setState({ draft: null });
              navigate('/');
            }}
          >
            BACK TO LOBBY
          </GoldButton>
        </div>
      )}
    </Center>
  );
}
