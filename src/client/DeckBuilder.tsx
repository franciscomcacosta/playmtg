// The Deck Builder from the Claude Design file, wired to the real card database:
//  - results come from /api/cards/browse (every card the engine knows, paged as you scroll)
//  - imports match names with /api/cards/resolve (with "did you mean" fixes), links are read by /api/decks/fetch
//  - decks are saved to the account (signed in) or to this browser (guest)
import React from 'react';
import { DeckBuilderView, DeckBuilderView_CSS } from './DeckBuilderView';
import { api, getState, request, toast, useStore, type DeckSummary } from './store';
import { localDecks, saveLocal, deleteLocal } from './localDecks';
import { navigate, useRoute } from './router';
import { PIP as PIPC, css } from './dc';

// ------------------------------------------------------------------------------------------------ card data
export interface DC {
  name: string; cost: string[]; mv: number; typeLine: string; types: string[]; rarity: string; colors: string[]; ci: string[];
  basic: boolean; land: boolean; legend: boolean; image: string | null; art: string | null;
}
const TYPES = ['Creature', 'Instant', 'Sorcery', 'Enchantment', 'Artifact', 'Planeswalker', 'Land'];
const WUBRG = ['W', 'U', 'B', 'R', 'G'];
const KNOWN = new Map<string, DC>(); // exact card name -> card
const RESOLVED = new Map<string, { found: string | null; sugg: string | null }>(); // normalised typed name -> match
const norm = (x: string) => x.toLowerCase().replace(/[’‘`]/g, "'").replace(/\s+/g, ' ').trim();
function toDC(c: any): DC {
  const front = String(c.manaCost ?? '').split(' // ')[0];
  const cost = (front.match(/\{([^}]+)\}/g) ?? []).map((s) => s.slice(1, -1));
  const head = String(c.typeLine ?? '').split(' // ')[0].split(' — ')[0];
  const types = TYPES.filter((t) => head.includes(t));
  const ci: string[] = c.colorIdentity ?? c.colors ?? [];
  return {
    name: c.name, cost, mv: c.cmc ?? 0, typeLine: c.typeLine ?? '', types, rarity: ['common', 'uncommon', 'rare', 'mythic'].includes(c.rarity) ? c.rarity : 'common',
    colors: c.colors ?? [], ci, basic: !!c.basic, land: !!c.land || types.includes('Land'), legend: !!c.legendary,
    image: c.image ?? c.faces?.[0]?.image ?? null, art: c.art ?? null,
  };
}
const learn = (c: any) => {
  const d = toDC(c);
  KNOWN.set(d.name, d);
  RESOLVED.set(norm(d.name), { found: d.name, sugg: null });
  return d;
};
const NAMED = (n: string, v: string) => 'https://api.scryfall.com/cards/named?exact=' + encodeURIComponent(n).replace(/'/g, '%27') + '&format=image&version=' + v;
const IMG = (n: string, v: 'normal' | 'large' | 'art_crop' = 'normal') => {
  const c = KNOWN.get(n);
  if (c) {
    if (v === 'art_crop' && c.art) return c.art;
    if (c.image) return v === 'large' ? c.image.replace('/normal/', '/large/') : v === 'art_crop' ? c.image.replace('/normal/', '/art_crop/') : c.image;
  }
  return NAMED(n, v);
};
const PIP = (s: string) => PIPC(s);

/** Look up names on the server; fills KNOWN / RESOLVED. */
const inflight = new Set<string>();
async function resolveNames(names: string[]): Promise<void> {
  const want = [...new Set(names.map((n) => n.trim()).filter(Boolean))].filter((n) => !RESOLVED.has(norm(n)) && !inflight.has(norm(n)));
  if (!want.length) return;
  want.forEach((n) => inflight.add(norm(n)));
  try {
    for (let i = 0; i < want.length; i += 400) {
      const chunk = want.slice(i, i + 400);
      const r = await api('/api/cards/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ names: chunk }) });
      const { results } = await r.json();
      for (const x of results as any[]) {
        if (x.found) {
          learn(x.card);
          RESOLVED.set(norm(x.name), { found: x.found, sugg: null });
        } else RESOLVED.set(norm(x.name), { found: null, sugg: x.suggestion ?? null });
      }
    }
  } catch {
    /* offline: rows stay "checking" and the user can retry by editing */
  } finally {
    want.forEach((n) => inflight.delete(norm(n)));
  }
}

// ------------------------------------------------------------------------------------------------ design constants
const CN: Record<string, string> = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green', C: 'Colorless' };
const CGLOW: Record<string, string> = { W: 'rgba(248,231,170,.75)', U: 'rgba(90,168,240,.75)', B: 'rgba(176,143,192,.75)', R: 'rgba(240,106,58,.8)', G: 'rgba(92,194,122,.75)', C: 'rgba(200,194,184,.6)' };
const CBAR: Record<string, string> = { W: '#f3e6b8', U: '#4a8fd6', B: '#7a6384', R: '#e0553a', G: '#3f9a5a' };
const RC: Record<string, string> = { common: '#9aa3ae', uncommon: '#c9d6e6', rare: '#e8c46a', mythic: '#f07a3a' };
const RGEM: Record<string, string> = { common: 'linear-gradient(135deg,#cfd4da,#4b525c)', uncommon: 'linear-gradient(135deg,#eef4fb,#6f8aa6)', rare: 'linear-gradient(135deg,#fff0b8,#a8742a)', mythic: 'linear-gradient(135deg,#ffc38a,#b8360e)' };
const RORD: Record<string, number> = { common: 0, uncommon: 1, rare: 2, mythic: 3 };
const GROUPS: [string, (c: DC) => boolean][] = [
  ['Creatures', (c) => c.types.includes('Creature')],
  ['Planeswalkers', (c) => c.types.includes('Planeswalker')],
  ['Instants', (c) => c.types.includes('Instant')],
  ['Sorceries', (c) => c.types.includes('Sorcery')],
  ['Artifacts & enchantments', (c) => !c.land],
  ['Lands', (c) => c.land],
];
const colorRank = (c: DC) => (c.land ? 7 : c.colors.length === 0 ? 6 : c.colors.length > 1 ? 5 : WUBRG.indexOf(c.colors[0]));
const tog = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
const tag = (on: boolean) => ({ pressed: on ? 'true' : 'false', b: on ? 'rgba(240,169,59,.55)' : 'transparent', bg: on ? 'rgba(240,169,59,.16)' : 'rgba(255,255,255,.045)', c: on ? '#f7dc9a' : '#c3c8d0' });
type Fmt = 'standard' | 'commander';
const FMT: Record<Fmt, { name: string; size: string; target: number; lim: number; art: string; rules: string[]; ph: string }> = {
  standard: { name: 'Standard', size: '60+ cards', target: 60, lim: 4, art: 'Lightning Bolt', rules: ['At least 60 cards in the main deck', 'Up to 4 copies of each card, basic lands unlimited', 'Optional sideboard of up to 15 cards'], ph: 'Deck\n4 Lightning Bolt\n4 Goblin Guide\n20 Mountain\n\nSideboard\n2 Wrath of God' },
  commander: { name: 'Commander', size: '100 cards', target: 100, lim: 1, art: 'Krenko, Mob Boss', rules: ['Exactly 100 cards, commander included', 'One copy of each card, basic lands unlimited', 'A legendary creature leads. Every card must fit its colors'], ph: 'Commander\n1 Krenko, Mob Boss\n\nDeck\n1 Sol Ring\n1 Goblin Guide\n38 Mountain' },
};
const SITES = [['moxfield.com', 'Moxfield'], ['archidekt.com', 'Archidekt'], ['mtggoldfish.com', 'MTGGoldfish'], ['scryfall.com', 'Scryfall'], ['aetherhub.com', 'AetherHub'], ['tappedout.net', 'TappedOut'], ['edhrec.com', 'EDHREC'], ['deckstats.net', 'Deckstats'], ['mtgtop8.com', 'MTGTop8']];
const BASIC_NAMES = /^(snow-covered )?(plains|island|swamp|mountain|forest)$|^wastes$/i;
const isBasic = (n: string) => KNOWN.get(n)?.basic ?? BASIC_NAMES.test(n);

// ------------------------------------------------------------------------------------------------ list parsing
const HDR = /^(commanders?|deck|main|maindeck|mainboard|main deck|sideboard|side|sb|maybeboard|maybe|considering|tokens|companion)$/;
const hdrOf = (l: string) => l.replace(/^\/\/\s*/, '').replace(/^\[|\]$/g, '').replace(/\s*\(\d+\)$/, '').replace(/:$/, '').trim().toLowerCase();
export function parseRaw(text: string) {
  const lines = text.split(/\r?\n/), hasH = lines.some((l) => HDR.test(hdrOf(l.trim())));
  let sec = 'main', saw = false, ignored = 0;
  const out: { raw: string; qty: number; sec: string }[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (!hasH && saw && sec === 'main') sec = 'after';
      continue;
    }
    const hd = hdrOf(line);
    if (HDR.test(hd)) {
      sec = /^command/.test(hd) ? 'commander' : /^(sideboard|side|sb|companion)$/.test(hd) ? 'side' : /^(maybeboard|maybe|considering|tokens)$/.test(hd) ? 'ignore' : 'main';
      continue;
    }
    if (line.startsWith('//') || line.startsWith('#') || /^(about|name)\b/i.test(line)) continue;
    let l = line, s2 = sec;
    if (/^SB:\s*/i.test(l)) {
      s2 = 'side';
      l = l.replace(/^SB:\s*/i, '');
    }
    const m = l.match(/^(\d+)\s*[xX]?\s+(.+)$/);
    const qty = m ? +m[1] : 1;
    let name = m ? m[2] : l;
    if (/\*CMDR\*/i.test(name)) s2 = 'commander';
    name = name.replace(/\*[A-Za-z]+\*/g, '').replace(/\[[^\]]*\]/g, '').replace(/\^[^^]*\^/g, '').replace(/\s+#\S+/g, '').replace(/\s+\([A-Za-z0-9]{2,6}\)(\s+\S+)?\s*$/, '').split(' // ')[0].trim();
    if (!name || !qty) continue;
    if (s2 === 'ignore') {
      ignored += qty;
      continue;
    }
    out.push({ raw: name, qty, sec: s2 });
    saw = true;
  }
  return { items: out, ignored };
}
function convertFile(fname: string, txt: string) {
  const ext = (fname.split('.').pop() || '').toLowerCase();
  const xml = () => new DOMParser().parseFromString(txt, 'text/xml');
  if (ext === 'dek' && /<Deck/i.test(txt)) {
    const main: string[] = [], side: string[] = [];
    xml().querySelectorAll('Cards').forEach((c) => (c.getAttribute('Sideboard') === 'true' ? side : main).push(c.getAttribute('Quantity') + ' ' + c.getAttribute('Name')));
    return 'Deck\n' + main.join('\n') + (side.length ? '\n\nSideboard\n' + side.join('\n') : '');
  }
  if (ext === 'cod') {
    const out: string[] = [];
    xml().querySelectorAll('zone').forEach((z) => {
      const nm = (z.getAttribute('name') || '').toLowerCase();
      out.push(nm === 'side' ? 'Sideboard' : nm === 'main' ? 'Deck' : 'Maybeboard');
      z.querySelectorAll('card').forEach((c) => out.push(c.getAttribute('number') + ' ' + c.getAttribute('name')));
      out.push('');
    });
    return out.join('\n');
  }
  if (ext === 'csv') {
    const rows = txt.split(/\r?\n/).filter(Boolean).map((l) => (l.match(/("([^"]|"")*"|[^,]+|(?<=,)(?=,)|^(?=,))/g) || []).map((x) => x.replace(/^"|"$/g, '').replace(/""/g, '"').trim()));
    const hd = rows[0].map((x) => x.toLowerCase());
    const qi = hd.findIndex((x) => /^(count|quantity|qty|amount)$/.test(x)), ni = hd.findIndex((x) => /^(name|card|card name)$/.test(x)), bi = hd.findIndex((x) => /^(board|section|zone)$/.test(x));
    const body = qi >= 0 && ni >= 0 ? rows.slice(1) : rows, Q = qi >= 0 ? qi : 0, N = ni >= 0 ? ni : 1;
    const g: Record<string, string[]> = { Commander: [], Deck: [], Sideboard: [] };
    body.forEach((r) => {
      const b = bi >= 0 ? (r[bi] || '').toLowerCase() : 'main';
      (b.startsWith('command') ? g.Commander : b.startsWith('side') ? g.Sideboard : g.Deck).push((r[Q] || 1) + ' ' + r[N]);
    });
    return Object.entries(g).filter(([, v]) => v.length).map(([k, v]) => k + '\n' + v.join('\n')).join('\n\n');
  }
  return txt;
}

function analyze(text: string, fmt: Fmt, fixes: Record<string, string>, cmdPick: string) {
  const F = FMT[fmt], { items, ignored } = parseRaw(text);
  const look = (raw: string) => RESOLVED.get(norm(raw));
  const res = items.map((it) => {
    const k = norm(it.raw), r = look(it.raw), direct = r?.found ?? null;
    const fr = fixes[k] ? look(fixes[k]) : undefined, fx = fr?.found ?? null;
    return { ...it, key: k, name: direct || fx || null, fixed: !direct && !!fx, sugg: direct || fx ? null : (r?.sugg ?? null), pending: !r };
  });
  const after = res.filter((x) => x.sec === 'after');
  if (after.length) {
    const asCmd = fmt === 'commander' && after.length <= 2 && after.every((x) => x.name && KNOWN.get(x.name)?.legend);
    after.forEach((x) => (x.sec = asCmd ? 'commander' : fmt === 'commander' ? 'main' : 'side'));
  }
  let sideIgn = 0;
  if (fmt === 'commander')
    res.forEach((x) => {
      if (x.sec === 'side') {
        x.sec = 'skip';
        sideIgn += x.qty;
      }
    });
  type E = { qty: number; raws: string[]; fixed: boolean };
  const agg: Record<string, Map<string, E>> = { commander: new Map(), main: new Map(), side: new Map() };
  res.forEach((x) => {
    if (!x.name || !agg[x.sec]) return;
    const m = agg[x.sec], e = m.get(x.name) || { qty: 0, raws: [], fixed: false };
    e.qty += x.qty;
    if (x.fixed) {
      e.fixed = true;
      e.raws.push(x.raw);
    }
    m.set(x.name, e);
  });
  if (fmt === 'standard')
    agg.commander.forEach((e, n) => {
      const x = agg.main.get(n) || { qty: 0, raws: [], fixed: false };
      x.qty += e.qty;
      agg.main.set(n, x);
    });
  const cIn = fmt === 'commander' ? [...agg.commander.keys()] : [];
  let cmd: string | null = cIn[0] || null, picked = false;
  cIn.slice(1).forEach((n) => {
    const x = agg.main.get(n) || { qty: 0, raws: [], fixed: false };
    x.qty += agg.commander.get(n)!.qty;
    agg.main.set(n, x);
  });
  const cands = fmt === 'commander' ? [...agg.main.keys()].filter((n) => KNOWN.get(n)?.legend) : [];
  if (fmt === 'commander' && !cmd && cmdPick && agg.main.has(cmdPick)) {
    cmd = cmdPick;
    picked = true;
  }
  const main: Record<string, number> = {}, side: Record<string, number> = {};
  const info: Record<string, Record<string, any>> = { main: {}, side: {} };
  let trimmed = 0;
  const cap = (n: string, q: number, used: number) => (isBasic(n) ? q : Math.max(0, Math.min(q, F.lim - used)));
  agg.main.forEach((e, n) => {
    const q = picked && n === cmd ? e.qty - 1 : e.qty, kept = cap(n, q, n === cmd ? 1 : 0);
    trimmed += q - kept;
    if (kept) main[n] = kept;
    info.main[n] = { ...e, orig: q, kept };
  });
  agg.side.forEach((e, n) => {
    const kept = cap(n, e.qty, main[n] || 0);
    trimmed += e.qty - kept;
    if (kept) side[n] = kept;
    info.side[n] = { ...e, orig: e.qty, kept };
  });
  const idc = cmd ? KNOWN.get(cmd)?.ci ?? [] : null;
  const off = idc ? Object.keys(main).filter((n) => !(KNOWN.get(n)?.ci ?? []).every((c) => idc.includes(c))) : [];
  const unk = res.filter((x) => !x.name && x.sec !== 'skip' && !x.pending), unkN = unk.reduce((a, x) => a + x.qty, 0);
  const pendingN = res.filter((x) => x.pending).length;
  const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0), mainN = sum(main), sideN = sum(side), total = mainN + (cmd ? 1 : 0);
  return { F, res, info, cmd, picked, main, side, trimmed, off, unk, unkN, ignored, sideIgn, mainN, sideN, total, cands, needCmd: fmt === 'commander' && !cIn.length, importN: total + sideN, pendingN };
}
const ck = (ok: boolean, label: string, val: string) => ({ icon: ok ? '✓' : '!', bg: ok ? 'rgba(126,240,184,.14)' : 'rgba(240,169,59,.16)', ic: ok ? '#9af5c8' : '#f7c26a', label, val, vc: ok ? '#8a909b' : '#f7c26a' });
const TAGS: Record<string, [string, string]> = { fixed: ['rgba(126,240,184,.12)', '#9af5c8'], warn: ['rgba(240,169,59,.14)', '#f7c26a'], bad: ['rgba(224,105,79,.14)', '#ffb3a3'], mute: ['rgba(255,255,255,.06)', '#8a909b'] };
const seg = (on: boolean) => ({ pressed: on ? 'true' : 'false', bg: on ? '#2a2c33' : 'transparent', c: on ? '#f4efe4' : '#7d8491' });
const lim = (c: DC, fmt: Fmt) => (c.basic ? Infinity : FMT[fmt].lim);
const LAST = 'manaforge.editing';
/** Which deck the mounted editor holds: saving a new deck changes the address but must not remount the editor. */
const EDITOR = { key: '', id: null as string | null };

// ------------------------------------------------------------------------------------------------ component
interface Props { id: string | null; fresh: boolean; signed: boolean; decks: DeckSummary[] }

/** Route wrapper: picks the deck from ?id= (or the last one edited) and remounts the editor when it changes. */
export function DeckBuilder() {
  const { query } = useRoute();
  const signed = useStore((s) => !s.guest);
  const authReady = useStore((s) => s.authReady);
  const server = useStore((s) => s.decks);
  React.useEffect(() => {
    if (signed && !server) request({ t: 'decks.list' }, true).catch(() => {});
  }, [signed, !!server]);
  const decks = signed ? server ?? [] : localDecks();
  const fresh = query.get('new') === '1';
  let id = query.get('id');
  if (!id && !fresh) {
    let last: string | null = null;
    try {
      last = localStorage.getItem(LAST);
    } catch {}
    id = (last && decks.find((d) => d.id === last)?.id) || decks.find((d) => !d.id.startsWith('starter-'))?.id || decks[0]?.id || null;
  }
  if (!authReady || (signed && !server)) return <Loading />;
  const key = id && id === EDITOR.id && EDITOR.key ? EDITOR.key : (id ?? 'new') + (fresh || !id ? ':n' : '');
  EDITOR.key = key;
  return <DeckBuilderImpl key={key} id={id} fresh={fresh || !id} signed={signed} decks={decks} />;
}
function Loading() {
  return (
    <div style={css('min-height:100vh;display:grid;place-items:center;background:#0b0d11;color:#8d98a8;font-family:Manrope,system-ui,sans-serif')}>
      <mf-loader size="48"></mf-loader>
    </div>
  );
}

class DeckBuilderImpl extends React.Component<Props, any> {
  searchRef = React.createRef<HTMLInputElement>();
  taRef = React.createRef<HTMLTextAreaElement>();
  _t: Record<string, any> = {};
  _k: any;
  _ps: any;
  _browseSeq = 0;
  deckId: string | null;
  constructor(p: Props) {
    super(p);
    const src = p.fresh || !p.id ? null : p.decks.find((d) => d.id === p.id) ?? null;
    const format: Fmt = src?.format ?? 'standard';
    this.deckId = src?.id ?? null;
    EDITOR.id = this.deckId;
    this.state = {
      name: src?.name ?? 'New Deck', deck: { ...(src?.data.main ?? {}) }, side: { ...(src?.data.side ?? {}) }, commander: src?.data.commander ?? null, format, link: src?.data.link ?? null,
      hist: [], modal: !src ? 'import' : null, imp: !src ? this.newImp(format, { isNew: true }) : null, expKind: 'arena', copied: false,
      q: '', colors: [], mode: 'any', mv: [], types: [], rar: [], inDeckOnly: false, sort: 'mv', hover: null, tile: null, zoom: null, saved: false, dirty: false, live: '',
      results: [] as string[], total: 0, loading: true, more: false, ready: !src, switcher: false, saving: false, ver: 0,
    };
  }
  bumpVer = () => this.setState((s: any) => ({ ver: s.ver + 1 }));

  // ---------------------------------------------------------------------------- server data
  async componentDidMount() {
    this._k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement, typing = t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA');
      if (e.key === '/' && !typing) {
        e.preventDefault();
        this.searchRef.current?.focus();
      }
      if (e.key === 'Escape' && (this.state.modal || this.state.switcher)) {
        this.setState({ modal: null, imp: null, switcher: false });
        return;
      }
      if (this.state.modal) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        this.save();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault();
        this.undo();
      }
    };
    window.addEventListener('keydown', this._k);
    window.addEventListener('beforeunload', this.beforeUnload);
    if (this.deckId) {
      try {
        localStorage.setItem(LAST, this.deckId);
      } catch {}
    }
    this.browse(true);
    // learn every card in the deck (names saved earlier may be spelled differently from the database)
    const s = this.state;
    const names = [...Object.keys(s.deck), ...Object.keys(s.side), ...(s.commander ? [s.commander] : [])];
    if (names.length) {
      await resolveNames(names);
      const fix = (o: Record<string, number>, lost: string[]) => {
        const x: Record<string, number> = {};
        for (const [n, q] of Object.entries(o)) {
          const f = RESOLVED.get(norm(n))?.found;
          if (f) x[f] = (x[f] ?? 0) + q;
          else lost.push(n);
        }
        return x;
      };
      const lost: string[] = [];
      const deck = fix(this.state.deck, lost), side = fix(this.state.side, lost);
      const cf = this.state.commander ? RESOLVED.get(norm(this.state.commander))?.found ?? null : null;
      if (this.state.commander && !cf) lost.push(this.state.commander);
      this.setState({ deck, side, commander: cf, ready: true, live: lost.length ? `${lost.length} card${lost.length === 1 ? '' : 's'} not in the database were left out: ${lost.slice(0, 3).join(', ')}${lost.length > 3 ? '…' : ''}` : '' });
      if (lost.length) toast(`${lost.length} unknown card${lost.length === 1 ? '' : 's'} left out of ${this.state.name}`, true);
    } else this.setState({ ready: true });
  }
  componentWillUnmount() {
    window.removeEventListener('keydown', this._k);
    window.removeEventListener('beforeunload', this.beforeUnload);
    Object.values(this._t).forEach(clearTimeout);
  }
  beforeUnload = (e: BeforeUnloadEvent) => {
    if (this.state.dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  };
  componentDidUpdate(_: Props, ps: any) {
    const s = this.state;
    const keys = ['colors', 'mode', 'mv', 'types', 'rar', 'sort', 'format', 'inDeckOnly'];
    if (keys.some((k) => s[k] !== ps[k]) || (s.inDeckOnly && s.deck !== ps.deck)) this.browse(true);
    else if (s.q !== ps.q) {
      clearTimeout(this._t.q);
      this._t.q = setTimeout(() => this.browse(true), 220);
    }
    const step = (x: any) => (x.imp ? x.imp.step + x.imp.src : '');
    if ((s.modal && s.modal !== ps.modal) || step(s) !== step(ps))
      setTimeout(() => {
        const t = this.taRef.current;
        if (t) {
          t.focus();
          if (this.state.modal === 'export') t.select();
        }
      }, 30);
    // the import preview: look up names as they are typed
    if (s.imp && s.imp.text !== ps.imp?.text) {
      clearTimeout(this._t.r);
      this._t.r = setTimeout(() => {
        const im = this.state.imp;
        if (!im) return;
        const names = parseRaw(im.text).items.map((x) => x.raw);
        resolveNames(names).then(this.bumpVer);
      }, 250);
    }
  }
  async browse(reset: boolean) {
    const s = this.state;
    const seq = ++this._browseSeq;
    const offset = reset ? 0 : s.results.length;
    const p = new URLSearchParams();
    if (s.q.trim()) p.set('q', s.q.trim());
    if (s.colors.length) p.set('colors', s.colors.join(','));
    p.set('mode', s.mode);
    if (s.mv.length) p.set('mv', s.mv.join(','));
    if (s.types.length) p.set('types', s.types.join(','));
    if (s.rar.length) p.set('rarity', s.rar.join(','));
    if (s.inDeckOnly) p.set('names', JSON.stringify([...Object.keys(s.deck), ...Object.keys(s.side)]));
    if (s.format === 'commander') p.set('format', 'commander');
    p.set('sort', s.sort);
    p.set('offset', String(offset));
    p.set('limit', '120');
    this.setState(reset ? { loading: true } : { more: true });
    try {
      const r = await (await api('/api/cards/browse?' + p.toString())).json();
      if (seq !== this._browseSeq) return;
      const names = (r.cards as any[]).map((c) => learn(c).name);
      this.setState((st: any) => ({ results: reset ? names : [...st.results, ...names], total: r.total, loading: false, more: false }));
    } catch {
      if (seq === this._browseSeq) this.setState({ loading: false, more: false, live: 'Could not reach the card server.' });
    }
  }
  onScroll = (e: React.UIEvent<HTMLElement>) => {
    const el = e.currentTarget;
    const s = this.state;
    if (!s.loading && !s.more && s.results.length < s.total && el.scrollTop + el.clientHeight > el.scrollHeight - 900) this.browse(false);
  };

  // ---------------------------------------------------------------------------- editing (from the design)
  newImp(fmt: Fmt, extra?: any) {
    return { step: 'format', fmt, src: 'paste', text: '', url: '', urlState: 'idle', urlMsg: '', site: '', fromLink: false, keepLinked: true, fileMsg: '', fileOk: true, drag: false, mode: 'replace', fixes: {}, cmd: '', deckName: '', isNew: false, ...(extra || {}) };
  }
  up(patch: any) {
    this.setState((s: any) => (s.imp ? { imp: { ...s.imp, ...(typeof patch === 'function' ? patch(s.imp) : patch) } } : null));
  }
  snap(s: any) {
    return { deck: s.deck, side: s.side, commander: s.commander, format: s.format };
  }
  change(fn: (d: any) => any, live: string) {
    this.setState((s: any) => ({ hist: [...s.hist.slice(-39), this.snap(s)], deck: fn(s.deck), live, saved: false, dirty: true }));
  }
  changeAll(fn: (s: any) => any, live: string) {
    this.setState((s: any) => ({ hist: [...s.hist.slice(-39), this.snap(s)], ...fn(s), live, saved: false, dirty: true }));
  }
  undo() {
    this.setState((s: any) => (s.hist.length ? { ...s.hist[s.hist.length - 1], hist: s.hist.slice(0, -1), live: 'Undone.', saved: false, dirty: true } : null));
  }
  owned(n: string) {
    const s = this.state;
    return (s.deck[n] || 0) + (s.format === 'standard' ? s.side[n] || 0 : 0) + (s.format === 'commander' && s.commander === n ? 1 : 0);
  }
  atLimit(c: DC) {
    return this.owned(c.name) >= lim(c, this.state.format);
  }
  add(c: DC) {
    const s = this.state, n = s.deck[c.name] || 0;
    if (s.format === 'commander' && s.commander === c.name) return this.setState({ live: `${c.name} is your commander.` });
    if (this.atLimit(c)) return this.setState({ live: s.format === 'commander' ? `Commander decks allow one ${c.name}.` : `You already have 4 ${c.name}. That's the maximum.` });
    this.change((d) => ({ ...d, [c.name]: n + 1 }), `Added ${c.name}. ${n + 1} in deck.`);
  }
  remove(c: DC) {
    const n = this.state.deck[c.name] || 0;
    if (!n) return;
    this.change((d) => {
      const x = { ...d };
      if (n <= 1) delete x[c.name];
      else x[c.name] = n - 1;
      return x;
    }, `Removed ${c.name}. ${n - 1} left.`);
  }
  bump(o: Record<string, number>, n: string, d: number) {
    const x = { ...o }, v = (x[n] || 0) + d;
    if (v > 0) x[n] = v;
    else delete x[n];
    return x;
  }
  toSide(c: DC) {
    this.changeAll((s) => ({ deck: this.bump(s.deck, c.name, -1), side: this.bump(s.side, c.name, 1) }), `Moved one ${c.name} to the sideboard.`);
  }
  toMain(c: DC) {
    this.changeAll((s) => ({ side: this.bump(s.side, c.name, -1), deck: this.bump(s.deck, c.name, 1) }), `Moved one ${c.name} to the main deck.`);
  }
  sideAdd(c: DC) {
    if (this.atLimit(c)) return;
    this.changeAll((s) => ({ side: this.bump(s.side, c.name, 1) }), `Added ${c.name} to the sideboard.`);
  }
  sideRem(c: DC) {
    this.changeAll((s) => ({ side: this.bump(s.side, c.name, -1) }), `Removed ${c.name} from the sideboard.`);
  }
  setCommander(c: DC) {
    this.changeAll((s) => {
      let d = this.bump(s.deck, c.name, -1);
      if (s.commander) d = this.bump(d, s.commander, 1);
      return { deck: d, commander: c.name };
    }, `${c.name} is now your commander.`);
  }
  unCommander() {
    this.changeAll((s) => ({ deck: s.commander ? this.bump(s.deck, s.commander, 1) : s.deck, commander: null }), 'Commander moved back to the deck.');
  }
  setFormat(f: Fmt) {
    if (f === this.state.format) return;
    this.changeAll((s) => (f === 'standard' ? { format: f, deck: s.commander ? this.bump(s.deck, s.commander, 1) : s.deck, commander: null } : { format: f }), `Format set to ${FMT[f].name}.`);
  }
  linesOf(o: Record<string, number>, pre?: string) {
    const e = Object.entries(o).filter(([n]) => KNOWN.get(n)), out: string[] = [], placed = new Set<string>();
    GROUPS.forEach(([, t]) =>
      e
        .filter(([n]) => !placed.has(n) && t(KNOWN.get(n)!))
        .sort((a, b) => KNOWN.get(a[0])!.mv - KNOWN.get(b[0])!.mv || a[0].localeCompare(b[0]))
        .forEach(([n, k]) => {
          placed.add(n);
          out.push((pre ? k + pre : k + ' ') + n);
        }),
    );
    return out;
  }
  exportText(kind: string) {
    const s = this.state, cmd = s.format === 'commander' ? s.commander : null, side = s.format === 'standard' ? this.linesOf(s.side, kind === 'plain' ? 'x ' : '') : [];
    if (kind === 'mtgo') return [this.linesOf(s.deck).join('\n'), side.join('\n'), cmd ? '1 ' + cmd : ''].filter(Boolean).join('\n\n');
    if (kind === 'plain') return [cmd ? '// Commander\n1x ' + cmd : '', '// Main\n' + this.linesOf(s.deck, 'x ').join('\n'), side.length ? '// Sideboard\n' + side.join('\n') : ''].filter(Boolean).join('\n\n');
    return [cmd ? 'Commander\n1 ' + cmd : '', 'Deck\n' + this.linesOf(s.deck).join('\n'), side.length ? 'Sideboard\n' + side.join('\n') : ''].filter(Boolean).join('\n\n');
  }
  copyExport() {
    const t = this.exportText(this.state.expKind);
    const done = () => {
      this.setState({ copied: true });
      clearTimeout(this._t.c);
      this._t.c = setTimeout(() => this.setState({ copied: false }), 1800);
    };
    if (navigator.clipboard && navigator.clipboard.writeText)
      navigator.clipboard.writeText(t).then(done, () => {
        this.selectTa();
        done();
      });
    else {
      this.selectTa();
      try {
        document.execCommand('copy');
      } catch {}
      done();
    }
  }
  download() {
    const b = new Blob([this.exportText(this.state.expKind)], { type: 'text/plain' }), a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = (this.state.name || 'deck').replace(/[^\w\- ]+/g, '').trim() + '.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  selectTa() {
    const t = this.taRef.current;
    if (t) {
      t.focus();
      t.select();
    }
  }
  async fetchLink() {
    const im = this.state.imp, u = im.url.trim();
    let host = '';
    try {
      host = new URL(/^https?:/i.test(u) ? u : 'https://' + u).hostname.replace(/^www\./, '');
    } catch {}
    if (!host || !host.includes('.')) return this.up({ urlState: 'error', urlMsg: 'That does not look like a link. Copy the address from your browser bar.' });
    const site = SITES.find(([d]) => host === d || host.endsWith('.' + d));
    if (!site) return this.up({ urlState: 'error', urlMsg: `PlayMTG can't read decks from ${host} yet. Export the list there and use Paste list instead.` });
    this.up({ urlState: 'loading', urlMsg: `Reading the deck from ${site[1]}…`, site: site[1] });
    try {
      const r = await api('/api/decks/fetch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: /^https?:/i.test(u) ? u : 'https://' + u }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'The deck could not be read.');
      this.up({ urlState: 'done', urlMsg: `Loaded “${d.name}” from ${d.site}. Edit it under Paste list if needed.`, text: d.text, deckName: d.name, fromLink: true, fixes: {}, cmd: '' });
    } catch (e: any) {
      this.up({ urlState: 'error', urlMsg: e.message ?? 'The deck could not be read.' });
    }
  }
  readFile(f: File | null | undefined) {
    if (!f) return;
    if (f.size > 512000) return this.up({ fileMsg: 'That file is too large for a decklist.', fileOk: false, drag: false });
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const t = convertFile(f.name, String(rd.result));
        const n = parseRaw(t).items.length;
        this.up({ text: t, fromLink: false, fixes: {}, cmd: '', drag: false, fileOk: n > 0, fileMsg: n ? `Read ${f.name}: ${n} lines. Edit it under Paste list if needed.` : `No cards found in ${f.name}.`, deckName: f.name.replace(/\.[^.]+$/, '') });
      } catch {
        this.up({ fileMsg: `Couldn't read ${f.name}.`, fileOk: false, drag: false });
      }
    };
    rd.readAsText(f);
  }
  doImport() {
    const s = this.state, im = s.imp, a = analyze(im.text, im.fmt, im.fixes, im.cmd);
    if (!a.importN || a.pendingN) return;
    const merge = im.mode === 'merge' && im.fmt === s.format;
    const capAdd = (base: Record<string, number>, add: Record<string, number>, other: Record<string, number>) => {
      const x = { ...base };
      Object.entries(add).forEach(([n, k]) => {
        const room = isBasic(n) ? k : Math.max(0, FMT[im.fmt as Fmt].lim - (x[n] || 0) - (other[n] || 0) - (s.commander === n ? 1 : 0));
        if (Math.min(k, room)) x[n] = (x[n] || 0) + Math.min(k, room);
      });
      return x;
    };
    const deck = merge ? capAdd(s.deck, a.main, s.side) : a.main;
    const side = merge ? capAdd(s.side, a.side, deck) : a.side;
    const commander = a.cmd || (merge ? s.commander : null);
    const link = im.fromLink && im.keepLinked ? { site: im.site, url: im.url.trim(), text: im.text } : merge ? s.link : null;
    this.changeAll(() => ({ format: im.fmt, deck, side, commander, link, ...(!merge && im.deckName ? { name: im.deckName } : {}), modal: null, imp: null }), `Imported ${a.importN} cards.` + (a.unkN ? ` Skipped ${a.unkN} not found.` : ''));
  }
  startEmpty() {
    const f = this.state.imp.fmt as Fmt;
    this.setState({ format: f, deck: {}, side: {}, commander: null, link: null, modal: null, imp: null, live: `New ${FMT[f].name} deck.` });
  }
  tileEnter(e: React.MouseEvent, name: string) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    clearTimeout(this._t.z);
    this.setState({ tile: name });
    this._t.z = setTimeout(() => {
      const H = Math.min(innerHeight * 0.84, 680), W = (H * 488) / 680, gap = 18;
      const right = r.right + gap + W < innerWidth - 8;
      const x = right ? r.right + gap : Math.max(8, r.left - gap - W);
      const y = Math.min(Math.max(12, r.top + r.height / 2 - H / 2), innerHeight - H - 12);
      this.setState({ zoom: { name, x: x + 'px', y: y + 'px', h: H + 'px', origin: right ? 'left center' : 'right center' } });
    }, 500);
  }
  tileLeave = () => {
    clearTimeout(this._t.z);
    this.setState({ tile: null, zoom: null });
  };
  zClose = () => {
    clearTimeout(this._t.z);
    if (this.state.zoom) this.setState({ zoom: null });
  };

  // ---------------------------------------------------------------------------- saving / switching decks
  async save(): Promise<string | null> {
    const s = this.state;
    if (s.saving) return null;
    const data = { main: s.deck, side: s.format === 'commander' ? {} : s.side, commander: s.format === 'commander' ? s.commander : null, link: s.link };
    const name = (s.name || '').trim() || 'Untitled deck';
    this.setState({ saving: true });
    try {
      let id: string;
      if (this.props.signed) {
        const r: any = await request({ t: 'decks.save', deck: { id: this.deckId && !this.deckId.startsWith('starter-') && !this.deckId.startsWith('local-') ? this.deckId : undefined, name, format: s.format, ...data } });
        id = r.id;
      } else id = saveLocal({ id: this.deckId ?? undefined, name, format: s.format, data });
      const isNewId = id !== this.deckId;
      this.deckId = id;
      EDITOR.id = id;
      try {
        localStorage.setItem(LAST, id);
      } catch {}
      this.setState({ saved: true, dirty: false, saving: false, live: 'Deck saved.' });
      clearTimeout(this._t.s);
      this._t.s = setTimeout(() => this.setState({ saved: false }), 2200);
      // keep the address in step without remounting the editor
      if (isNewId) history.replaceState(null, '', '/decks?id=' + encodeURIComponent(id));
      return id;
    } catch {
      this.setState({ saving: false });
      return null;
    }
  }
  async openDeck(id: string | null) {
    if (this.state.dirty && (Object.keys(this.state.deck).length || this.state.commander)) await this.save();
    this.setState({ dirty: false, switcher: false });
    navigate(id ? '/decks?id=' + encodeURIComponent(id) : '/decks?new=1');
  }
  async deleteDeck() {
    const id = this.deckId;
    if (!id || id.startsWith('starter-')) return;
    if (this.props.signed) await request({ t: 'decks.delete', id }).catch(() => {});
    else deleteLocal(id);
    try {
      localStorage.removeItem(LAST);
    } catch {}
    toast(`${this.state.name} deleted`);
    this.setState({ dirty: false, switcher: false });
    navigate('/decks?new=1');
  }

  // ---------------------------------------------------------------------------- view values
  impVals() {
    const s = this.state, im = s.imp;
    if (!im) return {};
    const F = FMT[im.fmt as Fmt], fmtStep = im.step === 'format';
    const a = fmtStep ? null : analyze(im.text, im.fmt, im.fixes, im.cmd);
    const has = !!a && a.res.length > 0;
    const curTotal = Object.values(s.deck as Record<string, number>).reduce((x, y) => x + y, 0) + Object.values(s.side as Record<string, number>).reduce((x, y) => x + y, 0) + (s.commander ? 1 : 0);
    const canMerge = curTotal > 0 && im.fmt === s.format;
    let secs: any[] = [], checks: any[] = [];
    if (has && a) {
      const tg = (key: string, txt: string) => ({ hasTag: true, tag: txt, tagBg: TAGS[key][0], tagC: TAGS[key][1] });
      const known = (n: string, e: any, secKey: string) => {
        const isOff = secKey === 'main' && a.off.includes(n);
        const t = e.kept === 0 ? tg('warn', 'Removed') : e.kept < e.orig ? tg('warn', `Kept ${e.kept}`) : isOff ? tg('bad', 'Off-color') : e.fixed ? tg('fixed', 'Fixed') : { hasTag: false };
        const sub = e.fixed ? `Matched from “${e.raws[0]}”` : e.kept === 0 && n === a.cmd ? 'Already your commander' : e.kept < e.orig ? `List had ${e.orig}` : isOff ? `Outside ${a.cmd!.split(',')[0]}'s colors` : '';
        return { qty: e.kept, qc: e.kept ? '#f7dc9a' : '#5a606a', name: n, nc: '#e7ebf1', bg: 'transparent', sub, hasSub: !!sub, hasFix: false, ...t };
      };
      const unknownRow = (x: any) =>
        x.pending
          ? { qty: x.qty, qc: '#5a606a', name: x.raw, nc: '#8a909b', bg: 'transparent', sub: 'Looking it up…', hasSub: true, hasFix: false, hasTag: false }
          : {
              qty: x.qty, qc: '#5a606a', name: x.raw, nc: x.sugg ? '#ffb3a3' : '#8a909b', bg: x.sugg ? 'rgba(224,105,79,.07)' : 'transparent', sub: x.sugg ? 'Not found' : 'Not in the PlayMTG card database', hasSub: true, hasFix: !!x.sugg, fixLabel: x.sugg ? 'Use ' + x.sugg : '',
              fix: () => {
                this.up((p: any) => ({ fixes: { ...p.fixes, [x.key]: x.sugg } }));
                resolveNames([x.sugg]).then(this.bumpVer);
              }, ...(x.sugg ? { hasTag: false } : tg('mute', 'Skipped')),
            };
      const build = (key: string, label: string) => {
        const rows: any[] = [], seen = new Set<string>();
        if (key === 'commander' && a.cmd) {
          rows.push({ qty: 1, qc: '#f7dc9a', name: a.cmd, nc: '#f4efe4', bg: 'rgba(240,169,59,.08)', sub: a.picked ? 'Picked from the list' : '', hasSub: a.picked, hasFix: false, hasTag: false });
          seen.add(a.cmd);
        }
        a.res
          .filter((x) => x.sec === key)
          .forEach((x) => {
            if (!x.name) return rows.push(unknownRow(x));
            if (key === 'commander' || seen.has(x.name)) return;
            seen.add(x.name);
            const e = a.info[key]?.[x.name];
            if (e) rows.push(known(x.name, e, key));
          });
        const n = key === 'commander' ? (a.cmd ? 1 : 0) : key === 'main' ? a.mainN : a.sideN;
        return rows.length ? { label, n, rows } : null;
      };
      secs = (im.fmt === 'commander' ? [build('commander', 'COMMANDER'), build('main', 'DECK')] : [build('main', 'MAIN DECK'), build('side', 'SIDEBOARD')]).filter(Boolean);
      const found = ck(!a.unkN && !a.pendingN, 'All cards found', a.pendingN ? 'Checking…' : a.unkN ? `${a.unkN} not found` : 'Yes');
      checks =
        im.fmt === 'commander'
          ? [found, ck(!!a.cmd, 'Commander chosen', a.cmd ? a.cmd.split(',')[0] : 'None'), ck(a.total === 100, 'Exactly 100 cards', `${a.total}`), ck(!a.trimmed, 'One copy of each card', a.trimmed ? `${a.trimmed} removed` : 'Yes'), ck(!a.off.length && !!a.cmd, "Fits the commander's colors", !a.cmd ? '—' : a.off.length ? `${a.off.length} off-color` : 'Yes')]
          : [found, ck(a.mainN >= 60, 'Main deck has 60 or more', `${a.mainN}`), ck(a.sideN <= 15, 'Sideboard has 15 or fewer', `${a.sideN}`), ck(!a.trimmed, 'No more than 4 of each', a.trimmed ? `${a.trimmed} removed` : 'Yes')];
    }
    const urlBusy = im.urlState === 'loading';
    const footBits = has && a ? [a.pendingN ? `checking ${a.pendingN} name${a.pendingN === 1 ? '' : 's'}…` : '', `${a.importN} card${a.importN === 1 ? '' : 's'} will be imported`, a.unkN ? `${a.unkN} skipped` : '', a.ignored ? `${a.ignored} maybeboard` : '', a.sideIgn ? 'sideboard ignored in Commander' : ''].filter(Boolean) : [];
    const blocked = !fmtStep && !(a && a.importN && !a.pendingN);
    return {
      title: im.isNew ? 'New deck' : 'Import deck',
      steps: [['Format', 'format'], ['Card list', 'source']].map(([l, k], i) => {
        const cur = im.step === k, done = !cur && i === 0;
        return { n: done ? '✓' : String(i + 1), label: l, cur: cur ? 'step' : 'false', c: cur ? '#f4efe4' : '#7d8491', bg: cur ? 'linear-gradient(180deg,#f5b44b,#b8621a)' : done ? 'rgba(126,240,184,.16)' : 'rgba(255,255,255,.06)', nc: cur ? '#1b1206' : done ? '#9af5c8' : '#8a909b', line: i === 0 };
      }),
      isFormat: fmtStep, isSource: !fmtStep,
      fmts: (Object.entries(FMT) as [Fmt, any][]).map(([k, f]) => {
        const on = im.fmt === k;
        return { name: f.name, size: f.size, rules: f.rules, art: NAMED(f.art, 'art_crop'), pressed: on ? 'true' : 'false', ring: on ? '0 0 0 2px #f0a93b,0 0 28px rgba(240,169,59,.25),0 20px 40px rgba(0,0,0,.6)' : '0 0 0 1px rgba(255,255,255,.08),0 20px 40px rgba(0,0,0,.5)', dotB: on ? '#f0a93b' : '#6b7280', dot: on ? '#f0a93b' : 'transparent', pick: () => this.up({ fmt: k, cmd: '' }), go: () => this.up({ fmt: k, cmd: '', step: 'source' }) };
      }),
      fmtName: F.name, fmtSize: F.size, back: () => this.up({ step: 'format' }),
      tabs: [['paste', 'Paste list'], ['link', 'From a link'], ['file', 'Upload file']].map(([k, l]) => ({ label: l, ...seg(im.src === k), pick: () => this.up({ src: k }) })),
      isPaste: im.src === 'paste', isLink: im.src === 'link', isFile: im.src === 'file',
      text: im.text, ph: F.ph, setText: (e: any) => this.up({ text: e.target.value }),
      url: im.url, setUrl: (e: any) => this.up({ url: e.target.value, urlState: 'idle', urlMsg: '' }), urlKey: (e: any) => e.key === 'Enter' && this.fetchLink(),
      fetch: () => this.fetchLink(), noFetch: !im.url.trim() || urlBusy, fetchOp: !im.url.trim() || urlBusy ? 0.45 : 1, fetchLabel: urlBusy ? 'Reading…' : im.urlState === 'done' ? 'Fetch again' : 'Fetch deck',
      hasUrlMsg: !!im.urlMsg, urlMsg: im.urlMsg, urlMsgBg: im.urlState === 'error' ? 'rgba(224,105,79,.1)' : im.urlState === 'done' ? 'rgba(126,240,184,.08)' : 'rgba(255,255,255,.04)', urlMsgC: im.urlState === 'error' ? '#ffb3a3' : im.urlState === 'done' ? '#9af5c8' : '#c3c8d0',
      sites: SITES.map(([, l]) => {
        const on = im.site === l && im.urlState !== 'error';
        return { label: l, b: on ? 'rgba(240,169,59,.55)' : 'rgba(255,255,255,.08)', bg: on ? 'rgba(240,169,59,.14)' : 'transparent', c: on ? '#f7dc9a' : '#aab0ba' };
      }),
      linked: { pressed: im.keepLinked ? 'true' : 'false', track: im.keepLinked ? '#b8621a' : '#0b0c0f', x: im.keepLinked ? '19px' : '3px' },
      toggleLinked: () => this.up((p: any) => ({ keepLinked: !p.keepLinked })),
      dragOver: (e: any) => {
        e.preventDefault();
        if (!im.drag) this.up({ drag: true });
      },
      dragLeave: () => this.up({ drag: false }),
      drop: (e: any) => {
        e.preventDefault();
        this.readFile(e.dataTransfer && e.dataTransfer.files[0]);
      },
      pickFile: (e: any) => {
        this.readFile(e.target.files && e.target.files[0]);
        e.target.value = '';
      },
      dropB: im.drag ? '#f0a93b' : 'rgba(201,160,80,.35)', dropBg: im.drag ? 'rgba(240,169,59,.08)' : 'rgba(0,0,0,.18)',
      hasFileMsg: !!im.fileMsg, fileMsg: im.fileMsg, fileMsgBg: im.fileOk ? 'rgba(126,240,184,.08)' : 'rgba(224,105,79,.1)', fileMsgC: im.fileOk ? '#9af5c8' : '#ffb3a3',
      modes: [['replace', 'Replace it'], ['merge', 'Add to it']].map(([k, l]) => {
        const off = k === 'merge' && !canMerge, on = (canMerge ? im.mode : 'replace') === k;
        return { label: l, ...seg(on), off, op: off ? 0.4 : 1, pick: () => this.up({ mode: k }) };
      }),
      modeHint: !curTotal ? 'Your deck is empty, so the list becomes the deck.' : im.fmt !== s.format ? `Your deck is ${FMT[s.format as Fmt].name}, so it will be replaced. Undo brings it back.` : im.mode === 'merge' ? `Cards are added on top of your ${curTotal}, up to the copy limit.` : `Your ${curTotal} cards are replaced. Undo brings them back.`,
      countTxt: has && a ? `${a.total} / ${F.target}` + (im.fmt === 'standard' && a.sideN ? ` · SB ${a.sideN}` : '') : '',
      empty: !has, hasRows: has,
      emptyTxt: im.src === 'link' ? 'Fetch a deck to see what will be imported.' : im.src === 'file' ? 'Drop a file to see what will be imported.' : 'Paste a list to see what will be imported. Each card is matched as you type.',
      checks, secs,
      needCmd: !!(a && a.needCmd), cands: a ? a.cands : [], cmd: im.cmd, cmdPh: a && a.cands.length ? 'Choose a legendary creature' : 'No legendary creatures in this list',
      setCmd: (e: any) => this.up({ cmd: e.target.value }),
      foot: fmtStep ? `${F.name}: ${F.rules[0].toLowerCase()}.` : footBits.length ? footBits.join(' · ') : 'Nothing to import yet.',
      secLabel: fmtStep ? 'Cancel' : 'Back',
      secondary: fmtStep ? () => (this.deckId || Object.keys(s.deck).length ? this.setState({ modal: null, imp: null }) : this.startEmpty()) : () => this.up({ step: 'format' }),
      hasAlt: fmtStep && !!im.isNew, altLabel: 'Start empty', alt: () => this.startEmpty(),
      primaryLabel: fmtStep ? (im.isNew ? 'Import a list' : 'Continue') : has && a ? (a.pendingN ? 'Checking names…' : `Import ${a.importN} cards`) : 'Import',
      primary: fmtStep ? () => this.up({ step: 'source' }) : () => this.doImport(),
      noPrimary: blocked, primaryOp: blocked ? 0.45 : 1,
    };
  }
  renderVals() {
    const s = this.state, deck = s.deck as Record<string, number>, F = FMT[s.format as Fmt], isCmd = s.format === 'commander';
    const entries = Object.entries(deck).map(([n, k]) => [KNOWN.get(n), k] as [DC, number]).filter(([c]) => c);
    const sideE = isCmd ? [] : Object.entries(s.side as Record<string, number>).map(([n, k]) => [KNOWN.get(n), k] as [DC, number]).filter(([c]) => c);
    const cmdC = isCmd && s.commander ? KNOWN.get(s.commander) ?? null : null;
    const mainN = entries.reduce((a, [, k]) => a + k, 0), sideN = sideE.reduce((a, [, k]) => a + k, 0);
    const total = mainN + (cmdC ? 1 : 0);
    const lands = entries.filter(([c]) => c.land).reduce((a, [, k]) => a + k, 0);
    const spells = mainN - lands;
    const cmp = (
      {
        mv: (a: DC, b: DC) => +a.land - +b.land || a.mv - b.mv || colorRank(a) - colorRank(b) || a.name.localeCompare(b.name),
        name: (a: DC, b: DC) => a.name.localeCompare(b.name),
        color: (a: DC, b: DC) => colorRank(a) - colorRank(b) || a.mv - b.mv || a.name.localeCompare(b.name),
        rarity: (a: DC, b: DC) => RORD[b.rarity] - RORD[a.rarity] || a.name.localeCompare(b.name),
      } as Record<string, (a: DC, b: DC) => number>
    )[s.sort];
    const res = (s.results as string[]).map((n) => KNOWN.get(n)!).filter(Boolean);

    const chips: { label: string; fn: () => void }[] = [];
    const CNm = CN;
    if (s.q.trim()) chips.push({ label: `“${s.q.trim()}”`, fn: () => this.setState({ q: '' }) });
    s.colors.forEach((c: string) => chips.push({ label: (s.mode === 'only' ? 'Only ' : '') + CNm[c], fn: () => this.setState((p: any) => ({ colors: p.colors.filter((x: string) => x !== c) })) }));
    s.mv.forEach((v: number) => chips.push({ label: `Mana ${v === 7 ? '7+' : v}`, fn: () => this.setState((p: any) => ({ mv: p.mv.filter((x: number) => x !== v) })) }));
    s.types.forEach((t: string) => chips.push({ label: t, fn: () => this.setState((p: any) => ({ types: p.types.filter((x: string) => x !== t) })) }));
    s.rar.forEach((r: string) => chips.push({ label: r[0].toUpperCase() + r.slice(1), fn: () => this.setState((p: any) => ({ rar: p.rar.filter((x: string) => x !== r) })) }));
    if (s.inDeckOnly) chips.push({ label: 'In my deck', fn: () => this.setState({ inDeckOnly: false }) });

    const counts = Array(8).fill(0);
    entries.forEach(([c, k]) => {
      if (!c.land) counts[Math.min(Math.floor(c.mv), 7)] += k;
    });
    const cmax = Math.max(1, ...counts);
    const pips: Record<string, number> = {};
    entries.forEach(([c, k]) => {
      if (!c.land) c.cost.forEach((x) => WUBRG.forEach((w) => x.includes(w) && (pips[w] = (pips[w] || 0) + k)));
    });
    const ptot = Object.values(pips).reduce((a, b) => a + b, 0);
    const TINT: Record<string, string> = { W: '255,236,180', U: '70,140,230', B: '140,100,170', R: '230,80,50', G: '70,170,100' };
    const top2 = WUBRG.filter((c) => pips[c]).sort((a, b) => pips[b] - pips[a]).slice(0, 2);
    const tint = top2.length ? top2.map((c, i) => `radial-gradient(900px 700px at ${i ? '85%' : '15%'} 100%,rgba(${TINT[c]},.09),rgba(${TINT[c]},0) 70%)`).join(',') : 'none';

    const off = cmdC ? entries.filter(([c]) => !c.ci.every((x) => cmdC.ci.includes(x))).map(([c]) => c.name) : [];
    const warnings: any[] = [];
    const W = (text: string, strong?: boolean) => warnings.push(strong ? { text, c: '#ffc98a', bg: 'rgba(240,169,59,.08)' } : { text, c: '#c8bca6', bg: 'rgba(255,255,255,.03)' });
    if (!s.ready) W('Loading the cards in this deck…');
    if (isCmd) {
      if (total < 100) W(`Add ${100 - total} more card${100 - total === 1 ? '' : 's'}. Commander decks have exactly 100.`, true);
      if (total > 100) W(`Remove ${total - 100} card${total - 100 === 1 ? '' : 's'}. Commander decks have exactly 100.`, true);
      if (!cmdC) W('Choose a commander: press ♛ next to a legendary creature in your deck.', true);
      const over = entries.filter(([c, k]) => !c.basic && k > 1).length;
      if (over) W(`${over} card${over === 1 ? ' has' : 's have'} more than one copy. Commander allows one of each.`, true);
      if (off.length) W(`${off.length} card${off.length === 1 ? ' is' : 's are'} outside ${s.commander.split(',')[0]}'s colors: ${off.slice(0, 3).join(', ')}${off.length > 3 ? '…' : '.'}`, true);
      if (total >= 50 && lands / total < 0.3) W(`${lands} lands is low. Most Commander decks play 35 to 38.`);
    } else {
      if (mainN < 60) W(`Add ${60 - mainN} more card${60 - mainN === 1 ? '' : 's'}. Decks need at least 60.`, true);
      if (sideN > 15) W(`Your sideboard has ${sideN} cards. The limit is 15.`, true);
      const over = entries.filter(([c, k]) => !c.basic && k > 4).length;
      if (over) W(`${over} card${over === 1 ? ' has' : 's have'} more than 4 copies.`, true);
      if (mainN >= 30 && lands / mainN < 0.33) W(`${lands} lands is low. Most 60-card decks play 22 to 26.`);
      if (mainN >= 30 && lands / mainN > 0.47) W(`${lands} lands is high. Most 60-card decks play 22 to 26.`);
    }
    const ok = isCmd ? !!cmdC && total === 100 && !off.length : mainN >= 60 && sideN <= 15;
    const statusTxt = isCmd ? (!cmdC ? 'No commander' : total < 100 ? `${100 - total} to go` : total > 100 ? `${total - 100} over` : 'Off-color cards') : mainN < 60 ? `${60 - mainN} to go` : 'Sideboard over 15';
    const rowOf = (c: DC, k: number, inSide: boolean) => {
      const hot = s.hover === c.name, full = this.atLimit(c), bad = off.includes(c.name) && !inSide;
      const x = inSide
        ? { hasX: true, xLabel: 'MB', xAria: `Move one ${c.name} to the main deck`, x: () => this.toMain(c) }
        : isCmd
          ? c.legend
            ? { hasX: true, xLabel: '♛', xAria: `Make ${c.name} your commander`, x: () => this.setCommander(c) }
            : { hasX: false }
          : { hasX: true, xLabel: 'SB', xAria: `Move one ${c.name} to the sideboard`, x: () => this.toSide(c) };
      return {
        name: c.name, n: k, cost: c.cost.map(PIP), costAria: c.cost.length ? 'Cost ' + c.cost.join(' ') : 'No cost',
        art: IMG(c.name, 'art_crop'),
        edge: hot ? 'inset 0 0 0 1px rgba(247,220,154,.55)' : bad ? 'inset 0 0 0 1px rgba(224,105,79,.55)' : 'none',
        costOp: hot ? 0 : 1, ctlOp: hot ? 1 : 0,
        noAdd: full, addOp: full ? 0.3 : 1,
        addAria: `Add one ${c.name}`, removeAria: `Remove one ${c.name}`,
        add: () => (inSide ? this.sideAdd(c) : this.add(c)), remove: () => (inSide ? this.sideRem(c) : this.remove(c)), ...x,
        enter: () => this.setState({ hover: c.name }), leave: () => this.setState((p: any) => (p.hover === c.name ? { hover: null } : null)),
      };
    };
    const placed = new Set<string>();
    const groups = GROUPS.map(([label, test]) => {
      const rows = entries.filter(([c]) => !placed.has(c.name) && test(c)).sort((a, b) => cmp(a[0], b[0]) || 0);
      rows.forEach(([c]) => placed.add(c.name));
      const n = rows.reduce((a, [, k]) => a + k, 0);
      return { label: label.toUpperCase(), n, aria: `${label}, ${n} cards`, rows: rows.map(([c, k]) => rowOf(c, k, false)) };
    }).filter((g) => g.n);
    if (sideN) groups.push({ label: 'SIDEBOARD', n: sideN, aria: `Sideboard, ${sideN} cards`, rows: sideE.sort((a, b) => cmp(a[0], b[0]) || 0).map(([c, k]) => rowOf(c, k, true)) });

    const modeHint = !s.colors.length ? 'Pick one or more colors.' : s.mode === 'any' ? `Cards with any of: ${s.colors.map((c: string) => CN[c]).join(', ')}.` : `Cards using only: ${s.colors.map((c: string) => CN[c]).join(', ')}.`;
    const anyColor = s.colors.length > 0;
    const EXP: Record<string, [string, string]> = { arena: ['MTG Arena', 'Arena format with Commander, Deck and Sideboard headers. Also works in Moxfield and Archidekt.'], mtgo: ['MTGO', 'Main deck, a blank line, then the sideboard (or commander). Works in Magic Online and most sites.'], plain: ['Plain text', 'Readable list with “4x” quantities and section comments, for sharing in chat.'] };

    return {
      live: s.live, name: s.name, tint,
      setName: (e: any) => this.setState({ name: e.target.value, saved: false, dirty: true }),
      total, target: F.target, format: s.format, summary: `${spells} spells · ${lands} lands`,
      status: ok ? { text: 'Ready to play', c: '#9af5c8', bg: 'rgba(22,53,42,.7)' } : { text: statusTxt, c: '#ffc98a', bg: 'rgba(58,36,14,.7)' },
      undo: () => this.undo(), noUndo: !s.hist.length, undoOp: s.hist.length ? 1 : 0.45,
      saveLabel: s.saving ? 'SAVING…' : s.saved ? 'SAVED' : s.dirty ? 'SAVE DECK' : this.deckId && !this.deckId.startsWith('starter-') ? 'SAVED' : 'SAVE DECK',
      save: () => this.save(),
      searchRef: this.searchRef, q: s.q,
      setQ: (e: any) => this.setState({ q: e.target.value }),
      searchKey: (e: any) => {
        if (e.key === 'Escape') {
          this.setState({ q: '' });
          e.target.blur();
        }
      },
      hasFilters: chips.length > 0,
      clearFilters: () => this.setState({ q: '', colors: [], mv: [], types: [], rar: [], inDeckOnly: false, live: 'Filters cleared.' }),
      colorOpts: [...WUBRG, 'C'].map((c) => {
        const on = s.colors.includes(c);
        return { label: CN[c], pip: PIP(c), pressed: on ? 'true' : 'false', op: on ? 1 : anyColor ? 0.3 : 0.8, tf: on ? 'translateY(-2px)' : 'none', ring: on ? `0 0 0 2px #0e0d0b,0 0 0 3px #f7dc9a,0 0 16px 2px ${CGLOW[c]}` : 'none', pick: () => this.setState((p: any) => ({ colors: tog(p.colors, c) })) };
      }),
      modeOpts: [['any', 'Any', 'Show cards that include at least one selected color'], ['only', 'Only', 'Hide cards that need a color you did not select']].map(([k, l, h]) => ({ label: l, hint: h, pressed: s.mode === k ? 'true' : 'false', bg: s.mode === k ? '#2a2c33' : 'transparent', c: s.mode === k ? '#f4efe4' : '#7d8491', pick: () => this.setState({ mode: k }) })),
      modeHint,
      mvOpts: [0, 1, 2, 3, 4, 5, 6, 7].map((v) => {
        const on = s.mv.includes(v);
        return { label: v === 7 ? '7+' : String(v), fs: v === 7 ? '11px' : '13px', bg: on ? 'radial-gradient(circle at 40% 30%,#5a5f68,#2b2e34)' : 'radial-gradient(circle at 40% 30%,#34373e,#1a1c20)', c: on ? '#fff' : '#b9bec6', aria: `Mana value ${v === 7 ? '7 or more' : v}`, pressed: on ? 'true' : 'false', ring: on ? '0 0 0 2px #111317,0 0 0 3px rgba(240,169,59,.8)' : '0 2px 4px rgba(0,0,0,.6)', pick: () => this.setState((p: any) => ({ mv: tog(p.mv, v) })) };
      }),
      typeOpts: TYPES.map((t) => ({ label: t, ...tag(s.types.includes(t)), pick: () => this.setState((p: any) => ({ types: tog(p.types, t) })) })),
      rarOpts: Object.keys(RC).map((r) => {
        const on = s.rar.includes(r);
        return { label: r[0].toUpperCase() + r.slice(1), gem: RGEM[r], gemGlow: on ? `0 0 8px ${RC[r]}` : 'none', ...tag(on), pick: () => this.setState((p: any) => ({ rar: tog(p.rar, r) })) };
      }),
      inDeck: { pressed: s.inDeckOnly ? 'true' : 'false', track: s.inDeckOnly ? '#b8621a' : '#0b0c0f', x: s.inDeckOnly ? '19px' : '3px' },
      toggleInDeck: () => this.setState((p: any) => ({ inDeckOnly: !p.inDeckOnly })),
      resultTxt: s.loading ? 'Searching…' : `${s.total.toLocaleString('en-US')} card${s.total === 1 ? '' : 's'}`,
      chips: chips.map((c) => ({ label: c.label, aria: `Remove filter ${c.label}`, remove: c.fn })),
      sort: s.sort, setSort: (e: any) => this.setState({ sort: e.target.value }),
      hasResults: res.length > 0, noResults: !s.loading && res.length === 0, tileMin: '196px',
      tileLeave: this.tileLeave, zClose: this.zClose, onScroll: this.onScroll, moreTxt: s.more ? 'Loading more…' : res.length < s.total ? '' : '',
      results: res.map((c) => {
        const n = deck[c.name] || 0, isC = s.commander === c.name && s.format === 'commander', full = isC || this.atLimit(c), hot = s.tile === c.name;
        return {
          img: IMG(c.name), n, inDeck: n > 0 || isC, hot,
          badge: isC ? '♛' : '×' + n, badgeSize: n > 9 ? '12px' : '14px',
          lift: hot ? 'translateY(-5px)' : 'none',
          ring: n || isC ? '0 0 0 2px #e3a246,0 0 18px rgba(240,169,59,.25),0 16px 28px rgba(0,0,0,.65)' : '0 0 0 1px rgba(0,0,0,.7),0 16px 28px rgba(0,0,0,.6)',
          cursor: full ? 'not-allowed' : 'pointer',
          aria: isC ? `${c.name} is your commander` : full ? `${c.name}. ${n} in deck, maximum reached` : `Add ${c.name}. ${n} in deck`,
          noAdd: full, addOp: full ? 0.35 : 1, noRemove: !n, remOp: n ? 1 : 0.35,
          addAria: `Add one ${c.name}`, removeAria: `Remove one ${c.name}`,
          add: () => this.add(c), remove: () => this.remove(c), enter: (e: any) => this.tileEnter(e, c.name),
        };
      }),
      curve: counts.map((n, i) => ({ n: n || '', nc: n ? '#f7dc9a' : '#4d525b', label: i === 7 ? '7+' : String(i), lc: n ? '#c3c8d0' : '#4d525b', h: `calc(${Math.round((n / cmax) * 100)}% - 4px)` })),
      curveAria: 'Mana curve: ' + counts.map((n, i) => `${n} at ${i === 7 ? '7 or more' : i}`).join(', '),
      hasColors: ptot > 0,
      colorMix: WUBRG.filter((c) => pips[c]).map((c) => ({ pip: PIP(c), name: CN[c], flex: pips[c], bar: CBAR[c], glow: CGLOW[c], pct: Math.round((pips[c] / ptot) * 100) + '%', title: `${CN[c]}: ${pips[c]} mana symbols` })),
      warnings,
      groups, deckEmpty: total === 0 && s.ready, hasCards: total > 0,
      clearDeck: () => this.changeAll(() => ({ deck: {}, side: {}, commander: null }), 'Deck cleared. Press Undo to restore.'),
      isCmd, hasCommander: !!cmdC, noCommander: isCmd && !cmdC,
      cmd: cmdC ? { name: cmdC.name, art: IMG(cmdC.name, 'art_crop'), pips: (cmdC.ci.length ? cmdC.ci : ['C']).map(PIP), remove: () => this.unCommander(), enter: () => this.setState({ hover: cmdC.name }), leave: () => this.setState((p: any) => (p.hover === cmdC.name ? { hover: null } : null)) } : {},
      setFormat: (e: any) => this.setFormat(e.target.value),
      rulesTxt: isCmd ? 'Singleton · basic lands unlimited · ♛ sets the commander' : 'Max 4 copies · basic lands unlimited · SB moves to sideboard',
      hasLink: !!s.link, linkSite: s.link ? s.link.site : '',
      resync: () => {
        if (!s.link) return;
        this.setState({ modal: 'import', imp: this.newImp(s.format, { step: 'source', src: 'link', url: s.link.url, site: s.link.site, text: s.link.text, urlState: 'loading', urlMsg: `Pulling the latest list from ${s.link.site}…`, fromLink: true, mode: 'replace' }) }, () => this.fetchLink());
      },
      unlink: () => this.setState({ link: null, live: 'Deck unlinked.', dirty: true }),
      hasZoom: !!s.zoom, zoom: s.zoom ? { ...s.zoom, img: IMG(s.zoom.name, 'large') } : {},
      openImport: () => this.setState({ modal: 'import', imp: this.newImp(s.format) }),
      openExport: () => this.setState({ modal: 'export', copied: false }),
      deckEmptyB: total === 0, exportOp: total ? 1 : 0.45,
      closeModal: () => this.setState({ modal: null, imp: null }), stop: (e: any) => e.stopPropagation(), taRef: this.taRef,
      hasExport: s.modal === 'export', hasImport: s.modal === 'import' && !!s.imp,
      exp: {
        kinds: Object.entries(EXP).map(([k, [l]]) => ({ label: l, ...seg(s.expKind === k), pick: () => this.setState({ expKind: k, copied: false }) })),
        hint: EXP[s.expKind][1], text: s.modal === 'export' ? this.exportText(s.expKind) : '',
        foot: `${total} cards` + (sideN ? ` + ${sideN} sideboard` : '') + ` · ${F.name}`,
        copy: () => this.copyExport(), copyLabel: s.copied ? 'Copied' : 'Copy to clipboard', download: () => this.download(),
      },
      imp: this.impVals(),
      hasPreview: !!s.hover, preview: s.hover ? IMG(s.hover) : '',
      switcher: (
        <DeckSwitcher
          open={s.switcher}
          toggle={() => this.setState((p: any) => ({ switcher: !p.switcher }))}
          decks={this.props.decks}
          current={this.deckId}
          dirty={s.dirty}
          pick={(id) => this.openDeck(id)}
          remove={this.deckId && !this.deckId.startsWith('starter-') ? () => this.deleteDeck() : null}
        />
      ),
    };
  }
  render() {
    return (
      <>
        <style>{DeckBuilderView_CSS}</style>
        <DeckBuilderView v={this.renderVals()} />
      </>
    );
  }
}

