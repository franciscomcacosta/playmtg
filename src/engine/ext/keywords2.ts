// Plugin: keywords that were recognised but not yet doing anything.
//  storm · split second · rebound · retrace · extort · sunburst · undaunted · phasing
import { EXT } from '../ext';

const kwOf = (s: any, iid: string, api: any): Set<string> => api.chars(s, iid).keywords;
const castsTT = (s: any) => { const d = (s.castTT ??= { turn: -1, n: 0 }); if (d.turn !== s.turn) { d.turn = s.turn; d.n = 0; } return d; };

EXT.hooks.event.push((s, name, d, api) => {
  if (name !== 'cast') return;
  const item = d.item;
  const tt = castsTT(s);
  const before = tt.n;
  tt.n++;
  if (item.kind !== 'spell' || (item as any).isCopy || !s.cards[item.source]) return;
  const kw = kwOf(s, item.source, api);
  // Storm: copy it for each spell cast before it this turn
  if (kw.has('storm') && before > 0) {
    s.pendingTriggers.push({ id: api.uid(s, 's'), kind: 'trigger', controller: item.controller, source: item.source, label: `${api.nm(s, item.source)} — storm (${before})`, text: 'Storm', effects: [{ k: 'copySpell', what: { t: 'triggerObj' }, n: before }], targets: [], triggerObj: item.source } as any);
  }
  // Extort: whenever you cast a spell, you may pay {W/B} for each permanent with extort you control
  for (const b of s.battlefield) {
    if (s.cards[b].controller !== item.controller || !kwOf(s, b, api).has('extort')) continue;
    s.pendingTriggers.push({ id: api.uid(s, 's'), kind: 'trigger', controller: item.controller, source: b, label: `${api.nm(s, b)} — extort`, text: 'Extort', effects: [{ k: 'ext', name: 'extort' }], targets: [] } as any);
  }
});
EXT.effects.extort = ({ s, item, r, you, api }) => {
  if (!r.sub) {
    if (!api.canAfford(s, you, '{W/B}')) return 'done';
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'yesno', title: 'Extort: pay {W/B}?', options: [{ id: 'yes', label: 'Pay {W/B}' }, { id: 'no', label: "Don't" }], data: { ctx: 'resolve' } });
    return 'wait';
  }
  if (r.sub.answered !== 'yes' || api.payMana(s, you, '{W/B}', 0)) return 'done';
  let lost = 0;
  for (const pl of s.players) if (pl.idx !== you) { const before = pl.life; api.loseLife(s, pl.idx, 1); lost += before - pl.life; }
  if (lost) api.gainLife(s, you, lost);
  void item;
  return 'done';
};

// Split second: while it's on the stack, players can't cast spells or activate abilities that aren't mana abilities
const splitSecond = (s: any, api: any) => s.stack.some((x: any) => x.kind === 'spell' && s.cards[x.source] && kwOf(s, x.source, api).has('split second'));
EXT.hooks.castBlock.push((s, _p, _iid, _alt, api) => (splitSecond(s, api) ? 'A spell with split second is on the stack' : null));
EXT.hooks.canActivate.push((s, _p, _iid, a, api) => (!a.isMana && splitSecond(s, api) ? false : undefined));

