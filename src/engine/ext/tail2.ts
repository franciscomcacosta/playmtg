// Plugin: more long-tail sentences — hand picks, tutors to the top, opponent-library searches,
// wheels, multikicker, "players can't gain life", day/night on entering, chosen creature types.
import { EXT } from '../ext';
import { parseSentence, parsePlayerSubject, parseFilter, looseFilter, parseCond, parseSubject } from '../oracle';
import type { PlayerIdx } from '../types';

const W: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };
const n0 = (w: string) => (/^\d+$/.test(w) ? +w : W[w] ?? 1);
const cardF = (ph: string) => {
  ph = ph.replace(/ cards?\b/g, '').replace(/^cards?$/, '').trim();
  if (!ph || ph === 'card') return { types: ['card'] };
  const f = looseFilter(ph) ?? parseFilter(ph + ' card');
  if (!f) return null;
  const g: any = { ...f };
  delete g.zone; delete g.owner;
  return g;
};

// "Target player reveals their hand and you choose a nonland card from it. That player discards that card."
EXT.seqs.push((sents, i, ctx, ab) => {
  const a = sents[i].match(/^(target opponent|target player|each opponent|that player) reveals (?:their|his or her) hand and you choose (?:an|a|one)\b ?(.*?) (?:card )?from it$/);
  const c = sents[i + 1]?.match(/^(?:that player|they) discards? (?:that card|it)$/);
  if (!a || !c) return null;
  const who = parsePlayerSubject(a[1], ctx);
  const f = a[2] && a[2] !== 'card' ? cardF(a[2]) : undefined;
  if (!who || f === null) return null;
  ab.effects.push({ k: 'handPick', who, filter: f, upTo: false });
  return 1;
});

// "search your library for a goblin card, reveal it, then shuffle and put that card on top"
EXT.seqs.push((sents, i, _ctx, ab) => {
  const a = sents[i].match(/^(you may )?search your library for (?:a|an) (.+?)(?:, reveal it| and reveal it)?$/);
  if (!a || !/^shuffle and put (?:that card|it) on top(?: of your library)?$/.test(sents[i + 1] ?? '')) return null;
  const f = cardF(a[2]);
  if (!f) return null;
  const eff = { k: 'search', filter: { ...f, zone: 'library' }, n: 1, dest: 'libraryTop', upTo: true };
  ab.effects.push(a[1] ? { k: 'may', effects: [eff], text: 'search your library' } : eff);
  return 1;
});

// "then X" — a sentence split off at ", then" or starting with "Then"
EXT.rules.push([/^then (.+)$/, (m, ctx) => parseSentence(m[1], ctx)]);

// "search target opponent's library for a creature card and put that card onto the battlefield under your control"
EXT.rules.push([/^search (target opponent's|target player's|each opponent's) library for (a|an|up to \w+|any number of) (.+?) and (put (?:that card|it|them|those cards) onto the battlefield under your control|exile (?:it|them|that card))$/, (m, ctx) => {
  const who = m[1].startsWith('each') ? { t: 'eachOpp' } : parsePlayerSubject(m[1].replace(/'s$/, ''), ctx);
  const f = cardF(m[3]);
  if (!who || !f) return null;
  const n = m[2] === 'any number of' ? 99 : n0(m[2].replace(/^up to /, ''));
  return [{ k: 'ext', name: 'searchOpp', who, filter: f, n, dest: m[4].startsWith('put') ? 'battlefield' : 'exile' }];
}]);
EXT.effects.searchOpp = ({ s, item, e, r, you, api }) => {
  const p = (api.subjPlayers(s, item, e.who) as PlayerIdx[])[0];
  if (p == null) return 'done';
  const lib = api.P(s, p).library as string[];
  if (!r.sub) {
    const cands = lib.filter((c) => api.matchesFilter(s, c, { ...e.filter, zone: 'library' }, you));
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'chooseCards', title: `Search ${api.pname(s, p)}'s library`, cards: cands, looked: [...lib], min: 0, max: Math.min(e.n, cands.length), data: { ctx: 'resolve' } } as any);
    return 'wait';
  }
  for (const c of (r.sub.answer ?? []) as string[]) {
    if (e.dest === 'battlefield') api.moveCard(s, c, 'battlefield', { controller: you });
    else api.moveCard(s, c, 'exile');
  }
  api.shuffleArr(s, lib);
  return 'done';
};

