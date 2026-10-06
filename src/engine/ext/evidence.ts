// Plugin: optional additional costs that a spell remembers.
//  - "As an additional cost to cast this spell, you may collect evidence N." (exile cards with total mana value N+
//    from your graveyard) → "if evidence was collected, …"
//  - Bargain: "You may sacrifice an artifact, enchantment, or token as you cast this spell." → "if ~ was bargained, …"
import { EXT } from '../ext';
import { looseFilter } from '../oracle';

EXT.lines.push((line, pc) => {
  const m = line.match(/^as an additional cost to cast (?:~|this spell), you may collect evidence (\d+)$/);
  if (!m) return false;
  pc.evidence = +m[1];
  return true;
});
const front = (s: any, iid: string, api: any) => api.parsedFor(s, s.cards[iid]) as any;
const mv = (s: any, i: string) => s.defs[s.cards[i].defId].cmc ?? 0;

EXT.hooks.castCosts.push((s, pc, api) => {
  if (pc.kind !== 'spell') return false;
  const f = front(s, pc.iid, api);
  if (f?.evidence && !pc.extEvidence) {
    const gy = s.players[pc.player].graveyard.filter((g: string) => g !== pc.iid);
    if (gy.reduce((a: number, g: string) => a + mv(s, g), 0) < f.evidence) { pc.extEvidence = []; return false; }
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: pc.player, kind: 'chooseCards', title: `${pc.label}: collect evidence ${f.evidence}? (exile cards with total mana value ${f.evidence}+, or none)`, cards: gy, min: 0, max: gy.length, canCancel: true, data: { ctx: 'cast', cost: 'extEvidence', minTotalMv: f.evidence } });
    return true;
  }
  if (f?.keywords?.includes?.('bargain') || f?.bargain) {
    if (pc.extBargain) return false;
    const cands = s.battlefield.filter((b: string) => s.cards[b].controller === pc.player && (s.cards[b].token || ['artifact', 'enchantment'].some((t) => api.chars(s, b).types.has(t))));
    if (!cands.length) { pc.extBargain = []; return false; }
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: pc.player, kind: 'chooseCards', title: `${pc.label}: bargain? (sacrifice an artifact, enchantment, or token, or none)`, cards: cands, min: 0, max: 1, canCancel: true, data: { ctx: 'cast', cost: 'extBargain' } });
    return true;
  }
  return false;
});
EXT.hooks.castPay.push((s, pc, api) => {
  if (pc.kind !== 'spell') return;
  const c = s.cards[pc.iid] as any;
  const ev: string[] = pc.extEvidence ?? [];
  if (c) c.evidenceCollected = false;
  if (ev.length) {
    for (const x of ev) if (s.cards[x]?.zone === 'graveyard') api.moveCard(s, x, 'exile');
    if (c) c.evidenceCollected = true;
    api.log(s, `${api.pname(s, pc.player)} collects evidence.`, pc.player);
    api.emit(s, 'collectEvidence', { p: pc.player });
  }
  const bg: string[] = pc.extBargain ?? [];
  if (c) c.bargained = false;
  if (bg.length) {
    for (const x of bg) if (s.cards[x]?.zone === 'battlefield') api.moveCard(s, x, 'graveyard', { cause: 'sacrifice' });
    if (c) c.bargained = true;
  }
});
EXT.conds.push((text) => {
  if (/^evidence was collected$/.test(text)) return { k: 'ext', name: 'castFlag', flag: 'evidenceCollected' };
  if (/^(?:~|it) was bargained$/.test(text)) return { k: 'ext', name: 'castFlag', flag: 'bargained' };
  return null;
});
EXT.condEval.castFlag = (s, c, _you, self) => !!self && !!(s.cards[self] as any)?.[c.flag];

