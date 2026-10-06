/**
 * Heuristic AI opponent. It reads the authoritative game state and returns one Action at a time.
 * It plays lands, casts the best spells it can afford, aims removal at the opponent's best threats,
 * attacks when it is safe or lethal, and blocks to survive or trade well.
 */
import type { Action, GameState, PlayerIdx, Target } from './types';
import { attackCostOf, canAfford, canAffordSpell, canAttack, canBlock } from './engine';
import { chars, opp, parsedFor } from './rules';
import type { Effect, Subject } from './oracle';
import { synergy, sacPlan, fodder, preferredSac } from './aiSynergy';

const HARMFUL = new Set(['damage', 'destroy', 'exile', 'bounce', 'toLibrary', 'tap', 'counterSpell', 'cantBlock', 'discard', 'mill', 'lose', 'skipUntap', 'gainControl', 'sacrifice', 'loseAbilities', 'setPT', 'exchangeControl']);

/** Per-game memory so the AI never retries the same failed action in one priority window. */
interface Memory {
  window: string;
  tried: Set<string>;
  last?: Action;
}
const memories = new WeakMap<GameState, Memory>();
function memory(s: GameState): Memory {
  const key = `${s.turn}:${s.step}:${s.stack.length}:${s.priority}`;
  let m = memories.get(s);
  if (!m || m.window !== key) {
    m = { window: key, tried: new Set() };
    memories.set(s, m);
  }
  return m;
}
export function aiActionFailed(s: GameState, a: Action) {
  const m = memory(s);
  m.tried.add(JSON.stringify(a));
  // A failed answer usually means the spell we started couldn't be finished: don't start it again.
  if (m.last) m.tried.add(JSON.stringify(m.last));
}

export function aiNeedsToAct(s: GameState, me: PlayerIdx): boolean {
  if (!s.started || s.over) return false;
  if (s.prompt) return s.prompt.player === me;
  if (s.pendingCast || s.resolving) return false;
  if (!s.players[0].kept || !s.players[1].kept) return false;
  return s.priority === me;
}

// ------------------------------------------------------------------------------------------

const isType = (s: GameState, iid: string, t: string) => chars(s, iid).types.has(t);
const value = (s: GameState, iid: string) => {
  const c = chars(s, iid);
  return c.cmc + (c.types.has('creature') ? (c.power + c.toughness) / 2 : 0) + c.keywords.size * 0.5;
};
const myCreatures = (s: GameState, me: PlayerIdx) => s.battlefield.filter((i) => s.cards[i].controller === me && isType(s, i, 'creature'));

function landsInPlay(s: GameState, me: PlayerIdx) {
  return s.battlefield.filter((i) => s.cards[i].controller === me && isType(s, i, 'land')).length;
}

function neededColors(s: GameState, me: PlayerIdx): Record<string, number> {
  const need: Record<string, number> = {};
  for (const h of s.players[me].hand) {
    const d = s.defs[s.cards[h].defId];
    for (const m of d.manaCost.match(/\{([WUBRG])\}/g) ?? []) need[m[1]] = (need[m[1]] ?? 0) + 1;
  }
  return need;
}

// ------------------------------------------------------------------------------------------

