// Plugin: "this turn" history and state conditions for intervening-if triggers and static abilities.
import { EXT } from '../ext';
import type { GameState, PlayerIdx } from '../types';
import { baseChars, chars } from '../rules';

type TT = { turn: number; attacked: boolean[]; died: number[]; diedMine: number[]; left: number[]; nonlandLeft: number; lostLife: boolean[]; descended: boolean[]; etb: number[]; nonlandEtb: number[]; artifactEtb: boolean[]; noncreatureCast: boolean[]; gyLeft: boolean[]; warped: boolean };
export function tt(s: GameState): TT {
  const t = (s as any).tt as TT | undefined;
  if (t && t.turn === s.turn) return t;
  const n = { turn: s.turn, attacked: [false, false], died: [0, 0], diedMine: [0, 0], left: [0, 0], nonlandLeft: 0, lostLife: [false, false], descended: [false, false], etb: [0, 0], nonlandEtb: [0, 0], artifactEtb: [false, false], noncreatureCast: [false, false], gyLeft: [false, false], warped: false };
  (s as any).tt = n;
  return n;
}
const isPermCard = (tl: string) => /\b(creature|artifact|enchantment|land|planeswalker|battle)\b/i.test(tl.split(' // ')[0]);

EXT.hooks.event.push((s, name, d, api) => {
  const t = tt(s);
  if (name === 'attack') t.attacked[d.p] = true;
  else if (name === 'lifeLost') t.lostLife[d.p] = true;
  else if (name === 'cast') {
    if (!api.chars(s, d.item.source).types.has('creature')) t.noncreatureCast[d.item.controller] = true;
    if ((s.cards[d.item.source] as any)?.warpCast) t.warped = true;
  } else if (name === 'leave') {
    const ctrl = d.controller as PlayerIdx;
    t.left[ctrl]++;
    const tl = (s.defs[d.card.defId]?.typeLine ?? '').toLowerCase();
    if (!/\bland\b/.test(tl.split(' // ')[0])) t.nonlandLeft++;
    if (d.to === 'graveyard' && d.wasCreature) { t.died[0]++; t.died[1]++; t.diedMine[ctrl]++; }
  }
});
EXT.hooks.afterMove.push((s, iid, from, to, _o, _api) => {
  if (_o?.resolved) from = 'stack';
  const c = s.cards[iid] as any;
  if (!c) return;
  const t = tt(s);
  const tl = s.defs[c.defId]?.typeLine ?? '';
  if (to === 'graveyard' && isPermCard(tl)) t.descended[c.owner] = true;
  if (from === 'graveyard') t.gyLeft[c.owner] = true;
  if (to === 'battlefield') {
    t.etb[c.controller]++;
    if (!/\bland\b/i.test(tl.split(' // ')[0])) t.nonlandEtb[c.controller]++;
    if (/\bartifact\b/i.test(tl)) t.artifactEtb[c.controller] = true;
  }
});

