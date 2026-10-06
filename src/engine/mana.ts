import type { Color, ManaPool } from './types';

export interface ManaCost {
  generic: number;
  colored: Record<Color, number>; // includes C for {C}
  hybrid: Color[][]; // each entry: alternatives; a number alt is stored as 'N2' via twoGeneric
  twoBrid: Color[]; // {2/W}: pay W or 2 generic
  phyrexian: Color[]; // {W/P}: pay W or 2 life
  x: number;
  snow: number;
}

export function emptyPool(): ManaPool {
  return { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
}

export function poolTotal(p: ManaPool): number {
  return p.W + p.U + p.B + p.R + p.G + p.C;
}

export function parseCost(str: string | undefined): ManaCost {
  const cost: ManaCost = {
    generic: 0,
    colored: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
    hybrid: [],
    twoBrid: [],
    phyrexian: [],
    x: 0,
    snow: 0,
  };
  if (!str) return cost;
  const syms = str.match(/\{[^}]+\}/g) ?? [];
  for (const raw of syms) {
    const s = raw.slice(1, -1).toUpperCase();
    if (/^\d+$/.test(s)) cost.generic += parseInt(s, 10);
    else if (s === 'X') cost.x++;
    else if (s === 'Y' || s === 'Z') cost.x++;
    else if (s === 'S') cost.snow++;
    else if (['W', 'U', 'B', 'R', 'G', 'C'].includes(s)) cost.colored[s as Color]++;
    else if (/^[WUBRG]\/P$/.test(s)) cost.phyrexian.push(s[0] as Color);
    else if (/^[WUBRG]\/[WUBRG]\/P$/.test(s)) cost.hybrid.push([s[0] as Color, s[2] as Color]);
    else if (/^2\/[WUBRG]$/.test(s)) cost.twoBrid.push(s[2] as Color);
    else if (/^C\/[WUBRG]$/.test(s)) cost.hybrid.push(['C', s[2] as Color]);
    else if (/^[WUBRG]\/[WUBRG]$/.test(s)) cost.hybrid.push([s[0] as Color, s[2] as Color]);
    else if (s === 'H' || s.startsWith('H')) cost.colored.W++; // half mana (Un-cards) — approximate
    else if (s === 'P') cost.generic += 0; // Phyrexian generic (rare) — ignore
    else if (s === '∞' || s === '½') cost.generic += 0;
  }
  return cost;
}

export function costToString(c: ManaCost, xValue = 0): string {
  let s = '';
  if (c.x) s += '{X}'.repeat(c.x);
  const gen = c.generic + c.x * xValue;
  if (gen || (!s && totalColored(c) === 0)) s += `{${gen}}`;
  for (const col of ['W', 'U', 'B', 'R', 'G', 'C'] as Color[]) s += `{${col}}`.repeat(c.colored[col]);
  for (const h of c.hybrid) s += `{${h.join('/')}}`;
  for (const t of c.twoBrid) s += `{2/${t}}`;
  for (const p of c.phyrexian) s += `{${p}/P}`;
  return s;
}

function totalColored(c: ManaCost) {
  return Object.values(c.colored).reduce((a, b) => a + b, 0) + c.hybrid.length + c.twoBrid.length + c.phyrexian.length;
}

export function manaValue(c: ManaCost): number {
  return c.generic + totalColored(c) + c.twoBrid.length + c.snow;
}

/** A single unit of mana a payment source can supply. */
export interface ManaUnit {
  sourceId: string | null; // null = floating pool mana
  options: Color[]; // colors this unit could be
  group: string; // units sharing a group come from one activation (tapped together)
}

export interface PaymentPlan {
  ok: boolean;
  tapSources: { iid: string; ability: number; colors: Color[] }[];
  fromPool: ManaPool;
  lifePaid: number;
  leftover: ManaPool; // extra mana produced (goes to pool)
  error?: string;
}

export interface ManaSource {
  iid: string;
  ability: number;
  produces: Color[][]; // for each mana produced: its options
  lifeCost?: number;
  priority: number; // lower = tap first for generic
}

/**
 * Arena-style auto payer: uses floating mana first, then taps untapped sources.
 * Solves colored requirements by backtracking, then fills generic with the least useful sources.
 */