export function aiDecide(s: GameState, me: PlayerIdx): Action | null {
  const pr = s.prompt;
  if (pr && pr.player === me) {
    try {
      return { type: 'answer', promptId: pr.id, choice: answerPrompt(s, me) };
    } catch (e) {
      if (e instanceof CancelSignal) {
        const m = memory(s);
        if (m.last) m.tried.add(JSON.stringify(m.last));
        return { type: 'cancel', promptId: pr.id };
      }
      throw e;
    }
  }
  if (pr) return null;
  if (s.priority !== me) return null;
  const mem = memory(s);
  const ok = (a: Action) => {
    if (mem.tried.has(JSON.stringify(a))) return false;
    mem.last = a;
    return true;
  };
  const pl = s.players[me];
  const mainPhase = s.active === me && (s.step === 'main1' || s.step === 'main2') && s.stack.length === 0;

  // Combo: free sacrifice outlet + death payoffs (Blood Artist, Zulaport …)
  const plan = sacPlan(s, me);
  if (plan && (plan.why !== 'value' || mainPhase)) {
    const a: Action = { type: 'activate', iid: plan.iid, ability: plan.ability };
    if (ok(a)) return a;
  }

  if (mainPhase) {
    // 1. Land: prefer one that makes colors we need
    const lands = pl.hand.filter((h) => /\bLand\b/.test(s.defs[s.cards[h].defId].typeLine.split('//')[0]));
    if (lands.length) {
      const need = neededColors(s, me);
      const score = (h: string) => {
        const pc = parsedFor(s, s.cards[h]);
        const cols = pc.activated.filter((a) => a.isMana).flatMap((a) => a.produces?.flat() ?? []);
        return cols.reduce((a, c) => a + (need[c] ?? 0), 0) - (pc.entersTapped ? 1 : 0);
      };
      lands.sort((a, b) => score(b) - score(a));
      for (const l of lands) {
        const a: Action = { type: 'playLand', iid: l };
        if (ok(a)) return a;
      }
    }
    // 2. Spells: creatures first in main 1, most expensive affordable first
    const spells = pl.hand
      .filter((h) => !/\bLand\b/.test(s.defs[s.cards[h].defId].typeLine.split('//')[0]) || /Creature|Instant|Sorcery/.test(s.defs[s.cards[h].defId].typeLine))
      .map((h) => ({ h, d: s.defs[s.cards[h].defId] }))
      .filter(({ h, d }) => canAffordSpell(s, me, h, d.manaCost.split(' // ')[0]))
      .map((x) => ({ ...x, syn: synergy(s, me, x.h) }))
      .sort((a, b) => {
        if (Math.abs(a.syn - b.syn) >= 1) return b.syn - a.syn; // combo pieces with my board come first
        const ca = /Creature/.test(a.d.typeLine) ? 1 : 0;
        const cb = /Creature/.test(b.d.typeLine) ? 1 : 0;
        if (s.step === 'main1' && ca !== cb) return cb - ca;
        return b.d.cmc - a.d.cmc;
      });
    for (const { h, d } of spells) {
      if (/\bCounter target\b/i.test(d.oracle) && !/\bcreature\b/i.test(d.typeLine)) continue; // keep counterspells
      if (/^Instant/.test(d.typeLine) && s.step === 'main1' && /gets \+/.test(d.oracle)) continue; // save combat tricks
      const a: Action = { type: 'cast', iid: h };
      if (ok(a)) return a;
    }
    // 3. Activated abilities: loyalty, equip
    for (const iid of s.battlefield) {
      const c = s.cards[iid];
      if (c.controller !== me) continue;
      const pc = chars(s, iid).pc;
      for (let i = 0; i < pc.activated.length; i++) {
        const ab = pc.activated[i];
        if (ab.isMana) continue;
        if (ab.special === 'loyalty' && !c.loyaltyUsed) {
          const l = ab.cost.loyalty;
          if (typeof l === 'number' && l < 0 && (c.counters.loyalty ?? 0) + l < 1) continue;
          const a: Action = { type: 'activate', iid, ability: i };
          if (ok(a)) return a;
        }
        if (ab.special === 'equip' && !c.attachedTo && myCreatures(s, me).length && canAfford(s, me, ab.cost.mana, 0)) {
          const a: Action = { type: 'activate', iid, ability: i };
          if (ok(a)) return a;
        }
      }
    }
  } else if (s.stack.length) {
    // Respond to an opponent's spell with a counterspell if we can
    const top = s.stack[s.stack.length - 1];
    if (top.controller !== me && top.kind === 'spell') {
      for (const h of pl.hand) {
        const d = s.defs[s.cards[h].defId];
        if (!/Instant/.test(d.typeLine) || !/counter target/i.test(d.oracle)) continue;
        if (!canAfford(s, me, d.manaCost)) continue;
        const a: Action = { type: 'cast', iid: h };
        if (ok(a)) return a;
      }
    }
  } else if (s.active !== me && s.step === 'end') {
    // End of opponent's turn: use leftover instant-speed removal/burn
    for (const h of pl.hand) {
      const d = s.defs[s.cards[h].defId];
      if (!/Instant/.test(d.typeLine) || /counter target/i.test(d.oracle)) continue;
      if (!canAfford(s, me, d.manaCost)) continue;
      const a: Action = { type: 'cast', iid: h };
      if (ok(a)) return a;
    }
  }
  return { type: 'pass' };
}

