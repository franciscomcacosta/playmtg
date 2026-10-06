// Plugin: keyword abilities and keyword actions (typecycling, explore, connive, amass, learn,
// monstrosity, incubate, discover, soulshift, devour, exploit).
import { EXT } from '../ext';
import { mkAct, parseAbility, parseCostText, parseSubject, singular, parseKeywordList, type Subject } from '../oracle';
import type { Color, PlayerIdx } from '../types';

const W: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, x: 0 };
const n0 = (w: string) => (/^\d+$/.test(w) ? +w : W[w] ?? 1);
const subj = (w: string, ctx: any): Subject | null => (w === '~' ? { t: 'self' } : ['it', 'that creature', 'this creature'].includes(w) ? ctx.last ?? { t: 'self' } : parseSubject(w, ctx));

// ---------------- typecycling: "basic landcycling {1}", "plainscycling {2}", "wizardcycling {3}" ----------------
EXT.lines.push((line, pc) => {
  const m = line.match(/^((?:basic )?[a-z]+(?: [a-z]+)?)cycling (\{[^}]+\}(?:\{[^}]+\})*)$/);
  if (!m || m[1] === '') return false;
  const kind = m[1].trim();
  const filter: any = { zone: 'library' };
  if (kind === 'basic land') { filter.supertypes = ['basic']; filter.types = ['land']; }
  else if (kind === 'land') filter.types = ['land'];
  else if (['artifact', 'creature', 'enchantment'].includes(kind)) filter.types = [kind];
  else filter.subtypes = [singular(kind)];
  pc.activated.push(mkAct(`${kind[0].toUpperCase()}${kind.slice(1)}cycling ${m[2].toUpperCase()}`, { ...parseCostText(m[2]), discardSelf: true }, { text: `search for a ${kind} card`, effects: [{ k: 'search', filter, n: 1, dest: 'hand', upTo: true }], specs: [], manual: [] }, { zone: 'hand', special: 'cycling' }));
  return true;
});

// ---------------- soulshift N ----------------
EXT.lines.push((line, pc) => {
  const m = line.match(/^soulshift (\d+)$/);
  if (!m) return false;
  const ab = parseAbility(`you may return target spirit card with mana value ${m[1]} or less from your graveyard to your hand`);
  if (ab.manual.length) return false;
  pc.triggers.push({ event: 'dies', ability: ab, text: line });
  return true;
});

// ---------------- explore / connive ----------------
EXT.rules.push([/^(~|it|that creature|target creature you control|up to one target creature you control) (explores|connives)$/, (m, ctx) => {
  const what = subj(m[1], ctx);
  return what ? [{ k: 'ext', name: m[2] === 'explores' ? 'explore' : 'connive', what }] : null;
}]);
EXT.effects.explore = ({ s, item, e, r, api }) => {
  if (!r.sub && !(r as any).exEm) { (r as any).exEm = true; for (const c of api.subjCards(s, item, e.what ?? { t: 'self' })) api.emit(s, 'explored', { iid: c }); }
  const c = api.subjCards(s, item, e.what)[0];
  if (!c) return 'done';
  const p = s.cards[c].controller as PlayerIdx;
  if (!r.sub) {
    const top = api.P(s, p).library[0];
    if (!top) return 'done';
    api.log(s, `${api.nm(s, c)} explores: ${api.pname(s, p)} reveals ${api.nm(s, top)}.`, p);
    api.ev(s, { k: 'reveal', iid: top, p, name: api.nm(s, top), image: api.cardImageOf(s, top) });
    if (/\bLand\b/.test(s.defs[s.cards[top].defId].typeLine.split(' // ')[0])) {
      api.moveCard(s, top, 'hand');
      return 'done';
    }
    if (s.cards[c].zone === 'battlefield') api.addCounters(s, c, '+1/+1', 1);
    r.sub = { top };
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: p, kind: 'yesno', title: `Explore: put ${api.nm(s, top)} into your graveyard?`, options: [{ id: 'yes', label: 'Graveyard' }, { id: 'no', label: 'Keep it on top' }], cards: [top], data: { ctx: 'resolve' } });
    return 'wait';
  }
  if (r.sub.answered === 'yes' && s.cards[r.sub.top]?.zone === 'library') api.moveCard(s, r.sub.top, 'graveyard');
  return 'done';
};
EXT.effects.connive = ({ s, item, e, r, api }) => {
  if (!r.sub && !(r as any).cnEm) { (r as any).cnEm = true; for (const c of api.subjCards(s, item, e.what ?? { t: 'self' })) api.emit(s, 'connived', { iid: c }); }
  const c = api.subjCards(s, item, e.what)[0];
  if (!c) return 'done';
  const p = s.cards[c].controller as PlayerIdx;
  if (!r.sub) {
    api.drawCards(s, p, 1);
    const hand = api.P(s, p).hand;
    if (!hand.length) return 'done';
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: p, kind: 'chooseCards', title: `${api.nm(s, c)} connives: discard a card`, cards: [...hand], min: 1, max: 1, data: { ctx: 'resolve' } });
    return 'wait';
  }
  const d = r.sub.answer?.[0];
  if (d && s.cards[d]?.zone === 'hand') {
    const nonland = !/\bLand\b/.test(s.defs[s.cards[d].defId].typeLine.split(' // ')[0]);
    api.log(s, `${api.pname(s, p)} discards ${api.nm(s, d)}.`, p);
    api.moveCard(s, d, 'graveyard', { cause: 'discard' });
    if (nonland && s.cards[c]?.zone === 'battlefield') api.addCounters(s, c, '+1/+1', 1);
  }
  return 'done';
};