// wheels: "discard all the cards in your hand, then draw that many cards"
EXT.rules.push([/^(you|each player|target player|that player) discards? (?:all the cards in (?:your|their) hand|(?:your|their) hand)$/, (m, ctx) => {
  const who = m[1] === 'you' ? { t: 'you' } : parsePlayerSubject(m[1], ctx);
  return who ? [{ k: 'ext', name: 'discardHand', who }] : null;
}]);
EXT.rules.push([/^discard (?:all the cards in )?your hand$/, () => [{ k: 'ext', name: 'discardHand', who: { t: 'you' } }]]);
EXT.effects.discardHand = ({ s, item, e, api }) => {
  let n = 0;
  for (const p of api.subjPlayers(s, item, e.who) as PlayerIdx[]) {
    const hand = [...api.P(s, p).hand];
    for (const c of hand) api.moveCard(s, c, 'graveyard', { cause: 'discard' });
    n = hand.length;
    if (hand.length) api.log(s, `${api.pname(s, p)} discards their hand (${hand.length}).`, p);
  }
  (item as any).lastCount = n;
  return 'done';
};
EXT.rules.push([/^draw that many cards(?: plus (\w+))?$/, (m) => [{ k: 'ext', name: 'drawThatMany', plus: m[1] ? n0(m[1]) : 0 }]]);
EXT.effects.drawThatMany = ({ s, item, e, you, api }) => { api.drawCards(s, you, ((item as any).lastCount ?? 0) + e.plus); return 'done'; };
EXT.rules.push([/^discard any number of cards$/, () => [{ k: 'ext', name: 'discardAny' }]]);
EXT.effects.discardAny = ({ s, item, r, you, api }) => {
  const hand = api.P(s, you).hand as string[];
  if (!r.sub) {
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'chooseCards', title: 'Discard any number of cards', cards: [...hand], min: 0, max: hand.length, data: { ctx: 'resolve' } });
    return 'wait';
  }
  const ch = (r.sub.answer ?? []) as string[];
  for (const c of ch) api.moveCard(s, c, 'graveyard', { cause: 'discard' });
  (item as any).lastCount = ch.length;
  return 'done';
};

