// Plugin: alternative / optional ways to cast — warp, aftermath, jump-start, blitz, overload, fuse,
// awaken, prototype, surge, offspring, casualty, conspire — plus encore, firebending and earthbend.
import { EXT } from '../ext';
import { parseAbility, parseCard, normalizeText, mkAct, parseCostText } from '../oracle';
import type { GameState, PlayerIdx } from '../types';

const C = (x: string) => x.toUpperCase();
const def = (s: GameState, iid: string) => s.defs[s.cards[iid].defId];
const front = (s: GameState, iid: string) => {
  const d = def(s, iid);
  return parseCard(d, d.faces && ['transform', 'modal_dfc'].includes(d.layout) ? d.faces[0] : undefined) as any;
};
const sorc = (s: GameState, p: PlayerIdx) => s.active === p && (s.step === 'main1' || s.step === 'main2') && !s.stack.length;
const canTime = (s: GameState, p: PlayerIdx, iid: string, api: any) => {
  const instant = /\binstant\b/i.test(def(s, iid).typeLine) || api.chars(s, iid).keywords?.has?.('flash');
  return s.priority === p && !s.prompt && (instant || sorc(s, p));
};
const handOpt = (s: GameState, p: PlayerIdx, iid: string) => s.cards[iid]?.zone === 'hand' && s.cards[iid].owner === p;

// ------------------------------------------------------------------------------------------
// keyword lines
// ------------------------------------------------------------------------------------------
EXT.lines.push((line, pc) => {
  let m: RegExpMatchArray | null;
  if ((m = line.match(/^(warp|blitz|overload|surge|offspring|spectacle|prowl) (\{[^}]+\}(?:\{[^}]+\})*)$/))) { pc[m[1]] = C(m[2]); return true; }
  if (line === 'aftermath') { pc.aftermath = true; return true; }
  if (line === 'jump-start') { pc.jumpstart = true; return true; }
  if (line === 'fuse') { pc.fuse = true; return true; }
  if (line === 'conspire') { pc.conspire = true; return true; }
  if ((m = line.match(/^casualty (\d+|x)$/))) { pc.casualty = m[1] === 'x' ? 0 : +m[1]; return true; }
  if ((m = line.match(/^awaken (\d+)—(\{[^}]+\}(?:\{[^}]+\})*)$/))) { pc.awaken = { n: +m[1], cost: C(m[2]) }; return true; }
  if ((m = line.match(/^prototype (\{[^}]+\}(?:\{[^}]+\})*) — (\d+)\/(\d+)$/))) { pc.prototype = { cost: C(m[1]), p: m[2], t: m[3] }; return true; }
  if ((m = line.match(/^encore (\{[^}]+\}(?:\{[^}]+\})*)$/))) {
    pc.activated.push(mkAct(`Encore ${C(m[1])}`, { ...parseCostText(m[1]), exileSelf: true }, { text: 'encore', effects: [{ k: 'ext', name: 'encore' }], specs: [], manual: [] }, { zone: 'graveyard', sorcery: true }));
    return true;
  }
  if ((m = line.match(/^firebending (\d+|x)$/))) {
    const n = m[1] === 'x' ? 1 : +m[1];
    pc.triggers.push({ event: 'attacks', text: line, ability: { text: line, effects: [{ k: 'ext', name: 'firebend', n }], specs: [], manual: [] } });
    return true;
  }
  return false;
});