export function planPayment(cost: ManaCost, xValue: number, pool: ManaPool, sources: ManaSource[], life: number): PaymentPlan {
  type Req = { kind: 'color'; opts: Color[]; alt2?: boolean; phyrexian?: boolean };
  const reqs: Req[] = [];
  for (const col of ['W', 'U', 'B', 'R', 'G', 'C'] as Color[]) for (let i = 0; i < cost.colored[col]; i++) reqs.push({ kind: 'color', opts: [col] });
  for (const h of cost.hybrid) reqs.push({ kind: 'color', opts: h });
  for (const p of cost.phyrexian) reqs.push({ kind: 'color', opts: [p], phyrexian: true });
  for (const t of cost.twoBrid) reqs.push({ kind: 'color', opts: [t], alt2: true });
  let generic = cost.generic + cost.x * xValue + cost.snow;

  // Units available
  const poolUnits: ManaUnit[] = [];
  for (const col of ['W', 'U', 'B', 'R', 'G', 'C'] as Color[]) for (let i = 0; i < pool[col]; i++) poolUnits.push({ sourceId: null, options: [col], group: 'pool' });

  // sort reqs: most constrained first
  reqs.sort((a, b) => a.opts.length - b.opts.length);

  const usedPool = new Array(poolUnits.length).fill(false);
  const tapped = new Map<number, Color[] | null>(); // source index -> assigned colors per produced unit (null means unassigned slot)
  const srcSlots = sources.map((s) => s.produces.map(() => false)); // used slots
  let lifePaid = 0;
  let extraGeneric = 0;

  const assign: { src: number; slot: number; color: Color }[] = [];

  function tryReq(i: number): boolean {
    if (i >= reqs.length) return true;
    const r = reqs[i];
    // 1. pool
    for (let u = 0; u < poolUnits.length; u++) {
      if (usedPool[u]) continue;
      const c = poolUnits[u].options.find((o) => r.opts.includes(o));
      if (c) {
        usedPool[u] = true;
        if (tryReq(i + 1)) return true;
        usedPool[u] = false;
      }
    }
    // 2. already tapped sources' free slots, then new sources (fewest options first)
    const order = sources
      .map((s, idx) => idx)
      .sort((a, b) => {
        const ta = tapped.has(a) ? 0 : 1;
        const tb = tapped.has(b) ? 0 : 1;
        if (ta !== tb) return ta - tb;
        return optCount(sources[a]) - optCount(sources[b]);
      });
    for (const s of order) {
      const src = sources[s];
      for (let slot = 0; slot < src.produces.length; slot++) {
        if (srcSlots[s][slot]) continue;
        const c = src.produces[slot].find((o) => r.opts.includes(o));
        if (!c) continue;
        const wasTapped = tapped.has(s);
        tapped.set(s, null);
        srcSlots[s][slot] = true;
        assign.push({ src: s, slot, color: c });
        if (tryReq(i + 1)) return true;
        assign.pop();
        srcSlots[s][slot] = false;
        if (!wasTapped) tapped.delete(s);
        break; // other slots of same source equivalent enough
      }
    }
    // 3. alternatives
    if (r.phyrexian && life - lifePaid >= 2) {
      lifePaid += 2;
      if (tryReq(i + 1)) return true;
      lifePaid -= 2;
    }
    if (r.alt2) {
      extraGeneric += 2;
      if (tryReq(i + 1)) return true;
      extraGeneric -= 2;
    }
    return false;
  }

  if (!tryReq(0)) {
    return { ok: false, tapSources: [], fromPool: emptyPool(), lifePaid: 0, leftover: emptyPool(), error: 'Not enough mana of the right colors' };
  }
  generic += extraGeneric;

  // Generic: pool first
  const fromPool = emptyPool();
  for (let u = 0; u < poolUnits.length; u++) if (usedPool[u]) fromPool[poolUnits[u].options[0]]++;
  for (let u = 0; u < poolUnits.length && generic > 0; u++) {
    if (usedPool[u]) continue;
    usedPool[u] = true;
    fromPool[poolUnits[u].options[0]]++;
    generic--;
  }
  // free slots on tapped sources
  for (const [s] of tapped) {
    for (let slot = 0; slot < sources[s].produces.length && generic > 0; slot++) {
      if (srcSlots[s][slot]) continue;
      srcSlots[s][slot] = true;
      assign.push({ src: s, slot, color: sources[s].produces[slot][0] });
      generic--;
    }
  }
  // new sources: least flexible first, prefer higher output
  const remaining = sources
    .map((s, idx) => idx)
    .filter((i) => !tapped.has(i))
    .sort((a, b) => sources[a].priority - sources[b].priority || optCount(sources[a]) - optCount(sources[b]));
  for (const s of remaining) {
    if (generic <= 0) break;
    tapped.set(s, null);
    for (let slot = 0; slot < sources[s].produces.length; slot++) {
      if (generic > 0) {
        srcSlots[s][slot] = true;
        assign.push({ src: s, slot, color: sources[s].produces[slot][0] });
        generic--;
      }
    }
  }
  if (generic > 0) {
    return { ok: false, tapSources: [], fromPool: emptyPool(), lifePaid: 0, leftover: emptyPool(), error: 'Not enough mana' };
  }

  const leftover = emptyPool();
  const tapSources: PaymentPlan['tapSources'] = [];
  for (const [s] of tapped) {
    const src = sources[s];
    const colors: Color[] = [];
    for (let slot = 0; slot < src.produces.length; slot++) {
      const a = assign.find((x) => x.src === s && x.slot === slot);
      if (a) colors.push(a.color);
      else {
        colors.push(src.produces[slot][0]);
        leftover[src.produces[slot][0]]++;
      }
    }
    tapSources.push({ iid: src.iid, ability: src.ability, colors });
    lifePaid += src.lifeCost ?? 0;
  }
  if (lifePaid > 0 && life - lifePaid < 0) {
    // allowed to pay life down to 0 or below? Rules: can't pay more life than you have.
    return { ok: false, tapSources: [], fromPool: emptyPool(), lifePaid: 0, leftover: emptyPool(), error: 'Not enough life' };
  }
  return { ok: true, tapSources, fromPool, lifePaid, leftover };
}

function optCount(s: ManaSource) {
  return s.produces.reduce((a, p) => a + p.length, 0);
}

export function manaSymbolsToColors(text: string): Color[] {
  return (text.match(/\{[WUBRGC]\}/g) ?? []).map((s) => s[1] as Color);
}