// ------------------------------------------------------------------------------------------
// Prompts
// ------------------------------------------------------------------------------------------

function answerPrompt(s: GameState, me: PlayerIdx): any {
  const pr = s.prompt!;
  const ctx = pr.data?.ctx;
  switch (pr.kind) {
    case 'mulligan': {
      const hand = s.players[me].hand;
      const lands = hand.filter((h) => /\bLand\b/.test(s.defs[s.cards[h].defId].typeLine.split('//')[0])).length;
      const good = lands >= 2 && lands <= 5;
      return good || s.players[me].mulligans >= 2 ? 'keep' : 'mulligan';
    }
    case 'chooseCards':
      if (pr.data?.minTotalMv) {
        // collect evidence: the fewest high-value cards reaching the total, or none
        const mvOf = (i: string) => s.defs[s.cards[i].defId].cmc ?? 0;
        const out: string[] = [];
        let sum = 0;
        for (const c of [...(pr.cards ?? [])].sort((a, b) => mvOf(b) - mvOf(a))) { if (sum >= pr.data.minTotalMv) break; out.push(c); sum += mvOf(c); }
        return sum >= pr.data.minTotalMv ? out : [];
      }
      return chooseCards(s, me, pr.cards ?? [], pr.min ?? 0, pr.max ?? 0, pr.title, ctx, pr.data?.cost);
    case 'targets':
      return chooseTargets(s, me, pr.targets ?? [], pr.min ?? 0, pr.max ?? 1);
    case 'mode':
      return Array.from({ length: pr.min ?? 1 }, (_, i) => String(i));
    case 'x':
      return pr.max ?? 0;
    case 'yesno':
      return 'yes';
    case 'cardName': {
      // Name something the opponent is visibly playing (battlefield, graveyard, exile) — never peek at hidden zones.
      const them = opp(me);
      const seen = [...s.battlefield.filter((i) => s.cards[i].owner === them), ...s.players[them].graveyard, ...((s.players[them] as any).exile ?? [])];
      const counts = new Map<string, number>();
      for (const i of seen) {
        const d = s.defs[s.cards[i]?.defId];
        if (!d || s.cards[i].token) continue;
        if (pr.data?.nonland && /\bLand\b/.test(d.typeLine)) continue;
        counts.set(d.name, (counts.get(d.name) ?? 0) + (/\bLand\b/.test(d.typeLine) ? 0.5 : 1));
      }
      const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      return best ?? (pr.data?.nonland ? 'Lightning Bolt' : 'Island');
    }
    case 'color': {
      const need = neededColors(s, me);
      const opts = (pr.options ?? []).map((o) => o.id);
      return opts.sort((a, b) => (need[b] ?? 0) - (need[a] ?? 0))[0];
    }
    case 'divide': {
      const k = pr.targets?.length ?? 1;
      const total = pr.min ?? k;
      const base = Math.floor(total / k);
      return Array.from({ length: k }, (_, i) => base + (i < total - base * k ? 1 : 0));
    }
    case 'declareAttackers':
      return chooseAttacks(s, me, pr.cards ?? [], pr.targets ?? []);
    case 'declareBlockers':
      return chooseBlocks(s, me, pr.cards ?? []);
  }
  return null;
}

