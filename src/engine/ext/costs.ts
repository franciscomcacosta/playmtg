// Plugin: additional costs, cost changes and optional casting modes.
import { EXT } from '../ext';
import { sourcesWith } from '../rules';
import { cardFilter, looseFilter, parseCard, singular } from '../oracle';
import { parseCost } from '../mana';
import type { GameState, PlayerIdx } from '../types';

const N: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };
const num = (w: string) => (/^\d+$/.test(w) ? +w : N[w] ?? 1);
const front = (s: GameState, iid: string) => {
  const d = s.defs[s.cards[iid].defId];
  return parseCard(d, d.faces && ['transform', 'modal_dfc'].includes(d.layout) ? d.faces[0] : undefined) as any;
};
/** Remove up to n generic mana from a cost string. */
export function reduceGeneric(cost: string, n: number): string {
  if (n <= 0 || !cost) return cost;
  const pc = parseCost(cost);
  const g = Math.max(0, pc.generic - n);
  const rest = cost.replace(/\{\d+\}/g, '');
  return (g ? `{${g}}` : '') + rest;
}
export function addGeneric(cost: string, n: number): string {
  if (n <= 0) return cost;
  const pc = parseCost(cost || '');
  return `{${pc.generic + n}}` + (cost || '').replace(/\{\d+\}/g, '');
}

