// Plugin: level up, station, saddle, clash, ascend, job select, leylines, library shuffles,
// skip your draw step, optional untap.
import { EXT } from '../ext';
import { mkAct, parseCostText, parsePlayerSubject, parseKeywordList, parseCard, parseCond, parseSubject, parseFilter } from '../oracle';
import type { GameState, PlayerIdx } from '../types';

const C = (x: string) => x.toUpperCase();
const W: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };
const n0 = (w: string) => (/^\d+$/.test(w) ? +w : W[w] ?? 1);
const emptyAb = (text: string, effects: any[] = []) => ({ text, effects, specs: [], manual: [] });

// ------------------------------------------------------------------------------------------
// Level up / station bands: "level 1-3 / 4/4 / abilities", "station 7+ / flying / 5/5"
// ------------------------------------------------------------------------------------------
EXT.lines.push((line, pc) => {
  let m: RegExpMatchArray | null;
  if ((m = line.match(/^level up (\{[^}]+\}(?:\{[^}]+\})*)$/))) {
    pc.activated.push(mkAct(`Level up ${C(m[1])}`, parseCostText(m[1]), emptyAb('put a level counter on ~', [{ k: 'counters', what: { t: 'self' }, counter: 'level', n: 1 }]), { sorcery: true }));
    return true;
  }
  if ((m = line.match(/^level (\d+)-(\d+)$/)) || (m = line.match(/^level (\d+)\+$/))) {
    pc.__sticky = { k: 'ext', name: 'counterBand', counter: 'level', min: +m[1], max: m[2] ? +m[2] : 999 };
    pc.gated = true;
    return true;
  }
  if ((m = line.match(/^station (\d+)\+$/))) {
    pc.__sticky = { k: 'ext', name: 'counterBand', counter: 'charge', min: +m[1], max: 999, station: true };
    pc.gated = true;
    return true;
  }
  if ((m = line.match(/^(\d+)\/(\d+)$/)) && pc.__sticky) {
    pc.statics.push({ kind: 'setPT', setP: +m[1], setT: +m[2], p: 0, t: 0, kw: [], ...(pc.__sticky.station ? { selfAddTypes: ['creature'] } : {}) });
    return true;
  }
  if (line === 'station') {
    pc.hasStation = true;
    pc.activated.push(mkAct('Station (tap another creature: charge counters equal to its power)', { mana: '', tap: false, untap: false, sacSelf: false, tapCreatures: { n: 1, filter: { types: ['creature'], controller: 'you', untapped: true, zone: 'battlefield' } } } as any, emptyAb('station', [{ k: 'ext', name: 'station' }]), { sorcery: true }));
    return true;
  }
  if ((m = line.match(/^saddle (\d+)$/))) {
    pc.activated.push({ ...mkAct(`Saddle ${m[1]}`, { mana: '', tap: false, untap: false, sacSelf: false }, emptyAb('~ becomes saddled until end of turn', [{ k: 'ext', name: 'saddle' }]), { sorcery: true, special: 'crew' }), crew: +m[1] });
    return true;
  }
  return false;
});
EXT.condEval.counterBand = (s, c, _you, self) => {
  const n = (self && s.cards[self]?.counters[c.counter]) ?? 0;
  return n >= c.min && n <= c.max;
};
EXT.effects.station = ({ s, item, api }) => {
  const t = ((item as any).costTapped ?? [])[0];
  const src = s.cards[item.source];
  if (!t || !src || src.zone !== 'battlefield') return 'done';
  const n = Math.max(0, api.chars(s, t).power);
  if (n) api.addCounters(s, item.source, 'charge', n);
  return 'done';
};
EXT.effects.saddle = ({ s, item, api }) => {
  const c = s.cards[item.source] as any;
  if (!c || c.zone !== 'battlefield') return 'done';
  c.saddledTurn = s.turn;
  api.log(s, `${api.nm(s, item.source)} becomes saddled.`, c.controller);
  api.ev(s, { k: 'chosen', iid: item.source, text: 'Saddled' });
  return 'done';
};
EXT.conds.push((t) => (/^~ is saddled$|^it's saddled$/.test(t) ? { k: 'ext', name: 'saddled' } : /^~ isn't saddled$/.test(t) ? { k: 'ext', name: 'saddled', not: true } : null));
EXT.condEval.saddled = (s, c, _you, self) => (!!self && (s.cards[self] as any)?.saddledTurn === s.turn) !== !!c.not;
EXT.triggers.push((cond) => {
  if (/^whenever ~ attacks while saddled$/.test(cond)) return [{ event: 'attacks', cond: { k: 'ext', name: 'saddled' } }];
  if (/^whenever ~ becomes saddled(?: for the first time each turn)?$/.test(cond)) return [{ event: 'saddled' }];
  return null;
});

