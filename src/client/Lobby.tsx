// Lobby v3 — the Claude Design layout (LobbyView, generated) driven by the live account, social and matchmaking state.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LobbyView } from './LobbyView';
import { EASE, PIP, anim, fmt, hms, pad } from './dc';
import { api, game, getState, request, send, setState, toast, useStore, type DeckSummary, type Friend, type Note } from './store';
import { ART, localDecks, toText } from './localDecks';
import { SignIn, signOut } from './auth';
import { navigate } from './router';
import { useCatalog } from './catalogData';

declare const MF: any;

const NEED = { standard: 60, commander: 100 } as const;
const MODES = [
  { id: 'quick', name: 'Quick Match', card: 'Quick Match', type: 'Casual · 1v1', sub: 'Any deck · fastest queue', text: 'Jump in with any deck.', art: 'Lightning Bolt', frame: 'grey', cost: 'FREE', fmt: null as null | 'standard' | 'commander' },
  { id: 'standard', name: '60-Card Standard', card: 'Standard', type: '60 cards · 1v1', sub: '60 cards · up to 4 copies', text: 'Classic constructed duels.', art: 'Serra Angel', frame: 'gold', cost: 'FREE', fmt: 'standard' as const },
  { id: 'cmd', name: 'Commander 1v1', card: 'Commander', type: '100 cards · 1v1', sub: '100 cards · one of each', text: 'Duel with your commander.', art: 'Krenko, Mob Boss', frame: 'red', cost: 'FREE', fmt: 'commander' as const },
  { id: 'rcmd', name: 'Ranked Commander', card: 'Ranked', type: 'Ranked · 1v1', sub: '100 cards · 1v1', text: 'Climb to Mythic.', art: "Atraxa, Praetors' Voice", frame: 'ember', cost: 'FREE', fmt: 'commander' as const, ranked: true },
  { id: 'draft', name: 'Draft Night', card: 'Draft Night', type: 'Limited · 4 players', sub: '4 players · 750 embers', text: 'Keep every pick.', art: 'Shivan Dragon', frame: 'blue', cost: '750', fmt: null, draft: true },
];
const MODE: Record<string, (typeof MODES)[number]> = Object.fromEntries(MODES.map((m) => [m.id, m]));
const FRAME: Record<string, string> = {
  gold: 'linear-gradient(160deg,#e8c46a,#8a6420 60%,#c9a050)', red: 'linear-gradient(160deg,#d0603a,#6b1e10 60%,#b0442a)', blue: 'linear-gradient(160deg,#5a8ac0,#1e3a5e 60%,#4a74a6)',
  grey: 'linear-gradient(160deg,#a8adb4,#4a4e55 60%,#8a8f96)', ember: 'linear-gradient(160deg,#ffb070,#8a2a10 60%,#e07a3a)',
};
const DOT = { game: '#f0a93b', online: '#3ec28f', away: '#6b7280', off: '#2a2f38' };
const dh = (ms: number) => {
  const h = Math.max(0, Math.floor(ms / 3600000));
  return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${Math.floor(ms / 60000) % 60}m`;
};
const days = (to: number, now: number) => {
  const d = Math.max(0, Math.ceil((to - now) / 864e5));
  return d === 1 ? '1 day' : d + ' days';
};
const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? 'Just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} hour${m < 120 ? '' : 's'} ago` : m < 2880 ? 'Yesterday' : `${Math.round(m / 1440)} days ago`;
};
const pref = (k: string, d: string) => {
  try {
    return localStorage.getItem('manaforge.lobby.' + k) ?? d;
  } catch {
    return d;
  }
};
const setPref = (k: string, v: string) => {
  try {
    localStorage.setItem('manaforge.lobby.' + k, v);
  } catch {}
};
/** "LOGIN" reward text → icon kind for the calendar tiles and season track */
function rwKind(text: string) {
  return { isGold: / gold$/.test(text), isEmber: / embers$/.test(text), isXp: / XP$/.test(text), isArt: !/ (gold|embers|XP)$/.test(text), amtTxt: text };
}

