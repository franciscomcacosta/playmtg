// Plugin: more staples — Mutavault, Hall of Storm Giants, Fatal Push, Cut Down, Prismatic Strands …
import { EXT } from '../ext';
import { sourcesWith } from '../rules';
import { parseCond, parseSentence, parseSubject, spec } from '../oracle';

// "~ becomes a 2/2 creature with all creature types until end of turn" / "… a 7/7 blue Giant creature with ward {3} …"
EXT.rules.push([/^(.+?) becomes (an? \d+\/\d+ .*?creature) with (all creature types|ward \{\d+\}|all creature types and [a-z ]+)( until end of turn)?$/, (m, ctx) => {
  const n = ctx.specs.length;
  const out = parseSentence(`${m[1]} becomes ${m[2]}${m[4] ?? ''}`, ctx);
  if (!out || out.length !== 1 || (out[0] as any).k !== 'animate') { ctx.specs.length = n; return null; }
  const kws = m[3] === 'all creature types' ? ['changeling'] : [m[3]];
  return [{ ...(out[0] as any), kw: [...(out[0] as any).kw, ...kws] }];
}]);
// "If you control two or more other lands, ~ enters tapped."
EXT.lines.push((line, pc) => {
  const m = line.match(/^if (.+?), ~ enters tapped$/);
  if (!m) return false;
  const c = parseCond(m[1]);
  if (!c) return false;
  pc.entersTappedIf = c;
  return true;
});
// "Destroy target creature if it has mana value 2 or less." (Fatal Push)
EXT.rules.push([/^destroy (target creature|that creature|it) if it has mana value (\d+) or less$/, (m, ctx) => {
  const what = m[1] === 'target creature' ? parseSubject(m[1], ctx) : ctx.last;
  return what ? [{ k: 'ext', name: 'destroyIfMv', what, max: +m[2] }] : null;
}]);
EXT.effects.destroyIfMv = ({ s, item, e, api }) => {
  for (const c of api.subjCards(s, item, e.what)) if (s.cards[c]?.zone === 'battlefield' && (s.defs[s.cards[c].defId].cmc ?? 0) <= e.max) api.destroy(s, c);
  return 'done';
};
// "Destroy target creature with total power and toughness 5 or less." (Cut Down)
EXT.rules.push([/^(destroy|exile) target creature with total power and toughness (\d+) or less$/, (m, ctx) => {
  ctx.specs.push(spec({ types: ['creature'], ptSumMax: +m[2] } as any, 1, false, `target creature with total power and toughness ${m[2]} or less`, null));
  const what = { t: 'target', spec: ctx.specs.length - 1 };
  ctx.last = what;
  return [{ k: m[1] === 'destroy' ? 'destroy' : 'exile', what } as any];
}]);

// "Creature spells you cast of the chosen type cost {1} less to cast." (Herald's Horn, Urza's Incubator-style)
EXT.lines.push((line, pc) => {
  const m = line.match(/^(creature |)spells (you cast|you cast of the chosen type) (?:of the chosen type )?cost \{(\d+)\} less to cast$/) ?? line.match(/^(creature )?spells you cast of the chosen type cost \{(\d+)\} less to cast$/);
  const all = line.match(/^(creature )?spells of the chosen type cost \{(\d+)\} less to cast$/);
  if ((!m && !all) || !/chosen type/.test(line)) return false;
  pc.chosenTypeDiscount = { n: +(line.match(/\{(\d+)\}/)![1]), creature: /^creature /.test(line), all: !!all };
  return true;
});
EXT.hooks.costMod.push((s, p, iid, cost, _alt, api) => {
  if (!cost) return cost;
  let off = 0;
  for (const b of sourcesWith(s, 'chosenTypeDiscount')) {
    const d = (api.chars(s, b).pc as any).chosenTypeDiscount;
    if (s.cards[b].controller !== p && !d?.all) continue;
    const ct = (s.cards[b] as any).chosenType;
    if (!d || !ct) continue;
    const ch = api.chars(s, iid);
    if (d.creature && !ch.types.has('creature')) continue;
    if (ch.subtypes.has(ct) || ch.keywords.has('changeling')) off += d.n;
  }
  if (!off) return cost;
  const g = +(cost.match(/\{(\d+)\}/)?.[1] ?? 0);
  const left = Math.max(0, g - off);
  return (left ? `{${left}}` : '') + cost.replace(/\{\d+\}/g, '');
});