// ------------------------------------------------------------------------------------------
// Clash with an opponent (701.23)
// ------------------------------------------------------------------------------------------
EXT.rules.push([/^clash with an opponent$/, () => [{ k: 'ext', name: 'clash' }]]);
EXT.effects.clash = ({ s, item, r, you, api }) => {
  const o = api.opp(you) as PlayerIdx;
  if (!r.sub) {
    const mine = api.P(s, you).library[0];
    const theirs = api.P(s, o).library[0];
    const mv = (x?: string) => (x ? s.defs[s.cards[x].defId].cmc ?? 0 : -1);
    const won = mv(mine) > mv(theirs);
    (s as any).lastClash = { p: you, won, turn: s.turn };
    (item as any).didLast = won;
    for (const [p, x] of [[you, mine], [o, theirs]] as [PlayerIdx, string | undefined][]) if (x) api.ev(s, { k: 'reveal', iid: x, p, name: api.nm(s, x), image: api.cardImageOf(s, x) });
    api.log(s, `Clash: ${mine ? api.nm(s, mine) : 'nothing'} (${Math.max(0, mv(mine))}) vs ${theirs ? api.nm(s, theirs) : 'nothing'} (${Math.max(0, mv(theirs))}) — ${won ? 'you win' : 'you lose'}.`, you);
    r.sub = { mine, theirs, step: 0 };
  }
  // each player may put their revealed card on the bottom
  while (r.sub.step < 2) {
    const p = (r.sub.step === 0 ? you : o) as PlayerIdx;
    const card = r.sub.step === 0 ? r.sub.mine : r.sub.theirs;
    if (!card) { r.sub.step++; continue; }
    if (r.sub.asked !== r.sub.step) {
      r.sub.asked = r.sub.step;
      r.sub.answered = undefined;
      api.pushPrompt(s, { id: api.uid(s, 'p'), player: p, kind: 'yesno', title: `Clash: put ${api.nm(s, card)} on the bottom of your library?`, options: [{ id: 'yes', label: 'Bottom' }, { id: 'no', label: 'Keep on top' }], cards: [card], data: { ctx: 'resolve' } });
      return 'wait';
    }
    if (r.sub.answered === 'yes' && s.cards[card]?.zone === 'library') api.moveCard(s, card, 'libraryBottom');
    r.sub.step++;
  }
  return 'done';
};
EXT.conds.push((t) => (/^you (?:win|won)(?: the clash)?$/.test(t) ? { k: 'youDid' } : null));

