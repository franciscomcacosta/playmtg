// Plugin: amounts that point back at another object, and graveyard exile.
//  - "You gain life equal to that creature's toughness / its power." (the object the previous effect acted on)
//  - "You gain life equal to the sacrificed creature's toughness." / "~ deals damage equal to the sacrificed
//    creature's power to any target." (the creature sacrificed to cast this spell)
//  - "You gain life equal to the life lost this way." (the preceding life-loss effect)
//  - "Exile target player's graveyard." / "Exile all graveyards." / "Exile each opponent's graveyard."
// The referenced object's values are read where it is now (for a creature that died, its card in the graveyard).
import { EXT } from '../ext';
import { parseSentence, parsePlayerSubject } from '../oracle';
import type { GameState, StackItem } from '../types';

const statOf = (s: GameState, api: any, iid: string | undefined, stat: 'power' | 'toughness' | 'cmc'): number => {
  if (!iid || !s.cards[iid]) return 0;
  const ch = api.chars(s, iid);
  return Math.max(0, stat === 'cmc' ? ch.cmc ?? 0 : ch[stat] ?? 0);
};
const refCard = (s: GameState, item: StackItem, api: any, ref: any): string | undefined => {
  if (ref === 'sacrificed') return ((s.cards[item.source] as any)?.sacForCost ?? (s as any).lastSacrificed ?? [])[0];
  return api.subjCards(s, item, ref)[0];
};

// "you gain life equal to that creature's toughness"
EXT.rules.push([/^(?:(you) )?gains? life equal to (that creature's|its|the sacrificed creature's|the destroyed creature's|the exiled creature's) (power|toughness|mana value)$/, (m, ctx) => {
  const ref = /sacrificed/.test(m[2]) ? 'sacrificed' : ctx.last ?? { t: 'target', spec: 0 };
  return [{ k: 'ext', name: 'gainEqual', ref, stat: m[3] === 'mana value' ? 'cmc' : m[3] }];
}]);
EXT.effects.gainEqual = ({ s, item, e, you, api }) => {
  const n = statOf(s, api, refCard(s, item, api, e.ref), e.stat);
  if (n > 0) api.gainLife(s, you, n);
  return 'done';
};
// "~ deals damage equal to the sacrificed creature's power to any target"
EXT.rules.push([/^(~) deals damage equal to the sacrificed creature's (power|toughness|mana value) to (.+)$/, (m, ctx) => {
  const base = parseSentence(`${m[1]} deals 1 damage to ${m[3]}`, ctx);
  const dmg = base?.find((x: any) => x.k === 'damage') as any;
  if (!base || !dmg) return null;
  dmg.n = { sacStat: m[2] === 'mana value' ? 'cmc' : m[2] };
  return base;
}]);

// "you gain life equal to the life lost this way"
EXT.rules.push([/^(?:you )?gains? life equal to the life lost this way$/, () => [{ k: 'ext', name: 'gainLost' }]]);
EXT.effects.gainLost = ({ s, item, r, you, api }) => {
  const prev = item.effects.slice(0, r.i).reverse().find((x: any) => x.k === 'lose') as any;
  if (!prev) return 'done';
  const n = api.amount(s, item, prev.n) * Math.max(1, api.subjPlayers(s, item, prev.who).length);
  if (n > 0) api.gainLife(s, you, n);
  return 'done';
};

// ---- graveyards ----
EXT.rules.push([/^exile (target player's|target opponent's|each opponent's|each player's|that player's|your) graveyard$|^exile all graveyards$/, (m, ctx) => {
  if (!m[1]) return [{ k: 'ext', name: 'exileGy', who: { t: 'all' } }];
  const w = m[1].replace(/'s$/, '');
  const who = w === 'your' ? { t: 'you' } : w === 'each player' ? { t: 'all' } : w === 'that player' ? { t: 'triggerPlayer' } : parsePlayerSubject(w, ctx);
  return who ? [{ k: 'ext', name: 'exileGy', who }] : null;
}]);
EXT.effects.exileGy = ({ s, item, e, you, api }) => {
  const ps: number[] = e.who.t === 'all' ? [0, 1] : api.subjPlayers(s, item, e.who);
  for (const p of ps) {
    const g = [...api.P(s, p).graveyard] as string[];
    for (const c of g) api.moveCard(s, c, 'exile');
    if (g.length) api.log(s, `${api.pname(s, p)}'s graveyard (${g.length} card${g.length > 1 ? 's' : ''}) is exiled.`, you);
  }
  return 'done';
};
