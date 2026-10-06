/**
 * Combo awareness for the AI. It reads triggers off the parsed cards (not card names), so it works for
 * any card the engine automates:
 *  - synergy(): how much better a card in hand is given the permanents I already control
 *    (feeds my triggers, is fed by them, doubles them, or closes a loop like Sanguine Bond + Exquisite Blood)
 *  - sacPlan(): whether to use a free sacrifice outlet now (lethal drain, or free value from persist/undying/tokens)
 */
import type { GameState, PlayerIdx } from './types';
import { chars, opp, parsedFor } from './rules';

type Trig = { event: string; filter?: any; ability: { effects: any[] } };

/** Trigger events a set of effects will cause. */
function produces(effects: any[]): Set<string> {
  const out = new Set<string>();
  for (const e of effects ?? []) {
    const k = e.k === 'ext' ? e.name : e.k;
    if (k === 'gain' || k === 'gainLast' || k === 'gainThatMuch') out.add('gainLife');
    if (k === 'lose' || k === 'drain') out.add('loseLifeEv');
    if (k === 'damage') out.add('loseLifeEv');
    if (k === 'token' || k === 'createToken' || k === 'copyToken') { out.add('otherEtb'); out.add('etb'); }
    if (k === 'counters' || k === 'addCounters' || k === 'proliferate') out.add('counters');
    if (k === 'sacrifice' || k === 'destroy') { out.add('otherDies'); out.add('dies'); }
    if (k === 'draw') out.add('drawCard');
  }
  return out;
}
const DIES = new Set(['dies', 'otherDies', 'attachDies', 'damagedDies', 'toGraveyard']);
const ENTERS = new Set(['etb', 'otherEtb', 'landfall']);
const isDrain = (t: Trig) => produces(t.ability.effects).has('loseLifeEv');

function myPermanents(s: GameState, me: PlayerIdx) {
  return s.battlefield.filter((i) => s.cards[i]?.controller === me);
}
function triggersOf(s: GameState, iid: string): Trig[] {
  return (chars(s, iid).pc.triggers ?? []) as Trig[];
}
function replacementsOf(pc: any): any[] {
  return pc.replacements ?? [];
}