function chooseCards(s: GameState, me: PlayerIdx, cards: string[], min: number, max: number, title: string, ctx: string, cost?: string): string[] {
  const d = (i: string) => s.defs[s.cards[i].defId];
  const isLand = (i: string) => /\bLand\b/.test(d(i).typeLine.split('//')[0]);
  const t = title.toLowerCase();
  if (ctx === 'bottom' || t.startsWith('discard')) {
    // Keep a sensible land count: throw away extra lands if we have plenty, else the priciest spells
    const landsTotal = landsInPlay(s, me) + s.players[me].hand.filter(isLand).length;
    const sorted = [...cards].sort((a, b) => {
      const la = isLand(a) ? 1 : 0;
      const lb = isLand(b) ? 1 : 0;
      if (landsTotal >= 5 && la !== lb) return lb - la;
      if (landsTotal < 3 && la !== lb) return la - lb;
      return d(b).cmc - d(a).cmc;
    });
    return sorted.slice(0, min);
  }
  if (t.startsWith('sacrifice') || cost === 'sac') {
    // tokens and creatures that come back first; never the combo pieces themselves
    const pref = fodder(s, me, new Set());
    const want = preferredSac(s);
    const rank = (c: string) => { if (c === want) return -1; const i = pref.indexOf(c); return i < 0 ? 1000 + value(s, c) : i; };
    return [...cards].sort((a, b) => rank(a) - rank(b)).slice(0, min);
  }
  if (cost === 'crew' || cost === 'tap') {
    const sorted = [...cards].sort((a, b) => chars(s, b).power - chars(s, a).power);
    const out: string[] = [];
    for (const c of sorted) {
      out.push(c);
      if (out.length >= Math.max(min, 1)) break;
    }
    return out;
  }
  if (t.startsWith('scry')) {
    // bottom lands when flooded, spells we can't cast soon when screwed
    const flooded = landsInPlay(s, me) >= 5;
    return cards.filter((c) => (flooded ? isLand(c) : false)).slice(0, max);
  }
  if (t.startsWith('surveil')) return [];
  if (t.startsWith('search')) {
    const need = neededColors(s, me);
    return [...cards]
      .sort((a, b) => {
        const pa = parsedFor(s, s.cards[a]).intrinsicMana ?? [];
        const pb = parsedFor(s, s.cards[b]).intrinsicMana ?? [];
        return pb.reduce((x, c) => x + (need[c] ?? 0), 0) - pa.reduce((x, c) => x + (need[c] ?? 0), 0) || d(b).cmc - d(a).cmc;
      })
      .slice(0, max);
  }
  return cards.slice(0, Math.max(min, Math.min(max, 1)));
}

/** Which effects of the spell being cast refer to target spec `idx`, and are they harmful? */
function targetIntent(s: GameState, idx: number): { harmful: boolean; damage?: number; kinds: string[]; fightSide?: 'a' | 'b' } {
  const pc = s.pendingCast;
  if (!pc) return { harmful: true, kinds: [] };
  if (pc.kind === 'spell' && pc.isPerm) {
    // aura: beneficial if it pumps / grants keywords, harmful if it restricts or shrinks
    const card = s.cards[pc.iid];
    const statics = parsedFor(s, card).statics.filter((x) => x.kind === 'attachPump');
    const bad = statics.some((x) => x.cantAttack || x.cantBlock || x.noUntap || (typeof x.p === "number" && x.p < 0) || (typeof x.t === "number" && x.t < 0)) || !!parsedFor(s, card).controlEnchanted;
    return { harmful: statics.length ? bad : true, kinds: ['aura'] };
  }
  const kinds: string[] = [];
  let harmful = false;
  let beneficial = false;
  let damage: number | undefined;
  let fightSide: 'a' | 'b' | undefined;
  const refs = (sub: Subject | undefined) => sub?.t === 'target' && sub.spec === idx;
  const walk = (effs: Effect[]) => {
    for (const e of effs) {
      if (e.k === 'may' || e.k === 'if' || e.k === 'delayed') { walk(e.effects); continue; }
      const any = e as any;
      const tos = Array.isArray(any.to) ? any.to : any.to ? [any.to] : [];
      const subs: Subject[] = [any.what, any.who, ...tos, any.a, any.b].filter(Boolean);
      if (!subs.some(refs)) continue;
      kinds.push(e.k);
      if (e.k === 'fight') {
        fightSide = refs(e.a) ? 'a' : 'b';
        if (fightSide === 'a') beneficial = true;
        else harmful = true;
        continue;
      }
      if (e.k === 'pump') {
        if ((typeof e.p === 'number' && e.p < 0) || (typeof e.t === 'number' && e.t < 0) || e.neg) harmful = true;
        else beneficial = true;
        continue;
      }
      if (e.k === 'counters') {
        if (e.counter.startsWith('-')) harmful = true;
        else beneficial = true;
        continue;
      }
      if (e.k === 'damage' && typeof e.n === 'number') damage = e.n;
      if (e.k === 'damage' && e.n === 'X') damage = pc.x ?? 0;
      if (HARMFUL.has(e.k)) harmful = true;
      else beneficial = true;
    }
  };
  walk(pc.ability?.effects ?? []);
  if (!harmful && !beneficial) harmful = true;
  return { harmful: harmful && !beneficial ? true : harmful, damage, kinds, fightSide };
}

