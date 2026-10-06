// Plugin: costs and counters that depend on how a spell was cast.
//  - "~ enters with a +1/+1 counter on it for each color of mana spent to cast it." (Crystalline Crawler, Chamber Sentry)
//  - "~ costs {N} less to cast if it targets a tapped creature." (Ajani's Response, Banish from Edoras)
//    The discount is shown up front whenever some tapped creature exists (so the spell is castable), and charged back
//    after targets are chosen if none of them is a tapped creature.
import { EXT } from '../ext';
import { parseCost } from '../mana';
import type { GameState } from '../types';

EXT.lines.push((line, pc) => {
  let m: RegExpMatchArray | null;
  if ((m = line.match(/^~ enters with an? ([+-]\d\/[+-]\d) counter on it for each color of mana spent to cast it$/))) {
    (pc.entersCounters ??= []).push({ counter: m[1], n: 0, perColorSpent: true });
    return true;
  }
  if ((m = line.match(/^(?:~|this spell) costs \{(\d+)\} less to cast if it targets a tapped creature$/))) {
    pc.tappedTargetDiscount = +m[1];
    return true;
  }
  return false;
});

const front = (s: GameState, iid: string, api: any) => api.parsedFor(s, s.cards[iid]);
function reduceGeneric(cost: string, n: number): string {
  const pc = parseCost(cost);
  const g = Math.max(0, pc.generic - n);
  return (g ? `{${g}}` : '') + cost.replace(/\{\d+\}/g, '');
}
function addGeneric(cost: string, n: number): string {
  const pc = parseCost(cost || '');
  return `{${pc.generic + n}}` + (cost || '').replace(/\{\d+\}/g, '');
}
EXT.hooks.costMod.push((s, _p, iid, cost, _alt, api) => {
  const n = front(s, iid, api)?.tappedTargetDiscount;
  if (!n || !cost) return cost;
  const anyTapped = s.battlefield.some((b) => s.cards[b].tapped && api.chars(s, b).types.has('creature'));
  if (!anyTapped) return cost;
  const after = reduceGeneric(cost, n);
  ((s as any).tapDiscount ??= {})[iid] = parseCost(cost).generic - parseCost(after).generic; // how much was taken off
  return after;
});
EXT.hooks.castCosts.push((s, pc, api) => {
  if (pc.kind !== 'spell' || pc.tapDiscountChecked) return false;
  pc.tapDiscountChecked = true;
  const took = (s as any).tapDiscount?.[pc.iid];
  if (!took) return false;
  delete (s as any).tapDiscount[pc.iid];
  const targeted = (pc.targets ?? []).flat().some((t: any) => t?.kind === 'card' && s.cards[t.iid]?.tapped && api.chars(s, t.iid).types.has('creature'));
  if (!targeted) pc.manaCost = addGeneric(pc.manaCost ?? '', took);
  return false;
});