// ------------------------------------------------------------------------------------------
// options offered from hand
// ------------------------------------------------------------------------------------------
EXT.hooks.castOptions.push((s, p, iid, api) => {
  if (!handOpt(s, p, iid)) return [];
  const f = front(s, iid);
  const d = def(s, iid);
  const name = d.faces?.[0]?.name ?? d.name;
  const base = d.faces?.[0]?.manaCost ?? d.manaCost;
  const t = canTime(s, p, iid, api);
  const out: any[] = [];
  const opt = (label: string, alt: string, cost: string, ok = true) => out.push({ label: `${label} ${cost}`.trim(), action: { type: 'cast', iid, alt: `ext:${alt}` }, ok: t && ok && api.canAfford(s, p, cost) && !EXT.hooks.castBlock.some((h) => !!h(s, p, iid, `ext:${alt}`, api)) });
  if (f.warp) opt(`Warp ${name}`, 'warp', f.warp);
  if (f.blitz) opt(`Blitz ${name}`, 'blitz', f.blitz);
  if (f.overload) opt(`Overload ${name}`, 'overload', f.overload);
  if (f.surge) opt(`Surge ${name}`, 'surge', f.surge, (s.players[p] as any).spellsCastThisTurn > 0);
  if (f.spectacle) opt(`Spectacle ${name}`, 'spectacle', f.spectacle, spectacleOk(s, p));
  if (f.prowl) opt(`Prowl ${name}`, 'prowl', f.prowl, prowlOk(s, p, iid, api));
  if (f.offspring) opt(`Cast ${name} with offspring`, 'offspring', base + f.offspring);
  if (f.awaken) opt(`Cast ${name} with awaken ${f.awaken.n}`, 'awaken', f.awaken.cost);
  if (f.prototype) opt(`Cast ${name} as a prototype (${f.prototype.p}/${f.prototype.t})`, 'prototype', f.prototype.cost);
  if (f.casualty != null) opt(`Cast ${name} with casualty ${f.casualty || 'X'}`, 'casualty', base);
  if (f.conspire) opt(`Cast ${name} with conspire`, 'conspire', base);
  if (d.layout === 'split' && /\bfuse\b/i.test(d.faces?.[1]?.oracle ?? '')) opt(`Cast ${d.faces![0].name} and ${d.faces![1].name} (fused)`, 'fuse', (d.faces![0].manaCost ?? '') + (d.faces![1].manaCost ?? ''));
  return out;
});
const simple = (key: string, label: string, extra: Partial<any> = {}) => {
  EXT.alts[key] = { label, begin: (s, _p, iid) => front(s, iid)[key] ?? `!No ${label} cost`, afterPush: (s, item) => { (s.cards[item.source] as any)[`${key}Cast`] = true; }, ...extra };
};
simple('warp', 'warp');
simple('blitz', 'blitz');
simple('surge', 'surge');
simple('spectacle', 'spectacle');
simple('prowl', 'prowl');
// spectacle: an opponent lost life this turn; prowl: you dealt combat damage to a player this turn with a creature
// sharing a creature type with this card
const spectacleOk = (s: GameState, p: PlayerIdx) => ((s as any).lostLifeTurn?.[1 - p] ?? -1) === s.turn;
const prowlOk = (s: GameState, p: PlayerIdx, iid: string, api: any) => {
  const t = (s as any).combatHitTypes;
  if (!t || t.turn !== s.turn) return false;
  const mine: string[] = t.types[p] ?? [];
  const subs = [...api.chars(s, iid).subtypes] as string[];
  return mine.includes('*') || subs.some((x) => mine.includes(x));
};
EXT.hooks.event.push((s, name, d, api) => {
  if (name === 'lifeLost') ((s as any).lostLifeTurn ??= {})[d.p] = s.turn;
  if (name === 'dealt' && d.combat && d.to?.kind === 'player' && s.cards[d.source]) {
    const t = ((s as any).combatHitTypes ??= { turn: -1, types: {} });
    if (t.turn !== s.turn) { t.turn = s.turn; t.types = {}; }
    const ctrl = s.cards[d.source].controller;
    const ch = api.chars(s, d.source);
    (t.types[ctrl] ??= []).push(...ch.subtypes, ...(ch.keywords.has('changeling') ? ['*'] : []));
  }
});
EXT.alts.overload = {
  label: 'overload',
  begin: (s, _p, iid) => front(s, iid).overload ?? '!No overload cost',
  ability: (s, _p, iid) => {
    const d = def(s, iid);
    const text = normalizeText(d.oracle, d.name).split('\n').filter((l) => !/^overload\b/.test(l)).join('\n').replace(/\btarget\b/g, 'each');
    return parseAbility(text);
  },
};
EXT.alts.offspring = { label: 'offspring', begin: (s, _p, iid) => def(s, iid).manaCost + (front(s, iid).offspring ?? ''), afterPush: (s, item) => { (s.cards[item.source] as any).offspringCast = true; } };
EXT.alts.awaken = {
  label: 'awaken',
  begin: (s, _p, iid) => front(s, iid).awaken?.cost ?? '!No awaken cost',
  ability: (s, _p, iid, _f, base) => {
    const n = front(s, iid).awaken.n;
    const specs = [...base.specs, { filter: { types: ['land'], controller: 'you' }, players: null, count: 1, upTo: false, label: 'target land you control (awaken)' }];
    return { ...base, specs, effects: [...base.effects, { k: 'ext', name: 'animateLand', what: { t: 'target', spec: specs.length - 1 }, n, haste: true, sub: 'elemental' }] };
  },
};
EXT.alts.prototype = { label: 'prototype', begin: (s, _p, iid) => front(s, iid).prototype?.cost ?? '!No prototype', afterPush: (s, item) => { (s.cards[item.source] as any).prototypeCast = true; } };
EXT.alts.fuse = {
  label: 'fuse',
  begin: (s, _p, iid) => { const d = def(s, iid); return (d.faces?.[0]?.manaCost ?? '') + (d.faces?.[1]?.manaCost ?? ''); },
  ability: (s, _p, iid) => {
    const d = def(s, iid);
    const a = parseCard(d, d.faces![0]).spell ?? { text: '', effects: [], specs: [], manual: [] };
    const b = parseCard(d, d.faces![1]).spell ?? { text: '', effects: [], specs: [], manual: [] };
    const off = a.specs.length;
    const shift = (x: any): any => (Array.isArray(x) ? x.map(shift) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, k === 'spec' && x.t === 'target' ? (v as number) + off : shift(v)])) : x);
    return { text: `${a.text}\n${b.text}`, effects: [...JSON.parse(JSON.stringify(a.effects)), ...shift(JSON.parse(JSON.stringify(b.effects)))], specs: [...a.specs, ...b.specs], manual: [...a.manual, ...b.manual] };
  },
};
// casualty / conspire: optional extra cost chosen while casting, then the spell is copied
EXT.alts.casualty = { label: 'casualty', begin: (s, _p, iid) => def(s, iid).manaCost, afterPush: (s, item, api) => copyLater(s, item, api, 'Casualty') };
EXT.alts.conspire = { label: 'conspire', begin: (s, _p, iid) => def(s, iid).manaCost, afterPush: (s, item, api) => copyLater(s, item, api, 'Conspire') };
function copyLater(s: GameState, item: any, api: any, label: string) {
  api.queueTrigger(s, item.source, item.controller, { event: 'castSpell', text: `${label} — copy the spell`, ability: { text: 'copy it', effects: [{ k: 'copySpell', what: { t: 'triggerObj' }, n: 1 }], specs: [], manual: [] } }, { triggerObj: item.source });
}
const casualtyPool = (s: GameState, p: PlayerIdx, iid: string, api: any) => {
  const n = front(s, iid).casualty ?? 0;
  return s.battlefield.filter((b) => s.cards[b].controller === p && api.chars(s, b).types.has('creature') && api.chars(s, b).power >= n);
};
const conspirePool = (s: GameState, p: PlayerIdx, iid: string, api: any) => {
  const cols: string[] = api.chars(s, iid).colors;
  return s.battlefield.filter((b) => s.cards[b].controller === p && !s.cards[b].tapped && api.chars(s, b).types.has('creature') && api.chars(s, b).colors.some((c: string) => cols.includes(c)));
};
EXT.hooks.castBlock.push((s, p, iid, alt, api, face) => {
  const c = s.cards[iid] as any;
  const f = front(s, iid);
  if (alt === 'ext:casualty' && !casualtyPool(s, p, iid, api).length) return 'You need a creature to sacrifice for casualty';
  if (alt === 'ext:conspire' && conspirePool(s, p, iid, api).length < 2) return 'Conspire needs two untapped creatures that share a color with it';
  if (alt === 'ext:surge' && !((s.players[p] as any).spellsCastThisTurn > 0)) return 'Surge: cast another spell this turn first';
  // aftermath: the second half only from the graveyard, the first half not from the graveyard
  const d = def(s, iid);
  if (d.layout === 'split' && /\baftermath\b/i.test(d.faces?.[1]?.oracle ?? '') && face != null) {
    if (c.zone === 'hand' && face === 1) return 'Aftermath halves are cast only from your graveyard';
    if (c.zone === 'graveyard' && face === 0) return 'Only the aftermath half can be cast from your graveyard';
  }
  if (c.zone === 'exile' && c.warpedAt === s.turn) return 'A warped card can be cast from exile on a later turn';
  void f;
  return null;
});
EXT.hooks.castCosts.push((s, pc, api) => {
  if (pc.kind !== 'spell') return false;
  const ask = (key: string, list: string[], n: number, title: string) => {
    if (pc[key]) return false;
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: pc.player, kind: 'chooseCards', title: `${pc.label}: ${title}`, cards: list, min: n, max: n, canCancel: true, data: { ctx: 'cast', cost: key } });
    return true;
  };
  if (pc.alt === 'ext:casualty') return ask('extCasualty', casualtyPool(s, pc.player, pc.iid, api), 1, 'sacrifice a creature (casualty)');
  if (pc.alt === 'ext:conspire') return ask('extConspire', conspirePool(s, pc.player, pc.iid, api), 2, 'tap two creatures that share a color (conspire)');
  if (pc.alt === 'ext:jumpstart') return ask('extJumpDiscard', s.players[pc.player].hand.filter((h) => h !== pc.iid), 1, 'discard a card (jump-start)');
  return false;
});
EXT.hooks.castPay.push((s, pc, api) => {
  for (const x of pc.extCasualty ?? []) api.moveCard(s, x, 'graveyard', { cause: 'sacrifice' });
  for (const x of pc.extConspire ?? []) s.cards[x].tapped = true;
  for (const x of pc.extJumpDiscard ?? []) api.moveCard(s, x, 'graveyard', { cause: 'discard' });
});