function chooseTargets(s: GameState, me: PlayerIdx, legal: Target[], min: number, max: number): Target[] {
  const pc = s.pendingCast;
  const intent = targetIntent(s, pc?.specIdx ?? 0);
  const theirs = (t: Target) =>
    t.kind === 'player' ? t.idx !== me : t.kind === 'card' ? s.cards[t.iid]?.controller !== me && s.cards[t.iid]?.zone === 'battlefield' || (s.cards[t.iid]?.zone !== 'battlefield' && s.cards[t.iid]?.owner !== me) : s.stack.find((x) => x.id === t.id)?.controller !== me;
  const score = (t: Target): number => {
    if (t.kind === 'stack') {
      const it = s.stack.find((x) => x.id === t.id);
      return it && it.kind === 'spell' ? chars(s, it.source).cmc + 5 : 1;
    }
    if (t.kind === 'player') {
      // Burn goes face when there's no creature worth killing, or when it is lethal
      if (intent.damage != null && s.players[t.idx].life <= intent.damage) return 100;
      return intent.kinds.includes('damage') ? 2 : intent.kinds.some((k) => ['discard', 'lose', 'mill'].includes(k)) ? 5 : 0.5;
    }
    const c = s.cards[t.iid];
    if (!c) return 0;
    if (c.zone === 'graveyard') return value(s, t.iid);
    const ch = chars(s, t.iid);
    let v = value(s, t.iid);
    if (intent.harmful && intent.damage != null && ch.types.has('creature')) {
      const remaining = ch.toughness - c.damage;
      if (remaining > intent.damage && !ch.types.has('planeswalker')) return 0.1; // wouldn't die
      v += 3;
    }
    if (!intent.harmful && ch.types.has('creature')) v += c.tapped ? -2 : 2;
    return v;
  };
  let pool = legal.filter((t) => (intent.harmful ? theirs(t) : !theirs(t)));
  // Returning cards from a graveyard: our own cards
  if (legal.some((t) => t.kind === 'card' && s.cards[t.iid]?.zone === 'graveyard')) pool = legal.filter((t) => t.kind === 'card' && s.cards[t.iid]?.owner === me);
  pool.sort((a, b) => score(b) - score(a));
  const good = pool.filter((t) => score(t) > 0.2);
  if (good.length >= Math.max(min, 1)) return good.slice(0, max);
  if (min === 0) return [];
  // Nothing sensible: triggers must still pick something; spells get cancelled by the caller if it errors
  if (pc?.kind !== 'trigger' && s.prompt?.canCancel) {
    throw new CancelSignal();
  }
  const fallback = [...pool, ...legal.filter((t) => !pool.includes(t))];
  return fallback.slice(0, Math.max(min, 1));
}

