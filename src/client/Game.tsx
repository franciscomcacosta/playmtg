import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { GameView, CardView } from '../engine/engine';
import type { Action, ManualOp, PlayerIdx, Step, Target, Color } from '../engine/types';
import { STEPS, STEP_LABEL } from '../engine/types';
import type { CardDef } from '../engine/cardTypes';
import { Card, cardImage } from './Card';
import { preload, preloadIdle } from './imgcache';
import { FX, EXILE_TINT, type Box } from './fx';
import { searchCards, type ApiCard } from './api';
import { send } from './store';
import './board.css';

/** Each seat's equipped cosmetics (from the server's room meta) as CSS: playmat art on that half, card backs on that
 *  player's face-down cards, sleeve edges around their hand and library. */
function cosmeticsCss(meta: { seats: any[] } | null | undefined, me: number): string {
  if (!meta?.seats) return '';
  const out: string[] = [];
  const esc = (u: string) => u.replace(/["\\\n]/g, '');
  meta.seats.forEach((seat: any, p: number) => {
    const c = seat?.cosmetics;
    if (!c) return;
    const side = p === me ? 'me' : 'opp';
    if (c.mat?.artUrl)
      out.push(`.gboard .half.${side}{background:linear-gradient(${side === 'me' ? '0deg' : '180deg'},rgba(6,8,12,.5),rgba(6,8,12,.78)),url("${esc(c.mat.artUrl)}") center/cover !important}`);
    const b = c.back?.style;
    if (b?.pattern) {
      out.push(`.gboard .cback[data-owner="${p}"]{background:${b.pattern};border-color:${b.rim}}`);
      out.push(`.gboard .cback[data-owner="${p}"]::before{background:${b.gem};box-shadow:0 0 14px ${b.halo}}`);
    }
    const e = c.sleeve?.style?.edge as string | undefined;
    if (e) {
      const col = (e.match(/#[0-9a-fA-F]{6}/g) ?? [])[1] ?? '#c9a050';
      out.push(`.gboard .cback[data-owner="${p}"]{box-shadow:0 0 0 3px ${col},0 4px 10px rgba(0,0,0,.6)}`);
      if (p === me) out.push(`.gboard .hand2 .hw{position:relative}.gboard .hand2 .hw::before{content:'';position:absolute;inset:-4px;border-radius:10px;background:${e};z-index:-1;box-shadow:0 6px 14px rgba(0,0,0,.5)}`);
    }
  });
  return out.join('\n');
}

type Menu = { x: number; y: number; kind: 'card' | 'player'; iid?: string; player?: PlayerIdx } | null;
type Snap = { cards: Map<string, Box & { img: string | null }>; anchors: Map<string, Box> };

const SHOWN_STEPS: Step[] = STEPS.filter((s) => s !== 'untap' && s !== 'cleanup' && s !== 'firstStrikeDamage');
const COLOR_NAMES: Record<string, string> = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green', C: 'Colorless' };
// Turn dial: 8 segments (designer's PHASES), engine steps map onto them.
const DIAL: { key: string; label: string; steps: Step[] }[] = [
  { key: 'upkeep', label: 'Upkeep', steps: ['untap', 'upkeep'] },
  { key: 'draw', label: 'Draw', steps: ['draw'] },
  { key: 'main1', label: 'Main 1', steps: ['main1'] },
  { key: 'attack', label: 'Attack', steps: ['beginCombat', 'declareAttackers'] },
  { key: 'block', label: 'Block', steps: ['declareBlockers'] },
  { key: 'damage', label: 'Damage', steps: ['firstStrikeDamage', 'combatDamage', 'endCombat'] },
  { key: 'main2', label: 'Main 2', steps: ['main2'] },
  { key: 'end', label: 'End', steps: ['end', 'cleanup'] },
];
const SH = {
  base: '0 4px 12px rgba(0,0,0,.55)',
  play: '0 0 0 2px #f0a93b, 0 0 18px rgba(240,169,59,.55), 0 6px 14px rgba(0,0,0,.6)',
  soft: '0 0 0 2px rgba(240,169,59,.5), 0 4px 12px rgba(0,0,0,.55)',
  sel: '0 0 0 3px #f0a93b, 0 0 26px rgba(240,169,59,.85)',
  red: '0 0 0 3px #ef5a5a, 0 0 26px rgba(239,90,90,.65)',
  blue: '0 0 0 3px #5aa9ef, 0 0 20px rgba(90,169,239,.55)',
  tgt: '0 0 0 3px #5aa9ef, 0 0 30px rgba(90,169,239,.95)',
};
const PCHIP: Record<string, { icon: string; label: string; col: string }> = {
  energy: { icon: '⚡', label: 'ENERGY', col: '#f0d060' },
  experience: { icon: '★', label: 'EXP', col: '#b69cff' },
  rad: { icon: '☢', label: 'RAD', col: '#9be35a' },
  poison: { icon: '☠', label: 'POISON', col: '#9be27a' },
  monarch: { icon: '♛', label: 'MONARCH', col: '#f7dc9a' },
  initiative: { icon: '⚑', label: 'INITIATIVE', col: '#ffb4a8' },
  speed: { icon: '➤', label: 'SPEED', col: '#7fd3ff' },
  ring: { icon: '◯', label: 'RING', col: '#f3d27a' },
};
const LOGC: Record<string, string> = { turn: '#f0a93b', combat: '#ffb4a8', manual: '#ffd28a', warn: '#ff9a9a', chat: '#ffffff' };

function useViewport() {
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const f = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);
  return vp;
}

/** Resolves once the board's one-off animations (not looping glows) have finished, or after `cap` ms. */
async function animationsDone(cap: number) {
  const until = Date.now() + cap;
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let idle = 0;
  await wait(60);
  // animations are often started a little later by timers, so it must stay quiet for two checks in a row
  while (Date.now() < until && idle < 2) {
    const running = document.getAnimations().filter((a) => {
      if (a.playState !== 'running' && !a.pending) return false;
      const end = a.effect?.getComputedTiming().endTime;
      return typeof end === 'number' && Number.isFinite(end);
    });
    if (running.length) {
      idle = 0;
      await Promise.race([Promise.all(running.map((a) => a.finished.catch(() => undefined))), wait(Math.max(0, until - Date.now()))]);
    } else idle++;
    await wait(140);
  }
}

export function Game({ view: incoming, act, onLeave, onRematch, meta, spectating }: { view: GameView; act: (a: Action) => void; onLeave: () => void; onRematch: () => void; meta?: { seats: any[]; mode?: string | null; ranked?: boolean } | null; spectating?: boolean }) {
  // ------------------------------------------------------------------------------------------
  // Display queue: server views are shown one at a time so animations can play in order.
  // ------------------------------------------------------------------------------------------
  const [view, setView] = useState<GameView>(incoming);
  const viewRef = useRef(view);
  viewRef.current = view;
  const queue = useRef<GameView[]>([]);
  const busy = useRef(false);
  const lastSeq = useRef<number>((incoming as any).evSeq ?? 0);
  const pending = useRef<{ evs: any[]; prev: GameView; fast: boolean } | null>(null);
  const commitRes = useRef<(() => void) | null>(null);
  const snapRef = useRef<Snap | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const fxLayerRef = useRef<HTMLDivElement>(null);
  const fxRef = useRef<FX | null>(null);
  const [fresh, setFresh] = useState<string[]>([]);
  const snapBoxes = useRef<Map<string, Box>>(new Map());
  const castGhosts = useRef<HTMLElement[]>([]);
  const hidden = useRef<HTMLElement[]>([]);
  const [modalHold, setModalHold] = useState(false);

  const vp = useViewport();
  const S = Math.min(1, vp.h / 800, vp.w / 1100);
  const W = vp.w / S;
  const H = vp.h / S;
  const scaleRef = useRef(S);
  scaleRef.current = S;

  const me = view.you as PlayerIdx;
  const op = (1 - me) as PlayerIdx;

  const snapshot = useCallback((): Snap | null => {
    const root = boardRef.current;
    if (!root) return null;
    const s = scaleRef.current;
    const rr = root.getBoundingClientRect();
    const cards = new Map<string, Box & { img: string | null }>();
    const anchors = new Map<string, Box>();
    const loc = (r: DOMRect) => ({ x: (r.left - rr.left) / s, y: (r.top - rr.top) / s, w: r.width / s, h: r.height / s });
    root.querySelectorAll<HTMLElement>('[data-iid]').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width) return;
      const img = (el.querySelector('img') as HTMLImageElement | null)?.src ?? null;
      cards.set(el.dataset.iid!, { ...loc(r), img });
    });
    root.querySelectorAll<HTMLElement>('[data-anchor]').forEach((el) => anchors.set(el.dataset.anchor!, loc(el.getBoundingClientRect())));
    return { cards, anchors };
  }, []);

  const spectatingRef = useRef(spectating);
  spectatingRef.current = spectating;
  const pump = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      while (queue.current.length) {
        const nv = queue.current.shift()!;
        const cur = viewRef.current;
        if (nv === cur) continue;
        let evs: any[] = [];
        const seq = (nv as any).evSeq ?? 0;
        if (nv.id !== cur.id || seq < lastSeq.current) lastSeq.current = seq;
        else {
          evs = ((nv as any).events ?? []).filter((e: any) => e.seq > lastSeq.current);
          lastSeq.current = seq;
        }
        // only skip animations when updates really pile up (or the tab is in the background)
        const fast = queue.current.length > 3 || document.hidden;
        // make sure the images of cards that just became visible (a spell cast, a card drawn, a token…) are
        // loaded and decoded before this update is shown, so nothing pops in blank
        {
          const need: (string | undefined)[] = [];
          for (const [iid, c] of Object.entries(nv.cards) as [string, any][]) {
            if (c.hidden || c.faceDown || c.zone === 'library') continue;
            const o = cur.cards[iid] as any;
            if (!o || o.hidden || o.faceDown || o.face !== c.face || o.zone !== c.zone) need.push(imgIn(nv, iid));
          }
          if (need.length) await preload(need, fast ? 250 : 900);
        }
        const fx = fxRef.current;
        if (fx) fx.scale = scaleRef.current;
        if (fx && evs.length && !fast) await preFx(fx, evs, cur, nv).catch(() => undefined);
        for (const g of castGhosts.current.splice(0)) g.remove();
        for (const h of hidden.current.splice(0)) h.style.opacity = '';
        snapRef.current = snapshot();
        pending.current = { evs, prev: cur, fast };
        // new stack items get a short centred "spotlight" before settling at the side
        const oldIds = new Set(cur.stack.map((s: any) => s.id));
        const added = nv.stack.filter((s: any) => !oldIds.has(s.id));
        if (added.length && !fast) {
          const ids = added.map((s: any) => s.id);
          const hold = added.some((s: any) => s.controller !== nv.you) ? 1900 : 800;
          setFresh((f) => [...f, ...ids]);
          setTimeout(() => setFresh((f) => f.filter((x) => !ids.includes(x))), hold);
        }
        await new Promise<void>((res) => {
          commitRes.current = res;
          setView(nv);
        });
        if (!fast && evs.some((e) => e.k === 'turn')) await new Promise((r) => setTimeout(r, 450));
        // let this update's animations finish before showing the next one, then tell the server: paced games
        // wait for every player's screen before moving on, so nothing happens off-screen
        if (!fast && evs.length) await animationsDone(3000);
        if (!spectatingRef.current) send({ t: 'shown', seq });
      }
    } finally {
      busy.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot]);

  useEffect(() => {
    queue.current.push(incoming);
    pump();
  }, [incoming, pump]);

  // warm the cache with your whole deck (and everything already visible) once the game starts
  const deckImgKey = ((incoming as any).deckImages ?? []).length + ':' + incoming.id;
  useEffect(() => {
    const own = ((incoming as any).deckImages ?? []) as string[];
    const seen = Object.keys(incoming.cards).map((iid) => imgIn(incoming, iid));
    preloadIdle([...seen, ...own]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckImgKey]);

  useEffect(() => {
    if (boardRef.current && fxLayerRef.current) fxRef.current = new FX(boardRef.current, fxLayerRef.current);
  }, []);

  // ------------------------------------------------------------------------------------------
  // Game data helpers
  // ------------------------------------------------------------------------------------------
  const cards = view.cards;
  const defs = view.defs as Record<string, CardDef>;
  const P = view.players;
  const prompt = view.prompt as any;
  const myPrompt = !spectating && prompt && prompt.player === me ? prompt : null;

  const [hover, setHover] = useState<string | null>(null);
  const [menu, setMenu] = useState<Menu>(null);
  const [sel, setSel] = useState<any[]>([]);
  const [attacks, setAttacks] = useState<Record<string, number>>({});
  const [blocks, setBlocks] = useState<{ blocker: string; attacker: string }[]>([]);
  const [pendingBlocker, setPendingBlocker] = useState<string | null>(null);
  const [zoneView, setZoneView] = useState<{ player: PlayerIdx; zone: 'graveyard' | 'exile' } | null>(null);
  const [facePick, setFacePick] = useState<string | null>(null);
  const [tokenModal, setTokenModal] = useState(false);
  const [settings, setSettings] = useState(false);
  const [chat, setChat] = useState('');
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [xVal, setXVal] = useState(0);
  const [showManual, setShowManual] = useState(false);
  const [divide, setDivide] = useState<number[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const [tools, setTools] = useState(false);

  useEffect(() => {
    setSel([]);
    setAttacks({});
    setBlocks([]);
    setPendingBlocker(null);
    setXVal(myPrompt?.kind === 'x' ? Math.min(1, myPrompt.max ?? 0) : 0);
    if (myPrompt?.kind === 'divide') {
      const k = myPrompt.targets.length;
      const base = Math.floor(myPrompt.min / k);
      setDivide(Array.from({ length: k }, (_, i) => base + (i < myPrompt.min - base * k ? 1 : 0)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt?.id]);

  const d = (iid: string) => defs[cards[iid]?.defId as string];
  const faceOf = (iid: string) => {
    const df = d(iid);
    const c = cards[iid];
    if (df?.faces && ['transform', 'modal_dfc', 'meld'].includes(df.layout)) return df.faces[c?.face ?? 0];
    return undefined;
  };
  const nameOf = (iid: string) => {
    const df = d(iid);
    if (!df) return 'Hidden card';
    return faceOf(iid)?.name ?? df.name;
  };
  const imgOf = (iid: string): string | undefined => {
    const c = cards[iid];
    if (!c || c.hidden || c.faceDown) return undefined;
    const cp = (c as any).copyOf;
    if (cp?.defId && defs[cp.defId]) return cardImage(defs[cp.defId], cp.face ?? c.face ?? 0);
    return cardImage(d(iid), c.face ?? 0);
  };
  const sortGroup = (iid: string) => {
    const df = d(iid);
    if (!df) return 9;
    const tl = (df.faces && ['transform', 'modal_dfc', 'adventure', 'split'].includes(df.layout) ? df.faces[0].typeLine : df.typeLine).toLowerCase();
    if (/\bland\b/.test(tl) && !/\bcreature\b/.test(tl)) return 0;
    if (/\bcreature\b/.test(tl)) return 1;
    if (/\b(planeswalker|battle|artifact|enchantment)\b/.test(tl)) return 2;
    return 3;
  };
  const arenaSort = (list: string[]) =>
    [...list].sort((a, b) => {
      const ga = sortGroup(a);
      const gb = sortGroup(b);
      if (ga !== gb) return ga - gb;
      const ca = d(a)?.cmc ?? 0;
      const cb = d(b)?.cmc ?? 0;
      if (ca !== cb) return ca - cb;
      return (d(a)?.name ?? '').localeCompare(d(b)?.name ?? '');
    });
  const answer = (choice: any) => act({ type: 'answer', promptId: myPrompt.id, choice });
  const manual = (op2: ManualOp) => act({ type: 'manual', op: op2 });

  const isTargetPrompt = myPrompt?.kind === 'targets';
  const targetKey = (t: Target) => JSON.stringify(t);
  const legalTargetKeys = useMemo(() => new Set<string>((isTargetPrompt ? myPrompt.targets : []).map(targetKey)), [isTargetPrompt, myPrompt]);
  const selectedKeys = new Set(sel.map(targetKey));
  const toggleTarget = (t: Target) => {
    const k = targetKey(t);
    if (!legalTargetKeys.has(k)) return false;
    const max = myPrompt.max ?? 1;
    const next = selectedKeys.has(k) ? sel.filter((x) => targetKey(x) !== k) : sel.length >= max ? [...sel.slice(1), t] : [...sel, t];
    setSel(next);
    // Arena-style: a spell with a fixed number of targets goes as soon as they're chosen
    if (next.length === max && (myPrompt.min ?? 1) === max) answer(next);
    return true;
  };

  const types = (iid: string): string[] => ((cards[iid] as any)?.types ?? []) as string[];
  const isLand = (iid: string) => types(iid).includes('land') && !types(iid).includes('creature');
  const isCreature = (iid: string) => types(iid).includes('creature');
  const attachedTo = (iid: string) => view.battlefield.filter((i) => cards[i]?.attachedTo === iid);
  const attackerSet = new Set(view.combat?.attackers.map((a) => a.iid) ?? []);
  const blockerOf = new Map<string, string>();
  for (const a of view.combat?.attackers ?? []) for (const b of a.blockedBy) blockerOf.set(b, a.iid);
  const onField = (p: PlayerIdx) => view.battlefield.filter((i) => cards[i] && cards[i].controller === p && !(cards[i].attachedTo && cards[cards[i].attachedTo!]?.zone === 'battlefield'));
  const untappedLands = (p: PlayerIdx) => view.battlefield.filter((i) => cards[i]?.controller === p && isLand(i) && !cards[i].tapped).length;
  const describeT = (t: Target) => (t.kind === 'player' ? P[t.idx].name : t.kind === 'card' ? nameOf(t.iid) : 'a spell');

  // ------------------------------------------------------------------------------------------
  // Clicks (unchanged rules logic)
  // ------------------------------------------------------------------------------------------
  const clickCard = (iid: string, e: React.MouseEvent) => {
    const c = cards[iid];
    if (!c) return;
    if (isTargetPrompt) {
      toggleTarget({ kind: 'card', iid });
      return;
    }
    if (myPrompt?.kind === 'declareAttackers') {
      if (!myPrompt.cards.includes(iid)) return;
      setAttacks((a) => {
        const n = { ...a };
        if (iid in n) delete n[iid];
        else n[iid] = 0;
        return n;
      });
      return;
    }
    if (myPrompt?.kind === 'declareBlockers') {
      if (myPrompt.cards.includes(iid)) {
        const existing = blocks.find((b) => b.blocker === iid);
        if (existing) setBlocks(blocks.filter((b) => b.blocker !== iid));
        else setPendingBlocker(pendingBlocker === iid ? null : iid);
        return;
      }
      if (attackerSet.has(iid) && pendingBlocker) {
        setBlocks([...blocks.filter((b) => b.blocker !== pendingBlocker), { blocker: pendingBlocker, attacker: iid }]);
        setPendingBlocker(null);
      }
      return;
    }
    if (myPrompt) return;
    const opts = ((c as any).castOptions ?? []) as { label: string; action: Action; ok: boolean }[];
    if (opts.length && c.zone !== 'battlefield') {
      const ok = opts.filter((o) => o.ok);
      if (opts.length === 1 || ok.length === 1) act((ok[0] ?? opts[0]).action);
      else setFacePick(iid);
      return;
    }
    if (c.zone === 'battlefield' && c.controller === me && c.faceDown && (c as any).faceUpCost && !(c.abilities ?? []).length) {
      setMenu({ x: e.clientX, y: e.clientY, kind: 'card', iid });
      return;
    }
    if (c.zone === 'hand' && c.owner === me) {
      const df = d(iid);
      const multi = df?.faces && ['split', 'adventure', 'modal_dfc', 'prepare', 'omen'].includes(df.layout);
      if (multi) {
        setFacePick(iid);
        return;
      }
      if (/\bLand\b/.test(df?.typeLine ?? '') && !/\b(Creature|Instant|Sorcery)\b/.test(df?.typeLine ?? '')) act({ type: 'playLand', iid });
      else act({ type: 'cast', iid });
      return;
    }
    if (c.zone === 'battlefield' && c.controller === me) {
      const abs = (c.abilities ?? []) as any[];
      const mana = abs.filter((a) => a.isMana);
      if (!c.tapped && mana.length && abs.filter((a) => !a.isMana && a.ok).length === 0) {
        act({ type: 'tapForMana', iid });
        return;
      }
      setMenu({ x: e.clientX, y: e.clientY, kind: 'card', iid });
      return;
    }
    if (c.zone === 'battlefield' && ((c.abilities ?? []) as any[]).some((a) => a.ok && !a.isMana)) {
      setMenu({ x: e.clientX, y: e.clientY, kind: 'card', iid });
      return;
    }
    if (c.zone === 'graveyard' || c.zone === 'exile') setZoneView({ player: c.owner as PlayerIdx, zone: c.zone as any });
  };
  const ctx = (iid: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, kind: 'card', iid });
  };
  const clickPlayer = (p: PlayerIdx, e: React.MouseEvent) => {
    if (isTargetPrompt) {
      toggleTarget({ kind: 'player', idx: p });
      return;
    }
    setMenu({ x: e.clientX, y: e.clientY, kind: 'player', player: p });
  };

  // ------------------------------------------------------------------------------------------
  // Main button (designer's round button inside the turn dial)
  // ------------------------------------------------------------------------------------------
  const PR = { bg: 'radial-gradient(circle at 50% 30%,#f5b44b,#b8621a 70%)', color: '#1b1206' };
  const RD = { bg: 'radial-gradient(circle at 50% 30%,#f06a5a,#9a2a20 70%)', color: '#fff' };
  const GR = { bg: 'radial-gradient(circle at 50% 30%,#2a3240,#161b23 70%)', color: '#8d98a8' };
  const mainButton = (): { label: string; onClick: () => void; disabled?: boolean; bg: string; color: string } => {
    if (view.over) return { label: 'Game over', onClick: () => {}, disabled: true, ...GR };
    if (myPrompt) {
      if (myPrompt.kind === 'targets') {
        const ok = sel.length >= (myPrompt.min ?? 1) && sel.length <= (myPrompt.max ?? 1);
        if (!sel.length && myPrompt.min > 0) return { label: myPrompt.canCancel ? 'Cancel' : 'Choose', onClick: () => myPrompt.canCancel && act({ type: 'cancel', promptId: myPrompt.id }), disabled: !myPrompt.canCancel, ...GR, color: '#e7ebf1' };
        return { label: sel.length ? `Confirm ×${sel.length}` : 'Choose none', onClick: () => ok && answer(sel), disabled: !ok, ...PR };
      }
      if (myPrompt.kind === 'declareAttackers') {
        const n = Object.keys(attacks).length;
        return { label: n ? `Attack ×${n}` : 'No attacks', onClick: () => answer(Object.entries(attacks).map(([iid, ti]) => ({ iid, target: myPrompt.targets[ti] }))), ...(n ? RD : PR) };
      }
      if (myPrompt.kind === 'declareBlockers') return { label: blocks.length ? `Block ×${blocks.length}` : 'No blocks', onClick: () => answer(blocks), ...PR };
      return { label: 'Choose', onClick: () => {}, disabled: true, ...GR };
    }
    if (prompt) return { label: 'Waiting', onClick: () => {}, disabled: true, ...GR };
    if (view.priority !== me) return { label: 'Waiting', onClick: () => {}, disabled: true, ...GR };
    if (view.stack.length) return { label: 'Resolve', onClick: () => act({ type: 'pass' }), ...PR };
    const pass = () => act({ type: 'pass' });
    if (view.active !== me) return { label: 'Pass', onClick: pass, ...PR };
    if (view.step === 'main1') {
      const any = view.battlefield.some((i) => cards[i]?.controller === me && (cards[i] as any).canAttack) || view.battlefield.some((i) => cards[i]?.controller === me && isCreature(i) && !cards[i].tapped && (!cards[i].sick || (cards[i].kw ?? []).includes('haste')));
      return { label: any ? 'To combat' : 'End turn', onClick: pass, ...PR };
    }
    if (view.step === 'main2' || view.step === 'end') return { label: 'End turn', onClick: pass, ...PR };
    return { label: 'Next', onClick: pass, ...PR };
  };
  const mb = mainButton();

  // --- keyboard ---
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (!mb.disabled) mb.onClick();
      }
      if (e.key === 'Escape') {
        setMenu(null);
        setFacePick(null);
        setTools(false);
        if (myPrompt?.canCancel) act({ type: 'cancel', promptId: myPrompt.id });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ------------------------------------------------------------------------------------------
  // Visual state of a card (glow / lift), designer's cv()
  // ------------------------------------------------------------------------------------------
  const visual = (iid: string): { glow: string; tf: string; shimmer: boolean } => {
    const c = cards[iid];
    let glow = SH.base;
    let tf = '';
    let shimmer = false;
    if (!c) return { glow, tf: 'none', shimmer };
    const tk: Target = { kind: 'card', iid };
    const land = isLand(iid);
    if (c.zone === 'hand') {
      if (c.playable && !myPrompt) {
        glow = SH.play;
        shimmer = true;
      }
      if (hover === iid) tf = 'translateY(-34px) scale(1.12)';
    } else if (c.playable && !myPrompt) {
      glow = SH.soft;
      shimmer = true;
    }
    if (c.zone === 'battlefield') {
      const tap = c.tapped ? (land ? ' rotate(90deg) scale(.7)' : ' rotate(90deg) scale(.8)') : '';
      tf = tap;
      const mine = c.controller === me;
      if (myPrompt?.kind === 'declareAttackers' && mine) {
        if (iid in attacks) {
          glow = SH.red;
          tf = 'translateY(-28px)';
        } else if (myPrompt.cards.includes(iid)) glow = SH.soft;
      }
      if (attackerSet.has(iid)) {
        glow = SH.red;
        tf = `translateY(${mine ? -16 : 16}px)` + tap;
      }
      if (blockerOf.has(iid)) {
        glow = SH.blue;
        tf = `translateY(${mine ? -10 : 10}px)` + tap;
      }
      if (myPrompt?.kind === 'declareBlockers') {
        const planned = blocks.find((b) => b.blocker === iid);
        if (pendingBlocker === iid) {
          glow = SH.sel;
          tf = 'translateY(-12px)';
        } else if (planned) {
          glow = SH.blue;
          tf = 'translateY(-10px)';
        } else if (myPrompt.cards.includes(iid)) glow = SH.soft;
        else if (pendingBlocker && attackerSet.has(iid)) glow = SH.tgt;
      }
    }
    if (legalTargetKeys.has(targetKey(tk))) glow = SH.tgt;
    if (selectedKeys.has(targetKey(tk))) glow = SH.sel;
    return { glow, tf: tf || 'none', shimmer };
  };

  // ------------------------------------------------------------------------------------------
  // Board card renderer
  // ------------------------------------------------------------------------------------------
  const renderCardFace = (iid: string, small = false) => {
    const c = cards[iid];
    const img = imgOf(iid);
    if (!c || c.hidden || c.faceDown) {
      return (
        <>
          <div className="cback" data-owner={c?.owner ?? ''} />
          {c?.faceDown && !c.hidden && <div className="facedown-peek">{nameOf(iid)}</div>}
        </>
      );
    }
    if (img) return <img src={img} alt={nameOf(iid)} draggable={false} decoding="async" />;
    const df = d(iid);
    if (c.token || df?.layout === 'token')
      return (
        <div className="tcard">
          <div className="art" />
          <div className="tn">{nameOf(iid)}</div>
          <div className="tt">TOKEN</div>
        </div>
      );
    return (
      <div className="tcard plain">
        <div className="tn">{nameOf(iid)}</div>
        {!small && <div className="tx">{df?.oracle}</div>}
      </div>
    );
  };

  const BCard = ({ iid, style, small, cls = '', showPT = true, sickTop = true, badge }: { iid: string; key?: string; style?: React.CSSProperties; small?: boolean; cls?: string; showPT?: boolean; sickTop?: boolean; badge?: string }) => {
    const c = cards[iid];
    if (!c) return null;
    const v = visual(iid);
    const onBf = c.zone === 'battlefield';
    const creature = onBf && isCreature(iid);
    const haste = (c.kw ?? []).includes('haste');
    const sick = creature && !!c.sick && !haste && view.active === c.controller;
    const face = faceOf(iid);
    const basePow = +((face ? face.power : d(iid)?.power) ?? 0);
    const baseTou = +((face ? face.toughness : d(iid)?.toughness) ?? 0);
    const ptColor = c.damage ? '#ff9a9a' : (c.p ?? 0) > basePow || (c.t ?? 0) > baseTou ? '#7ef0b8' : (c.p ?? 0) < basePow || (c.t ?? 0) < baseTou ? '#ff9a9a' : '#e7ebf1';
    const counters = Object.entries(c.counters ?? {}).filter(([, n]) => n);
    return (
      <div
        key={iid}
        className={`bc ${small ? 'sm' : ''} ${v.shimmer ? 'shimmer' : ''} ${cls}`}
        data-iid={iid}
        style={style}
        onClick={(e) => clickCard(iid, e)}
        onContextMenu={ctx(iid)}
        onMouseEnter={() => setHover(iid)}
        onMouseLeave={() => setHover((h) => (h === iid ? null : h))}
      >
        <div className="bc-in" style={{ boxShadow: v.glow, transform: v.tf }}>
          {renderCardFace(iid, small)}
          {sick && <div className="sick-veil" />}
          {sick && sickTop && !small && (
            <div className="sick-badge">
              <span>☾</span>
              <span>
                SUMMONING
                <br />
                SICK
              </span>
            </div>
          )}
          {showPT && creature && c.p != null && (
            <div className="ptbox" data-pt={iid} style={{ color: ptColor }}>
              {c.p}/{(c.t ?? 0) - (c.damage ?? 0)}
            </div>
          )}
          {counters.length > 0 && (
            <div className="cchips">
              {counters.map(([k, n]) => (
                <span key={k} data-chip={`${iid}:${k}`} className={`cchip ${k === '+1/+1' ? 'plus' : k === '-1/-1' ? 'minus' : k}`}>
                  {k === 'loyalty' ? `◆ ${n}` : k === '+1/+1' ? `+1/+1${n > 1 ? ` ×${n}` : ''}` : k === '-1/-1' ? `−1/−1${n > 1 ? ` ×${n}` : ''}` : `${k[0].toUpperCase()}${k.slice(1)} ${n}`}
                </span>
              ))}
            </div>
          )}
          {(c as any).classLevel > 1 && (
            <div className="lvchip" data-lv={iid}>
              Lv {(c as any).classLevel}
            </div>
          )}
          {(c as any).copyOf && c.token && <div className="kchip" style={{ borderColor: '#8fc4f5', color: '#bfe0ff' }}>Copy</div>}
          {(c as any).prepared && c.zone === 'battlefield' && <div className="kchip" style={{ borderColor: '#7fd3ff', color: '#bfe9ff', bottom: 78 }}>Prepared</div>}
          {((c as any).chosenType || (c as any).chosenColor) && c.zone === 'battlefield' && <div className="kchip" style={{ borderColor: '#f0a93b', color: '#f7dc9a', bottom: 58 }}>{(c as any).chosenType ?? { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' }[(c as any).chosenColor as string]}</div>}
          {c.zone === 'exile' && (c as any).foretold != null && <div className="kchip" style={{ borderColor: '#d6c8ff', color: '#d6c8ff' }}>Foretold</div>}
          {(c as any).auto === 'manual' && <div className="manflag" title="Not automated — resolve by hand">✋</div>}
        </div>
        {badge && <div className="blockbadge">{badge}</div>}
      </div>
    );
  };

  // ------------------------------------------------------------------------------------------
  // Layout: creature groups (designer's groups()), land/other stacks (stacks())
  // ------------------------------------------------------------------------------------------
  const visKey = (iid: string) => {
    const v = visual(iid);
    const c = cards[iid];
    return [c.defId, c.face, c.tapped, c.sick, c.damage, c.p, c.t, JSON.stringify(c.counters), (c.kw ?? []).join(','), c.faceDown, c.hidden, (c as any).copyOf?.defId, (c as any).classLevel, c.playable, v.glow, v.tf].join('|');
  };
  const attackKey = (iid: string) => blocks.find((b) => b.blocker === iid);
  type Group = { cards: string[]; x: number; w: number; h: number; att: string[] };
  const creatureGroups = (p: PlayerIdx, K: number): Group[] => {
    const cw = Math.round(112 * K);
    const ch = Math.round(156 * K);
    const OFF = Math.max(9, Math.round(14 * K));
    const GAP = Math.round(26 * K);
    const cb = view.combat;
    const crs = arenaSort(onField(p).filter((i) => !isLand(i) && isCreature(i)));
    const inCombat = (iid: string) => attackerSet.has(iid) || blockerOf.has(iid) || !!attackKey(iid);
    const map = new Map<string, string[]>();
    for (const c of crs) {
      const key = inCombat(c) || attachedTo(c).length ? c : visKey(c);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    const gs: Group[] = [...map.values()].map((cs) => ({ cards: cs, x: 0, w: cw + Math.min(cs.length - 1, 3) * OFF, h: ch, att: cs.length === 1 ? attachedTo(cs[0]) : [] }));
    const atk = cb?.attackers ?? [];
    if (!atk.length && !blocks.length) {
      const total = gs.reduce((t, g) => t + g.w, 0) + GAP * Math.max(0, gs.length - 1);
      let x = -total / 2;
      gs.forEach((g) => {
        g.x = x;
        x += g.w + GAP;
      });
    } else {
      const Wc = cw + GAP;
      const M = Math.max(atk.length, 1);
      const idle: Group[] = [];
      const used = new Map<number, number>();
      gs.forEach((g) => {
        const id = g.cards[0];
        let col = -1;
        if (g.cards.length === 1) {
          col = atk.findIndex((a) => a.iid === id);
          if (col < 0) col = atk.findIndex((a) => a.blockedBy.includes(id));
          if (col < 0) {
            const pl = attackKey(id);
            if (pl) col = atk.findIndex((a) => a.iid === pl.attacker);
          }
        }
        if (col >= 0) {
          const j = used.get(col) ?? 0;
          used.set(col, j + 1);
          g.x = (col - (M - 1) / 2) * Wc - cw / 2 + j * Math.round(cw * 0.35);
        } else idle.push(g);
      });
      const edge = (M * Wc) / 2 + GAP;
      const half = Math.ceil(idle.length / 2);
      let x = -edge;
      idle.slice(0, half).forEach((g) => {
        x -= g.w;
        g.x = x;
        x -= GAP;
      });
      x = edge;
      idle.slice(half).forEach((g) => {
        g.x = x;
        x += g.w + GAP;
      });
    }
    return gs;
  };
  const extent = (gs: Group[]) => gs.reduce((m, g) => Math.max(m, Math.abs(g.x), Math.abs(g.x + g.w)), 0) * 2;
  const stacks = (p: PlayerIdx, pred: (iid: string) => boolean) => {
    const map = new Map<string, string[]>();
    for (const c of arenaSort(onField(p).filter(pred))) {
      const key = attachedTo(c).length ? c : visKey(c);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return [...map.values()];
  };

  // sizes
  const matH = (H - 72 - 96 - 140) / 2 - 8;
  const landRowH = Math.max(76, Math.min(108, matH * 0.4));
  const LK = landRowH / 108;
  const areaH = matH - landRowH;
  const avail = Math.max(400, W - 48 - 90);
  const need = Math.max(extent(creatureGroups(me, 1)), extent(creatureGroups(op, 1)), 1);
  // creatures sit LIFT px away from the middle bar: attacking / blocking cards slide toward it by up to 28px
  const LIFT = 32;
  const K = Math.max(0.45, Math.min(1, avail / need, (areaH - 10 - LIFT) / 156));

  const renderLandRow = (p: PlayerIdx) => {
    const lands = stacks(p, isLand);
    const others = stacks(p, (i) => !isLand(i) && !isCreature(i));
    const all = [...lands.map((g) => ({ g, land: true })), ...others.map((g) => ({ g, land: false }))];
    const cw0 = 70 * LK;
    const needW = all.reduce((t, { g }) => t + cw0 + Math.min(g.length - 1, 6) * 12 * LK + 22, 0) + 300;
    const L = Math.max(0.5, Math.min(1, W / 1 / Math.max(needW, 1))) * LK;
    const cw = Math.round(70 * L);
    const chh = Math.round(98 * L);
    const off = Math.round(12 * L);
    const renderStack = (g: string[], key: string) => (
      <div key={key} className="stackgrp" style={{ width: cw + Math.min(g.length - 1, 6) * off, height: chh + attachedTo(g[0]).length * 16 }}>
        {g.length === 1 &&
          attachedTo(g[0]).map((a, i) => BCard({ iid: a, small: true, style: { left: 0, top: i * 16, width: cw, height: chh, zIndex: 0 }, showPT: false }))}
        {g.map((iid, i) => (
          BCard({ iid: iid, small: true, style: { left: Math.min(i, 6) * off, top: g.length === 1 ? attachedTo(g[0]).length * 16 : 0, width: cw, height: chh } })
        ))}
        {g.length > 1 && <div className="xn">×{g.length}</div>}
      </div>
    );
    return (
      <div className="landrow" style={{ height: landRowH, gap: Math.round(22 * L) }}>
        {lands.map((g) => renderStack(g, 'l' + g[0]))}
        {lands.length > 0 && others.length > 0 && <div className="divider" style={{ height: 80 * L }} />}
        {others.map((g) => renderStack(g, 'o' + g[0]))}
      </div>
    );
  };

  const renderCreatures = (p: PlayerIdx) => {
    const gs = creatureGroups(p, K);
    const cw = Math.round(112 * K);
    const ch = Math.round(156 * K);
    const OFF = Math.max(9, Math.round(14 * K));
    const top = p === me;
    return (
      <div className="crarea">
        {gs.map((g) => {
          const attH = g.att.length * 22;
          return (
            <div key={g.cards[0]} style={{ position: 'absolute', [top ? 'top' : 'bottom']: LIFT, left: `calc(50% + ${g.x}px)`, width: g.w, height: g.h + attH } as React.CSSProperties}>
              {g.att.map((a, i) => (
                BCard({ iid: a, style: { left: 0, top: i * 22, width: cw, height: ch, zIndex: 0 }, showPT: false })
              ))}
              {g.cards.map((iid, i) => {
                const pl = blocks.find((b) => b.blocker === iid);
                const badge = pl ? `blocks ${nameOf(pl.attacker)}` : iid in attacks && myPrompt?.targets?.length > 1 ? `→ ${describeT(myPrompt.targets[attacks[iid]])}` : undefined;
                return BCard({ iid: iid, style: { left: Math.min(i, 3) * OFF, top: attH, width: cw, height: ch, zIndex: 1 + i }, showPT: i === g.cards.length - 1, sickTop: i === g.cards.length - 1, badge: badge });
              })}
              {g.cards.length > 1 && <div className="xn">×{g.cards.length}</div>}
            </div>
          );
        })}
      </div>
    );
  };

  const corners = (top: string, bottom: string) => (
    <>
      <span className="corner" style={{ top: 10, left: 12 }}>◆</span>
      <span className="corner" style={{ top: 10, right: 12 }}>◆</span>
      <span className="corner" style={{ bottom: 10, left: 12 }}>◆</span>
      <span className="corner" style={{ bottom: 10, right: 12 }}>◆</span>
      <span className="mlabel" style={{ top: 16 }}>{top}</span>
      <span className="mlabel" style={{ bottom: 16 }}>{bottom}</span>
    </>
  );

  // ------------------------------------------------------------------------------------------
  // Avatars, piles
  // ------------------------------------------------------------------------------------------
  const avatarArt = (p: PlayerIdx): string | null => meta?.seats?.[p]?.cosmetics?.avatar?.artUrl ?? null;
  const avatar = (p: PlayerIdx, style?: React.CSSProperties) => {
    const pl = P[p] as any;
    const tk: Target = { kind: 'player', idx: p };
    const tg = legalTargetKeys.has(targetKey(tk));
    const sl = selectedKeys.has(targetKey(tk));
    const ring = sl ? '#f0a93b' : tg ? '#5aa9ef' : view.active === p ? '#f0a93b' : '#2e3a4a';
    const glow = sl ? SH.sel : tg ? '0 0 0 4px rgba(90,169,239,.35), 0 0 28px rgba(90,169,239,.75)' : view.active === p ? '0 0 22px rgba(240,169,59,.35)' : '0 6px 18px rgba(0,0,0,.4)';
    const pool = Object.entries(pl.pool as Record<string, number>).filter(([, v]) => v > 0);
    const chips: [string, number][] = [];
    if (pl.monarch) chips.push(['monarch', 1]);
    if (pl.initiative) chips.push(['initiative', 1]);
    if (pl.dungeon?.room) chips.push(['dungeon:' + pl.dungeon.room, 1]);
    for (const [src, n] of Object.entries((pl.commanderDamage ?? {}) as Record<string, number>)) if (n > 0) chips.push(['cmd:' + src, n]);
    if (pl.poison > 0) chips.push(['poison', pl.poison]);
    if (pl.speed > 0) chips.push(['speed', pl.speed]);
    if (pl.ringLevel > 0) chips.push(['ring', pl.ringLevel]);
    for (const [k, v] of Object.entries(pl.counters ?? {})) if ((v as number) > 0) chips.push([k, v as number]);
    return (
      <div
        className="avatar-pill"
        data-target={`p${p}`}
        style={{ borderColor: ring, boxShadow: glow, ...style }}
        onClick={(e) => clickPlayer(p, e)}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY, kind: 'player', player: p });
        }}
      >
        <div className="life" data-life={p} style={avatarArt(p) ? { backgroundImage: `radial-gradient(circle,rgba(10,14,20,.25),rgba(10,14,20,.7)),url('${avatarArt(p)}')`, backgroundSize: 'cover', backgroundPosition: 'center 22%', textShadow: '0 2px 6px #000,0 0 2px #000' } : undefined}>{pl.life}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span className="nm">
            {pl.name}
            {!pl.connected && <span style={{ color: '#8d98a8', fontWeight: 500 }}> (offline)</span>}
          </span>
          <span className="sub">
            {p === op ? `${pl.hand.length} in hand · ` : ''}
            {untappedLands(p)} mana open
            {pool.map(([k, v]) => (
              <span key={k} className={`pool-dot m-${k}`} title="Floating mana" onClick={(e) => { e.stopPropagation(); if (p === me) manual({ op: 'mana', color: k as Color, delta: -1 }); }}>
                {v}
              </span>
            ))}
          </span>
        </div>
        {chips.length > 0 && (
          <div className={`pchips ${p === me ? 'above' : 'below'}`}>
            {chips.map(([k, v]) => {
              const m = k.startsWith('dungeon:') ? { icon: '⌂', label: k.slice(8).toUpperCase(), col: '#d6c8ff' } : k.startsWith('cmd:') ? { icon: '⚔', label: `${nameOf(k.slice(4)).split(',')[0].toUpperCase()}`, col: v >= 15 ? '#ff6b5a' : '#ffb4a8' } : PCHIP[k] ?? { icon: '', label: k.toUpperCase(), col: '#f7dc9a' };
              return (
                <span key={k} className="pchip" data-pchip={`${p}:${k}`} style={{ color: m.col }}>
                  {m.icon} {m.label}{k === 'monarch' || k === 'initiative' || k.startsWith('dungeon:') ? '' : k.startsWith('cmd:') ? ` ${v}/21` : ` ${v}`}
                </span>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const stripSet = new Set<string>();
  for (const [iid, c] of Object.entries(cards)) {
    if ((c.zone === 'graveyard' || c.zone === 'exile') && ((c as any).castOptions ?? []).some((o: any) => o.ok) && !myPrompt) stripSet.add(iid);
  }
  const pile = (p: PlayerIdx, zone: 'graveyard' | 'exile' | 'library', size: 'sm' | 'md') => {
    const pl = P[p] as any;
    const list: string[] = zone === 'library' ? [] : pl[zone];
    const top = list[list.length - 1];
    const n = zone === 'library' ? pl.libraryCount : list.length;
    const anchor = zone === 'library' ? `lib${p}` : zone === 'graveyard' ? `gy${p}` : `ex${p}`;
    const title = zone === 'library' ? 'Library' : zone === 'graveyard' ? 'Graveyard' : 'Exile';
    const tg = top && legalTargetKeys.has(targetKey({ kind: 'card', iid: top }));
    return (
      <div
        className={`gpile ${size} ${zone === 'exile' ? 'exile' : ''} ${zone === 'library' ? 'lib' : ''}`}
        data-anchor={anchor}
        title={title}
        onClick={() => zone !== 'library' && setZoneView({ player: p, zone })}
        style={tg ? { boxShadow: SH.tgt } : undefined}
      >
        {size === 'md' && <span className="lbl">{zone === 'library' ? 'LIBRARY' : zone === 'graveyard' ? 'GRAVE' : 'EXILE'}</span>}
        {zone === 'library' ? (
          n > 0 ? (pl.libraryTop && imgOf(pl.libraryTop) ? <div className="top" data-iid={pl.libraryTop} onClick={(e) => { e.stopPropagation(); clickCard(pl.libraryTop!, e); }} onMouseEnter={() => setHover(pl.libraryTop)} onMouseLeave={() => setHover((h) => (h === pl.libraryTop ? null : h))}><img src={imgOf(pl.libraryTop)} alt="" draggable={false} style={{ filter: 'none' }} /></div> : <div className="cback" data-owner={p} />) : null
        ) : top && !stripSet.has(top) ? (
          <div className="top" data-iid={top} onMouseEnter={() => setHover(top)} onMouseLeave={() => setHover((h) => (h === top ? null : h))}>
            {imgOf(top) ? <img src={imgOf(top)} alt="" draggable={false} /> : <div className="cback" />}
          </div>
        ) : null}
        <div className="n">{n}</div>
      </div>
    );
  };

  const commandPile = (p: PlayerIdx, size: 'sm' | 'md') => {
    const list: string[] = ((P[p] as any).command ?? []) as string[];
    if ((view as any).format !== 'commander') return null;
    const top = list[0];
    const casts = ((P[p] as any).commanderCasts ?? {}) as Record<string, number>;
    const tax = top ? 2 * (casts[top] ?? 0) : 0;
    const playable = top && ((cards[top] as any)?.castOptions ?? []).some((o: any) => o.ok);
    return (
      <div className={`gpile ${size} cmdzone`} data-anchor={`cmd${p}`} title="Command zone" style={playable ? { boxShadow: SH.play } : undefined}
        onClick={(e) => top && clickCard(top, e)}
        onContextMenu={(e) => { if (top) { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, kind: 'card', iid: top }); } }}>
        {size === 'md' && <span className="lbl">COMMAND</span>}
        {top && (
          <div className="top" data-iid={top} onMouseEnter={() => setHover(top)} onMouseLeave={() => setHover((h) => (h === top ? null : h))}>
            {imgOf(top) ? <img src={imgOf(top)} alt="" draggable={false} style={{ filter: 'none' }} /> : <div className="cback" />}
          </div>
        )}
        {tax > 0 && <div className="n" title="Commander tax">+{tax}</div>}
      </div>
    );
  };

  // ------------------------------------------------------------------------------------------
  // Hand fan (designer's formula)
  // ------------------------------------------------------------------------------------------
  const hand = arenaSort(P[me].hand);
  const nH = hand.length;
  const handAvail = Math.max(300, W - 540);
  const renderHand = () => (
    <div className="hand2" data-anchor={`hand${me}`}>
      {hand.map((iid, i) => {
        const k = i - (nH - 1) / 2;
        const hov = hover === iid;
        const ov = nH > 1 ? Math.max(28, (nH * 140 - handAvail) / (nH - 1)) : 0;
        const m = -Math.min(ov / 2, 58);
        const rot = hov ? 0 : k * Math.min(3, 24 / nH);
        const dy = hov ? -4 : k * k * Math.min(2.4, 20 / nH);
        return (
          <div key={iid} className="hw" style={{ margin: `0 ${m}px`, transform: `rotate(${rot}deg) translateY(${dy}px)`, zIndex: hov ? 60 : 10 + i }}>
            {BCard({ iid: iid })}
          </div>
        );
      })}
    </div>
  );

  // ------------------------------------------------------------------------------------------
  // Stack spotlight
  // ------------------------------------------------------------------------------------------
  const stackItems = view.stack as any[];
  const anyFresh = stackItems.some((it) => fresh.includes(it.id));
  const spotLayout = (i: number, n: number, big: boolean) => {
    if (big) {
      const w = 260;
      const h = 363;
      const cx = W / 2;
      const cy = H / 2;
      const back = n - 1 - i;
      return { left: cx - w / 2 - back * 110, top: cy - h / 2 - 20 + back * 24, width: w, height: h };
    }
    // Resting stack: a column on the right, kept clear of the phase dial / Resolve button (which sit on the
    // middle bar at the right edge), so you can always see the stack and still respond or resolve.
    const w = 150;
    const h = 209;
    const step = 64;
    const total = h + (n - 1) * step;
    const top = Math.max(96, Math.min(H / 2 - total / 2 - 20, H - 260 - total));
    return { left: W - 24 - w - 340, top: top + i * step, width: w, height: h };
  };
  const renderSpot = () =>
    stackItems.slice(-6).map((it, i, arr) => {
      const n = arr.length;
      const lay = spotLayout(i, n, anyFresh);
      const src = cards[it.source];
      const isSpell = it.kind === 'spell' && src?.zone === 'stack' && !it.isCopy;
      const img = src && !src.hidden && !src.faceDown ? imgOf(it.source) : undefined;
      const tk: Target = { kind: 'stack', id: it.id };
      const tg = legalTargetKeys.has(targetKey(tk));
      const sl = selectedKeys.has(targetKey(tk));
      const tgts = (it.targets ?? []).flat() as Target[];
      const cap = `${it.controller === me ? 'You' : P[it.controller].name}: ${it.label}${tgts.length ? ' → ' + tgts.map(describeT).join(', ') : ''}${it.x ? ` (X=${it.x})` : ''}`;
      return (
        <div
          key={it.id}
          className={`spot ${anyFresh ? 'big' : ''} ${it.controller !== me ? 'opp' : ''} ${tg ? 'tgt' : ''} ${sl ? 'sel' : ''}`}
          data-sid={it.id}
          {...(isSpell ? { 'data-iid': it.source } : {})}
          style={{ ...lay, zIndex: 41 + i, pointerEvents: 'auto', cursor: tg ? 'pointer' : 'default' }}
          onClick={() => tg && toggleTarget(tk)}
          onMouseEnter={() => setHover(it.source)}
          onMouseLeave={() => setHover((h) => (h === it.source ? null : h))}
        >
          <div className="sp-in">{img ? <img src={img} alt="" draggable={false} /> : <div className="tcard plain"><div className="tn">{it.label}</div><div className="tx">{it.text}</div></div>}</div>
          {!isSpell && <div className="ab-tag">{it.isCopy ? 'Copy' : it.kind === 'trigger' ? 'Trigger' : 'Ability'}</div>}
          {isSpell && src?.kicked && <div className="kicked">KICKED</div>}
          {(i === n - 1 || !anyFresh) && <div className="sp-cap" title={cap}>{cap}</div>}
        </div>
      );
    });

  // ------------------------------------------------------------------------------------------
  // Targeting arrow & exile tethers
  // ------------------------------------------------------------------------------------------
  const arrowRef = useRef<SVGPathElement>(null);
  const retRef = useRef<SVGCircleElement>(null);
  const castingIid = (view.casting as any)?.iid as string | undefined;
  const showArrow = isTargetPrompt && !!castingIid;
  const targetEl = (t: Target) =>
    boardRef.current?.querySelector(t.kind === 'player' ? `[data-target="p${t.idx}"]` : t.kind === 'card' ? `[data-iid="${CSS.escape(t.iid)}"]` : `[data-sid="${CSS.escape(t.id)}"]`) as HTMLElement | null;
  useLayoutEffect(() => {
    if (!showArrow || !sel.length || !boardRef.current) return;
    const el = targetEl(sel[sel.length - 1]);
    if (!el) return;
    const r = el.getBoundingClientRect();
    onMove({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, locked: true } as any);
  });
  const onMove = (e: React.MouseEvent) => {
    if (!showArrow || !arrowRef.current || !boardRef.current || !castingIid) return;
    if (sel.length && !(e as any).locked) return;
    const root = boardRef.current;
    const src = root.querySelector(`[data-iid="${CSS.escape(castingIid)}"]`);
    if (!src) return;
    const r = root.getBoundingClientRect();
    const a = src.getBoundingClientRect();
    const sx = (a.left + a.width / 2 - r.left) / S;
    const sy = (a.top + a.height * 0.4 - r.top) / S;
    const tx = (e.clientX - r.left) / S;
    const ty = (e.clientY - r.top) / S;
    const cx = (sx + tx) / 2;
    const cy = Math.min(sy, ty) - 90;
    arrowRef.current.setAttribute('d', `M${sx},${sy} Q${cx},${cy} ${tx},${ty}`);
    retRef.current?.setAttribute('cx', String(tx));
    retRef.current?.setAttribute('cy', String(ty));
  };
  const [tethers, setTethers] = useState<string[]>([]);
  useLayoutEffect(() => {
    const root = boardRef.current;
    if (!root) return;
    const out: string[] = [];
    const rr = root.getBoundingClientRect();
    for (const b of view.battlefield) {
      const linked = ((cards[b] as any)?.linked ?? []).filter((l: string) => cards[l]?.zone === 'exile');
      if (!linked.length) continue;
      // "exiled until this leaves" link: only drawn while you hover the card holding it, or a card it exiled
      if (hover !== b && !linked.includes(hover as string)) continue;
      const se = root.querySelector(`[data-iid="${CSS.escape(b)}"]`);
      const owner = cards[linked[0]].owner;
      const te = root.querySelector(`[data-anchor="ex${owner}"]`);
      if (!se || !te) continue;
      const a = se.getBoundingClientRect();
      const t = te.getBoundingClientRect();
      const sx = (a.left + a.width / 2 - rr.left) / S;
      const sy = (a.top + a.height / 2 - rr.top) / S;
      const tx = (t.left + t.width / 2 - rr.left) / S;
      const ty = (t.top + t.height / 2 - rr.top) / S;
      out.push(`M${sx},${sy} Q${(sx + tx) / 2},${Math.max(sy, ty) + 40} ${tx},${ty}`);
    }
    if (out.join() !== tethers.join()) setTethers(out);
  });

  // ------------------------------------------------------------------------------------------
  // After each displayed view: FLIP zone moves + event animations
  // ------------------------------------------------------------------------------------------
  useLayoutEffect(() => {
    const pend = pending.current;
    pending.current = null;
    const res = commitRes.current;
    commitRes.current = null;
    const fx = fxRef.current;
    if (pend && fx && boardRef.current) {
      fx.scale = scaleRef.current;
      snapBoxes.current = snapRef.current ? new Map(snapRef.current.cards) : new Map();
      try {
        flipAll(fx, pend.prev, view, pend.evs, pend.fast);
        if (!pend.fast) postFx(fx, pend.evs, pend.prev, view);
      } catch (err) {
        console.warn('animation error', err);
      }
    }
    res?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const anchorName = (zone: string | undefined, owner: number) =>
    zone === 'library' ? `lib${owner}` : zone === 'graveyard' ? `gy${owner}` : zone === 'exile' ? `ex${owner}` : zone === 'hand' ? `hand${owner}` : zone === 'stack' ? 'spot' : null;

  function flipAll(fx: FX, prev: GameView, next: GameView, evs: any[], fast: boolean) {
    const old = snapRef.current;
    snapRef.current = null;
    const root = boardRef.current!;
    if (!old) return;
    const moves = new Map<string, any>();
    for (const e of evs) if (e.k === 'move') moves.set(e.iid, { ...(moves.get(e.iid) ?? { from: e.from }), to: e.to, replaced: e.replaced || moves.get(e.iid)?.replaced });
    const dur = fast ? 260 : 560;
    const present = new Set<string>();
    const cur = snapshot();
    root.querySelectorAll<HTMLElement>('[data-iid]').forEach((el) => {
      const id = el.dataset.iid!;
      present.add(id);
      el.getAnimations().forEach((a) => a.cancel());
      const n = cur?.cards.get(id);
      if (!n) return;
      const pz = prev.cards[id]?.zone;
      const nz = next.cards[id]?.zone;
      let o: Box | undefined = old.cards.get(id);
      const mv = moves.get(id);
      if (!o) {
        const fromZone = mv?.from ?? pz;
        const an = anchorName(fromZone, (next.cards[id]?.owner ?? 0) as number);
        o = an ? old.anchors.get(an) : undefined;
        if (!o) {
          if (!fast) fx.appear(el);
          return;
        }
      }
      const dx = o.x - n.x;
      const dy = o.y - n.y;
      const sx = o.w / n.w;
      const sy = o.h / n.h;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < 0.02) return;
      const T0 = `translate(${dx}px,${dy}px) scale(${sx},${sy})`;
      let frames: Keyframe[] = [{ transform: T0 }, { transform: 'none' }];
      let d2 = dur;
      if (pz === 'battlefield' && nz === 'graveyard' && !fast) {
        frames = [
          { transform: T0, filter: 'none' },
          { transform: T0 + ' rotate(-6deg) scale(.9)', filter: 'grayscale(1) brightness(1.7)', offset: 0.4 },
          { transform: 'none', filter: 'none' },
        ];
        d2 = 1000;
      } else if (mv?.replaced && nz === 'exile' && !fast) {
        const gy = old.anchors.get(`gy${next.cards[id]?.owner ?? 0}`);
        if (gy) {
          const mx = o.x + (gy.x - o.x) * 0.55 - n.x;
          const my = o.y + (gy.y - o.y) * 0.55 - n.y;
          frames = [
            { transform: T0, filter: 'grayscale(1) brightness(1.5)' },
            { transform: `translate(${mx}px,${my}px) scale(${(sx + 1) / 2}) rotate(8deg)`, filter: 'grayscale(1) brightness(1.2)', offset: 0.42 },
            { transform: 'none', filter: 'none' },
          ];
          d2 = 1100;
        }
      } else if (pz === 'library' && nz === 'exile' && !fast) {
        frames = [{ transform: T0 }, { transform: `translate(${dx / 2}px,${dy / 2 - 40}px) scale(${(sx + 1) / 2 + 0.3}) perspective(700px) rotateY(90deg)`, offset: 0.45 }, { transform: 'none' }];
        d2 = 900;
      }
      el.animate(frames, { duration: fx.d(d2), easing: 'cubic-bezier(.2,.8,.2,1)' });
    });
    // cards whose element vanished: fly a ghost to where they went
    if (fast) return;
    let gi = 0;
    for (const [id, o] of old.cards) {
      if (present.has(id)) continue;
      const pc = prev.cards[id];
      const nc = next.cards[id];
      if (!pc) continue;
      if (nc && nc.zone === pc.zone && nc.zone !== 'battlefield') continue;
      const owner = (pc.owner ?? 0) as number;
      const an = nc ? anchorName(nc.zone, owner) : null;
      const to = an ? cur?.anchors.get(an) : undefined;
      const g = fx.ghost(o, o.img);
      const death = pc.zone === 'battlefield' && nc?.zone === 'graveyard';
      const delay = gi++ * 60;
      if (!nc) {
        // token ceased to exist
        fx.A(g, [{ opacity: 1, filter: 'none' }, { opacity: 0, filter: 'grayscale(1) brightness(1.8)', transform: 'scale(.85) rotate(-6deg)' }], 600).then(() => g.remove());
        continue;
      }
      if (!to) {
        fx.A(g, [{ opacity: 1 }, { opacity: 0, transform: 'scale(.9)' }], 400).then(() => g.remove());
        continue;
      }
      const repl = moves.get(id)?.replaced;
      setTimeout(() => {
        fx.fly(g, o, to, death ? 1000 : 650, {
          mid: death ? { transform: 'rotate(-6deg) scale(.9)', filter: 'grayscale(1) brightness(1.7)' } : repl ? { filter: 'grayscale(1) brightness(1.3)' } : undefined,
          end: { opacity: nc.zone === 'library' || nc.zone === 'hand' ? 0 : 0.35, filter: nc.zone === 'exile' ? EXILE_TINT : 'none' },
        });
      }, fx.d(delay));
    }
  }

  // Arena-style running commentary: the last few things that happened, newest at the bottom.
  function renderFeed() {
    const L = (view.log ?? []) as any[];
    const base = L.length;
    const lines: { text: string; player?: number; kind?: string; i: number }[] = [];
    for (let i = L.length - 1; i >= 0 && lines.length < 4; i--) {
      const l = L[i];
      if (!l?.text || l.kind === 'chat' || / skips the first draw/.test(l.text)) continue;
      if (/draws? (?:a|\d+) cards?\.$/.test(l.text) && lines.length) continue;
      lines.unshift({ ...l, i });
    }
    if (!lines.length) return null;
    return (
      <div className="actfeed" aria-live="polite">
        {lines.map((l, k) => (
          <div
            key={l.i}
            className={`af-line ${l.kind ?? ''} ${l.player === me ? 'me' : l.player === op ? 'op' : ''}`}
            style={{ opacity: 0.4 + (0.6 * (k + 1)) / lines.length }}
          >
            {l.text}
          </div>
        ))}
        <span hidden>{base}</span>
      </div>
    );
  }

  function imgIn(v: GameView, iid: string): string | undefined {
    const c = v.cards[iid];
    if (!c || c.hidden || c.faceDown) return undefined;
    const df = (v.defs as any)[c.defId as string] as CardDef | undefined;
    const cp = (c as any).copyOf;
    if (cp?.defId && (v.defs as any)[cp.defId]) return cardImage((v.defs as any)[cp.defId], cp.face ?? 0);
    return cardImage(df, c.face ?? 0);
  }
  function nameIn(v: GameView, iid: string): string | undefined {
    const c = v.cards[iid];
    const df = c && !c.hidden ? ((v.defs as any)[c.defId as string] as CardDef | undefined) : undefined;
    return df?.name;
  }
  // opponent spells get a longer look than your own
  const e2 = (fl: any[]) => fl.some((e) => e.p !== me);

  async function preFx(fx: FX, evs: any[], cur: GameView, nv: GameView) {
    // Spells cast and resolved within one update never appear on the stack: flash them centre-stage first.
    const srcPos = new Map<string, { x: number; y: number }>();
    const flashes = evs.filter((e) => e.k === 'stack' && e.kind === 'spell' && !nv.stack.some((it: any) => it.id === e.id)).slice(-2);
    flashes.forEach((e, i) => {
      const img = imgIn(nv, e.src) ?? imgIn(cur, e.src) ?? null;
      const w = 260;
      const h = 363;
      const bx = { x: fx.root.clientWidth / 2 - w / 2 + (i - (flashes.length - 1) / 2) * 150, y: fx.root.clientHeight / 2 - h / 2 - 20, w, h };
      const g = fx.ghost(bx, img, { borderRadius: '14px', zIndex: 42, boxShadow: e.p === me ? '0 0 0 2px rgba(240,169,59,.6), 0 0 60px rgba(240,169,59,.35), 0 30px 60px rgba(0,0,0,.7)' : '0 0 0 2px rgba(239,90,90,.6), 0 0 60px rgba(239,90,90,.3), 0 30px 60px rgba(0,0,0,.7)' });
      fx.A(g, [{ opacity: 0, transform: 'translateY(40px) scale(.7)' }, { opacity: 1, transform: 'none' }], 320, { fill: 'none' });
      castGhosts.current.push(g);
      srcPos.set(e.src, fx.ctr(bx)!);
      const se = fx.el(e.src);
      if (se) {
        se.style.opacity = '0';
        hidden.current.push(se);
      }
      if (e.kicked) setTimeout(() => fx.stamp({ x: bx.x + w / 2, y: bx.y + h * 0.44 }, 'KICKED', true), fx.d(300));
      if (i === flashes.length - 1) fx.caption({ x: fx.root.clientWidth / 2, y: bx.y + h + 26 }, `${e.p === me ? 'You cast' : `${P[e.p].name} casts`} ${nameIn(nv, e.src) ?? nameIn(cur, e.src) ?? 'a spell'}`, '#e7ebf1');
    });
    if (flashes.length) await fx.wait(e2(flashes) ? 1150 : 800);
    const dmg = evs.filter((e) => e.k === 'damage');
    if (!dmg.length) return;
    const tel = (e: any) => (e.p != null ? fx.av(e.p) : e.iid ? fx.el(e.iid) : null);
    const proms: Promise<any>[] = [];
    const attackers = new Set((cur.combat?.attackers ?? []).map((a: any) => a.iid));
    const lunged = new Set<string>();
    for (const e of dmg.filter((x) => x.combat)) {
      if (!attackers.has(e.src) || lunged.has(e.src)) continue;
      lunged.add(e.src);
      proms.push(fx.lunge(fx.el(e.src), tel(e)));
    }
    const other = dmg.filter((x) => !x.combat).slice(0, 10);
    const perSrc = new Map<string, number>();
    for (const e of other) perSrc.set(e.src, (perSrc.get(e.src) ?? 0) + 1);
    other.forEach((e, i) => {
      const s = srcPos.get(e.src) ?? fx.ctr(fx.el(e.src)) ?? { x: fx.root.clientWidth / 2, y: fx.root.clientHeight / 2 };
      const t = fx.ctr(tel(e));
      if (!t) return;
      proms.push(fx.wait(i * 220).then(() => fx.projectile(s, t, (perSrc.get(e.src) ?? 0) > 1 ? String(e.base ?? e.n) : '', e.prevented ? 'rgba(143,196,245,.7)' : undefined)));
    });
    await Promise.all(proms);
  }

  function postFx(fx: FX, evs: any[], prev: GameView, next: GameView) {
    const oldBox = (iid: string) => snapBoxes.current.get(iid);
    const el = (iid: string) => fx.el(iid);
    const at = (iid: string) => fx.ctr(el(iid)) ?? (oldBox(iid) ? fx.ctr(oldBox(iid)!) : null);
    const hitPlayers = new Set<number>();
    const leftBf: string[] = [];
    for (const e of evs) if (e.k === 'move' && e.from === 'battlefield') leftBf.push(e.iid);
    const moveCount = new Map<string, any[]>();
    for (const e of evs) if (e.k === 'move') moveCount.set(e.iid, [...(moveCount.get(e.iid) ?? []), e]);
    let capY = 0;
    const cap = (text: string, col?: string) => {
      const c = { x: fx.root.clientWidth / 2, y: fx.root.clientHeight / 2 - 60 + capY };
      capY += 34;
      fx.caption(c, text, col);
    };
    for (const e of evs) {
      switch (e.k) {
        case 'damage': {
          const tEl = e.p != null ? fx.av(e.p) : el(e.iid);
          const c = e.p != null ? fx.ctr(tEl) : at(e.iid);
          if (!c) break;
          if (e.p != null) hitPlayers.add(e.p);
          if (e.prevented) {
            fx.ring(c, '#bfe0ff');
            fx.shards(c, 40, '#bfe0ff', 10);
            fx.floatText(c, 'Prevented', '#bfe0ff', 26);
            break;
          }
          if (e.n > 0) {
            if (tEl) fx.hit(tEl, e.n, e.p != null);
            else {
              fx.ring(c, '#ff8a3a');
              fx.floatText(c, '−' + e.n, '#ff6b5a');
            }
            if (e.base && e.n > e.base) fx.stamp({ x: c.x + 40, y: c.y - 30 }, `×${Math.round(e.n / e.base)}`);
          }
          break;
        }
        case 'counter': {
          const chip = fx.q(`[data-chip="${CSS.escape(e.iid + ':' + e.counter)}"]`);
          const c = at(e.iid);
          if (chip) {
            fx.drop(chip);
            const cc = fx.ctr(chip);
            if (cc) fx.ring(cc, e.counter === '-1/-1' ? '#ef5a5a' : e.counter === 'lore' ? '#f0a93b' : '#3ec28f', 3.2);
          }
          if (!c) break;
          if (e.counter === 'lore') {
            const R = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
            fx.floatText(c, `Chapter ${R[(e.total ?? 1) - 1] ?? e.total}`, '#f7dc9a', 28);
          } else if (e.counter === '+1/+1') fx.floatText(c, `+${e.n}/+${e.n}`, '#7ef0b8', 34);
          else if (e.counter === '-1/-1') fx.floatText(c, `−${e.n}/−${e.n}`, '#ff8a7a', 34);
          else if (e.counter === 'shield') fx.floatText(c, 'Shield', '#bfe0ff', 26);
          else if (e.counter === 'stun') fx.floatText(c, 'Stunned', '#ecc4ff', 26);
          else if (e.counter !== 'loyalty' && e.counter !== 'defense') fx.floatText(c, `+${e.n} ${e.counter}`, '#f7dc9a', 24);
          if (e.base && e.n > e.base && chip) {
            const cc = fx.ctr(chip)!;
            fx.stamp({ x: cc.x + 36, y: cc.y - 16 }, `×${Math.round(e.n / e.base)}`);
          }
          break;
        }
        case 'pcounter': {
          const chip = fx.q(`[data-pchip="${e.p}:${e.counter}"]`);
          const m = PCHIP[e.counter];
          if (chip) {
            fx.A(chip, [{ transform: 'scale(1)', boxShadow: '0 0 0 0 transparent' }, { transform: 'scale(1.22)', boxShadow: `0 0 0 2px ${m?.col ?? '#f7dc9a'}, 0 0 22px ${m?.col ?? '#f7dc9a'}`, offset: 0.35 }, { transform: 'scale(1)', boxShadow: '0 0 0 0 transparent' }], 520, { fill: 'none' });
          }
          break;
        }
        case 'life': {
          const av = fx.av(e.p);
          const c = fx.ctr(av);
          if (!c) break;
          if (e.delta > 0) {
            const src = leftBf.find((i) => (prev.cards[i] as any)?.types?.includes('creature'));
            const sb = src ? oldBox(src) : undefined;
            if (sb && evs.some((x) => x.k === 'move' && x.iid === src && x.to === 'exile')) fx.bigNumFly(fx.ctr(sb)!, c, String(e.delta), '#f7dc9a');
            fx.floatText({ x: c.x, y: c.y - 10 }, `+${e.delta}`, '#7ef0b8', 36);
            fx.pop(fx.q(`[data-life="${e.p}"]`), '#7ef0b8');
            if (e.base && e.delta > e.base) fx.stamp({ x: c.x + 44, y: c.y - 40 }, `×${Math.round(e.delta / e.base)}`);
          } else if (!hitPlayers.has(e.p) && !evs.some((x) => x.k === 'damage' && x.p === e.p)) {
            fx.floatText({ x: c.x, y: c.y - 10 }, `${e.delta}`, '#ff6b5a', 36);
            fx.pop(fx.q(`[data-life="${e.p}"]`), '#ff6b5a');
          }
          break;
        }
        case 'transform': {
          const t = el(e.iid)?.querySelector('.bc-in') ?? el(e.iid);
          fx.flip(t, 620);
          const c = at(e.iid);
          if (c) fx.ring(c, '#8fc4f5', 5);
          break;
        }
        case 'faceUp': {
          const t = el(e.iid)?.querySelector('.bc-in') ?? el(e.iid);
          fx.flip(t, 520);
          const c = at(e.iid);
          if (c) fx.ring(c, '#f7dc9a', 5);
          fx.glow(t, 'rgba(247,220,154,.9)', 700);
          break;
        }
        case 'dayNight': {
          fx.ripple({ x: fx.root.clientWidth / 2, y: fx.root.clientHeight / 2 }, e.v === 'night' ? '#8fc4f5' : '#f0b43b');
          cap(e.v === 'night' ? 'It becomes night' : 'It becomes day', e.v === 'night' ? '#bfe0ff' : '#f7dc9a');
          fx.A(fx.q('.daychip .orb'), [{ transform: 'rotate(0)' }, { transform: 'rotate(360deg)' }], 600, { fill: 'none' });
          break;
        }
        case 'animate': {
          const c = at(e.iid);
          if (c) fx.ring(c, '#7ef0b8', 4);
          fx.glow(el(e.iid)?.querySelector('.bc-in') ?? null, 'rgba(62,194,143,.6)', 800);
          const pt = fx.q(`[data-pt="${CSS.escape(e.iid)}"]`);
          if (pt) fx.appear(pt);
          if (c) fx.caption({ x: c.x, y: c.y - 70 }, e.eot ? 'Becomes a creature until end of turn' : 'Becomes a creature', '#7ef0b8');
          break;
        }
        case 'loseAbilities': {
          const c = at(e.iid);
          if (c) {
            fx.ring(c, '#c8d0dc', 5);
            fx.caption({ x: c.x, y: c.y - 70 }, 'Loses all abilities');
          }
          fx.flip(fx.q(`[data-pt="${CSS.escape(e.iid)}"]`), 380, false);
          break;
        }
        case 'copy': {
          const from = el(e.of) ? fx.box(el(e.of)) : oldBox(e.of);
          const to = fx.box(el(e.iid));
          if (from && to) {
            const g = fx.ghost(from, fx.q(`[data-iid="${CSS.escape(e.of)}"] img`)?.getAttribute('src') ?? null, { opacity: '.6', filter: 'brightness(1.4)', boxShadow: '0 0 0 2px #8fc4f5, 0 0 30px rgba(143,196,245,.8)', zIndex: 6 });
            fx.fly(g, from, to, 800, { end: { opacity: 0 } }).then(() => fx.ring(fx.ctr(to)!, '#8fc4f5', 4.5));
          }
          break;
        }
        case 'control': {
          const c = at(e.iid);
          if (c) {
            fx.ring(c, '#f0a93b');
            fx.caption({ x: c.x, y: c.y - 70 }, e.to === me ? 'You gain control' : `${P[e.to].name} gains control`, '#f0a93b');
          }
          break;
        }
        case 'unlink': {
          const c = at(e.iid);
          if (c) {
            fx.ring(c, '#d6c8ff', 4);
            fx.caption({ x: c.x, y: c.y - 70 }, 'Returns from exile', '#d6c8ff');
          }
          const sb = oldBox(e.src);
          if (sb) fx.shards(fx.ctr(sb)!, 55, '#f7dc9a', 12);
          break;
        }
        case 'umbra': {
          const ab = oldBox(e.aura);
          if (ab) fx.shards(fx.ctr(ab)!, 50, '#d6c8ff', 12);
          const c = at(e.iid);
          if (c) fx.floatText(c, 'Damage removed', '#7ef0b8', 22);
          fx.flash(el(e.iid)?.querySelector('.bc-in') ?? null);
          break;
        }
        case 'shield': {
          const c = at(e.iid);
          if (c) {
            fx.shards(c, 60, '#bfe0ff', 10);
            fx.floatText(c, 'Saved by shield', '#bfe0ff', 22);
          }
          break;
        }
        case 'cascade': {
          playCascade(fx, e, next);
          break;
        }
        case 'level': {
          const chip = fx.q(`[data-lv="${CSS.escape(e.iid)}"]`);
          if (chip) fx.pop(chip, '#f0a93b');
          const c = at(e.iid);
          if (c) {
            fx.ring(c, '#f0a93b');
            fx.floatText(c, `Level ${e.n}`, '#f7dc9a', 28);
          }
          fx.glow(el(e.iid)?.querySelector('.bc-in') ?? null, 'rgba(240,169,59,.8)');
          break;
        }
        case 'craft': {
          const t = el(e.iid)?.querySelector('.bc-in') ?? el(e.iid);
          fx.flip(t, 620);
          const c = at(e.iid);
          if (c) {
            fx.ring(c, '#d6c8ff', 5);
            fx.caption({ x: c.x, y: c.y - 70 }, 'Crafted', '#f7dc9a');
          }
          break;
        }
        case 'meld': {
          const c = at(e.iid);
          if (c) {
            fx.ring(c, '#ffffff', 6);
            fx.ripple(c, '#ffffff');
            fx.caption({ x: c.x, y: c.y - 90 }, `Meld: ${nameOf(e.iid)}`, '#f7dc9a');
          }
          fx.flash(el(e.iid)?.querySelector('.bc-in') ?? null);
          break;
        }
        case 'stack': {
          const s = fx.q(`[data-sid="${CSS.escape(e.id)}"]`);
          const c = fx.ctr(s);
          if (!c) break;
          if (e.kicked) setTimeout(() => fx.stamp({ x: c.x, y: c.y - 20 }, 'KICKED', true), fx.d(420));
          if (e.from === 'graveyard') {
            fx.ring(c, '#b69cff', 5);
            fx.glow(s?.querySelector('.sp-in') ?? null, 'rgba(182,156,255,.8)', 1100);
          } else if (e.from === 'exile') {
            fx.ring(c, '#d6c8ff', 5);
          }
          break;
        }
        case 'countered': {
          const b = oldBox(e.src);
          if (b) {
            const c = fx.ctr(b)!;
            fx.shards(c, 70, '#8fc4f5', 14);
            fx.floatText(c, 'Countered', '#bfe0ff', 30);
          }
          break;
        }
        case 'reveal': {
          const w = 200;
          const h = 280;
          const bx = { x: fx.root.clientWidth / 2 - w / 2, y: fx.root.clientHeight / 2 - h / 2 - 20, w, h };
          const g = fx.ghost(bx, e.image ?? null, { borderRadius: '12px', zIndex: 42, boxShadow: '0 0 0 2px rgba(240,169,59,.6), 0 0 50px rgba(240,169,59,.35), 0 30px 60px rgba(0,0,0,.7)' });
          fx.A(g, [{ opacity: 0, transform: 'perspective(700px) rotateY(90deg)' }, { opacity: 1, transform: 'none', offset: 0.2 }, { opacity: 1, transform: 'none', offset: 0.85 }, { opacity: 0, transform: 'scale(.9)' }], 1800).then(() => g.remove());
          fx.caption({ x: fx.root.clientWidth / 2, y: bx.y + h + 24 }, `${e.p === me ? 'You reveal' : `${P[e.p].name} reveals`} ${e.name}`, '#f7dc9a');
          break;
        }
        case 'revealHand': {
          const list = (e.cards ?? []).slice(0, 10) as { iid: string; name: string; image?: string }[];
          if (!list.length || e.p === me) break;
          const w = 130;
          const h = 182;
          const gap = 12;
          const total = list.length * w + (list.length - 1) * gap;
          const x0 = fx.root.clientWidth / 2 - total / 2;
          const y0 = fx.root.clientHeight / 2 - h / 2 - 20;
          setModalHold(true);
          list.forEach((c, i) => {
            const g = fx.ghost({ x: x0 + i * (w + gap), y: y0, w, h }, c.image ?? null, { zIndex: 42 });
            fx.A(g, [{ opacity: 0, transform: 'translateY(-40px) scale(.8)' }, { opacity: 1, transform: 'none', offset: 0.2 }, { opacity: 1, transform: 'none', offset: 0.85 }, { opacity: 0 }], 2000, { delay: fx.d(i * 60) }).then(() => g.remove());
          });
          fx.caption({ x: fx.root.clientWidth / 2, y: y0 + h + 24 }, `${P[e.p].name} reveals their hand`, '#f7dc9a');
          setTimeout(() => setModalHold(false), fx.d(1400));
          break;
        }
        case 'coin': {
          const c = { x: fx.root.clientWidth / 2, y: fx.root.clientHeight / 2 - 30 };
          const coin = fx.mk({ left: c.x - 45 + 'px', top: c.y - 45 + 'px', width: '90px', height: '90px', borderRadius: '50%', background: 'radial-gradient(circle at 40% 35%,#fff4c2,#f0b43b 55%,#8a5a12)', boxShadow: '0 0 30px rgba(240,180,59,.7), inset 0 -6px 12px rgba(0,0,0,.35)', display: 'grid', placeItems: 'center', font: '700 30px Cinzel, serif', color: '#3a2406', zIndex: 9 }, '');
          fx.A(coin, [{ transform: 'translateY(60px) rotateX(0deg) scale(.6)', opacity: 0 }, { transform: 'translateY(-80px) rotateX(1080deg) scale(1.1)', opacity: 1, offset: 0.55 }, { transform: 'translateY(0) rotateX(1800deg) scale(1)', opacity: 1, offset: 0.85 }, { transform: 'translateY(0) rotateX(1800deg) scale(1)', opacity: 0 }], 1700).then(() => coin.remove());
          setTimeout(() => {
            coin.textContent = e.won ? '★' : '✕';
            fx.floatText({ x: c.x, y: c.y - 60 }, e.won ? 'Won the flip' : 'Lost the flip', e.won ? '#7ef0b8' : '#ff8a7a', 30);
          }, fx.d(1000));
          break;
        }
        case 'dice': {
          const c = { x: fx.root.clientWidth / 2, y: fx.root.clientHeight / 2 - 30 };
          const die = fx.mk({ left: c.x - 48 + 'px', top: c.y - 48 + 'px', width: '96px', height: '96px', clipPath: e.sides === 20 ? 'polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)' : 'none', borderRadius: e.sides === 20 ? '0' : '16px', background: 'linear-gradient(160deg,#3a4a66,#141b24)', border: '2px solid #8fc4f5', display: 'grid', placeItems: 'center', font: '700 38px Cinzel, serif', color: '#e7ebf1', zIndex: 9 }, '?');
          let k = 0;
          const iv = setInterval(() => { die.textContent = String(1 + Math.floor(Math.random() * e.sides)); if (++k > 10) { clearInterval(iv); die.textContent = String(e.n); fx.ring(c, '#8fc4f5', 4); } }, fx.d(70));
          fx.A(die, [{ transform: 'rotate(-200deg) scale(.5)', opacity: 0 }, { transform: 'rotate(0) scale(1.1)', opacity: 1, offset: 0.4 }, { transform: 'scale(1)', opacity: 1, offset: 0.85 }, { opacity: 0 }], 1900).then(() => die.remove());
          fx.caption({ x: c.x, y: c.y + 80 }, `${e.p === me ? 'You roll' : `${P[e.p].name} rolls`} a d${e.sides}: ${e.n}`, '#bfe0ff');
          break;
        }
        case 'dungeon': {
          const c = fx.ctr(fx.av(e.p));
          if (c) fx.caption({ x: c.x, y: c.y + (e.p === me ? -70 : 70) }, `⌂ ${e.room}`, '#d6c8ff');
          break;
        }
        case 'initiative': {
          const c = fx.ctr(fx.av(e.p));
          if (c) {
            fx.ring(c, '#ffb4a8', 5);
            fx.floatText({ x: c.x, y: c.y - 20 }, '⚑ Initiative', '#ffb4a8', 28);
          }
          break;
        }
        case 'copySpell': {
          const sp = fx.q(`[data-sid="${CSS.escape(e.id)}"]`);
          const c = fx.ctr(sp);
          if (c) fx.ring(c, '#8fc4f5', 5);
          break;
        }
        case 'chosen': {
          const c = at(e.iid);
          if (c) fx.floatText(c, String(e.value).toUpperCase(), '#f7dc9a', 24);
          break;
        }
        case 'regenShield': {
          const c = at(e.iid);
          if (c) fx.ring(c, '#7ef0b8', 3.5);
          break;
        }
        case 'regenerate': {
          const c = at(e.iid);
          if (c) {
            fx.shards(c, 55, '#7ef0b8', 12);
            fx.floatText(c, 'Regenerated', '#7ef0b8', 24);
          }
          fx.flash(el(e.iid)?.querySelector('.bc-in') ?? null);
          break;
        }
        case 'monarch': {
          const c = fx.ctr(fx.av(e.p));
          if (c) {
            fx.ring(c, '#f7dc9a', 5);
            fx.floatText({ x: c.x, y: c.y - 20 }, '♛ Monarch', '#f7dc9a', 30);
          }
          break;
        }
        case 'turn': {
          fx.banner(e.p === me ? 'Your turn' : `${P[e.p].name}'s turn`, e.p === me ? '#f0a93b' : '#ef5a5a');
          break;
        }
        case 'proliferate': {
          fx.ripple({ x: fx.root.clientWidth / 2, y: fx.root.clientHeight / 2 }, '#d6c8ff');
          cap('Proliferate', '#d6c8ff');
          break;
        }
        case 'move': {
          const list = moveCount.get(e.iid) ?? [];
          // round trip in one action: undying/persist/blink
          if (list[list.length - 1] === e && e.to === 'battlefield' && list.length > 1 && list[0].from === 'battlefield') {
            const t = el(e.iid)?.querySelector('.bc-in') ?? null;
            fx.A(t, [{ opacity: 0, transform: 'translateY(30px) scale(.9)', filter: 'brightness(2.2) sepia(.6)' }, { opacity: 1, transform: 'translateY(-10px) scale(1.04)', filter: 'brightness(1.4) sepia(.3)', offset: 0.6 }, { opacity: 1, transform: 'none', filter: 'none' }], 800, { fill: 'none' });
            const c = at(e.iid);
            if (c) fx.floatText(c, list[0].to === 'exile' ? 'Blink' : 'Returns', '#f7dc9a', 28);
          }
          if (e.to === 'exile' && e.faceDown && e.from === 'hand') {
            const c = fx.ctr(fx.anchor(`ex${e.owner}`));
            if (c) fx.caption({ x: c.x, y: c.y - 60 }, 'Foretold', '#d6c8ff');
          }
          break;
        }
      }
    }
    // P/T changes on permanents that stayed
    for (const iid of next.battlefield) {
      const a = prev.cards[iid];
      const b = next.cards[iid];
      if (!a || !b || a.zone !== 'battlefield' || a.p == null || b.p == null) continue;
      if (a.p === b.p && a.t === b.t) continue;
      const up = (b.p ?? 0) + (b.t ?? 0) > (a.p ?? 0) + (a.t ?? 0);
      fx.ptPulse(fx.q(`[data-pt="${CSS.escape(iid)}"]`), up ? '#7ef0b8' : '#ff8a7a');
      if (a.controller === b.controller && !evs.some((e) => e.k === 'counter' && e.iid === iid)) {
        const c = at(iid);
        const dp = (b.p ?? 0) - (a.p ?? 0);
        const dt = (b.t ?? 0) - (a.t ?? 0);
        if (c && (dp || dt)) fx.floatText(c, `${dp >= 0 ? '+' : '−'}${Math.abs(dp)}/${dt >= 0 ? '+' : '−'}${Math.abs(dt)}`, up ? '#7ef0b8' : '#ff8a7a', 30);
      }
      // stun counters removed while the permanent stays tapped
    }
    for (const iid of next.battlefield) {
      const a = prev.cards[iid];
      const b = next.cards[iid];
      if (!a || !b) continue;
      if ((a.counters?.stun ?? 0) > (b.counters?.stun ?? 0) && b.tapped) {
        const t = el(iid)?.querySelector('.bc-in');
        if (t) fx.A(t, [{ transform: 'rotate(90deg) scale(.8)' }, { transform: 'rotate(58deg) scale(.8)', offset: 0.45 }, { transform: 'rotate(96deg) scale(.8)', offset: 0.62 }, { transform: 'rotate(90deg) scale(.8)' }], 750, { fill: 'none', easing: 'ease-out' });
        const c = at(iid);
        if (c) fx.floatText(c, 'Stays tapped', '#ecc4ff', 24);
      }
      if (a.attachedTo !== b.attachedTo && b.attachedTo) {
        const c = at(b.attachedTo);
        if (c) {
          fx.ring(c, '#f0a93b');
          fx.floatText(c, isCreature(iid) ? 'Bestowed' : 'Attached', '#f7dc9a', 24);
        }
      }
    }
  }

  function playCascade(fx: FX, e: any, next: GameView) {
    const list: string[] = (e.cards ?? []).slice(-6);
    if (!list.length) return;
    setModalHold(true);
    const lib = fx.box(fx.anchor(`lib${next.cards[list[0]]?.owner ?? me}`)) ?? { x: fx.root.clientWidth - 100, y: fx.root.clientHeight - 120, w: 60, h: 84 };
    const w = 110;
    const h = 154;
    const gap = 22;
    const total = list.length * w + (list.length - 1) * gap;
    const x0 = fx.root.clientWidth / 2 - total / 2;
    const y0 = fx.root.clientHeight / 2 - h / 2;
    const els: HTMLElement[] = [];
    list.forEach((iid, i) => {
      const img = cards[iid] && !cards[iid].hidden ? imgOf(iid) ?? null : null;
      const to = { x: x0 + i * (w + gap), y: y0, w, h };
      setTimeout(() => {
        const g = fx.ghost(lib, null, { zIndex: 8 });
        els.push(g);
        fx.fly(g, lib, to, 360, { remove: false }).then(() => {
          if (img) {
            g.className = '';
            const im = document.createElement('img');
            im.src = img;
            Object.assign(im.style, { width: '100%', height: '100%', display: 'block', objectFit: 'cover' });
            g.appendChild(im);
          }
          fx.A(g, [{ transform: `${getComputedStyle(g).transform} perspective(700px) rotateY(90deg)` }, { transform: `${getComputedStyle(g).transform} perspective(700px) rotateY(0deg)` }], 300, { fill: 'none' });
          if (iid === e.hit) {
            fx.glow(g, 'rgba(240,169,59,.9)', 1400);
            const c = fx.ctr(to)!;
            fx.ring(c, '#f0a93b');
          }
        });
      }, fx.d(i * 420));
    });
    const endAt = list.length * 420 + 1300;
    setTimeout(() => {
      els.forEach((g) => fx.A(g, [{ opacity: 1 }, { opacity: 0 }], 400).then(() => g.remove()));
      setModalHold(false);
    }, fx.d(endAt));
    const hitName = e.hit ? nameOf(e.hit) : null;
    fx.caption({ x: fx.root.clientWidth / 2, y: y0 - 30 }, hitName ? `Cascade hits ${hitName}` : 'Cascade finds nothing', '#f7dc9a');
  }


  // ------------------------------------------------------------------------------------------
  // Midline: dial, hint
  // ------------------------------------------------------------------------------------------
  const cur = Math.max(0, DIAL.findIndex((p) => p.steps.includes(view.step)));
  const mine = view.active === me;
  const hot = mine ? '#f0a93b' : '#ef5a5a';
  const ring = `conic-gradient(from -90deg, ${DIAL.map((_, i) => {
    const col = i === cur ? hot : i < cur ? '#4f5968' : '#2e3a4a';
    return `${col} ${i * 45}deg ${i * 45 + 40}deg, transparent ${i * 45 + 40}deg ${(i + 1) * 45}deg`;
  }).join(', ')})`;
  const nxt = DIAL[cur + 1];
  const hint = (): { t: string; c: string } => {
    if (myPrompt?.kind === 'targets') return { t: `${myPrompt.title}${myPrompt.canCancel ? ' · Esc to cancel' : ''}`, c: '#5aa9ef' };
    if (myPrompt?.kind === 'declareAttackers') return { t: 'Click creatures to attack, then confirm', c: '#f0a93b' };
    if (myPrompt?.kind === 'declareBlockers') return { t: pendingBlocker ? `Now click the attacker ${nameOf(pendingBlocker)} should block` : 'Click one of your creatures, then an attacker · instants can be cast now', c: '#f0a93b' };
    if (myPrompt) return { t: myPrompt.title, c: '#f0a93b' };
    if (prompt) return { t: prompt.title ?? `${P[op].name} is deciding…`, c: '#8d98a8' };
    if (view.casting && (view.casting as any).player !== me) return { t: `${P[op].name} is casting ${(view.casting as any).label}…`, c: '#ffb4a8' };
    if (view.stack.length && view.priority === me) {
      const top = view.stack[view.stack.length - 1] as any;
      return { t: top.controller !== me ? `${P[op].name}: ${top.label} — respond, or Resolve` : `${top.label} is on the stack`, c: top.controller !== me ? '#ffb4a8' : '#f7dc9a' };
    }
    if ((P[me] as any).passUntilEOT) return { t: 'Passing until end of turn', c: '#8d98a8' };
    const l = view.log[view.log.length - 1] as any;
    return { t: l ? l.text : '', c: '#8d98a8' };
  };
  const hn = hint();

  const myStops = (P[me] as any).stops as { own: Step[]; opp: Step[] } | undefined;
  const showNotice = view.manualNotice && view.manualNotice !== dismissed;
  const hoverCard = hover && cards[hover] && !cards[hover].hidden ? cards[hover] : null;
  const hoverImg = hoverCard ? imgOf(hoverCard.iid) : undefined;
  const hoverDef = hoverCard ? d(hoverCard.iid) : undefined;

  // ------------------------------------------------------------------------------------------
  // Menus & modals (unchanged behaviour)
  // ------------------------------------------------------------------------------------------
  const renderMenu = () => {
    if (!menu) return null;
    type Item = { label: string; fn: () => void; sep?: boolean; disabled?: boolean; header?: boolean };
    const auto: Item[] = [];
    const man: Item[] = [];
    const A = (label: string, fn: () => void, disabled = false) => auto.push({ label, fn, disabled });
    const M = (label: string, fn: () => void, disabled = false) => man.push({ label, fn, disabled });
    const msep = () => man.push({ label: '', fn: () => {}, sep: true });
    if (menu.kind === 'card' && menu.iid) {
      const iid = menu.iid;
      const c = cards[iid];
      if (!c) return null;
      const mine2 = c.zone === 'battlefield' ? c.controller === me : c.owner === me;
      const abs = (c.abilities ?? []) as any[];
      const opts = ((c as any).castOptions ?? []) as { label: string; action: Action; ok: boolean }[];
      for (const o of opts) A(o.label, () => act(o.action), !o.ok);
      if (c.zone === 'battlefield') {
        if (mine2) {
          if ((c as any).faceUpCost) A(`Turn face up ${(c as any).faceUpCost}`, () => act({ type: 'turnFaceUp', iid }));
          for (const a of abs) {
            if (a.zone && a.zone !== 'battlefield') continue;
            A(a.isMana ? `Mana: ${a.label}` : a.label, () => act(a.isMana ? { type: 'tapForMana', iid, ability: a.idx } : { type: 'activate', iid, ability: a.idx }), !a.ok);
          }
          M(c.tapped ? 'Untap' : 'Tap', () => manual({ op: 'tap', iid }));
        } else for (const a of abs) if (a.ok && !a.isMana) A(a.label, () => act({ type: 'activate', iid, ability: a.idx }));
        M('+1/+1 counter', () => manual({ op: 'counter', iid, counter: '+1/+1', delta: 1 }));
        M('−1/−1 counter', () => manual({ op: 'counter', iid, counter: '-1/-1', delta: 1 }));
        M('Remove a +1/+1', () => manual({ op: 'counter', iid, counter: '+1/+1', delta: -1 }));
        M('Loyalty +1', () => manual({ op: 'counter', iid, counter: 'loyalty', delta: 1 }));
        M('Loyalty −1', () => manual({ op: 'counter', iid, counter: 'loyalty', delta: -1 }));
        M('Other counter…', () => {
          const k = window.prompt('Counter name (e.g. charge, lore, shield, stun)');
          if (k) manual({ op: 'counter', iid, counter: k.toLowerCase(), delta: 1 });
        });
        M('Pump +1/+1 until EOT', () => manual({ op: 'pump', iid, power: 1, toughness: 1 }));
        M('Pump −1/−1 until EOT', () => manual({ op: 'pump', iid, power: -1, toughness: -1 }));
        M('Mark 1 damage', () => manual({ op: 'damage', iid, delta: 1 }));
        msep();
        if (mine2) {
          M('Transform / flip', () => manual({ op: 'transform', iid }));
          M('Turn face down/up', () => manual({ op: 'faceDown', iid }));
          M('Give control to opponent', () => manual({ op: 'control', iid }));
          M('Unattach', () => manual({ op: 'attach', iid, to: null }), !c.attachedTo);
          msep();
          M('Move to hand', () => manual({ op: 'move', iid, to: 'hand' }));
          M('Move to graveyard', () => manual({ op: 'move', iid, to: 'graveyard' }));
          M('Move to exile', () => manual({ op: 'move', iid, to: 'exile' }));
          M('Move to library (top)', () => manual({ op: 'move', iid, to: 'libraryTop' }));
          M('Move to library (bottom)', () => manual({ op: 'move', iid, to: 'libraryBottom' }));
        } else M('Take control', () => manual({ op: 'control', iid }));
        M('Create a token copy', () => manual({ op: 'clone', iid }));
      } else if (mine2) {
        if (c.zone === 'hand') {
          if (!opts.length) {
            const df = d(iid);
            if (/\bLand\b/.test(df?.typeLine ?? '')) A('Play land', () => act({ type: 'playLand', iid }));
            else A('Cast', () => act({ type: 'cast', iid }));
          }
          A(c.revealed ? 'Hide' : 'Reveal to opponent', () => manual({ op: 'reveal', iid }));
        }
        M('Put onto battlefield', () => manual({ op: 'move', iid, to: 'battlefield' }));
        if (c.zone !== 'hand') M('Return to hand', () => manual({ op: 'move', iid, to: 'hand' }));
        if (c.zone !== 'graveyard') M('Put into graveyard', () => manual({ op: 'move', iid, to: 'graveyard' }));
        if (c.zone !== 'exile') M('Exile', () => manual({ op: 'move', iid, to: 'exile' }));
        M('Library (top)', () => manual({ op: 'move', iid, to: 'libraryTop' }));
        M('Library (bottom)', () => manual({ op: 'move', iid, to: 'libraryBottom' }));
      }
    } else if (menu.kind === 'player' && menu.player != null) {
      const p = menu.player;
      if (p === me) {
        A('Concede', () => {
          if (confirm('Concede this game?')) act({ type: 'concede' });
        });
      }
      M('Life +1', () => manual({ op: 'life', player: p, delta: 1 }));
      M('Life −1', () => manual({ op: 'life', player: p, delta: -1 }));
      M('Life +5', () => manual({ op: 'life', player: p, delta: 5 }));
      M('Life −5', () => manual({ op: 'life', player: p, delta: -5 }));
      M('Poison +1', () => manual({ op: 'poison', player: p, delta: 1 }));
      M('Poison −1', () => manual({ op: 'poison', player: p, delta: -1 }));
      if (p === me) {
        msep();
        M('Draw a card', () => manual({ op: 'draw', n: 1 }));
        M('Mill 1', () => manual({ op: 'mill', n: 1 }));
        M('Shuffle library', () => manual({ op: 'shuffle' }));
        M('Untap all my permanents', () => manual({ op: 'untapAll' }));
        for (const col of ['W', 'U', 'B', 'R', 'G', 'C'] as Color[]) M(`Add {${col}} to pool`, () => manual({ op: 'mana', color: col, delta: 1 }));
      }
    }
    // Manual controls only appear for things the engine can't automate (a card it can't fully parse, or a "resolve by hand" step)
    const needsHand = !!view.manualNotice || (menu.kind === 'card' && menu.iid ? (cards[menu.iid] as any)?.auto && (cards[menu.iid] as any).auto !== 'full' : false);
    if (!needsHand) man.length = 0;
    const showMan = showManual || !auto.length;
    const items: Item[] = [...auto];
    if (!items.length && !man.length) return null;
    if (man.length) {
      if (auto.length) items.push({ label: '', fn: () => {}, sep: true });
      items.push({ label: showMan ? 'Manual override ▾' : 'Manual override ▸', fn: () => {}, header: true });
      if (showMan) items.push(...man);
    }
    return (
      <div className="ctx-bg" onClick={() => { setMenu(null); setShowManual(false); }} onContextMenu={(e) => { e.preventDefault(); setMenu(null); setShowManual(false); }}>
        <div className="ctx" style={{ left: Math.min(menu.x, window.innerWidth - 250), top: Math.max(8, Math.min(menu.y, window.innerHeight - Math.min(items.length * 28 + 16, window.innerHeight - 20))) }} onClick={(e) => e.stopPropagation()}>
          {items.map((it, i) =>
            it.sep ? (
              <div key={i} className="sep" />
            ) : it.header ? (
              <button key={i} className="ctx-header" onClick={() => setShowManual(!showManual)} title="Manual actions for effects the engine doesn't handle">
                {it.label}
              </button>
            ) : (
              <button key={i} disabled={it.disabled} className={showMan && man.includes(it) ? 'ctx-manual' : ''} onClick={() => { setMenu(null); setShowManual(false); it.fn(); }}>
                {it.label}
              </button>
            ),
          )}
        </div>
      </div>
    );
  };

  const renderModalPrompt = () => {
    if (!myPrompt || modalHold) return null;
    const k = myPrompt.kind;
    if (k === 'mulligan') {
      const hand0 = arenaSort(myPrompt.cards);
      const n = hand0.length;
      const mulls = (P[me] as any).mulligans ?? 0;
      const onPlay = view.startingPlayer === me;
      return (
        <div className="mull-bg">
          <div className="mull">
            <div className="mull-kicker">{onPlay ? 'You are on the play' : 'You are on the draw'}</div>
            <div className="mull-title">{mulls ? `Mulligan ${mulls}` : 'Opening Hand'}</div>
            <div className="mull-sub">{mulls ? `Keep these ${n} and put ${mulls} card${mulls > 1 ? 's' : ''} on the bottom of your library` : 'Keep these seven cards, or shuffle and draw a new hand'}</div>
            <div className="mull-fan">
              {hand0.map((iid: string, i: number) => {
                const k2 = i - (n - 1) / 2;
                const img = imgOf(iid);
                return (
                  <div
                    key={iid}
                    className="mull-card"
                    style={{ ['--r' as any]: `${k2 * 3}deg`, ['--y' as any]: `${k2 * k2 * 3}px`, animationDelay: `${i * 70}ms`, zIndex: 10 + i }}
                    onMouseEnter={() => setHover(iid)}
                    onMouseLeave={() => setHover((h) => (h === iid ? null : h))}
                  >
                    {img ? <img src={img} alt={nameOf(iid)} draggable={false} /> : <div className="tcard plain"><div className="tn">{nameOf(iid)}</div></div>}
                  </div>
                );
              })}
            </div>
            <div className="mull-actions">
              <button className="hexbig" onClick={() => act({ type: 'keep' })}>
                <span>Keep {n}</span>
              </button>
              <button className="hexbtn mull-btn" onClick={() => act({ type: 'mulligan' })} disabled={n <= 1}>
                <span>Mulligan to {Math.max(0, 7 - mulls - 1)}</span>
              </button>
            </div>
          </div>
        </div>
      );
    }
    if (k === 'chooseCards') {
      const ok = sel.length >= (myPrompt.min ?? 0) && sel.length <= (myPrompt.max ?? 99);
      return (
        <Modal title={myPrompt.title} onCancel={myPrompt.canCancel ? () => act({ type: 'cancel', promptId: myPrompt.id }) : undefined}>
          <p className="muted small">Select {myPrompt.min === myPrompt.max ? myPrompt.min : `${myPrompt.min}–${myPrompt.max}`}. {myPrompt.cards.length === 0 && 'No matching cards.'}</p>
          <div className="choose-grid">
            {((myPrompt.looked as string[] | undefined)?.length ? (myPrompt.looked as string[]) : myPrompt.cards).filter((iid: string) => cards[iid]).map((iid: string) => {
              const can = myPrompt.cards.includes(iid);
              return <Card key={iid} card={{ ...cards[iid], tapped: false }} def={d(iid)} onHover={setHover} dim={!can} selected={sel.includes(iid)} onClick={() => can && setSel((s) => (s.includes(iid) ? s.filter((x) => x !== iid) : s.length >= myPrompt.max ? [...s.slice(1), iid] : [...s, iid]))} />;
            })}
          </div>
          <div className="row center">
            <button className="primary big" disabled={!ok} onClick={() => answer(sel)}>Confirm ({sel.length})</button>
          </div>
        </Modal>
      );
    }
    if (k === 'mode') {
      const ok = sel.length >= myPrompt.min && sel.length <= myPrompt.max;
      return (
        <Modal title={myPrompt.title} onCancel={myPrompt.canCancel ? () => act({ type: 'cancel', promptId: myPrompt.id }) : undefined}>
          <div className="options">
            {myPrompt.options.map((o: any) => {
              const n = sel.filter((x) => x === o.id).length;
              if ((myPrompt as any).repeat)
                return (
                  <div key={o.id} className={`row ${n ? 'selected' : ''}`} style={{ alignItems: 'center', gap: 8 }}>
                    <button onClick={() => setSel((s) => { const i = s.lastIndexOf(o.id); return i < 0 ? s : [...s.slice(0, i), ...s.slice(i + 1)]; })} disabled={!n}>−</button>
                    <b style={{ minWidth: 18, textAlign: 'center' }}>{n}</b>
                    <button onClick={() => setSel((s) => (s.length >= myPrompt.max ? s : [...s, o.id]))}>+</button>
                    <span style={{ flex: 1 }}>{o.label}</span>
                  </div>
                );
              return (
                <button key={o.id} className={sel.includes(o.id) ? 'selected' : ''} onClick={() => setSel((s) => (s.includes(o.id) ? s.filter((x) => x !== o.id) : myPrompt.max === 1 ? [o.id] : [...s, o.id]))}>
                  {o.label}
                </button>
              );
            })}
          </div>
          <div className="row center">
            <button className="primary big" disabled={!ok} onClick={() => answer(sel)}>Confirm</button>
          </div>
        </Modal>
      );
    }
    if (k === 'x') {
      return (
        <Modal title={myPrompt.title} onCancel={() => act({ type: 'cancel', promptId: myPrompt.id })}>
          <div className="row center">
            <button onClick={() => setXVal(Math.max(0, xVal - 1))}>−</button>
            <input type="number" className="xinput" value={xVal} min={0} onChange={(e) => setXVal(Math.max(0, +e.target.value))} />
            <button onClick={() => setXVal(xVal + 1)}>+</button>
          </div>
          <p className="muted small center">You can produce about {myPrompt.max} more mana.</p>
          <div className="row center">
            <button className="primary big" onClick={() => answer(xVal)}>X = {xVal}</button>
          </div>
        </Modal>
      );
    }
    if (k === 'divide') {
      const total = divide.reduce((a, b) => a + b, 0);
      const ok = total === myPrompt.min && divide.every((x) => x >= 1);
      return (
        <Modal title={myPrompt.title}>
          <div className="divide-list">
            {myPrompt.targets.map((t: Target, i: number) => (
              <div key={i} className="row">
                <span className="divide-name">{describeT(t)}</span>
                <button onClick={() => setDivide(divide.map((v, j) => (j === i ? Math.max(1, v - 1) : v)))}>−</button>
                <strong className="divide-n">{divide[i] ?? 0}</strong>
                <button onClick={() => setDivide(divide.map((v, j) => (j === i ? v + 1 : v)))}>+</button>
              </div>
            ))}
          </div>
          <p className="muted small center">{total} of {myPrompt.min} assigned (at least 1 each)</p>
          <div className="row center">
            <button className="primary big" disabled={!ok} onClick={() => answer(divide)}>Confirm</button>
          </div>
        </Modal>
      );
    }
    if (k === 'cardName') {
      return <NameModal title={myPrompt.title} nonland={/nonland/.test(myPrompt.title)} onPick={(n) => answer(n)} onCancel={myPrompt.canCancel ? () => act({ type: 'cancel', promptId: myPrompt.id }) : undefined} />;
    }
    if (k === 'yesno' || k === 'color') {
      return (
        <Modal title={myPrompt.title} onCancel={myPrompt.canCancel ? () => act({ type: 'cancel', promptId: myPrompt.id }) : undefined}>
          {myPrompt.cards?.length > 0 && <div className="choose-grid">{myPrompt.cards.map((iid: string) => cards[iid] && <Card key={iid} card={{ ...cards[iid], tapped: false }} def={d(iid)} onHover={setHover} />)}</div>}
          <div className="row center wrap">
            {myPrompt.options.map((o: any) => (
              <button key={o.id} className={`big ${k === 'color' ? `mana-btn m-${o.id}` : ''}`} onClick={() => answer(o.id)}>
                {k === 'color' ? COLOR_NAMES[o.id] ?? o.label : o.label}
              </button>
            ))}
          </div>
        </Modal>
      );
    }
    return null;
  };

  const facePicker = () => {
    if (!facePick) return null;
    const df = d(facePick);
    const opts = ((cards[facePick] as any)?.castOptions ?? []) as { label: string; action: Action; ok: boolean }[];
    if (opts.length) {
      return (
        <Modal title={df?.name ?? 'Cast'} onCancel={() => setFacePick(null)}>
          <div className="options">
            {opts.map((o, i) => (
              <button key={i} disabled={!o.ok} onClick={() => { setFacePick(null); act(o.action); }}>
                {o.label}
              </button>
            ))}
          </div>
        </Modal>
      );
    }
    if (!df?.faces) return null;
    return (
      <Modal title={`Cast ${df.name}`} onCancel={() => setFacePick(null)}>
        <div className="row center wrap">
          {df.faces.map((f, i) => (
            <button key={i} className="face-btn" onClick={() => { setFacePick(null); /\bLand\b/.test(f.typeLine) ? act({ type: 'playLand', iid: facePick, face: i }) : act({ type: 'cast', iid: facePick, face: i }); }}>
              <strong>{f.name}</strong>
              <span className="muted">{f.manaCost} · {f.typeLine}</span>
            </button>
          ))}
        </div>
      </Modal>
    );
  };

  const zoneModal = () => {
    if (!zoneView) return null;
    const list = [...(P[zoneView.player] as any)[zoneView.zone]].reverse() as string[];
    return (
      <Modal title={`${P[zoneView.player].name} — ${zoneView.zone} (${list.length})`} onCancel={() => setZoneView(null)}>
        <div className="choose-grid">
          {list.map((iid) => (
            <Card key={iid} card={cards[iid]} def={d(iid)} onHover={setHover} onClick={(e) => { if (isTargetPrompt) toggleTarget({ kind: 'card', iid }); else setMenu({ x: e.clientX, y: e.clientY, kind: 'card', iid }); }} onContext={(e) => setMenu({ x: e.clientX, y: e.clientY, kind: 'card', iid })} targetable={legalTargetKeys.has(targetKey({ kind: 'card', iid }))} selected={selectedKeys.has(targetKey({ kind: 'card', iid }))} />
          ))}
          {!list.length && <p className="muted">Empty.</p>}
        </div>
      </Modal>
    );
  };

  // ------------------------------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------------------------------
  const strip = [...stripSet];
  const dn = (view as any).dayNight as 'day' | 'night' | null;
  return (
    <div className="gwrap">
      <style>{cosmeticsCss(meta, me)}</style>
      {spectating && (
        <div className="spectate-bar">
          <span>SPECTATING · {P[0]?.name} vs {P[1]?.name}</span>
          <button className="hexbtn" onClick={onLeave}><span>Leave</span></button>
        </div>
      )}
      <div ref={boardRef} className={`gboard ${dn === 'night' ? 'night' : ''}`} style={{ width: W, height: H, transform: `scale(${S})` }} onMouseMove={onMove}>
        <div className="half opp" />
        <div className="half me" />
        <div className="g-grid">
          {/* top bar */}
          <div className="g-top">
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="hexbtn" onClick={() => setLogOpen((o) => !o)}>
                <span>Game log</span>
              </button>
              <button className="hexbtn" onClick={() => setTools((t) => !t)}>
                <span>Tools ▾</span>
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 22, height: 76 }}>
              {avatar(op)}
              <div className="opp-hand" data-anchor={`hand${op}`}>
                {(P[op].hand as string[]).map((iid) => (
                  <div key={iid} data-iid={iid}>
                    {cards[iid] && !cards[iid].hidden && imgOf(iid) ? <img src={imgOf(iid)} alt="" style={{ width: '100%', height: '100%', borderRadius: 6 }} /> : <div className="cback" data-owner={op} />}
                  </div>
                ))}
              </div>
            </div>
            <div className="gpiles" style={{ justifyContent: 'flex-end' }}>
              {commandPile(op, 'sm')}
              {pile(op, 'exile', 'sm')}
              {pile(op, 'graveyard', 'sm')}
              {pile(op, 'library', 'sm')}
            </div>
          </div>

          {/* opponent mat */}
          <div className="mat opp">
            {corners('Lands', 'Battlefield')}
            {renderLandRow(op)}
            {renderCreatures(op)}
          </div>

          {/* midline */}
          <div className="midline2">
            {renderFeed()}
            <div className="mline" style={{ background: `linear-gradient(90deg,transparent,${mine ? 'rgba(240,169,59,.28)' : 'rgba(239,90,90,.28)'} 25%,${mine ? 'rgba(240,169,59,.28)' : 'rgba(239,90,90,.28)'} 75%,transparent)` }} />
            <div className="mid-left">
              <div className="tl" style={{ color: hot }}>
                Turn {view.turn} · {mine ? 'Your turn' : `${P[op].name}'s turn`}
              </div>
              <div className="hint" style={{ color: hn.c }} title={hn.t}>
                {hn.t}
              </div>
              <div className="pills">
                {!myPrompt && view.priority === me && !(P[me] as any).passUntilEOT && (
                  <button className="pillbtn ghost" onClick={() => act({ type: 'passUntilEOT', on: true })} title="Pass priority until end of turn">
                    ⏭ Pass turn
                  </button>
                )}
                {(P[me] as any).passUntilEOT && (
                  <button className="pillbtn on" onClick={() => act({ type: 'passUntilEOT', on: false })}>
                    ⏭ Passing — stop
                  </button>
                )}
                <button className="pillbtn ghost" onClick={() => setSettings(true)} title="Game speed and priority stops">
                  ⚙ Speed & stops
                </button>
                {myPrompt?.kind === 'declareAttackers' &&
                  myPrompt.targets.length > 1 &&
                  Object.entries(attacks).map(([iid, ti]) => (
                    <select key={iid} value={ti} onChange={(e) => setAttacks({ ...attacks, [iid]: +e.target.value })}>
                      {myPrompt.targets.map((t: Target, i: number) => (
                        <option key={i} value={i}>
                          {nameOf(iid)} → {describeT(t)}
                        </option>
                      ))}
                    </select>
                  ))}
              </div>
            </div>
            <div className="mid-right">
              {dn && (
                <div className={`daychip ${dn}`}>
                  <div className="orb" />
                  <span>{dn === 'day' ? 'DAY' : 'NIGHT'}</span>
                </div>
              )}
              {myPrompt?.kind === 'declareAttackers' && (
                <button className="pillbtn big" onClick={() => setAttacks(Object.fromEntries(myPrompt.cards.map((c: string) => [c, 0])))}>
                  All attack
                </button>
              )}
              {myPrompt?.canCancel && (myPrompt.kind === 'targets' || myPrompt.kind === 'declareAttackers') && sel.length > 0 && (
                <button className="pillbtn big ghost" onClick={() => act({ type: 'cancel', promptId: myPrompt.id })}>
                  Cancel
                </button>
              )}
              <div className="phase-name">
                <div className="pn" style={{ color: mine ? '#f7dc9a' : '#ffb4a8' }}>{STEP_LABEL[view.step]}</div>
                <div className="nx">Next · {nxt ? nxt.label : mine ? `${P[op].name}'s turn` : 'Your turn'}</div>
              </div>
              <div className="dial" style={{ background: ring, filter: `drop-shadow(0 0 18px ${mine ? 'rgba(240,169,59,.3)' : 'rgba(239,90,90,.3)'})` }}>
                <div className="dial-in">
                  <button className="mainbtn2" disabled={mb.disabled} onClick={mb.onClick} style={{ background: mb.bg, color: mb.color }}>
                    {mb.label}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* my mat */}
          <div className="mat me">
            {corners('Battlefield', 'Lands')}
            {renderCreatures(me)}
            {renderLandRow(me)}
          </div>

          {/* bottom */}
          <div className="g-bottom">
            {avatar(me, { position: 'absolute', left: 20, bottom: 24 })}
            <div className="gpiles" style={{ position: 'absolute', right: 20, bottom: 24 }}>
              {commandPile(me, 'md')}
              {pile(me, 'exile', 'md')}
              {pile(me, 'graveyard', 'md')}
              {pile(me, 'library', 'md')}
            </div>
            {strip.length > 0 && (
              <div className="side-strip" style={{ right: 250 }}>
                <span className="lbl">PLAYABLE</span>
                {strip.map((iid) => (
                  BCard({ iid: iid, small: true })
                ))}
              </div>
            )}
            {renderHand()}
          </div>
        </div>

        {/* stack spotlight */}
        <div className="spot-dim" style={{ opacity: anyFresh ? 1 : 0 }} />
        <div data-anchor="spot" style={{ position: 'absolute', left: W / 2 - 130, top: H / 2 - 181, width: 260, height: 363, pointerEvents: 'none' }} />
        {renderSpot()}

        {/* arrow + tethers */}
        <svg className="arrow-svg">
          {tethers.map((t, i) => (
            <path key={i} className="tether" d={t} />
          ))}
          {showArrow && (
            <>
              <path ref={arrowRef} className="aim" d="M-10 -10" />
              <circle ref={retRef} cx={-100} cy={-100} r={18} />
            </>
          )}
        </svg>

        <div ref={fxLayerRef} className="fxlayer" />

        {showNotice && (
          <div className="notice2">
            <span>✋ Resolve by hand: {view.manualNotice}</span>
            <button className="tiny" onClick={() => { setDismissed(view.manualNotice); manual({ op: 'resolveTop' }); }} title="Mark this step as done">Done</button>
          </div>
        )}

        {tools && (
          <div className="tools-menu" onMouseLeave={() => setTools(false)}>
            <button onClick={() => { setTools(false); setSettings(true); }}>Priority stops…</button>
            <button onClick={() => { setTools(false); setZoneView({ player: me, zone: 'exile' }); }}>View my exile</button>
            <button onClick={() => { setTools(false); if (confirm('Concede this game?')) act({ type: 'concede' }); }}>Concede</button>
            <button onClick={() => { setTools(false); if (confirm('Concede and leave?')) onLeave(); }}>Leave table</button>
          </div>
        )}

        {/* log drawer */}
        <div className="logdrawer" style={{ transform: `translateX(${logOpen ? '0' : '105%'})` }}>
          <div className="hd">
            <span>Game log</span>
            <button onClick={() => setLogOpen(false)}>Close</button>
          </div>
          <div className="body">
            {view.log
              .slice()
              .reverse()
              .slice(0, 150)
              .map((l: any, i: number) => (
                <div key={i} style={{ color: LOGC[l.kind] ?? (l.player === op ? '#f3b1a5' : l.player === me ? '#bfe3ff' : '#c8d0dc'), fontWeight: l.kind === 'turn' ? 800 : 500 }}>
                  {l.text}
                </div>
              ))}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); if (chat.trim()) act({ type: 'chat', text: chat }); setChat(''); }}>
            <input value={chat} onChange={(e) => setChat(e.target.value)} placeholder="Chat…" />
          </form>
        </div>

        {view.over && (
          <div className="over2">
            <div>
              <div className="t">{view.winner === me ? 'Victory' : view.winner == null ? 'Draw' : 'Defeat'}</div>
              <div style={{ color: '#8d98a8' }}>{view.winner != null ? `${P[view.winner as number].name} wins.` : ''}</div>
              {!spectating && meta?.mode !== 'draft' && !meta?.ranked && (
                <button className="hexbig" onClick={onRematch}>
                  <span>Rematch</span>
                </button>
              )}
              {meta?.mode === 'draft' ? (
                <button className="hexbig" onClick={onLeave}>
                  <span>Back to the draft</span>
                </button>
              ) : (
                <button className="pillbtn ghost" onClick={onLeave}>Leave table</button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* hover preview */}
        {hoverCard && hoverDef && !anyFresh && (
          <div className="preview2" style={{ transform: `translateY(-50%) scale(${S})` }}>
            {hoverImg ? <img src={hoverImg} alt="" /> : <div className="tcard plain" style={{ fontSize: 13, padding: 12 }}><div className="tn" style={{ fontSize: 16 }}>{nameOf(hoverCard.iid)}</div><div className="tx">{hoverDef.typeLine}{'\n\n'}{hoverDef.oracle}</div></div>}
            {((hoverCard.kw?.length ?? 0) > 0 || ((hoverCard as any).unparsed?.length ?? 0) > 0) && (
              <div className="info">
                {(hoverCard.kw?.length ?? 0) > 0 && <div className="kw">{hoverCard.kw!.join(' · ')}</div>}
                {((hoverCard as any).unparsed?.length ?? 0) > 0 && (
                  <div className="un">
                    <strong>Handled by hand:</strong>
                    {(hoverCard as any).unparsed.map((u: string, i: number) => (
                      <div key={i}>• {u}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      {renderModalPrompt()}
      {facePicker()}
      {zoneModal()}
      {renderMenu()}
      {tokenModal && <TokenModal onClose={() => setTokenModal(false)} onCreate={(op2) => { manual(op2); setTokenModal(false); }} />}
      {settings && myStops && (
        <Modal title="Game speed & stops" onCancel={() => setSettings(false)}>
          <p className="muted small">Like Arena, the game passes priority for you unless you have something you could play at a step where you set a stop. Opponent spells on the stack always give you a chance to respond if you can.</p>
          <div className="stops-grid">
            <div />
            <strong>Your turn</strong>
            <strong>Their turn</strong>
            {SHOWN_STEPS.map((s) => (
              <React.Fragment key={s}>
                <span>{STEP_LABEL[s]}</span>
                <input type="checkbox" checked={myStops.own.includes(s)} onChange={() => act({ type: 'setStops', own: myStops.own.includes(s) ? myStops.own.filter((x) => x !== s) : [...myStops.own, s], opp: myStops.opp })} />
                <input type="checkbox" checked={myStops.opp.includes(s)} onChange={() => act({ type: 'setStops', own: myStops.own, opp: myStops.opp.includes(s) ? myStops.opp.filter((x) => x !== s) : [...myStops.opp, s] })} />
              </React.Fragment>
            ))}
          </div>
          <div className="pace-row">
            <strong>Game speed</strong>
            <div className="seg">
              {(['slow', 'normal', 'fast'] as const).map((p) => (
                <button key={p} className={((P[me] as any).pace ?? 'normal') === p ? 'on' : ''} onClick={() => act({ type: 'setPace', pace: p } as any)}>
                  {p === 'slow' ? 'Slow' : p === 'normal' ? 'Normal' : 'Fast'}
                </button>
              ))}
            </div>
            <span className="muted small">How long each play stays on screen before the game moves on.</span>
          </div>
          <label className="row">
            <input type="checkbox" checked={!!(P[me] as any).fullControl} onChange={(e) => act({ type: 'setStops', own: myStops.own, opp: myStops.opp, fullControl: e.target.checked })} />
            Full control (never auto-pass)
          </label>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, children, onCancel }: { title: string; children: React.ReactNode; onCancel?: () => void }) {
  return (
    <div className="modal-bg" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          {onCancel && <button className="tiny ghost" onClick={onCancel}>✕</button>}
        </div>
        {children}
      </div>
    </div>
  );
}

/** "Choose a card name": search the whole card database, like Arena's name picker. */
function NameModal({ title, nonland, onPick, onCancel }: { title: string; nonland: boolean; onPick: (name: string) => void; onCancel?: () => void }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<ApiCard[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    let live = true;
    const t = setTimeout(() => {
      searchCards(q.trim(), 0, 40).then((r) => {
        if (!live) return;
        const seen = new Set<string>();
        setHits(r.cards.filter((c) => !(nonland && /\bLand\b/.test(c.typeLine.split(' // ')[0])) && !seen.has(c.name) && seen.add(c.name)));
      }).catch(() => live && setHits([]));
    }, 180);
    return () => { live = false; clearTimeout(t); };
  }, [q, nonland]);
  return (
    <Modal title={title} onCancel={onCancel}>
      <input autoFocus className="name-search" placeholder="Start typing a card name…" value={q} onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && hits[0]) onPick(hits[0].name); }} />
      <div className="name-hits">
        {hits.map((c) => (
          <button key={c.name} className="name-hit" onClick={() => onPick(c.name)}>
            <span>{c.name}</span>
            <span className="muted small">{c.typeLine}</span>
          </button>
        ))}
        {q.trim().length >= 2 && !hits.length && <p className="muted small center">No matching cards.</p>}
      </div>
    </Modal>
  );
}

function TokenModal({ onClose, onCreate }: { onClose: () => void; onCreate: (op: ManualOp) => void }) {
  const [name, setName] = useState('Soldier');
  const [p, setP] = useState('1');
  const [t, setT] = useState('1');
  const [colors, setColors] = useState<string[]>(['W']);
  const [kw, setKw] = useState('');
  const [count, setCount] = useState(1);
  const [creature, setCreature] = useState(true);
  return (
    <Modal title="Create token" onCancel={onClose}>
      <div className="form">
        <label>Name / type <input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="row"><input type="checkbox" checked={creature} onChange={(e) => setCreature(e.target.checked)} /> Creature</label>
        {creature && (
          <div className="row">
            <label>Power <input value={p} onChange={(e) => setP(e.target.value)} size={3} /></label>
            <label>Toughness <input value={t} onChange={(e) => setT(e.target.value)} size={3} /></label>
          </div>
        )}
        <div className="row">
          {['W', 'U', 'B', 'R', 'G'].map((c) => (
            <button key={c} className={`mana-btn m-${c} ${colors.includes(c) ? 'selected' : ''}`} onClick={() => setColors(colors.includes(c) ? colors.filter((x) => x !== c) : [...colors, c])}>
              {c}
            </button>
          ))}
        </div>
        <label>Keywords (comma separated) <input value={kw} onChange={(e) => setKw(e.target.value)} placeholder="flying, lifelink" /></label>
        <label>Count <input type="number" value={count} min={1} max={20} onChange={(e) => setCount(+e.target.value)} /></label>
        <div className="row center">
          <button className="primary big" onClick={() => onCreate({ op: 'token', name, power: creature ? p : undefined, toughness: creature ? t : undefined, colors, keywords: kw.split(',').map((x) => x.trim()).filter(Boolean), count, types: creature ? `Token Creature — ${name}` : `Token Artifact — ${name}` })}>
            Create
          </button>
        </div>
      </div>
    </Modal>
  );
}