// ---------------- amass [type] N ----------------
EXT.rules.push([/^amass(?: ([a-z]+))? (\d+|x)$/, (m) => [{ k: 'ext', name: 'amass', type: m[1] ? singular(m[1]) : '', n: m[2] === 'x' ? 'X' : +m[2] }]]);
EXT.effects.amass = ({ s, item, e, you, api }) => {
  const n = api.amount(s, item, e.n);
  let army = s.battlefield.find((b) => s.cards[b].controller === you && api.chars(s, b).subtypes.has('army'));
  if (!army) {
    const t = e.type ? `${e.type[0].toUpperCase()}${e.type.slice(1)} ` : '';
    army = api.createToken(s, you, { name: `${t}Army`, power: '0', toughness: '0', colors: ['B'], types: `Token Creature — ${t}Army`, keywords: [], oracle: '' });
  }
  if (n > 0) api.addCounters(s, army, '+1/+1', n);
  api.log(s, `${api.pname(s, you)} amasses ${n}.`, you);
  return 'done';
};

// ---------------- learn (no sideboard in 1v1: you may discard a card to draw a card) ----------------
EXT.rules.push([/^learn$/, () => [{ k: 'ext', name: 'learn' }]]);
EXT.effects.learn = ({ s, r, you, api }) => {
  const hand = api.P(s, you).hand;
  if (!r.sub) {
    if (!hand.length) return 'done';
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'chooseCards', title: 'Learn: you may discard a card to draw a card', cards: [...hand], min: 0, max: 1, data: { ctx: 'resolve' } });
    return 'wait';
  }
  const d = r.sub.answer?.[0];
  if (d && s.cards[d]?.zone === 'hand') {
    api.moveCard(s, d, 'graveyard', { cause: 'discard' });
    api.drawCards(s, you, 1);
  }
  return 'done';
};

// ---------------- monstrosity N ----------------
EXT.rules.push([/^monstrosity (\d+|x)$/, (m) => [{ k: 'ext', name: 'monstrosity', n: m[1] === 'x' ? 'X' : +m[1] }]]);
EXT.effects.monstrosity = ({ s, item, e, api }) => {
  const c = s.cards[item.source] as any;
  if (!c || c.zone !== 'battlefield' || c.monstrous) return 'done';
  api.addCounters(s, item.source, '+1/+1', api.amount(s, item, e.n));
  c.monstrous = true;
  api.log(s, `${api.nm(s, item.source)} becomes monstrous.`, c.controller);
  for (const t of api.chars(s, item.source).pc.triggers) if (t.event === 'monstrous') api.queueTrigger(s, item.source, c.controller, t, {});
  return 'done';
};
EXT.lines.push((line, pc) => {
  const m = line.match(/^when ~ becomes monstrous, (.+)$/);
  if (!m) return false;
  const ab = parseAbility(m[1]);
  pc.triggers.push({ event: 'monstrous' as any, ability: ab, text: line });
  if (ab.manual.length) pc.unparsed.push(...ab.manual);
  return true;
});
EXT.conds.push((t) => (/^~ is monstrous$/.test(t) ? { k: 'ext', name: 'monstrous' } : /^~ isn't monstrous$/.test(t) ? { k: 'ext', name: 'monstrous', not: true } : null));
EXT.condEval.monstrous = (s, c, _you, self) => !!(self && (s.cards[self] as any)?.monstrous) !== !!c.not;

// ---------------- incubate N ----------------
EXT.rules.push([/^incubate (\d+|x)$/, (m) => [{ k: 'ext', name: 'incubate', n: m[1] === 'x' ? 'X' : +m[1] }]]);
EXT.effects.incubate = ({ s, item, e, you, api }) => {
  const n = api.amount(s, item, e.n);
  const t = api.createToken(s, you, { name: 'Incubator', colors: [], types: 'Token Artifact — Incubator', keywords: [], oracle: '{2}: Transform this artifact.' });
  if (n > 0) api.addCounters(s, t, '+1/+1', n);
  return 'done';
};
// "{2}: transform this artifact" on an Incubator token → becomes a 0/0 Phyrexian artifact creature
EXT.rules.push([/^transform (?:this artifact|~)$/, () => [{ k: 'ext', name: 'incubatorFlip' }]]);
EXT.effects.incubatorFlip = ({ s, item, api }) => {
  const c = s.cards[item.source];
  if (!c || c.zone !== 'battlefield') return 'done';
  const def = s.defs[c.defId];
  if (def?.faces && def.faces.length > 1) {
    api.transformCard(s, item.source);
    return 'done';
  }
  if (!/incubator/i.test(def?.name ?? '')) return 'done';
  c.mods.push({ addTypes: ['creature'], addSubtypes: ['phyrexian'], setPT: [0, 0], until: 'permanent', source: item.source, ts: s.ts++ } as any);
  api.log(s, 'The Incubator transforms into a Phyrexian artifact creature.', c.controller);
  api.ev(s, { k: 'transform', iid: item.source });
  return 'done';
};

// ---------------- discover N ----------------
EXT.rules.push([/^discover (\d+|x)$/, (m) => [{ k: 'ext', name: 'discover', n: m[1] === 'x' ? 'X' : +m[1] }]]);
EXT.effects.discover = ({ s, item, e, r, you, api }) => {
  if (!r.sub) {
    const mv = api.amount(s, item, e.n);
    const exiled: string[] = [];
    let hit: string | undefined;
    while (api.P(s, you).library.length) {
      const top = api.P(s, you).library[0];
      api.moveCard(s, top, 'exile');
      exiled.push(top);
      const d = s.defs[s.cards[top].defId];
      if (!/\bLand\b/.test(d.typeLine.split(' // ')[0]) && d.cmc <= mv) { hit = top; break; }
    }
    r.sub = { exiled, hit };
    api.ev(s, { k: 'cascade', src: item.source, cards: exiled, hit });
    if (!hit) {
      for (const c of exiled) api.moveCard(s, c, 'libraryBottom');
      return 'done';
    }
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'yesno', title: `Discover: cast ${api.nm(s, hit)} without paying its mana cost?`, options: [{ id: 'yes', label: 'Cast it' }, { id: 'no', label: 'Put it into your hand' }], cards: [hit], data: { ctx: 'resolve' } });
    return 'wait';
  }
  const { exiled, hit } = r.sub;
  const rest = (exiled as string[]).filter((x) => x !== hit);
  api.shuffleArr(s, rest);
  for (const c of rest) if (s.cards[c]?.zone === 'exile') api.moveCard(s, c, 'libraryBottom');
  if (r.sub.answered === 'yes') {
    const err = api.beginCast(s, you, hit, 0, 'free');
    if (err) api.moveCard(s, hit, 'hand');
  } else api.moveCard(s, hit, 'hand');
  return 'done';
};

