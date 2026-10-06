// Plugin: coven, "gets +N/+N and can't block" statics, and exiling a chosen card from your graveyard.
//  - Condition: "you control three or more creatures with different powers" (coven)
//  - "As long as there are seven or more cards in your graveyard, ~ gets +2/+2 and can't block." (threshold-style)
//  - "(You may) exile an instant or sorcery card from your graveyard. (If you do, …)" — not done if there's none
import { EXT } from '../ext';
import { parseCond, looseFilter } from '../oracle';
import { chars } from '../rules';

const W: Record<string, number> = { two: 2, three: 3, four: 4, five: 5 };
EXT.conds.push((text) => {
  const m = text.match(/^you control (\w+) or more creatures with different powers$/);
  const n = m ? (/^\d+$/.test(m[1]) ? +m[1] : W[m[1]]) : undefined;
  return n ? { k: 'ext', name: 'coven', n } : null;
});
EXT.condEval.coven = (s, cond, you) => {
  const powers = new Set(s.battlefield.filter((b) => s.cards[b].controller === you && chars(s, b).types.has('creature')).map((b) => chars(s, b).power));
  return powers.size >= cond.n;
};

EXT.lines.push((line, pc) => {
  const m = line.match(/^(?:as long as (.+?), ~ gets ([+-]\d+)\/([+-]\d+) and can't block|~ gets ([+-]\d+)\/([+-]\d+) and can't block as long as (.+))$/);
  if (!m) return false;
  const cond = parseCond(m[1] ?? m[6]);
  if (!cond) return false;
  pc.statics.push({ kind: 'selfPump', p: +(m[2] ?? m[4]), t: +(m[3] ?? m[5]), kw: [], cond, cantBlock: true } as any);
  return true;
});

EXT.rules.push([/^exile (?:a|an) (.+?) card from your graveyard$/, (m) => {
  const f = m[1] === 'card' ? {} : looseFilter(m[1]);
  return f ? [{ k: 'ext', name: 'exileFromGy', filter: f }] : null;
}]);
EXT.effects.exileFromGy = ({ s, item, e, r, you, api }) => {
  const cands = (api.P(s, you).graveyard as string[]).filter((c) => api.matchesFilter(s, c, { ...e.filter, zone: 'graveyard' }, you));
  if (!cands.length) { (item as any).didLast = false; return 'done'; }
  if (!r.sub) {
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'chooseCards', title: `${item.label}: exile a card from your graveyard`, cards: cands, min: 1, max: 1, data: { ctx: 'resolve' } });
    return 'wait';
  }
  const c = (r.sub.answer ?? [])[0];
  if (c && s.cards[c]?.zone === 'graveyard') api.moveCard(s, c, 'exile');
  else (item as any).didLast = false;
  return 'done';
};