// ------------------------------------------------------------------------------------------
// casting from the graveyard: aftermath, jump-start
// ------------------------------------------------------------------------------------------
EXT.hooks.zoneCast.push((s, p, card, _pcFront) => {
  if (card.zone !== 'graveyard' || card.owner !== p) return null;
  const d = s.defs[card.defId];
  if (d.layout === 'split' && /\baftermath\b/i.test(d.faces?.[1]?.oracle ?? '')) return 'ext:aftermath';
  if (/\bjump-start\b/i.test(d.oracle ?? '')) return 'ext:jumpstart';
  return null;
});
EXT.alts.aftermath = { label: 'aftermath', begin: (s, _p, iid) => def(s, iid).faces?.[1]?.manaCost ?? '', afterPush: (s, item) => { (s.cards[item.source] as any).exileAfter = true; } };
EXT.alts.jumpstart = { label: 'jump-start', begin: (s, _p, iid) => def(s, iid).manaCost, afterPush: (s, item) => { (s.cards[item.source] as any).exileAfter = true; } };
EXT.hooks.finish.push((s, item, _countered, api) => {
  const c = s.cards[item.source] as any;
  if (!c?.exileAfter || c.zone !== 'stack') return false;
  c.exileAfter = false;
  api.moveCard(s, item.source, 'exile');
  return true;
});