// ---------------- devour N / exploit ----------------
EXT.lines.push((line, pc) => {
  const m = line.match(/^devour (\d+)$/);
  if (!m) return false;
  pc.triggers.push({ event: 'etb', ability: { text: line, effects: [{ k: 'ext', name: 'devour', n: +m[1] }], specs: [], manual: [] }, text: line });
  return true;
});
EXT.effects.devour = ({ s, item, e, r, you, api }) => {
  const self = item.source;
  const cands = s.battlefield.filter((b) => b !== self && s.cards[b].controller === you && api.chars(s, b).types.has('creature'));
  if (!r.sub) {
    if (!cands.length) return 'done';
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'chooseCards', title: `Devour ${e.n}: sacrifice any number of creatures`, cards: cands, min: 0, max: cands.length, data: { ctx: 'resolve' } });
    return 'wait';
  }
  const chosen: string[] = r.sub.answer ?? [];
  for (const c of chosen) api.moveCard(s, c, 'graveyard', { cause: 'sacrifice' });
  if (chosen.length && s.cards[self]?.zone === 'battlefield') api.addCounters(s, self, '+1/+1', e.n * chosen.length);
  (s.cards[self] as any).devoured = chosen.length;
  return 'done';
};
EXT.lines.push((line, pc) => {
  if (line === 'exploit') {
    pc.triggers.push({ event: 'etb', ability: { text: line, effects: [{ k: 'ext', name: 'exploit' }], specs: [], manual: [] }, text: line });
    return true;
  }
  const m = line.match(/^when ~ exploits a creature, (.+)$/);
  if (!m) return false;
  const ab = parseAbility(m[1]);
  pc.triggers.push({ event: 'exploits' as any, ability: ab, text: line });
  if (ab.manual.length) pc.unparsed.push(...ab.manual);
  return true;
});
EXT.effects.exploit = ({ s, item, r, you, api }) => {
  const cands = s.battlefield.filter((b) => s.cards[b].controller === you && api.chars(s, b).types.has('creature'));
  if (!r.sub) {
    if (!cands.length) return 'done';
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'chooseCards', title: `Exploit: you may sacrifice a creature`, cards: cands, min: 0, max: 1, data: { ctx: 'resolve' } });
    return 'wait';
  }
  const c = r.sub.answer?.[0];
  if (!c) return 'done';
  const trig = api.chars(s, item.source).pc.triggers.filter((t: any) => t.event === 'exploits');
  api.moveCard(s, c, 'graveyard', { cause: 'sacrifice' });
  for (const t of trig) api.queueTrigger(s, item.source, you, t, {});
  return 'done';
};

// "it gains flying until end of turn" style already exists; keep a small helper for keyword lists.
void parseKeywordList;
void ({} as Color);
