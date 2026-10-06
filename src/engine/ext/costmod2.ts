// Plugin: more self cost reductions.
//  - "This spell costs {X} less to cast, where X is <amount>."
//  - "This spell costs {1} less to cast for each <count>."  (counts the core's costCount doesn't: died this turn, colors …)
//  - "This spell costs {2} less to cast if <condition>."  (any condition the parser knows)
import { EXT } from '../ext';
import { parseAmtPhrase, parseCond, parseCountPhrase } from '../oracle';
import { chars, evalAmt } from '../rules';

const reduce = (cost: string, n: number) => {
  const g = +(cost.match(/\{(\d+)\}/)?.[1] ?? 0);
  const left = Math.max(0, g - n);
  return (left ? `{${left}}` : '') + cost.replace(/\{\d+\}/g, '');
};

EXT.lines.push((line, pc) => {
  let m: RegExpMatchArray | null;
  if ((m = line.match(/^(?:~|this spell) costs \{x\} less to cast, where x is (.+)$/))) {
    const a = parseAmtPhrase(m[1], { specs: [], selfName: '~', last: { t: 'self' } } as any);
    if (a == null) return false;
    (pc.amtDiscounts ??= []).push({ amt: a, per: 1 });
    return true;
  }
  if ((m = line.match(/^(?:~|this spell) costs \{(\d+)\} less to cast for each (.+)$/))) {
    const a = parseCountPhrase(m[2]);
    if (a == null) return false;
    (pc.amtDiscounts ??= []).push({ amt: a, per: +m[1] });
    return true;
  }
  if ((m = line.match(/^(?:~|this spell) costs \{(\d+)\} less to cast if (.+)$/))) {
    if (/\b(?:it targets|bargained|evidence)\b/.test(m[2])) return false; // decided after the cost is computed here
    const cond = parseCond(m[2]);
    if (!cond) return false;
    (pc.condDiscounts ??= []).push({ n: +m[1], cond });
    return true;
  }
  return false;
});
EXT.hooks.costMod.push((s, p, iid, cost, _alt, api) => {
  if (!cost) return cost;
  let off = 0;
  for (const d of (api.parsedFor(s, s.cards[iid]) as any)?.amtDiscounts ?? []) off += d.per * Math.max(0, evalAmt(s, d.amt, p, iid));
  return off ? reduce(cost, off) : cost;
});

// conditions and counts the cost lines use
EXT.conds.push((t) => {
  if (/^you've cast another spell this turn$/.test(t)) return { k: 'ext', name: 'castBefore' };
  if (/^a creature is attacking you$/.test(t)) return { k: 'ext', name: 'beingAttacked' };
  return null;
});
EXT.condEval.castBefore = (s, _c, you) => { const t = (s as any).evTurn; return !!t && t.turn === s.turn && (t.casts?.[you] ?? 0) >= 1; };
EXT.condEval.beingAttacked = (s, _c, you) => s.active !== you && !!s.combat?.attackers.length;
const PH: [RegExp, (m: RegExpMatchArray) => any][] = [
  [/^basic land types? among lands you control$/, () => ({ ext: 'domain' })],
  [/^(?:creature|nontoken creature)s? that died this turn$/, () => ({ ext: 'diedThisTurn' })],
  [/^colors? among permanents you control$/, () => ({ ext: 'colorsAmong' })],
  [/^cards? you've drawn this turn$/, () => ({ ext: 'drawnThisTurn' })],
  [/^the total (power|toughness) of creatures you control$/, (m) => ({ ext: 'totalStat', stat: m[1] })],
];
EXT.amountPhrases.push((ph) => { for (const [re, f] of PH) { const m = ph.match(re); if (m) return f(m); } return null; });
EXT.amounts.totalStat = (s, a, you) => s.battlefield.filter((b) => s.cards[b].controller === you).reduce((t, b) => { const ch = chars(s, b); return t + (ch.types.has('creature') ? Math.max(0, a.stat === 'power' ? ch.power : ch.toughness) : 0); }, 0);
