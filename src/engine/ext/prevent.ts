// Plugin: prevention from a chosen source, life-based cumulative upkeep, "can't attack alone".
//  - "The next time a source of your choice would deal damage to you / any target this turn, prevent that damage."
//    (Circle of Protection-style): the source is chosen as it resolves; one-shot shield for the rest of the turn.
//  - "Cumulative upkeep—Pay N life."
//  - "~ can't attack alone." (enforced in engine.ts declareAttackers and in the AI)
import { EXT } from '../ext';
import { spec } from '../oracle';
import type { GameState, Target } from '../types';

type Shield = { to: Target; source: string; turn: number };
const shields = (s: GameState): Shield[] => ((s as any).srcShields ??= []);

EXT.rules.push([/^the next time a source of your choice would deal damage to (you|any target|target creature|target player) this turn, prevent that damage$/, (m, ctx) => {
  let to: any = { t: 'you' };
  if (m[1] !== 'you') {
    const isPlayer = m[1] === 'target player';
    ctx.specs.push(spec(isPlayer ? ({} as any) : { types: ['creature', 'planeswalker', 'battle'] }, 1, false, m[1], m[1] === 'target creature' ? null : 'any'));
    to = { t: 'target', spec: ctx.specs.length - 1 };
  }
  return [{ k: 'ext', name: 'srcShield', to }];
}]);
EXT.effects.srcShield = ({ s, item, e, r, you, api }) => {
  let target: Target | undefined;
  if (e.to.t === 'you') target = { kind: 'player', idx: you };
  else target = (item.targets[e.to.spec] ?? [])[0] as Target | undefined;
  if (!target) return 'done';
  const sources = [...s.battlefield, ...s.stack.filter((x) => x.kind === 'spell' && x.id !== item.id).map((x) => x.source)].filter((c, i, a) => s.cards[c] && a.indexOf(c) === i && c !== item.source);
  if (!sources.length) return 'done';
  if (!r.sub) {
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'chooseCards', title: `${item.label}: choose a source — its next damage this turn is prevented`, cards: sources, min: 1, max: 1, data: { ctx: 'resolve' } });
    return 'wait';
  }
  const src = (r.sub.answer ?? [])[0];
  if (src) { shields(s).push({ to: target, source: src, turn: s.turn }); api.log(s, `The next damage ${api.nm(s, src)} would deal this turn will be prevented.`, you); }
  return 'done';
};
EXT.hooks.damage.push((s, source, to, n, _combat, api) => {
  if (n <= 0) return n;
  const list = shields(s);
  const i = list.findIndex((x) => x.turn === s.turn && x.source === source && JSON.stringify(x.to) === JSON.stringify(to));
  if (i < 0) return n;
  list.splice(i, 1);
  api.log(s, `${n} damage from ${api.nm(s, source)} is prevented.`);
  return 0;
});

// ---- cumulative upkeep: pay life ----
EXT.lines.push((line, pc) => {
  const m = line.match(/^cumulative upkeep—pay (\d+) life$/);
  if (!m) return false;
  pc.keywords.push('cumulative upkeep');
  pc.triggers.push({ event: 'upkeep', text: line, ability: { text: line, effects: [{ k: 'ext', name: 'cuLife', n: +m[1] }], specs: [], manual: [] } });
  return true;
});
EXT.effects.cuLife = ({ s, item, e, r, you, api }) => {
  const c = s.cards[item.source];
  if (!c || c.zone !== 'battlefield') return 'done';
  if (!r.sub) {
    api.addCounters(s, item.source, 'age', 1, true);
    const total = e.n * (c.counters.age ?? 1);
    r.sub = { total };
    if (api.P(s, you).life < total) {
      api.log(s, `${api.pname(s, you)} can't pay ${total} life and sacrifices ${api.nm(s, item.source)}.`, you);
      api.moveCard(s, item.source, 'graveyard', { cause: 'sacrifice' });
      return 'done';
    }
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'yesno', title: `${api.nm(s, item.source)}: pay ${total} life or sacrifice it`, options: [{ id: 'yes', label: `Pay ${total} life` }, { id: 'no', label: 'Sacrifice it' }], data: { ctx: 'resolve' } });
    const keep = r.sub; void keep;
    return 'wait';
  }
  if (r.sub.answered === 'yes') api.loseLife(s, you, r.sub.total);
  else { api.log(s, `${api.pname(s, you)} sacrifices ${api.nm(s, item.source)}.`, you); api.moveCard(s, item.source, 'graveyard', { cause: 'sacrifice' }); }
  return 'done';
};

EXT.lines.push((line, pc) => {
  if (line !== "~ can't attack alone") return false;
  pc.cantAttackAlone = true;
  return true;
});