// ------------------------------------------------------------------------------------------
// Additional costs: "as an additional cost to cast ~, sacrifice a creature / discard a card / …"
// ------------------------------------------------------------------------------------------
interface AddCost { reveal?: { filter: any; n: number }; sac?: { filter: any; n: number }; discard?: { filter?: any; n: number }; exileGy?: { filter: any; n: number }; life?: number; tap?: { filter: any; n: number }; text: string }
const OR_IDS = ['yes', 'no', 'o2'];
const orIdx = (v: any) => Math.max(0, OR_IDS.indexOf(v));
export function parseAddCost(text: string): AddCost | null {
  const out: AddCost = { text };
  for (const part of text.split(/,? and |, /)) {
    let m: RegExpMatchArray | null;
    if ((m = part.match(/^sacrifice (a|an|one|two|three|x|\d+) (.+)$/))) {
      const f = cardFilter(m[2].replace(/s$/, '')) ?? looseFilter(m[2]);
      if (!f) return null;
      out.sac = { filter: { ...f, zone: 'battlefield', controller: 'you' }, n: m[1] === 'x' ? -1 : num(m[1]) };
    } else if ((m = part.match(/^discard (a|an|one|two|three|x|\d+)(?: (.+?))? cards?$/))) {
      const f = m[2] ? looseFilter(m[2]) ?? looseFilter(`${m[2]} card`) : null;
      if (m[2] && !f) return null;
      out.discard = { filter: f ? { ...f, zone: 'hand' } : undefined, n: m[1] === 'x' ? -1 : num(m[1]) }; // -1: X, chosen as you cast
    } else if ((m = part.match(/^exile (a|an|one|two|three|four|five|six|x|\d+) cards? from your graveyard$/))) {
      out.exileGy = { filter: { zone: 'graveyard', owner: 'you', types: ['card'] }, n: m[1] === 'x' ? -1 : num(m[1]) || ({ four: 4, five: 5, six: 6 } as any)[m[1]] };
    } else if ((m = part.match(/^exile (a|an|one|two|three|x|\d+) (.+?) cards? from your graveyard$/))) {
      const f = looseFilter(m[2]);
      if (!f) return null;
      out.exileGy = { filter: { ...f, zone: 'graveyard', owner: 'you' }, n: m[1] === 'x' ? -1 : num(m[1]) };
    } else if ((m = part.match(/^reveal (?:a|an) (.+?) card from your hand$/))) {
      const f = looseFilter(m[1]);
      if (!f) return null;
      out.reveal = { filter: { ...f, zone: 'hand' }, n: 1 };
    } else if ((m = part.match(/^pay (\d+) life$/))) out.life = +m[1];
    else if (part === 'pay x life') (out as any).lifeX = true;
    else if ((m = part.match(/^(exile|return) (a|an|one|two) (.+?) you control(?: to its owner's hand)?$/)) && (m[1] === 'exile' || /to its owner's hand$/.test(part))) {
      const f = cardFilter(m[3]) ?? looseFilter(m[3]);
      if (!f) return null;
      (out as any)[m[1] === 'exile' ? 'exileBf' : 'bounce'] = { filter: { ...f, zone: 'battlefield', controller: 'you' }, n: num(m[2]) };
    } else if ((m = part.match(/^put a (-1\/-1|\+1\/\+1) counter on (a|an) (.+?) you control$/))) {
      const f = cardFilter(m[3]) ?? looseFilter(m[3]);
      if (!f) return null;
      (out as any).counterOn = { filter: { ...f, zone: 'battlefield', controller: 'you' }, n: 1, counter: m[1] };
    } else if ((m = part.match(/^behold (a|an|one|two|three) (.+)$/))) {
      // Lorwyn Eclipsed: choose a permanent you control or reveal a card from your hand with that quality
      const f: any = looseFilter(m[2]) ?? looseFilter(singular(m[2]));
      if (!f) return null;
      const g = { ...f }; delete g.zone;
      (out as any).behold = { filter: g, n: num(m[1]) };
    } else if (part === 'exile it' && (out as any).behold) (out as any).behold.exile = true;
    else if ((m = part.match(/^blight (\d+)$/))) (out as any).blight = +m[1];
    else if (part === 'discard a card at random') (out as any).discardRandom = 1;
    else if ((m = part.match(/^tap (a|an|one|two|three|four|five|\d+) untapped (.+?) you control$/))) {
      const f = looseFilter(m[2]) ?? looseFilter(m[2].replace(/s$/, ''));
      if (!f) return null;
      out.tap = { filter: { ...f, zone: 'battlefield', controller: 'you', untapped: true }, n: num(m[1]) || ({ four: 4, five: 5 } as any)[m[1]] };
    } else return null;
  }
  return out;
}
EXT.lines.push((line, pc) => {
  const m = line.match(/^as an additional cost to cast (?:~|this spell), (.+)$/);
  if (!m) return false;
  const a = parseAddCost(m[1]);
  if (a) { pc.addCost = a; return true; }
  // "sacrifice a creature or pay {3}{B}" / "discard a card or pay {3}" / "pay {2} or sacrifice an artifact or creature"
  const three = m[1].match(/^([a-z][^,]+), ([a-z][^,]+),? or ([a-z][^,]+)$/);
  if (three) {
    const opt3 = (x: string) => { const pm = x.match(/^pay ((?:\{[^}]+\})+)$/); return pm ? { mana: pm[1].toUpperCase(), text: x } : (() => { const c = parseAddCost(x); return c ? { cost: c, text: x } : null; })(); };
    const os = [three[1], three[2], three[3]].map(opt3);
    if (os.every(Boolean)) { pc.addCostOr = os; return true; }
  }
  const parts = m[1].match(/^(.+?) or (pay (?:\{[^}]+\})+|pay \d+ life|sacrifice .+|discard .+)$/) ?? m[1].match(/^(pay (?:\{[^}]+\})+) or (.+)$/);
  if (!parts) return false;
  const opt = (x: string) => { const pm = x.match(/^pay ((?:\{[^}]+\})+)$/); return pm ? { mana: pm[1].toUpperCase(), text: x } : (() => { const c = parseAddCost(x); return c ? { cost: c, text: x } : null; })(); };
  const o1 = opt(parts[1]), o2 = opt(parts[2]);
  if (!o1 || !o2) return false;
  pc.addCostOr = [o1, o2];
  return true;
});
EXT.hooks.castCosts.push((s, pc, api) => {
  if (pc.kind !== 'spell' || pc.addChoice !== undefined) return false;
  const opts = (front(s, pc.iid) as any).addCostOr as any[] | undefined;
  if (!opts) return false;
  if (pc.extOrPick === undefined) {
    const ok = opts.map((o) => !o.cost || !lacks(s, pc.player, pc.iid, o.cost, api));
    const able = ok.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
    if (able.length === 1) pc.extOrPick = OR_IDS[able[0]];
  }
  if (pc.extOrPick === undefined) {
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: pc.player, kind: 'yesno', title: `${pc.label}: additional cost`, options: opts.map((o, i) => ({ id: OR_IDS[i], label: o.text })), canCancel: true, data: { ctx: 'cast', cost: 'extOrPick' } });
    return true;
  }
  const o = opts[orIdx(pc.extOrPick)];
  if (o.mana && !pc.orManaAdded) { pc.orManaAdded = true; pc.manaCost = (pc.manaCost ?? '') + o.mana; }
  return false;
});
// "Flashback—{1}{W}, Pay 3 life." / "Flashback—Sacrifice a creature." (non-mana parts are paid like additional costs)
EXT.lines.push((line, pc) => {
  const m = line.match(/^flashback—((?:\{[^}]+\})*)(?:,\s*)?(.*)$/);
  if (!m || (!m[1] && !m[2]) || /\bx\b/.test(m[2])) return false;
  const extra = m[2] ? parseAddCost(m[2]) : null;
  if (m[2] && !extra) return false;
  pc.flashback = (m[1] || '{0}').toUpperCase();
  if (extra) pc.flashbackCost = extra;
  return true;
});
/** Every additional cost this cast must pay: the card's own, plus flashback's when cast that way. */
function costFor(s: GameState, iid: string, alt: string | undefined, flashback?: boolean, orPick?: any): AddCost | undefined {
  const f = front(s, iid);
  if ((f as any).addCostOr && orPick !== undefined) {
    const o = (f as any).addCostOr[orIdx(orPick)];
    return o.cost;
  }
  const parts = [f.addCost as AddCost | undefined, (alt === 'flashback' || flashback) ? (f.flashbackCost as AddCost | undefined) : undefined, alt && /selfFrom/.test(alt) ? ((f as any).selfFromCost as AddCost | undefined) : undefined].filter(Boolean) as AddCost[];
  if (parts.length < 2) return parts[0];
  const [a, b] = parts;
  const sum = (x?: { n: number; filter?: any }, y?: { n: number; filter?: any }) => (x && y ? { ...x, n: x.n + y.n } : x ?? y);
  return { text: `${a.text}, ${b.text}`, sac: sum(a.sac, b.sac) as any, discard: sum(a.discard, b.discard) as any, exileGy: sum(a.exileGy, b.exileGy) as any, tap: sum(a.tap, b.tap) as any, life: (a.life ?? 0) + (b.life ?? 0) || undefined };
}
const pools = (s: GameState, p: PlayerIdx, iid: string, a: AddCost, api: any) => ({
  reveal: a.reveal ? s.players[p].hand.filter((h) => h !== iid && api.matchesFilter(s, h, a.reveal!.filter, p, iid)) : [],
  sac: a.sac ? s.battlefield.filter((b) => api.matchesFilter(s, b, a.sac!.filter, p, iid)) : [],
  discard: a.discard ? s.players[p].hand.filter((h) => h !== iid && (!a.discard!.filter || api.matchesFilter(s, h, a.discard!.filter, p, iid))) : [],
  exileGy: a.exileGy ? s.players[p].graveyard.filter((g) => g !== iid && api.matchesFilter(s, g, a.exileGy!.filter, p, iid)) : [],
  tap: a.tap ? s.battlefield.filter((b) => api.matchesFilter(s, b, a.tap!.filter, p, iid)) : [],
  exileBf: (a as any).exileBf ? s.battlefield.filter((b) => api.matchesFilter(s, b, (a as any).exileBf.filter, p, iid)) : [],
  bounce: (a as any).bounce ? s.battlefield.filter((b) => api.matchesFilter(s, b, (a as any).bounce.filter, p, iid)) : [],
  counterOn: (a as any).counterOn ? s.battlefield.filter((b) => api.matchesFilter(s, b, (a as any).counterOn.filter, p, iid)) : [],
  behold: (a as any).behold ? [...s.players[p].hand.filter((h) => h !== iid && api.matchesFilter(s, h, { ...(a as any).behold.filter, zone: 'hand' }, p, iid)), ...s.battlefield.filter((b) => s.cards[b].controller === p && api.matchesFilter(s, b, { ...(a as any).behold.filter, zone: 'battlefield' }, p, iid))] : [],
  blight: (a as any).blight ? s.battlefield.filter((b) => s.cards[b].controller === p && api.chars(s, b).types.has('creature')) : [],
});
EXT.hooks.castBlock.push((s, p, iid, alt, api) => {
  const opts = (front(s, iid) as any).addCostOr as any[] | undefined;
  if (opts && opts.every((o) => o.cost && lacks(s, p, iid, o.cost, api))) return `Additional cost: ${opts.map((o) => o.text).join(' or ')}`;
  const a = costFor(s, iid, alt);
  if (!a) return null;
  return lacks(s, p, iid, a, api);
});
function lacks(s: GameState, p: PlayerIdx, iid: string, a: AddCost, api: any): string | null {
  const pl = pools(s, p, iid, a, api);
  if (a.reveal && pl.reveal.length < a.reveal.n) return `Additional cost: ${a.text}`;
  if (a.sac && pl.sac.length < Math.max(0, a.sac.n)) return `Additional cost: ${a.text}`;
  if (a.discard && pl.discard.length < a.discard.n) return `Additional cost: ${a.text}`;
  if (a.exileGy && pl.exileGy.length < Math.max(0, a.exileGy.n)) return `Additional cost: ${a.text}`;
  if (a.tap && pl.tap.length < a.tap.n) return `Additional cost: ${a.text}`;
  if (a.life && s.players[p].life < a.life) return `Additional cost: ${a.text}`;
  for (const k of ['exileBf', 'bounce', 'counterOn', 'behold'] as const) if ((a as any)[k] && (pl as any)[k].length < (a as any)[k].n) return `Additional cost: ${a.text}`;
  if ((a as any).blight && !pl.blight.length) return `Additional cost: ${a.text}`;
  if ((a as any).discardRandom && s.players[p].hand.filter((h) => h !== iid).length < 1) return `Additional cost: ${a.text}`;
  return null;
}
EXT.hooks.castCosts.push((s, pc, api) => {
  if (pc.kind !== 'spell') return false;
  const a = costFor(s, pc.iid, pc.alt, pc.flashback, pc.extOrPick);
  if (!a) return false;
  const pl = pools(s, pc.player, pc.iid, a, api);
  const ask = (key: string, list: string[], n: number, verb: string) => {
    if (pc[key]) return false;
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: pc.player, kind: 'chooseCards', title: `${pc.label}: ${verb} (additional cost)`, cards: list, min: n, max: n, canCancel: true, data: { ctx: 'cast', cost: key } });
    return true;
  };
  if (a.reveal && ask('extReveal', pl.reveal, a.reveal.n, 'reveal a card from your hand')) return true;
  const nSac = a.sac ? (a.sac.n < 0 ? pc.x ?? 0 : a.sac.n) : 0;
  if (a.sac && nSac > pl.sac.length) return false;
  if (a.sac && nSac > 0 && ask('extSac', pl.sac, nSac, `sacrifice ${nSac}`)) return true;
  const nDiscard = a.discard ? (a.discard.n < 0 ? Math.min(pc.x ?? 0, pl.discard.length) : a.discard.n) : 0;
  if (a.discard && nDiscard > 0 && ask('extDiscard', pl.discard, nDiscard, `discard ${nDiscard}`)) return true;
  const nEx = a.exileGy ? (a.exileGy.n < 0 ? pc.x ?? 0 : a.exileGy.n) : 0;
  if (a.exileGy && nEx > 0 && nEx <= pl.exileGy.length && ask('extExileGy', pl.exileGy, nEx, `exile ${nEx} from your graveyard`)) return true;
  if (a.tap && ask('extTap', pl.tap, a.tap.n, `tap ${a.tap.n}`)) return true;
  const ax = a as any;
  if (ax.exileBf && ask('extExileBf', pl.exileBf, ax.exileBf.n, `exile ${ax.exileBf.n} you control`)) return true;
  if (ax.bounce && ask('extBounce', pl.bounce, ax.bounce.n, `return ${ax.bounce.n} to hand`)) return true;
  if (ax.counterOn && ask('extCounterOn', pl.counterOn, 1, `put a ${ax.counterOn.counter} counter on`)) return true;
  if (ax.behold && ask('extBehold', pl.behold, ax.behold.n, `behold ${ax.behold.n}`)) return true;
  if (ax.blight && ask('extBlight', pl.blight, 1, `blight ${ax.blight} (put ${ax.blight} -1/-1 counters on a creature you control)`)) return true;
  return false;
});
EXT.hooks.castPay.push((s, pc, api) => {
  if (pc.kind !== 'spell') return;
  const a = costFor(s, pc.iid, pc.alt, pc.flashback, pc.extOrPick);
  if (!a) return;
  if (a.life) api.loseLife(s, pc.player, a.life);
  if ((a as any).lifeX && pc.x) api.loseLife(s, pc.player, pc.x);
  for (const x of pc.extReveal ?? []) api.log(s, `${api.pname(s, pc.player)} reveals ${api.nm(s, x)}.`, pc.player);
  (s as any).lastRevealed = (pc.extReveal ?? []).slice();
  for (const x of pc.extSac ?? []) api.moveCard(s, x, 'graveyard', { cause: 'sacrifice' });
  for (const x of pc.extDiscard ?? []) api.moveCard(s, x, 'graveyard', { cause: 'discard' });
  for (const x of pc.extExileGy ?? []) api.moveCard(s, x, 'exile');
  for (const x of pc.extTap ?? []) s.cards[x].tapped = true;
  for (const x of pc.extExileBf ?? []) if (s.cards[x]?.zone === 'battlefield') api.moveCard(s, x, 'exile');
  for (const x of pc.extBounce ?? []) if (s.cards[x]?.zone === 'battlefield') api.moveCard(s, x, 'hand');
  for (const x of pc.extCounterOn ?? []) if (s.cards[x]?.zone === 'battlefield') api.addCounters(s, x, (a as any).counterOn.counter, 1);
  for (const x of pc.extBehold ?? []) {
    api.log(s, `${api.pname(s, pc.player)} beholds ${api.nm(s, x)}.`, pc.player);
    if ((a as any).behold.exile) { api.moveCard(s, x, 'exile'); const sc = s.cards[pc.iid] as any; sc.beheldX = [...(sc.beheldX ?? []), x]; }
  }
  for (const x of pc.extBlight ?? []) if (s.cards[x]?.zone === 'battlefield') api.addCounters(s, x, '-1/-1', (a as any).blight);
  if ((a as any).discardRandom) {
    const h = s.players[pc.player].hand.filter((x) => x !== pc.iid);
    if (h.length) { const pick = h[Math.floor(api.rand(s) * h.length)]; api.log(s, `${api.pname(s, pc.player)} discards ${api.nm(s, pick)} at random.`, pc.player); api.moveCard(s, pick, 'graveyard', { cause: 'discard' }); }
  }
  (s as any).lastSacrificed = (pc.extSac ?? []).slice();
  // remembered on the spell itself, for "the sacrificed creature's power" when it resolves
  if (s.cards[pc.iid]) (s.cards[pc.iid] as any).sacForCost = (pc.extSac ?? []).slice();
});

