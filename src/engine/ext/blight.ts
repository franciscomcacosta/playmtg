// Plugin: blight (Lorwyn Eclipsed) and "Do this only once each turn."
//  - "Blight N": put N -1/-1 counters on a creature you control. Used as "You may blight N. If you do, …", which the core
//    may / "if you do" machinery handles; with no creature to blight it counts as not done.
//  - "You may … . Do this only once each turn.": marks the preceding optional action; the core 'may' effect enforces it.
import { EXT } from '../ext';

const W: Record<string, number> = { one: 1, two: 2, three: 3 };
EXT.rules.push([/^blight (\d+|one|two|three)$/, (m) => [{ k: 'ext', name: 'blight', n: /^\d+$/.test(m[1]) ? +m[1] : W[m[1]] }]]);
EXT.effects.blight = ({ s, item, e, r, you, api }) => {
  const mine = s.battlefield.filter((b) => s.cards[b].controller === you && api.chars(s, b).types.has('creature'));
  if (!mine.length) { (item as any).didLast = false; return 'done'; }
  if (!r.sub) {
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'chooseCards', title: `Blight ${e.n}: put ${e.n} -1/-1 counter${e.n > 1 ? 's' : ''} on a creature you control`, cards: mine, min: 1, max: 1, data: { ctx: 'resolve', cost: 'blight' } });
    return 'wait';
  }
  const c = (r.sub.answer ?? [])[0];
  if (!c || !s.cards[c]) { (item as any).didLast = false; return 'done'; }
  api.addCounters(s, c, '-1/-1', e.n);
  api.log(s, `${api.pname(s, you)} blights ${e.n} on ${api.nm(s, c)}.`, you);
  return 'done';
};

EXT.seqs.push((sents, i, _ctx, ab) => {
  if (sents[i] !== 'do this only once each turn') return null;
  const last = [...ab.effects].reverse().find((e: any) => e.k === 'may');
  if (!last) return null;
  last.once = true;
  return 0;
});
