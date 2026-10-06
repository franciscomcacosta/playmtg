// Plugin: assorted one-turn and timing effects.
//  - "Target creature attacks this turn if able."
//  - "Look at the top card of target player's library." (Mishra's Bauble, Merfolk Observer, Jace's +2's first half)
//  - "You may cast ~ as though it had flash. If you cast it any time a sorcery couldn't have been cast, the controller
//     of the permanent it becomes sacrifices it at the beginning of the next cleanup step." (Mirage block)
import { EXT } from '../ext';
import { spec, parsePlayerSubject } from '../oracle';
import type { GameState } from '../types';

// ---- attacks this turn if able ----
EXT.rules.push([/^(target creature|target creature an opponent controls|that creature|it) attacks this turn if able$/, (m, ctx) => {
  let what: any;
  if (m[1].startsWith('target')) {
    ctx.specs.push(spec({ types: ['creature'], zone: 'battlefield', ...(/opponent/.test(m[1]) ? { controller: 'opp' } : {}) } as any, 1, false, m[1]));
    what = { t: 'target', spec: ctx.specs.length - 1 };
  } else what = ctx.last ?? { t: 'self' };
  return [{ k: 'ext', name: 'mustAttackTurn', what }];
}]);
EXT.effects.mustAttackTurn = ({ s, item, e, api }) => {
  for (const c of api.subjCards(s, item, e.what)) if (s.cards[c]) (s.cards[c] as any).mustAttackTurn = s.turn;
  return 'done';
};

// ---- peek at the top card of someone's library ----
// ("your library" is left to the dig parser, which knows what to do with the card next)
EXT.rules.push([/^look at the top card of (target player's|target opponent's|each player's|that player's) library$/, (m, ctx) => {
  const w = m[1].replace(/'s$/, '');
  const who = w === 'that player' ? { t: 'triggerPlayer' } : parsePlayerSubject(w, ctx);
  return who ? [{ k: 'ext', name: 'peekTop', who }] : null;
}]);
EXT.effects.peekTop = ({ s, item, e, r, you, api }) => {
  if (r.sub) return 'done';
  const tops = (api.subjPlayers(s, item, e.who) as number[]).map((p) => api.P(s, p).library[0]).filter(Boolean);
  if (!tops.length) return 'done';
  r.sub = {};
  // shown only to the player who looks: a zero-pick card prompt is a private "here it is, OK"
  api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'chooseCards', title: `${item.label}: the top card of the library`, cards: tops, min: 0, max: 0, data: { ctx: 'resolve' } });
  return 'wait';
};

// ---- flash with a sacrifice if cast at instant speed ----
EXT.lines.push((line, pc) => {
  if (!/^you may cast ~ as though it had flash\. if you cast it any time a sorcery couldn't have been cast, the controller of the permanent it becomes sacrifices it at the beginning of the next cleanup step$/.test(line)) return false;
  pc.flashSac = true;
  return true;
});
EXT.hooks.flash.push((s, iid, api) => !!s.cards[iid] && !!api.parsedFor(s, s.cards[iid])?.flashSac);
const sorceryTime = (s: GameState, p: number) => s.active === p && (s.step === 'main1' || s.step === 'main2');
EXT.hooks.pushed.push((s, item, api) => {
  if (item.kind !== 'spell' || !s.cards[item.source] || !api.parsedFor(s, s.cards[item.source])?.flashSac) return;
  // the spell was just put on the stack; a sorcery could only have been cast if the stack was otherwise empty
  const othersOnStack = s.stack.some((x) => x.id !== item.id);
  if (!sorceryTime(s, item.controller) || othersOnStack) (s.cards[item.source] as any).flashSacPending = true;
});
EXT.hooks.afterMove.push((s, iid, _from, to) => {
  const c = s.cards[iid] as any;
  if (!c) return;
  if (to === 'battlefield' && c.flashSacPending) { c.flashSacPending = false; c.sacAtCleanup = true; }
  else if (to !== 'battlefield' && to !== 'stack') { c.sacAtCleanup = false; c.flashSacPending = false; }
});
EXT.hooks.step.push((s, step, api) => {
  if (step !== 'cleanup') return;
  for (const b of [...s.battlefield]) {
    const c = s.cards[b] as any;
    if (!c?.sacAtCleanup) continue;
    c.sacAtCleanup = false;
    api.log(s, `${api.nm(s, b)} is sacrificed (it was cast at instant speed).`, c.controller);
    api.moveCard(s, b, 'graveyard', { cause: 'sacrifice' });
  }
});