// ------------------------------------------------------------------------------------------
// Cost reductions / increases
// ------------------------------------------------------------------------------------------
EXT.lines.push((line, pc) => {
  let m: RegExpMatchArray | null;
  if ((m = line.match(/^affinity for (.+)$/))) {
    const f = cardFilter(m[1].replace(/s$/, '')) ?? looseFilter(m[1].replace(/s$/, ''));
    if (!f) return false;
    pc.costCount = { filter: { ...f, zone: 'battlefield', controller: 'you' }, per: 1 };
    return true;
  }
  if ((m = line.match(/^(?:this spell|~) costs \{(\d+)\} less to cast for each (.+?)(?: you control)?$/))) {
    const f = looseFilter(m[2].replace(/s$/, ''));
    if (!f) return false;
    pc.costCount = { filter: { ...f, zone: f.zone ?? 'battlefield', controller: /you control/.test(line) || !f.zone ? 'you' : f.controller }, per: +m[1] };
    return true;
  }
  // "Instant and sorcery spells you cast cost {1} less to cast." / "Creature spells your opponents cast cost {1} more to cast."
  if ((m = line.match(/^(?:(.+?) )?spells(?: (you|your opponents|each opponent|players) cast)? cost ((?:\{[^}]+\})+) (less|more) to cast$/))) {
    if (m[1] && /\b(?:with|that|of|from)\b/.test(m[1])) return false;
    const kinds = (m[1] ?? 'all').replace(/^noncreature$/, 'noncreature').split(/,? and |, | or /).map((x) => x.trim());
    const g = m[3].match(/^\{(\d+)\}$/);
    if (!g && (m[4] === 'less' || !/^(?:\{[wubrg]\})+$/.test(m[3]))) return false;
    ((pc.costStatics ??= []) as any[]).push({ kinds, who: m[2] ?? 'players', n: g ? +g[1] : 0, pips: g ? undefined : m[3].toUpperCase(), dir: m[4] });
    return true;
  }
  return false;
});
const matchesKinds = (s: GameState, iid: string, kinds: string[]) => {
  const tl = (s.defs[s.cards[iid].defId].faces?.[0]?.typeLine ?? s.defs[s.cards[iid].defId].typeLine).toLowerCase();
  const COL: Record<string, string> = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };
  const cols: string[] = (s.defs[s.cards[iid].defId] as any).colors ?? [];
  return kinds.some((k) => (k in COL ? cols.includes(COL[k]) : k === 'multicolored' ? cols.length > 1 : k === 'colorless' ? !cols.length : k === 'noncreature' ? !/creature/.test(tl) : k === '' || k === 'all' ? true : new RegExp(`\\b${k.replace(/s$/, '')}`).test(tl)));
};
EXT.hooks.costMod.push((s, p, iid, cost, _alt, api) => {
  let out = cost;
  const own = front(s, iid).costCount;
  if (own) {
    const n = s.battlefield.filter((b) => api.matchesFilter(s, b, own.filter, p, iid)).length * own.per;
    out = reduceGeneric(out, n);
  }
  for (const b of sourcesWith(s, 'costStatics')) {
    for (const st of (api.chars(s, b).pc.costStatics ?? []) as any[]) {
      const ctrl = s.cards[b].controller;
      const applies = st.who === 'you' ? ctrl === p : st.who === 'players' ? true : ctrl !== p;
      if (!applies || !matchesKinds(s, iid, st.kinds)) continue;
      out = st.pips ? (out || '') + st.pips : st.dir === 'less' ? reduceGeneric(out, st.n) : addGeneric(out, st.n);
    }
  }
  return out;
});

