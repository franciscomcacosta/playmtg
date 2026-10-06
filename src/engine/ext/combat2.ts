// Plugin: more combat and cost shapes.
//  - "~ can't block and can't be blocked."
//  - "Target creature must be blocked this turn if able." (one blocker that can block it must)
//  - "~ becomes the color of your choice until end of turn."
//  - "Remove a +1/+1 counter from it at end of combat." (Clockwork creatures; done at end of combat)
//  - "Sacrifice it unless you pay {1}." / "Sacrifice ~ unless you pay {2}{U}."
//  - "Put any number of target creature cards from your graveyard on top of your library."
import { EXT } from '../ext';
import { parseSubject, spec, looseFilter } from '../oracle';

EXT.lines.push((line, pc) => {
  if (line !== "~ can't block and can't be blocked") return false;
  pc.cantBlock = true;
  pc.unblockable = true;
  return true;
});

// ---- must be blocked ----
EXT.rules.push([/^(target creature|~|it) must be blocked this turn if able$/, (m, ctx) => {
  const what = parseSubject(m[1], ctx);
  return what ? [{ k: 'ext', name: 'mustBeBlocked', what }] : null;
}]);
EXT.effects.mustBeBlocked = ({ s, item, e, api }) => {
  for (const c of api.subjCards(s, item, e.what)) if (s.cards[c]) (s.cards[c] as any).mustBeBlockedTurn = s.turn;
  return 'done';
};
EXT.hooks.validateBlocks.push((s, list, api) => {
  for (const a of s.combat?.attackers ?? []) {
    if ((s.cards[a.iid] as any)?.mustBeBlockedTurn !== s.turn || list.some((x) => x.attacker === a.iid)) continue;
    const able = s.battlefield.some((b) => s.cards[b].controller !== s.cards[a.iid].controller && !s.cards[b].tapped && api.canBlock(s, b, a.iid) && !list.some((x) => x.blocker === b));
    if (able) return `${api.nm(s, a.iid)} must be blocked if able`;
  }
  return null;
});

// ---- choose a color ----
EXT.rules.push([/^(~|target creature|it) becomes the color of your choice until end of turn$/, (m, ctx) => {
  const what = parseSubject(m[1], ctx);
  return what ? [{ k: 'ext', name: 'colorChoice', what }] : null;
}]);
EXT.effects.colorChoice = ({ s, item, e, r, you, api }) => {
  if (!r.sub) {
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'color', title: `${item.label}: choose a color`, options: ['W', 'U', 'B', 'R', 'G'].map((c) => ({ id: c, label: c })), data: { ctx: 'resolve' } });
    return 'wait';
  }
  const col = r.sub.answer;
  for (const c of api.subjCards(s, item, e.what)) if (s.cards[c]?.zone === 'battlefield') s.cards[c].mods.push({ colors: [col], until: 'eot', source: item.source, ts: s.ts++ });
  return 'done';
};

// ---- remove a counter at end of combat ----
EXT.rules.push([/^remove an? ([+-]\d\/[+-]\d) counter from (it|~) at end of combat$/, (m, ctx) => [{ k: 'ext', name: 'eocRemove', counter: m[1], what: m[2] === '~' ? { t: 'self' } : ctx.last ?? { t: 'self' } }]]);
EXT.effects.eocRemove = ({ s, item, e, api }) => {
  for (const c of api.subjCards(s, item, e.what)) if (s.cards[c]) (((s.cards[c] as any).eocRemove ??= []) as any[]).push({ turn: s.turn, counter: e.counter });
  return 'done';
};
EXT.hooks.step.push((s, step) => {
  if (step !== 'endCombat') return;
  for (const b of s.battlefield) {
    const c = s.cards[b] as any;
    if (!c.eocRemove?.length) continue;
    for (const x of c.eocRemove) if (x.turn === s.turn && (c.counters[x.counter] ?? 0) > 0) c.counters[x.counter]--;
    c.eocRemove = c.eocRemove.filter((x: any) => x.turn !== s.turn);
  }
});

// ---- sacrifice unless you pay ----
EXT.rules.push([/^sacrifice (it|~) unless you pay ((?:\{[^}]+\})+)$/, (m) => [{ k: 'ext', name: 'sacUnlessPay', cost: m[2].toUpperCase() }]]);
EXT.effects.sacUnlessPay = ({ s, item, e, r, you, api }) => {
  const c = s.cards[item.source];
  if (!c || c.zone !== 'battlefield') return 'done';
  if (!r.sub) {
    r.sub = {};
    if (!api.canAfford(s, you, e.cost)) { api.log(s, `${api.pname(s, you)} can't pay ${e.cost} and sacrifices ${api.nm(s, item.source)}.`, you); api.moveCard(s, item.source, 'graveyard', { cause: 'sacrifice' }); return 'done'; }
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'yesno', title: `${api.nm(s, item.source)}: pay ${e.cost} or sacrifice it`, options: [{ id: 'yes', label: `Pay ${e.cost}` }, { id: 'no', label: 'Sacrifice it' }], data: { ctx: 'resolve' } });
    return 'wait';
  }
  if (r.sub.answered === 'yes' && !api.payMana(s, you, e.cost, 0)) return 'done';
  api.log(s, `${api.pname(s, you)} sacrifices ${api.nm(s, item.source)}.`, you);
  api.moveCard(s, item.source, 'graveyard', { cause: 'sacrifice' });
  return 'done';
};

// ---- graveyard to the top of the library ----
EXT.rules.push([/^put (any number of|target|up to (\w+)) (?:target )?(.+?) cards? from your graveyard on top of your library$/, (m, ctx) => {
  const f = looseFilter(m[3]);
  if (!f) return null;
  const W: Record<string, number> = { one: 1, two: 2, three: 3 };
  const count = m[1] === 'target' ? 1 : m[2] ? W[m[2]] ?? 1 : 20;
  ctx.specs.push(spec({ ...f, zone: 'graveyard', owner: 'you' } as any, count, m[1] !== 'target', `${m[3]} card${count > 1 ? 's' : ''} in your graveyard`));
  return [{ k: 'ext', name: 'gyToTop', spec: ctx.specs.length - 1 }];
}]);
EXT.effects.gyToTop = ({ s, item, e, api }) => {
  for (const t of (item.targets[e.spec] ?? []) as any[]) if (t.kind === 'card' && s.cards[t.iid]?.zone === 'graveyard') api.moveCard(s, t.iid, 'libraryTop');
  return 'done';
};
