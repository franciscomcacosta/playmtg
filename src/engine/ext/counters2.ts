// Plugin: doubling counters, changing a spell's target, and returning a creature at end of combat.
//  - "Double the number of +1/+1 counters on ~ / it / target creature / each creature you control."
//    "Double the number of each kind of counter on target permanent." (adding counters, so Hardened Scales etc. apply)
//  - "Change the target of target spell (or ability) with a single target." — the new target is chosen as it resolves
//  - "Return that creature to its owner's hand at end of combat."
//    APPROXIMATION: done as a step action at end of combat rather than a delayed trigger on the stack.
import { EXT } from '../ext';
import { parseSubject, spec } from '../oracle';

EXT.rules.push([/^double the number of (each kind of|[+-]\d\/[+-]\d|[a-z]+) counters? on (.+)$/, (m, ctx) => {
  const what = parseSubject(m[2], ctx);
  return what ? [{ k: 'ext', name: 'doubleCounters', what, counter: m[1] === 'each kind of' ? '*' : m[1] }] : null;
}]);
EXT.effects.doubleCounters = ({ s, item, e, api }) => {
  for (const c of api.subjCards(s, item, e.what)) {
    const card = s.cards[c];
    if (!card || card.zone !== 'battlefield') continue;
    const kinds = e.counter === '*' ? Object.keys(card.counters).filter((k) => (card.counters[k] ?? 0) > 0) : [e.counter];
    for (const k of kinds) { const n = card.counters[k] ?? 0; if (n > 0) api.addCounters(s, c, k, n); }
  }
  return 'done';
};

// ---- change the target ----
EXT.rules.push([/^(?:you may )?change the target of target (spell|spell or ability|instant or sorcery spell|activated or triggered ability) with a single target$/, (m, ctx) => {
  const kinds = m[1] === 'spell' || m[1] === 'instant or sorcery spell' ? ['spell'] : m[1] === 'spell or ability' ? ['spell', 'ability', 'trigger'] : ['ability', 'trigger'];
  ctx.specs.push(spec({ zone: 'stack', stackKinds: kinds, ...(m[1].startsWith('instant') ? { srcTypes: ['instant', 'sorcery'] } : {}) } as any, 1, false, `target ${m[1]} with a single target`));
  return [{ k: 'ext', name: 'retarget', spec: ctx.specs.length - 1 }];
}]);
EXT.effects.retarget = ({ s, item, e, r, you, api }) => {
  const t = (item.targets[e.spec] ?? [])[0] as any;
  const it = t?.kind === 'stack' ? s.stack.find((x) => x.id === t.id) : undefined;
  if (!it) return 'done';
  const all = (it.targets ?? []).flat();
  if (all.length !== 1) { api.log(s, `${it.label} doesn't have a single target.`, you); return 'done'; }
  const specs = ((it as any).specs ?? []) as any[];
  const si = it.targets.findIndex((g: any[]) => g?.length);
  if (si < 0 || !specs[si]) return 'done';
  if (!r.sub) {
    const cur = JSON.stringify(all[0]);
    const legal = api.legalTargets(s, specs[si], it.controller, it.source).filter((x: any) => JSON.stringify(x) !== cur && !(x.kind === 'stack' && x.id === it.id));
    if (!legal.length) return 'done';
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'targets', title: `Choose a new target for ${it.label}`, targets: legal, min: 1, max: 1, canCancel: false, data: { ctx: 'resolve' } });
    return 'wait';
  }
  const nt = (r.sub.answer ?? [])[0];
  if (nt) { it.targets[si] = [nt]; api.log(s, `${it.label} now targets something else.`, you); }
  return 'done';
};

// ---- return at end of combat ----
EXT.rules.push([/^return (that creature|it|those creatures|the token) to (?:its|their) owner's hand at end of combat$/, (_m, ctx) => [{ k: 'ext', name: 'eocBounce', what: ctx.last ?? { t: 'self' } }]]);
EXT.effects.eocBounce = ({ s, item, e, api }) => {
  for (const c of api.subjCards(s, item, e.what)) if (s.cards[c]) (s.cards[c] as any).eocBounce = s.turn;
  return 'done';
};
EXT.hooks.step.push((s, step, api) => {
  if (step !== 'endCombat') return;
  for (const b of [...s.battlefield]) {
    const c = s.cards[b] as any;
    if (c?.eocBounce !== s.turn) continue;
    c.eocBounce = undefined;
    api.log(s, `${api.nm(s, b)} returns to its owner's hand.`, c.controller);
    api.moveCard(s, b, 'hand');
  }
});