// ------------------------------------------------------------------------------------------
// Optional casting modes: buyback, evoke, dash
// ------------------------------------------------------------------------------------------
EXT.lines.push((line, pc) => {
  const m = line.match(/^(buyback|evoke|dash) (\{[^}]+\}(?:\{[^}]+\})*)$/);
  if (!m) return false;
  pc[m[1]] = m[2].toUpperCase();
  return true;
});
EXT.hooks.castOptions.push((s, p, iid, api) => {
  const c = s.cards[iid];
  if (!c || c.zone !== 'hand' || c.owner !== p) return [];
  const f = front(s, iid);
  const out: any[] = [];
  const name = s.defs[c.defId].name;
  const sorc = s.active === p && (s.step === 'main1' || s.step === 'main2') && !s.stack.length;
  const instant = /\binstant\b/i.test(s.defs[c.defId].typeLine) || api.chars(s, iid).keywords?.has?.('flash');
  const timing = s.priority === p && !s.prompt && (instant || sorc);
  const base = s.defs[c.defId].manaCost;
  if (f.buyback) out.push({ label: `Cast ${name} with buyback ${base}${f.buyback}`, action: { type: 'cast', iid, alt: 'ext:buyback' }, ok: timing && api.canAfford(s, p, base + f.buyback) });
  if (f.evoke) out.push({ label: `Evoke ${name} ${f.evoke}`, action: { type: 'cast', iid, alt: 'ext:evoke' }, ok: timing && api.canAfford(s, p, f.evoke) });
  if (f.dash) out.push({ label: `Dash ${name} ${f.dash}`, action: { type: 'cast', iid, alt: 'ext:dash' }, ok: timing && api.canAfford(s, p, f.dash) });
  return out;
});
EXT.alts.buyback = { begin: (s, _p, iid) => s.defs[s.cards[iid].defId].manaCost + (front(s, iid).buyback ?? ''), afterPush: (s, item) => { (s.cards[item.source] as any).buyback = true; } };
EXT.alts.evoke = { begin: (s, _p, iid) => front(s, iid).evoke ?? '!No evoke cost', afterPush: (s, item) => { (s.cards[item.source] as any).evoked = true; } };
EXT.alts.dash = { begin: (s, _p, iid) => front(s, iid).dash ?? '!No dash cost', afterPush: (s, item) => { (s.cards[item.source] as any).dashed = true; } };
EXT.hooks.finish.push((s, item, countered, api) => {
  const c = s.cards[item.source] as any;
  if (!c?.buyback) return false;
  c.buyback = false;
  if (countered || c.zone !== 'stack') return false;
  c.zone = 'library';
  api.moveCard(s, item.source, 'hand');
  api.log(s, `${api.nm(s, item.source)} returns to its owner's hand (buyback).`, item.controller);
  return true;
});
EXT.hooks.afterMove.push((s, iid, from, to, _o, api) => {
  const c = s.cards[iid] as any;
  if (!c) return;
  if (to !== 'battlefield') {
    if (from === 'battlefield') { c.evoked = false; c.dashed = false; }
    return;
  }
  if (c.evoked) {
    c.evoked = false;
    const it: any = { id: api.uid(s, 's'), kind: 'trigger', controller: c.controller, source: iid, label: `${api.nm(s, iid)} — evoke`, text: 'Sacrifice it.', effects: [{ k: 'sacObj', what: { t: 'self' } }], targets: [] };
    it.preTargeted = true;
    s.pendingTriggers.push(it);
  }
  if (c.dashed) {
    c.dashed = false;
    c.mods.push({ keywords: ['haste'], until: 'permanent', source: iid, ts: s.ts++ });
    s.delayed.push({ at: 'nextEnd', controller: c.controller, source: iid, label: `${api.nm(s, iid)} — dash`, effects: [{ k: 'bounce', what: { t: 'self' } }], targets: [] });
  }
});