export class CancelSignal extends Error {}

/** "attacks each combat if able", goaded, "must attack this turn" */
const mustAtk = (s: GameState, a: string) => { const ac = chars(s, a); return !!(ac.pc.mustAttack || (ac as any).mustAttackSt || (s.cards[a] as any).mustAttackTurn === s.turn || ((s.cards[a] as any).goadUntil ?? 0) > s.turn); };
function chooseAttacks(s: GameState, me: PlayerIdx, cands: string[], targets: Target[]) {
  const foe = opp(me);
  const blockers = s.battlefield.filter((b) => s.cards[b].controller === foe && !s.cards[b].tapped && isType(s, b, 'creature') && !chars(s, b).cantBlock);
  const player = targets.find((t) => t.kind === 'player') ?? targets[0];
  const attackers = cands.filter((a) => canAttack(s, a));
  const totalPower = attackers.reduce((x, a) => x + Math.max(0, chars(s, a).power), 0);
  const topBlocked = attackers
    .map((a) => chars(s, a).power)
    .sort((x, y) => y - x)
    .slice(0, blockers.length)
    .reduce((x, y) => x + y, 0);
  const lethal = totalPower - topBlocked >= s.players[foe].life;
  const chosen: string[] = [];
  for (const a of attackers) {
    const ac = chars(s, a);
    if (mustAtk(s, a)) { chosen.push(a); continue; }
    if (ac.power <= 0) continue;
    if (lethal) { chosen.push(a); continue; }
    const able = blockers.filter((b) => canBlock(s, b, a));
    if (!able.length) { chosen.push(a); continue; }
    const safe = able.every((b) => {
      const bc = chars(s, b);
      const killsMe = bc.power >= ac.toughness || bc.keywords.has('deathtouch');
      const iKill = ac.power >= bc.toughness || ac.keywords.has('deathtouch');
      if (!killsMe) return true;
      return iKill && value(s, b) >= value(s, a); // acceptable trade
    });
    if (safe) chosen.push(a);
  }
  // Keep one blocker home if the opponent's counter-attack would be lethal
  const theirPower = s.battlefield.filter((b) => s.cards[b].controller === foe && isType(s, b, 'creature')).reduce((x, b) => x + Math.max(0, chars(s, b).power), 0);
  if (!lethal && theirPower >= s.players[me].life && chosen.length) {
    const vigilant = chosen.filter((c) => chars(s, c).keywords.has('vigilance'));
    const stay = chosen.filter((c) => !mustAtk(s, c)).sort((a, b) => chars(s, b).toughness - chars(s, a).toughness)[0];
    if (!vigilant.length && stay) chosen.splice(chosen.indexOf(stay), 1);
  }
  // attack taxes (Propaganda, Ghostly Prison): drop the weakest attackers until the total is affordable
  const taxOf = (ids: string[]) => ids.map((i) => attackCostOf(s, i, player) ?? '').join('');
  while (chosen.length && taxOf(chosen) && !canAfford(s, me, taxOf(chosen))) {
    const weakest = [...chosen].sort((a, b) => Number(mustAtk(s, a) && !attackCostOf(s, a, player)) - Number(mustAtk(s, b) && !attackCostOf(s, b, player)) || chars(s, a).power - chars(s, b).power)[0];
    chosen.splice(chosen.indexOf(weakest), 1);
  }
  // "~ can't attack alone": a lone attacker like that stays home
  if (chosen.length === 1 && (chars(s, chosen[0]).pc as any).cantAttackAlone) return [];
  return chosen.map((iid) => ({ iid, target: player }));
}