/** How much a card in hand gains from my current board. 0 = no special synergy; ≥10 = completes a loop. */
export function synergy(s: GameState, me: PlayerIdx, iid: string): number {
  const card = s.cards[iid];
  if (!card) return 0;
  const pc: any = parsedFor(s, card);
  const tl = s.defs[card.defId].typeLine;
  const isCreature = /Creature/.test(tl);
  const isPermanent = !/^(Instant|Sorcery)/.test(tl);
  const mine = myPermanents(s, me);
  const myTrigs = mine.flatMap((i) => triggersOf(s, i));
  const myRepl = mine.flatMap((i) => replacementsOf(chars(s, i).pc));
  const doublers = (cause: string) => myRepl.filter((r) => r.k === 'trigDouble' && r.cause === cause).length;
  let score = 0;

  // A) entering feeds my "whenever a creature enters" triggers (Soul Warden, Impact Tremors …)
  if (isPermanent) {
    const feeds = myTrigs.filter((t) => t.event === 'otherEtb' && (!t.filter?.types || t.filter.types.some((ty: string) => tl.toLowerCase().includes(ty) || ty === 'permanent'))).length;
    score += feeds * (1 + doublers('enter'));
  }
  // B) a creature is future fodder for my death payoffs
  if (isCreature) score += 0.5 * myTrigs.filter((t) => t.event === 'otherDies').length;

  // C) the card's own triggers, fed by what I already have
  const theirs: Trig[] = pc.triggers ?? [];
  for (const t of theirs) {
    if (t.event === 'etb') score += doublers('enter');
    if (t.event === 'dies') score += doublers('die') + 0.5 * sacOutlets(s, me).length;
    if (t.event === 'otherEtb') score += 0.3 * mine.filter((i) => chars(s, i).types.has('creature')).length + 0.5 * myTrigs.filter((x) => produces(x.ability.effects).has('otherEtb')).length;
    if (t.event === 'otherDies') score += 0.4 * mine.filter((i) => chars(s, i).types.has('creature')).length + 1.5 * sacOutlets(s, me).length;
    if (t.event === 'gainLife') score += myTrigs.filter((x) => produces(x.ability.effects).has('gainLife')).length;
    if (t.event === 'loseLifeEv') score += myTrigs.filter((x) => produces(x.ability.effects).has('loseLifeEv')).length;
    // D) loops: its output fires one of my triggers whose output fires it back
    const out = produces(t.ability.effects);
    for (const x of myTrigs) if (out.has(x.event) && produces(x.ability.effects).has(t.event)) score += 10;
  }

  // E) doublers / replacement multipliers scale with what they'd multiply (on board now, or still in hand)
  const handTrigs: Trig[] = s.players[me].hand.filter((h) => h !== iid).flatMap((h) => (parsedFor(s, s.cards[h]).triggers ?? []) as Trig[]);
  for (const r of replacementsOf(pc)) {
    if (r.k === 'trigDouble' && r.cause === 'enter') score += 0.6 * handTrigs.filter((t) => ENTERS.has(t.event)).length;
    if (r.k === 'trigDouble' && r.cause === 'die') score += 0.6 * handTrigs.filter((t) => DIES.has(t.event)).length;
    if (r.k === 'tokenDouble') score += 0.5 * handTrigs.filter((t) => produces(t.ability.effects).has('otherEtb')).length;
  }
  for (const r of replacementsOf(pc)) {
    if (r.k === 'trigDouble' && r.cause === 'enter') score += 0.8 * myTrigs.filter((t) => ENTERS.has(t.event)).length;
    if (r.k === 'trigDouble' && r.cause === 'die') score += 0.8 * myTrigs.filter((t) => DIES.has(t.event)).length;
    if (r.k === 'trigDouble' && r.cause === 'attack') score += 0.6 * myTrigs.filter((t) => /attack/i.test(t.event)).length;
    if (r.k === 'tokenDouble') score += 0.7 * myTrigs.filter((t) => produces(t.ability.effects).has('otherEtb')).length;
    if (r.k === 'counterDouble' || r.k === 'counterPlus') score += 0.5 * mine.filter((i) => Object.keys(s.cards[i].counters).length).length;
    if (r.k === 'lifeDouble') score += 0.6 * myTrigs.filter((t) => t.event === 'gainLife').length;
  }

  // F) a free sacrifice outlet turns every creature into a payoff trigger
  if ((pc.activated ?? []).some(isFreeSac)) score += 1.5 * myTrigs.filter((t) => DIES.has(t.event)).length + 0.5 * handTrigs.filter((t) => DIES.has(t.event)).length;
  return score;
}

const isFreeSac = (a: any) => !!a?.cost?.sacrifice && !a.cost.mana && !a.cost.tap && (a.cost.sacrifice.filter?.types ?? []).includes('creature');

export function sacOutlets(s: GameState, me: PlayerIdx): { iid: string; ability: number }[] {
  const out: { iid: string; ability: number }[] = [];
  for (const iid of myPermanents(s, me)) {
    const acts = chars(s, iid).pc.activated ?? [];
    acts.forEach((a: any, i: number) => { if (isFreeSac(a)) out.push({ iid, ability: i }); });
  }
  return out;
}

/** Creatures I'd happily sacrifice, best first: tokens, ones that come back (persist/undying), then cheapest. */
export function fodder(s: GameState, me: PlayerIdx, exclude: Set<string>): string[] {
  const rank = (i: string) => {
    const c = s.cards[i];
    const ch = chars(s, i);
    const kw = ch.keywords;
    const returns = (kw.has('persist') && !c.counters['-1/-1']) || (kw.has('undying') && !c.counters['+1/+1']);
    const payoff = (ch.pc.triggers as Trig[]).some((t) => DIES.has(t.event) && t.event !== 'dies') || (ch.pc.activated ?? []).some(isFreeSac);
    if (payoff) return 99; // never feed the engine to itself
    return (returns ? -2 : 0) + (c.token ? -1 : 0) + s.defs[c.defId].cmc * 0.3 + ch.power * 0.2;
  };
  return myPermanents(s, me)
    .filter((i) => !exclude.has(i) && chars(s, i).types.has('creature'))
    .map((i) => ({ i, r: rank(i) }))
    .filter((x) => x.r < 99)
    .sort((a, b) => a.r - b.r)
    .map((x) => x.i);
}

