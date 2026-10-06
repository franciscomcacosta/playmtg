// Plugin: gift (702.174). "Gift a card / a Food / a Treasure / a tapped Fish / an Octopus / an extra turn"
//  You may promise an opponent a gift as you cast the spell. Instants and sorceries give it before their other effects;
//  permanents give it as they enter. "If the gift was promised, …" / "if the gift wasn't promised, …"
import { EXT } from '../ext';
import { PREDEFINED_TOKENS } from '../oracle';

const KINDS = ['a card', 'a food', 'a treasure', 'a tapped fish', 'an octopus', 'an extra turn'];
EXT.lines.push((line, pc) => {
  const m = line.match(/^gift (a card|a food|a treasure|a tapped fish|an octopus|an extra turn)$/);
  if (!m || !KINDS.includes(m[1])) return false;
  pc.gift = m[1];
  return true;
});
EXT.post.push((pc, info) => {
  if (!pc.gift) return;
  const eff = { k: 'ext', name: 'giveGift' };
  if (info.isSpell && pc.spell) pc.spell.effects.unshift(eff);
  else pc.triggers.push({ event: 'etb', text: 'Gift', ability: { text: 'gift', effects: [eff], specs: [], manual: [] } });
});
EXT.hooks.castCosts.push((s, pc, api) => {
  if (pc.kind !== 'spell' || pc.extGift !== undefined) return false;
  const f = api.parsedFor(s, s.cards[pc.iid]) as any;
  if (!f?.gift) return false;
  api.pushPrompt(s, { id: api.uid(s, 'p'), player: pc.player, kind: 'chooseCards', title: `${pc.label}: promise your opponent a gift (${f.gift.replace(/^an? /, '')})? Choose this card to promise, or nothing`, cards: [pc.iid], min: 0, max: 1, canCancel: true, data: { ctx: 'cast', cost: 'extGift' } });
  return true;
});
EXT.hooks.castPay.push((s, pc) => {
  if (pc.kind !== 'spell') return;
  const c = s.cards[pc.iid] as any;
  if (!c) return;
  c.giftPromised = Array.isArray(pc.extGift) && pc.extGift.length > 0;
  c.giftDone = false;
});
EXT.effects.giveGift = ({ s, item, api }) => {
  const c = s.cards[item.source] as any;
  if (!c?.giftPromised || c.giftDone) return 'done';
  c.giftDone = true;
  const to = 1 - item.controller;
  const g = (api.parsedFor(s, c) as any).gift as string;
  api.log(s, `${api.pname(s, to)} receives the gift (${g.replace(/^an? /, '')}).`, to);
  if (g === 'a card') api.drawCards(s, to, 1);
  else if (g === 'a food') api.createToken(s, to, { ...PREDEFINED_TOKENS.food, oracle: PREDEFINED_TOKENS.food.oracle } as any);
  else if (g === 'a treasure') api.createToken(s, to, { ...PREDEFINED_TOKENS.treasure } as any);
  else if (g === 'a tapped fish') api.createToken(s, to, { name: 'Fish', power: '1', toughness: '1', colors: ['U'], types: 'Token Creature — Fish', keywords: [], oracle: '' }, true);
  else if (g === 'an octopus') api.createToken(s, to, { name: 'Octopus', power: '8', toughness: '8', colors: ['U'], types: 'Token Creature — Octopus', keywords: [], oracle: '' });
  else if (g === 'an extra turn') ((s as any).extraTurns ??= []).push(to);
  return 'done';
};
EXT.conds.push((t) => (/^the gift was promised$/.test(t) ? { k: 'ext', name: 'castFlag', flag: 'giftPromised' } : /^the gift wasn't promised$/.test(t) ? { k: 'ext', name: 'giftNot' } : null));
EXT.condEval.giftNot = (s, _c, _you, self) => !(self && (s.cards[self] as any)?.giftPromised);
