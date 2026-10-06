// Plugin: a batch of short shapes.
//  - "You create a Treasure token." (the "you" form of "create …")
//  - "Discard up to two cards." (you choose how many)
//  - "Noncreature spells cost {1} more to cast." (a static that affects every player)
//  - "That player / target player loses half their life, rounded up."
//  - "~ deals 1 damage to each of two targets." (any target)
//  - "Return it to its owner's hand at the beginning of the next end step." (done at the end step; no stack)
//  - "Target opponent exiles a card from their hand." (they choose)
//  - "You gain life equal to the damage dealt this way."
//  - "Target land becomes an Island until end of turn."
//  - "Target creature can't be regenerated this turn."
import { EXT } from '../ext';
import { sourcesWith } from '../rules';
import { parseSentence, parseSubject, parsePlayerSubject, spec, looseFilter } from '../oracle';
import { parseCost } from '../mana';

const W: Record<string, number> = { a: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };
const nw = (w: string) => (/^\d+$/.test(w) ? +w : W[w]);

EXT.rules.push([/^you create (.+)$/, (m, ctx) => parseSentence(`create ${m[1]}`, ctx)]);

EXT.rules.push([/^discard up to (\w+) cards?$/, (m) => { const n = nw(m[1]); return n ? [{ k: 'ext', name: 'discardUpTo', n }] : null; }]);
EXT.effects.discardUpTo = ({ s, item, e, r, you, api }) => {
  const hand: string[] = api.P(s, you).hand;
  if (!hand.length) return 'done';
  if (!r.sub) {
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'chooseCards', title: `Discard up to ${e.n}`, cards: [...hand], min: 0, max: Math.min(e.n, hand.length), data: { ctx: 'resolve' } });
    return 'wait';
  }
  const picked: string[] = r.sub.answer ?? [];
  for (const h of picked) if (s.cards[h]?.zone === 'hand') api.moveCard(s, h, 'graveyard', { cause: 'discard' });
  (item as any).lastCount = picked.length; // "draw that many cards"
  return 'done';
};

// ---- static cost tax on a card type ----
EXT.lines.push((line, pc) => {
  const m = line.match(/^(noncreature|creature|artifact|instant and sorcery|enchantment) spells cost \{(\d+)\} more to cast$/);
  if (!m) return false;
  (pc.globalTax ??= []).push({ kind: m[1], n: +m[2] });
  return true;
});
EXT.hooks.costMod.push((s, _p, iid, cost, _alt, api) => {
  const tl = s.defs[s.cards[iid].defId].typeLine.toLowerCase();
  let add = 0;
  for (const b of sourcesWith(s, 'globalTax')) for (const t of (api.chars(s, b).pc as any).globalTax ?? []) {
    const isC = /\bcreature\b/.test(tl);
    const hit = t.kind === 'noncreature' ? !isC : t.kind === 'creature' ? isC : t.kind === 'instant and sorcery' ? /\b(instant|sorcery)\b/.test(tl) : new RegExp(`\\b${t.kind}\\b`).test(tl);
    if (hit) add += t.n;
  }
  if (!add) return cost;
  const pc = parseCost(cost || '');
  return `{${pc.generic + add}}` + (cost || '').replace(/\{\d+\}/g, '');
});

// ---- half life ----
EXT.rules.push([/^(that player|target player|target opponent|each opponent|each player|you) loses? half (?:their|your|his or her) life, rounded (up|down)$/, (m, ctx) => {
  const who = m[1] === 'you' ? { t: 'you' } : m[1] === 'that player' ? { t: 'triggerPlayer' } : parsePlayerSubject(m[1], ctx);
  return who ? [{ k: 'ext', name: 'loseHalf', who, up: m[2] === 'up' }] : null;
}]);
EXT.effects.loseHalf = ({ s, item, e, api }) => {
  for (const p of api.subjPlayers(s, item, e.who)) {
    const life = Math.max(0, api.P(s, p).life);
    const n = e.up ? Math.ceil(life / 2) : Math.floor(life / 2);
    if (n > 0) api.loseLife(s, p, n);
  }
  return 'done';
};

// ---- damage to each of N targets (any target) ----
EXT.rules.push([/^(~) deals (\d+) damage to each of (up to )?(one|two|three|four|\d+) targets$/, (m, ctx) => {
  const n = nw(m[4]);
  if (!n) return null;
  ctx.specs.push(spec({ types: ['creature', 'planeswalker', 'battle'] } as any, n, !!m[3], `up to ${n} targets`, 'any'));
  return [{ k: 'damage', n: +m[2], to: [{ t: 'target', spec: ctx.specs.length - 1 }], from: { t: 'self' } }];
}]);