// ------------------------------------------------------------------------------------------
// Ascend / the city's blessing (702.131)
// ------------------------------------------------------------------------------------------
EXT.lines.push((line, pc) => {
  if (line !== 'ascend') return false;
  pc.ascend = true;
  return true;
});
const checkAscend = (s: GameState, p: PlayerIdx, api: any, extra = false) => {
  const pl = s.players[p] as any;
  if (pl.citysBlessing) return;
  const mine = s.battlefield.filter((b) => s.cards[b].controller === p);
  if (mine.length < 10) return;
  if (!extra && !mine.some((b) => (api.chars(s, b).pc as any).ascend)) return;
  pl.citysBlessing = true;
  api.log(s, `${pl.name} gets the city's blessing.`, p, 'turn');
  api.ev(s, { k: 'pcounter', p, counter: 'blessing', n: 1 });
};
EXT.hooks.afterMove.push((s, iid, _f, to, _o, api) => { if (to === 'battlefield' && s.cards[iid]) checkAscend(s, s.cards[iid].controller, api); });
EXT.hooks.event.push((s, name, d, api) => { if (name === 'cast' && (api.chars(s, d.item.source).pc as any).ascend) checkAscend(s, d.item.controller, api, true); });
EXT.conds.push((t) => (/^you have the city's blessing$/.test(t) ? { k: 'ext', name: 'blessing' } : /^you don't have the city's blessing$/.test(t) ? { k: 'ext', name: 'blessing', not: true } : null));
EXT.condEval.blessing = (s, c, you) => !!(s.players[you] as any).citysBlessing !== !!c.not;

// ------------------------------------------------------------------------------------------
// Job select (FIN): create a 1/1 Hero token and attach this Equipment to it
// ------------------------------------------------------------------------------------------
EXT.lines.push((line, pc) => {
  if (line !== 'job select') return false;
  pc.triggers.push({ event: 'etb', text: line, ability: emptyAb(line, [
    { k: 'token', n: 1, who: { t: 'you' }, token: { name: 'Hero', power: '1', toughness: '1', colors: [], types: 'Token Creature — Hero', keywords: [], oracle: '' } },
    { k: 'attach', what: { t: 'self' }, to: { t: 'lastToken' } },
  ]) });
  return true;
});

// ------------------------------------------------------------------------------------------
// Leylines: begin the game with it on the battlefield
// ------------------------------------------------------------------------------------------
EXT.lines.push((line, pc) => {
  if (!/^if ~ is in your opening hand, you may begin the game with it on the battlefield$/.test(line)) return false;
  pc.leyline = true;
  return true;
});
EXT.hooks.step.push((s, step, api) => {
  if ((s as any).leylinesDone || step !== 'upkeep') return;
  (s as any).leylinesDone = true;
  for (const pl of s.players) for (const h of [...pl.hand]) {
    if (!(api.parsedFor(s, s.cards[h]) as any).leyline) continue;
    api.moveCard(s, h, 'battlefield', { controller: pl.idx });
    api.log(s, `${pl.name} begins the game with ${api.nm(s, h)} on the battlefield.`, pl.idx);
  }
});

// ------------------------------------------------------------------------------------------
// Library shuffles and "then draws" with the subject carried over
// ------------------------------------------------------------------------------------------
const PLAYER = '(each player|you|target player|target opponent|each opponent|that player|its controller|its owner)';
EXT.rules.push([new RegExp(`^${PLAYER} shuffles? (?:their|your|his or her) (hand and graveyard|hand|graveyard) into (?:their|your|his or her) library$`), (m, ctx) => {
  const who = m[1] === 'you' ? { t: 'you' } : parsePlayerSubject(m[1], ctx);
  return who ? [{ k: 'ext', name: 'shuffleInto', who, what: m[2] }] : null;
}]);
EXT.rules.push([/^shuffle your (hand and graveyard|hand|graveyard) into your library$/, (m) => [{ k: 'ext', name: 'shuffleInto', who: { t: 'you' }, what: m[1] }]]);
EXT.rules.push([new RegExp(`^${PLAYER} shuffles?(?: their library| his or her library)?$`), (m, ctx) => {
  const who = m[1] === 'you' ? { t: 'you' } : parsePlayerSubject(m[1], ctx);
  return who ? [{ k: 'ext', name: 'shuffleInto', who, what: '' }] : null;
}]);
EXT.effects.shuffleInto = ({ s, item, e, api }) => {
  for (const p of api.subjPlayers(s, item, e.who) as PlayerIdx[]) {
    const pl = api.P(s, p);
    const move = [...(/hand/.test(e.what) ? pl.hand : []), ...(/graveyard/.test(e.what) ? pl.graveyard : [])];
    for (const c of move) api.moveCard(s, c, 'library');
    api.shuffleArr(s, pl.library);
    if (e.what) api.log(s, `${pl.name} shuffles their ${e.what} into their library.`, p);
  }
  return 'done';
};
// "each player shuffles …, then draws seven cards": the second half keeps the subject
EXT.seqs.push((sents, i) => {
  const cur = sents[i];
  const m = cur.match(/^(each player|each opponent|target player|target opponent|that player|its controller|each other player) (?:shuffles|discards|draws|sacrifices|loses|mills|exiles|puts|reveals|searches|gains)\b/);
  if (!m || i + 1 >= sents.length) return null;
  if (/^(draws?|discards?|shuffles?|sacrifices?|loses?|mills?|gains?|puts?|reveals?|exiles?|searches?) /.test(sents[i + 1]) || /^shuffles$/.test(sents[i + 1])) sents[i + 1] = `${m[1]} ${sents[i + 1]}`;
  return null;
});

// ------------------------------------------------------------------------------------------
// Skip your draw step; optional untap
// ------------------------------------------------------------------------------------------
EXT.lines.push((line, pc) => {
  if (line === 'skip your draw step') { pc.skipDraw = true; return true; }
  if (/^you may choose not to untap ~ during your untap step$/.test(line)) {
    pc.activated.push({ ...mkAct("Toggle: don't untap during your untap step", { mana: '', tap: false, untap: false, sacSelf: false }, emptyAb('toggle'), {}), extSpecial: 'stayTapped' });
    return true;
  }
  return false;
});
EXT.specials.stayTapped = (s, _p, iid, _a, api) => {
  const c = s.cards[iid] as any;
  c.stayTapped = !c.stayTapped;
  api.log(s, `${api.nm(s, iid)} will ${c.stayTapped ? 'stay tapped' : 'untap'} during its controller's untap step.`, c.controller);
  api.ev(s, { k: 'chosen', iid, text: c.stayTapped ? 'Stays tapped' : 'Untaps' });
  return null;
};
EXT.hooks.untap.push((s, iid) => ((s.cards[iid] as any)?.stayTapped ? false : undefined));
void n0;

// New-style station tables: "Station (…)\n8+ | Flying, trample" — the last row makes it an artifact creature.
EXT.tables.push((pc, tables, info) => {
  if (!pc.hasStation) return false;
  const rows = tables.flat();
  rows.forEach((row, i) => {
    const gate = { k: 'ext', name: 'counterBand', counter: 'charge', min: row.min, max: 999 };
    for (const part of row.text.split(/\s*\|\s*/)) {
      const kw = parseKeywordList(part);
      if (kw) { pc.statics.push({ kind: 'selfPump', p: 0, t: 0, kw, gate }); continue; }
      const g = parseCard({ id: `station:${part}`, name: info.name, manaCost: '', cmc: 0, typeLine: 'Artifact', oracle: part, colors: [], colorIdentity: [], keywords: [], layout: 'normal' } as any);
      for (const t of g.triggers) pc.triggers.push({ ...t, gate });
      for (const a of g.activated) pc.activated.push({ ...a, gate });
      for (const st of g.statics) pc.statics.push({ ...st, gate });
      for (const k of g.keywords) pc.statics.push({ kind: 'selfPump', p: 0, t: 0, kw: [k], gate });
      pc.unparsed.push(...g.unparsed);
    }
    if (i === rows.length - 1 && info.def?.power != null) pc.statics.push({ kind: 'setPT', setP: +info.def.power || 0, setT: +info.def.toughness || 0, p: 0, t: 0, kw: [], selfAddTypes: ['creature'], gate });
  });
  pc.gated = true;
  return true;
});

// ------------------------------------------------------------------------------------------
// Enter-with-counters variants; lure; life-gain replacement; search for a card by name; move counters
// ------------------------------------------------------------------------------------------
EXT.lines.push((line, pc) => {
  let m: RegExpMatchArray | null;
  if ((m = line.match(/^~ enters tapped with (\w+) ([+-]\d\/[+-]\d|[a-z]+) counters? on it$/))) {
    pc.entersTapped = true;
    (pc.entersCounters ??= []).push({ counter: m[2], n: m[1] === 'x' ? -1 : n0(m[1]) });
    return true;
  }
  if ((m = line.match(/^~ enters with (\w+) ([+-]\d\/[+-]\d|[a-z]+) counters? on it if (.+)$/))) {
    const cond = /^you cast it from your hand$/.test(m[3]) ? { k: 'ext', name: 'castFromHand' } : parseCond(m[3]);
    if (!cond) return false;
    (pc.entersCounters ??= []).push({ counter: m[2], n: m[1] === 'x' ? -1 : n0(m[1]), cond });
    return true;
  }
  if (/^all creatures able to block ~ do so$/.test(line)) { pc.lure = true; return true; }
  if ((m = line.match(/^if you would gain life, you gain that much life plus (\d+) instead$/))) { pc.replacements.push({ k: 'lifePlus', n: +m[1] }); return true; }
  return false;
});
EXT.condEval.castFromHand = (s, _c, _you, self) => !!self && (s.cards[self] as any)?.castFrom === 'hand';
EXT.rules.push([/^all creatures able to block (target creature|~|it|that creature|enchanted creature|equipped creature) (?:this turn )?do so$/, (m, ctx) => {
  const what = m[1] === '~' ? { t: 'self' } : m[1] === 'target creature' ? parseSubject('target creature', ctx) : m[1] === 'enchanted creature' ? { t: 'enchanted' } : m[1] === 'equipped creature' ? { t: 'equipped' } : ctx.last;
  return what ? [{ k: 'ext', name: 'lure', what }] : null;
}]);
EXT.effects.lure = ({ s, item, e, api }) => {
  for (const c of api.subjCards(s, item, e.what)) (s.cards[c] as any).lureTurn = s.turn;
  return 'done';
};
EXT.hooks.validateBlocks.push((s, list, api) => {
  const lures = (s.combat?.attackers ?? []).filter((a) => (api.chars(s, a.iid).pc as any).lure || (s.cards[a.iid] as any)?.lureTurn === s.turn);
  if (!lures.length) return null;
  const def = api.opp(s.active);
  for (const b of s.battlefield) {
    if (s.cards[b].controller !== def || s.cards[b].tapped || !api.chars(s, b).types.has('creature')) continue;
    const able = lures.filter((a) => api.canBlock(s, b, a.iid));
    if (!able.length) continue;
    if (!list.some((x) => x.blocker === b && able.some((a) => a.iid === x.attacker))) return `${api.nm(s, b)} must block ${api.nm(s, able[0].iid)}`;
  }
  return null;
});
EXT.rules.push([/^(you may )?search your library for (?:a|up to one) cards? named (.+?)(?:,| and) (?:reveal (?:it|them),? (?:and )?)?put (?:it|them|that card) (into your hand|onto the battlefield(?: tapped)?)$/, (m) => {
  const names = m[2].split(/,? (?:and\/or|or) (?:a card named )?|, (?:a card named )?/).map((x) => x.trim()).filter(Boolean);
  return [{ k: 'ext', name: 'searchName', names, dest: m[3].startsWith('into') ? 'hand' : 'battlefield', tapped: m[3].endsWith('tapped'), upTo: true }];
}]);
EXT.effects.searchName = ({ s, item, e, r, you, api }) => {
  const self = s.defs[s.cards[item.source]?.defId]?.name?.toLowerCase();
  const want = e.names.map((n: string) => (n === '~' ? self : n.toLowerCase()));
  const lib = api.P(s, you).library as string[];
  if (!r.sub) {
    const cands = lib.filter((c) => want.includes(s.defs[s.cards[c].defId].name.toLowerCase()));
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'chooseCards', title: `Search for ${e.names.join(' / ')}`, cards: cands, min: 0, max: Math.min(cands.length, e.names.length), data: { ctx: 'resolve' } });
    return 'wait';
  }
  for (const c of (r.sub.answer ?? []) as string[]) {
    if (e.dest === 'hand') api.moveCard(s, c, 'hand');
    else api.moveCard(s, c, 'battlefield', { controller: you, tapped: e.tapped });
    api.log(s, `${api.pname(s, you)} finds ${api.nm(s, c)}.`, you);
  }
  api.shuffleArr(s, lib);
  return 'done';
};
EXT.rules.push([/^put (?:its|~'s) counters on (target creature(?: you control)?|target permanent(?: you control)?)$/, (m, ctx) => {
  const what = parseSubject(m[1], ctx);
  return what ? [{ k: 'ext', name: 'moveLkiCounters', what }] : null;
}]);
EXT.effects.moveLkiCounters = ({ s, item, e, api }) => {
  const lki = ((item as any).lkiCounters ?? s.cards[item.source]?.counters ?? {}) as Record<string, number>;
  for (const c of api.subjCards(s, item, e.what)) for (const [k, v] of Object.entries(lki)) if (v > 0) api.addCounters(s, c, k, v);
  return 'done';
};
// "Each creature you control with a +1/+1 counter on it has trample."
EXT.lines.push((line, pc) => {
  const m = line.match(/^each (other )?(.+?) (?:has|gets ([+-]\d+)\/([+-]\d+)(?: and has)?) ?(.*)$/);
  if (!m || line.includes('"')) return false;
  const f = parseFilter(m[2]);
  const kw = m[5] ? parseKeywordList(m[5]) : [];
  if (!f || !kw || (!kw.length && !m[3])) return false;
  if (m[1]) f.other = true;
  f.zone = 'battlefield';
  pc.statics.push({ kind: 'anthem', filter: f, p: m[3] ? +m[3] : 0, t: m[4] ? +m[4] : 0, kw });
  return true;
});