// ------------------------------------------------------------------------------------------
// what happens when these permanents enter
// ------------------------------------------------------------------------------------------
EXT.hooks.afterMove.push((s, iid, _from, to, _o, api) => {
  const c = s.cards[iid] as any;
  if (!c) return;
  if (to !== 'battlefield') {
    if (to !== 'stack') { c.warpCast = c.blitzCast = c.offspringCast = c.prototypeCast = c.surgeCast = false; }
    if (c.granted && _from === 'battlefield') c.granted = undefined;
    return;
  }
  const nm = api.nm(s, iid);
  if (c.warpCast) {
    c.warpCast = false;
    s.delayed.push({ at: 'nextEnd', controller: c.controller, source: iid, label: `${nm} — warp`, effects: [{ k: 'ext', name: 'warpExile' }], targets: [] });
  }
  if (c.blitzCast) {
    c.blitzCast = false;
    c.mods.push({ keywords: ['haste'], until: 'permanent', source: iid, ts: s.ts++ });
    c.granted = [...(c.granted ?? []), 'When this creature dies, draw a card.'];
    s.delayed.push({ at: 'nextEnd', controller: c.controller, source: iid, label: `${nm} — blitz`, effects: [{ k: 'sacObj', what: { t: 'self' } }], targets: [] });
  }
  if (c.offspringCast) {
    c.offspringCast = false;
    const it: any = { id: api.uid(s, 's'), kind: 'trigger', controller: c.controller, source: iid, label: `${nm} — offspring`, text: 'Create a 1/1 token copy.', effects: [{ k: 'ext', name: 'offspringToken' }], targets: [] };
    it.preTargeted = true;
    s.pendingTriggers.push(it);
  }
  if (c.prototypeCast) {
    const pr = front(s, iid).prototype;
    const cols = (pr.cost.match(/\{([WUBRG])\}/g) ?? []).map((x: string) => x[1]);
    c.mods.push({ setPT: [+pr.p, +pr.t], colors: [...new Set(cols)], until: 'permanent', source: iid, ts: s.ts++ });
  }
});
EXT.effects.warpExile = ({ s, item, api }) => {
  const c = s.cards[item.source] as any;
  if (!c || c.zone !== 'battlefield') return 'done';
  api.moveCard(s, item.source, 'exile');
  c.warpedAt = s.turn;
  c.mayPlay = { player: c.owner, untilTurn: 1e9 };
  api.log(s, `${api.nm(s, item.source)} is exiled (warp); it can be cast later.`, c.owner);
  return 'done';
};
EXT.effects.offspringToken = ({ s, item, you, api }) => {
  if (!s.cards[item.source]) return 'done';
  api.copyToken(s, you, item.source, { pt: ['1', '1'] });
  return 'done';
};
EXT.effects.encore = ({ s, item, you, api }) => {
  const t = api.copyToken(s, you, item.source, {});
  s.cards[t].mods.push({ keywords: ['haste'], until: 'permanent', source: t, ts: s.ts++ });
  s.delayed.push({ at: 'nextEnd', controller: you, source: t, label: `${api.nm(s, t)} — encore`, effects: [{ k: 'sacObj', what: { t: 'self' } }], targets: [] });
  return 'done';
};
EXT.effects.firebend = ({ s, e, you, api }) => {
  const pl = s.players[you] as any;
  pl.pool.R += e.n;
  pl.combatMana = (pl.combatMana ?? 0) + e.n;
  api.log(s, `${api.pname(s, you)} adds ${'{R}'.repeat(e.n)} (firebending).`, you);
  return 'done';
};