const W: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const n0 = (w: string) => (/^\d+$/.test(w) ? +w : W[w] ?? 1);
const C = (name: string, extra: any = {}) => ({ k: 'ext', name, ...extra });
const CONDS: [RegExp, (m: RegExpMatchArray) => any][] = [
  [/^you attacked (?:with a creature )?this turn$/, () => C('attacked')],
  [/^you didn't attack this turn$|^you haven't attacked this turn$/, () => C('attacked', { not: true })],
  [/^(a|two or more|three or more|four or more) creatures? died this turn$/, (m) => C('died', { n: m[1] === 'a' ? 1 : n0(m[1].split(' ')[0]) })],
  [/^no creatures died this turn$/, () => C('died', { n: 1, not: true })],
  [/^a creature died under your control this turn$|^a creature you controlled died this turn$/, () => C('diedMine')],
  [/^you cast it$|^it was cast$/, () => C('castIt')],
  [/^you cast it from your hand$/, () => C('castIt', { hand: true })],
  [/^you didn't cast it$|^it wasn't cast$/, () => C('castIt', { not: true })],
  [/^~ is an? (enchantment|artifact|creature|land)$/, (m) => C('selfType', { type: m[1] })],
  [/^~ isn't an? (enchantment|artifact|creature|land)$/, (m) => C('selfType', { type: m[1], not: true })],
  [/^you gained life this turn$/, () => C('gained', { n: 1 })],
  [/^you gained (\w+) or more life this turn$/, (m) => C('gained', { n: n0(m[1]) })],
  [/^you gained or lost life this turn$/, () => C('gainedOrLost')],
  [/^a permanent left the battlefield under your control this turn$|^a permanent you controlled left the battlefield this turn$/, () => C('leftMine')],
  [/^a nonland permanent left the battlefield this turn or a spell was warped this turn$/, () => C('nonlandLeftOrWarp')],
  [/^a nonland permanent left the battlefield this turn$/, () => C('nonlandLeftOrWarp', { noWarp: true })],
  [/^~ is in your graveyard$/, () => C('inZone', { zone: 'graveyard' })],
  [/^~ is on the battlefield$|^it's on the battlefield$/, () => C('inZone', { zone: 'battlefield' })],
  [/^~ is suspended$/, () => C('suspended')],
  [/^an opponent lost life this turn$/, () => C('oppLostLife')],
  [/^you descended this turn$/, () => C('descended')],
  [/^an opponent controls more lands than you$/, () => C('oppMoreLands')],
  [/^you're the monarch$|^you are the monarch$/, () => C('monarch')],
  [/^you have the initiative$/, () => C('initiative')],
  [/^it's the first combat phase of the turn$/, () => C('always')],
  [/^two or more nonland permanents entered the battlefield under your control this turn$/, () => C('nonlandEtb', { n: 2 })],
  [/^an artifact entered the battlefield under your control this turn$/, () => C('artifactEtb')],
  [/^you control a desert or there is a desert card in your graveyard$/, () => C('desert')],
  [/^you've cast a noncreature spell this turn$/, () => C('noncreatureCast')],
  [/^creatures you control have total power (\d+) or greater$/, (m) => C('totalPower', { n: +m[1] })],
  [/^a card left your graveyard this turn$/, () => C('gyLeft')],
  [/^it had counters on it$/, () => C('hadCounters')],
  [/^it had no (\w+) counters on it$/, (m) => C('hadCounters', { counter: m[1], not: true })],
  [/^it had an? ([+-]\d\/[+-]\d|\w+) counters? on it$/, (m) => C('hadCounters', { counter: m[1] })],
  [/^there are (\w+) or more (\w+) counters on ~$/, (m) => C('selfCounters', { n: n0(m[1]), counter: m[2] })],
  [/^~ has (\w+) or more (\w+|[+-]\d\/[+-]\d) counters on it$/, (m) => C('selfCounters', { n: n0(m[1]), counter: m[2] })],
  [/^that player has (\w+) or fewer cards in hand$/, (m) => C('tpHand', { max: n0(m[1]) })],
  [/^that player has no cards in hand$/, () => C('tpHand', { max: 0 })],
  [/^an opponent has (\w+) or more poison counters$/, (m) => C('oppPoison', { n: n0(m[1]) })],
  [/^you have more cards in hand than each opponent$/, () => C('moreCards')],
  [/^no creatures are on the battlefield$/, () => C('noCreatures')],
  [/^~ is tapped$/, () => C('selfTapped')],
  [/^~ is untapped$/, () => C('selfTapped', { not: true })],
  [/^its power is (\d+) or greater$/, (m) => C('objPower', { n: +m[1] })],
  [/^it's not a token$/, () => C('objToken', { not: true })],
  [/^it's a token$/, () => C('objToken')],
  [/^it's a creature$/, () => C('objType', { type: 'creature' })],
  [/^it was a creature$/, () => C('objType', { type: 'creature', lki: true })],
];
EXT.conds.push((t) => {
  for (const [re, fn] of CONDS) {
    const m = t.match(re);
    if (m) return fn(m);
  }
  return null;
});
const E = EXT.condEval;
const not = (c: any, v: boolean) => v !== !!c.not;
E.always = () => true;
E.attacked = (s, c, you) => not(c, tt(s).attacked[you]);
E.died = (s, c) => not(c, tt(s).died[0] >= c.n);
E.diedMine = (s, _c, you) => tt(s).diedMine[you] > 0;
E.castIt = (s, c, _you, self) => {
  const x = self ? (s.cards[self] as any) : null;
  const v = !!x?.enteredFromStack && (!c.hand || x.castFrom === 'hand');
  return not(c, v);
};
const stBusy = new Set<string>();
E.selfType = (s, c, _you, self) => {
  if (!self || !s.cards[self] || s.cards[self].zone !== 'battlefield') return not(c, false);
  // a self-referential "as long as ~ is a creature" re-entering chars() falls back to the base characteristics
  if (stBusy.has(self)) return not(c, baseChars(s, self).types.has(c.type));
  stBusy.add(self);
  try { return not(c, chars(s, self).types.has(c.type)); } finally { stBusy.delete(self); }
};
E.gained = (s, c, you) => ((s.players[you] as any).lifeGainedThisTurn ?? 0) >= c.n;
E.gainedOrLost = (s, _c, you) => ((s.players[you] as any).lifeGainedThisTurn ?? 0) > 0 || tt(s).lostLife[you];
E.leftMine = (s, _c, you) => tt(s).left[you] > 0;
E.nonlandLeftOrWarp = (s, c) => tt(s).nonlandLeft > 0 || (!c.noWarp && tt(s).warped);
E.inZone = (s, c, _you, self) => !!self && s.cards[self]?.zone === c.zone;
E.suspended = (s, _c, _you, self) => !!self && s.cards[self]?.zone === 'exile' && !!(s.cards[self] as any).suspended;
E.oppLostLife = (s, _c, you) => tt(s).lostLife[1 - you];
E.descended = (s, _c, you) => tt(s).descended[you];
E.oppMoreLands = (s, _c, you) => {
  const lands = (p: number) => s.battlefield.filter((b) => s.cards[b].controller === p && /\bLand\b/.test(s.defs[s.cards[b].defId].typeLine.split(' // ')[0])).length;
  return lands(1 - you) > lands(you);
};
E.monarch = (s, _c, you) => (s as any).monarch === you;
E.initiative = (s, _c, you) => (s as any).initiative === you;
E.nonlandEtb = (s, c, you) => tt(s).nonlandEtb[you] >= c.n;
E.artifactEtb = (s, _c, you) => tt(s).artifactEtb[you];
E.desert = (s, _c, you) => s.battlefield.some((b) => s.cards[b].controller === you && /\bDesert\b/.test(s.defs[s.cards[b].defId].typeLine)) || s.players[you].graveyard.some((g) => /\bDesert\b/.test(s.defs[s.cards[g].defId].typeLine));
E.noncreatureCast = (s, _c, you) => tt(s).noncreatureCast[you];
E.totalPower = (s, c, you) => s.battlefield.filter((b) => s.cards[b].controller === you && chars(s, b).types.has('creature')).reduce((a, b) => a + Math.max(0, chars(s, b).power), 0) >= c.n;
E.gyLeft = (s, _c, you) => tt(s).gyLeft[you];
E.hadCounters = (_s, c, _you, _self, ctx) => {
  const lk = (ctx?.lkiCounters ?? {}) as Record<string, number>;
  const v = c.counter ? (lk[c.counter] ?? 0) > 0 : Object.values(lk).some((x) => x > 0);
  return not(c, v);
};
E.selfCounters = (s, c, _you, self) => !!self && (s.cards[self]?.counters[c.counter] ?? 0) >= c.n;
E.tpHand = (s, c, you, _self, ctx) => s.players[(ctx as any)?.triggerPlayer ?? 1 - you].hand.length <= c.max;
E.oppPoison = (s, c, you) => s.players[1 - you].poison >= c.n;
E.moreCards = (s, _c, you) => s.players[you].hand.length > s.players[1 - you].hand.length;
E.noCreatures = (s) => !s.battlefield.some((b) => chars(s, b).types.has('creature'));
E.selfTapped = (s, c, _you, self) => not(c, !!self && !!s.cards[self]?.tapped);
E.objPower = (s, c, _you, _self, ctx) => { const o = (ctx as any)?.triggerObj; return !!o && !!s.cards[o] && chars(s, o).power >= c.n; };
E.objToken = (s, c, _you, _self, ctx) => { const o = (ctx as any)?.triggerObj; return not(c, !!o && !!s.cards[o]?.token); };
E.objType = (s, c, _you, _self, ctx) => { const o = (ctx as any)?.triggerObj ?? _self; return !!o && !!s.cards[o] && (s.cards[o].zone === 'battlefield' ? chars(s, o).types.has(c.type) : c.lki && (s as any).lkiCache?.[o]?.types ? (s as any).lkiCache[o].types.includes(c.type) : new RegExp(`\\b${c.type}\\b`, 'i').test(s.defs[s.cards[o].defId].typeLine)); };

// Triggers that work from the graveyard ("at the beginning of your upkeep, if ~ is in your graveyard, …")
EXT.hooks.step.push((s, step, api) => {
  const map: Record<string, string[]> = { upkeep: ['upkeep', 'eachUpkeep'], end: ['endStep', 'eachEndStep'], draw: ['drawStep'] };
  const evs = map[step];
  if (!evs) return;
  for (const pl of s.players) {
    for (const g of [...pl.graveyard]) {
      for (const t of api.chars(s, g).pc.triggers as any[]) {
        if (!evs.includes(t.event) || t.cond?.name !== 'inZone' || t.cond.zone !== 'graveyard') continue;
        if ((t.event === 'upkeep' || t.event === 'endStep' || t.event === 'drawStep') && s.active !== pl.idx) continue;
        api.queueTrigger(s, g, pl.idx, t, { triggerPlayer: s.active });
      }
    }
  }
});

// ---- more history: life-loss amounts, spells from hand, discards, combat participation ----
type TT2 = { turn: number; lostAmt: number[]; handCasts: number[]; discarded: boolean[]; fought: Record<string, boolean>; lostLastTurn: boolean[] };
function tt2(s: GameState): TT2 {
  const t = (s as any).tt2 as TT2 | undefined;
  if (t && t.turn === s.turn) return t;
  const prevLost = t ? [t.lostAmt[0] > 0, t.lostAmt[1] > 0] : [false, false];
  const n: TT2 = { turn: s.turn, lostAmt: [0, 0], handCasts: [0, 0], discarded: [false, false], fought: {}, lostLastTurn: prevLost };
  (s as any).tt2 = n;
  return n;
}
EXT.hooks.event.push((s, name, d, api) => {
  const t = tt2(s);
  if (name === 'lifeLost') t.lostAmt[d.p] += d.n;
  else if (name === 'cast' && (s.cards[d.item.source] as any)?.castFrom === 'hand') t.handCasts[d.item.controller]++;
  else if (name === 'attack') for (const a of d.list) t.fought[a.iid] = true;
  else if (name === 'blocks') for (const b of d.list) t.fought[b.blocker] = true;
  void api;
});
EXT.hooks.afterMove.push((s, iid, from, to, opts) => {
  if (from === 'hand' && to === 'graveyard' && opts?.cause === 'discard' && s.cards[iid]) tt2(s).discarded[s.cards[iid].owner] = true;
});
const MORE: [RegExp, (m: RegExpMatchArray) => any][] = [
  [/^you've cast (\w+) or more spells this turn$/, (m) => C('castN', { n: n0(m[1]) })],
  [/^you didn't cast a spell this turn$/, () => C('castN', { n: 1, not: true })],
  [/^you haven't cast a spell from your hand this turn$/, () => C('handCast', { not: true })],
  [/^your life total is less than (\d+)$/, (m) => C('lifeLess', { n: +m[1] })],
  [/^you have exactly (\d+) life$/, (m) => C('lifeExact', { n: +m[1] })],
  [/^you have (\d+) or less life$/, (m) => C('lifeLess', { n: +m[1] + 1 })],
  [/^you have fewer than (\w+) cards in hand$/, (m) => C('handLess', { n: n0(m[1]) })],
  [/^(a player|an opponent) lost (\w+) or more life this turn$/, (m) => C('lostN', { n: n0(m[2]), opp: m[1] === 'an opponent' })],
  [/^you lost life last turn$/, () => C('lostLast')],
  [/^you discarded a card this turn$/, () => C('discarded')],
  [/^~ attacked or blocked this combat$/, () => C('fought')],
  [/^~ didn't attack this turn$/, () => C('fought', { not: true })],
  [/^there is no monarch$/, () => C('noMonarch')],
  [/^it's not their turn$|^it isn't that player's turn$/, () => C('notTheirTurn')],
  [/^it's your turn$/, () => C('yourTurn2')],
  [/^it's not your turn$/, () => C('yourTurn2', { not: true })],
  [/^you have (\w+) or more (creature|instant|sorcery|land|artifact|enchantment) cards in your graveyard$/, (m) => C('gyCount', { n: n0(m[1]), type: m[2] })],
  [/^there's an? (\w+) card in your graveyard$/, (m) => C('gyCount', { n: 1, sub: m[1] })],
  [/^that player controls more lands than you$|^defending player controls more lands than you$/, () => C('oppMoreLands')],
  [/^you didn't attack with a creature this turn$/, () => C('attacked', { not: true })],
  [/^another creature entered the battlefield under your control this turn$/, () => C('etbN', { n: 2 })],
  [/^a planeswalker entered the battlefield under your control this turn$/, () => C('etbN', { n: 1 })],
  [/^~ has fewer than (\w+) (\w+) counters on it$/, (m) => C('selfCounters', { n: n0(m[1]), counter: m[2], not: true })],
  [/^it isn't a token$/, () => C('objToken', { not: true })],
];
EXT.conds.push((t) => {
  for (const [re, fn] of MORE) {
    const m = t.match(re);
    if (m) return fn(m);
  }
  return null;
});
E.castN = (s, c, you) => not(c, ((s.players[you] as any).spellsCastThisTurn ?? 0) >= c.n);
E.handCast = (s, c, you) => not(c, tt2(s).handCasts[you] > 0);
E.lifeLess = (s, c, you) => s.players[you].life < c.n;
E.lifeExact = (s, c, you) => s.players[you].life === c.n;
E.handLess = (s, c, you) => s.players[you].hand.length < c.n;
E.lostN = (s, c, you) => (c.opp ? tt2(s).lostAmt[1 - you] : Math.max(...tt2(s).lostAmt)) >= c.n;
E.lostLast = (s, _c, you) => tt2(s).lostLastTurn[you];
E.discarded = (s, _c, you) => tt2(s).discarded[you];
E.fought = (s, c, _you, self) => not(c, !!self && !!tt2(s).fought[self]);
E.noMonarch = (s) => (s as any).monarch == null;
E.notTheirTurn = (s, _c, you, _self, ctx) => s.active !== ((ctx as any)?.triggerPlayer ?? 1 - you);
E.yourTurn2 = (s, c, you) => not(c, s.active === you);
E.gyCount = (s, c, you) => s.players[you].graveyard.filter((g) => {
  const tl = s.defs[s.cards[g].defId].typeLine.toLowerCase();
  return c.type ? tl.includes(c.type) : c.sub ? tl.includes(c.sub) : true;
}).length >= c.n;
E.etbN = (s, c, you) => tt(s).etb[you] >= c.n;