function chooseBlocks(s: GameState, me: PlayerIdx, blockers: string[]) {
  const attackers = [...(s.combat?.attackers ?? [])].map((a) => a.iid).filter((a) => s.cards[a]);
  attackers.sort((a, b) => chars(s, b).power - chars(s, a).power);
  const free = new Set(blockers);
  const out: { blocker: string; attacker: string }[] = [];
  let incoming = attackers.reduce((x, a) => x + Math.max(0, chars(s, a).power), 0);
  const life = s.players[me].life;
  for (const a of attackers) {
    const ac = chars(s, a);
    if (ac.keywords.has('menace')) continue;
    const opts = [...free].filter((b) => canBlock(s, b, a));
    if (!opts.length) continue;
    const rate = (b: string) => {
      const bc = chars(s, b);
      const survives = bc.toughness > ac.power && !ac.keywords.has('deathtouch');
      const kills = bc.power >= ac.toughness || bc.keywords.has('deathtouch');
      if (survives && kills) return 3;
      if (survives) return 2;
      if (kills && value(s, a) >= value(s, b)) return 1;
      return 0;
    };
    opts.sort((x, y) => rate(y) - rate(x) || value(s, x) - value(s, y));
    const best = opts[0];
    const r = rate(best);
    const mustChump = incoming >= life;
    if (r > 0 || mustChump) {
      out.push({ blocker: best, attacker: a });
      free.delete(best);
      if (!ac.keywords.has('trample')) incoming -= Math.max(0, ac.power);
    }
  }
  // Lure ("all creatures able to block it do so"): every blocker that can block a lured attacker must block one of them
  const lures = (s.combat?.attackers ?? []).filter((a) => (chars(s, a.iid).pc as any).lure || (s.cards[a.iid] as any)?.lureTurn === s.turn).map((a) => a.iid);
  if (lures.length) {
    for (const b of blockers) {
      if (s.cards[b].tapped) continue;
      const able = lures.filter((a) => canBlock(s, b, a));
      if (!able.length || out.some((x) => x.blocker === b && able.includes(x.attacker))) continue;
      for (let i = out.length - 1; i >= 0; i--) if (out[i].blocker === b) out.splice(i, 1);
      out.push({ blocker: b, attacker: able[0] });
    }
  }
  // "target creature blocks <that attacker> this turn if able" (provoke, Gavony Trapper …): that exact block
  for (const b of blockers) {
    const mb = (s.cards[b] as any).mustBlock;
    if (!mb || mb.turn !== s.turn || s.cards[b].tapped) continue;
    if (!s.combat?.attackers.some((a) => a.iid === mb.attacker) || !canBlock(s, b, mb.attacker)) continue;
    for (let i = out.length - 1; i >= 0; i--) if (out[i].blocker === b) out.splice(i, 1);
    out.push({ blocker: b, attacker: mb.attacker });
  }
  // Rules the blocks must obey: forced blockers ("blocks this turn if able") and "except by N or more creatures"
  for (const b of blockers) {
    if ((s.cards[b] as any).mustBlockAny !== s.turn || out.some((x) => x.blocker === b)) continue;
    const a = (s.combat?.attackers ?? []).map((x) => x.iid).find((x) => canBlock(s, b, x));
    if (a) out.push({ blocker: b, attacker: a });
  }
  // "must be blocked this turn if able": put a free blocker (the least valuable one) on it
  for (const a of s.combat?.attackers ?? []) {
    const forced = (s.cards[a.iid] as any)?.mustBeBlockedTurn === s.turn || !!(chars(s, a.iid).pc as any).combatFlags?.mustBeBlocked;
    if (!forced || out.some((x) => x.attacker === a.iid)) continue;
    const b = blockers.filter((x) => !out.some((o) => o.blocker === x) && canBlock(s, x, a.iid)).sort((x, y) => value(s, x) - value(s, y))[0];
    if (b) out.push({ blocker: b, attacker: a.iid });
  }
  for (const a of s.combat?.attackers ?? []) {
    const min = (chars(s, a.iid).pc as any).minBlockers;
    const n = out.filter((x) => x.attacker === a.iid).length;
    if (min && n > 0 && n < min) for (let i = out.length - 1; i >= 0; i--) if (out[i].attacker === a.iid) out.splice(i, 1);
  }
  return out;
}
