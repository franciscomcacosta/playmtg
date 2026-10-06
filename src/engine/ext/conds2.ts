// Plugin: more conditions ("if …" / "as long as …" / cost-reduction "if …").
import { EXT } from '../ext';
import { looseFilter, parseFilter } from '../oracle';
import { matchesFilter, chars } from '../rules';
import type { GameState, PlayerIdx } from '../types';

const W: Record<string, number> = { no: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const n0 = (w: string) => (/^\d+$/.test(w) ? +w : W[w]);
const C = (name: string, extra: any = {}) => ({ k: 'ext', name, ...extra });
const sing = (p: string) => p.replace(/\b(el|dwar|wol)ves\b/g, '$1f').replace(/ies\b/g, 'y').replace(/(?<![su])s\b/g, '');

// per-turn bookkeeping
type T3 = { turn: number; sac: string[][]; crime: boolean[]; castTypes: string[][] };
function t3(s: GameState): T3 {
  const t = (s as any).t3 as T3 | undefined;
  if (t && t.turn === s.turn) return t;
  const n: T3 = { turn: s.turn, sac: [[], []], crime: [false, false], castTypes: [[], []] };
  (s as any).t3 = n;
  return n;
}
EXT.hooks.event.push((s, name, d, api) => {
  if (name === 'leave' && d.opts?.cause === 'sacrifice' && d.lki) {
    const types = [...(d.lki.types ?? [])];
    const tl = (s.defs[d.card.defId]?.typeLine ?? '').toLowerCase();
    t3(s).sac[d.controller].push(...(types.length ? types : tl.split(' — ')[0].split(' ')), 'permanent');
  }
  if (name === 'cast') {
    const it = d.item;
    const tl = (s.defs[s.cards[it.source]?.defId]?.typeLine ?? '').toLowerCase().split(' // ')[0];
    t3(s).castTypes[it.controller].push(...tl.split(' — ')[0].split(' '));
    const o = 1 - it.controller;
    if ((it.targets ?? []).flat().some((t: any) => (t.kind === 'player' && t.idx === o) || (t.kind === 'card' && s.cards[t.iid] && (s.cards[t.iid].zone === 'battlefield' ? s.cards[t.iid].controller === o : s.cards[t.iid].owner === o)))) t3(s).crime[it.controller] = true;
  }
  void api;
});

const CONDS: [RegExp, (m: RegExpMatchArray) => any][] = [
  [/^your life total is (\d+) or (less|greater)$/, (m) => C('lifeCmp', { n: +m[1], less: m[2] === 'less' })],
  [/^you have (\d+) or (less|more) life$/, (m) => C('lifeCmp', { n: +m[1], less: m[2] === 'less' })],
  [/^there (?:is|are) (an?|one or more|no|\w+ or more) (.+?) cards? in your (graveyard|hand)$/, (m) => {
    const f = m[2] === 'card' ? {} : looseFilter(sing(m[2]));
    if (!f) return null;
    const n = /^an?$|^one or more$/.test(m[1]) ? 1 : m[1] === 'no' ? 0 : n0(m[1].replace(/ or more$/, ''));
    if (n === undefined) return null;
    return C('zoneHas', { zone: m[3], filter: { ...f, zone: undefined }, n, none: m[1] === 'no' });
  }],
  [/^you've sacrificed (?:an?|one or more) (artifact|creature|permanent|enchantment|land|token)s? this turn$/, (m) => C('sacTurn', { type: m[1] })],
  [/^you've committed a crime this turn$/, () => C('crimeTurn')],
  [/^you weren't the starting player$/, () => C('notStarter')],
  [/^you(?:'ve| have) cast (?:an?|another) (.+?) spell this turn$/, (m) => { const ts = m[1].split(' or ').map((x) => x.trim()); return ts.every((x) => /^(instant|sorcery|creature|artifact|enchantment|noncreature|planeswalker)$/.test(x)) ? C('castTypeTurn', { types: ts, another: /another/.test(m[0]) }) : null; }],
  [/^an opponent has drawn (\w+) or more cards this turn$/, (m) => C('oppDrew', { n: n0(m[1]) })],
  [/^(?:your opponents control|an opponent controls) (\w+) or more (.+)$/, (m) => { const f = parseFilter(sing(m[2])); const n = n0(m[1]); return f && n !== undefined ? C('oppControls', { n, filter: { ...f, zone: undefined, controller: undefined } }) : null; }],
  [/^you control (?:an?|one or more) ([a-z]+) or (?:an?|one or more) ([a-z]+)$/, (m) => { const a = looseFilter(m[1]), b = looseFilter(m[2]); return a && b ? C('controlAny', { fs: [a, b] }) : null; }],
  [/^there are (\w+) or more (.+?) on the battlefield$/, (m) => { const f = parseFilter(sing(m[2])); const n = n0(m[1]); return f && n !== undefined ? C('bfCount', { n, filter: { ...f, zone: undefined } }) : null; }],
];
EXT.conds.push((t) => {
  for (const [re, fn] of CONDS) {
    const m = t.match(re);
    if (m) return fn(m);
  }
  return null;
});
const E = EXT.condEval;
E.lifeCmp = (s, c, you) => (c.less ? s.players[you].life <= c.n : s.players[you].life >= c.n);
E.zoneHas = (s, c, you, self) => {
  const zone: string[] = (s.players[you] as any)[c.zone] ?? [];
  const k = zone.filter((x) => !Object.keys(c.filter).filter((q) => c.filter[q] !== undefined).length || matchesFilter(s, x, { ...c.filter, zone: c.zone }, you, self)).length;
  return c.none ? k === 0 : k >= c.n;
};
E.sacTurn = (s, c, you) => t3(s).sac[you].includes(c.type === 'token' ? 'permanent' : c.type);
E.crimeTurn = (s, _c, you) => t3(s).crime[you];
E.notStarter = (s, _c, you) => (s as any).startingPlayer !== you;
E.castTypeTurn = (s, c, you) => {
  const ts = t3(s).castTypes[you];
  const hits = ts.filter((x) => c.types.includes(x) || (c.types.includes('noncreature') && x !== 'creature')).length;
  return hits >= (c.another ? 2 : 1) || (!c.another && hits >= 1);
};
E.oppDrew = (s, c, you) => { const t = (s as any).evTurn; return !!t && t.turn === s.turn && (t.draws?.[1 - you] ?? 0) >= c.n; };
E.oppControls = (s, c, you, self) => s.battlefield.filter((b) => s.cards[b].controller !== you && matchesFilter(s, b, { ...c.filter, zone: 'battlefield' }, you, self)).length >= c.n;
E.controlAny = (s, c, you, self) => s.battlefield.some((b) => s.cards[b].controller === you && c.fs.some((f: any) => matchesFilter(s, b, { ...f, zone: 'battlefield' }, you, self)));
E.bfCount = (s, c, you, self) => s.battlefield.filter((b) => matchesFilter(s, b, { ...c.filter, zone: 'battlefield' }, you, self)).length >= c.n;
void chars; void (null as unknown as PlayerIdx);

// "if it's enchanted / equipped / renowned / modified" (in "whenever ~ attacks" etc.: "it" is ~), defending player conds
const C2: [RegExp, (m: RegExpMatchArray) => any][] = [
  [/^(?:it's|it is|~ is) (enchanted|equipped|renowned|monstrous|modified|tapped|untapped)$/, (m) => ({ k: 'self', state: m[1] })],
  [/^defending player controls no (.+)$/, (m) => { const f = looseFilter(sing(m[1])); return f ? C('defCtrl', { filter: { ...f, zone: undefined }, none: true }) : null; }],
  [/^defending player controls (?:a|an) (.+)$/, (m) => { const f = looseFilter(m[1]); return f ? C('defCtrl', { filter: { ...f, zone: undefined } }) : null; }],
  [/^defending player has (\w+) or fewer cards in hand$/, (m) => C('defHand', { max: n0(m[1]) })],
  [/^defending player is poisoned$/, () => C('defPoison')],
  [/^your life total is greater than your starting life total$/, () => C('aboveStart')],
  [/^you control (\w+) or more (tokens|other creatures)$/, (m) => { const n = n0(m[1]); if (n === undefined) return null; const f = m[2] === 'tokens' ? { token: true } : looseFilter(sing(m[2].replace(/^other /, ''))); return f ? C('ctrlN', { n, filter: { ...f, zone: undefined, ...(/^other/.test(m[2]) ? { other: true } : {}) } }) : null; }],
  [/^you've cast a spell with mana value (\d+) or greater this turn$/, (m) => C('castMvTurn', { n: +m[1] })],
  [/^an opponent controls more (creatures|lands|artifacts) than you$/, (m) => C('oppMore', { type: m[1].replace(/s$/, '') })],
  [/^an opponent controls more (\w+) than you$/, (m) => { const f = looseFilter(m[1]); return f ? C('oppMoreF', { filter: { ...f, zone: undefined } }) : null; }],
  [/^an opponent has more life than you$/, () => C('oppMoreLife')],
  [/^(?:your library has no cards in it|there are no cards in your library|you have no cards in your library)$/, () => C('libEmpty')],
  [/^you have (\d+) or less life$/, (m) => C('lifeMaxN', { n: +m[1] })],
  [/^you have more life than each opponent$/, () => C('oppMoreLife', { mine: true })],
  [/^you have less life than an opponent$/, () => C('oppMoreLife')],
];
E.oppMoreF = (s, c, you) => { const k = (p: number) => s.battlefield.filter((b) => s.cards[b].controller === p && matchesFilter(s, b, { ...c.filter, zone: 'battlefield' }, p)).length; return k(1 - you) > k(you); };
E.libEmpty = (s, _c, you) => s.players[you].library.length === 0;
E.lifeMaxN = (s, c, you) => s.players[you].life <= c.n;
E.oppMoreLife = (s, c, you) => (c.mine ? s.players[you].life > s.players[1 - you].life : s.players[1 - you].life > s.players[you].life);
EXT.conds.push((t) => {
  for (const [re, fn] of C2) { const m = t.match(re); if (m) return fn(m); }
  return null;
});
const defP = (s: GameState, you: PlayerIdx): PlayerIdx => (s.active === you ? (1 - you) as PlayerIdx : you === s.active ? you : (1 - s.active) as PlayerIdx);
E.defCtrl = (s, c, you, self) => { const d = defP(s, you); const k = s.battlefield.filter((b) => s.cards[b].controller === d && matchesFilter(s, b, { ...c.filter, zone: 'battlefield' }, you, self)).length; return c.none ? k === 0 : k > 0; };
E.defHand = (s, c, you) => s.players[defP(s, you)].hand.length <= c.max;
E.defPoison = (s, _c, you) => ((s.players[defP(s, you)] as any).poison ?? 0) > 0;
E.aboveStart = (s, _c, you) => s.players[you].life > ((s.players[you] as any).startingLife ?? ((s as any).format === 'commander' ? 40 : 20));
E.ctrlN = (s, c, you, self) => s.battlefield.filter((b) => s.cards[b].controller === you && (!c.filter.token || (s.cards[b] as any).token) && matchesFilter(s, b, { ...c.filter, token: undefined, zone: 'battlefield' }, you, self)).length >= c.n;
E.oppMore = (s, c, you) => { const k = (p: number) => s.battlefield.filter((b) => s.cards[b].controller === p && chars(s, b).types.has(c.type)).length; return k(1 - you) > k(you); };
E.castMvTurn = (s, c, you) => ((s as any).castMvs?.turn === s.turn ? (s as any).castMvs.mv[you] : 0) >= c.n;
EXT.hooks.event.push((s, name, d) => {
  if (name !== 'cast' || d.item.kind !== 'spell') return;
  const k = ((s as any).castMvs ??= { turn: -1, mv: [0, 0] });
  if (k.turn !== s.turn) { k.turn = s.turn; k.mv = [0, 0]; }
  const mv = chars(s, d.item.source).cmc ?? 0;
  k.mv[d.item.controller] = Math.max(k.mv[d.item.controller], mv);
});

// ---- turn-history conditions ("if an opponent discarded a card this turn", "if you created a token this turn", …) ----
type T5 = { turn: number; discards: number[]; etbT: Record<string, number>[]; tokens: number[]; lostAmt: number[]; diedUnder: number[] };
function t5(s: GameState): T5 {
  const t = (s as any).t5 as T5 | undefined;
  if (t && t.turn === s.turn) return t;
  const n: T5 = { turn: s.turn, discards: [0, 0], etbT: [{}, {}], tokens: [0, 0], lostAmt: [0, 0], diedUnder: [0, 0] };
  (s as any).t5 = n;
  return n;
}
EXT.hooks.afterMove.push((s, iid, from, to, opts) => {
  const c: any = s.cards[iid];
  if (!c) return;
  if (to === 'graveyard' && from === 'hand' && opts?.cause === 'discard') t5(s).discards[c.owner]++;
  if (to === 'battlefield') {
    const t = t5(s);
    for (const ty of (s.defs[c.defId]?.typeLine ?? '').toLowerCase().split(' — ')[0].split(' ')) t.etbT[c.controller][ty] = (t.etbT[c.controller][ty] ?? 0) + 1;
    if (c.token) t.tokens[c.controller]++;
  }
});
EXT.hooks.event.push((s, name, d) => {
  if (name === 'lifeLost') t5(s).lostAmt[d.p] += d.n ?? 0;
  if (name === 'leave' && d.to === 'graveyard' && d.wasCreature) t5(s).diedUnder[d.controller]++;
});
const C3: [RegExp, (m: RegExpMatchArray) => any][] = [
  [/^(an opponent|a player|you) discarded a card this turn$/, (m) => C('discTurn', { who: m[1] })],
  [/^(a|an|two or more|three or more) (creature|artifact|land|enchantment|nontoken creature)s? entered the battlefield under your control this turn$/, (m) => C('etbType', { type: m[2].replace('nontoken ', ''), n: /^an?$/.test(m[1]) ? 1 : n0(m[1].split(' ')[0]) })],
  [/^you didn't play a land this turn$/, () => C('noLand')],
  [/^you played a land this turn$/, () => C('noLand', { not: true })],
  [/^you drew (\w+) or more cards this turn$/, (m) => C('drewN', { n: n0(m[1]) })],
  [/^you lost (\d+|\w+) or more life this turn$/, (m) => C('lostMine', { n: n0(m[1]) })],
  [/^you lost life this turn$/, () => C('lostMine', { n: 1 })],
  [/^you sacrificed (?:a|an|one or more) (artifact|creature|permanent|food|treasure|clue)s? this turn$/, (m) => C('sacTurn', { type: ['food', 'treasure', 'clue'].includes(m[1]) ? 'artifact' : m[1] })],
  [/^you control exactly (one|two|three) (creature|land|artifact)s?$/, (m) => C('exactN', { n: n0(m[1]), type: m[2] })],
  [/^you don't control (?:a|an) (.+)$/, (m) => { const f = looseFilter(m[1]); return f ? C('ctrlN', { n: 1, filter: { ...f, zone: undefined }, not: true }) : null; }],
  [/^you gained and lost life this turn$/, () => C('gainedAndLost')],
  [/^you created a token this turn$/, () => C('tokenTurn')],
  [/^(?:a|one or more) creatures? died under an opponent's control this turn$/, () => C('diedOpp')],
  [/^one or more creatures died this turn$/, () => C('died', { n: 1 })],
];
EXT.conds.push((t) => {
  for (const [re, fn] of C3) { const m = t.match(re); if (m) return fn(m); }
  return null;
});
E.discTurn = (s, c, you) => { const d = t5(s).discards; return c.who === 'you' ? d[you] > 0 : c.who === 'an opponent' ? d[1 - you] > 0 : d[0] + d[1] > 0; };
E.etbType = (s, c, you) => (t5(s).etbT[you][c.type] ?? 0) >= c.n;
E.noLand = (s, c, you) => (s.players[you].landsPlayed === 0) !== !!c.not;
E.drewN = (s, c, you) => { const t = (s as any).evTurn; return !!t && t.turn === s.turn && (t.draws?.[you] ?? 0) >= c.n; };
E.lostMine = (s, c, you) => t5(s).lostAmt[you] >= c.n;
E.exactN = (s, c, you) => s.battlefield.filter((b) => s.cards[b].controller === you && chars(s, b).types.has(c.type)).length === c.n;
E.gainedAndLost = (s, _c, you) => ((s.players[you] as any).lifeGainedThisTurn ?? 0) > 0 && t5(s).lostAmt[you] > 0;
E.tokenTurn = (s, _c, you) => t5(s).tokens[you] > 0;
E.diedOpp = (s, _c, you) => t5(s).diedUnder[1 - you] > 0;
const ctrlNBase = E.ctrlN;
E.ctrlN = (s, c, you, self, ctx) => (c.not ? !ctrlNBase(s, c, you, self, ctx) : ctrlNBase(s, c, you, self, ctx));

// Conditions that look at other permanents' characteristics can be checked while those characteristics are being
// computed (a static "as long as …" on the same permanent): a re-entrant check counts as false instead of recursing.
const BUSY = new Set<string>();
for (const name of ['exactN', 'oppControls', 'controlAny', 'bfCount', 'defCtrl', 'ctrlN', 'oppMore', 'oppMoreF', 'zoneHas']) {
  const f = E[name];
  E[name] = (s, c, you, self, ctx) => {
    const k = `${name}:${self ?? ''}`;
    if (BUSY.has(k)) return false;
    BUSY.add(k);
    try { return f(s, c, you, self, ctx); } finally { BUSY.delete(k); }
  };
}

// ---- how ~ was cast ----
const CW: Record<string, string> = { w: 'W', u: 'U', b: 'B', r: 'R', g: 'G', c: 'C' };
const C4: [RegExp, (m: RegExpMatchArray) => any][] = [
  [/^~ was cast from (?:a|your) (graveyard|hand|exile)$/, (m) => C('castFromZ', { zone: m[1] })],
  [/^~ wasn't cast from (?:a|your) (graveyard|hand)$/, (m) => C('castFromZ', { zone: m[1], not: true })],
  [/^you cast (?:~|it) during your main phase$/, () => C('castMain')],
  [/^~ is your commander$/, () => C('isCmdr')],
  [/^\{([wubrgc])\} was spent to cast (?:~|it|this spell)$/, (m) => C('colorSpent', { color: CW[m[1]] })],
  [/^\{([wubrgc])\}\{\1\}(\{\1\})? was spent to cast (?:~|it|this spell)$/, (m) => C('colorSpentN', { color: CW[m[1]], n: m[2] ? 3 : 2 })],
  [/^at least (two|three|four) mana of the same color was spent to cast (?:~|it|this spell)$/, (m) => C('sameColorN', { n: ({ two: 2, three: 3, four: 4 } as any)[m[1]] })],
  [/^mana from a treasure was spent to cast (?:~|it|this spell)$/, () => C('treasureSpent')],
  [/^at least (two|three|four|five) (white|blue|black|red|green) mana was spent to cast (?:~|it|this spell)$/, (m) => C('colorSpentN', { color: ({ white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' } as any)[m[2]], n: ({ two: 2, three: 3, four: 4, five: 5 } as any)[m[1]] })],
  [/^(\w+) or more mana was spent to cast (?:~|it|this spell)$/, (m) => C('manaSpentN', { n: n0(m[1]) })],
  [/^no mana was spent to cast (?:~|it|this spell)$/, () => C('manaSpentN', { n: 1, not: true })],
];
EXT.conds.push((t) => {
  for (const [re, fn] of C4) { const m = t.match(re); if (m) return fn(m); }
  return null;
});
E.castFromZ = (s, c, _you, self) => (self ? (s.cards[self] as any)?.castFrom === c.zone : false) !== !!c.not;
E.castMain = (s, _c, _you, self) => !!(self && (s.cards[self] as any)?.castInMain);
E.isCmdr = (s, _c, _you, self) => !!(self && (s.cards[self] as any)?.isCommander);
E.colorSpentN = (s, c, _you, self) => ((self && (s.cards[self] as any)?.colorCounts?.[c.color]) ?? 0) >= c.n;
E.sameColorN = (s, c, _you, self) => Object.entries(((self && (s.cards[self] as any)?.colorCounts) ?? {}) as Record<string, number>).some(([k, v]) => k !== 'C' && v >= c.n);
E.treasureSpent = (s, _c, _you, self) => ((self && (s.cards[self] as any)?.treasureSpent) ?? 0) > 0;
E.colorSpent = (s, c, _you, self) => !!(self && ((s.cards[self] as any)?.colorsSpent ?? []).includes(c.color));
E.manaSpentN = (s, c, _you, self) => ((self ? (s.cards[self] as any)?.manaSpent ?? 0 : 0) >= c.n) !== !!c.not;
EXT.conds.push((t) => (/^you control (?:a|one or more) tokens?$/.test(t) ? C('ctrlN', { n: 1, filter: { token: true } }) : /^you control no tokens$/.test(t) ? C('ctrlN', { n: 1, filter: { token: true }, not: true }) : null));

// ---- more turn history ----
type T6 = { turn: number; counters: number[]; counterOn: Record<string, boolean>; plusOn: number[]; dmgOpp: Record<string, boolean>; dmgCreature: Record<string, boolean>; dmgTo: number[]; diedSub: Record<string, number>[]; gyCreature: number[]; castIS: number[] };
function t6(s: GameState): T6 {
  const t = (s as any).t6 as T6 | undefined;
  if (t && t.turn === s.turn) return t;
  const n: T6 = { turn: s.turn, counters: [0, 0], counterOn: {}, plusOn: [0, 0], dmgOpp: {}, dmgCreature: {}, dmgTo: [0, 0], diedSub: [{}, {}], gyCreature: [0, 0], castIS: [0, 0] };
  (s as any).t6 = n;
  return n;
}
EXT.hooks.event.push((s, name, d) => {
  if (name === 'counters' && s.cards[d.iid]) {
    const t = t6(s);
    const top = s.stack[s.stack.length - 1];
    const who = (top ? top.controller : s.cards[d.iid].controller) as number;
    if (chars(s, d.iid).types.has('creature')) t.counters[who]++;
    t.counterOn[d.iid] = true;
    if (d.counter === '+1/+1') t.plusOn[s.cards[d.iid].controller]++;
  }
  if (name === 'dealt') {
    const t = t6(s);
    if (d.to?.kind === 'player') { t.dmgTo[d.to.idx] += d.n; if (s.cards[d.source] && s.cards[d.source].controller !== d.to.idx) t.dmgOpp[d.source] = true; }
    else if (d.to?.kind === 'card') t.dmgCreature[d.source] = true;
  }
  if (name === 'leave' && d.to === 'graveyard' && d.wasCreature) {
    const t = t6(s);
    for (const st of (s.defs[d.card.defId]?.typeLine ?? '').toLowerCase().split(' — ')[1]?.split(' ') ?? []) t.diedSub[d.controller][st] = (t.diedSub[d.controller][st] ?? 0) + 1;
  }
  if (name === 'cast' && /\b(instant|sorcery)\b/i.test(s.defs[s.cards[d.item.source]?.defId]?.typeLine ?? '')) t6(s).castIS[d.item.controller]++;
});
EXT.hooks.afterMove.push((s, iid, _from, to) => {
  const c = s.cards[iid];
  if (to === 'graveyard' && c && /\bcreature\b/i.test(s.defs[c.defId]?.typeLine ?? '')) t6(s).gyCreature[c.owner]++;
});
const C5: [RegExp, (m: RegExpMatchArray) => any][] = [
  [/^you've drawn (\w+) or more cards this turn$/, (m) => C('drewN', { n: n0(m[1]) })],
  [/^you've drawn more than one card this turn$/, () => C('drewN', { n: 2 })],
  [/^you've cast both a creature spell and a noncreature spell this turn$/, () => C('bothCast')],
  [/^you've cast (\w+) or more instant and(?:\/or)? sorcery spells this turn$/, (m) => C('castISN', { n: n0(m[1]) })],
  [/^you put a counter on a creature this turn$/, () => C('putCounter')],
  [/^a \+1\/\+1 counter was put on a permanent under your control this turn$/, () => C('plusMine')],
  [/^a counter was put on ~ this turn$|^you put a counter on ~ this turn$/, () => C('counterSelf')],
  [/^~ dealt damage to an opponent this turn$/, () => C('selfDmgOpp')],
  [/^~ dealt damage to another creature this turn$/, () => C('selfDmgCre')],
  [/^you were dealt (\d+) or more damage this turn$/, (m) => C('dealtMe', { n: +m[1] })],
  [/^you have (\w+) or fewer cards in hand$/, (m) => C('handMax', { n: n0(m[1]) })],
  [/^you have (?:a|one or more) cards? in hand$/, () => C('handMin', { n: 1 })],
  [/^you have no cards in hand$/, () => C('handMax', { n: 0 })],
  [/^an opponent has no cards in hand$/, () => C('oppHandMax', { n: 0 })],
  [/^an opponent has more cards in hand than you$/, () => C('oppMoreCards')],
  [/^you control (\w+) or fewer (lands|creatures|artifacts)$/, (m) => C('ctrlMax', { n: n0(m[1]), type: sing(m[2]) })],
  [/^your opponents control no (creatures|artifacts|enchantments|planeswalkers)$/, (m) => C('oppControls', { n: 1, filter: { types: [sing(m[1])] }, none: true })],
  [/^there are no (.+?) on the battlefield$/, (m) => { const f = looseFilter(sing(m[1])); return f ? C('bfCount', { n: 1, filter: { ...f, zone: undefined }, none: true }) : null; }],
  [/^(?:another )?(?:a|an) ([a-z]+) died under your control this turn$/, (m) => C('diedSub', { sub: m[1] })],
  [/^a creature card was put into your graveyard from anywhere this turn$/, () => C('gyCreatureTurn')],
  [/^you had a land enter the battlefield under your control this turn$/, () => C('etbType', { type: 'land', n: 1 })],
];
EXT.conds.push((t) => {
  for (const [re, fn] of C5) { const m = t.match(re); if (m) return fn(m); }
  return null;
});
E.bothCast = (s, _c, you) => { const ts = t3(s).castTypes[you]; return ts.includes('creature') && ts.some((x) => ['instant', 'sorcery', 'artifact', 'enchantment', 'planeswalker', 'battle'].includes(x)); };
E.castISN = (s, c, you) => t6(s).castIS[you] >= c.n;
E.putCounter = (s, _c, you) => t6(s).counters[you] > 0;
E.plusMine = (s, _c, you) => t6(s).plusOn[you] > 0;
E.counterSelf = (s, _c, _you, self) => !!(self && t6(s).counterOn[self]);
E.selfDmgOpp = (s, _c, _you, self) => !!(self && t6(s).dmgOpp[self]);
E.selfDmgCre = (s, _c, _you, self) => !!(self && t6(s).dmgCreature[self]);
E.dealtMe = (s, c, you) => t6(s).dmgTo[you] >= c.n;
E.handMax = (s, c, you) => s.players[you].hand.length <= c.n;
E.handMin = (s, c, you) => s.players[you].hand.length >= c.n;
E.oppHandMax = (s, c, you) => s.players[1 - you].hand.length <= c.n;
E.oppMoreCards = (s, _c, you) => s.players[1 - you].hand.length > s.players[you].hand.length;
E.ctrlMax = (s, c, you) => s.battlefield.filter((b) => s.cards[b].controller === you && chars(s, b).types.has(c.type)).length <= c.n;
E.diedSub = (s, c, you) => (t6(s).diedSub[you][c.sub] ?? 0) > 0;
E.gyCreatureTurn = (s, _c, you) => t6(s).gyCreature[you] > 0;
// "none" variants of oppControls / bfCount
const oc0 = E.oppControls, bf0 = E.bfCount;
E.oppControls = (s, c, you, self, ctx) => (c.none ? !oc0(s, { ...c, none: false }, you, self, ctx) : oc0(s, c, you, self, ctx));
E.bfCount = (s, c, you, self, ctx) => (c.none ? !bf0(s, { ...c, none: false }, you, self, ctx) : bf0(s, c, you, self, ctx));