// "Creature spells you control can't be countered." / "Spells you control can't be countered."
EXT.lines.push((line, pc) => {
  const m = line.match(/^(creature |green |noncreature |instant and sorcery )?spells you control can't be countered$/);
  if (!m) return false;
  pc.uncounterFor = m[1] === 'creature ' ? { types: ['creature'] } : m[1] === 'green ' ? { colors: ['G'] } : m[1] === 'noncreature ' ? { notTypes: ['creature'] } : m[1] ? { types: ['instant', 'sorcery'] } : {};
  return true;
});

// Exhume: "Each player puts a creature card from their graveyard onto the battlefield."
EXT.rules.push([/^each player puts a (creature|permanent|artifact|enchantment) card from their graveyard onto the battlefield$/, (m) => [{ k: 'ext', name: 'eachFromGy', type: m[1] }]]);
EXT.effects.eachFromGy = ({ s, item, e, r, you, api }) => {
  const order = [you, 1 - you];
  r.sub ??= { i: 0, picks: {} as Record<number, string> };
  if (r.sub.answer !== undefined) { const c = r.sub.answer[0]; if (c) r.sub.picks[order[r.sub.i]] = c; r.sub.answer = undefined; r.sub.i++; }
  const ok = (c: string) => { const tl = s.defs[s.cards[c].defId].typeLine.split(' // ')[0].toLowerCase(); return e.type === 'permanent' ? /artifact|creature|enchantment|land|planeswalker|battle/.test(tl) : tl.includes(e.type); };
  while (r.sub.i < order.length) {
    const p = order[r.sub.i];
    const cands = s.players[p].graveyard.filter(ok);
    if (cands.length) {
      api.pushPrompt(s, { id: api.uid(s, 'p'), player: p, kind: 'chooseCards', title: `${item.label}: choose a ${e.type} card to return`, cards: cands, min: 1, max: 1, data: { ctx: 'resolve' } });
      return 'wait';
    }
    r.sub.i++;
  }
  for (const [p, c] of Object.entries(r.sub.picks)) if (s.cards[c as string]?.zone === 'graveyard') api.moveCard(s, c as string, 'battlefield', { controller: +p });
  return 'done';
};

// "You lose life equal to that permanent's mana value." (Feed the Swarm)
EXT.rules.push([/^you lose life equal to (?:that permanent's|its|that creature's|that card's) mana value$/, (_m, ctx) => (ctx.last ? [{ k: 'ext', name: 'loseMvOf', what: ctx.last }] : null)]);
EXT.effects.loseMvOf = ({ s, item, e, you, api }) => {
  const c = api.subjCards(s, item, e.what)[0] ?? (item.targets.flat().find((t: any) => t.kind === 'card') as any)?.iid;
  if (c && s.cards[c]) api.loseLife(s, you, s.defs[s.cards[c].defId].cmc ?? 0);
  return 'done';
};

// "You draw X cards and lose X life, where X is …" (Painful Truths)
EXT.rules.push([/^you draw x cards and (?:you )?lose x life, where x is (.+)$/, (m, ctx) => {
  const out = parseSentence(`you draw x cards, where x is ${m[1]}`, ctx);
  const out2 = parseSentence(`you lose x life, where x is ${m[1]}`, ctx);
  return out && out2 && ![...out, ...out2].some((e: any) => e.k === 'manual') ? [...out, ...out2] : null;
}]);

// Nykthos: "Add an amount of mana of that color equal to your devotion to that color."  (after "choose a color")
EXT.rules.push([/^add an amount of mana of that color equal to your devotion to that color$/, () => [{ k: 'ext', name: 'devotionMana' }]]);
EXT.effects.devotionMana = ({ s, item, r, you, api }) => {
  let col: string | undefined = (s.cards[item.source] as any)?.chosenColor ?? r.sub?.answer;
  if (!col) {
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'color', title: 'Choose a color', options: ['W', 'U', 'B', 'R', 'G'].map((c) => ({ id: c, label: c })), data: { ctx: 'resolve' } });
    return 'wait';
  }
  const n = api.amount(s, item, { ext: 'devotion', colors: [col] });
  (api.P(s, you).pool as any)[col] += n;
  api.log(s, `${api.pname(s, you)} adds ${n} ${col}.`, you);
  return 'done';
};
EXT.rules.push([/^(?:you )?draw (x|\d+) cards? and (?:you )?lose (x|\d+) life$/, (m) => [
  { k: 'draw', n: m[1] === 'x' ? 'X' : +m[1], who: { t: 'you' } } as any,
  { k: 'lose', n: m[2] === 'x' ? 'X' : +m[2], who: { t: 'you' } } as any,
]]);
