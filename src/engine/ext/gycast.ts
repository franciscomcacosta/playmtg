// Plugin: casting a targeted card from a graveyard, the "exile it instead" rider, and per-target cost increases.
//  - "You may cast target instant or sorcery card [with mana value 3 or less] from your graveyard [without paying its
//     mana cost]." (Snapcaster-style, during resolution; paying its cost if it doesn't say otherwise)
//  - "If that spell would be put into your graveyard / a graveyard, exile it instead." — marks the card just cast this
//     way; whenever it leaves the stack (resolved or countered) it goes to exile.
//  - "~ costs {2} more to cast for each target beyond the first."
import { EXT } from '../ext';
import { looseFilter, spec } from '../oracle';
import { parseCost } from '../mana';

const W: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, x: -1 };
EXT.rules.push([/^(?:you may )?cast target (.+?) card(?: with mana value (\w+) or less| with mana value less than or equal to (?:~'s|its|his|her) power)? from (your|a|that player's|an opponent's) graveyard( without paying its mana cost)?$/, (m, ctx) => {
  const f = looseFilter(m[1]);
  if (!f) return null;
  const g: any = { ...f, zone: 'graveyard' };
  if (m[3] === 'your') g.owner = 'you';
  else if (m[3] !== 'a') g.owner = 'opp';
  if (m[2]) { const n = /^\d+$/.test(m[2]) ? +m[2] : W[m[2]]; if (n === undefined || n < 0) return null; g.cmcMax = n; }
  const powerCap = /power/.test(m[0]);
  ctx.specs.push(spec(g, 1, false, `${m[1]} card in ${m[3] === 'your' ? 'your' : 'a'} graveyard`));
  // when the core already wrapped this in "you may", it asks; otherwise this effect asks itself
  return [{ k: 'ext', name: 'castFromGy', spec: ctx.specs.length - 1, free: !!m[4], powerCap, ask: /^you may /.test(m[0]) }];
}]);
EXT.effects.castFromGy = ({ s, item, e, r, you, api }) => {
  const t = (item.targets[e.spec] ?? [])[0] as any;
  const c = t?.kind === 'card' ? t.iid : undefined;
  if (!c || s.cards[c]?.zone !== 'graveyard') return 'done';
  if (e.powerCap && s.cards[item.source] && s.defs[s.cards[c].defId].cmc > api.chars(s, item.source).power) return 'done';
  if (!e.ask) r.sub ??= { answered: 'yes' };
  if (!r.sub) {
    r.sub = {};
    const how = e.free ? 'without paying its mana cost' : `for ${s.defs[s.cards[c].defId].manaCost}`;
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'yesno', title: `Cast ${api.nm(s, c)} from the graveyard ${how}?`, options: [{ id: 'yes', label: 'Cast it' }, { id: 'no', label: "Don't" }], cards: [c], data: { ctx: 'resolve' } });
    return 'wait';
  }
  if (r.sub.answered !== 'yes') return 'done';
  let err: string | null;
  s.priority = you; // casting during resolution: the caster acts now (as miracle does)
  if (e.free) err = api.beginCast(s, you, c, 0, 'free');
  else { s.cards[c].mayPlay = { player: you, untilTurn: s.turn }; err = api.beginCast(s, you, c, 0, 'mayPlay'); }
  if (err) api.log(s, `Couldn't cast ${api.nm(s, c)}: ${err}`, you, 'warn');
  else (s as any).lastFreeCast = c;
  return 'done';
};

// "If that spell would be put into your graveyard, exile it instead."
EXT.rules.push([/^if that (?:spell|card) would be put into (?:your|a|its owner's) graveyard(?: this turn)?, exile it instead$/, () => [{ k: 'ext', name: 'exileAfterCast' }]]);
EXT.effects.exileAfterCast = ({ s }) => {
  const c = (s as any).lastFreeCast;
  if (c && s.cards[c]) (s.cards[c] as any).exileFromStack = true;
  return 'done';
};
EXT.hooks.finish.push((s, item, _countered, api) => {
  const c = s.cards[item.source] as any;
  if (!c?.exileFromStack || (item as any).isCopy) return false;
  c.exileFromStack = false;
  if (c.zone === 'stack' || c.zone === 'graveyard') { api.moveCard(s, item.source, 'exile'); return true; }
  return false;
});
EXT.hooks.afterMove.push((s, iid, _from, to) => {
  const c = s.cards[iid] as any;
  if (c?.exileFromStack && to !== 'stack' && to !== 'exile' && to !== 'graveyard') c.exileFromStack = false;
});

// ---- costs more per extra target ----
EXT.lines.push((line, pc) => {
  const m = line.match(/^(?:~|this spell) costs ((?:\{[^}]+\})+) more to cast for each target beyond the first$/);
  if (!m) return false;
  pc.perExtraTarget = /^\{\d+\}$/.test(m[1]) ? +m[1].slice(1, -1) : m[1].toUpperCase(); // strive
  return true;
});
EXT.hooks.castCosts.push((s, pc, api) => {
  if (pc.kind !== 'spell' || pc.perTargetDone) return false;
  pc.perTargetDone = true;
  const per = api.parsedFor(s, s.cards[pc.iid])?.perExtraTarget;
  if (!per) return false;
  const n = (pc.targets ?? []).flat().length;
  if (n > 1) {
    if (typeof per === 'string') {
      // "{2}{U} more for each target beyond the first": add the generic part up and append the colored symbols
      const g = +(per.match(/\{(\d+)\}/)?.[1] ?? 0) * (n - 1);
      const sym = per.replace(/\{\d+\}/g, '').repeat(n - 1);
      const cur = parseCost(pc.manaCost || '');
      pc.manaCost = (cur.generic + g ? `{${cur.generic + g}}` : '') + (pc.manaCost || '').replace(/\{\d+\}/g, '') + sym;
    } else {
      const add = per * (n - 1);
      const cur = parseCost(pc.manaCost || '');
      pc.manaCost = `{${cur.generic + add}}` + (pc.manaCost || '').replace(/\{\d+\}/g, '');
    }
  }
  return false;
});

// "~ deals 2 damage to each of up to three target creatures." / "… to each of two target creatures and/or planeswalkers."
const NW: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
EXT.rules.push([/^(~|it) deals (\d+|x) damage to each of (up to )?(one|two|three|four|five|\d+) targets? (.+)$/, (m, ctx) => {
  const n = /^\d+$/.test(m[4]) ? +m[4] : NW[m[4]];
  const ph = m[5].replace(/ and\/or /g, ' or ');
  const f = looseFilter(ph.replace(/s(?= or |$)/g, ''));
  if (!n || !f) return null;
  ctx.specs.push(spec({ ...f, zone: 'battlefield' } as any, n, !!m[3], `up to ${n} target ${m[5]}`));
  return [{ k: 'damage', n: m[2] === 'x' ? 'X' : +m[2], to: [{ t: 'target', spec: ctx.specs.length - 1 }], from: { t: 'self' } }];
}]);