// Rebound: cast from hand → exile it as it resolves; at your next upkeep you may cast it without paying its mana cost
EXT.hooks.finish.push((s, item, countered, api) => {
  const c = s.cards[item.source] as any;
  if (countered || !c || c.zone !== 'stack' || (item as any).fromZone !== 'hand' || !kwOf(s, item.source, api).has('rebound')) return false;
  c.zone = 'library'; // placeholder so moveCard's removeFromZone is a no-op (as the core does)
  api.moveCard(s, item.source, 'exile');
  c.reboundTurn = s.turn;
  return true;
});
EXT.hooks.step.push((s, step, api) => {
  if (step !== 'upkeep') return;
  for (const pl of s.players) for (const e of [...pl.exile]) {
    const c = s.cards[e] as any;
    if (!c?.reboundTurn || c.owner !== s.active || c.reboundTurn >= s.turn) continue;
    c.reboundTurn = undefined;
    s.pendingTriggers.push({ id: api.uid(s, 's'), kind: 'trigger', controller: c.owner, source: e, label: `${api.nm(s, e)} — rebound`, text: 'Rebound', effects: [{ k: 'ext', name: 'reboundCast' }], targets: [] } as any);
  }
});
EXT.effects.reboundCast = ({ s, item, r, you, api }) => {
  const c = s.cards[item.source];
  if (!c || c.zone !== 'exile') return 'done';
  if (!r.sub) {
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'yesno', title: `Rebound: cast ${api.nm(s, item.source)} without paying its mana cost?`, options: [{ id: 'yes', label: 'Cast it' }, { id: 'no', label: "Don't" }], cards: [item.source], data: { ctx: 'resolve' } });
    return 'wait';
  }
  if (r.sub.answered === 'yes') { const err = api.beginCast(s, you, item.source, 0, 'free'); if (err) api.log(s, `Couldn't cast it: ${err}`, you, 'warn'); }
  return 'done';
};

// Retrace: cast it from your graveyard by discarding a land card in addition to paying its other costs
EXT.hooks.zoneCast.push((s, p, card, _pc, api) => {
  if (card.zone !== 'graveyard' || card.owner !== p || !kwOf(s, card.iid, api).has('retrace')) return null;
  return s.players[p].hand.some((h: string) => /\bLand\b/.test(s.defs[s.cards[h].defId].typeLine)) ? 'ext:retrace' : null;
});
EXT.alts.retrace = {
  begin: (s, _p, iid) => s.defs[s.cards[iid].defId].manaCost || '',
  costs: (s, pc, api) => {
    if (pc.extRetrace) return false;
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: pc.player, kind: 'chooseCards', title: `${pc.label}: retrace — discard a land card`, cards: s.players[pc.player].hand.filter((h: string) => /\bLand\b/.test(s.defs[s.cards[h].defId].typeLine)), min: 1, max: 1, canCancel: true, data: { ctx: 'cast', cost: 'extRetrace' } });
    return true;
  },
  pay: (s, pc, api) => { for (const x of pc.extRetrace ?? []) if (s.cards[x]?.zone === 'hand') api.moveCard(s, x, 'graveyard', { cause: 'discard' }); },
};

// Sunburst: a +1/+1 counter (creature) or charge counter (otherwise) for each color of mana spent to cast it
EXT.post.push((pc, info) => {
  if (!pc.keywords?.includes('sunburst')) return;
  (pc.entersCounters ??= []).push({ counter: /creature/i.test(info.tl) ? '+1/+1' : 'charge', n: 0, perColorSpent: true });
});
// Undaunted: costs {1} less for each opponent you have (one, in a two-player game)
EXT.hooks.costMod.push((s, _p, iid, cost, _alt, api) => {
  if (!cost || !kwOf(s, iid, api).has('undaunted')) return cost;
  const g = +(cost.match(/\{(\d+)\}/)?.[1] ?? 0);
  if (!g) return cost;
  return (g > 1 ? `{${g - 1}}` : '') + cost.replace(/\{\d+\}/g, '');
});
// Phasing: phases in or out before its controller untaps
EXT.hooks.step.unshift((s, step, api) => {
  if (step !== 'untap') return;
  for (const b of s.battlefield) {
    const c = s.cards[b];
    if (c.controller !== s.active || c.phasedOut || !kwOf(s, b, api).has('phasing')) continue;
    c.phasedOut = true;
    (c as any).phasedOutTurn = s.turn; // the phase-in step below leaves it out this time
    api.log(s, `${api.nm(s, b)} phases out.`, c.controller);
  }
});
