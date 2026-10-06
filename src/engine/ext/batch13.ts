// Plugin: assorted one-liners (round 13).
import { EXT } from '../ext';
import { looseFilter, matchTriggerCond, parseAmtPhrase, parseCard, parseCond, parseCountPhrase, parseKeywordList, parsePlayerSubject, parseSentence, parseSubject } from '../oracle';
import { SUBTYPES } from '../subtypes';
import { baseChars, chars, evalAmt, evalCond, matchesFilter, sourcesWith } from '../rules';
import { partySize } from './delirium';

const N: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const n0 = (w: string) => N[w] ?? (/^\d+$/.test(w) ? +w : undefined);
const CN: Record<string, string> = { W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green' };

// "Enchanted creature can't be blocked." / "Equipped creature gets +1/+1 and is every creature type." /
// "Enchanted creature can block only creatures with flying."
EXT.lines.push((line, pc) => {
  let m = line.match(/^(enchanted|equipped) creature can't be blocked$/);
  if (m) { pc.statics.push({ kind: 'attachPump', attach: m[1], p: 0, t: 0, kw: [], unblockable: true } as any); return true; }
  m = line.match(/^(enchanted|equipped) creature gets ([+-]\d+)\/([+-]\d+) and is every creature type$/);
  if (m) { pc.statics.push({ kind: 'attachPump', attach: m[1], p: +m[2], t: +m[3], kw: ['changeling'] } as any); return true; }
  m = line.match(/^(enchanted|equipped) creature is every creature type$/);
  if (m) { pc.statics.push({ kind: 'attachPump', attach: m[1], p: 0, t: 0, kw: ['changeling'] } as any); return true; }
  return false;
});

// "Creatures with flying don't untap during their controllers' untap steps."
EXT.lines.push((line, pc) => {
  const m = line.match(/^(creatures with [a-z ]+|creatures without [a-z ]+|tapped creatures|(?:white|blue|black|red|green) creatures|artifact creatures) don't untap during their controllers' untap steps$/);
  if (!m) return false;
  const f = looseFilter(m[1]);
  if (!f) return false;
  (pc as any).groupNoUntap2 = { ...f, zone: undefined };
  return true;
});
EXT.hooks.untap.push((s, iid, api) => {
  for (const b of sourcesWith(s, 'groupNoUntap2')) {
    const f = (api.chars(s, b).pc as any).groupNoUntap2;
    if (f && api.matchesFilter(s, iid, { ...f, zone: 'battlefield' }, s.cards[b].controller, b)) return false;
  }
  return undefined;
});

// "Creatures you control gain protection from the chosen color until end of turn."
EXT.rules.push([/^(creatures you control|target creature|that creature|~) gains? protection from the chosen color until end of turn$/, (m, ctx) => {
  const what = m[1] === '~' ? { t: 'self' } : m[1] === 'creatures you control' ? { t: 'all', filter: { types: ['creature'], controller: 'you', zone: 'battlefield' } } : parseSubject(m[1], ctx);
  return what ? [{ k: 'ext', name: 'protChosen', what }] : null;
}]);
EXT.effects.protChosen = ({ s, item, e, api }) => {
  const col = (s.cards[item.source] as any)?.chosenColor ?? (item as any).chosenColor;
  if (!col || !CN[col]) return 'done';
  for (const c of api.subjCards(s, item, e.what)) if (s.cards[c]?.zone === 'battlefield') s.cards[c].mods.push({ keywords: [`protection from ${CN[col]}`], until: 'eot', source: item.source, ts: s.ts++ } as any);
  return 'done';
};

// "That creature's controller sacrifices a land of their choice." / "Sacrifice a token."
EXT.rules.push([/^(that creature's controller|its controller|that player|target player|each opponent|each player|you)? ?sacrifices? (a|an|one|two|three) (.+?)(?: of their choice)?$/, (m, ctx) => {
  const who = !m[1] || m[1] === 'you' ? { t: 'you' } : parsePlayerSubject(m[1], ctx);
  if (!who) return null;
  const ph = m[3];
  const f = ph === 'token' || ph === 'tokens' ? { token: true } : looseFilter(ph);
  if (!f) return null;
  return [{ k: 'sacrifice', who, filter: { ...f, zone: 'battlefield' }, n: N[m[2]] } as any];
}]);

// "You lose 1 life and add {C}." / "Add {R} and you lose 1 life."
EXT.rules.push([/^you lose (\d+) life and (add .+)$/, (m, ctx) => {
  const add = parseSentence(m[2], ctx);
  return add && !add.some((e: any) => e.k === 'manual') ? [{ k: 'lose', n: +m[1], who: { t: 'you' } } as any, ...add] : null;
}]);

// "Destroy all Equipment attached to that creature." / "… Auras attached to …"
EXT.rules.push([/^destroy all (equipment|auras) attached to (that creature|target creature|it|~)$/, (m, ctx) => {
  const what = m[2] === '~' ? { t: 'self' } : m[2] === 'target creature' ? parseSubject(m[2], ctx) : ctx.last ?? { t: 'self' };
  return what ? [{ k: 'ext', name: 'destroyAttached', what, sub: m[1] === 'equipment' ? 'equipment' : 'aura' }] : null;
}]);
EXT.effects.destroyAttached = ({ s, item, e, api }) => {
  const hosts = api.subjCards(s, item, e.what);
  for (const b of [...s.battlefield]) if (hosts.includes(s.cards[b]?.attachedTo) && api.chars(s, b).subtypes.has(e.sub)) api.destroy(s, b);
  return 'done';
};

// "Return ~ and another target creature to their owners' hands."
EXT.rules.push([/^return ~ and (another target .+?|target .+?) to their owners' hands$/, (m, ctx) => {
  const what = parseSubject(m[1].replace(/^another /, ''), ctx);
  return what ? [{ k: 'bounce', what } as any, { k: 'bounce', what: { t: 'self' } } as any] : null;
}]);

// "Attach target Equipment you control to target creature you control."
EXT.rules.push([/^attach (target equipment(?: you control)?) to (target creature(?: you control)?|it|that creature|~)$/, (m, ctx) => {
  const eq = parseSubject(m[1], ctx);
  const to = m[2] === '~' ? { t: 'self' } : /^target/.test(m[2]) ? parseSubject(m[2], ctx) : ctx.last;
  return eq && to ? [{ k: 'ext', name: 'attachEq', eq, to }] : null;
}]);
EXT.effects.attachEq = ({ s, item, e, api }) => {
  const to = api.subjCards(s, item, e.to)[0];
  if (!to || s.cards[to]?.zone !== 'battlefield') return 'done';
  for (const q of api.subjCards(s, item, e.eq)) if (s.cards[q]?.zone === 'battlefield' && s.cards[q].controller === s.cards[to].controller) { s.cards[q].attachedTo = to; api.log(s, `${api.nm(s, q)} is attached to ${api.nm(s, to)}.`); }
  return 'done';
};

// "Put the cards in your hand on the bottom of your library in any order."
EXT.rules.push([/^put (?:the cards in your hand|your hand) on the bottom of your library in any order$/, () => [{ k: 'ext', name: 'handBottom' }]]);
EXT.effects.handBottom = ({ s, you, api }) => {
  for (const c of [...s.players[you].hand]) { api.moveCard(s, c, 'library'); const L = s.players[you].library; const i = L.indexOf(c); if (i >= 0) { L.splice(i, 1); L.push(c); } }
  return 'done';
};

// "Detain up to two target creatures your opponents control."
EXT.rules.push([/^detain (up to \w+ target .+)$/, (m, ctx) => { const w = parseSubject(m[1], ctx); return w ? [{ k: 'ext', name: 'detain', what: w }] : null; }]);

// "Return it to your hand at the beginning of the next end step."
EXT.rules.push([/^return (it|~|that card) to your hand at the beginning of the next end step$/, (m, ctx) => [{ k: 'ext', name: 'endBounce', what: m[1] === '~' ? { t: 'self' } : ctx.last ?? { t: 'self' } }]]);

// "an opponent has eight or more cards in their graveyard"
EXT.conds.push((t) => {
  const m = t.match(/^an opponent has (\w+) or more cards in (?:their|his or her) graveyard$/);
  return m && n0(m[1]) ? { k: 'ext', name: 'oppGyN', n: n0(m[1]) } : null;
});
EXT.condEval.oppGyN = (s, c, you) => s.players[1 - you].graveyard.length >= c.n;
void parseCond;

// ---- batch 13b ----
const subj = (p: string, ctx: any): any => (p === '~' ? { t: 'self' } : /^(it|that creature|that card)$/.test(p) ? ctx.last ?? null : parseSubject(p, ctx));
// "Suspect enchanted creature." / "Shuffle enchanted creature into its owner's library."
EXT.rules.push([/^suspect (enchanted creature|equipped creature)$/, (m, ctx) => { const w = parseSubject(m[1], ctx); return w ? [{ k: 'ext', name: 'suspect', what: w }] : null; }]);
EXT.rules.push([/^shuffle (enchanted creature|equipped creature|that creature|it) into its owner's library$/, (m, ctx) => { const w = subj(m[1], ctx); return w ? [{ k: 'ext', name: 'shuffleIn', what: w }] : null; }]);
// "Destroy ~ at the beginning of the next end step." / "Destroy target creature at the beginning of the next end step."
EXT.rules.push([/^(destroy|sacrifice|exile) (~|target creature|target permanent) at the beginning of the next end step$/, (m, ctx) => {
  const eff = parseSentence(`${m[1]} ${m[2]}`, ctx);
  if (!eff || eff.some((e: any) => e.k === 'manual')) return null;
  return [{ k: 'delayed', at: 'nextEnd', effects: eff } as any];
}]);
// "That player mills that many cards." / "Target player mills half their library, rounded down."
EXT.rules.push([/^(that player|target player|each opponent|target opponent) mills that many cards$/, (m, ctx) => {
  const who = m[1] === 'that player' ? ctx.lastPlayer ?? { t: 'triggerPlayer' } : parsePlayerSubject(m[1], ctx);
  return who ? [{ k: 'mill', who, n: { ext: 'thatMany' } } as any] : null;
}]);
EXT.rules.push([/^(target player|each opponent|target opponent|each player) mills half (?:their|his or her) library, rounded (down|up)$/, (m, ctx) => {
  const who = parsePlayerSubject(m[1], ctx);
  return who ? [{ k: 'ext', name: 'millHalf', who, up: m[2] === 'up' }] : null;
}]);
EXT.effects.millHalf = ({ s, item, e, api }) => {
  for (const p of api.subjPlayers(s, item, e.who)) { const L = s.players[p].library; const k = e.up ? Math.ceil(L.length / 2) : Math.floor(L.length / 2); for (const c of L.slice(0, k)) api.moveCard(s, c, 'graveyard'); }
  return 'done';
};
// "Enchanted creature gets +1/+1 and doesn't untap during its controller's untap step."
EXT.lines.push((line, pc) => {
  const m = line.match(/^(enchanted|equipped) (creature|permanent) (?:gets ([+-]\d+)\/([+-]\d+) and )?doesn't untap during its controller's untap step(?: and its activated abilities can't be activated)?$/);
  if (!m) return false;
  pc.statics.push({ kind: 'attachPump', attach: m[1], p: m[3] ? +m[3] : 0, t: m[4] ? +m[4] : 0, kw: [], noUntap: true } as any);
  if (/activated abilities/.test(line)) (pc as any).attachNoAct = { manaOk: false };
  return true;
});
// "Enchanted creature's activated abilities can't be activated."
EXT.lines.push((line, pc) => {
  if (!/^enchanted (creature|permanent)'s activated abilities can't be activated$/.test(line)) return false;
  (pc as any).attachNoAct = { manaOk: false };
  return true;
});
// "You gain life equal to target creature's power." / "You lose life equal to that creature's toughness."
EXT.rules.push([/^you (gain|lose) life equal to (target creature|that creature|it|enchanted creature|equipped creature)'s (power|toughness)$/, (m, ctx) => {
  const w = subj(m[2], ctx);
  return w ? [{ k: 'ext', name: 'lifeByStat', what: w, stat: m[3], gain: m[1] === 'gain' }] : null;
}]);
EXT.effects.lifeByStat = ({ s, item, e, you, api }) => {
  const c = api.subjCards(s, item, e.what)[0];
  if (!c || !s.cards[c]) return 'done';
  const ch = api.chars(s, c);
  const n = Math.max(0, e.stat === 'power' ? ch.power : ch.toughness);
  if (e.gain) api.gainLife(s, you, n); else api.loseLife(s, you, n);
  return 'done';
};
// "Sacrifice all creatures you control." / "Each player sacrifices all lands they control."
EXT.rules.push([/^(?:sacrifice|each player sacrifices) all (creatures|lands|artifacts|enchantments|permanents|nonland permanents) (?:you|they) control$/, (m) => [{ k: 'ext', name: 'sacAll', each: /each player/.test(m[0]), type: m[1] }]]);
EXT.effects.sacAll = ({ s, e, you, api }) => {
  const f = looseFilter(e.type.replace(/s$/, '')) ?? {};
  for (const b of [...s.battlefield]) if ((e.each || s.cards[b].controller === you) && api.matchesFilter(s, b, { ...f, zone: 'battlefield' }, s.cards[b].controller)) api.moveCard(s, b, 'graveyard', { cause: 'sacrifice' });
  return 'done';
};
// "~ can't attack unless there are seven or more cards in your graveyard." / "… unless you've cast a creature spell this turn"
EXT.lines.push((line, pc) => {
  const m = line.match(/^~ can't (attack|block|attack or block) unless (.+)$/);
  if (!m) return false;
  const cond = parseCond(m[2]);
  if (!cond) return false;
  (pc as any).cantUnless = { what: m[1], cond };
  return true;
});
EXT.hooks.canAttack.push((s, iid, api) => { const r = (api.chars(s, iid).pc as any).cantUnless; if (r && r.what !== 'block' && !api.evalCond(s, r.cond, s.cards[iid].controller, iid)) return false; return undefined; });
EXT.hooks.canBlock.push((s, b, _a, api) => { const r = (api.chars(s, b).pc as any).cantUnless; if (r && r.what !== 'attack' && !api.evalCond(s, r.cond, s.cards[b].controller, b)) return false; return undefined; });
EXT.conds.push((t) => (t === "you've cast a creature spell this turn" ? { k: 'ext', name: 'castKindTurn', kind: 'creature' } : t === "you've cast a noncreature spell this turn" ? { k: 'ext', name: 'castKindTurn', kind: 'noncreature' } : null));
EXT.condEval.castKindTurn = (s, c, you) => { const r: any = (s.players[you] as any).castKinds; return r?.turn === s.turn && r[c.kind] > 0; };
// "Target player becomes the monarch." / "That player discards a card." / "That player adds {C}{C}."
EXT.rules.push([/^(target player|target opponent|that player|defending player) becomes the monarch$/, (m, ctx) => {
  const who = m[1] === 'that player' ? ctx.lastPlayer ?? { t: 'triggerPlayer' } : parsePlayerSubject(m[1], ctx);
  return who ? [{ k: 'ext', name: 'monarchTo', who }] : null;
}]);
EXT.effects.monarchTo = ({ s, item, e, api }) => {
  const p = api.subjPlayers(s, item, e.who)[0];
  if (p === undefined) return 'done';
  (s as any).monarch = p;
  api.log(s, `${api.pname(s, p)} becomes the monarch.`, p, 'turn');
  api.ev(s, { k: 'monarch', p });
  return 'done';
};
EXT.rules.push([/^that player (discards|draws|mills) (a|one|two|three) cards?( at random)?$/, (m, ctx) => {
  const who = ctx.lastPlayer ?? { t: 'triggerPlayer' };
  const n = N[m[2]];
  return m[1] === 'discards' ? [{ k: 'discard', who, n, random: !!m[3] } as any] : m[1] === 'draws' ? [{ k: 'draw', who, n } as any] : [{ k: 'mill', who, n } as any];
}]);
EXT.rules.push([/^(that player|they) adds? ((?:\{[wubrgc]\})+)$/, (m, ctx) => [{ k: 'ext', name: 'addManaTo', who: ctx.lastPlayer ?? { t: 'triggerPlayer' }, mana: m[2].toUpperCase() }]]);
EXT.effects.addManaTo = ({ s, item, e, api }) => {
  const p = api.subjPlayers(s, item, e.who)[0];
  if (p === undefined) return 'done';
  for (const x of e.mana.match(/\{(.)\}/g) ?? []) (s.players[p].pool as any)[x[1]]++;
  return 'done';
};
// "You and that player each draw that many cards."
EXT.rules.push([/^you and that player each draw that many cards$/, (_m, ctx) => [{ k: 'draw', who: { t: 'you' }, n: { ext: 'thatMany' } } as any, { k: 'draw', who: ctx.lastPlayer ?? { t: 'triggerPlayer' }, n: { ext: 'thatMany' } } as any]]);
// "That player skips their next untap step." / "Target player skips …"
EXT.rules.push([/^(that player|target player|target opponent|you|each opponent) skips? (?:their|your) next untap step$/, (m, ctx) => {
  const who = m[1] === 'that player' ? ctx.lastPlayer ?? { t: 'triggerPlayer' } : m[1] === 'you' ? { t: 'you' } : parsePlayerSubject(m[1], ctx);
  return who ? [{ k: 'ext', name: 'skipUntapP', who }] : null;
}]);
EXT.effects.skipUntapP = ({ s, item, e, api }) => { for (const p of api.subjPlayers(s, item, e.who)) (s.players[p] as any).skipUntap = ((s.players[p] as any).skipUntap ?? 0) + 1; return 'done'; };
EXT.hooks.untap.push((s, iid) => { const p: any = s.players[s.cards[iid].controller]; return p.skipUntapTurn === s.turn ? false : undefined; });
EXT.hooks.step.push((s, step) => {
  if (step !== 'untap') return;
  const p: any = s.players[s.active];
  if (p.skipUntap > 0 && p.skipUntapTurn !== s.turn) { p.skipUntap--; p.skipUntapTurn = s.turn; }
});

// ---- batch 13c ----
// "Non-Elf creatures get -2/-2 until end of turn." / "Goblin creatures get +1/+1 until end of turn."
EXT.rules.push([/^(non-?)?([a-z]+) creatures( you control| your opponents control)? get ([+-]\d+)\/([+-]\d+)(?: and gain ([a-z ]+))? until end of turn$/, (m) => {
  const sub = m[2];
  if (['other', 'all', 'attacking', 'blocking', 'tapped', 'untapped', 'white', 'blue', 'black', 'red', 'green', 'artifact', 'legendary', 'token'].includes(sub)) return null;
  const f: any = { types: ['creature'], ...(m[1] ? { notTypes: [sub] } : { subtypes: [sub] }) };
  if (m[3] === ' you control') f.controller = 'you';
  if (m[3] === ' your opponents control') f.controller = 'opp';
  const kw = m[6] ? m[6].split(/,? and |, /).map((x) => x.trim()) : [];
  return [{ k: 'pump', what: { t: 'all', filter: f }, p: +m[4], t: +m[5], kw, eot: true, neg: false } as any];
}]);
// "It can't be regenerated this turn."
EXT.rules.push([/^(it|that creature|they) can't be regenerated this turn$/, (_m, ctx) => (ctx.last ? [{ k: 'ext', name: 'noRegen', what: ctx.last }] : null)]);
// "Create a token that's a copy of target token you control."
EXT.rules.push([/^create a token that's a copy of target token you control$/, (_m, ctx) => {
  const w = parseSubject('target creature you control', ctx);
  if (!w) return null;
  const sp: any = ctx.specs[ctx.specs.length - 1];
  sp.filter = { token: true, controller: 'you', zone: 'battlefield' };
  sp.label = 'target token you control';
  return [{ k: 'tokenCopy', what: w, n: 1, tapped: false } as any];
}]);
// "Exile up to two target cards from graveyards."
EXT.rules.push([/^exile (up to \w+|\w+) target cards? from graveyards$/, (m, ctx) => {
  const w = parseSubject(`${m[1]} target cards from a graveyard`, ctx) ?? parseSubject(`${m[1]} target card from a graveyard`, ctx);
  return w ? [{ k: 'exile', what: w } as any] : null;
}]);
// "Its controller manifests dread." (the controller manifests from their own library)
EXT.rules.push([/^(its|that creature's) controller manifests dread$/, (_m, ctx) => [{ k: 'ext', name: 'manifestFor', what: ctx.last ?? { t: 'self' } }]]);
EXT.effects.manifestFor = ({ s, item, e, api }) => {
  const c = api.subjCards(s, item, e.what)[0] ?? (item as any).triggerObj;
  const p = c && s.cards[c] ? s.cards[c].controller : item.controller;
  const sub = { ...item, controller: p, effects: [{ k: 'manifest', n: 1, dread: true }] } as any;
  s.pendingTriggers.push({ id: api.uid(s, 's'), kind: 'trigger', controller: p, source: item.source, label: item.label, text: 'Manifest dread', effects: sub.effects, targets: [] } as any);
  return 'done';
};
// "Remove a counter from target permanent." (you choose which kind)
EXT.rules.push([/^remove (a|one|two) counters? from (target permanent|target creature|target artifact|it|~)$/, (m, ctx) => {
  const w = subj(m[2], ctx);
  return w ? [{ k: 'ext', name: 'removeAnyCounter', what: w, n: N[m[1]] }] : null;
}]);
EXT.effects.removeAnyCounter = ({ s, item, e, r, you, api }) => {
  const c = api.subjCards(s, item, e.what)[0];
  if (!c || !s.cards[c]) return 'done';
  const kinds = Object.entries(s.cards[c].counters).filter(([, v]) => (v as number) > 0).map(([k]) => k);
  if (!kinds.length) { (item as any).didLast = false; return 'done'; }
  let kind = kinds[0];
  if (kinds.length > 1) {
    if (!r.sub) { r.sub = {}; api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'yesno', title: `${item.label}: remove which counter?`, options: kinds.map((k) => ({ id: k, label: k })), data: { ctx: 'resolve' } }); return 'wait'; }
    if (kinds.includes(r.sub.answered)) kind = r.sub.answered;
  }
  s.cards[c].counters[kind] = Math.max(0, (s.cards[c].counters[kind] ?? 0) - e.n);
  api.log(s, `${item.label}: removes ${e.n} ${kind} counter${e.n > 1 ? 's' : ''} from ${api.nm(s, c)}.`);
  (item as any).didLast = true;
  return 'done';
};
// "If a creature would die this turn, exile it instead."
EXT.rules.push([/^if a creature would die this turn, exile it instead$/, () => [{ k: 'ext', name: 'dieExileTurn' }]]);
EXT.effects.dieExileTurn = ({ s }) => { (s as any).dieExileTurn = s.turn; return 'done'; };
// "~ deals 3 damage to target creature blocking it."
EXT.rules.push([/^~ deals (\d+) damage to target creature (blocking it|it's blocking|blocking or blocked by it)$/, (m, ctx) => {
  const w = parseSubject('target creature', ctx);
  if (!w) return null;
  const sp: any = ctx.specs[ctx.specs.length - 1];
  sp.filter = { ...sp.filter, rel: m[2] === "it's blocking" ? 'blockedBySelf' : m[2] === 'blocking it' ? 'blockingSelf' : 'combatWithSelf' };
  sp.label = `target creature ${m[2]}`;
  return [{ k: 'damage', n: +m[1], to: [w], from: { t: 'self' } } as any];
}]);
// "You draw two cards, lose 2 life." → draw, lose
EXT.rules.push([/^you draw (a|one|two|three|four) cards?,? (?:and )?(?:you )?lose (\d+) life$/, (m) => [{ k: 'draw', n: N[m[1]], who: { t: 'you' } } as any, { k: 'lose', n: +m[2], who: { t: 'you' } } as any]]);
// "Draw a card if it was attacking." / "… if it was blocking"
EXT.rules.push([/^(.+) if it was (attacking|blocking)$/, (m, ctx) => {
  const inner = parseSentence(m[1], ctx);
  if (!inner || inner.some((e: any) => e.k === 'manual')) return null;
  return [{ k: 'if', cond: { k: 'ext', name: 'wasInCombat', what: m[2], ref: ctx.last ?? { t: 'self' } }, effects: inner } as any];
}]);
EXT.condEval.wasInCombat = (s, c, _you, self, ctx: any) => {
  const it = ctx?.item;
  const id = (c.ref?.t === 'triggerObj' ? it?.triggerObj : c.ref?.t === 'self' ? self : it?.triggerObj ?? self) as string | undefined;
  if (!id) return false;
  const lki = (s as any).combatLki?.[id];
  const now = c.what === 'attacking' ? s.combat?.attackers.some((a: any) => a.iid === id) : s.combat?.attackers.some((a: any) => a.blockedBy.includes(id));
  return !!now || lki === c.what;
};
// "Each player may play an additional land on each of their turns."
EXT.lines.push((line, pc) => {
  if (!/^each player may play an additional land on each of their turns$/.test(line)) return false;
  (pc as any).extraLandAll = 1;
  return true;
});
// "Defending player may draw a card." / "That player may draw a card."
EXT.rules.push([/^(defending player|that player|target opponent|each opponent) may draw a card$/, (m, ctx) => {
  const who = m[1] === 'that player' ? ctx.lastPlayer ?? { t: 'triggerPlayer' } : parsePlayerSubject(m[1], ctx);
  return who ? [{ k: 'ext', name: 'oppMayDraw', who }] : null;
}]);
EXT.effects.oppMayDraw = ({ s, item, e, r, api }) => {
  const p = api.subjPlayers(s, item, e.who)[0];
  if (p === undefined) return 'done';
  if (!r.sub) { r.sub = {}; api.pushPrompt(s, { id: api.uid(s, 'p'), player: p, kind: 'yesno', title: `${item.label}: draw a card?`, options: [{ id: 'yes', label: 'Draw' }, { id: 'no', label: 'No' }], data: { ctx: 'resolve' } }); return 'wait'; }
  if (r.sub.answered === 'yes') api.drawCards(s, p, 1);
  return 'done';
};
// "the number of opponents you have" (two players: 1)
EXT.amountPhrases.push((ph) => (/^(?:the number of )?opponents you have$/.test(ph) ? 1 : null));
// "Each creature you control can't be blocked by more than one creature."
EXT.lines.push((line, pc) => {
  const m = line.match(/^(?:each )?creatures? you control(?: with power (\d+) or greater)? can't be blocked by more than (one|two) creatures?$/);
  if (!m) return false;
  (pc as any).groupMaxBlocked = { n: N[m[2]], powMin: m[1] ? +m[1] : undefined };
  return true;
});
EXT.hooks.validateBlocks.push((s, list, api) => {
  const srcs = sourcesWith(s, 'groupMaxBlocked');
  if (!srcs.length) return null;
  for (const a of s.combat?.attackers ?? []) {
    for (const b of srcs) {
      const g = (api.chars(s, b).pc as any).groupMaxBlocked;
      if (s.cards[a.iid]?.controller !== s.cards[b].controller || (g.powMin && api.chars(s, a.iid).power < g.powMin)) continue;
      if (list.filter((x) => x.attacker === a.iid).length > g.n) return `${api.nm(s, a.iid)} can't be blocked by more than ${g.n} creature${g.n > 1 ? 's' : ''}`;
    }
  }
  return null;
});
// "Each opponent who has three or more poison counters loses 2 life."
EXT.rules.push([/^each opponent who has (\w+) or more poison counters loses (\d+) life$/, (m) => [{ k: 'ext', name: 'poisonedLose', min: n0(m[1]) ?? 1, n: +m[2] }]]);
EXT.effects.poisonedLose = ({ s, e, you, api }) => { const o = 1 - you; if (s.players[o].poison >= e.min) api.loseLife(s, o, e.n); return 'done'; };
// "Exile that token at end of combat." / "Sacrifice those tokens at the beginning of the next end step."
EXT.rules.push([/^(exile|sacrifice|destroy) (?:that token|those tokens|the token|the tokens) at end of combat$/, (m) => [{ k: 'ext', name: 'eoc', act: m[1], what: { t: 'lastToken' } }]]);
// "Put a +1/+1 counter on target creature that entered this turn." (filter suffix)
EXT.rules.push([/^(.+?) target (creature|permanent|artifact)( you control)? that entered (?:the battlefield )?this turn$/, (m, ctx) => {
  const k0 = ctx.specs.length;
  const r = parseSentence(`${m[1]} target ${m[2]}${m[3] ?? ''}`, ctx);
  if (!r || r.some((e: any) => e.k === 'manual') || ctx.specs.length !== k0 + 1) { ctx.specs.length = k0; return null; }
  const sp: any = ctx.specs[k0];
  sp.filter = { ...sp.filter, rel: 'enteredThisTurn' };
  sp.label = `${sp.label} that entered this turn`;
  return r;
}]);

// ---- batch 13d ----
// "Prevent all (noncombat|combat) damage that would be dealt to other creatures you control."
EXT.lines.push((line, pc) => {
  const m = line.match(/^prevent all (combat |noncombat )?damage that would be dealt to (other creatures you control|creatures you control|you and other creatures you control|you)$/);
  if (!m) return false;
  const w: any = m[2] === 'you' ? { you: true } : { mine: { types: ['creature'], ...(/other/.test(m[2]) ? { other: true } : {}) }, ...(/^you and/.test(m[2]) ? { you: true } : {}) };
  ((pc as any).dmgMods ??= []).push({ who: w, prevent: 1e9, combat: m[1] === 'combat ', noncombat: m[1] === 'noncombat ' });
  return true;
});
// "All damage that would be dealt to you is dealt to ~ instead." (Palisade Giant)
EXT.lines.push((line, pc) => {
  const m = line.match(/^all (combat )?damage that would be dealt to you(?: and other permanents you control)? is dealt to ~ instead$/);
  if (!m) return false;
  (pc as any).soakYou = { combat: !!m[1], perms: /permanents/.test(line) };
  return true;
});
let soakBusy = false;
EXT.hooks.damage.push((s, source, to, n, combat, api) => {
  if (n <= 0 || soakBusy) return n;
  for (const b of sourcesWith(s, 'soakYou')) {
    const r = (api.chars(s, b).pc as any).soakYou;
    if (r.combat && !combat) continue;
    const ctrl = s.cards[b].controller;
    const hit = (to.kind === 'player' && to.idx === ctrl) || (r.perms && to.kind === 'card' && to.iid !== b && s.cards[to.iid]?.controller === ctrl);
    if (!hit) continue;
    soakBusy = true;
    try { api.dealDamage(s, source, { kind: 'card', iid: b }, n, combat); } finally { soakBusy = false; }
    return 0;
  }
  return n;
});
// "~ enters tapped and doesn't untap during your untap step."
EXT.expand.push((line) => (line === "~ enters tapped and doesn't untap during your untap step" ? ['~ enters tapped', "~ doesn't untap during your untap step"] : null));
// "Spells you cast from your graveyard cost {1} less to cast." / "… from exile …"
EXT.lines.push((line, pc) => {
  const m = line.match(/^(?:(instant and sorcery|creature) )?spells you cast from (your graveyard|exile|anywhere other than your hand) cost \{(\d+)\} less to cast$/);
  if (!m) return false;
  (pc as any).zoneDiscount = [...((pc as any).zoneDiscount ?? []), { zone: m[2] === 'your graveyard' ? 'graveyard' : m[2] === 'exile' ? 'exile' : 'nothand', n: +m[3], kind: m[1] ?? null }];
  return true;
});
const gen = (cost: string, d: number) => { const g = (cost || '').match(/\{(\d+)\}/); const k = g ? +g[1] : 0; const rest = (cost || '').replace(/\{\d+\}/, ''); return k - d > 0 ? `{${k - d}}${rest}` : rest; };
EXT.hooks.costMod.push((s, p, iid, cost, _alt, api) => {
  let out = cost;
  const z = s.cards[iid]?.zone;
  for (const b of sourcesWith(s, 'zoneDiscount')) {
    if (s.cards[b].controller !== p) continue;
    for (const d of (api.chars(s, b).pc as any).zoneDiscount) {
      if (d.zone === 'nothand' ? z === 'hand' : z !== d.zone) continue;
      if (d.kind) { const t = api.chars(s, iid).types; if (d.kind === 'creature' ? !t.has('creature') : !(t.has('instant') || t.has('sorcery'))) continue; }
      out = gen(out, d.n);
    }
  }
  const nx: any = (s.players[p] as any).nextSpellLess;
  if (nx && nx.turn === s.turn && nx.n > 0 && s.cards[iid]?.zone !== 'battlefield') out = gen(out, nx.n);
  return out;
});
// "The next spell you cast this turn costs {1} less to cast."
EXT.rules.push([/^the next spell you cast this turn costs \{(\d+)\} less to cast$/, (m) => [{ k: 'ext', name: 'nextSpellLess', n: +m[1] }]]);
EXT.effects.nextSpellLess = ({ s, e, you }) => { (s.players[you] as any).nextSpellLess = { turn: s.turn, n: e.n }; return 'done'; };
EXT.hooks.event.push((s, name, d) => { if (name === 'cast' && d.item.kind === 'spell') { const pl: any = s.players[d.item.controller]; if (pl.nextSpellLess) pl.nextSpellLess = undefined; } });

// ---- trigger heads ----
EXT.condEval.allOf = (s, c, you, self, ctx) => (c.conds as any[]).every((x) => evalCond(s, x, you, self, ctx));
let inWhen = false;
// "When ~ deals combat damage to a player" (one-shot wording) → the "whenever" form
EXT.triggers.push((cond) => {
  if (inWhen || !/^when (?!ever)/.test(cond)) return null;
  inWhen = true;
  try { return matchTriggerCond(cond.replace(/^when /, 'whenever ')) as any; } finally { inWhen = false; }
});
// "Whenever ~ attacks while you control a creature with power 4 or greater" → attacks + condition
EXT.triggers.push((cond) => {
  const m = cond.match(/^(whenever .+?) while (.+)$/);
  if (!m) return null;
  const c = parseCond(m[2].replace(/^~ is /, "~ is ").replace(/^you control/, 'you control'));
  if (!c) return null;
  const evs = matchTriggerCond(m[1]);
  return evs ? evs.map((e) => ({ ...e, cond: e.cond ? { k: 'ext', name: 'allOf', conds: [e.cond, c] } : c })) as any : null;
});

// Rewrites onto existing trigger heads
const REW: [RegExp, string][] = [
  [/^whenever you attack a player$/, 'whenever you attack'],
  [/^whenever (a creature|one or more creatures) attacks? one of your opponents$/, 'whenever a creature you control attacks'],
  [/^whenever a player attacks one of your opponents$/, 'whenever you attack'],
  [/^when(ever)? ~ is put into your graveyard from the battlefield$/, 'when$1 ~ is put into a graveyard from the battlefield'],
];
EXT.triggers.push((cond) => {
  for (const [re, to] of REW) if (re.test(cond)) { const c2 = cond.replace(re, to); if (c2 !== cond) return matchTriggerCond(c2) as any; }
  return null;
});
// "Whenever ~ or equipped creature deals combat damage to a player" / "Whenever you play a land or cast a spell" /
// "Whenever enchanted creature attacks or blocks" → two triggers
EXT.expand.push((line) => {
  let m = line.match(/^whenever ~ or (equipped|enchanted) creature (deals combat damage to a player|attacks|dies), (.+)$/);
  if (m) return [`whenever ~ ${m[2]}, ${m[3]}`, `whenever ${m[1]} creature ${m[2]}, ${m[3]}`];
  m = line.match(/^whenever you play a land or cast a spell, (.+)$/);
  if (m) return [`whenever a land you control enters, ${m[1]}`, `whenever you cast a spell, ${m[1]}`];
  m = line.match(/^whenever (enchanted|equipped) creature attacks or blocks, (.+)$/);
  if (m) return [`whenever ${m[1]} creature attacks, ${m[2]}`, `whenever ${m[1]} creature blocks, ${m[2]}`];
  return null;
});
const TO = { t: 'triggerObj' };
const TP = { t: 'triggerPlayer' };
// Damage-dealt heads
EXT.triggers.push((cond) => {
  let m: RegExpMatchArray | null;
  if ((m = cond.match(/^whenever a source you control deals (noncombat |combat )?damage to (an opponent|a player|you)$/))) return [{ event: 'dealtX', data: { from: 'yours', to: m[2] === 'you' ? 'you' : m[2] === 'an opponent' ? 'opp' : 'anyP', kind: m[1]?.trim() }, lastPlayer: TP }];
  if ((m = cond.match(/^whenever a source deals (combat )?damage to (~|equipped creature|enchanted creature)$/)) || (m = cond.match(/^whenever (~|equipped creature|enchanted creature) is dealt (combat )?damage$/))) {
    const who = m[2]?.startsWith('combat') ? m[1] : m[2] ?? m[1];
    const combat = /combat/.test(cond);
    const target = /~/.test(cond) ? 'self' : 'attached';
    void who;
    return [{ event: 'dealtX', data: { to: target, kind: combat ? 'combat' : undefined }, last: TO }];
  }
  if ((m = cond.match(/^whenever a creature is dealt damage$/))) return [{ event: 'dealtX', data: { to: 'anyCreature' }, last: TO }];
  if ((m = cond.match(/^whenever a creature deals (combat )?damage to you$/))) return [{ event: 'dealtX', data: { from: 'creature', to: 'you', kind: m[1]?.trim() }, last: TO }];
  if ((m = cond.match(/^whenever a token you control enters$/))) return [{ event: 'otherEtb', filter: { token: true, controller: 'you' }, last: TO }];
  if ((m = cond.match(/^whenever (enchanted|equipped) creature (blocks|becomes blocked)$/))) return [{ event: 'attachCombat', data: { what: m[2] === 'blocks' ? 'blocks' : 'blocked' }, last: { t: m[1] } }];
  return null;
});
EXT.hooks.event.push((s, name, d, api) => {
  if (name === 'dealt') {
    const src = d.source as string;
    const srcCtrl = s.cards[src]?.controller;
    for (const oid of [...api.observers(s)]) {
      const o = s.cards[oid];
      if (!o) continue;
      for (const t of api.chars(s, oid).pc.triggers as any[]) {
        if (t.event !== 'dealtX') continue;
        const D = t.data ?? {};
        if (D.kind === 'combat' && !d.combat) continue;
        if (D.kind === 'noncombat' && d.combat) continue;
        if (D.from === 'yours' && srcCtrl !== o.controller) continue;
        if (D.from === 'creature' && !(s.cards[src] && api.chars(s, src).types.has('creature'))) continue;
        const to = d.to;
        let ok = false;
        if (D.to === 'you') ok = to.kind === 'player' && to.idx === o.controller;
        else if (D.to === 'opp') ok = to.kind === 'player' && to.idx !== o.controller;
        else if (D.to === 'anyP') ok = to.kind === 'player';
        else if (D.to === 'self') ok = to.kind === 'card' && to.iid === oid;
        else if (D.to === 'attached') ok = to.kind === 'card' && to.iid === o.attachedTo;
        else if (D.to === 'anyCreature') ok = to.kind === 'card' && !!s.cards[to.iid] && api.chars(s, to.iid).types.has('creature');
        if (!ok) continue;
        const tobj = D.to === 'anyCreature' ? to.iid : src;
        api.queueTrigger(s, oid, o.controller, t, { triggerObj: tobj, triggerPlayer: to.kind === 'player' ? to.idx : srcCtrl, amount: d.n } as any);
      }
    }
  }
  if (name === 'blocks') {
    const list = d.list as { blocker: string; attacker: string }[];
    for (const oid of [...api.observers(s)]) {
      const o = s.cards[oid];
      if (!o?.attachedTo) continue;
      for (const t of api.chars(s, oid).pc.triggers as any[]) {
        if (t.event !== 'attachCombat') continue;
        const host = o.attachedTo;
        const hit = t.data.what === 'blocks' ? list.some((b) => b.blocker === host) : t.data.what === 'unblocked' ? !!s.combat?.attackers.some((a: any) => a.iid === host) && !list.some((b) => b.attacker === host) : list.some((b) => b.attacker === host);
        if (hit) api.queueTrigger(s, oid, o.controller, t, { triggerObj: host });
      }
    }
  }
});

// More trigger heads
EXT.triggers.push((cond) => {
  let m: RegExpMatchArray | null;
  if ((m = cond.match(/^whenever a player casts their (first|second|third) spell each turn$/))) return [{ event: 'nthCast', data: { n: N[m[1] === 'first' ? 'one' : m[1] === 'second' ? 'two' : 'three'], who: 'any' }, lastPlayer: TP }];
  if ((m = cond.match(/^whenever ~ attack$/))) return matchTriggerCond('whenever ~ attacks') as any;
  // "whenever a creature you control with deathtouch / with a +1/+1 counter on it <verb>"
  if ((m = cond.match(/^whenever (a|an|one or more) (.+?) you control (with .+?) (attacks?|deals? combat damage to a player|dies|die)$/))) {
    const base = matchTriggerCond(`whenever ${m[1]} ${m[2]} you control ${m[4]}`);
    const extra = looseFilter(`${m[2].replace(/s$/, '')} ${m[3]}`);
    if (!base || !extra) return null;
    return base.map((e) => ({ ...e, filter: { ...(e.filter ?? {}), ...extra, controller: undefined, zone: undefined } })) as any;
  }
  if ((m = cond.match(/^whenever (?:you cast a spell|a player casts a spell|an opponent casts a spell) of the chosen color$/))) {
    const who = /^whenever you/.test(cond) ? 'you' : /opponent/.test(cond) ? 'opp' : 'any';
    return who === 'you' ? [{ event: 'castSpell', filter: { types: ['spell'] }, last: TO, cond: { k: 'ext', name: 'castChosenColor' } }] : [{ event: 'anyCast', filter: {}, data: { who }, last: TO, lastPlayer: TP, cond: { k: 'ext', name: 'castChosenColor', opp: who === 'opp' } }];
  }
  if ((m = cond.match(/^when(?:ever)? a creature is put into an opponent's graveyard from the battlefield$/))) return matchTriggerCond('whenever a creature an opponent controls dies') as any;
  return null;
});
EXT.condEval.castChosenColor = (s, c, you, self, ctx: any) => {
  const o = ctx?.triggerObj ?? ctx?.item?.triggerObj;
  const col = self ? (s.cards[self] as any)?.chosenColor : undefined;
  if (c.opp) { const tp = ctx?.triggerPlayer ?? ctx?.item?.triggerPlayer; if (tp !== undefined && tp === you) return false; }
  if (!o || !col || !s.cards[o]) return false;
  return ((s.defs[s.cards[o].defId] as any).colors ?? []).includes(col);
};
EXT.expand.push((line) => {
  let m = line.match(/^whenever ~ enters or transforms into ~, (.+)$/);
  if (m) return [`when ~ enters, ${m[1]}`, `whenever ~ transforms into ~, ${m[1]}`];
  m = line.match(/^whenever ~ enters or deals combat damage to a player, (.+)$/);
  if (m) return [`when ~ enters, ${m[1]}`, `whenever ~ deals combat damage to a player, ${m[1]}`];
  return null;
});

// "the number of cards you've discarded this turn" / "for each card you've discarded this turn"
EXT.hooks.afterMove.push((s, iid, from, to, opts) => {
  if (from !== 'hand' || to !== 'graveyard' || opts?.cause !== 'discard') return;
  const p = s.cards[iid]?.owner;
  if (p === undefined) return;
  const d: any = ((s.players[p] as any).discardedTurn ??= { turn: -1, n: 0 });
  if (d.turn !== s.turn) { d.turn = s.turn; d.n = 0; }
  d.n++;
});
EXT.amountPhrases.push((ph) => (/^(?:the number of )?cards? you've discarded this turn$/.test(ph) ? { ext: 'discardedTurn' } : null));
EXT.amounts.discardedTurn = (s, _a, you) => { const d: any = (s.players[you] as any).discardedTurn; return d?.turn === s.turn ? d.n : 0; };

// "if its prowl / surge / spectacle / sneak / madness / dash / blitz cost was paid"
EXT.hooks.castPay.push((s, pc) => { if (pc.kind === 'spell' && s.cards[pc.iid]) (s.cards[pc.iid] as any).altUsed = typeof pc.alt === 'string' ? pc.alt.replace(/^ext:/, '') : null; });
EXT.conds.push((t) => {
  const m = t.match(/^(?:its|~'s|this spell's) (prowl|surge|spectacle|sneak|madness|dash|blitz|evoke|warp|emerge|bestow|disturb|foretell) cost was paid$/);
  return m ? { k: 'ext', name: 'altPaid', alt: m[1] } : null;
});
EXT.condEval.altPaid = (s, c, _you, self) => {
  const x: any = self ? s.cards[self] : null;
  if (!x) return false;
  return x.altUsed === c.alt || !!x[`${c.alt}Cast`];
};

// ---- more conditions ----
const TL = (s: any) => { const t = (s.tl13 ??= { turn: -1 }); if (t.turn !== s.turn) { s.tl13 = { turn: s.turn, toGyFromBf: [], exiled: 0, entered: [[], []], attacked: [] }; } return s.tl13; };
EXT.hooks.afterMove.push((s, iid, from, to, _o, api) => {
  const t = TL(s);
  const c = s.cards[iid];
  if (!c) return;
  if (from === 'battlefield' && to === 'graveyard') t.toGyFromBf.push([...api.baseChars(s, iid).types]);
  if (to === 'exile') t.exiled++;
  if (to === 'battlefield') t.entered[c.controller].push([...api.baseChars(s, iid).types]);
});
EXT.hooks.event.push((s, name, d) => { if (name === 'attack') { const t = TL(s); for (const a of d.list) t.attacked.push(a.iid); } });
const OUTLAW = ['assassin', 'mercenary', 'pirate', 'rogue', 'warlock'];
const C13: [RegExp, (m: RegExpMatchArray) => any][] = [
  [/^an opponent is the monarch$/, () => ({ k: 'ext', name: 'monarchIs', opp: true })],
  [/^you(?:'re| are) the monarch$/, () => ({ k: 'ext', name: 'monarchIs' })],
  [/^each player has (\d+) or less life$/, (m) => ({ k: 'ext', name: 'eachLifeMax', n: +m[1] })],
  [/^your life total is less than your starting life total$/, () => ({ k: 'ext', name: 'belowStart' })],
  [/^there are no ([a-z]+?)s? on the battlefield$/, (m) => ({ k: 'ext', name: 'noneOnBf', sub: m[1] })],
  [/^you control another (outlaw|[a-z]+)$/, (m) => ({ k: 'ext', name: 'ctrlAnotherSub', subs: m[1] === 'outlaw' ? OUTLAW : [m[1]] })],
  [/^you control (?:an?|one or more) (outlaws?)$/, () => ({ k: 'ext', name: 'ctrlAnotherSub', subs: OUTLAW, any: true })],
  [/^you control another creature named ~$/, () => ({ k: 'ext', name: 'ctrlSameName' })],
  [/^a player has (one|two|zero|no) or fewer cards in hand$/, (m) => ({ k: 'ext', name: 'anyHandMax', n: m[1] === 'two' ? 2 : m[1] === 'one' ? 1 : 0 })],
  [/^(?:it|~) was the (second|third) spell you cast this turn$/, (m) => ({ k: 'ext', name: 'nthSpellIs', n: m[1] === 'second' ? 2 : 3 })],
  [/^~ doesn't have an? ([+-]1\/[+-]1|\w+) counter on it$/, (m) => ({ k: 'ext', name: 'selfNoCounter', kind: m[1], not: true })],
  [/^(?:another )?(\w+) died under your control this turn$/, (m) => (['a', 'an', 'it', 'creature'].includes(m[1]) ? null : { k: 'ext', name: 'diedSub', sub: m[1] })],
  [/^you control an? (artifact|enchantment|creature|planeswalker|land) and an? (artifact|enchantment|creature|planeswalker|land)$/, (m) => ({ k: 'ext', name: 'ctrlBoth', a: m[1], b: m[2] })],
  [/^you control no creatures with ([a-z]+)$/, (m) => ({ k: 'ext', name: 'ctrlNoKw', kw: m[1] })],
  [/^an? (artifact|creature|artifact or creature|nontoken creature) was put into a graveyard from the battlefield this turn$/, (m) => ({ k: 'ext', name: 'tlToGy', types: m[1].replace('nontoken ', '').split(' or ') })],
  [/^one or more cards were put into exile this turn$/, () => ({ k: 'ext', name: 'tlExiled' })],
  [/^an? (creature|land|artifact) entered the battlefield under (your|an opponent's) control this turn$/, (m) => ({ k: 'ext', name: 'tlEntered', type: m[1], opp: m[2] !== 'your' })],
  [/^~ (didn't enter|entered) the battlefield this turn$/, (m) => ({ k: 'ext', name: 'selfEnteredTurn', not: m[1] === "didn't enter" })],
  [/^~ (attacked|didn't attack) this turn$/, (m) => ({ k: 'ext', name: 'selfAttackedTurn', not: m[1] === "didn't attack" })],
  [/^~ didn't attack or come under your control this turn$/, () => ({ k: 'ext', name: 'selfAttackOrNew', not: true })],
  [/^enchanted (?:permanent|creature) is (tapped|untapped)$/, (m) => ({ k: 'ext', name: 'hostTapped', tapped: m[1] === 'tapped' })],
  [/^enchanted creature's power is (\d+) or greater$/, (m) => ({ k: 'ext', name: 'hostPowMin', n: +m[1] })],
  [/^you didn't cast it from your hand$/, () => ({ k: 'ext', name: 'castFromZ', zone: 'hand', not: true })],
  [/^(?:it|~) was cast from your graveyard$/, () => ({ k: 'ext', name: 'castFromZ', zone: 'graveyard' })],
  [/^there are no nonbasic land cards in your library$/, () => ({ k: 'ext', name: 'noNonbasicLib' })],
  [/^(\w+) or more creature cards are in your graveyard$/, (m) => (n0(m[1]) ? { k: 'ext', name: 'gyCreaturesN', n: n0(m[1]) } : null)],
  [/^you control (\w+) or more creatures that share a creature type$/, (m) => (n0(m[1]) ? { k: 'ext', name: 'shareType', n: n0(m[1]) } : null)],
];
EXT.conds.push((t) => { for (const [re, fn] of C13) { const m = t.match(re); if (m) { const r = fn(m); if (r) return r; } } return null; });
const E13 = EXT.condEval;
E13.monarchIs = (s, c, you) => (c.opp ? (s as any).monarch === 1 - you : (s as any).monarch === you);
E13.eachLifeMax = (s, c) => s.players.every((p) => p.life <= c.n);
E13.belowStart = (s, _c, you) => s.players[you].life < ((s as any).startingLife ?? 20);
E13.noneOnBf = (s, c) => !s.battlefield.some((b) => { const ch = chars13(s, b); return ch.subtypes.has(c.sub) || ch.types.has(c.sub); });
E13.ctrlAnotherSub = (s, c, you, self) => s.battlefield.some((b) => (c.any || b !== self) && s.cards[b].controller === you && c.subs.some((x: string) => x === 'permanent' || chars13(s, b).subtypes.has(x) || (chars13(s, b).types as any).has(x)));
E13.ctrlSameName = (s, _c, you, self) => !!self && s.battlefield.some((b) => b !== self && s.cards[b].controller === you && s.cards[b].defId === s.cards[self].defId);
E13.anyHandMax = (s, c) => s.players.some((p) => p.hand.length <= c.n);
E13.nthSpellIs = (s, c, you) => ((s.players[you] as any).spellsCastThisTurn ?? 0) === c.n;
E13.selfNoCounter = (s, c, _y, self) => { const v = !!self && (s.cards[self]?.counters[c.kind] ?? 0) > 0; return c.not ? !v : v; };
E13.ctrlBoth = (s, c, you) => [c.a, c.b].every((t) => s.battlefield.some((b) => s.cards[b].controller === you && chars13(s, b).types.has(t)));
E13.ctrlNoKw = (s, c, you) => !s.battlefield.some((b) => s.cards[b].controller === you && chars13(s, b).keywords.has(c.kw));
E13.tlToGy = (s, c) => TL(s).toGyFromBf.some((ty: string[]) => c.types.some((x: string) => ty.includes(x)));
E13.tlExiled = (s) => TL(s).exiled > 0;
E13.tlEntered = (s, c, you) => TL(s).entered[c.opp ? 1 - you : you].some((ty: string[]) => ty.includes(c.type));
E13.selfEnteredTurn = (s, c, _y, self) => { const v = !!self && (s.cards[self] as any)?.enteredTurn === s.turn; return c.not ? !v : v; };
E13.selfAttackedTurn = (s, c, _y, self) => { const v = !!self && TL(s).attacked.includes(self); return c.not ? !v : v; };
E13.selfAttackOrNew = (s, _c, _y, self) => !(self && (TL(s).attacked.includes(self) || (s.cards[self] as any)?.enteredTurn === s.turn || s.cards[self]?.sick));
E13.hostTapped = (s, c, _y, self) => { const h = self ? s.cards[self]?.attachedTo : undefined; return !!h && !!s.cards[h] && s.cards[h].tapped === c.tapped; };
E13.hostPowMin = (s, c, _y, self) => { const h = self ? s.cards[self]?.attachedTo : undefined; return !!h && !!s.cards[h] && chars(s, h).power >= c.n; };
E13.noNonbasicLib = (s, _c, you) => !s.players[you].library.some((l) => { const d = s.defs[s.cards[l].defId]; return /\bLand\b/.test(d.typeLine) && !/\bBasic\b/.test(d.typeLine); });
E13.gyCreaturesN = (s, c, you) => s.players[you].graveyard.filter((g) => /\bCreature\b/.test(s.defs[s.cards[g].defId].typeLine)).length >= c.n;
E13.shareType = (s, c, you) => {
  const cnt = new Map<string, number>();
  for (const b of s.battlefield) { if (s.cards[b].controller !== you) continue; const ch = chars13(s, b); if (!ch.types.has('creature')) continue; for (const st of ch.subtypes) cnt.set(st, (cnt.get(st) ?? 0) + 1); }
  return [...cnt.values()].some((v) => v >= c.n);
};
EXT.hooks.event.push((s, name, d, api) => {
  if (name !== 'leave' || d.to !== 'graveyard' || !d.wasCreature) return;
  const t = ((s as any).tl13d ??= { turn: -1, subs: [[], []] });
  if (t.turn !== s.turn) { t.turn = s.turn; t.subs = [[], []]; }
  const subs = [...(api.baseChars(s, d.iid).subtypes ?? [])];
  t.subs[d.controller ?? s.cards[d.iid].owner].push(...subs);
});
// base characteristics: these conditions are read while statics are being applied (no recursion into chars)
const chars13 = (s: any, b: string) => baseChars(s, b);

// Plural-name triggers ("When Bebop & Rocksteady enter, …") and Two-Headed Giant wording ("your team" = you here)
EXT.expand.push((line) => {
  let l = line;
  l = l.replace(/^(when(?:ever)? ~) enter([ ,])/, '$1 enters$2').replace(/^(whenever ~) attack([ ,])/, '$1 attacks$2').replace(/^(when(?:ever)? ~) die([ ,])/, '$1 dies$2');
  l = l.replace(/\byour team controls\b/g, 'you control').replace(/\byour team gained life\b/g, 'you gained life').replace(/\byour team\b/g, 'you');
  return l !== line ? [l] : null;
});
EXT.conds.push((t) => {
  if (t === 'you have a full party') return { k: 'ext', name: 'fullParty' };
  if (/^(?:that spell|it) was kicked$/.test(t)) return { k: 'ext', name: 'trigKicked' };
  if (/^it had (?:one or more|any) counters on it$/.test(t)) return { k: 'ext', name: 'lkiCounters', min: 1 };
  if (/^it had no counters on it$/.test(t)) return { k: 'ext', name: 'lkiCounters', max: 0 };
  return null;
});
EXT.condEval.fullParty = (s, _c, you) => partySize(s, you) >= 4;
EXT.condEval.trigKicked = (s, _c, _y, _self, ctx: any) => { const o = ctx?.triggerObj ?? ctx?.item?.triggerObj; return !!o && !!(s.cards[o] as any)?.kicked; };
EXT.condEval.lkiCounters = (s, c, _y, self, ctx: any) => {
  const lk = ctx?.lkiCounters ?? ctx?.item?.lkiCounters ?? (self ? s.cards[self]?.counters : undefined) ?? {};
  const n = Object.values(lk as Record<string, number>).reduce((a, b) => a + (b > 0 ? b : 0), 0);
  return c.max !== undefined ? n <= c.max : n >= c.min;
};

// "You may search your library and/or graveyard for a card named Ajani, Valiant Protector, reveal it, and put it into
// your hand. If you search your library this way, shuffle." (planeswalker-deck cards)
EXT.seqs.push((sents, i, _ctx, ab) => {
  const m = sents[i].match(/^(you may )?search your (library and\/or graveyard|graveyard, hand, and\/or library|library|hand, graveyard, and\/or library) for a card named (.+?), (?:reveal it, )?(?:and )?put it (into your hand|onto the battlefield)$/);
  if (!m) return null;
  const n = /^if you search your library this way, shuffle$/.test(sents[i + 1] ?? '') ? 2 : 1;
  const eff = { k: 'ext', name: 'searchNamed', name2: m[3], zones: m[2], dest: m[4] === 'into your hand' ? 'hand' : 'battlefield' };
  ab.effects.push(m[1] ? ({ k: 'may', effects: [eff], text: `search for ${m[3]}` } as any) : (eff as any));
  return n;
});
EXT.effects.searchNamed = ({ s, e, r, you, api }) => {
  const pl = s.players[you];
  const zones: string[] = ['library', 'graveyard', 'hand'].filter((z) => e.zones.includes(z));
  const want = e.name2.toLowerCase();
  const cands = zones.flatMap((z) => (pl as any)[z] as string[]).filter((c) => (s.defs[s.cards[c].defId].name.toLowerCase() === want || (s.defs[s.cards[c].defId].faces ?? []).some((f: any) => f.name.toLowerCase() === want)));
  const searched = zones.includes('library');
  if (!cands.length) { if (searched) api.shuffleArr(s, pl.library); return 'done'; }
  if (!r.sub) { r.sub = {}; api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'chooseCards', title: `Find ${e.name2}`, cards: cands, min: 0, max: 1, data: { ctx: 'resolve' } }); return 'wait'; }
  const pick = ((r.sub.answer ?? []) as string[]).find((c) => cands.includes(c));
  if (pick) { api.log(s, `${api.pname(s, you)} finds ${api.nm(s, pick)}.`, you); api.moveCard(s, pick, e.dest === 'hand' ? 'hand' : 'battlefield', e.dest === 'battlefield' ? { controller: you } : {}); }
  if (searched) api.shuffleArr(s, pl.library);
  return 'done';
};

// "You may cast ~ from your graveyard as long as you control a Zombie / if you gained life this turn / by paying
// {2}{W} rather than paying its mana cost" · "You may cast ~ from exile"
EXT.lines.push((line, pc) => {
  const m = line.match(/^(?:as long as (.+?), )?you may cast ~ from (your graveyard|exile|your graveyard or from exile)(?: (?:as long as|if) (.+?))?(?: by paying ((?:\{[^}]+\})+) rather than paying its mana cost)?$/);
  if (!m || (!m[1] && !m[3] && !m[4] && m[2] === 'your graveyard')) return false;
  const ct = m[1] ?? m[3];
  const cond = ct ? parseCond(ct) : null;
  if (ct && !cond) return false;
  (pc as any).castSelfFrom = { zones: m[2] === 'exile' ? ['exile'] : m[2] === 'your graveyard' ? ['graveyard'] : ['graveyard', 'exile'], cond, cost: m[4]?.toUpperCase() };
  return true;
});
EXT.hooks.zoneCast.push((s, p, card, _pcf, api) => {
  const r = (api.parsedFor(s, card) as any).castSelfFrom;
  if (!r || card.owner !== p || !r.zones.includes(card.zone)) return null;
  if (r.cond && !api.evalCond(s, r.cond, p, card.iid)) return null;
  return 'ext:selfFrom';
});
EXT.alts.selfFrom = { label: 'from another zone', begin: (s, _p, iid, pcFront) => (pcFront as any)?.castSelfFrom?.cost ?? s.defs[s.cards[iid].defId].manaCost ?? '' };

// "You may cast ~ as though it had flash if you control a Faerie." / "If you control …, you may cast ~ as though it had flash."
EXT.lines.push((line, pc) => {
  const m = line.match(/^(?:if (.+?), )?you may cast ~ as though it had flash(?: if (.+))?$/);
  if (!m || !(m[1] || m[2])) return false;
  const cond = parseCond(m[1] ?? m[2]);
  if (!cond) return false;
  (pc as any).flashIf = cond;
  return true;
});
EXT.hooks.flash.push((s, iid, api) => {
  const c = s.cards[iid];
  const f = c ? (api.parsedFor(s, c) as any).flashIf : null;
  return !!f && api.evalCond(s, f, c.owner, iid);
});

// "Each creature [you control] assigns combat damage equal to its toughness rather than its power." (Doran, Belligerent Guest)
EXT.lines.push((line, pc) => {
  const m = line.match(/^(?:as long as (.+?), )?each creature( you control)?(?: with (?:defender|toughness greater than its power))? assigns combat damage equal to its toughness rather than its power$/);
  if (!m) return false;
  const cond = m[1] ? parseCond(m[1]) : null;
  if (m[1] && !cond) return false;
  (pc as any).toughDmg = { mine: !!m[2], defender: /with defender/.test(line), gt: /greater than its power/.test(line), cond };
  return true;
});
EXT.hooks.dmgByToughness.push((s, iid, api) => {
  for (const b of sourcesWith(s, 'toughDmg')) {
    const r = (api.chars(s, b).pc as any).toughDmg;
    if (r.mine && s.cards[iid].controller !== s.cards[b].controller) continue;
    if (r.cond && !api.evalCond(s, r.cond, s.cards[b].controller, b)) continue;
    const ch = api.chars(s, iid);
    if (r.defender && !ch.keywords.has('defender')) continue;
    if (r.gt && !(ch.toughness > ch.power)) continue;
    return true;
  }
  return false;
});
EXT.conds.push((t) => {
  let m = t.match(/^~ has (a|one or more|two or more|three or more|four or more) counters? on it$/);
  if (m) return { k: 'ext', name: 'selfAnyCounters', n: m[1] === 'a' || m[1] === 'one or more' ? 1 : N[m[1].split(' ')[0]] };
  if (/^~ entered (?:the battlefield )?this turn$/.test(t)) return { k: 'ext', name: 'selfEnteredTurn' };
  if (/^~ is attached to a creature$/.test(t)) return { k: 'ext', name: 'selfAttachedCreature' };
  m = t.match(/^~ hasn't dealt damage yet$/);
  return null;
});
EXT.condEval.selfAnyCounters = (s, c, _y, self) => !!self && Object.values(s.cards[self]?.counters ?? {}).reduce((a: number, b: any) => a + (b > 0 ? b : 0), 0) >= c.n;
EXT.condEval.selfAttachedCreature = (s, _c, _y, self) => { const h = self ? s.cards[self]?.attachedTo : undefined; return !!h && !!s.cards[h] && baseChars(s, h).types.has('creature'); };

// "Enchanted creature gets +1/+1 for each land you control and has trample." / "Equipped creature gets +1/+0 for each
// creature in your party and has menace."
EXT.lines.push((line, pc) => {
  const m = line.match(/^(enchanted|equipped) creature gets ([+-]\d+)\/([+-]\d+) for each (.+?)(?:,? and (has|is) (.+))?$/);
  if (!m) return false;
  const amt = parseCountPhrase(m[4]);
  if (amt == null) return false;
  let kw: string[] = [];
  if (m[5] === 'has') { const k = parseKeywordList(m[6]); if (!k) return false; kw = k; }
  else if (m[5] === 'is') { if (/^all creature types$/.test(m[6])) kw = ['changeling']; else return false; }
  const sc = (x: number) => (x === 0 ? 0 : typeof amt === 'number' ? amt * x : { ...(amt as any), mult: ((amt as any).mult ?? 1) * x });
  pc.statics.push({ kind: 'attachPump', attach: m[1], p: sc(+m[2]), t: sc(+m[3]), kw } as any);
  return true;
});
// "Enchanted creature gets +2/+2 as long as it's a Vampire. Otherwise, it gets -2/-2." (Wicked/Blessed auras)
EXT.lines.push((line, pc) => {
  const m = line.match(/^(enchanted|equipped) creature gets ([+-]\d+)\/([+-]\d+) as long as it's (?:an? )?(attacking|[a-z]+)\. otherwise, it (?:gets ([+-]\d+)\/([+-]\d+)|can't attack or block|can't block)$/);
  if (!m) return false;
  const CW: any = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };
  const w = m[4];
  const ac: any = w === 'attacking' ? { attacking: true } : CW[w] ? { colors: [CW[w]] } : ['artifact', 'enchantment', 'creature', 'land'].includes(w) ? { types: [w] } : SUBTYPES.has(w) ? { subtypes: [w] } : null;
  if (!ac) return false;
  pc.statics.push({ kind: 'attachPump', attach: m[1], p: +m[2], t: +m[3], kw: [], attachCond: ac } as any);
  if (m[5]) pc.statics.push({ kind: 'attachPump', attach: m[1], p: +m[5], t: +m[6], kw: [], attachCond: { ...ac, not: true } } as any);
  else pc.statics.push({ kind: 'attachPump', attach: m[1], p: 0, t: 0, kw: [], attachCond: { ...ac, not: true }, cantBlock: true, cantAttack: /attack/.test(line) } as any);
  return true;
});

// "As long as enchanted permanent is an Equipment, it has "Equipped creature has flying."" (conditional quoted grant)
EXT.lines.push((line, pc) => {
  const m = line.match(/^as long as (enchanted|equipped) (?:permanent|creature|land|artifact) is (?:an? )?(.+?), it has "(.+)"$/);
  if (!m) return false;
  const f = looseFilter(m[2]);
  if (!f) return false;
  (pc as any).attachGrantsIf = [...((pc as any).attachGrantsIf ?? []), { filter: { ...f, zone: undefined }, text: m[3].replace(/\.$/, '') }];
  return true;
});

// cost-line rewrites onto "~ costs {N} less to cast if <cond>"
EXT.expand.push((line) => {
  let m = line.match(/^if (.+?), ~ costs (\{\d+\}) less to cast$/);
  if (m) return [`~ costs ${m[2]} less to cast if ${m[1]}`];
  m = line.match(/^~ costs (\{\d+\}) less to cast (?:as long as (.+)|(during your turn|during your end step))$/);
  if (m) return [`~ costs ${m[1]} less to cast if ${m[2] ?? (m[3] === 'during your turn' ? "it's your turn" : "it's your end step")}`];
  return null;
});
EXT.conds.push((t) => {
  if (/^it's your turn$/.test(t)) return { k: 'ext', name: 'myTurn13' };
  if (/^it's your end step$/.test(t)) return { k: 'ext', name: 'myEnd13' };
  if (/^an opponent has no cards in hand$/.test(t)) return { k: 'ext', name: 'oppHandEmpty13' };
  let m = t.match(/^you have (\d+) or less life$/);
  if (m) return { k: 'ext', name: 'lifeMaxN', n: +m[1] };
  m = t.match(/^an opponent controls (\w+) or more lands$/);
  if (m && n0(m[1])) return { k: 'ext', name: 'oppLandsN', n: n0(m[1]) };
  if (/^one or more cards left your graveyard this turn$/.test(t)) return { k: 'ext', name: 'gyLeftTurn' };
  m = t.match(/^you've gained (\d+) or more life this turn$/);
  if (m) return { k: 'ext', name: 'gainedN', n: +m[1] };
  return null;
});
EXT.condEval.myTurn13 = (s, _c, you) => s.active === you;
EXT.condEval.myEnd13 = (s, _c, you) => s.active === you && s.step === 'end';
EXT.condEval.oppHandEmpty13 = (s, _c, you) => s.players[1 - you].hand.length === 0;
EXT.condEval.oppLandsN = (s, c, you) => s.battlefield.filter((b) => s.cards[b].controller !== you && baseChars(s, b).types.has('land')).length >= c.n;
EXT.condEval.gainedN = (s, c, you) => ((s.players[you] as any).lifeGainedThisTurn ?? 0) >= c.n;
EXT.hooks.afterMove.push((s, _iid, from) => { if (from === 'graveyard') (s as any).gyLeftTurn = s.turn; });
EXT.condEval.gyLeftTurn = (s) => (s as any).gyLeftTurn === s.turn;
// counts: "creature that attacked this turn", "1 life you gained this turn", "spell your opponents have cast this turn"
EXT.amountPhrases.push((ph) => {
  if (/^creatures? that attacked this turn$/.test(ph) || /^creatures? you attacked with this turn$/.test(ph)) return { ext: 'attackedTurnN', mine: /you attacked/.test(ph) };
  if (/^1 life you gained this turn$/.test(ph)) return { ext: 'gainedTurnN' };
  if (/^spells? your opponents have cast this turn$/.test(ph)) return { ext: 'oppSpellsTurn' };
  if (/^modified creatures? you control$/.test(ph)) return { ext: 'modifiedMine' };
  return null;
});
EXT.amounts.attackedTurnN = (s, a: any, you) => TL(s).attacked.filter((x: string) => !a.mine || s.cards[x]?.controller === you).length;
EXT.amounts.gainedTurnN = (s, _a, you) => (s.players[you] as any).lifeGainedThisTurn ?? 0;
EXT.amounts.oppSpellsTurn = (s, _a, you) => (s.players[1 - you] as any).spellsCastThisTurn ?? 0;
EXT.amounts.modifiedMine = (s, _a, you) => s.battlefield.filter((b) => s.cards[b].controller === you && baseChars(s, b).types.has('creature') && (Object.values(s.cards[b].counters).some((v: any) => v > 0) || s.battlefield.some((o) => s.cards[o].attachedTo === b && s.cards[o].controller === you))).length;

// "Create a number of 1/1 white Soldier creature tokens equal to your devotion to white."
EXT.rules.push([/^create a number of (.+?) tokens? equal to (.+)$/, (m, ctx) => {
  const n = parseAmtPhrase(m[2], ctx);
  if (n == null) return null;
  const k0 = ctx.specs.length;
  const base = parseSentence(`create a ${m[1]} token`, ctx);
  if (!base || base.length !== 1 || (base[0] as any).k !== 'token') { ctx.specs.length = k0; return null; }
  return [{ ...(base[0] as any), n }];
}]);

// "During your turn, creatures you control have hexproof." → gated on "it's your turn"
let dyBusy = false;
EXT.expand.push((line) => {
  const m = line.match(/^during your turn, (.+)$/);
  if (!m || /^as long as /.test(m[1]) || dyBusy) return null;
  // keep lines another rule already reads whole
  dyBusy = true;
  try {
    const o: any = parseCard({ id: `dy:${line}`, name: 'x', manaCost: '', cmc: 0, typeLine: 'Creature', oracle: line, colors: [], colorIdentity: [], keywords: [], layout: 'normal' } as any);
    if (!o.unparsed.length && ![...o.triggers, ...o.activated, ...o.statics].some((a: any) => JSON.stringify(a).includes('"k":"manual"'))) return null;
  } finally { dyBusy = false; }
  return [`as long as it's your turn, ${m[1]}`];
});
// Two players: "For each opponent, destroy up to one target creature that player controls." → that one opponent
EXT.rules.push([/^for each opponent, (.+)$/, (m, ctx) => {
  let b = m[1];
  b = b.replace(/\b(?:that player|that opponent|they) controls?\b/g, 'an opponent controls')
    .replace(/\bthat (?:player|opponent)'s graveyard\b/g, "an opponent's graveyard")
    .replace(/ that's tapped and attacking that (?:player|opponent)(?: or a planeswalker they control)?/g, " that's tapped and attacking")
    .replace(/ tapped and attacking that (?:player|opponent)/g, ' tapped and attacking')
    .replace(/^you create /, 'create ');
  if (/\bthat (?:player|opponent)\b/.test(b)) b = b.replace(/\bthat (?:player|opponent)\b/g, 'target opponent');
  const k0 = ctx.specs.length;
  const r = parseSentence(b, ctx);
  if (!r || r.some((e: any) => e.k === 'manual')) { ctx.specs.length = k0; return null; }
  return r;
}]);

// "Commander creatures you own have "…"." / "Commander creatures you control get +2/+2 and have haste."
EXT.lines.push((line, pc) => {
  let m = line.match(/^commander creatures you (own|control) have "(.+)"$/);
  if (m) {
    const text = m[2].replace(/\.$/, '');
    const probe: any = parseCard({ id: `cmdgrant:${text}`, name: 'Granted', manaCost: '', cmc: 0, typeLine: 'Creature', oracle: text, colors: [], colorIdentity: [], keywords: [], layout: 'normal' } as any);
    if (probe.unparsed.length || [...probe.triggers, ...probe.activated, ...probe.statics].some((a: any) => JSON.stringify(a).includes('"k":"manual"'))) return false;
    ((pc as any).groupGrants ??= []).push({ filter: { types: ['creature'], commander: true, ...(m[1] === 'own' ? { owner: 'you' } : { controller: 'you' }) }, text });
    return true;
  }
  m = line.match(/^commander creatures you (own|control) get ([+-]\d+)\/([+-]\d+)(?: and have (.+))?$/);
  if (m) {
    const kw = m[4] ? parseKeywordList(m[4]) : [];
    if (!kw) return false;
    pc.statics.push({ kind: 'anthem', filter: { types: ['creature'], commander: true, controller: 'you' }, p: +m[2], t: +m[3], kw } as any);
    return true;
  }
  return false;
});

// "Counter target spell that targets a creature you control." / "… that targets you or a permanent you control."
EXT.rules.push([/^counter target (spell|instant or sorcery spell|instant spell|sorcery spell|aura spell|instant or aura spell) that targets (.+)$/, (m, ctx) => {
  const kinds: any[] = [];
  for (const part of m[2].split(/ or (?=(?:an? |you\b|~))/)) {
    const p = part.trim();
    if (p === 'you') kinds.push({ player: 'you' });
    else if (p === 'a player') kinds.push({ player: 'any' });
    else if (p === '~') kinds.push({ self: true });
    else { const f = looseFilter(p.replace(/^an? /, '')); if (!f) return null; kinds.push({ card: { ...f, zone: undefined } }); }
  }
  const k0 = ctx.specs.length;
  const base = parseSentence(`counter target ${m[1]}`, ctx);
  if (!base || ctx.specs.length !== k0 + 1) { ctx.specs.length = k0; return null; }
  const sp: any = ctx.specs[k0];
  sp.filter = { ...sp.filter, targetsF: kinds };
  sp.label = `${sp.label} that targets ${m[2]}`;
  return base;
}]);

// duration rewrites: "for as long as you control ~ and ~ remains tapped" → "… ~ remains tapped";
// "for as long as ~ remains on the battlefield" → "for as long as you control ~"
EXT.rules.push([/^(.+) for as long as (you control ~ and ~ remains tapped|~ remains on the battlefield)$/, (m, ctx) => {
  const k0 = ctx.specs.length;
  const r = parseSentence(`${m[1]} for as long as ${m[2] === '~ remains on the battlefield' ? 'you control ~' : '~ remains tapped'}`, ctx);
  if (!r || r.some((e: any) => e.k === 'manual')) { ctx.specs.length = k0; return null; }
  return r;
}]);
// "~ enters with your choice of a flying counter or a first strike counter on it."
EXT.lines.push((line, pc) => {
  const m = line.match(/^~ enters with your choice of an? ([a-z ]+?) counter or an? ([a-z ]+?) counter on it$/);
  if (!m) return false;
  pc.triggers.push({ event: 'etb', ability: { text: line, effects: [{ k: 'ext', name: 'chooseCounter', opts: [m[1], m[2]] }], specs: [], manual: [] }, text: line } as any);
  return true;
});
EXT.effects.chooseCounter = ({ s, item, e, r, you, api }) => {
  if (!s.cards[item.source] || s.cards[item.source].zone !== 'battlefield') return 'done';
  if (!r.sub) { r.sub = {}; api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'yesno', title: `${item.label}: choose a counter`, options: e.opts.map((o: string) => ({ id: o, label: o })), data: { ctx: 'resolve' } }); return 'wait'; }
  const k = e.opts.includes(r.sub.answered) ? r.sub.answered : e.opts[0];
  api.addCounters(s, item.source, k, 1);
  return 'done';
};

// "Prevent all damage a source of your choice would deal this turn." / "… would deal to you this turn" /
// "Prevent all damage that would be dealt to you this turn by a source of your choice."
EXT.rules.push([/^prevent all damage (?:an? ((?:white|blue|black|red|green|artifact) )?source of your choice would deal(?: to (you|~))? this turn|that would be dealt to (you|~) this turn by a source of your choice)$/, (m) => {
  const CW: any = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };
  const c = m[1]?.trim();
  const choose = !c ? {} : CW[c] ? { colors: [CW[c]] } : { types: [c] };
  const to = m[2] ?? m[3];
  return [{ k: 'ext', name: 'nextDmg', who: { choose }, to: to === 'you' ? { you: true } : to === '~' ? { subj: { t: 'self' } } : null, res: { prevent: 'all', keep: true }, combat: false }];
}]);

// "~ can't be the target of black spells or abilities from black sources." / "… nongreen spells your opponents control …" /
// "… Aura spells" / "… abilities your opponents control" / "… blue or black spells"
EXT.lines.push((line, pc) => {
  const m = line.match(/^(~|enchanted creature) can't be the target of (.+)$/);
  if (!m) return false;
  const CW: any = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };
  const rules: any[] = [];
  for (const part of m[2].split(/ or (?=abilities)|, or /)) {
    const p = part.trim();
    let k: RegExpMatchArray | null;
    if ((k = p.match(/^(non)?((?:white|blue|black|red|green)(?: or (?:white|blue|black|red|green))*|aura) spells( your opponents control)?$/))) rules.push({ spells: true, non: !!k[1], colors: k[2] === 'aura' ? null : k[2].split(' or ').map((w) => CW[w]), aura: k[2] === 'aura', opp: !!k[3] });
    else if ((k = p.match(/^abilities from (non)?(white|blue|black|red|green) sources( your opponents control)?$/))) rules.push({ abilities: true, non: !!k[1], colors: [CW[k[2]]], opp: !!k[3] });
    else if ((k = p.match(/^(spells|abilities|spells or abilities) your opponents control$/))) rules.push({ spells: /spells/.test(k[1]), abilities: /abilities/.test(k[1]), opp: true });
    else if (p === 'spells') rules.push({ spells: true });
    else return false;
  }
  (pc as any).untargetBy = { rules, attached: m[1] !== '~' };
  return true;
});
EXT.hooks.cantTarget.push((s, iid, source, you, api) => {
  const srcs = sourcesWith(s, 'untargetBy');
  if (!srcs.length || !source || !s.cards[source]) return false;
  const isSpell = s.cards[source].zone === 'stack';
  for (const b of srcs) {
    const u = (api.chars(s, b).pc as any).untargetBy;
    if ((u.attached ? s.cards[b].attachedTo : b) !== iid) continue;
    const ctrl = s.cards[iid].controller;
    const sc = api.chars(s, source);
    for (const r of u.rules) {
      if (isSpell ? !r.spells : !r.abilities) continue;
      if (r.opp && you === ctrl) continue;
      if (r.aura && !sc.subtypes.has('aura')) continue;
      if (r.colors) { const has = r.colors.some((c: string) => sc.colors.includes(c)); if (r.non ? has : !has) continue; }
      return true;
    }
  }
  return false;
});

// Opponent-history conditions (Pyroblast-style free spells, Mogg Infestation …)
EXT.hooks.event.push((s, name, d, api) => {
  if (name !== 'cast' || d.item.kind !== 'spell' || !s.cards[d.item.source]) return;
  const t = TL(s);
  const cols = ((t.castColors ??= [[], []]) as string[][]);
  cols[d.item.controller].push(...api.chars(s, d.item.source).colors);
});
EXT.hooks.afterMove.push((s, iid, _from, to) => { if (to === 'graveyard' && s.cards[iid]) { const t = TL(s); (t.toGy ??= [0, 0])[s.cards[iid].owner]++; } });
EXT.conds.push((t) => {
  let m = t.match(/^an opponent cast an? (white|blue|black|red|green) spell this turn$/);
  if (m) return { k: 'ext', name: 'oppCastColor', color: ({ white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' } as any)[m[1]] };
  m = t.match(/^an opponent cast (\w+) or more spells this turn$/);
  if (m && n0(m[1])) return { k: 'ext', name: 'oppCastN', n: n0(m[1]) };
  m = t.match(/^an opponent drew (\w+) or more cards this turn$/);
  if (m && n0(m[1])) return { k: 'ext', name: 'oppDrewN', n: n0(m[1]) };
  if (/^an opponent gained life this turn$/.test(t)) return { k: 'ext', name: 'oppGained' };
  m = t.match(/^an opponent had (\w+) or more cards put into their graveyard from anywhere this turn$/);
  if (m && n0(m[1])) return { k: 'ext', name: 'oppToGyN', n: n0(m[1]) };
  return null;
});
EXT.condEval.oppCastColor = (s, c, you) => (TL(s).castColors?.[1 - you] ?? []).includes(c.color);
EXT.condEval.oppCastN = (s, c, you) => ((s.players[1 - you] as any).spellsCastThisTurn ?? 0) >= c.n;
EXT.condEval.oppDrewN = (s, c, you) => { const k = (s as any).drawN; return !!k && k.turn === s.turn && k.n[1 - you] >= c.n; };
EXT.condEval.oppGained = (s, _c, you) => ((s.players[1 - you] as any).lifeGainedThisTurn ?? 0) > 0;
EXT.condEval.oppToGyN = (s, c, you) => (TL(s).toGy?.[1 - you] ?? 0) >= c.n;

// Expend N: "whenever you expend 4" — you've spent your fourth total mana this turn
EXT.triggers.push((cond) => {
  const m = cond.match(/^whenever you expend (\d+)$/);
  return m ? [{ event: 'expend', data: { n: +m[1] } }] : null;
});
EXT.hooks.event.push((s, name, d, api) => {
  if (name !== 'manaSpent') return;
  for (const oid of [...api.observers(s)]) {
    const o = s.cards[oid];
    if (!o || o.controller !== d.p) continue;
    for (const t of api.chars(s, oid).pc.triggers as any[]) if (t.event === 'expend' && d.before < t.data.n && d.after >= t.data.n) api.queueTrigger(s, oid, o.controller, t, {});
  }
});
// "Whenever one or more Faeries you control deal combat damage to a player"
EXT.triggers.push((cond) => {
  const m = cond.match(/^whenever one or more ([a-z]+?)s? you control deal combat damage to a player$/);
  if (!m || m[1] === 'creature') return null;
  const base = matchTriggerCond('whenever one or more creatures you control deal combat damage to a player');
  const f = looseFilter(m[1]);
  return base && f ? base.map((e) => ({ ...e, filter: { ...(e.filter ?? {}), ...f, zone: undefined, controller: undefined } })) as any : null;
});

// ---- trigger heads, round 2 ----
const REW2: [RegExp, string][] = [
  [/^when ~ comes into play$/, 'when ~ enters'],
  [/^whenever a creature deals combat damage to one of your opponents$/, 'whenever a creature you control deals combat damage to a player'],
  [/^whenever you put one or more \+1\/\+1 counters on ~$/, 'whenever one or more +1/+1 counters are put on ~'],
  [/^whenever a \+1\/\+1 counter is put on ~$/, 'whenever one or more +1/+1 counters are put on ~'],
];
EXT.triggers.push((cond) => {
  for (const [re, to] of REW2) if (re.test(cond)) return matchTriggerCond(to) as any;
  let m: RegExpMatchArray | null;
  if ((m = cond.match(/^when(?:ever)? you sacrifice (~|it)$/))) return [{ event: 'selfLeaveX', data: { sac: true } }];
  if ((m = cond.match(/^when(?:ever)? ~ dies or is put into exile from the battlefield$/))) return [{ event: 'selfLeaveX', data: { zones: ['graveyard', 'exile'] } }];
  if ((m = cond.match(/^whenever (?:an? )?(equipped|enchanted|modified) creatures? you control (attacks|deals combat damage to a player)$/))) {
    const base = matchTriggerCond(`whenever a creature you control ${m[2]}`);
    return base ? base.map((e) => ({ ...e, filter: { ...(e.filter ?? {}), rel: m![1] } })) as any : null;
  }
  if ((m = cond.match(/^whenever your commander (enters|attacks)$/))) {
    const base = matchTriggerCond(m[1] === 'enters' ? 'whenever a creature you control enters' : 'whenever a creature you control attacks');
    return base ? base.map((e) => ({ ...e, filter: { ...(e.filter ?? {}), commander: true } })) as any : null;
  }
  if ((m = cond.match(/^whenever a player attacks( you)?$/))) return [{ event: 'playerAttacks', data: { you: !!m[1] }, lastPlayer: TP }];
  if ((m = cond.match(/^whenever you sacrifice (?:a|an|one or more) (tokens?|[a-z]+ tokens?)$/))) {
    const f = looseFilter(m[1].replace(/s$/, ''));
    return f ? matchTriggerCond('whenever you sacrifice a permanent')?.map((e) => ({ ...e, filter: { ...f, token: true, zone: undefined } })) as any ?? null : null;
  }
  if ((m = cond.match(/^whenever you activate a loyalty ability(?: of an? ([a-z]+) planeswalker)?$/))) return [{ event: 'loyaltyAct', data: { sub: m[1] } }];
  if ((m = cond.match(/^whenever you lose life for the first time each turn$/))) return [{ event: 'firstLoss' }];
  if ((m = cond.match(/^when(?:ever)? (enchanted creature|enchanted permanent|equipped creature|a creature|a permanent you control|you or a permanent you control) becomes the target of a spell or ability( an opponent controls)?$/))) {
    return [{ event: 'targetedX', data: { who: m[1], opp: !!m[2] }, last: TO, lastPlayer: TP }];
  }
  if ((m = cond.match(/^when there are no creatures on the battlefield$/))) return [{ event: 'noCreatures' }];
  return null;
});
EXT.hooks.event.push((s, name, d, api) => {
  if (name === 'leave') {
    const c = s.cards[d.iid];
    if (!c) return;
    const pcx: any = api.parsedFor(s, c);
    for (const t of pcx.triggers as any[]) {
      if (t.event !== 'selfLeaveX') continue;
      if (t.data.sac && d.opts?.cause !== 'sacrifice') continue;
      if (t.data.zones && !t.data.zones.includes(d.to)) continue;
      api.queueTrigger(s, d.iid, d.controller ?? c.owner, t, { lki: true } as any);
    }
  }
  if (name === 'attack') {
    for (const oid of [...api.observers(s)]) {
      const o = s.cards[oid];
      if (!o) continue;
      for (const t of api.chars(s, oid).pc.triggers as any[]) if (t.event === 'playerAttacks' && (!t.data.you || d.p !== o.controller)) api.queueTrigger(s, oid, o.controller, t, { triggerPlayer: d.p });
    }
  }
  if (name === 'activate' && d.a?.special === 'loyalty') {
    for (const oid of [...api.observers(s)]) {
      const o = s.cards[oid];
      if (!o || o.controller !== d.p) continue;
      for (const t of api.chars(s, oid).pc.triggers as any[]) if (t.event === 'loyaltyAct' && (!t.data.sub || api.chars(s, d.iid).subtypes.has(t.data.sub))) api.queueTrigger(s, oid, o.controller, t, { triggerObj: d.iid });
    }
  }
  if (name === 'lifeLost') {
    const k = ((s as any).firstLoss ??= {});
    if (k[d.p] === s.turn) return;
    k[d.p] = s.turn;
    for (const oid of [...api.observers(s)]) {
      const o = s.cards[oid];
      if (!o || o.controller !== d.p) continue;
      for (const t of api.chars(s, oid).pc.triggers as any[]) if (t.event === 'firstLoss') api.queueTrigger(s, oid, o.controller, t, { amount: d.n } as any);
    }
  }
});
EXT.hooks.pushed.push((s, item, api) => {
  const ts = item.targets.flat();
  if (!ts.length) return;
  for (const oid of [...api.observers(s)]) {
    const o = s.cards[oid];
    if (!o) continue;
    for (const t of api.chars(s, oid).pc.triggers as any[]) {
      if (t.event !== 'targetedX') continue;
      if (t.data.opp && item.controller === o.controller) continue;
      const w = t.data.who as string;
      const hit = ts.find((x: any) => {
        if (x.kind === 'player') return (w === 'you or a permanent you control' || (w === 'filter' && t.data.you)) && x.idx === o.controller;
        const c = s.cards[x.iid];
        if (!c || c.zone !== 'battlefield') return false;
        if (w === 'enchanted creature' || w === 'enchanted permanent' || w === 'equipped creature') return o.attachedTo === x.iid;
        if (w === 'a creature') return api.chars(s, x.iid).types.has('creature');
        if (w === 'filter') return api.matchesFilter(s, x.iid, t.filter, o.controller, oid);
        return c.controller === o.controller;
      });
      if (hit) api.queueTrigger(s, oid, o.controller, t, { triggerObj: hit.kind === 'card' ? hit.iid : undefined, triggerPlayer: item.controller });
    }
  }
});
EXT.post.push((pc: any) => {
  if ((pc.triggers ?? []).some((t: any) => t.event === 'noCreatures')) pc.noCreTrig = true;
  if ((pc.triggers ?? []).some((t: any) => t.event === 'attachX')) pc.attachTrig = true;
});
EXT.hooks.sba.push((s, api) => {
  if (!sourcesWith(s, 'noCreTrig').length) return false;
  if (s.battlefield.some((b) => baseChars(s, b).types.has('creature'))) { (s as any).noCrSeen = false; return false; }
  if ((s as any).noCrSeen) return false;
  (s as any).noCrSeen = true;
  let any = false;
  for (const oid of [...s.battlefield]) for (const t of api.chars(s, oid).pc.triggers as any[]) if (t.event === 'noCreatures') { api.queueTrigger(s, oid, s.cards[oid].controller, t, {}); any = true; }
  return any;
});

// "Whenever day becomes night or night becomes day"
EXT.triggers.push((cond) => (/^whenever day becomes night or night becomes day$/.test(cond) ? [{ event: 'dayNightX' }] : /^whenever (?:it becomes night|day becomes night)$/.test(cond) ? [{ event: 'dayNightX', data: { to: 'night' } }] : null));
EXT.hooks.event.push((s, name, d, api) => {
  if (name !== 'dayNight') return;
  for (const oid of [...api.observers(s)]) {
    const o = s.cards[oid];
    if (!o) continue;
    for (const t of api.chars(s, oid).pc.triggers as any[]) if (t.event === 'dayNightX' && (!t.data?.to || t.data.to === d.v)) api.queueTrigger(s, oid, o.controller, t, {});
  }
});

// Dice: "whenever you roll one or more dice / a die / a 6 / a 5 or higher on a die"
EXT.triggers.push((cond) => {
  let m = cond.match(/^whenever you roll (?:one or more dice|a die)$/);
  if (m) return [{ event: 'diceX', data: {} }];
  m = cond.match(/^whenever you roll (?:a|an) (\d+)(?: or higher)?(?: on a die)?$/);
  if (m) return [{ event: 'diceX', data: { n: +m[1], higher: /or higher/.test(cond) } }];
  return null;
});
EXT.hooks.event.push((s, name, d, api) => {
  if (name !== 'diceRolled') return;
  for (const oid of [...api.observers(s)]) {
    const o = s.cards[oid];
    if (!o || o.controller !== d.p) continue;
    for (const t of api.chars(s, oid).pc.triggers as any[]) {
      if (t.event !== 'diceX') continue;
      if (t.data.n && (t.data.higher ? d.n < t.data.n : d.n !== t.data.n)) continue;
      api.queueTrigger(s, oid, o.controller, t, { amount: d.n } as any);
    }
  }
});
// "Whenever you win a coin flip" / "Whenever you flip a coin"
EXT.triggers.push((cond) => (/^whenever you win a coin flip$/.test(cond) ? [{ event: 'flipX', data: { won: true } }] : /^whenever you (?:flip a coin|lose a coin flip)$/.test(cond) ? [{ event: 'flipX', data: { won: /lose/.test(cond) ? false : undefined } }] : null));
EXT.hooks.event.push((s, name, d, api) => {
  if (name !== 'coinFlip') return;
  for (const oid of [...api.observers(s)]) {
    const o = s.cards[oid];
    if (!o || o.controller !== d.p) continue;
    for (const t of api.chars(s, oid).pc.triggers as any[]) if (t.event === 'flipX' && (t.data.won === undefined || t.data.won === d.won)) api.queueTrigger(s, oid, o.controller, t, {});
  }
});

// face-up / attached-dies / sacrifice-token / commander heads
EXT.expand.push((line) => {
  const m = line.match(/^whenever (your commander|~) enters or attacks?, (.+)$/);
  if (!m || m[1] === '~' && !/attack,/.test(line)) return null;
  return m[1] === '~' ? [`when ~ enters, ${m[2]}`, `whenever ~ attacks, ${m[2]}`] : [`whenever your commander enters, ${m[2]}`, `whenever your commander attacks, ${m[2]}`];
});
EXT.triggers.push((cond) => {
  let m: RegExpMatchArray | null;
  if ((m = cond.match(/^when(?:ever)? enchanted (land|artifact|permanent|enchantment) (?:dies|is put into a graveyard(?: from the battlefield)?)$/))) return matchTriggerCond('when enchanted creature dies') as any;
  if ((m = cond.match(/^whenever you sacrifice (?:a|one or more) tokens?$/))) return [{ event: 'sacrifice', filter: { token: true }, data: { other: false }, last: TO }];
  if ((m = cond.match(/^whenever (a permanent you control|a permanent|~ or another creature you control|a creature you control) is turned face up$/))) return [{ event: 'faceUpX', data: { mine: !/^a permanent$/.test(m[1]), creature: /creature/.test(m[1]) }, last: TO }];
  if ((m = cond.match(/^whenever a face-down creature you control enters$/))) return [{ event: 'otherEtb', filter: { controller: 'you', faceDown: true } as any, last: TO }];
  return null;
});
EXT.hooks.event.push((s, name, d, api) => {
  if (name !== 'faceUp') return;
  for (const oid of [...api.observers(s)]) {
    const o = s.cards[oid];
    if (!o) continue;
    for (const t of api.chars(s, oid).pc.triggers as any[]) {
      if (t.event !== 'faceUpX') continue;
      if (t.data.mine && s.cards[d.iid]?.controller !== o.controller) continue;
      if (t.data.creature && !api.chars(s, d.iid).types.has('creature')) continue;
      api.queueTrigger(s, oid, o.controller, t, { triggerObj: d.iid });
    }
  }
});

// exert / enchanted player attacked / discard self / milled self / first {X} spell / adventure creature spell
EXT.triggers.push((cond) => {
  let m: RegExpMatchArray | null;
  if (/^whenever you exert (?:a|one or more) creatures?$/.test(cond)) return [{ event: 'exertX', last: TO }];
  if (/^whenever enchanted player is attacked$/.test(cond) || /^whenever a player attacks enchanted player with one or more creatures$/.test(cond)) return [{ event: 'curseAttacked', lastPlayer: TP }];
  if (/^when(?:ever)? you discard ~$/.test(cond)) return [{ event: 'selfDiscarded' }];
  if (/^when(?:ever)? ~ is put into your graveyard from your library$/.test(cond)) return [{ event: 'selfMilled' }];
  if ((m = cond.match(/^whenever you cast your first spell with \{x\} in its mana cost each turn$/))) return [{ event: 'castSpell', filter: { types: ['spell'] }, last: TO, cond: { k: 'ext', name: 'firstXSpell' } }];
  if (/^whenever you cast a creature spell that has an adventure$/.test(cond)) return [{ event: 'castSpell', filter: { types: ['creature'] }, last: TO, cond: { k: 'ext', name: 'trigAdventure' } }];
  return null;
});
EXT.hooks.event.push((s, name, d, api) => {
  if (name === 'exert') for (const oid of [...api.observers(s)]) { const o = s.cards[oid]; if (o && o.controller === d.p) for (const t of api.chars(s, oid).pc.triggers as any[]) if (t.event === 'exertX') api.queueTrigger(s, oid, o.controller, t, { triggerObj: d.iid }); }
  if (name === 'attack') for (const oid of [...s.battlefield]) { const o: any = s.cards[oid]; if (o?.attachedPlayer !== undefined && o.attachedPlayer !== d.p && d.list.some((a: any) => a.target?.kind === 'player' && a.target.idx === o.attachedPlayer)) for (const t of api.chars(s, oid).pc.triggers as any[]) if (t.event === 'curseAttacked') api.queueTrigger(s, oid, o.controller, t, { triggerPlayer: d.p }); }
});
EXT.hooks.castPay.push((s, pc) => {
  if (pc.kind !== 'spell' || !s.cards[pc.iid]) return;
  if (!/\{X\}/i.test(s.defs[s.cards[pc.iid].defId].manaCost ?? '')) return;
  const k: any = ((s.players[pc.player] as any).xSpells ??= { turn: -1, n: 0 });
  if (k.turn !== s.turn) { k.turn = s.turn; k.n = 0; }
  k.n++;
});
EXT.condEval.firstXSpell = (s, _c, you, _self, ctx: any) => {
  const o = ctx?.triggerObj ?? ctx?.item?.triggerObj;
  if (!o || !s.cards[o] || !/\{X\}/i.test(s.defs[s.cards[o].defId].manaCost ?? '')) return false;
  const k: any = (s.players[you] as any).xSpells;
  return !!k && k.turn === s.turn && k.n === 1;
};
EXT.condEval.trigAdventure = (s, _c, _y, _self, ctx: any) => { const o = ctx?.triggerObj ?? ctx?.item?.triggerObj; return !!o && s.defs[s.cards[o]?.defId]?.layout === 'adventure'; };
EXT.hooks.afterMove.push((s, iid, from, to, opts, api) => {
  const c = s.cards[iid];
  if (!c || to !== 'graveyard') return;
  const ev = from === 'hand' && opts?.cause === 'discard' ? 'selfDiscarded' : from === 'library' ? 'selfMilled' : null;
  if (!ev) return;
  for (const t of (api.parsedFor(s, c).triggers as any[])) if (t.event === ev) api.queueTrigger(s, iid, c.owner, t, {});
});

// "Target opponent reveals their hand. You choose an instant or sorcery card from it. That player discards that card."
EXT.seqs.push((sents, i, ctx, ab) => {
  const a = sents[i].match(/^(target opponent|target player|each opponent|that player) reveals (?:their|his or her) hand$/);
  const b = sents[i + 1]?.match(/^you choose (?:an|a|one)\b ?(.*?) (?:card )?(?:from it|from it with mana value (x|\d+) or less|with mana value (x|\d+) or less from it)$/);
  const c = sents[i + 2]?.match(/^(?:that player|they) discards? (?:that card|it)$/);
  if (!a || !b || !c) return null;
  const who = a[1] === 'that player' ? ctx.lastPlayer ?? { t: 'triggerPlayer' } : parsePlayerSubject(a[1], ctx);
  let ph = (b[1] ?? '').replace(/ card$/, '').trim();
  const mv = b[2] ?? b[3];
  let f: any = undefined;
  if (ph && ph !== 'card') { f = looseFilter(ph.replace(/ or /g, ' or ')); if (!f) return null; f = { ...f, zone: undefined }; }
  if (mv === 'x') return null;
  if (mv) f = { ...(f ?? {}), cmcMax: +mv };
  if (!who) return null;
  ab.effects.push({ k: 'handPick', who, filter: f, upTo: false } as any);
  return 2;
});

// "<optional effect>. Do this only once each turn."
EXT.seqs.push((sents, i, ctx, ab) => {
  if (!/^do this only once each turn$/.test(sents[i + 1] ?? '')) return null;
  const k0 = ctx.specs.length;
  const eff = parseSentence(sents[i], ctx);
  if (!eff || eff.some((e: any) => e.k === 'manual')) { ctx.specs.length = k0; return null; }
  ab.effects.push({ k: 'ext', name: 'oncePerTurnWrap', key: sents[i].slice(0, 40), effects: eff } as any);
  return 2;
});
EXT.effects.oncePerTurnWrap = ({ s, item, e }) => {
  const used = ((s as any).oncePerTurn ??= {});
  const k = `opt:${item.source}:${e.key}`;
  if (used[k] === s.turn) return 'done';
  // only counts as used if the wrapped (optional) effect actually happens: mark when it resolves past a "may"
  const idx = item.effects.indexOf(e);
  const eff = JSON.parse(JSON.stringify(e.effects));
  item.effects.splice(idx + 1, 0, ...eff, { k: 'ext', name: 'oncePerTurnMark', key: k } as any);
  return 'done';
};
EXT.effects.oncePerTurnMark = ({ s, item, e }) => { if ((item as any).didLast !== false) ((s as any).oncePerTurn ??= {})[e.key] = s.turn; return 'done'; };

// ---- keyword mechanics ----
// Assist: another player may help pay — never happens against an opponent in a two-player game.
// Living metal: "As long as it's your turn, this Vehicle is also an artifact creature."
// Compleated: if life was paid for {P}, it enters with two fewer loyalty counters.
EXT.lines.push((line, pc) => {
  if (/^assist$/.test(line)) return true;
  if (/^living metal$/.test(line)) { pc.statics.push({ kind: 'selfPump', p: 0, t: 0, kw: [], addTypes: ['creature'], cond: { k: 'ext', name: 'myTurn13' } } as any); return true; }
  if (/^compleated$/.test(line)) { (pc as any).compleated = true; return true; }
  return false;
});
EXT.hooks.castPay.push((s, pc) => { if (pc.kind === 'spell' && s.cards[pc.iid]) (s.cards[pc.iid] as any).lifePaidCast = ((s as any).lastPaidLife ?? 0) > 0; });
EXT.hooks.afterMove.push((s, iid, _from, to, _o, api) => {
  const c: any = s.cards[iid];
  if (!c || to !== 'battlefield' || !c.lifePaidCast) return;
  c.lifePaidCast = false;
  if (!(api.parsedFor(s, c) as any).compleated) return;
  c.counters.loyalty = Math.max(0, (c.counters.loyalty ?? 0) - 2);
  api.log(s, `${api.nm(s, iid)} is compleated: two fewer loyalty counters.`);
});
// "They're still lands." / "It's still a land." — the becoming already keeps its other types
EXT.rules.push([/^(?:they're still lands|it's still a land)$/, () => []]);

// "Whenever you proliferate / get one or more {E}" · "Whenever a creature you control explores / connives"
EXT.triggers.push((cond) => {
  if (/^whenever you proliferate$/.test(cond)) return [{ event: 'pEvent', data: { ev: 'proliferate' } }];
  if (/^whenever you get one or more \{e\}$/.test(cond)) return [{ event: 'pEvent', data: { ev: 'energyGot' } }];
  const m = cond.match(/^whenever (a creature you control|~|another creature you control) (explores|connives)$/);
  if (m) return [{ event: 'cEvent', data: { ev: m[2] === 'explores' ? 'explored' : 'connived', who: m[1] }, last: TO }];
  return null;
});
EXT.hooks.event.push((s, name, d, api) => {
  if (!['proliferate', 'energyGot', 'explored', 'connived'].includes(name)) return;
  for (const oid of [...api.observers(s)]) {
    const o = s.cards[oid];
    if (!o) continue;
    for (const t of api.chars(s, oid).pc.triggers as any[]) {
      if (t.event === 'pEvent' && t.data.ev === name && d.p === o.controller) api.queueTrigger(s, oid, o.controller, t, { amount: d.n } as any);
      if (t.event === 'cEvent' && t.data.ev === name && s.cards[d.iid]) {
        const w = t.data.who;
        if (w === '~' ? d.iid !== oid : s.cards[d.iid].controller !== o.controller || (w === 'another creature you control' && d.iid === oid)) continue;
        api.queueTrigger(s, oid, o.controller, t, { triggerObj: d.iid });
      }
    }
  }
});

// "… tapped and attacking" for reanimation and tokens
EXT.rules.push([/^(.+?) (?:that's |that are )?tapped and attacking( with .+)?$/, (m, ctx) => {
  if (/^return ~ from your graveyard/.test(m[1])) return null;
  const k0 = ctx.specs.length;
  const isTok = /^create /.test(m[1]);
  const base = parseSentence(isTok ? `${m[1]}${m[2] ? ` ${m[2].replace(/^ with /, 'with ')}` : ''}` : `${m[1]} tapped${m[2] ?? ''}`, ctx);
  if (!base || base.some((e: any) => e.k === 'manual')) { ctx.specs.length = k0; return null; }
  const main: any = base.find((e: any) => e.k === 'token' || e.k === 'reanimate' || e.k === 'tokenCopy');
  if (!main) { ctx.specs.length = k0; return null; }
  main.tapped = true;
  return [...base, { k: 'ext', name: 'makeAttacking', what: main.k === 'reanimate' ? main.what : { t: 'lastToken' } }];
}]);
EXT.effects.makeAttacking = ({ s, item, e, you, api }) => {
  if (!s.combat || s.active !== you) return 'done';
  for (const c of api.subjCards(s, item, e.what)) {
    if (s.cards[c]?.zone !== 'battlefield' || s.combat.attackers.some((a) => a.iid === c)) continue;
    const tgt = s.combat.attackers.find((a: any) => a.iid === item.source)?.target ?? { kind: 'player', idx: 1 - you };
    s.combat.attackers.push({ iid: c, target: tgt, blockedBy: [], blocked: false } as any);
  }
  return 'done';
};

// "Return up to one target artifact card and up to one target enchantment card from your graveyard to your hand."
EXT.rules.push([/^return ((?:up to one )?target .+? card(?:(?:,| and|, and) (?:up to one )?target .+? card)+) from your graveyard to (your hand|the battlefield)$/, (m, ctx) => {
  const segs = m[1].split(/,? and (?=(?:up to one )?target)|, (?=(?:up to one )?target)/);
  if (segs.length < 2) return null;
  const k0 = ctx.specs.length;
  const out: any[] = [];
  for (const sg of segs) {
    const r = parseSentence(`return ${sg} from your graveyard to ${m[2]}`, ctx);
    if (!r || r.length !== 1 || !((r[0] as any).k === 'reanimate' || (r[0] as any).name === 'gyReturn')) { ctx.specs.length = k0; return null; }
    out.push(r[0]);
  }
  return out;
}]);

// "Return it to the battlefield transformed under its owner's control (at the beginning of the next end step)."
EXT.rules.push([/^return (it|~|that card) to the battlefield (tapped )?(?:and )?transformed under (its owner's|your) control( at the beginning of the next end step)?$/, (m, ctx) => {
  const what = m[1] === '~' ? { t: 'self' } : ctx.last ?? { t: 'self' };
  const eff = { k: 'ext', name: 'returnTransformed', what, tapped: !!m[2], yours: m[3] === 'your' };
  return m[4] ? [{ k: 'delayed', at: 'nextEnd', effects: [{ ...eff, what: what.t === 'self' ? { t: 'self' } : { t: 'lastToken' } }] } as any] : [eff];
}]);
EXT.effects.returnTransformed = ({ s, item, e, you, api }) => {
  const ids = api.subjCards(s, item, e.what);
  for (const c of ids.length ? ids : [item.source]) {
    const x = s.cards[c];
    if (!x || !['graveyard', 'exile'].includes(x.zone)) continue;
    api.moveCard(s, c, 'battlefield', { controller: e.yours ? you : x.owner, tapped: e.tapped });
    const d = s.defs[x.defId];
    if (d.faces && d.faces.length > 1 && (s.cards[c].face ?? 0) === 0) api.transformCard(s, c);
  }
  return 'done';
};

// Last resort: a sentence that's a list of independent effects — "draw a card and ~ can't be blocked this turn",
// "gain control of target creature until end of turn, untap that creature, and it gains haste until end of turn".
const VERB = '(?:draw|draws|create|creates|put|puts|return|returns|exile|exiles|destroy|destroys|sacrifice|sacrifices|untap|tap|discard|discards|add|counter|you|it|~|that creature|that player|each|target|scry|surveil|mill|mills|proliferate|investigate|shuffle|creatures|prevent|gain|gains|lose|loses|those creatures)\\b|~(?=[\\s\'])';
let andBusy = false;
EXT.rules.push([new RegExp(`^(.+?)(?:,? and |, )(?=${VERB})(.+)$`), (m, ctx) => {
  if (andBusy) return null;
  const full = m[0];
  const parts = full.split(new RegExp(`(?:,? and |, )(?=${VERB})`));
  if (parts.length < 2 || parts.some((p) => p.length < 4)) return null;
  if (/ until end of turn$/.test(parts[parts.length - 1])) for (let i = 0; i < parts.length - 1; i++) if (/ gets? [+-][\dx]+\/[+-][\dx]+$/.test(parts[i])) parts[i] += ' until end of turn';
  const k0 = ctx.specs.length;
  const last0 = ctx.last;
  const out: any[] = [];
  andBusy = true;
  try {
    for (const p of parts) {
      const r = parseSentence(p, ctx);
      if (!r || r.some((e: any) => e.k === 'manual')) { ctx.specs.length = k0; ctx.last = last0; return null; }
      out.push(...r);
    }
  } finally { andBusy = false; }
  return out;
}]);
// "Proliferate twice."
EXT.rules.push([/^proliferate (twice|three times)$/, (m) => Array.from({ length: m[1] === 'twice' ? 2 : 3 }, () => ({ k: 'proliferate' } as any))]);

// "If that spell is countered this way, put it on top of its owner's library instead of into that player's graveyard."
EXT.rules.push([/^if that spell is countered this way, (?:put (?:it|that card) on (top|the bottom|your choice of the top or bottom) of its owner's library|exile it) instead of (?:putting it )?into (?:that player's|its owner's) graveyard$/, (m) => [{ k: 'ext', name: 'counteredTo', dest: m[1] === 'the bottom' ? 'bottom' : m[1] ? 'top' : 'exile' }]]);
EXT.effects.counteredTo = ({ s, e, api }) => {
  const c = (s as any).lastCountered as string | undefined;
  if (!c || s.cards[c]?.zone !== 'graveyard') return 'done';
  if (e.dest === 'exile') { api.moveCard(s, c, 'exile'); return 'done'; }
  api.moveCard(s, c, 'library');
  const L = s.players[s.cards[c].owner].library;
  const i = L.indexOf(c);
  if (i >= 0) { L.splice(i, 1); if (e.dest === 'top') L.unshift(c); else L.push(c); }
  return 'done';
};
// Conditions about the spell that triggered / the card just moved
EXT.conds.push((t) => {
  let m = t.match(/^(\w+) or more mana was spent to cast (?:that spell|it)$/);
  if (m && n0(m[1])) return { k: 'ext', name: 'trigManaSpent', n: n0(m[1]) };
  m = t.match(/^it was an? (creature|land|artifact|enchantment|instant|sorcery|nonland|noncreature|permanent) card$/);
  if (m) return { k: 'ext', name: 'refType', type: m[1] };
  m = t.match(/^its mana value was (\d+) or less$/);
  if (m) return { k: 'ext', name: 'refCmcMax', n: +m[1] };
  return null;
});
EXT.condEval.trigManaSpent = (s, c, _y, _self, ctx: any) => { const o = ctx?.triggerObj ?? ctx?.item?.triggerObj; return !!o && ((s.cards[o] as any)?.manaSpent ?? 0) >= c.n; };
const refOf = (s: any, ctx: any): string | undefined => {
  const it = ctx?.item;
  if (!it) return undefined;
  return (it.exiledHere ?? [])[0] ?? (it.lastTokens ?? [])[0] ?? it.targets?.flat?.().find((t: any) => t.kind === 'card')?.iid ?? it.triggerObj ?? (s.lastCountered as string | undefined);
};
EXT.condEval.refType = (s, c, _y, _self, ctx: any) => {
  const r = refOf(s, ctx);
  if (!r || !s.cards[r]) return false;
  const tl = s.defs[s.cards[r].defId].typeLine.toLowerCase();
  return c.type === 'nonland' ? !/\bland\b/.test(tl) : c.type === 'noncreature' ? !/\bcreature\b/.test(tl) : c.type === 'permanent' ? /\b(creature|artifact|enchantment|land|planeswalker|battle)\b/.test(tl) : new RegExp(`\\b${c.type}\\b`).test(tl);
};
EXT.condEval.refCmcMax = (s, c, _y, _self, ctx: any) => { const r = refOf(s, ctx); return !!r && !!s.cards[r] && (s.defs[s.cards[r].defId].cmc ?? 0) <= c.n; };

// "If this is the second time this ability has resolved this turn, …"
EXT.conds.push((t) => {
  const m = t.match(/^this is the (first|second|third|fourth|fifth) time this ability has resolved this turn$/);
  return m ? { k: 'ext', name: 'resolvedNth', n: ({ first: 1, second: 2, third: 3, fourth: 4, fifth: 5 } as any)[m[1]] } : null;
});
EXT.condEval.resolvedNth = (s, c, _y, self, ctx: any) => {
  const it = ctx?.item;
  if (!it) return false;
  if (it.resolvedIdx === undefined) {
    const k = `${self ?? it.source}:${(it.text ?? '').slice(0, 60)}`;
    const m = ((s as any).resolvedCounts ??= {});
    if (m.turn !== s.turn) { for (const x of Object.keys(m)) delete m[x]; m.turn = s.turn; }
    m[k] = (m[k] ?? 0) + 1;
    it.resolvedIdx = m[k];
  }
  return it.resolvedIdx === c.n;
};
// "If you can't, sacrifice ~." / "If the player can't, …" — the previous action couldn't be done
EXT.rules.push([/^if (?:you|they|the player|that player) can't, (.+)$/, (m, ctx) => {
  const inner = parseSentence(m[1], ctx);
  return inner && !inner.some((e: any) => e.k === 'manual') ? [{ k: 'if', cond: { k: 'youDid', not: true }, effects: inner } as any] : null;
}]);

// "If it's a Vampire / that creature is legendary / that land is a Mountain / that land was nonbasic / that creature has toxic …"
EXT.conds.push((t) => {
  const m = t.match(/^(?:it's|it is|it was|that creature is|that creature was|that card is|that land is|that land was|that permanent is|that permanent was) (?:an? )?(.+)$/);
  if (!m) return null;
  let ph = m[1];
  if (['attacking', 'blocking', 'tapped', 'untapped', 'enchanted', 'equipped', 'renowned', 'monstrous', 'modified', 'your turn', "an opponent's turn"].includes(ph) || /turn|phase|step/.test(ph)) {
    if (ph === 'attacking' || ph === 'blocking') return { k: 'ext', name: 'refCombat', what: ph };
    return null;
  }
  const kw = ph.match(/^has (\w+)$/);
  if (/^has /.test(ph) && !kw) return null;
  const f = kw ? { keyword: kw[1] } : looseFilter(ph) ?? looseFilter(`${ph} permanent`);
  if (!f) return null;
  return { k: 'ext', name: 'refIs', filter: { ...f, zone: undefined } };
});
EXT.conds.push((t) => (/^that creature has (\w+)$/.test(t) ? { k: 'ext', name: 'refIs', filter: { keyword: t.split(' ').pop() } } : null));
EXT.condEval.refIs = (s, c, you, _self, ctx: any) => {
  const r = refOf(s, ctx);
  if (!r || !s.cards[r]) return false;
  return matchesFilter(s, r, { ...c.filter, zone: s.cards[r].zone }, you);
};
EXT.condEval.refCombat = (s, c, _y, _self, ctx: any) => {
  const r = refOf(s, ctx);
  if (!r) return false;
  return c.what === 'attacking' ? !!s.combat?.attackers.some((a) => a.iid === r) : !!s.combat?.attackers.some((a) => a.blockedBy.includes(r));
};
EXT.conds.push((t) => {
  if (/^it's your (?:precombat |first |)main phase$/.test(t)) return { k: 'ext', name: 'myMain' };
  let m = t.match(/^the result is (\d+) or (less|more|greater)$/);
  if (m) return { k: 'ext', name: 'rollRes', n: +m[1], less: m[2] === 'less' };
  if (/^you controlled that permanent$/.test(t) || /^you controlled it$/.test(t)) return { k: 'ext', name: 'refWasMine' };
  m = t.match(/^this ability has been activated (\w+) or more times this turn$/);
  if (m && n0(m[1])) return { k: 'ext', name: 'actCountMin', n: n0(m[1]) };
  m = t.match(/^an? (land|creature|nonland|artifact) card was milled this way$/);
  if (m) return { k: 'ext', name: 'milledType', type: m[1] };
  if (/^no creatures attacked this turn$/.test(t)) return { k: 'ext', name: 'noAttacksTurn' };
  return null;
});
EXT.condEval.myMain = (s, _c, you) => s.active === you && (s.step === 'main1' || s.step === 'main2');
EXT.condEval.rollRes = (_s, c, _y, _self, ctx: any) => { const r = ctx?.item?.rolled; return r !== undefined && (c.less ? r <= c.n : r >= c.n); };
EXT.condEval.refWasMine = (s, _c, you, _self, ctx: any) => { const r = refOf(s, ctx); const lk = r ? (s as any).lkiCache?.[r] : null; return !!r && ((lk?.controller ?? s.cards[r]?.controller) === you); };
EXT.condEval.actCountMin = (s, c, _y, self, ctx: any) => { const k = `act:${self ?? ctx?.item?.source}`; const m = (s as any).actCounts ?? {}; return m.turn === s.turn && (m[k] ?? 0) >= c.n; };
EXT.hooks.event.push((s, name, d) => { if (name !== 'activate') return; const m = ((s as any).actCounts ??= {}); if (m.turn !== s.turn) { for (const x of Object.keys(m)) delete m[x]; m.turn = s.turn; } m[`act:${d.iid}`] = (m[`act:${d.iid}`] ?? 0) + 1; });
EXT.condEval.milledType = (s, c, _y, _self, ctx: any) => {
  const it = ctx?.item;
  const ids: string[] = it?.milled ?? it?.milledHere ?? [];
  return ids.some((x) => { const tl = s.defs[s.cards[x].defId].typeLine.toLowerCase(); return c.type === 'nonland' ? !/\bland\b/.test(tl) : new RegExp(`\\b${c.type}\\b`).test(tl); });
};
EXT.condEval.noAttacksTurn = (s) => TL(s).attacked.length === 0;

// Token replacement statics
const tokOf = (desc: string): any | null => {
  const r = parseSentence(`create a ${desc} token`, { specs: [] } as any);
  return r && r.length === 1 && (r[0] as any).k === 'token' ? (r[0] as any).token : null;
};
EXT.lines.push((line, pc) => {
  let m = line.match(/^(?:if one or more (creature )?tokens would be created under your control|if you would create one or more (creature )?tokens), (?:instead create )?those tokens plus (that many|an additional|a|an) (.+?) tokens? (?:are created instead|instead)?$/);
  if (m) {
    const t = tokOf(m[4]);
    if (!t) return false;
    (pc as any).tokPlus = [...((pc as any).tokPlus ?? []), { creatureOnly: !!(m[1] || m[2]), spec: t, perToken: m[3] === 'that many' }];
    return true;
  }
  m = line.match(/^if one or more (creature )?tokens would be created under your control, (twice|three times) that many of those tokens are created instead$/);
  if (m) { (pc as any).tokMult = { creatureOnly: !!m[1], n: m[2] === 'twice' ? 2 : 3 }; return true; }
  m = line.match(/^if one or more creature tokens would be created under your control, that many (.+?) tokens are created instead$/);
  if (m) { const t = tokOf(m[1]); if (!t) return false; (pc as any).tokReplace = t; return true; }
  return false;
});
const isCreatureTok = (spec: any) => /\bcreature\b/i.test(spec?.types ?? '');
EXT.hooks.tokenSpec.push((s, p, spec, api) => {
  for (const b of sourcesWith(s, 'tokReplace')) if (s.cards[b].controller === p && isCreatureTok(spec)) return (api.chars(s, b).pc as any).tokReplace;
  return undefined;
});
EXT.hooks.tokenMult.push((s, p, spec, api) => {
  let f = 1;
  for (const b of sourcesWith(s, 'tokMult')) { const r = (api.chars(s, b).pc as any).tokMult; if (s.cards[b].controller === p && (!r.creatureOnly || isCreatureTok(spec))) f *= r.n; }
  return f;
});
let tpBusy = false;
EXT.hooks.tokensMade.push((s, p, n, spec, api) => {
  if (tpBusy) return;
  tpBusy = true;
  try {
    for (const b of sourcesWith(s, 'tokPlus')) {
      if (s.cards[b].controller !== p) continue;
      for (const r of (api.chars(s, b).pc as any).tokPlus ?? []) {
        if (r.creatureOnly && !isCreatureTok(spec)) continue;
        const k = r.perToken ? n : 1;
        for (let i = 0; i < k; i++) api.createToken(s, p, r.spec);
        api.log(s, `${api.nm(s, b)}: ${k} extra ${r.spec.name} token${k > 1 ? 's' : ''}.`, p);
      }
    }
  } finally { tpBusy = false; }
});
EXT.lines.push((line, pc) => {
  const m = line.match(/^if ~ would die, (put it on top of its owner's library|put it on the bottom of its owner's library|shuffle it into (?:your|its owner's) library|return it to its owner's hand) instead$/);
  if (!m) return false;
  (pc as any).selfDieTo = /top/.test(m[1]) ? 'libraryTop' : /bottom/.test(m[1]) ? 'libraryBottom' : /shuffle/.test(m[1]) ? 'shuffle' : 'hand';
  return true;
});

// "If a triggered ability of a legendary creature / another Wolf / a permanent you control triggers, that ability
// triggers an additional time." (source-based trigger doubling)
EXT.lines.push((line, pc) => {
  const m = line.match(/^if a triggered ability of (?:an? )?(another |other )?(.+?) you control triggers, that ability triggers an additional time$/);
  if (!m) return false;
  const ph = m[2].replace(/ or (?:another |an? )/g, ' or ');
  const f = ph === 'permanent' ? {} : looseFilter(ph);
  if (!f) return false;
  (pc as any).trigExtraF = { filter: { ...f, zone: undefined }, other: !!m[1] };
  return true;
});
EXT.hooks.trigExtra.push((s, source, controller, api) => {
  let n = 0;
  for (const b of sourcesWith(s, 'trigExtraF')) {
    if (s.cards[b].controller !== controller || !s.cards[source]) continue;
    const r = (api.chars(s, b).pc as any).trigExtraF;
    if (r.other && b === source) continue;
    const z = s.cards[source].zone;
    if (api.matchesFilter(s, source, { ...r.filter, zone: z }, controller, b)) n++;
  }
  return n;
});
// "Enchanted creature has protection from black. This effect doesn't remove ~." / "… from the chosen color …"
EXT.lines.push((line, pc) => {
  const m = line.match(/^(enchanted|equipped) creature has protection from (.+?)(?:\. this effect doesn't remove .+)?$/);
  if (!m) return false;
  if (m[2] === 'the chosen color') { pc.statics.push({ kind: 'attachPump', attach: m[1], p: 0, t: 0, kw: [], protChosen: true } as any); return true; }
  const parts = m[2].split(/,? and from |, from /);
  if (!parts.every((x) => /^(white|blue|black|red|green|artifacts|creatures|everything|enchantments|instants|sorceries)$/.test(x))) return false;
  pc.statics.push({ kind: 'attachPump', attach: m[1], p: 0, t: 0, kw: parts.map((x) => `protection from ${x}`) } as any);
  return true;
});

// "Once during each of your turns, you may cast a Zombie creature spell / an artifact spell from your graveyard."
EXT.lines.push((line, pc) => {
  const m = line.match(/^once during each of your turns, you may cast (?:an? )?(.+?) spell from your graveyard(?:\. if a spell cast this way would be put into your graveyard, exile it instead)?$/);
  if (!m) return false;
  const ph = m[1].replace(/ or /g, ' or ');
  const f = ph === '' ? {} : looseFilter(ph) ?? looseFilter(ph.replace(/ spell$/, ''));
  if (!f) return false;
  (pc as any).gyCastOnce = { filter: { ...f, zone: undefined }, exileAfter: /exile it instead/.test(line) };
  return true;
});
const gyOnceSrc = (s: any, p: number, card: any, api: any): string | undefined => {
  if (s.active !== p || card.zone !== 'graveyard' || card.owner !== p) return undefined;
  for (const b of sourcesWith(s, 'gyCastOnce')) {
    if (s.cards[b].controller !== p) continue;
    if ((s.cards[b] as any).gyOnceTurn === s.turn) continue;
    const r = (api.chars(s, b).pc as any).gyCastOnce;
    if (/\bLand\b/.test(s.defs[card.defId].typeLine) && !/\b(Creature|Artifact|Instant|Sorcery|Enchantment)\b/.test(s.defs[card.defId].typeLine)) continue;
    if (api.matchesFilter(s, card.iid, { ...r.filter, zone: 'graveyard' }, p, b)) return b;
  }
  return undefined;
};
EXT.hooks.zoneCast.push((s, p, card, _pcf, api) => { const b = gyOnceSrc(s, p, card, api); if (b) (card as any).gyOnceVia = b; return b ? 'ext:gyOnce' : null; });
EXT.alts.gyOnce = { label: 'from graveyard (once each turn)', begin: (s, _p, iid) => s.defs[s.cards[iid].defId].manaCost || '' };
EXT.hooks.castPay.push((s, pc, api) => {
  if (pc.alt !== 'ext:gyOnce') return;
  const b = (s.cards[pc.iid] as any)?.gyOnceVia as string | undefined;
  if (b && s.cards[b]) { (s.cards[b] as any).gyOnceTurn = s.turn; if ((api.chars(s, b).pc as any).gyCastOnce.exileAfter) (s.cards[pc.iid] as any).castFromGraveyardExile = true; }
});

// Damage doubling: "If a creature you control would deal damage to a permanent or player, it deals double that damage instead."
const DBL = /^if (any source you control|a source you control|a source|a creature|~|enchanted creature|equipped creature|an? (.+?) (?:source )?you control|an? (.+?) spell you control) would deal (combat |noncombat )?damage(?: to (a permanent or player|an opponent|a player|enchanted player|a creature|an opponent or a permanent an opponent controls|you))?( this turn)?, it deals (double|triple) that damage(?: to (?:that permanent or player|that player|that creature|that player or permanent))? instead$/;
const dblSpec = (m: RegExpMatchArray): any | null => {
  let src: any;
  if (/^(any source you control|a source you control)$/.test(m[1])) src = { mine: true };
  else if (m[1] === 'a source') src = {};
  else if (m[1] === 'a creature') src = { filter: { types: ['creature'] } };
  else if (m[1] === '~') src = { self: true };
  else if (/^(enchanted|equipped) creature$/.test(m[1])) src = { attached: true };
  else { const ph = m[2] ?? m[3]; const f = looseFilter(ph.replace(/ source$/, '')); if (!f) return null; src = { mine: true, filter: { ...f, zone: undefined } }; }
  const kind = m[4]?.trim();
  return { src, kind, to: m[5] ?? 'any', mult: m[7] === 'triple' ? 3 : 2 };
};
EXT.lines.push((line, pc) => {
  const m = line.match(DBL);
  if (!m || m[6]) return false;
  const d = dblSpec(m);
  if (!d) return false;
  (pc as any).dmgDouble = [...((pc as any).dmgDouble ?? []), d];
  return true;
});
EXT.rules.push([DBL, (m) => { if (!m[6]) return null; const d = dblSpec(m); return d ? [{ k: 'ext', name: 'dblTurn', d }] : null; }]);
EXT.effects.dblTurn = ({ s, item, e, you }) => { ((s as any).dblTurn ??= []).push({ turn: s.turn, you, src: item.source, d: e.d }); return 'done'; };
const dblHit = (s: any, api: any, holder: string, ctrl: number, d: any, source: string, to: any, combat: boolean): boolean => {
  if (d.kind === 'combat' && !combat) return false;
  if (d.kind === 'noncombat' && combat) return false;
  const sc = s.cards[source];
  if (!sc) return false;
  if (d.src.self && source !== holder) return false;
  if (d.src.attached && source !== s.cards[holder]?.attachedTo) return false;
  if (d.src.mine && sc.controller !== ctrl) return false;
  if (d.src.filter && !api.matchesFilter(s, source, { ...d.src.filter, zone: sc.zone }, ctrl, holder)) return false;
  const tP = to.kind === 'player';
  switch (d.to) {
    case 'an opponent': return tP && to.idx !== ctrl;
    case 'a player': return tP;
    case 'you': return tP && to.idx === ctrl;
    case 'enchanted player': return tP && to.idx === (s.cards[holder] as any)?.attachedPlayer;
    case 'a creature': return !tP && !!s.cards[to.iid] && api.chars(s, to.iid).types.has('creature');
    case 'an opponent or a permanent an opponent controls': return tP ? to.idx !== ctrl : s.cards[to.iid]?.controller !== ctrl;
    default: return true;
  }
};
EXT.hooks.damage.push((s, source, to, n, combat, api) => {
  if (n <= 0) return n;
  let out = n;
  for (const b of sourcesWith(s, 'dmgDouble')) for (const d of (api.chars(s, b).pc as any).dmgDouble) if (dblHit(s, api, b, s.cards[b].controller, d, source, to, combat)) out *= d.mult ?? 2;
  for (const r of ((s as any).dblTurn ?? []) as any[]) if (r.turn === s.turn && dblHit(s, api, r.src, r.you, r.d, source, to, combat)) out *= r.d.mult ?? 2;
  return out;
});

// amounts: "twice X", "X plus Y", cards in all graveyards / all hands
let sumBusy = 0;
EXT.amountPhrases.push((ph) => {
  if (sumBusy > 2) return null;
  let m = ph.match(/^twice (.+)$/);
  sumBusy++;
  try {
    if (m) { const a = parseAmtPhrase(m[1], { specs: [] } as any); return a == null ? null : typeof a === 'number' ? a * 2 : { ext: 'sumAmt', parts: [a, a] }; }
    m = ph.match(/^(the number of .+?) plus (the number of .+)$/);
    if (m) { const a = parseAmtPhrase(m[1], { specs: [] } as any); const b = parseAmtPhrase(m[2], { specs: [] } as any); return a != null && b != null ? { ext: 'sumAmt', parts: [a, b] } : null; }
  } finally { sumBusy--; }
  if (/^the (?:total )?number of cards in all graveyards$/.test(ph)) return { ext: 'allGyCards' };
  if (/^the total number of cards in all players' hands$/.test(ph) || /^the number of cards in all players' hands$/.test(ph)) return { ext: 'allHandCards' };
  return null;
});
EXT.amounts.sumAmt = (s, a: any, you, self, ctx) => (a.parts as any[]).reduce((t, x) => t + evalAmt(s, x, you, self, ctx), 0);
EXT.amounts.allGyCards = (s) => s.players.reduce((t, p) => t + p.graveyard.length, 0);
EXT.amounts.allHandCards = (s) => s.players.reduce((t, p) => t + p.hand.length, 0);

// "the exiled card's mana value" / "the discarded card's power" / "that card's power"
EXT.hooks.afterMove.push((s, iid, from, to, opts) => {
  if (from === 'hand' && to === 'graveyard' && opts?.cause === 'discard') { const r = (s as any).resolving?.item; if (r) (r.discardedHere ??= []).push(iid); }
});
EXT.amountPhrases.push((ph) => {
  const m = ph.match(/^(the exiled|the discarded|the milled|the revealed|that) card's (mana value|power|toughness)$/);
  if (!m) return null;
  return { ext: 'refStat', which: m[1].replace(/^the /, ''), stat: m[2] === 'mana value' ? 'cmc' : m[2] };
});
EXT.amounts.refStat = (s, a: any, _you, _self, ctx: any) => {
  const it = ctx?.item;
  if (!it) return 0;
  const pick = a.which === 'exiled' ? (it.exiledHere ?? it.exiledTop ?? [])[0] : a.which === 'discarded' ? (it.discardedHere ?? [])[0] : a.which === 'milled' ? (it.milled ?? [])[0] : a.which === 'revealed' ? (it.exiledTop ?? it.revealed ?? [])[0] : refOf(s, ctx);
  if (!pick || !s.cards[pick]) return 0;
  const d = s.defs[s.cards[pick].defId];
  if (a.stat === 'cmc') return d.cmc ?? 0;
  const ch = s.cards[pick].zone === 'battlefield' ? chars(s, pick) : baseChars(s, pick);
  return Math.max(0, a.stat === 'power' ? ch.power : ch.toughness);
};
// "It deals that much damage to each other opponent." — no other opponents in a two-player game
EXT.rules.push([/^(?:it|~) deals that much damage to each other opponent(?: if .+)?$/, () => []]);
// "If a red source you control would deal damage to an opponent or a permanent an opponent controls, it deals that much damage plus 2 instead." (Torbran)
const PLUS = /^if (any source you control|a source you control|another source you control|a source|a spell|~|an? (.+?) (?:source |spell )?you control|another (.+?) source you control|an? (.+?) spell) would deal (combat |noncombat )?damage(?: to (a permanent or player|an opponent|a player|a creature you control|a creature|an opponent or a permanent an opponent controls))?, it deals that much damage (plus|minus) (\d+)(?: to (?:that permanent or player|that player|that creature|that player or permanent))? instead$/;
EXT.lines.push((line, pc) => {
  const m = line.match(PLUS);
  if (!m) return false;
  let src: any;
  if (/^(any source you control|a source you control)$/.test(m[1])) src = { mine: true };
  else if (m[1] === 'another source you control') src = { mine: true, other: true };
  else if (m[1] === 'a source') src = {};
  else if (m[1] === 'a spell') src = { spell: true };
  else if (m[1] === '~') src = { self: true };
  else {
    const ph = (m[2] ?? m[3] ?? m[4]).replace(/ or artifact$/, '');
    const CW: any = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };
    const parts = ph.split(' or ');
    const f: any = parts.every((p) => CW[p]) ? { colors: parts.map((p) => CW[p]) } : looseFilter(ph.replace(/ instant or sorcery$/, ' instant or sorcery'));
    if (!f) return false;
    src = { mine: !!(m[2] || m[3]), other: !!m[3], filter: { ...f, zone: undefined }, spell: /spell/.test(m[1]) };
  }
  const to = m[6] === 'a creature you control' ? 'mine' : m[6] ?? 'any';
  ((pc as any).dmgPlus ??= []).push({ src, kind: m[5]?.trim(), to, n: (m[7] === 'minus' ? -1 : 1) * +m[8] });
  return true;
});
EXT.hooks.damage.push((s, source, to, n, combat, api) => {
  if (n <= 0) return n;
  let out = n;
  for (const b of sourcesWith(s, 'dmgPlus')) {
    const ctrl = s.cards[b].controller;
    for (const d of (api.chars(s, b).pc as any).dmgPlus) {
      const sc = s.cards[source];
      if (!sc) continue;
      if (d.kind === 'combat' && !combat) continue;
      if (d.kind === 'noncombat' && combat) continue;
      if (d.src.self && source !== b) continue;
      if (d.src.other && source === b) continue;
      if (d.src.mine && sc.controller !== ctrl) continue;
      if (d.src.spell && sc.zone !== 'stack') continue;
      if (d.src.filter && !api.matchesFilter(s, source, { ...d.src.filter, zone: sc.zone }, ctrl, b)) continue;
      const tP = to.kind === 'player';
      const tid = (to as any).iid as string;
      const ok = d.to === 'any' || d.to === 'a permanent or player' ? true : d.to === 'an opponent' ? tP && to.idx !== ctrl : d.to === 'a player' ? tP : d.to === 'mine' ? !tP && s.cards[tid]?.controller === ctrl && api.chars(s, tid).types.has('creature') : d.to === 'a creature' ? !tP && !!s.cards[tid] && api.chars(s, tid).types.has('creature') : tP ? (to as any).idx !== ctrl : s.cards[tid]?.controller !== ctrl;
      if (ok) out = Math.max(0, out + d.n);
    }
  }
  return out;
});

EXT.conds.push((t) => {
  if (/^another creature died this turn$/.test(t)) return { k: 'ext', name: 'died', n: 1 };
  if (/^you control an? modified creature$/.test(t)) return { k: 'ext', name: 'ctrlRel', rel: 'modified' };
  if (/^you've discarded (?:a|one or more) cards? this turn$/.test(t)) return { k: 'ext', name: 'discardedTurnAny' };
  if (/^you discarded (?:a|one or more) cards? this way$/.test(t)) return { k: 'ext', name: 'discardedHereAny' };
  return null;
});
EXT.condEval.ctrlRel = (s, c, you) => s.battlefield.some((b) => s.cards[b].controller === you && baseChars(s, b).types.has('creature') && matchesFilter(s, b, { rel: c.rel, zone: 'battlefield' } as any, you));
EXT.condEval.discardedTurnAny = (s, _c, you) => { const d: any = (s.players[you] as any).discardedTurn; return d?.turn === s.turn && d.n > 0; };
EXT.condEval.discardedHereAny = (_s, _c, _y, _self, ctx: any) => (ctx?.item?.discardedHere ?? []).length > 0;

// More activation costs: "put a -1/-1 counter on ~", "tap enchanted creature/land", "return three lands you control to
// their owner's hand", "tap three other untapped creatures you control"
EXT.costParts.push((p, c) => {
  let m: RegExpMatchArray | null;
  if ((m = p.match(/^put an? ([+-]\d\/[+-]\d|[a-z]+) counter on ~$/))) { (c.extra ??= []).push({ k: 'selfCounterPut', counter: m[1] }); return true; }
  if ((m = p.match(/^tap enchanted (creature|land|permanent|artifact)$/))) { (c.extra ??= []).push({ k: 'tapHost' }); return true; }
  if ((m = p.match(/^return (three|four|five) (.+?) you control to (?:its|their) owners?'s? hands?$/))) {
    const f = looseFilter(m[2].replace(/s$/, '')) ?? looseFilter(m[2]);
    if (!f) return false;
    (c.extra ??= []).push({ k: 'bounceN', filter: { ...f, zone: undefined, controller: undefined }, n: N[m[1]] });
    return true;
  }
  if ((m = p.match(/^tap (two|three|four|five) (other )?untapped (.+?) you control$/))) {
    const f = looseFilter(m[3].replace(/s$/, '')) ?? looseFilter(m[3]);
    if (!f) return false;
    c.tapCreatures = { n: N[m[1]], filter: { ...f, zone: undefined, controller: undefined, ...(m[2] ? { other: true } : {}) } };
    return true;
  }
  return false;
});
EXT.hooks.canActivate.push((s, p, iid, a, api) => {
  for (const x of a.cost?.extra ?? []) {
    if (x.k === 'tapHost') { const h = s.cards[iid]?.attachedTo; if (!h || !s.cards[h] || s.cards[h].tapped) return false; }
    if (x.k === 'bounceN' && s.battlefield.filter((b) => s.cards[b].controller === p && api.matchesFilter(s, b, { ...x.filter, zone: 'battlefield' }, p, iid)).length < x.n) return false;
  }
  return undefined;
});
EXT.hooks.castPay.push((s, pc, api) => {
  if (pc.kind !== 'ability') return;
  const a = api.chars(s, pc.iid)?.pc?.activated?.[pc.abilityIdx] as any;
  for (const x of a?.cost?.extra ?? []) {
    if (x.k === 'selfCounterPut' && s.cards[pc.iid]) api.addCounters(s, pc.iid, x.counter, 1);
    if (x.k === 'tapHost') { const h = s.cards[pc.iid]?.attachedTo; if (h && s.cards[h]) s.cards[h].tapped = true; }
    if (x.k === 'bounceN') {
      // the AI/auto-payer returns the least valuable ones (tapped first)
      const pool = s.battlefield.filter((b) => s.cards[b].controller === pc.player && api.matchesFilter(s, b, { ...x.filter, zone: 'battlefield' }, pc.player, pc.iid)).sort((u, v) => Number(s.cards[v].tapped) - Number(s.cards[u].tapped));
      for (const b of pool.slice(0, x.n)) api.moveCard(s, b, 'hand');
    }
  }
});

// "When this Class becomes level 2, …"
EXT.triggers.push((cond) => { const m = cond.match(/^when ~ becomes level (\d+)$/); return m ? [{ event: 'classLevelX', data: { n: +m[1] } }] : null; });
EXT.hooks.event.push((s, name, d, api) => {
  if (name !== 'classLevel' || !s.cards[d.iid]) return;
  for (const t of api.chars(s, d.iid).pc.triggers as any[]) if (t.event === 'classLevelX' && t.data.n === d.n) api.queueTrigger(s, d.iid, s.cards[d.iid].controller, t, {});
});

// "whenever you cast a spell you don't own" / "when ~ enters from a graveyard" / attach-change triggers
EXT.triggers.push((cond) => {
  let m: RegExpMatchArray | null;
  if ((m = cond.match(/^whenever you cast a (noncreature )?spell you don't own$/))) return [{ event: 'castSpell', filter: m[1] ? { notTypes: ['creature'] } : { types: ['spell'] }, last: TO, cond: { k: 'ext', name: 'trigNotOwned' } }];
  if (/^when(?:ever)? ~ enters from a graveyard$/.test(cond)) return [{ event: 'etbFromGy', data: { self: true } }];
  if (/^whenever ~ or another (?:permanent|creature) enters from a graveyard$/.test(cond)) return [{ event: 'etbFromGy', data: {} , last: TO }];
  if (/^whenever ~ becomes attached to a creature$/.test(cond)) return [{ event: 'attachX', data: { self: true, on: true }, last: TO }];
  if (/^whenever ~ becomes unattached from a permanent$/.test(cond)) return [{ event: 'attachX', data: { self: true, on: false }, last: TO }];
  if (/^whenever an aura becomes attached to ~$/.test(cond)) return [{ event: 'attachX', data: { auraOnSelf: true, on: true } }];
  if (/^whenever an aura you control becomes attached to a creature you control$/.test(cond)) return [{ event: 'attachX', data: { myAuraMine: true, on: true }, last: TO }];
  return null;
});
EXT.condEval.trigNotOwned = (s, _c, you, _self, ctx: any) => { const o = ctx?.triggerObj ?? ctx?.item?.triggerObj; return !!o && s.cards[o]?.owner !== you; };
EXT.hooks.afterMove.push((s, iid, from, to, _o, api) => {
  if (from !== 'graveyard' || to !== 'battlefield') return;
  for (const oid of [...api.observers(s)]) {
    const o = s.cards[oid];
    if (!o) continue;
    for (const t of api.chars(s, oid).pc.triggers as any[]) {
      if (t.event !== 'etbFromGy') continue;
      if (t.data.self && oid !== iid) continue;
      api.queueTrigger(s, oid, o.controller, t, { triggerObj: iid });
    }
  }
});
// attach changes are noticed between actions (state check): compare with the last seen host
EXT.hooks.sba.push((s, api) => {
  const seen: Record<string, string | undefined> = ((s as any).attachSeen ??= {});
  let any = false;
  const watchers = sourcesWith(s, 'attachTrig');
  if (!watchers.length && !Object.keys(seen).length) return false;
  for (const b of s.battlefield) {
    const now = s.cards[b].attachedTo;
    const was = seen[b];
    if (now === was) continue;
    seen[b] = now;
    const isAura = baseChars(s, b).subtypes.has('aura');
    for (const oid of watchers) {
      const o = s.cards[oid];
      if (!o) continue;
      for (const t of api.chars(s, oid).pc.triggers as any[]) {
        if (t.event !== 'attachX') continue;
        const D = t.data;
        if (D.self) {
          if (oid !== b) continue;
          if (D.on && now && s.cards[now] && api.chars(s, now).types.has('creature')) { api.queueTrigger(s, oid, o.controller, t, { triggerObj: now }); any = true; }
          if (!D.on && was) { api.queueTrigger(s, oid, o.controller, t, { triggerObj: was }); any = true; }
        } else if (D.auraOnSelf) {
          if (isAura && now === oid) { api.queueTrigger(s, oid, o.controller, t, { triggerObj: b }); any = true; }
        } else if (D.myAuraMine) {
          if (isAura && now && s.cards[b].controller === o.controller && s.cards[now]?.controller === o.controller && api.chars(s, now).types.has('creature')) { api.queueTrigger(s, oid, o.controller, t, { triggerObj: now }); any = true; }
        }
      }
    }
  }
  for (const k of Object.keys(seen)) if (s.cards[k]?.zone !== 'battlefield') { const was = seen[k]; delete seen[k]; if (was) { const o = s.cards[k]; for (const t of (o ? api.parsedFor(s, o).triggers : []) as any[]) if (t.event === 'attachX' && t.data.self && !t.data.on) { api.queueTrigger(s, k, o.controller, t, { triggerObj: was }); any = true; } } }
  return any;
});
EXT.triggers.push((cond) => (/^whenever you complete a dungeon$/.test(cond) ? [{ event: 'pEvent', data: { ev: 'dungeonDone' } }] : null));
EXT.hooks.event.push((s, name, d, api) => {
  if (name !== 'dungeonDone') return;
  for (const oid of [...api.observers(s)]) { const o = s.cards[oid]; if (o && o.controller === d.p) for (const t of api.chars(s, oid).pc.triggers as any[]) if (t.event === 'pEvent' && t.data.ev === 'dungeonDone') api.queueTrigger(s, oid, o.controller, t, {}); }
});

// Ice Age lands: "If ~ would enter, sacrifice a Forest instead. If you do, put ~ onto the battlefield. If you don't, put it
// into its owner's graveyard." — approximated as an enters trigger
EXT.expand.push((line) => {
  const m = line.match(/^if ~ would enter, sacrifice (an? .+?|two untapped lands|two lands) instead\. if you do, put ~ onto the battlefield\. if you don't, put it into its owner's graveyard$/);
  return m ? [`when ~ enters, sacrifice ${m[1].replace(/^(two|an?) /, '$1 other ')}. if you can't, sacrifice ~`] : null;
});