/** Drain to each opponent per creature I sacrifice (Blood Artist, Zulaport …), counting Teysa-style doublers. */
export function drainPerDeath(s: GameState, me: PlayerIdx): number {
  const mine = myPermanents(s, me);
  const per = mine.flatMap((i) => triggersOf(s, i)).filter((t) => (t.event === 'otherDies') && isDrain(t)).length;
  const dbl = mine.flatMap((i) => replacementsOf(chars(s, i).pc)).filter((r) => r.k === 'trigDouble' && r.cause === 'die').length;
  return per * (1 + dbl);
}

/** My creatures that are about to die anyway: targeted by an opponent's harmful spell, or losing a fight in combat. */
export function doomed(s: GameState, me: PlayerIdx): string[] {
  const out = new Set<string>();
  const HARM = /^(damage|destroy|exile|bounce|toLibrary|sacrifice|gainControl|fight)$/;
  for (const it of s.stack) {
    if (it.controller === me) continue;
    if (!(it.effects ?? []).some((e: any) => HARM.test(e.k))) continue;
    for (const t of (it.targets ?? []).flat() as any[]) if (t?.kind === 'card' && s.cards[t.iid]?.controller === me) out.add(t.iid);
  }
  const cmb = s.combat;
  if (cmb?.blocksDeclared) {
    const hp = (i: string) => chars(s, i).toughness - s.cards[i].damage;
    for (const a of cmb.attackers) {
      if (!s.cards[a.iid]) continue;
      if (s.cards[a.iid].controller === me && a.blockedBy.length) {
        const dmg = a.blockedBy.filter((b) => s.cards[b]).reduce((n, b) => n + chars(s, b).power, 0);
        if (dmg >= hp(a.iid)) out.add(a.iid);
      }
      for (const b of a.blockedBy) if (s.cards[b]?.controller === me && s.cards[a.iid] && chars(s, a.iid).power >= hp(b)) out.add(b);
    }
  }
  return [...out].filter((i) => s.cards[i]?.zone === 'battlefield' && chars(s, i).types.has('creature'));
}

/** Which creature the AI decided to sacrifice next (read by the sacrifice prompt). */
const sacPref = new WeakMap<GameState, string>();
export function preferredSac(s: GameState): string | undefined { return sacPref.get(s); }

/** Should I sacrifice something to a free outlet right now? Returns the outlet to activate, or null. */
export function sacPlan(s: GameState, me: PlayerIdx): { iid: string; ability: number; why: 'lethal' | 'value' | 'doomed' } | null {
  const outlets = sacOutlets(s, me);
  if (!outlets.length) return null;
  const outletIds = new Set(outlets.map((o) => o.iid));
  const pool = fodder(s, me, outletIds);
  if (!pool.length) return null;
  const drain = drainPerDeath(s, me);
  const oppLife = s.players[opp(me)].life;
  // Go for it when every available body drained at once is lethal.
  if (drain > 0 && drain * pool.length >= oppLife) return { ...outlets[0], why: 'lethal' };
  // Free value: a persist/undying creature with a death payoff comes back and drains again.
  const top = s.cards[pool[0]];
  const kw = chars(s, pool[0]).keywords;
  const returns = (kw.has('persist') && !top.counters['-1/-1']) || (kw.has('undying') && !top.counters['+1/+1']);
  if (drain > 0 && returns) { sacPref.set(s, pool[0]); return { ...outlets[0], why: 'value' }; }
  // It's dying anyway: cash it in (drain, scry, mana) and fizzle the opponent's removal / combat damage.
  const dying = doomed(s, me).filter((i) => !outletIds.has(i));
  if (dying.length) { sacPref.set(s, dying[0]); return { ...outlets[0], why: 'doomed' }; }
  return null;
}