// ---- return at the next end step ----
EXT.rules.push([/^return (it|that creature|the creature|that card|those creatures|them) to (?:its|their) owner's hand at the beginning of the next end step$/, (_m, ctx) => [{ k: 'ext', name: 'endBounce', what: ctx.last ?? { t: 'self' } }]]);
EXT.effects.endBounce = ({ s, item, e, api }) => {
  for (const c of api.subjCards(s, item, e.what)) if (s.cards[c]) (s.cards[c] as any).endBounce = { ts: s.cards[c].ts };
  return 'done';
};
EXT.hooks.step.push((s, step, api) => {
  if (step !== 'end') return;
  for (const b of [...s.battlefield]) {
    const c = s.cards[b] as any;
    if (!c.endBounce) continue;
    const same = c.endBounce.ts === c.ts; // still the same object (it didn't leave and come back)
    c.endBounce = undefined;
    if (!same) continue;
    api.log(s, `${api.nm(s, b)} returns to its owner's hand.`, c.controller);
    api.moveCard(s, b, 'hand');
  }
});

// ---- opponent exiles from hand ----
EXT.rules.push([/^(target opponent|target player|each opponent|that player) exiles (a|one|two) cards? from (?:their|his or her) hand$/, (m, ctx) => {
  const who = m[1] === 'that player' ? { t: 'triggerPlayer' } : parsePlayerSubject(m[1], ctx);
  return who ? [{ k: 'ext', name: 'oppExileHand', who, n: nw(m[2]) }] : null;
}]);
EXT.effects.oppExileHand = ({ s, item, e, r, api }) => {
  const ps: number[] = api.subjPlayers(s, item, e.who);
  const p = ps[r.sub?.pi ?? 0];
  if (p == null) return 'done';
  const hand: string[] = api.P(s, p).hand;
  if (!r.sub || r.sub.asked !== p) {
    const n = Math.min(e.n, hand.length);
    if (!n) { r.sub = { pi: (r.sub?.pi ?? 0) + 1 }; return ps[r.sub.pi] == null ? 'done' : 'wait'; }
    r.sub = { pi: r.sub?.pi ?? 0, asked: p };
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: p, kind: 'chooseCards', title: `Exile ${n} card${n > 1 ? 's' : ''} from your hand`, cards: [...hand], min: n, max: n, data: { ctx: 'resolve' } });
    return 'wait';
  }
  for (const h of r.sub.answer ?? []) if (s.cards[h]?.zone === 'hand') api.moveCard(s, h, 'exile');
  const next = (r.sub.pi ?? 0) + 1;
  if (ps[next] == null) return 'done';
  r.sub = { pi: next };
  return 'wait';
};

EXT.rules.push([/^(?:you )?gain life equal to the damage dealt this way$/, () => [{ k: 'ext', name: 'gainLast' }]]);

// ---- land type change ----
const LAND: Record<string, string> = { plains: 'W', island: 'U', swamp: 'B', mountain: 'R', forest: 'G' };
EXT.rules.push([/^(target land|it|that land|enchanted land) becomes an? (plains|island|swamp|mountain|forest) until end of turn$/, (m, ctx) => {
  const what = parseSubject(m[1], ctx);
  return what ? [{ k: 'ext', name: 'landTypeSet', what, type: m[2] }] : null;
}]);
EXT.effects.landTypeSet = ({ s, item, e, api }) => {
  for (const c of api.subjCards(s, item, e.what)) if (s.cards[c]?.zone === 'battlefield') s.cards[c].mods.push({ setLandType: e.type, landColor: LAND[e.type], until: 'eot', source: item.source, ts: s.ts++ } as any);
  return 'done';
};

// ---- can't be regenerated this turn ----
// "Destroy …. It/They can't be regenerated." is part of that destroy (handled below, not a separate effect)
EXT.seqs.push((sents, i, _ctx, ab) => {
  if (!/^(?:it|they|that creature|those creatures|(?:a|the) (?:creature|permanent|land|artifact)s? destroyed this way|(?:creatures|permanents|lands) destroyed this way) can't be regenerated$/.test(sents[i])) return null;
  const last = ab.effects[ab.effects.length - 1] as any;
  if (!last || last.k !== 'destroy') return null;
  last.noRegen = true;
  return 0;
});
EXT.rules.push([/^(target creature) can't be regenerated this turn$/, (m, ctx) => {
  const what = parseSubject(m[1], ctx);
  return what ? [{ k: 'ext', name: 'noRegen', what }] : null;
}]);
EXT.effects.noRegen = ({ s, item, e, api }) => {
  for (const c of api.subjCards(s, item, e.what)) if (s.cards[c]) { (s.cards[c] as any).cantRegen = true; (s.cards[c] as any).cantRegenTurn = s.turn; }
  return 'done';
};
EXT.hooks.step.push((s, step) => {
  if (step !== 'cleanup') return;
  for (const b of s.battlefield) { const c = s.cards[b] as any; if (c.cantRegenTurn === s.turn) { c.cantRegen = false; c.cantRegenTurn = undefined; } }
});
void looseFilter;