// ------------------------------------------------------------------------------------------
// "Sacrifice ~ unless you pay {2}." / "As ~ enters, you may pay 2 life. If you don't, it enters tapped."
// ------------------------------------------------------------------------------------------
EXT.rules.push([/^sacrifice ~ unless you pay ((?:\{[^}]+\})+)$/, (m) => [{ k: 'ext', name: 'payOrSac', cost: m[1].toUpperCase() }]]);
EXT.effects.payOrSac = ({ s, item, e, r, you, api }) => {
  const c = s.cards[item.source];
  if (!c || c.zone !== 'battlefield') return 'done';
  if (!r.sub) {
    if (!api.canAfford(s, you, e.cost)) {
      api.moveCard(s, item.source, 'graveyard', { cause: 'sacrifice' });
      return 'done';
    }
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'yesno', title: `Pay ${e.cost} to keep ${api.nm(s, item.source)}?`, options: [{ id: 'yes', label: `Pay ${e.cost}` }, { id: 'no', label: 'Sacrifice it' }], data: { ctx: 'resolve' } });
    return 'wait';
  }
  if (r.sub.answered === 'yes' && !api.payMana(s, you, e.cost, 0)) return 'done';
  api.moveCard(s, item.source, 'graveyard', { cause: 'sacrifice' });
  return 'done';
};
EXT.lines.push((line, pc) => {
  const m = line.match(/^as ~ enters(?: the battlefield)?, you may pay (\d+) life\. if you don't, it enters (?:the battlefield )?tapped$/) ?? line.match(/^as ~ enters(?: the battlefield)?, you may pay (\d+) life$/);
  if (!m) return false;
  pc.shockLife = +m[1];
  return true;
});
EXT.hooks.afterMove.push((s, iid, _from, to, _o, api) => {
  if (to !== 'battlefield') return;
  const n = (api.chars(s, iid).pc as any).shockLife;
  if (!n) return;
  // it enters tapped unless its controller pays; the land is tapped until the choice is made
  s.cards[iid].tapped = true;
  const it: any = { id: api.uid(s, 's'), kind: 'trigger', controller: s.cards[iid].controller, source: iid, label: `${api.nm(s, iid)} — pay ${n} life?`, text: '', effects: [{ k: 'ext', name: 'shockPay', n }], targets: [] };
  it.preTargeted = true;
  s.pendingTriggers.push(it);
});
EXT.effects.shockPay = ({ s, item, e, r, you, api }) => {
  if (!r.sub) {
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'yesno', title: `${api.nm(s, item.source)}: pay ${e.n} life to have it enter untapped?`, options: [{ id: 'yes', label: `Pay ${e.n} life` }, { id: 'no', label: 'Enter tapped' }], data: { ctx: 'resolve' } });
    return 'wait';
  }
  if (r.sub.answered === 'yes' && s.cards[item.source]?.zone === 'battlefield') {
    api.loseLife(s, you, e.n);
    s.cards[item.source].tapped = false;
  }
  return 'done';
};

