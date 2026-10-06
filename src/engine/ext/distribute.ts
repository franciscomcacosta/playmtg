// Plugin: distributing counters, and conditional cost discounts.
//  - "Distribute three +1/+1 counters among one, two, or three target creatures (you control)."
//    / "… among up to two target creatures" / "… among any number of target creatures"
//  - "~ costs {1} less to cast if you control a Wizard." / "… two or more legendary creatures" / "… a creature with power 4 or greater"
//  - "The second spell you cast each turn costs {2} less to cast." (a static on a permanent)
import { EXT } from '../ext';
import { looseFilter, parseCond, spec } from '../oracle';
import { parseCost } from '../mana';
import type { GameState, PlayerIdx } from '../types';

const W: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
const nw = (w: string) => (/^\d+$/.test(w) ? +w : W[w]);

EXT.rules.push([/^distribute (\w+) ([+-]\d\/[+-]\d) counters among (one, two, or three|one or two|up to (\w+)|any number of) (other )?target (.+)$/, (m, ctx) => {
  const n = nw(m[1]);
  if (!n) return null;
  const max = m[3] === 'one or two' ? 2 : m[3] === 'one, two, or three' ? 3 : m[4] ? nw(m[4]) : n;
  const f = looseFilter(m[6].replace(/s(?= you control|$)/, ''));
  if (!f || !max) return null;
  const upTo = /^up to|^any number/.test(m[3]);
  ctx.specs.push({ ...spec({ ...f, zone: 'battlefield', ...(m[5] ? { other: true } : {}) } as any, Math.min(max, n), upTo, `targets (distribute ${n} counters)`), divided: true });
  return [{ k: 'ext', name: 'distCounters', n, counter: m[2], spec: ctx.specs.length - 1 }];
}]);
EXT.effects.distCounters = ({ s, item, e, r, you, api }) => {
  const tg = ((item.targets[e.spec] ?? []) as any[]).filter((t) => t.kind === 'card' && s.cards[t.iid]?.zone === 'battlefield');
  if (!tg.length) return 'done';
  if (tg.length === 1) { api.addCounters(s, tg[0].iid, e.counter, e.n); return 'done'; }
  if (!r.sub?.answer) {
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'divide', title: `Distribute ${e.n} ${e.counter} counters`, targets: tg, min: e.n, max: e.n, data: { ctx: 'resolve' } });
    return 'wait';
  }
  const alloc: number[] = r.sub.answer;
  tg.forEach((t, i) => { const k = Math.max(0, alloc[i] ?? 0); if (k) api.addCounters(s, t.iid, e.counter, k); });
  return 'done';
};

// ---- discounts ----
function reduceGeneric(cost: string, n: number): string {
  const pc = parseCost(cost);
  const g = Math.max(0, pc.generic - n);
  return (g ? `{${g}}` : '') + cost.replace(/\{\d+\}/g, '');
}
EXT.lines.push((line, pc) => {
  let m: RegExpMatchArray | null;
  if ((m = line.match(/^(?:~|this spell) costs \{(\d+)\} less to cast if you control (.+)$/))) {
    if (/ and \{\d\} less/.test(m[2])) return false;
    const cond = parseCond(`you control ${m[2]}`);
    if (!cond) return false;
    (pc.condDiscounts ??= []).push({ n: +m[1], cond });
    return true;
  }
  if ((m = line.match(/^the second spell you cast each turn costs \{(\d+)\} less to cast$/))) {
    pc.secondSpellDiscount = +m[1];
    return true;
  }
  return false;
});
const castsThisTurn = (s: GameState, p: PlayerIdx) => {
  const t = (s as any).evTurn;
  return t && t.turn === s.turn ? t.casts?.[p] ?? 0 : 0;
};
EXT.hooks.costMod.push((s, p, iid, cost, _alt, api) => {
  if (!cost) return cost;
  let off = 0;
  for (const d of api.parsedFor(s, s.cards[iid])?.condDiscounts ?? []) if (api.evalCond(s, d.cond, p, iid)) off += d.n;
  if (castsThisTurn(s, p) === 1)
    for (const b of s.battlefield) if (s.cards[b].controller === p) off += (api.chars(s, b).pc as any).secondSpellDiscount ?? 0;
  return off ? reduceGeneric(cost, off) : cost;
});
