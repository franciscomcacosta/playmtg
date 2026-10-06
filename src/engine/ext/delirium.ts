// Plugin: graveyard card-type counts (delirium), "for each creature blocking it", and party discounts.
//  - Condition: "there are four or more card types among cards in your graveyard" (static "as long as", intervening "if")
//  - "It gets +1/+1 until end of turn for each creature blocking it." (rampage-style)
//  - "~ costs {1} less to cast for each creature in your party." (party: up to one each of Cleric, Rogue, Warrior, Wizard)
import { EXT } from '../ext';
import { parseCost } from '../mana';
import { chars } from '../rules';
import type { GameState, PlayerIdx } from '../types';

const W: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };
const CARD_TYPES = ['artifact', 'battle', 'creature', 'enchantment', 'instant', 'kindred', 'land', 'planeswalker', 'sorcery'];
export function gyTypeCount(s: GameState, p: PlayerIdx): number {
  const seen = new Set<string>();
  for (const c of s.players[p].graveyard) {
    const tl = s.defs[s.cards[c].defId].typeLine.toLowerCase().split('—')[0];
    for (const t of CARD_TYPES) if (new RegExp(`\\b${t}\\b`).test(tl)) seen.add(t);
    if (/\btribal\b/.test(tl)) seen.add('kindred');
  }
  return seen.size;
}
EXT.conds.push((text) => {
  const m = text.match(/^there are (\w+) or more card types among cards in your graveyard$/);
  const n = m ? (/^\d+$/.test(m[1]) ? +m[1] : W[m[1]]) : undefined;
  return n ? { k: 'ext', name: 'gyTypes', n } : null;
});
EXT.condEval.gyTypes = (s, cond, you) => gyTypeCount(s, you) >= cond.n;

// ---- for each creature blocking it ----
EXT.rules.push([/^(it|~) gets \+(\d+)\/\+(\d+) until end of turn for each creature blocking it$/, (m) => [{ k: 'ext', name: 'perBlocker', p: +m[2], t: +m[3] }]]);
EXT.effects.perBlocker = ({ s, item, e }) => {
  const a = s.combat?.attackers.find((x) => x.iid === item.source);
  const n = a ? a.blockedBy.filter((b) => s.cards[b]?.zone === 'battlefield').length : 0;
  const c = s.cards[item.source];
  if (n > 0 && c?.zone === 'battlefield') c.mods.push({ power: e.p * n, toughness: e.t * n, until: 'eot', source: item.source, ts: s.ts++ });
  return 'done';
};

// ---- party ----
const PARTY = ['cleric', 'rogue', 'warrior', 'wizard'];
export function partySize(s: GameState, p: PlayerIdx): number {
  // assign creatures to roles greedily, rarest-first, so a changeling can fill any missing slot
  const mine = s.battlefield.filter((b) => s.cards[b].controller === p && chars(s, b).types.has('creature'));
  const roles = (b: string) => PARTY.filter((r) => chars(s, b).subtypes.has(r) || chars(s, b).keywords.has('changeling'));
  const used = new Set<string>();
  let n = 0;
  for (const r of PARTY) {
    const pick = mine.filter((b) => !used.has(b) && roles(b).includes(r)).sort((a, b) => roles(a).length - roles(b).length)[0];
    if (pick) { used.add(pick); n++; }
  }
  return n;
}
EXT.lines.push((line, pc) => {
  const m = line.match(/^(?:~|this spell) costs \{(\d+)\} less to cast for each creature in your party$/);
  if (!m) return false;
  pc.partyDiscount = +m[1];
  return true;
});
EXT.hooks.costMod.push((s, p, iid, cost, _alt, api) => {
  const per = api.parsedFor(s, s.cards[iid])?.partyDiscount;
  if (!per || !cost) return cost;
  const off = per * partySize(s, p);
  if (!off) return cost;
  const pc = parseCost(cost);
  const g = Math.max(0, pc.generic - off);
  return (g ? `{${g}}` : '') + cost.replace(/\{\d+\}/g, '');
});