// ------------------------------------------------------------------------------------------
// Harmonize (Tarkir: Dragonstorm): cast from your graveyard for its harmonize cost, then exile it. As you cast it
// you may tap an untapped creature you control to reduce the cost by an amount of generic mana equal to its power.
// It reuses the flashback path (graveyard cast + exile); the tap is an optional cost step.
// ------------------------------------------------------------------------------------------
EXT.lines.push((line, pc) => {
  const m = line.match(/^harmonize ((?:\{[^}]+\})+)$/);
  if (!m) return false;
  pc.flashback = m[1].toUpperCase();
  pc.harmonize = true;
  return true;
});
EXT.hooks.castCosts.push((s, pc, api) => {
  if (pc.kind !== 'spell' || !(pc.alt === 'flashback' || pc.flashback) || !front(s, pc.iid).harmonize) return false;
  if (pc.extHarmTap === undefined) {
    const mine = s.battlefield.filter((b) => s.cards[b].controller === pc.player && !s.cards[b].tapped && api.chars(s, b).types.has('creature') && api.chars(s, b).power > 0);
    if (!mine.length) { pc.extHarmTap = []; return false; }
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: pc.player, kind: 'chooseCards', title: `${pc.label}: you may tap a creature to reduce the cost by its power (harmonize)`, cards: mine, min: 0, max: 1, canCancel: true, data: { ctx: 'cast', cost: 'extHarmTap' } });
    return true;
  }
  if (!pc.harmApplied) {
    pc.harmApplied = true;
    const c = (pc.extHarmTap as string[])[0];
    if (c && s.cards[c]) pc.manaCost = reduceGeneric(pc.manaCost ?? '', api.chars(s, c).power);
  }
  return false;
});
EXT.hooks.castPay.push((s, pc) => {
  for (const c of (pc.harmApplied ? pc.extHarmTap : []) ?? []) if (s.cards[c]) s.cards[c].tapped = true;
});