// "As an additional cost to cast this spell, you may behold a Dragon / blight 2." → "if a Dragon was beheld" /
// "if this spell's additional cost was paid"
EXT.lines.push((line, pc) => {
  const rv = line.match(/^as an additional cost to cast (?:~|this spell), you may reveal (?:a|an) (.+?) card from your hand$/);
  if (rv) {
    const f = looseFilter(rv[1]);
    if (!f) return false;
    const g: any = { ...f };
    delete g.zone;
    pc.optAdd = { kind: 'reveal', filter: g };
    return true;
  }
  const m = line.match(/^as an additional cost to cast (?:~|this spell), you may (behold (?:a|an) (.+)|blight (\d+))$/);
  if (!m) return false;
  if (m[2]) {
    const f = looseFilter(m[2]);
    if (!f) return false;
    const g: any = { ...f };
    delete g.zone;
    pc.optAdd = { kind: 'behold', filter: g };
  } else pc.optAdd = { kind: 'blight', n: +m[3] };
  return true;
});
EXT.hooks.castCosts.push((s, pc, api) => {
  if (pc.kind !== 'spell' || pc.extOpt !== undefined) return false;
  const o = (api.parsedFor(s, s.cards[pc.iid]) as any)?.optAdd;
  if (!o) return false;
  const p = pc.player;
  const cands = o.kind === 'reveal' ? s.players[p].hand.filter((h: string) => h !== pc.iid && api.matchesFilter(s, h, { ...o.filter, zone: 'hand' }, p))
    : o.kind === 'behold'
    ? [...s.players[p].hand.filter((h: string) => h !== pc.iid && api.matchesFilter(s, h, { ...o.filter, zone: 'hand' }, p)), ...s.battlefield.filter((b: string) => s.cards[b].controller === p && api.matchesFilter(s, b, { ...o.filter, zone: 'battlefield' }, p))]
    : s.battlefield.filter((b: string) => s.cards[b].controller === p && api.chars(s, b).types.has('creature'));
  if (!cands.length) { pc.extOpt = []; return false; }
  api.pushPrompt(s, { id: api.uid(s, 'p'), player: p, kind: 'chooseCards', title: `${pc.label}: ${o.kind === 'reveal' ? 'reveal one from your hand (optional)' : o.kind === 'behold' ? 'behold one (optional)' : `blight ${o.n} — put ${o.n} -1/-1 counter${o.n > 1 ? 's' : ''} on a creature you control (optional)`}`, cards: cands, min: 0, max: 1, canCancel: true, data: { ctx: 'cast', cost: 'extOpt' } });
  return true;
});
EXT.hooks.castPay.push((s, pc, api) => {
  if (pc.kind !== 'spell') return;
  const c = s.cards[pc.iid] as any;
  const o = c ? (api.parsedFor(s, c) as any)?.optAdd : null;
  if (!o || !c) return;
  const pick = (pc.extOpt ?? [])[0];
  c.optPaid = !!pick;
  // "If you revealed a Dragon card or controlled a Dragon as you cast this spell"
  if (o.kind === 'reveal') { c.optPaid = !!pick || s.battlefield.some((b: string) => s.cards[b].controller === pc.player && api.matchesFilter(s, b, { ...o.filter, zone: 'battlefield' }, pc.player)); if (pick) api.log(s, `${api.pname(s, pc.player)} reveals ${api.nm(s, pick)}.`, pc.player); return; }
  if (!pick) return;
  if (o.kind === 'behold') api.log(s, `${api.pname(s, pc.player)} beholds ${api.nm(s, pick)}.`, pc.player);
  else if (s.cards[pick]?.zone === 'battlefield') api.addCounters(s, pick, '-1/-1', o.n);
});
EXT.conds.push((t) => (/^(?:this spell's|~'s|its) additional cost was paid$/.test(t) || /^you revealed (?:a|an) [a-z ]+ card or controlled (?:a|an) [a-z ]+ as you cast (?:~|this spell)$/.test(t) || /^(?:a|an) [a-z ]+ was beheld$/.test(t) ? { k: 'ext', name: 'castFlag', flag: 'optPaid' } : null));