// ------------------------------------------------------------------------------------------
// earthbend N / awaken: a land you control becomes a 0/0 haste creature with N +1/+1 counters
// ------------------------------------------------------------------------------------------
EXT.rules.push([/^earthbend (\d+|x)$/, (m, ctx) => {
  ctx.specs.push({ filter: { types: ['land'], controller: 'you' }, players: null, count: 1, upTo: false, label: 'target land you control' });
  return [{ k: 'ext', name: 'animateLand', what: { t: 'target', spec: ctx.specs.length - 1 }, n: m[1] === 'x' ? 'X' : +m[1], haste: true, earthbend: true }];
}]);
EXT.effects.animateLand = ({ s, item, e, api }) => {
  for (const c of api.subjCards(s, item, e.what)) {
    const card = s.cards[c] as any;
    if (card?.zone !== 'battlefield') continue;
    card.mods.push({ addTypes: ['creature'], ...(e.sub ? { addSubtypes: [e.sub] } : {}), setPT: [0, 0], keywords: e.haste ? ['haste'] : [], until: 'permanent', source: item.source, ts: s.ts++ });
    api.addCounters(s, c, '+1/+1', api.amount(s, item, e.n));
    if (e.earthbend) card.earthbent = true;
    api.ev(s, { k: 'animate', iid: c });
  }
  return 'done';
};
EXT.hooks.event.push((s, name, d, api) => {
  if (name !== 'leave' || !d.card?.earthbent || (d.to !== 'graveyard' && d.to !== 'exile')) return;
  d.card.earthbent = false;
  if (d.card.token) return;
  const it: any = { id: api.uid(s, 's'), kind: 'trigger', controller: d.controller, source: d.iid, label: `${api.nm(s, d.iid)} — earthbend`, text: 'Return it to the battlefield tapped.', effects: [{ k: 'ext', name: 'returnTapped', iid: d.iid }], targets: [] };
  it.preTargeted = true;
  s.pendingTriggers.push(it);
});
EXT.effects.returnTapped = ({ s, e, api }) => {
  const c = s.cards[e.iid];
  if (!c || (c.zone !== 'graveyard' && c.zone !== 'exile')) return 'done';
  api.moveCard(s, e.iid, 'battlefield', { controller: c.owner, tapped: true });
  return 'done';
};