// "Players can't gain life." / "Damage can't be prevented this turn."
EXT.lines.push((line, pc) => {
  if (/^players can't gain life$/.test(line)) { pc.noLifeGain = 'all'; return true; }
  if (/^your opponents can't gain life$/.test(line)) { pc.noLifeGain = 'opp'; return true; }
  if (/^you can't gain life$/.test(line)) { pc.noLifeGain = 'you'; return true; }
  if (/^as ~ enters, choose an opponent$/.test(line)) { pc.chooseOpp = true; return true; }
  if (/^if it's neither day nor night, it becomes day as ~ enters$/.test(line)) { pc.startsDay = true; return true; }
  let m: RegExpMatchArray | null;
  if ((m = line.match(/^multikicker (\{[^}]+\}(?:\{[^}]+\})*)$/))) { pc.multikicker = m[1].toUpperCase(); return true; }
  if ((m = line.match(/^~ enters with (?:a|an) ([+-]\d\/[+-]\d|[a-z]+) counter on it for each time it was kicked$/))) { pc.kickCounters = m[1]; return true; }
  return false;
});
EXT.rules.push([/^(?:players|each player) can't gain life this turn$/, () => [{ k: 'ext', name: 'noGainTurn' }]]);
EXT.effects.noGainTurn = ({ s }) => { (s as any).noGainTurn = s.turn; return 'done'; };
EXT.rules.push([/^damage can't be prevented this turn$/, () => [{ k: 'ext', name: 'noPreventTurn' }]]);
EXT.effects.noPreventTurn = ({ s }) => { (s as any).noPreventTurn = s.turn; return 'done'; };
EXT.hooks.lifeGain.push((s, p, n, api) => {
  if ((s as any).noGainTurn === s.turn) return 0;
  for (const b of s.battlefield) {
    const k = (api.chars(s, b).pc as any).noLifeGain;
    if (!k) continue;
    const ctrl = s.cards[b].controller;
    if (k === 'all' || (k === 'opp' && p !== ctrl) || (k === 'you' && p === ctrl)) return 0;
  }
  return n;
});
EXT.hooks.afterMove.push((s, iid, _f, to, _o, api) => {
  if (to !== 'battlefield' || !s.cards[iid]) return;
  const pc = api.chars(s, iid).pc as any;
  const c = s.cards[iid] as any;
  if (pc.chooseOpp) c.chosenOpponent = api.opp(c.controller);
  if (pc.startsDay && !s.dayNight) { s.dayNight = 'day'; api.ev(s, { k: 'dayNight', to: 'day' }); }
  if (pc.kickCounters && c.kickCount) api.addCounters(s, iid, pc.kickCounters, c.kickCount);
});

// multikicker: offer ×1..×3
EXT.hooks.castOptions.push((s, p, iid, api) => {
  const c = s.cards[iid];
  if (!c || c.zone !== 'hand' || c.owner !== p) return [];
  const pc = api.parsedFor(s, c) as any;
  if (!pc.multikicker) return [];
  const d = s.defs[c.defId];
  const inst = /\binstant\b/i.test(d.typeLine) || pc.keywords.includes('flash');
  const t = s.priority === p && !s.prompt && (inst || (s.active === p && (s.step === 'main1' || s.step === 'main2') && !s.stack.length));
  return [1, 2, 3].map((k) => ({ label: `Cast ${d.name} multikicked ×${k} ${d.manaCost}${pc.multikicker.repeat(k)}`, action: { type: 'cast', iid, alt: `ext:mk${k}` } as any, ok: t && api.canAfford(s, p, d.manaCost + pc.multikicker.repeat(k)) }));
});
for (const k of [1, 2, 3]) EXT.alts[`mk${k}`] = { label: `multikicker ×${k}`, begin: (s, _p, iid, pcFront) => s.defs[s.cards[iid].defId].manaCost + (pcFront.multikicker ?? '').repeat(k), afterPush: (s, item) => { const c = s.cards[item.source] as any; c.kicked = true; c.kickCount = k; } };
EXT.conds.push((t) => (/^(?:~|it) was kicked$/.test(t) ? { k: 'ext', name: 'kickedAny' } : null));
EXT.condEval.kickedAny = (s, _c, _you, self) => !!(self && (s.cards[self] as any)?.kicked);

// "~ becomes the creature type of your choice until end of turn"
EXT.rules.push([/^(~|target creature|it) becomes the creature type of your choice until end of turn$/, () => [{ k: 'choose', what: 'creatureType' }, { k: 'ext', name: 'becomeChosenType' }]]);
EXT.effects.becomeChosenType = ({ s, item, api }) => {
  const c = s.cards[item.source] as any;
  if (!c || c.zone !== 'battlefield' || !c.chosenType) return 'done';
  c.mods.push({ addSubtypes: [c.chosenType], until: 'eot', source: item.source, ts: s.ts++ });
  api.log(s, `${api.nm(s, item.source)} becomes a ${c.chosenType}.`, c.controller);
  return 'done';
};
void parseCond;

// "they lose 2 life" — "they" is the player the trigger refers to
const THIRD: Record<string, string> = { lose: 'loses', gain: 'gains', draw: 'draws', discard: 'discards', mill: 'mills', sacrifice: 'sacrifices', create: 'creates', reveal: 'reveals', exile: 'exiles', put: 'puts', shuffle: 'shuffles', search: 'searches', return: 'returns', get: 'gets' };
EXT.rules.push([/^they (lose|gain|draw|discard|mill|sacrifice|create|reveal|exile|put|shuffle|search|return|get) (.+)$/, (m, ctx) => (ctx.lastPlayer ? parseSentence(`that player ${THIRD[m[1]]} ${m[2]}`, ctx) : null)]);
EXT.rules.push([/^(that player|defending player|target player|target opponent|each opponent) draws an additional card$/, (m, ctx) => {
  const who = m[1] === 'defending player' ? { t: 'defending' } : parsePlayerSubject(m[1], ctx);
  return who ? [{ k: 'draw', n: 1, who }] : null;
}]);
EXT.rules.push([/^defending player discards (a|two|\w+) cards?$/, (m) => [{ k: 'discard', who: { t: 'defending' }, n: n0(m[1]) }]]);
// "target creature can't block ~ this turn"
EXT.rules.push([/^(target creature|that creature|it) can't block ~ this turn$/, (m, ctx) => {
  const w = m[1] === 'target creature' ? parseSubject('target creature', ctx) : ctx.last;
  return w ? [{ k: 'ext', name: 'cantBlockMe', what: w }] : null;
}]);
EXT.effects.cantBlockMe = ({ s, item, e, api }) => {
  for (const c of api.subjCards(s, item, e.what)) (s.cards[c] as any).cantBlockMe = { attacker: item.source, turn: s.turn };
  return 'done';
};
EXT.hooks.canBlock.push((s, b, a) => { const x = (s.cards[b] as any)?.cantBlockMe; return x && x.turn === s.turn && x.attacker === a ? false : undefined; });
// "target opponent gains control of ~"
EXT.rules.push([/^(target opponent|that player|an opponent) gains control of ~$/, (m, ctx) => {
  const who = m[1] === 'an opponent' ? { t: 'eachOpp' } : parsePlayerSubject(m[1], ctx);
  return who ? [{ k: 'ext', name: 'giveSelf', who }] : null;
}]);
EXT.effects.giveSelf = ({ s, item, e, api }) => {
  const p = (api.subjPlayers(s, item, e.who) as PlayerIdx[])[0];
  const c = s.cards[item.source];
  if (p == null || !c || c.zone !== 'battlefield') return 'done';
  c.controller = p;
  (c as any).sick = true;
  api.log(s, `${api.pname(s, p)} gains control of ${api.nm(s, item.source)}.`, p);
  api.ev(s, { k: 'control', iid: item.source, p });
  return 'done';
};
// prevent combat damage dealt by / to a creature
EXT.rules.push([/^prevent all combat damage that would be dealt (by|to and dealt by|to) (target creature|that creature|it|~)(?: this turn)?$/, (m, ctx) => {
  const w = m[2] === '~' ? { t: 'self' } : m[2] === 'target creature' ? parseSubject('target creature', ctx) : ctx.last;
  return w ? [{ k: 'ext', name: 'fogOne', what: w, by: /by/.test(m[1]), to: /to/.test(m[1]) }] : null;
}]);
EXT.effects.fogOne = ({ s, item, e, api }) => {
  for (const c of api.subjCards(s, item, e.what)) (s.cards[c] as any).fogOne = { turn: s.turn, by: e.by, to: e.to };
  return 'done';
};
EXT.hooks.damage.push((s, src, to, n, combat) => {
  if (!combat) return n;
  const a = (s.cards[src] as any)?.fogOne;
  if (a && a.turn === s.turn && a.by) return 0;
  if (to.kind === 'card') { const b = (s.cards[to.iid] as any)?.fogOne; if (b && b.turn === s.turn && b.to) return 0; }
  return n;
});
// depletion counters
EXT.lines.push((line, pc) => {
  if (/^~ doesn't untap during your untap step if it has a depletion counter on it$/.test(line)) { pc.depletionLock = true; return true; }
  return false;
});
EXT.hooks.untap.push((s, iid, api) => ((api.chars(s, iid).pc as any).depletionLock && (s.cards[iid].counters.depletion ?? 0) > 0 ? false : undefined));
EXT.conds.push((t) => (/^there are no (\w+) counters on ~$/.test(t) ? { k: 'ext', name: 'noCounters', counter: t.match(/^there are no (\w+)/)![1] } : null));
EXT.condEval.noCounters = (s, c, _you, self) => !!self && !((s.cards[self]?.counters[c.counter] ?? 0) > 0);