/** Header popover: open another deck, start a new one, or delete this one. */
function DeckSwitcher({ open, toggle, decks, current, dirty, pick, remove }: { open: boolean; toggle: () => void; decks: DeckSummary[]; current: string | null; dirty: boolean; pick: (id: string | null) => void; remove: (() => void) | null }) {
  const [confirm, setConfirm] = React.useState(false);
  return (
    <div style={css('position:relative')}>
      <button onClick={toggle} aria-expanded={open} style={css('display:flex;align-items:center;gap:8px;height:36px;padding:0 12px;border:0;border-radius:6px;background:rgba(255,255,255,.05);cursor:pointer;font-size:13px;font-weight:600;color:#c3c8d0')}>
        My decks <span aria-hidden="true" style={css('font-size:10px;color:#c9a050')}>▼</span>
      </button>
      {open && (
        <div role="menu" style={css('position:absolute;top:44px;left:0;z-index:60;width:320px;max-height:60vh;overflow-y:auto;padding:8px;border-radius:10px;background:linear-gradient(180deg,#1d1f25,#121418);box-shadow:0 24px 60px rgba(0,0,0,.75),0 0 0 1px rgba(201,160,80,.25)')}>
          <button onClick={() => pick(null)} style={css('display:flex;align-items:center;gap:10px;width:100%;padding:10px;border:0;border-radius:6px;background:rgba(240,169,59,.1);cursor:pointer;font-family:Cinzel,serif;font-size:13px;font-weight:700;letter-spacing:.06em;color:#f7dc9a;text-align:left')}>
            + New deck
          </button>
          {dirty && <div style={css('padding:8px 10px 2px;font-size:12px;color:#c8bca6')}>Unsaved changes are saved before switching.</div>}
          <div style={css('display:flex;flex-direction:column;gap:2px;margin-top:6px')}>
            {decks.map((d) => (
              <button key={d.id} onClick={() => pick(d.id)} aria-current={d.id === current} style={css(`display:flex;align-items:center;gap:10px;width:100%;padding:6px 8px;border:0;border-radius:6px;cursor:pointer;text-align:left;background:${d.id === current ? 'rgba(240,169,59,.12)' : 'transparent'}`)}>
                <span style={css(`flex:none;width:44px;height:30px;border-radius:4px;background:#1a1f27 url('${d.faceArt ?? ''}') center/cover`)} />
                <span style={css('display:flex;flex-direction:column;min-width:0;flex:1')}>
                  <span style={css('font-size:13px;font-weight:700;color:#e7ebf1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{d.name}</span>
                  <span style={css(`font-size:11px;color:${d.valid ? '#8a909b' : '#f7c26a'}`)}>
                    {d.format === 'commander' ? 'Commander' : 'Standard'} · {d.cards} cards{d.id.startsWith('starter-') ? ' · starter' : ''}
                  </span>
                </span>
              </button>
            ))}
          </div>
          {remove && (
            <button
              onClick={() => (confirm ? remove() : setConfirm(true))}
              style={css(`width:100%;margin-top:8px;padding:9px;border:0;border-radius:6px;cursor:pointer;font-size:12px;font-weight:700;background:${confirm ? 'rgba(224,105,79,.25)' : 'rgba(255,255,255,.04)'};color:${confirm ? '#ffb3a3' : '#8a909b'}`)}
            >
              {confirm ? 'Click again to delete this deck' : 'Delete this deck'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
void getState;
