// Plugin: attack restrictions and attack taxes against a player.
//  - "Creatures can't attack you (or planeswalkers you control) unless their controller pays {2} for each creature
//     they control that's attacking you / for each of those creatures."  (Propaganda, Ghostly Prison, Baird, Norn's Annex)
//  - "As long as ~ is untapped, …" (Archangel of Tithes)
//  - "[Black / without flying / with power 2 or less] creatures can't attack you (or planeswalkers you control)."
import { EXT } from '../ext';
import { sourcesWith } from '../rules';
import { parseFilter } from '../oracle';

EXT.lines.push((line, pc) => {
  let m = line.match(/^(as long as ~ is untapped, )?([a-z]+ )?creatures can't attack you( or planeswalkers you control)? unless their controller pays ((?:\{[^}]+\})+) for each (?:creature they control that's attacking you|of those creatures)$/);
  if (m) {
    const f = m[2] ? parseFilter(m[2] + 'creature') : null;
    if (m[2] && !f) return false;
    pc.attackTax = { cost: m[4].toUpperCase(), untapped: !!m[1], pw: !!m[3], filter: f ? { ...f, zone: undefined } : null };
    return true;
  }
  m = line.match(/^(.*?)(creatures|[a-z]+s)( with(?:out)? [a-z]+| with power \d+ or less| with power \d+ or greater)? can't attack you( or planeswalkers you control)?$/);
  if (m && !/\b(enchanted|equipped|that|those|it)\b/.test(m[1] + m[2])) {
    const phrase = (m[1] + m[2] + (m[3] ?? '')).trim();
    const f = parseFilter(phrase.replace(/s$/, '').replace(/creatures? /, 'creature ')) ?? parseFilter(phrase);
    if (!f) return false;
    pc.cantAttackYou = { filter: { ...f, zone: undefined }, pw: !!m[4] };
    return true;
  }
  return false;
});

/** Opponent-side permanents with a given static. */
function guards(s: any, attacker: string, key: string, api: any) {
  const me = s.cards[attacker].controller;
  return sourcesWith(s, key).filter((b: string) => s.cards[b].controller !== me && api.chars(s, b).pc[key]);
}

const hitsDefender = (s: any, target: any, defender: number, pw: boolean) =>
  target?.kind === 'player' ? target.idx === defender : pw && target?.kind === 'card' && s.cards[target.iid]?.controller === defender && s.cards[target.iid]?.zone === 'battlefield';

EXT.hooks.canAttack.push((s, iid, api) => {
  for (const g of guards(s, iid, 'cantAttackYou', api)) {
    const r = api.chars(s, g).pc.cantAttackYou;
    if (!api.matchesFilter(s, iid, r.filter, s.cards[g].controller, g)) continue;
    const defender = s.cards[g].controller;
    const pws = s.battlefield.some((b: string) => s.cards[b].controller === defender && api.chars(s, b).types.has('planeswalker'));
    if (r.pw || !pws) return false; // nothing else to attack in a two-player game
  }
  return undefined;
});

EXT.hooks.attackCost.push((s, iid, target, api) => {
  let cost = '';
  for (const g of guards(s, iid, 'attackTax', api)) {
    const r = api.chars(s, g).pc.attackTax;
    if (r.untapped && s.cards[g].tapped) continue;
    if (r.filter && !api.matchesFilter(s, iid, r.filter, s.cards[g].controller, g)) continue;
    if (!hitsDefender(s, target, s.cards[g].controller, r.pw)) continue;
    cost += r.cost;
  }
  return cost || null;
});