export function Lobby() {
  const me = useStore((s) => s.me);
  const notesRaw = useStore((s) => s.notes);
  const friendsRaw = useStore((s) => s.friends);
  const serverDecks = useStore((s) => s.decks);
  const queue = useStore((s) => s.queue);
  const found = useStore((s) => s.found);
  const toasts = useStore((s) => s.toasts);
  const authReady = useStore((s) => s.authReady);
  const inGame = useStore((s) => s.inGame);
  const cat = useCatalog();
  const rootRef = useRef<HTMLDivElement>(null);
  const q = (sel: string) => (rootRef.current ? [...rootRef.current.querySelectorAll(sel)] : []);
  const [now, setNow] = useState(Date.now());
  const [narrow, setNarrow] = useState(false);
  const [mode, setMode] = useState(pref('mode', 'quick'));
  const [deckId, setDeckId] = useState(pref('deck', ''));
  const [pops, setPops] = useState({ bell: false, profile: false, deckOpen: false, social: false, modeOpen: false });
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginShown, setLoginShown] = useState(false);
  const [justClaimed, setJustClaimed] = useState<string | null>(null);
  const [slide, setSlide] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [signInOpen, setSignInOpen] = useState(false);
  const [stats, setStats] = useState<Record<string, { online: number; wait: number }>>({});
  const signed = !!me;

  // decks: the account's, or the browser's for guests
  const decks: DeckSummary[] = useMemo(() => (signed ? serverDecks ?? [] : localDecks()), [signed, serverDecks]);
  const M = MODE[mode] ?? MODE.quick;
  const deckFor = (f: string | null, cur: string) => {
    const list = f ? decks.filter((d) => d.format === f) : decks.filter((d) => d.valid);
    return (list.find((d) => d.id === cur) ?? list.find((d) => d.valid) ?? list[0] ?? decks[0])?.id ?? '';
  };
  // the selected deck, as long as it fits the mode's format; otherwise the best deck that does
  const picked = decks.find((d) => d.id === deckId);
  const deck = picked && (!M.fmt || picked.format === M.fmt) ? picked : decks.find((d) => d.id === deckFor(M.fmt, deckId));
  useEffect(() => setPref('mode', mode), [mode]);
  useEffect(() => {
    if (deck && deck.id !== deckId) setDeckId(deck.id);
    if (deck) setPref('deck', deck.id);
  }, [deck?.id]);
  useEffect(() => send({ t: 'activity', a: 'lobby' }), []);

  // live mode stats (players online, typical wait)
  useEffect(() => {
    let live = true;
    const load = () => api('/api/modes').then((r) => r.json()).then((j) => live && setStats(j.stats)).catch(() => {});
    load();
    const t = setInterval(load, 15000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);

  // open the daily reward once per visit when it hasn't been claimed
  useEffect(() => {
    if (me && !me.login.claimedToday && !loginShown) {
      setLoginShown(true);
      setLoginOpen(true);
    }
  }, [me?.id, me?.login.claimedToday]);

  // clock
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // hero autoplay
  const slideTimer = useRef<any>(null);
  const startSlide = () => {
    clearTimeout(slideTimer.current);
    slideTimer.current = setTimeout(() => setSlide((s) => (s + 1) % 3), 9000);
  };
  useEffect(() => {
    startSlide();
    q('[data-slide]').forEach((el) => anim(el, [{ opacity: 0, transform: 'translateX(-16px)' }, { opacity: 1, transform: 'none' }], { duration: 700, easing: EASE }));
    return () => clearTimeout(slideTimer.current);
  }, [slide]);

  // layout + entrance
  useEffect(() => {
    const fit = () => requestAnimationFrame(() => rootRef.current && setNarrow(rootRef.current.clientWidth < 1220));
    const ro = new ResizeObserver(fit);
    if (rootRef.current) ro.observe(rootRef.current);
    fit();
    q('[data-in]').forEach((el) => anim(el, [{ opacity: 0, transform: 'translateY(18px)' }, { opacity: 1, transform: 'none' }], { duration: 800, delay: 120 + +(el as HTMLElement).dataset.in! * 100, easing: EASE, fill: 'backwards' }));
    return () => ro.disconnect();
  }, []);

  // looping decorations, as in the design
  useEffect(() => {
    const loop = (sel: string, frames: Keyframe[], o: KeyframeAnimationOptions) => q(sel).forEach((el) => !(el as any).getAnimations?.().length && anim(el, frames, o));
    loop('[data-pulse]', [{ opacity: 1 }, { opacity: 0.3 }, { opacity: 1 }], { duration: 1600, iterations: Infinity });
    loop('[data-bob]', [{ transform: 'translateY(0) rotate(-4deg)' }, { transform: 'translateY(-4px) rotate(4deg)' }, { transform: 'translateY(0) rotate(-4deg)' }], { duration: 2400, iterations: Infinity, easing: 'ease-in-out' });
    loop('[data-spin]', [{ transform: 'rotate(45deg)' }, { transform: 'rotate(405deg)' }], { duration: 1400, iterations: Infinity, easing: 'cubic-bezier(.6,0,.4,1)' });
    loop('[data-kb]', [{ transform: 'scale(1)' }, { transform: 'scale(1.07) translate(-1.2%,-.8%)' }], { duration: 30000, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' });
    if (!queue) loop('[data-playfill]', [{ filter: 'brightness(1)' }, { filter: 'brightness(1.15)' }, { filter: 'brightness(1)' }], { duration: 2600, iterations: Infinity, easing: 'ease-in-out' });
  });

  // currency pulse + reward flights from server effects
  const prevMe = useRef(me);
  useEffect(() => {
    const p = prevMe.current;
    prevMe.current = me;
    if (!p || !me) return;
    for (const c of ['gold', 'embers'] as const)
      if (p[c] !== me[c]) q(`[data-cur="${c}"]`).forEach((el) => anim(el, [{ transform: 'scale(1)', filter: 'brightness(1)' }, { transform: 'scale(1.1)', filter: 'brightness(1.7)' }, { transform: 'scale(1)', filter: 'brightness(1)' }], { duration: 500 }));
  }, [me]);
  const prevFound = useRef(found);
  useEffect(() => {
    if (!prevFound.current && found) {
      q('[data-found]').forEach((el) => anim(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 350 }));
      q('[data-pcard]').forEach((el, i) => anim(el, [{ opacity: 0, transform: 'translateY(40px) rotate(-6deg) scale(.9)' }, { opacity: 1, transform: 'none' }], { duration: 650, delay: 120 + i * 120, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' }));
    }
    prevFound.current = found;
  }, [found]);
  const prevSeats = useRef(0);
  useEffect(() => {
    const n = queue?.seats?.length ?? 0;
    if (n > prevSeats.current) q(`[data-seat="${n - 1}"]`).forEach((el) => anim(el, [{ transform: 'translateY(-20px) rotateY(90deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 500, easing: EASE }));
    prevSeats.current = n;
  }, [queue?.seats?.length]);
  useEffect(() => {
    if (!loginOpen) return;
    setTimeout(() => {
      q('[data-login]').forEach((el) => anim(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 300 }));
      q('[data-lhead]').forEach((el) => anim(el, [{ opacity: 0, transform: 'translateY(-14px)' }, { opacity: 1, transform: 'none' }], { duration: 600, easing: EASE }));
      q('[data-ltile]').forEach((el, i) => anim(el, [{ opacity: 0, transform: 'translateY(60px) rotate(8deg)' }, { opacity: 1, transform: 'none' }], { duration: 600, delay: 150 + i * 70, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' }));
    }, 0);
  }, [loginOpen]);
  const prevToasts = useRef(toasts.length);
  useEffect(() => {
    if (toasts.length > prevToasts.current) {
      const t = toasts[toasts.length - 1];
      q(`[data-toast="${t.id}"]`).forEach((el) => anim(el, [{ opacity: 0, transform: 'translateY(-10px)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: EASE }));
    }
    prevToasts.current = toasts.length;
  }, [toasts]);

  const flashPlay = () => q('[data-deckbox]').forEach((el) => anim(el, [{ transform: 'translateY(0)' }, { transform: 'translateY(-10px) rotate(-2deg)' }, { transform: 'translateY(0)' }], { duration: 500, easing: EASE }));
  const flyTo = (kind: string, from: Element | undefined, n: number) => {
    try {
      if ((window as any).MF && from) MF.fly(kind, from, q(`[data-cur="${kind}"]`)[0], { count: n });
    } catch {}
  };
  const closePops = () => setPops({ bell: false, profile: false, deckOpen: false, social: false, modeOpen: false });
  const configure = (id: string) => {
    if (queue || !MODE[id]) return;
    if (MODE[id].ranked && !signed) return toast('Sign in to play ranked');
    setMode(id);
    if (!MODE[id].draft) setDeckId(deckFor(MODE[id].fmt, deckId));
    closePops();
    flashPlay();
  };

  // ---------------------------------------------------------------------------------- derived values
  const busy = !!queue;
  const isDraft = !!M.draft;
  const isCmd = M.fmt === 'commander';
  const valid = !!deck && (M.fmt ? deck.format === M.fmt && deck.valid : deck.valid);
  const rankLock = !!M.ranked && !signed;
  const noPlay = rankLock || (!isDraft && !valid) || (isDraft && !signed);
  const status = (dk: DeckSummary) => (dk.valid ? { status: `${dk.cards} cards`, vc: '#9aa3b0' } : { status: dk.why && !/cards/.test(dk.why) ? dk.why : `${dk.cards} of ${NEED[dk.format]} cards`, vc: '#f7c26a' });
  const st = (id: string) => stats[id];
  const ptTxt = (n?: number) => (n == null ? '—' : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
  const waitTxt = (id: string) => {
    const w = st(id)?.wait ?? 15;
    return `${Math.floor(w / 60)}:${pad(w % 60)}`;
  };
  const rankHintTxt = me ? rankHint(me.rank) : '';
  const fri = new Date(now);
  fri.setDate(fri.getDate() + ((5 - fri.getDay() + 7) % 7));
  fri.setHours(19, 0, 0, 0);
  if (fri.getTime() <= now) fri.setDate(fri.getDate() + 7);
  const seasonEnd = me?.season.end ?? Date.UTC(2026, 10, 15);
  const reset = new Date(now);
  reset.setUTCHours(24, 0, 0, 0);
  const bundleEnds = cat?.bundle?.endsAt ?? now;

  const slides = [
    { kicker: 'FRIDAY · 19:00', meta: `Featured night in ${dh(fri.getTime() - now)} · 4 players · entry 750 embers`, title: 'Draft Night', body: 'Open three packs with three other players, build a 40-card deck and play three rounds. Keep every card you pick.', art: 'https://media.wizards.com/2026/images/daily/mgaRmqpndA/TWLXfSPn7h_2560x1600.jpg', pos: 'center 35%', cta: mode === 'draft' ? 'SELECTED' : 'SIGN UP', act: () => configure('draft'), off: mode === 'draft', tab: 'Draft Night' },
    { kicker: (me?.season.name ?? 'Season of Embers').toUpperCase(), meta: `Season ends in ${days(seasonEnd, now)}${me ? ` · you are ${me.rank.name}` : ''}`, title: 'Ranked Commander', body: 'One-on-one Commander with 100-card decks. Climb from Bronze to Mythic before the season closes.', art: 'https://media.wizards.com/2026/images/daily/XkcsUjpbDP/ziT4P43J5W_2560x1600.jpg', pos: 'center 35%', cta: mode === 'rcmd' ? 'SELECTED' : 'PLAY RANKED', act: () => configure('rcmd'), off: mode === 'rcmd', tab: 'Ranked Commander' },
    { kicker: 'IN THE SHOP', meta: `Playmat, sleeves and card back · leaves in ${days(bundleEnds, now)}`, title: cat?.bundle?.name?.replace(/ Collection$/, '') ?? 'Aeon Rift', body: 'A cosmetic set drawn from the Eldrazi titans.', art: 'https://media.wizards.com/2026/images/daily/ANBOskdovj/ku2YxnaZFO_2560x1600.jpg', pos: 'center 35%', cta: 'SEE THE SET', href: '/shop', tab: cat?.bundle?.name?.replace(/ Collection$/, '') ?? 'Aeon Rift' },
  ].map((x: any, i) => ({ ...x, i, on: i === slide, op: i === slide ? 1 : 0, isLink: !!x.href, isAct: !x.href, btnOp: x.off ? 0.5 : 1 }));
  const slideTabs = slides.map((x, i) => {
    const on = i === slide;
    return { label: x.tab, aria: `Show ${x.tab}`, cur: on ? 'true' : 'false', c: on ? '#f4efe4' : '#7d8491', dot: on ? '#f0a93b' : 'transparent', dotB: on ? '#f0a93b' : '#5a606a', pick: () => setSlide(i) };
  });

  const quests = (me?.quests ?? []).map((qq) => {
    const done = qq.prog >= qq.goal, ready = done && !qq.claimed;
    return {
      id: qq.id, title: qq.title, pct: Math.min(100, (qq.prog / qq.goal) * 100) + '%', progTxt: qq.claimed ? 'Done' : `${Math.min(qq.prog, qq.goal)}/${qq.goal}`,
      canReroll: !done && !me!.questSwapUsed, noClaim: !ready, sealCursor: ready ? 'pointer' : 'default',
      sealAria: ready ? `Claim ${fmt(qq.gold)} gold` : qq.claimed ? 'Claimed' : `Reward ${fmt(qq.gold)} gold`,
      seal: qq.claimed ? 'radial-gradient(circle at 38% 32%,#3a4a42,#16201b 75%)' : 'radial-gradient(circle at 38% 32%,#d84a30,#8a1a10 60%,#4a0a06)',
      sealGlow: ready ? '0 0 0 2px #f7dc9a,0 0 22px rgba(240,169,59,.7)' : '0 3px 8px rgba(0,0,0,.6)',
      sealRing: qq.claimed ? 'rgba(126,240,184,.45)' : 'rgba(255,200,170,.4)', sealC: qq.claimed ? '#9af5c8' : '#ffe6d6',
      sealTop: qq.claimed ? '✓' : ready ? 'TAKE' : fmt(qq.gold), sealSub: qq.claimed || ready ? '' : 'GOLD',
      bg: ready ? 'linear-gradient(90deg,rgba(80,52,14,.9),rgba(40,28,10,.55))' : 'linear-gradient(90deg,rgba(18,15,12,.88),rgba(18,15,12,.45))',
      tc: qq.claimed ? '#7d8491' : '#f4efe4', pc: ready ? '#f7dc9a' : '#8d98a8',
      barBg: qq.claimed ? '#3a6a52' : 'linear-gradient(90deg,#b8621a,#f7dc9a)',
      reroll: () => request({ t: 'quest.reroll', id: qq.id }).then(() => toast('Quest swapped · one swap per day')).catch(() => {}),
      claim: () => claimQuest(qq.id),
    };
  });
  const claimQuest = (id: string) => {
    const seal = q(`[data-quest="${id}"] button`)[0];
    request({ t: 'quest.claim', id })
      .then(() => {
        anim(seal, [{ transform: 'scale(1)' }, { transform: 'scale(1.25) rotate(-10deg)' }, { transform: 'scale(1)' }], { duration: 450, easing: EASE });
        flyTo('gold', seal, 10);
      })
      .catch(() => {});
  };
  const dailyWins = me?.dailyWins ?? 0;
  const winRewards = me?.dailyWinRewards ?? [];
  const winNodes = (winRewards.length ? winRewards : new Array(5).fill(null)).map((_, i) => {
    const on = i < dailyWins;
    return { border: on ? '#f0a93b' : 'rgba(255,255,255,.25)', fill: on ? 'linear-gradient(135deg,#f7dc9a,#b8621a)' : 'transparent', glow: on ? '0 0 10px rgba(240,169,59,.6)' : 'none' };
  });
  const lv = me?.level ?? 1;
  const track = (me?.season.track ?? []).slice(1, 5).map((r) => {
    const next = r.level === lv + 1;
    const item = cat?.items?.find((i: any) => r.reward.startsWith(i.name));
    return { ...rwKind(r.reward), art: item?.artUrl ?? '', lv: r.level, got: false, op: next ? 1 : 0.55, lc: next ? '#f7dc9a' : '#7d8491', border: next ? 'rgba(240,169,59,.7)' : 'rgba(255,255,255,.1)' };
  });

  const ROT = ['-12deg', '-6deg', '0deg', '6deg', '12deg'], TY = ['28px', '9px', '0px', '9px', '28px'];
  const events = MODES.map((m, i) => {
    const on = m.id === mode;
    return { title: m.card, type: m.type, text: m.text, art: ART(m.art), cost: m.cost, costC: m.draft ? '#ffcfae' : m.ranked ? '#f7dc9a' : '#9af5c8', pt: ptTxt(st(m.id)?.online), frame: FRAME[m.frame], aria: `${m.name}. ${m.sub}`, rot: ROT[i], ty: on ? '-16px' : TY[i], fid: m.frame, finish: on ? 'foil' : '', ring: on ? '0 0 0 2px #f0a93b' : '0 0 0 1px rgba(255,255,255,.08)', pick: () => configure(m.id) };
  });
  const modeRows = MODES.map((m) => {
    const on = m.id === mode, off = !!m.ranked && !signed;
    const sub = off ? 'Sign in to play ranked' : m.ranked && me ? `100 cards · 1v1 · ${me.rank.name}` : m.sub;
    return { name: m.name, sub, art: ART(m.art), frame: FRAME[m.frame], sel: on, selStr: on ? 'true' : 'false', off, op: off ? 0.45 : 1, bg: on ? 'rgba(240,169,59,.08)' : 'transparent', pick: () => configure(m.id) };
  });
  const deckRows = decks
    .filter((x) => (M.fmt ? x.format === M.fmt : true))
    .map((x) => ({ title: x.name, art: x.faceArt ?? '', ...status(x), sel: x.id === deck?.id, selStr: x.id === deck?.id ? 'true' : 'false', bg: x.id === deck?.id ? 'rgba(240,169,59,.08)' : 'transparent', pick: () => { setDeckId(x.id); setPops((p) => ({ ...p, deckOpen: false })); flashPlay(); } }));

  const playLabel = isDraft ? (me?.draftPaid ? 'JOIN DRAFT' : 'ENTER · 750') : M.ranked ? 'PLAY RANKED' : 'PLAY';
  const playSub = rankLock
    ? 'Sign in to play ranked.'
    : isDraft && !signed
      ? 'Sign in to play Draft Night.'
      : !isDraft && !deck
        ? 'Make a deck in the Deck Builder first.'
        : !isDraft && !valid
          ? `${deck!.name} has ${deck!.cards} of ${NEED[(M.fmt ?? deck!.format) as 'standard' | 'commander']} cards.`
          : isDraft
            ? 'Starts when 4 players are seated'
            : `Usual wait about ${waitTxt(mode)}` + (M.ranked && me ? ` · ${rankHintTxt}` : '');
  const el = queue ? Math.floor((now - queue.since) / 1000) : 0;
  const pod = queue?.mode === 'draft';
  const seatsArr = Array.from({ length: 4 }, (_, i) => {
    const filled = pod && i < (queue?.seats?.length ?? 1);
    const art = i === 0 ? avatarArt() : ART(['Kenrith, the Returned King', 'Meren of Clan Nel Toth', 'Omnath, Locus of Creation'][i - 1]);
    return { i, border: filled ? '2px solid #0b0b0c' : '1.5px dashed rgba(255,255,255,.25)', bg: filled ? `#1a212c url('${art}') center 25%/cover` : 'transparent', glow: filled ? '0 0 0 1px #5a8ac0,0 6px 14px rgba(0,0,0,.6)' : 'none' };
  });
  function avatarArt(): string {
    const id = me?.equipped?.avatar ?? 'a-jace';
    return cat?.items?.find((i: any) => i.id === id)?.artUrl ?? ART('Jace, the Mind Sculptor');
  }

  const challenge = async (f: Friend) => {
    // challenges are casual: the format follows the chosen mode, or (Quick Match) the selected deck
    const cm = M.draft || M.ranked || M.fmt === 'commander' ? 'cmd' : M.fmt === 'standard' ? 'standard' : deck?.format === 'commander' ? 'cmd' : 'standard';
    const want = cm === 'cmd' ? 'commander' : 'standard';
    const dk = deck && deck.format === want && deck.valid ? deck : decks.find((d) => d.format === want && d.valid);
    if (!dk) return toast(cm === 'cmd' ? 'You need a 100-card Commander deck to challenge' : 'You need a ready deck to challenge');
    setSent((s) => ({ ...s, [f.id]: true }));
    try {
      await request({ t: 'challenge.send', to: f.id, mode: cm, deckId: dk.local ? undefined : dk.id, deckText: dk.local ? toText(dk.data, dk.format) : undefined, deckName: dk.name });
      toast(`Challenge sent to ${f.name}`);
    } catch {
      setSent((s) => ({ ...s, [f.id]: false }));
    }
  };
  const friends = friendsRaw.map((f) => ({
    name: f.name, art: f.art ?? ART('Jace, the Mind Sculptor'), dot: DOT[f.st], status: f.pending === 'in' ? 'Wants to be friends' : f.pending === 'out' ? 'Request sent' : f.txt,
    sc: f.st === 'game' ? '#f0a93b' : f.st === 'online' ? '#3ec28f' : '#6b7280', op: f.st === 'off' ? 0.5 : 1, canWatch: f.st === 'game' && !f.pending, canChallenge: f.st === 'online' && !f.pending,
    sent: !!sent[f.id], cLabel: sent[f.id] ? 'Sent' : 'Challenge', cc: sent[f.id] ? '#5a606a' : '#f0a93b', challenge: () => challenge(f),
    watch: (e: React.MouseEvent) => {
      e.preventDefault();
      request({ t: 'spectate', user: f.id }).catch(() => {});
      navigate('/table');
    },
  }));
  const noteView = (n: Note) => {
    const base = { id: n.id, time: ago(n.created_at), hasActs: false, yesLabel: '', noLabel: '', yes: () => {}, no: () => request({ t: 'notes.dismiss', id: n.id }).catch(() => {}) } as any;
    if (n.kind === 'friend') return { ...base, art: ART('Jace, the Mind Sculptor'), text: `${n.data.fromName} wants to be friends.`, hasActs: true, yesLabel: 'Accept', noLabel: 'Decline', yes: () => request({ t: 'friends.accept', id: n.data.from }).then(() => toast(`You and ${n.data.fromName} are friends`)).catch(() => {}) };
    if (n.kind === 'challenge')
      return {
        ...base, art: n.data.art ?? ART('Teferi, Hero of Dominaria'), text: `${n.data.fromName} challenged you to ${n.data.modeName}.`, hasActs: true, yesLabel: 'Accept', noLabel: 'Decline',
        yes: () => {
          const want = n.data.mode === 'cmd' ? 'commander' : 'standard';
          const dk = decks.find((d) => d.id === deck?.id && d.format === want && d.valid) ?? decks.find((d) => d.format === want && d.valid);
          if (!dk) return toast(`You need a ready ${want === 'commander' ? 'Commander' : '60-card'} deck to accept`);
          setPops((p) => ({ ...p, bell: false }));
          request({ t: 'challenge.accept', id: n.id, deckId: dk.local ? undefined : dk.id, deckText: dk.local ? toText(dk.data, dk.format) : undefined, deckName: dk.name }).catch(() => {});
        },
      };
    if (n.kind === 'quest') return { ...base, art: ART('Forest'), text: `Quest complete: ${n.data.title}.`, hasActs: true, yesLabel: 'Claim', noLabel: 'Dismiss', yes: () => { claimQuest(n.data.questId); setPops((p) => ({ ...p, bell: false })); } };
    return { ...base, art: ART(n.data.art ?? 'Shivan Dragon'), text: n.data.text ?? '' };
  };
  const notes = notesRaw.map(noteView);
  const unread = notesRaw.filter((n) => !n.seen).length;
  const loginIdx = me ? (me.login.claimedToday ? (me.login.count - 1) % 7 : me.login.count % 7) : 0;
  const loginClaimed = !!me?.login.claimedToday;
  const loginTrack = me?.login.track ?? [];
  const loginTiles = loginTrack.map((text, i) => {
    const today = i === loginIdx, past = i < loginIdx, open = past || (today && loginClaimed), big = i === 6;
    const item = cat?.items?.find((it: any) => text.startsWith(it.name));
    return {
      ...rwKind(text), art: item?.artUrl ?? '', i, day: i + 1, stamped: past, flip: open ? '180deg' : '0deg', faceOp: open ? 1 : 0, backOp: open ? 0 : 1, lift: today ? '-18px' : '0px',
      w: big ? 'clamp(104px,10.5vw,138px)' : 'clamp(86px,8.6vw,112px)', off: !today, cursor: today && !loginClaimed ? 'pointer' : 'default', click: () => today && claimLogin(),
      aria: today ? (loginClaimed ? `Day ${i + 1}: ${text}` : `Flip day ${i + 1}`) : past ? `Day ${i + 1}: claimed` : `Day ${i + 1}`,
      tone: big ? 'ember' : today ? 'lit' : 'gold',
      backGlow: today && !loginClaimed ? '0 0 0 2px #f0a93b,0 0 40px rgba(240,169,59,.55)' : big ? '0 0 30px rgba(240,122,58,.3)' : '0 12px 24px rgba(0,0,0,.6)',
      faceGlow: today ? '0 0 40px rgba(240,169,59,.45)' : '0 12px 24px rgba(0,0,0,.6)', frame: big ? FRAME.ember : today ? FRAME.gold : 'linear-gradient(160deg,#6b5a3a,#2a2216)',
    };
  });
  const claimLogin = () => {
    if (loginClaimed) return setLoginOpen(false);
    const idx = loginIdx;
    request<{ day: number; reward: string }>({ t: 'login.claim' })
      .then((r) => {
        setJustClaimed(r.reward);
        const k = rwKind(r.reward);
        if (k.isGold || k.isEmber) setTimeout(() => flyTo(k.isGold ? 'gold' : 'embers', q(`[data-ltile="${idx}"]`)[0], 9), 650);
      })
      .catch(() => {});
  };

  const play = () => {
    if (noPlay) return;
    if (isDraft) {
      if (!me!.draftPaid && me!.embers < 750) return toast('You need 750 embers');
      request({ t: 'queue.join', mode: 'draft' }).catch(() => {});
      return;
    }
    if (!deck) return;
    request({ t: 'queue.join', mode, deckId: deck.local ? undefined : deck.id, deckText: deck.local ? toText(deck.data, deck.format) : undefined, deckName: deck.name, face: deck.face }).catch(() => {});
  };
  const foundLeft = found ? Math.max(0, 5 - Math.floor((now - found.at) / 1000)) : 0;
  const goTable = (e?: React.MouseEvent) => {
    e?.preventDefault();
    const f = getState().found;
    if (!f) return;
    setState({ found: null });
    if (f.mode === 'draft' && !f.code) return navigate('/draft');
    if (f.code && f.token) game.join(f.code, f.token);
    navigate('/table');
  };
  // go to the table by itself when the countdown ends
  useEffect(() => {
    if (found && foundLeft === 0) goTable();
  }, [found, foundLeft]);

  const name = nameDraft ?? me?.name ?? 'Planeswalker';
  const v = {
    lay: narrow
      ? { cols: 'minmax(0,1fr) minmax(300px,350px)', rows: 'minmax(0,1fr) auto auto', feat: '1 / 1 / 2 / 2', quests: '2 / 1 / 3 / 2', play: '1 / 2 / 3 / 3', events: '3 / 1 / 4 / 3' }
      : { cols: 'minmax(280px,380px) minmax(0,1fr) minmax(310px,360px)', rows: 'minmax(0,1fr) auto', feat: '1 / 1 / 2 / 3', quests: '2 / 1 / 3 / 2', play: '1 / 3 / 3 / 4', events: '2 / 2 / 3 / 3' },
    rootRef, signedIn: signed, isGuest: !signed && authReady, name, level: lv, youArt: avatarArt(),
    goldTxt: fmt(me?.gold ?? 0), embersTxt: fmt(me?.embers ?? 0),
    anyPop: pops.bell || pops.profile || pops.deckOpen || pops.social || pops.modeOpen, mainZ: pops.deckOpen || pops.modeOpen ? 25 : 3, closePops,
    showDailyChip: signed && !loginClaimed && !loginOpen, openLogin: () => setLoginOpen(true),
    toggleBell: () => {
      setPops((p) => ({ bell: !p.bell, profile: false, social: false, deckOpen: false, modeOpen: false }));
      if (unread) send({ t: 'notes.seen' });
    },
    bellOpen: pops.bell, bellExp: pops.bell ? 'true' : 'false', hasUnread: unread > 0, unread, notes, noNotes: !notes.length,
    toggleSocial: () => setPops((p) => ({ social: !p.social, bell: false, profile: false, deckOpen: false, modeOpen: false })), socialOpen: pops.social, socialExp: pops.social ? 'true' : 'false',
    friendStack: friendsRaw.filter((f) => (f.st === 'online' || f.st === 'game') && !f.pending).map((f) => f.art ?? ART('Jace, the Mind Sculptor')),
    toggleProfile: () => setPops((p) => ({ profile: !p.profile, bell: false, social: false, deckOpen: false, modeOpen: false })), profileOpen: pops.profile,
    onName: (e: any) => setNameDraft(e.target.value),
    signOut: () => {
      closePops();
      if (M.ranked || M.draft) setMode('cmd');
      signOut();
    },
    signIn: () => setSignInOpen(true),
    heroEnter: () => clearTimeout(slideTimer.current), heroLeave: () => startSlide(),
    slides, slideTabs, resetIn: hms(reset.getTime() - now), quests,
    winsCount: `${dailyWins}/5`, winsTitle: dailyWins >= 5 ? 'All daily wins earned' : winRewards[dailyWins] ? `Next win: ${fmt(winRewards[dailyWins].amt)} ${winRewards[dailyWins].cur}` : '', winNodes,
    xpPct: ((me?.xp ?? 0) / (me?.xpPerLevel ?? 1000)) * 100 + '%', xpTxt: `${fmt(me?.xp ?? 0)} / ${fmt(me?.xpPerLevel ?? 1000)} XP`, seasonLeft: days(seasonEnd, now), track,
    events, busy, modeRows, cur: { name: M.name, sub: M.ranked && me ? `100 cards · 1v1 · ${me.rank.name}` : M.sub, ranked: !!M.ranked, tier: me?.rank.tier ?? 'bronze', division: me?.rank.division ?? 4 },
    toggleMode: () => setPops((p) => ({ modeOpen: !p.modeOpen, deckOpen: false, bell: false, profile: false, social: false })), modeOpen: pops.modeOpen, modeExp: pops.modeOpen ? 'true' : 'false', modeRot: pops.modeOpen ? '225deg' : '45deg',
    isDraft, needsDeck: !isDraft, draftArt: ART('Shivan Dragon'), draftArt2: ART('Lightning Bolt'), draftArt3: ART('Llanowar Elves'),
    draftStatus: !signed ? 'Sign in to enter' : me!.draftPaid ? 'Entry paid · rejoin any time tonight' : 'Entry 750 embers · you have ' + fmt(me!.embers),
    sel: deck ? { title: deck.name, art: deck.faceArt ?? '', pips: deck.colors.map(PIP), ...status(deck), edge: valid ? 'rgba(255,255,255,.14)' : '#f0a93b' } : { title: 'No deck yet', art: '', pips: [], status: 'Open the Deck Builder', vc: '#f7c26a', edge: '#f0a93b' },
    toggleDeck: () => setPops((p) => ({ deckOpen: !p.deckOpen, modeOpen: false, bell: false, profile: false, social: false })), deckOpen: pops.deckOpen, deckExp: pops.deckOpen ? 'true' : 'false',
    deckRot: pops.deckOpen ? '225deg' : '45deg', deckArrowM: pops.deckOpen ? '3px' : '-3px',
    deckListTitle: isCmd ? 'COMMANDER DECKS' : M.fmt ? 'STANDARD DECKS' : 'READY DECKS', deckRows,
    showPlay: !busy, noPlay, deckInvalid: !isDraft && !valid && !rankLock && !!deck, deckLink: deck ? `/decks?id=${encodeURIComponent(deck.id)}` : '/decks',
    play, playLabel, playSub,
    playFrame: noPlay ? 'linear-gradient(180deg,#4f5968,#2e3a4a)' : 'linear-gradient(180deg,#fff0c0,#a8742a 50%,#f0c56a)',
    playFill: noPlay ? 'linear-gradient(180deg,#1d242e,#10141a)' : 'linear-gradient(180deg,#ffc25a,#e07a1a 55%,#9a4a10)', playColor: noPlay ? '#5a6472' : '#1b1206',
    playShadow: noPlay ? 'none' : '0 1px 0 rgba(255,230,170,.6)',
    searching: busy, isPodQ: !!pod, isDuelQ: busy && !pod, seats: seatsArr,
    qTitle: queue ? (pod ? `Seating drafters · ${queue.seats?.length ?? 1} of 4` : queue.ranked ? 'Searching ranked' : 'Finding an opponent') : '',
    qTime: `${Math.floor(el / 60)}:${pad(el % 60)}`, qHint: queue ? (pod ? 'Packs open when the table is full. Empty seats get an AI drafter.' : `${MODE[queue.mode]?.name ?? ''} · matching ${deck?.name ?? ''}`) : '',
    cancelQ: () => request({ t: 'queue.leave' }).catch(() => {}),
    friendsOnline: `${friendsRaw.filter((f) => (f.st === 'online' || f.st === 'game') && !f.pending).length} online`, friends,
    toggleAdd: () => setAddOpen((a) => !a), addOpen, addName, onAdd: (e: any) => setAddName(e.target.value),
    sendAdd: () => sendAdd(), addKey: (e: any) => e.key === 'Enter' && sendAdd(),
    noAdd: !addName.trim(), addOp: addName.trim() ? 1 : 0.45,
    hasFound: !!found, found: found ? { kicker: found.kicker?.toUpperCase(), title: found.title ?? (found.opps[0]?.bot ? 'Opponent found' : 'Opponent found'), youSub: found.you.sub, opps: found.opps.map((o) => ({ ...o, art: o.art ?? ART('Liliana of the Veil') })) } : { opps: [] },
    foundCount: found ? (foundLeft > 0 ? `Shuffling up · ${foundLeft}` : 'Your table is ready.') : '',
    leaveFound: () => {
      // the seat stays reserved: the game is waiting at the table
      const f = getState().found;
      setState({ found: null });
      if (f?.code && f.token && f.mode !== 'draft') {
        setState({ inGame: { code: f.code, token: f.token, mode: f.mode } });
        toast('Your table is waiting · open it from the lobby');
      }
    },
    goTable,
    loginOpen: signed && loginOpen, loginDayNum: loginIdx + 1, loginTiles,
    loginSub: loginClaimed ? `${justClaimed ?? loginTrack[loginIdx]} added. Tomorrow: ${loginTrack[(loginIdx + 1) % 7]}.` : `${me?.login.count ?? 0} days collected. Flip today's card.`,
    loginHint: 'Missing a day pauses the week. It never resets.', loginBtn: loginClaimed ? 'CONTINUE' : 'FLIP', loginAct: () => claimLogin(),
    closeLogin: () => setLoginOpen(false), stop: (e: any) => e.stopPropagation(),
    toasts: toasts.map((t) => ({ id: t.id, text: t.text })),
  };
  function sendAdd() {
    const n = addName.trim();
    if (!n) return;
    request<{ name: string }>({ t: 'friends.add', name: n })
      .then((r) => {
        toast(`Request sent to ${r.name}`);
        setAddName('');
        setAddOpen(false);
      })
      .catch(() => {});
  }
  // save a rename when the profile popover closes
  useEffect(() => {
    if (!pops.profile && nameDraft != null && me && nameDraft.trim() && nameDraft.trim() !== me.name) {
      request({ t: 'me.rename', name: nameDraft.trim() }).then(() => toast('Name saved')).catch(() => {}).finally(() => setNameDraft(null));
    } else if (!pops.profile && nameDraft != null) setNameDraft(null);
  }, [pops.profile]);

  return (
    <>
      <LobbyView v={v} />
      {inGame && !found && (
        <button
          onClick={() => {
            game.join(inGame.code, inGame.token);
            navigate('/table');
          }}
          style={{ position: 'fixed', left: '50%', bottom: 18, transform: 'translateX(-50%)', zIndex: 60, padding: '10px 22px', borderRadius: 999, border: '1px solid rgba(240,169,59,.6)', background: 'rgba(15,12,8,.92)', color: '#f7dc9a', fontFamily: 'Cinzel,serif', fontWeight: 800, letterSpacing: '.14em', cursor: 'pointer' }}
        >
          RETURN TO YOUR TABLE
        </button>
      )}
      {signInOpen && <SignIn onClose={() => setSignInOpen(false)} />}
    </>
  );
}

function rankHint(r: { tier: string; division: number; pips: number; mythic?: number }) {
  if (r.tier === 'mythic') return `${r.mythic ?? 0} mythic points`;
  const per = r.tier === 'bronze' ? 2 : 1;
  const wins = Math.ceil((4 - r.pips) / per);
  const tiers = ['bronze', 'silver', 'gold', 'platinum', 'mythic'];
  const nm = (t: string, d: number) => (t === 'mythic' ? 'Mythic' : `${t[0].toUpperCase()}${t.slice(1)} ${d}`);
  const next = r.division > 1 ? nm(r.tier, r.division - 1) : nm(tiers[tiers.indexOf(r.tier) + 1], 4);
  return `${wins === 1 ? 'one win' : `${wins} wins`} to ${next}`;
}
