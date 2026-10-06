// Plugin: assorted one-liners.
//  - "You have no maximum hand size for the rest of the game."
//  - "~ can block an additional creature this turn."
//  - "Goad target creature." (it attacks each combat until your next turn; in a 2-player game that means attacking you)
//  - "~ phases out." / "Target creature phases out." (it phases back in during its controller's next untap step)
//  - "Draw a card for each +1/+1 counter on it / target creature."
//  - "Its controller discards a card." (the controller of the object just referred to)
import { EXT } from '../ext';
import { parseSubject } from '../oracle';
import type { PlayerIdx } from '../types';

const W: Record<string, number> = { a: 1, one: 1, two: 2, three: 3 };

EXT.rules.push([/^you have no maximum hand size for the rest of the game$/, () => [{ k: 'ext', name: 'noMaxHandGame' }]]);
EXT.effects.noMaxHandGame = ({ s, you, api }) => { (api.P(s, you) as any).noMaxHandGame = true; return 'done'; };

EXT.rules.push([/^(~|target creature|it|that creature) can block an additional creature this turn$/, (m, ctx) => {
  const what = parseSubject(m[1], ctx);
  return what ? [{ k: 'ext', name: 'extraBlock', what }] : null;
}]);
EXT.effects.extraBlock = ({ s, item, e, api }) => {
  for (const c of api.subjCards(s, item, e.what)) if (s.cards[c]) (s.cards[c] as any).extraBlockTurn = s.turn;
  return 'done';
};
EXT.hooks.maxBlocks.push((s, blocker) => ((s.cards[blocker] as any)?.extraBlockTurn === s.turn ? 2 : undefined));

EXT.rules.push([/^goad (target creature(?: an opponent controls| defending player controls)?|it|that creature|each creature (?:your opponents control|target player controls))$/, (m, ctx) => {
  const what = parseSubject(m[1], ctx);
  return what ? [{ k: 'ext', name: 'goad', what }] : null;
}]);
EXT.effects.goad = ({ s, item, e, you, api }) => {
  // until your next turn: if it's your turn now, that's two turns from now; otherwise the next turn
  const until = s.active === you ? s.turn + 2 : s.turn + 1;
  for (const c of api.subjCards(s, item, e.what)) if (s.cards[c]?.zone === 'battlefield') { (s.cards[c] as any).goadUntil = until; (s.cards[c] as any).goadedBy = you; }
  return 'done';
};

EXT.rules.push([/^(~|target creature(?: you control)?|target permanent(?: you control)?|target nonland permanent(?: you control)?|another target (?:creature|permanent) you control|it|that creature|that permanent) phases out$/, (m, ctx) => {
  const what = m[1] === '~' ? { t: 'self' } : parseSubject(m[1], ctx);
  return what ? [{ k: 'ext', name: 'phaseOut', what }] : null;
}]);
EXT.effects.phaseOut = ({ s, item, e, api }) => {
  for (const c of api.subjCards(s, item, e.what)) {
    const card = s.cards[c];
    if (!card || card.zone !== 'battlefield' || card.phasedOut) continue;
    card.phasedOut = true;
    // things attached to it phase out with it (indirectly)
    for (const b of s.battlefield) if (s.cards[b]?.attachedTo === c) s.cards[b].phasedOut = true;
    api.log(s, `${api.nm(s, c)} phases out.`, card.controller);
  }
  return 'done';
};
EXT.hooks.step.push((s, step, api) => {
  if (step !== 'untap') return;
  for (const b of s.battlefield) {
    const c = s.cards[b];
    if (!c.phasedOut || c.controller !== s.active || (c as any).phasedOutTurn === s.turn) continue;
    c.phasedOut = false;
    api.log(s, `${api.nm(s, b)} phases in.`, c.controller);
  }
});

EXT.rules.push([/^draw a card for each ([+-]\d\/[+-]\d|[a-z]+) counter on (.+)$/, (m, ctx) => {
  const what = parseSubject(m[2], ctx);
  return what ? [{ k: 'ext', name: 'drawPerCounter', what, counter: m[1] }] : null;
}]);
EXT.effects.drawPerCounter = ({ s, item, e, you, api }) => {
  const c = api.subjCards(s, item, e.what)[0];
  const n = c && s.cards[c] ? s.cards[c].counters[e.counter] ?? (item as any).lkiCounters?.[e.counter] ?? 0 : (item as any).lkiCounters?.[e.counter] ?? 0;
  if (n > 0) api.drawCards(s, you, n);
  return 'done';
};

EXT.rules.push([/^its controller discards (a|one|two|three) cards?$/, (m, ctx) => [{ k: 'ext', name: 'ctrlDiscard', what: ctx.last ?? { t: 'target', spec: 0 }, n: W[m[1]] }]]);
EXT.effects.ctrlDiscard = ({ s, item, e, r, api }) => {
  const c = api.subjCards(s, item, e.what)[0] ?? ((item.targets ?? []).flat().find((t: any) => t?.kind === 'card') as any)?.iid;
  if (!c || !s.cards[c]) return 'done';
  const p: PlayerIdx = s.cards[c].zone === 'battlefield' ? s.cards[c].controller : s.cards[c].owner;
  const hand: string[] = api.P(s, p).hand;
  if (!hand.length) return 'done';
  if (!r.sub) {
    const n = Math.min(e.n, hand.length);
    if (n >= hand.length) { r.sub = { answer: [...hand] }; }
    else {
      r.sub = {};
      api.pushPrompt(s, { id: api.uid(s, 'p'), player: p, kind: 'chooseCards', title: `Discard ${n} card${n > 1 ? 's' : ''}`, cards: [...hand], min: n, max: n, data: { ctx: 'resolve' } });
      return 'wait';
    }
  }
  for (const h of r.sub.answer ?? []) if (s.cards[h]?.zone === 'hand') { api.log(s, `${api.pname(s, p)} discards ${api.nm(s, h)}.`, p); api.moveCard(s, h, 'graveyard', { cause: 'discard' }); }
  return 'done';
};
