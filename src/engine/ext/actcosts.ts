// Plugin: activated-ability costs beyond the core's (Survival of the Fittest, sacrifice outlets, Wirewood Symbiote …)
//  sacrifice another X · exile N X cards from your graveyard · discard a X card · discard a card at random · discard your hand
//  return a X you control to its owner's hand · return ~ to its owner's hand · remove a +1/+1 counter from a creature you control
//  remove a counter from ~ · reveal/exile ~ from your hand · mill a card · exile the top card of your library · sacrifice a token
import { EXT } from '../ext';
import { looseFilter, parseFilter } from '../oracle';

const W: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };
const filt = (ph: string) => {
  const p = ph.replace(/ cards?$/, '').replace(/s$/, '');
  if (p === 'card' || p === '') return {};
  if (p === 'token') return { token: true };
  const f = looseFilter(p) ?? parseFilter(p);
  if (!f) return null;
  const g: any = { ...f };
  delete g.zone; delete g.owner; delete g.controller;
  return g;
};
EXT.costParts.push((p, c) => {
  let m: RegExpMatchArray | null;
  const extra = (x: any) => { (c.extra ??= []).push(x); return true; };
  if ((m = p.match(/^sacrifice (another|a|an|one|two|three) (.+)$/))) {
    const f = filt(m[2].replace(/^or /, '').replace(/ or an /, ' or '));
    if (!f) return false;
    c.sacrifice = { filter: { ...f, zone: 'battlefield', controller: 'you', ...(m[1] === 'another' ? { other: true } : {}), ...(f.types ? {} : { types: ['permanent'] }) }, n: W[m[1]] ?? 1 };
    return true;
  }
  if ((m = p.match(/^exile (a|an|one|two|three|four|five) (.*?)cards? from your graveyard$/))) {
    const f = filt(m[2].trim() || 'card');
    if (!f) return false;
    return extra({ k: 'exileGy', filter: f, n: W[m[1]] });
  }
  if ((m = p.match(/^discard (a|an|two) (.+?) cards?$/)) && m[2] !== 'card') {
    if (m[2].startsWith('another card named')) return false;
    const f = filt(m[2]);
    if (!f) return false;
    return extra({ k: 'discard', filter: f, n: W[m[1]] });
  }
  if (p === 'discard a card at random') return extra({ k: 'discardRandom' });
  if (p === 'discard your hand') return extra({ k: 'discardHand' });
  if ((m = p.match(/^return (a|an|one|two) (.+?) you control to (?:its|their) owner's hand$/))) {
    const f = filt(m[2]);
    if (!f) return false;
    return extra({ k: 'bounce', filter: { ...f, ...(f.types || f.subtypes ? {} : { types: ['permanent'] }) }, n: W[m[1]] });
  }
  if (p === "return ~ to its owner's hand") return extra({ k: 'bounceSelf' });
  if ((m = p.match(/^remove a (?:([+-]\d\/[+-]\d|[a-z]+) )?counter from (?:a|an) (.+?) you control$/))) {
    const f = filt(m[2]);
    if (!f) return false;
    return extra({ k: 'removeFrom', filter: f, counter: m[1] || '*' });
  }
  if ((m = p.match(/^remove (a|one|two|three) counters? from ~$/))) return extra({ k: 'removeSelfAny', n: W[m[1]] });
  if (p === 'reveal ~ from your hand') { c.fromHand = true; return true; }
  if (p === 'exile ~ from your hand') { c.fromHand = true; return extra({ k: 'exileSelfHand' }); }
  if ((m = p.match(/^mill (a|one|two|three) cards?$/))) return extra({ k: 'mill', n: W[m[1]] });
  if (p === 'exile the top card of your library') return extra({ k: 'exileTop' });
  if ((m = p.match(/^tap (another|an|a) untapped (.+?) you control$/))) {
    const f = filt(m[2]);
    if (!f) return false;
    c.tapCreatures = { n: 1, filter: { ...f, ...(m[1] === 'another' ? { other: true } : {}) } };
    return true;
  }
  if ((m = p.match(/^exile (a|an) (.+?) you control$/))) {
    const f = filt(m[2]);
    if (!f) return false;
    return extra({ k: 'bounce', filter: { ...f }, n: 1, exile: true });
  }
  if ((m = p.match(/^exile (a|an|two) (.*?)cards? from your hand$/))) {
    const f = filt(m[2].trim() || 'card');
    if (!f) return false;
    return extra({ k: 'discard', filter: f, n: W[m[1]], exile: true });
  }
  return false;
});

// mana abilities don't go through the activation pipeline: keep those honest (manual)
EXT.post.push((pc) => {
  for (const a of pc.activated ?? []) if (a.isMana && a.cost?.extra?.length) a.cost.other = (a.cost.other ? a.cost.other + ', ' : '') + 'extra cost';
});

const pool = (s: any, p: number, src: string, x: any, api: any): string[] => {
  switch (x.k) {
    case 'exileGy': return s.players[p].graveyard.filter((g: string) => g !== src && api.matchesFilter(s, g, { ...x.filter, zone: 'graveyard' }, p, src));
    case 'discard': return s.players[p].hand.filter((h: string) => h !== src && api.matchesFilter(s, h, { ...x.filter, zone: 'hand' }, p, src));
    case 'bounce': return s.battlefield.filter((b: string) => s.cards[b].controller === p && api.matchesFilter(s, b, { ...x.filter, zone: 'battlefield' }, p, src));
    case 'removeFrom': return s.battlefield.filter((b: string) => s.cards[b].controller === p && api.matchesFilter(s, b, { ...x.filter, zone: 'battlefield' }, p, src) && (x.counter === '*' ? Object.values(s.cards[b].counters).some((v: any) => v > 0) : (s.cards[b].counters[x.counter] ?? 0) > 0));
    default: return [];
  }
};
const feasible = (s: any, p: number, src: string, x: any, api: any) => {
  switch (x.k) {
    case 'exileGy': case 'discard': case 'bounce': return pool(s, p, src, x, api).length >= x.n;
    case 'removeFrom': return pool(s, p, src, x, api).length >= 1;
    case 'discardRandom': return s.players[p].hand.filter((h: string) => h !== src).length >= 1;
    case 'removeSelfAny': return Object.values(s.cards[src]?.counters ?? {}).reduce((t: number, v: any) => t + Math.max(0, v), 0) >= x.n;
    case 'mill': case 'exileTop': return s.players[p].library.length >= (x.n ?? 1);
    default: return true;
  }
};
EXT.hooks.canActivate.push((s, p, iid, a, api) => {
  for (const x of a.cost?.extra ?? []) if (!feasible(s, p, iid, x, api)) return false;
  return undefined;
});
EXT.hooks.castCosts.push((s, pc, api) => {
  if (pc.kind !== 'ability') return false;
  const a = api.chars(s, pc.iid).pc.activated[pc.abilityIdx] as any;
  const xs: any[] = a?.cost?.extra ?? [];
  pc.extExtra ??= {};
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    if (!['exileGy', 'discard', 'bounce', 'removeFrom'].includes(x.k) || pc.extExtra[i]) continue;
    const key = `extX${i}`;
    if (pc[key]) { pc.extExtra[i] = pc[key]; continue; }
    const n = x.k === 'removeFrom' ? 1 : x.n;
    const verb = x.k === 'exileGy' ? 'exile from your graveyard' : x.k === 'discard' ? 'discard' : x.k === 'bounce' ? 'return to hand' : 'remove a counter from';
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: pc.player, kind: 'chooseCards', title: `${pc.label}: ${verb} (cost)`, cards: pool(s, pc.player, pc.iid, x, api), min: n, max: n, canCancel: true, data: { ctx: 'cast', cost: key } });
    return true;
  }
  return false;
});
EXT.hooks.castPay.push((s, pc, api) => {
  if (pc.kind !== 'ability') return;
  const a = api.chars(s, pc.iid)?.pc?.activated?.[pc.abilityIdx] as any;
  const xs: any[] = a?.cost?.extra ?? [];
  const p = pc.player;
  xs.forEach((x, i) => {
    const picked: string[] = pc.extExtra?.[i] ?? pc[`extX${i}`] ?? [];
    switch (x.k) {
      case 'exileGy': for (const c of picked) api.moveCard(s, c, 'exile'); break;
      case 'discard': for (const c of picked) x.exile ? api.moveCard(s, c, 'exile') : api.moveCard(s, c, 'graveyard', { cause: 'discard' }); break;
      case 'bounce': for (const c of picked) api.moveCard(s, c, x.exile ? 'exile' : 'hand'); break;
      case 'removeFrom': for (const c of picked) { const k = x.counter === '*' ? Object.keys(s.cards[c].counters).find((q) => s.cards[c].counters[q] > 0) : x.counter; if (k) s.cards[c].counters[k]--; } break;
      case 'discardRandom': { const h = s.players[p].hand.filter((q: string) => q !== pc.iid); if (h.length) api.moveCard(s, h[Math.floor(api.rand(s) * h.length)], 'graveyard', { cause: 'discard' }); break; }
      case 'discardHand': for (const c of [...s.players[p].hand]) api.moveCard(s, c, 'graveyard', { cause: 'discard' }); break;
      case 'bounceSelf': if (s.cards[pc.iid]?.zone === 'battlefield') { pc.lkiName = api.nm(s, pc.iid); api.moveCard(s, pc.iid, 'hand'); } break;
      case 'removeSelfAny': { let n = x.n; const cs = s.cards[pc.iid].counters; for (const k of Object.keys(cs)) while (n > 0 && cs[k] > 0) { cs[k]--; n--; } break; }
      case 'exileSelfHand': if (s.cards[pc.iid]?.zone === 'hand') api.moveCard(s, pc.iid, 'exile'); break;
      case 'mill': for (let k = 0; k < x.n; k++) { const t = s.players[p].library[0]; if (t) api.moveCard(s, t, 'graveyard'); } break;
      case 'exileTop': { const t = s.players[p].library[0]; if (t) api.moveCard(s, t, 'exile'); break; }
    }
  });
});