// Splice onto Arcane / onto instant or sorcery (702.47). The engine offers these as the first step of casting a
// matching spell (see spliceCandidates / the 'splice' cast stage in engine.ts).
EXT.lines.push((line, pc) => {
  const m = line.match(/^splice onto (arcane|instant or sorcery) ((?:\{[^}]+\})+)$/);
  if (!m) return false;
  pc.splice = { onto: m[1] === 'arcane' ? 'arcane' : 'instantSorcery', cost: m[2].toUpperCase() };
  return true;
});

// "Evoke—Exile a white card from your hand." (Solitude, Fury, Grief, Endurance, Subtlety)
EXT.lines.push((line, pc) => {
  const m = line.match(/^evoke—exile (a|an|two) (.+?) cards? from your hand$/);
  if (!m) return false;
  const f = looseFilter(m[2]) ?? cardFilter(m[2]);
  if (!f) return false;
  pc.evokeExile = { filter: { ...f, zone: 'hand' }, n: m[1] === 'two' ? 2 : 1 };
  return true;
});
const evokeCands = (s: GameState, p: PlayerIdx, iid: string, api: any) => {
  const e = front(s, iid).evokeExile;
  return e ? s.players[p].hand.filter((h) => h !== iid && api.matchesFilter(s, h, e.filter, p, iid)) : [];
};
EXT.hooks.castOptions.push((s, p, iid, api) => {
  const c = s.cards[iid];
  if (!c || c.zone !== 'hand' || c.owner !== p) return [];
  const e = front(s, iid).evokeExile;
  if (!e) return [];
  const sorc = s.active === p && (s.step === 'main1' || s.step === 'main2') && !s.stack.length;
  const instant = /\binstant\b/i.test(s.defs[c.defId].typeLine) || api.chars(s, iid).keywords?.has?.('flash');
  const timing = s.priority === p && !s.prompt && (instant || sorc);
  return [{ label: `Evoke ${s.defs[c.defId].name} (exile ${e.n} card${e.n > 1 ? 's' : ''} from hand)`, action: { type: 'cast', iid, alt: 'ext:evokeExile' }, ok: timing && evokeCands(s, p, iid, api).length >= e.n } as any];
});
EXT.alts.evokeExile = {
  begin: (s, p, iid, _f, api) => (evokeCands(s, p, iid, api).length >= (front(s, iid).evokeExile?.n ?? 1) ? '' : '!Nothing to exile'),
  costs: (s, pc, api) => {
    if (pc.extEvokeEx) return false;
    const n = front(s, pc.iid).evokeExile.n;
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: pc.player, kind: 'chooseCards', title: `${pc.label}: exile ${n} from your hand (evoke)`, cards: evokeCands(s, pc.player, pc.iid, api), min: n, max: n, canCancel: true, data: { ctx: 'cast', cost: 'extEvokeEx' } });
    return true;
  },
  pay: (s, pc, api) => { for (const x of pc.extEvokeEx ?? []) if (s.cards[x]?.zone === 'hand') api.moveCard(s, x, 'exile'); },
  afterPush: (s, item) => { (s.cards[item.source] as any).evoked = true; },
};

// the beheld-and-exiled card is "the exiled card" of the permanent the spell becomes
EXT.hooks.afterMove.push((s, iid, from, to) => {
  const c = s.cards[iid] as any;
  if (!c?.beheldX) return;
  if (to === 'battlefield') c.remembered = [...(c.remembered ?? []), ...c.beheldX];
  if (to !== 'stack') c.beheldX = undefined;
});
