/**
 * Manaforge rules engine.
 * Implements the core Comprehensive Rules flow the way MTG Arena automates it:
 * turn structure (500–514), priority & the stack (116, 405, 608), casting (601), activated & mana abilities (602, 605),
 * combat (506–511), state-based actions (704), London mulligan (103.5), and cleanup/hand size (514).
 * Card-specific effects are parsed from Oracle text; unparsed text is surfaced for manual resolution.
 */
import { EXT } from './ext';
import type { CardDef } from './cardTypes';
import {
  type Action, type Attacker, type CardObj, type Color, type GameState, type LogEntry, type ManualOp, type PlayerIdx,
  type PlayerState, type Prompt, type StackItem, type Step, type Target, type CastAlt, STEPS, STEP_LABEL, COLORS,
  type ManaPool,
} from './types';
import { emptyPool, parseCost, planPayment, poolTotal, type ManaSource } from './mana';
import { type Ability, type Activated, type Amt, type Cond, type Effect, type Filter, type ParsedCard, type Subject, type TargetSpec, type Trigger, type TriggerEvent, parseAbility, parseCard, parseCond, normalizeText } from './oracle';
import { baseChars, chars, matchesFilter, opp, parsedFor, protectedFrom, protectionColors, stackItemMatches, currentFace, evalAmt, evalCond, gateOk } from './rules';

export interface EngineHooks {
  findToken?: (name: string, power?: string, toughness?: string, colors?: string[]) => CardDef | undefined;
  findCard?: (name: string) => CardDef | undefined;
}
let hooks: EngineHooks = {};
export function setEngineHooks(h: EngineHooks) {
  hooks = h;
}

// ============================================================================================
// Helpers
// ============================================================================================

function uid(s: GameState, p = 'c') {
  return `${p}${(s.nextId++).toString(36)}`;
}

export function log(s: GameState, text: string, player?: PlayerIdx, kind: LogEntry['kind'] = 'info') {
  s.log.push({ t: Date.now(), player, text, kind });
  if (s.log.length > 400) s.log.splice(0, s.log.length - 400);
}

function cardImageOf(s: GameState, iid: string): string | undefined {
  const c = s.cards[iid];
  const d = c && s.defs[c.defId];
  if (!d) return undefined;
  if (d.faces && d.faces.length > 1 && d.faces[c.face ?? 0]?.image && ['transform', 'modal_dfc', 'meld'].includes(d.layout)) return d.faces[c.face ?? 0].image;
  return d.image ?? d.faces?.[0]?.image;
}

/** Structured animation events for the client (never affect rules). */
export function ev(s: GameState, e: Record<string, any>) {
  const st = s as any;
  st.evSeq = (st.evSeq ?? 0) + 1;
  (st.events ??= []).push({ seq: st.evSeq, ...e });
  if (st.events.length > 300) st.events.splice(0, st.events.length - 300);
}

function rand(s: GameState): number {
  // mulberry32
  let t = (s.seed = (s.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function shuffleArr<T>(s: GameState, a: T[]) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand(s) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

const P = (s: GameState, i: PlayerIdx) => s.players[i];
const nm = (s: GameState, iid: string) => {
  const c = s.cards[iid];
  if (!c) return 'a card';
  return baseChars(s, iid).name;
};
const pname = (s: GameState, i: PlayerIdx) => s.players[i].name;

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

// ============================================================================================
// Game creation
// ============================================================================================

export interface DeckInput {
  name: string;
  cards: CardDef[]; // main deck, one entry per copy
  commanders?: CardDef[]; // Commander format: start in the command zone
}

export function createGame(id: string, decks: [DeckInput, DeckInput], seed = Math.floor(Math.random() * 2 ** 31), opts: { format?: 'constructed' | 'commander' } = {}): GameState {
  const mkPlayer = (idx: PlayerIdx, name: string): PlayerState => ({
    idx, name, life: 20, poison: 0, library: [], hand: [], graveyard: [], exile: [], pool: emptyPool(),
    landsPlayed: 0, landsAllowed: 1, mulligans: 0, kept: false, drewFromEmpty: false, lost: false, conceded: false,
    lifeGainedThisTurn: 0, spellsCastThisTurn: 0, counters: {}, damagedThisTurn: false,
    stops: { own: ['main1', 'main2', 'declareBlockers'], opp: ['declareAttackers', 'declareBlockers', 'end'] },
    passUntilEOT: false, fullControl: false, connected: true,
  });
  const s: GameState = {
    id, seed, started: false, over: false, winner: null, turn: 0, active: 0, startingPlayer: 0, step: 'untap',
    priority: 0, passes: 0, players: [mkPlayer(0, decks[0].name), mkPlayer(1, decks[1].name)], cards: {}, defs: {},
    battlefield: [], stack: [], combat: null, pendingTriggers: [], prompt: null, promptQueue: [], resolving: null,
    pendingCast: null, log: [], nextId: 1, ts: 1, manualNotice: null, version: 0,
    dayNight: null, delayed: [], lastTurnSpells: 0, lastTurnActiveSpells: 0,
  };
  if (opts.format === 'commander') {
    (s as any).format = 'commander';
    for (const p of s.players) {
      p.life = 40;
      (p as any).command = [];
      (p as any).commanderCasts = {};
      (p as any).commanderDamage = {};
    }
  }
  decks.forEach((d, pi) => {
    if (opts.format === 'commander') {
      for (const def of d.commanders ?? []) {
        s.defs[def.id] = def;
        const iid = uid(s);
        s.cards[iid] = newCardObj(iid, def.id, pi as PlayerIdx, 'command');
        (s.cards[iid] as any).isCommander = true;
        (s.players[pi] as any).command.push(iid);
      }
    }
    for (const def of d.cards) {
      s.defs[def.id] = def;
      const iid = uid(s);
      s.cards[iid] = newCardObj(iid, def.id, pi as PlayerIdx, 'library');
      s.players[pi].library.push(iid);
    }
  });
  return s;
}

function newCardObj(iid: string, defId: string, owner: PlayerIdx, zone: CardObj['zone']): CardObj {
  return { iid, defId, owner, controller: owner, zone, tapped: false, sick: false, counters: {}, damage: 0, deathtouched: false, face: 0, mods: [], ts: 0 };
}

export function startGame(s: GameState) {
  s.started = true;
  s.startingPlayer = rand(s) < 0.5 ? 0 : 1;
  s.active = s.startingPlayer;
  for (const p of s.players) {
    shuffleArr(s, p.library);
    drawCards(s, p.idx, 7, true);
  }
  log(s, `${pname(s, s.startingPlayer)} goes first (coin flip).`, undefined, 'turn');
  pushPrompt(s, mulliganPrompt(s, s.startingPlayer));
  settle(s);
}

function mulliganPrompt(s: GameState, p: PlayerIdx): Prompt {
  const n = P(s, p).mulligans;
  return {
    id: uid(s, 'p'), player: p, kind: 'mulligan',
    title: n === 0 ? 'Keep your opening hand?' : `Keep this hand? (you will put ${n} card${n > 1 ? 's' : ''} on the bottom)`,
    options: [{ id: 'keep', label: 'Keep' }, { id: 'mulligan', label: 'Mulligan' }],
    cards: [...P(s, p).hand],
    data: { ctx: 'mulligan' },
  };
}

// ============================================================================================
// Prompts
// ============================================================================================

function pushPrompt(s: GameState, pr: Prompt) {
  if (!s.prompt) s.prompt = pr;
  else s.promptQueue.push(pr);
}

function nextPrompt(s: GameState) {
  s.prompt = s.promptQueue.shift() ?? null;
}

// ============================================================================================
// Zones
// ============================================================================================

/** Everything whose abilities watch the game: permanents, plus emblems in the command zone (114). */
export function observers(s: GameState): string[] {
  const em = s.players.flatMap((p) => ((p as any).command ?? []).filter((i: string) => (s.cards[i] as any)?.emblem || ((s.cards[i] as any)?.isCommander && (parsedFor(s, s.cards[i]) as any).eminence)));
  // cards whose triggered abilities work from the graveyard ("… return ~ from your graveyard to the battlefield")
  const gy = s.players.flatMap((p) => p.graveyard.filter((i) => s.cards[i] && (parsedFor(s, s.cards[i]) as any).gyTrig));
  return em.length || gy.length ? [...s.battlefield, ...em, ...gy] : s.battlefield;
}

function zoneArr(s: GameState, c: CardObj): string[] | null {
  switch (c.zone) {
    case 'library': return P(s, c.owner).library;
    case 'hand': return P(s, c.owner).hand;
    case 'graveyard': return P(s, c.owner).graveyard;
    case 'exile': return P(s, c.owner).exile;
    case 'battlefield': return s.battlefield;
    case 'command': return ((P(s, c.owner) as any).command ??= []);
    default: return null;
  }
}

function removeFromZone(s: GameState, iid: string) {
  const c = s.cards[iid];
  const arr = zoneArr(s, c);
  if (arr) {
    const i = arr.indexOf(iid);
    if (i >= 0) arr.splice(i, 1);
  }
}

export type MoveTo = CardObj['zone'] | 'libraryTop' | 'libraryBottom';

/** Move a card between zones, handling leave-the-battlefield bookkeeping and triggers. */
export function moveCard(s: GameState, iid: string, to: MoveTo, opts: { tapped?: boolean; controller?: PlayerIdx; cause?: string } = {}) {
  (s as any).bfVer = ((s as any).bfVer ?? 0) + 1;
  const c = s.cards[iid];
  if (!c) return;
  const from = c.zone;
  const wantTo = to;
  // Replacement effects that send cards to exile instead of the graveyard (rule 614)
  if (to === 'graveyard') {
    if (from === 'battlefield' && (c.unearthed || c.disturbed || (c as any).dieExileTurn === s.turn || (c.counters?.finality ?? 0) > 0 || chars(s, iid).pc.replacements.some((r) => r.k === 'selfDieExile'))) to = 'exile';
    else if (from !== 'battlefield' && from !== 'stack' && c.disturbed) to = 'exile';
    else {
      for (const b of s.battlefield) {
        if (b === iid && from !== 'battlefield') continue;
        const o = s.cards[b];
        for (const r of baseChars(s, b).pc.replacements) {
          if (r.k === 'graveExile' && (r.owner === 'any' || c.owner !== o.controller) && (!(r as any).diesOnly || (from === 'battlefield' && chars(s, iid).types.has('creature')))) to = 'exile';
          // "If a creature dealt damage by ~ this turn would die, exile it instead."
          if ((r as any).k === 'dmgByExile' && from === 'battlefield' && chars(s, iid).types.has('creature')) {
            const t = (s as any).evTurn;
            if (t && t.turn === s.turn && (t.dmgBy?.[iid] ?? []).includes(b)) to = 'exile';
          }
        }
      }
    }
  }
  // "If a creature would die this turn, exile it instead." (a one-turn effect)
  if (to === 'graveyard' && c.zone === 'battlefield' && (s as any).dieExileTurn === s.turn && chars(s, iid).types.has('creature')) to = 'exile';
  // "If ~ would be put into a graveyard from anywhere, reveal ~ and shuffle it into its owner's library instead." (Blightsteel, Darksteel Colossus)
  let shuffleAfter = false;
  if (to === 'graveyard' && (parsedFor(s, c) as any).gyShuffle) { to = 'library'; shuffleAfter = true; log(s, `${nm(s, iid)} is shuffled into its owner's library instead.`, c.owner); }
  // "If ~ would die, put it on top of its owner's library / shuffle it into your library / return it to its owner's hand instead."
  if (to === 'graveyard' && c.zone === 'battlefield') {
    const sd = (parsedFor(s, c) as any).selfDieTo as string | undefined;
    if (sd && chars(s, iid).types.has('creature')) { if (sd === 'shuffle') { to = 'library'; shuffleAfter = true; } else to = sd as any; log(s, `${nm(s, iid)} goes ${sd === 'hand' ? "to its owner's hand" : sd === 'shuffle' ? "into its owner's library" : sd === 'libraryTop' ? "on top of its owner's library" : "on the bottom of its owner's library"} instead.`, c.owner); }
  }
  // Madness (702.35): a discarded card with madness is exiled instead, and its owner may cast it
  if (to === 'graveyard' && opts.cause === 'discard' && (parsedFor(s, c) as any).madness) {
    to = 'exile';
    const madItem: StackItem = { id: uid(s, 's'), kind: 'trigger', controller: c.owner, source: iid, label: `${nm(s, iid)} — madness`, text: 'You may cast it for its madness cost.', effects: [{ k: 'madnessCast', iid }], targets: [] };
    (madItem as any).preTargeted = true;
    s.pendingTriggers.push(madItem);
  }
  // "If a spell or ability an opponent controls causes you to discard ~, put it onto the battlefield instead" (Obstinate Baloth)
  if (to === 'graveyard' && opts.cause === 'discard' && from === 'hand' && (parsedFor(s, c) as any).oppDiscardBf && s.resolving && s.resolving.item.controller !== c.owner) {
    to = 'battlefield'; opts = { ...opts, controller: c.owner }; (c as any).oppDiscardEntered = s.turn;
    log(s, `${nm(s, iid)} is put onto the battlefield instead.`, c.owner);
  }
  const mutatedCards = from === 'battlefield' ? ((c as any).mutatedCards as string[] | undefined) : undefined;
  if (from === 'battlefield') {
    (c as any).mutatedCards = undefined;
    (c as any).mutatedDefs = undefined;
  }
  let lki: ParsedCard | null = null;
  let lkiCreature = false;
  let lkiController = c.controller;
  const lkiCounters = { ...c.counters };
  const meldPartner = from === 'battlefield' ? c.meldedWith : undefined;
  if (from === 'battlefield') {
    const ch = chars(s, iid);
    lki = ch.pc;
    lkiCreature = ch.types.has('creature');
    const batch = (s as any).leaveBatch as Map<string, any> | undefined;
    if (batch) batch.set(iid, { pc: ch.pc, controller: c.controller });
    ((s as any).lkiCache ??= {})[iid] = { power: ch.power, toughness: ch.toughness, controller: c.controller, types: [...ch.types] };
    endEffectsFrom(s, iid);
    // remove from combat
    if (s.combat) {
      s.combat.attackers = s.combat.attackers.filter((a) => a.iid !== iid);
      for (const a of s.combat.attackers) a.blockedBy = a.blockedBy.filter((b) => b !== iid);
    }
  }
  ev(s, { k: 'move', iid, from, to: to === 'libraryTop' || to === 'libraryBottom' ? 'library' : to, cause: opts.cause, replaced: wantTo !== to, token: !!c.token, owner: c.owner, ctrl: c.controller, faceDown: to === 'exile' ? !!c.faceDown : undefined });
  removeFromZone(s, iid);
  if (from === 'stack') {
    // remove the stack item that represents this spell (if countered etc.)
    s.stack = s.stack.filter((it) => !(it.kind === 'spell' && it.source === iid && !(it as any).isCopy));
  }

  // a copy of a card cast as a spell ceases to exist once it leaves the stack (rule 707.12)
  // (a permanent spell copy becomes a token on resolution)
  if ((c as any).cardCopy && to !== 'stack') {
    if (to === 'battlefield') { (c as any).cardCopy = false; c.token = true; }
    else { ((s as any).ghosts ??= {})[iid] = c; delete s.cards[iid]; return; }
  }
  // tokens cease to exist outside the battlefield
  if (c.token && from === 'battlefield' && to !== 'battlefield') {
    c.zone = to === 'libraryTop' || to === 'libraryBottom' ? 'library' : (to as any);
    const prevCause = (s as any).trigCause;
    (s as any).trigCause = to === 'graveyard' && lkiCreature ? { k: 'die', iid, types: ['creature'], controller: lkiController } : { k: 'leave', iid };
    if (lki) fireLeave(s, iid, lki, lkiCreature, lkiController, to, lkiCounters);
    emit(s, 'leave', { iid, card: c, to, lki, wasCreature: lkiCreature, controller: lkiController, opts, attached: s.battlefield.filter((o) => s.cards[o]?.attachedTo === iid) });
    (s as any).trigCause = prevCause;
    // keep last-known info for abilities still being paid for / resolving (a sacrificed Clue, Treasure…)
    ((s as any).ghosts ??= {})[iid] = c;
    delete s.cards[iid];
    detachDependents(s, iid);
    returnLinkedCards(s, c);
    return;
  }

  // reset object state (new object rule 400.7)
  if (from === 'battlefield' || to === 'battlefield') {
    c.tapped = false;
    c.counters = {};
    c.damage = 0;
    c.deathtouched = false;
    c.mods = [];
    c.attachedTo = undefined;
    c.skipUntap = false;
    c.loyaltyUsed = false;
    if (from === 'battlefield') {
      c.faceDown = false;
      c.transformed = false;
      c.face = 0;
      c.copyOf = undefined;
      c.morph = undefined;
      c.bestowed = false;
      c.unearthed = false;
      c.renowned = false;
      c.echoDue = false;
      c.escaped = false;
      c.xPaid = undefined;
      (c as any).pairedWith = undefined;
      c.kicked = false;
      c.classLevel = undefined;
      c.meldedWith = undefined;
    }
  }
  if (from === 'stack' && to !== 'battlefield') c.kicked = false;
  if (to !== 'exile' || from !== 'battlefield') {
    if (from === 'exile') { c.foretold = undefined; c.plotted = undefined; c.suspended = undefined; if (to !== 'battlefield') c.faceDown = false; }
  }
  if (from !== 'graveyard' && from !== 'exile' && from !== 'stack') c.mayPlay = undefined;
  if (from === 'graveyard' || from === 'exile') { if (to !== 'stack') c.mayPlay = undefined; }
  c.controller = opts.controller ?? (to === 'battlefield' ? c.controller : c.owner);
  if (to !== 'stack') c.revealed = false;

  const p = P(s, c.owner);
  switch (to) {
    case 'libraryTop': c.zone = 'library'; p.library.unshift(iid); break;
    case 'libraryBottom': c.zone = 'library'; p.library.push(iid); break;
    case 'library': c.zone = 'library'; p.library.unshift(iid); break;
    case 'hand': c.zone = 'hand'; p.hand.push(iid); break;
    case 'graveyard': c.zone = 'graveyard'; p.graveyard.push(iid); break;
    case 'exile': c.zone = 'exile'; p.exile.push(iid); break;
    case 'stack': c.zone = 'stack'; break;
    case 'battlefield': c.zone = 'battlefield'; break;
    case 'command': c.zone = 'command'; ((p as any).command ??= []).push(iid); break;
  }
  if (from === 'battlefield') {
    const attached = s.battlefield.filter((o) => s.cards[o]?.attachedTo === iid);
    detachDependents(s, iid);
    const prevCause = (s as any).trigCause;
    (s as any).trigCause = to === 'graveyard' && lkiCreature ? { k: 'die', iid, types: ['creature'], controller: lkiController } : { k: 'leave', iid };
    if (lki) fireLeave(s, iid, lki, lkiCreature, lkiController, to, lkiCounters);
    emit(s, 'leave', { iid, card: c, to, lki, wasCreature: lkiCreature, controller: lkiController, opts, attached });
    (s as any).trigCause = prevCause;
    returnLinkedCards(s, c);
  }
  if (to === 'battlefield') (c as any).enteredFromStack = !!(opts as any).resolved;
  if (to === 'battlefield') enterBattlefield(s, iid, opts.controller ?? c.controller, opts.tapped);
  // A mutated permanent is all of its cards: they all go to the new zone (725.3)
  for (const mc of mutatedCards ?? []) {
    const m2 = s.cards[mc];
    if (!m2) continue;
    m2.zone = 'library';
    moveCard(s, mc, to === 'battlefield' ? 'graveyard' : to);
  }
  // A melded permanent is two cards: both go to the new zone (712.4c)
  if (meldPartner && s.cards[meldPartner]?.zone === 'exile' && to !== 'exile' && to !== 'battlefield') moveCard(s, meldPartner, to);
  if (shuffleAfter) shuffleArr(s, s.players[c.owner].library);
  for (const h of EXT.hooks.afterMove) h(s, iid, from, to, opts, api);
}

/** "For as long as you control ~" effects end when ~ leaves (rule 611.2b). */
function endEffectsFrom(s: GameState, source: string) {
  for (const b of s.battlefield) {
    const o = s.cards[b];
    if (!o || b === source) continue;
    const keep: typeof o.mods = [];
    for (const m of o.mods) {
      if (m.until === 'whileSourceControlled' && m.source === source) {
        if (m.setController !== undefined) {
          o.controller = m.setController;
          o.sick = true;
        }
      } else keep.push(m);
    }
    o.mods = keep;
  }
}

/** Oblivion Ring-style "exile … until ~ leaves the battlefield". */
function returnLinkedCards(s: GameState, c: CardObj) {
  const linked = c.linked ?? [];
  c.linked = [];
  for (const l of linked) {
    const lc = s.cards[l];
    if (lc && lc.zone === 'exile') {
      log(s, `${nm(s, l)} returns to the battlefield.`, lc.owner);
      ev(s, { k: 'unlink', src: c.iid, iid: l });
      moveCard(s, l, 'battlefield', { controller: lc.owner });
    }
  }
}

/** Put counters on a permanent, applying replacement effects (Hardened Scales, Doubling Season) and Saga chapters. */
export function addCounters(s: GameState, iid: string, counter: string, n: number, raw = false) {
  const c = s.cards[iid];
  if (!c || n <= 0) return;
  const nBase = n;
  if (!raw && c.zone === 'battlefield') {
    for (const b of s.battlefield) {
      const o = s.cards[b];
      for (const r of baseChars(s, b).pc.replacements) {
        if (r.k === 'counterPlus' && counter === '+1/+1' && matchesFilter(s, iid, r.filter, o.controller, undefined, true)) n += 1;
      }
    }
    for (const b of s.battlefield) {
      const o = s.cards[b];
      for (const r of baseChars(s, b).pc.replacements) {
        if (r.k === 'counterDouble' && (!r.plusOnly || counter === '+1/+1') && matchesFilter(s, iid, r.filter, o.controller, undefined, true)) n *= 2;
      }
    }
  }
  const before = c.counters[counter] ?? 0;
  c.counters[counter] = before + n;
  ev(s, { k: 'counter', iid, counter, n, base: nBase, total: before + n });
  emit(s, 'counters', { iid, counter, n });
  if (counter === 'lore' && c.zone === 'battlefield') {
    const pc = chars(s, iid).pc;
    for (const ch of pc.chapters ?? []) {
      if (ch.n.some((k) => k > before && k <= before + n)) {
        queueTrigger(s, iid, c.controller, { event: 'etb', ability: ch.ability, text: ch.text }, { noDouble: true });
        s.pendingTriggers[s.pendingTriggers.length - 1].label = `${nm(s, iid)} — chapter ${ch.n.join(', ')}`;
        (s.pendingTriggers[s.pendingTriggers.length - 1] as any).chapter = true;
      }
    }
  }
}

/** Transform a double-faced permanent (rule 712). */
export function transformCard(s: GameState, iid: string, silent = false) {
  (s as any).bfVer = ((s as any).bfVer ?? 0) + 1;
  const c = s.cards[iid];
  const def = s.defs[c?.defId];
  if (!c || !def?.faces || def.faces.length < 2 || !['transform', 'meld'].includes(def.layout)) return false;
  const was = nm(s, iid);
  c.face = c.face ? 0 : 1;
  c.transformed = !!c.face;
  if (!silent) log(s, `${was} transforms into ${nm(s, iid)}.`, c.controller);
  ev(s, { k: 'transform', iid });
  for (const t of chars(s, iid).pc.triggers) if (t.event === 'transformed') queueTrigger(s, iid, c.controller, t, {});
  return true;
}

/** Day and night (rule 726). */
function setDayNight(s: GameState, v: 'day' | 'night') {
  if (s.dayNight === v) return;
  const was = s.dayNight;
  s.dayNight = v;
  log(s, `It becomes ${v}.`, undefined, 'turn');
  if (was) emit(s, 'dayNight', { v });
  ev(s, { k: 'dayNight', v });
  for (const b of s.battlefield) {
    const c = s.cards[b];
    const def = s.defs[c.defId];
    if (!def.faces || def.layout !== 'transform') continue;
    const kw = parseCard(def, def.faces[0]).keywords;
    if (!kw.includes('daybound')) continue;
    const want = v === 'night' ? 1 : 0;
    if (c.face !== want) transformCard(s, b);
  }
}

function detachDependents(s: GameState, iid: string) {
  for (const o of s.battlefield) {
    const oc = s.cards[o];
    if (oc?.attachedTo === iid) {
      // equipment stays, auras go to graveyard via SBA
      const t = baseChars(s, o).subtypes;
      if (!t.has('aura')) oc.attachedTo = undefined;
    }
  }
}

function fireLeave(s: GameState, iid: string, lki: ParsedCard, wasCreature: boolean, controller: PlayerIdx, to: MoveTo, lkiCounters: Record<string, number> = {}) {
  for (const t of lki.triggers) {
    if (t.event === 'ltb' || (t.event === 'dies' && to === 'graveyard' && wasCreature)) queueTrigger(s, iid, controller, t, { lki: true, lkiCounters });
  }
  if (to === 'graveyard' && wasCreature) {
    // permanents on the battlefield, plus ones leaving at the same time (they "look back in time", 603.10a)
    const batch = (s as any).leaveBatch as Map<string, any> | undefined;
    const watchers: [string, ParsedCard, PlayerIdx][] = observers(s).map((oid) => [oid, baseChars(s, oid).pc, s.cards[oid].controller]);
    for (const [oid, b] of batch ?? []) if (oid !== iid && s.cards[oid] && s.cards[oid].zone !== 'battlefield') watchers.push([oid, b.pc, b.controller]);
    for (const [oid, pc, octrl] of watchers) {
      const o = { controller: octrl };
      for (const t of pc.triggers) {
        if (t.event !== 'otherDies') continue;
        const f = { ...(t.filter ?? {}), zone: undefined } as Filter;
        // evaluate on last-known info: types from lki
        const okType = !f.types || f.types.some((ty) => ty === 'creature' || ty === 'permanent');
        const okCtrl = !f.controller || (f.controller === 'you' ? controller === o.controller : controller !== o.controller);
        if (okType && okCtrl && !(f.other && oid === iid)) queueTrigger(s, oid, o.controller, t, { triggerObj: iid, triggerPlayer: controller });
      }
    }
  }
}

function enterBattlefield(s: GameState, iid: string, controller: PlayerIdx, tapped?: boolean) {
  const c = s.cards[iid];
  c.zone = 'battlefield';
  c.controller = controller;
  c.sick = true;
  c.ts = s.ts++;
  (c as any).enteredTurn = s.turn;
  (c as any).remembered = [];
  if (!s.battlefield.includes(iid)) s.battlefield.push(iid);
  (s as any).bfVer = ((s as any).bfVer ?? 0) + 1;
  // daybound permanents enter on the side matching day/night
  const def0 = s.defs[c.defId];
  if (def0?.faces && def0.layout === 'transform' && parseCard(def0, def0.faces[0]).keywords.includes('daybound') && !c.faceDown) {
    if (!s.dayNight) setDayNight(s, 'day');
    c.face = s.dayNight === 'night' ? 1 : 0;
  }
  const ch = baseChars(s, iid);
  const pc = ch.pc;
  if (tapped) c.tapped = true;
  if ((pc as any).entersTappedIf && evalCond(s, (pc as any).entersTappedIf, controller, iid)) c.tapped = true;
  if (pc.entersTapped === true) c.tapped = true;
  else if (typeof pc.entersTapped === 'string') {
    if (!checkUnless(s, controller, pc.entersTapped, iid)) c.tapped = true;
  }
  for (const b of s.battlefield) {
    const o = s.cards[b];
    if (b === iid || o.controller === controller) continue;
    for (const r of baseChars(s, b).pc.replacements) if (r.k === 'oppEnterTapped' && matchesFilter(s, iid, { ...r.filter, zone: 'battlefield' }, o.controller, undefined, true)) c.tapped = true;
  }
  for (const ec of pc.entersCounters ?? []) if ((!ec.kickedOnly || c.kicked) && (!(ec as any).cond || evalCond(s, (ec as any).cond, controller, iid))) addCounters(s, iid, ec.counter, (ec as any).amt ? Math.max(0, evalAmt(s, (ec as any).amt, controller, iid, { x: c.xPaid ?? 0 })) * ((ec as any).mult ?? 1) : (ec as any).perColorSpent ? ((c as any).colorsSpent?.length ?? 0) : ec.n < 0 ? (c.xPaid ?? 0) * ((ec as any).mult ?? 1) : ec.n);
  if (c.escaped && pc.escapeCounters) addCounters(s, iid, pc.escapeCounters.counter, pc.escapeCounters.n);
  if (pc.echo) c.echoDue = true;
  if (pc.chapters?.length && !(pc as any).readAhead) addCounters(s, iid, 'lore', 1); // read ahead: chosen by its own trigger
  if (ch.types.has('planeswalker')) {
    const face = currentFace(s, c);
    c.counters.loyalty = parseInt(face.loyalty ?? '0', 10) || 0;
  }
  if (ch.types.has('battle')) {
    const face = currentFace(s, c);
    c.counters.defense = parseInt(face.defense ?? '0', 10) || 0;
  }
  // ETB triggers (scoped so trigger doublers / Torpor Orb know these were caused by entering)
  const prevCause = (s as any).trigCause;
  (s as any).trigCause = { k: 'enter', iid, types: [...ch.types], controller };
  for (const t of pc.triggers) if (t.event === 'etb') queueTrigger(s, iid, controller, t, {});
  for (const oid of observers(s)) {
    if (oid === iid) continue;
    const o = s.cards[oid];
    const opc = baseChars(s, oid).pc;
    for (const t of opc.triggers) {
      if (t.event === 'otherEtb' && t.filter && matchesFilter(s, iid, t.filter, o.controller, oid)) queueTrigger(s, oid, o.controller, t, { triggerObj: iid, triggerPlayer: controller });
      if (t.event === 'landfall' && ch.types.has('land') && controller === o.controller) queueTrigger(s, oid, o.controller, t, { triggerObj: iid });
    }
  }
  // self landfall
  if (ch.types.has('land')) for (const t of pc.triggers) if (t.event === 'landfall') queueTrigger(s, iid, controller, t, {});
  (s as any).trigCause = prevCause;
}

function checkUnless(s: GameState, p: PlayerIdx, cond: string, self: string): boolean {
  let m = cond.match(/^you control (?:a|an) (\w+)(?: or (?:a|an) (\w+))?$/);
  if (m) {
    const subs = [m[1], m[2]].filter(Boolean);
    return s.battlefield.some((i) => i !== self && s.cards[i].controller === p && subs.some((x) => baseChars(s, i).subtypes.has(x!) || baseChars(s, i).types.has(x!)));
  }
  m = cond.match(/^you control (two|three) or (?:more|fewer) other lands$/);
  if (m) {
    const n = s.battlefield.filter((i) => i !== self && s.cards[i].controller === p && baseChars(s, i).types.has('land')).length;
    const k = m[1] === 'two' ? 2 : 3;
    return cond.includes('more') ? n >= k : n <= k;
  }
  if (/^you control two or more opponents$/.test(cond)) return false;
  if (/^a player has 13 or less life$/.test(cond)) return s.players.some((pl) => pl.life <= 13);
  const pcnd = parseCond(cond);
  if (pcnd) return evalCond(s, pcnd, p, self);
  return true;
}

export function drawCards(s: GameState, p: PlayerIdx, n: number, silent = false) {
  const pl = P(s, p);
  let drawn = 0;
  for (let i = 0; i < n; i++) {
    if (EXT.hooks.draw.some((h) => h(s, p, api) === 'skip')) continue;
    const top = pl.library[0];
    if (!top) {
      pl.drewFromEmpty = true;
      break;
    }
    moveCard(s, top, 'hand');
    drawn++;
    emit(s, 'draw', { p, iid: top });
    if (!silent) fireSimple(s, 'drawCard', p);
  }
  if (!silent && drawn) log(s, `${pl.name} draws ${drawn === 1 ? 'a card' : drawn + ' cards'}.`, p);
}

// ============================================================================================
// Triggers
// ============================================================================================

function triggerCondOk(s: GameState, cond: Cond, you: PlayerIdx, source: string, extra: { triggerObj?: string; triggerPlayer?: PlayerIdx; lkiCounters?: Record<string, number> }): boolean {
  if (cond.k === 'evolve') {
    const o = extra.triggerObj;
    if (!o || !s.cards[o] || !s.cards[source]) return false;
    const a = chars(s, o);
    const me = chars(s, source);
    return a.power > me.power || a.toughness > me.toughness;
  }
  if (cond.k === 'trainingPartner') {
    const me = s.cards[source] ? chars(s, source).power : 0;
    return !!s.combat?.attackers.some((x) => x.iid !== source && s.cards[x.iid] && chars(s, x.iid).power > me);
  }
  return evalCond(s, cond, you, source, { lkiCounters: extra.lkiCounters, triggerObj: extra.triggerObj, triggerPlayer: extra.triggerPlayer } as any);
}

function queueTrigger(s: GameState, source: string, controller: PlayerIdx, t: Trigger, extra: { triggerObj?: string; triggerPlayer?: PlayerIdx; lki?: boolean; lkiCounters?: Record<string, number>; amount?: number; noDouble?: boolean }) {
  // a graveyard card only triggers with its graveyard abilities (its "dies"/"leaves" triggers come with lki)
  if (s.cards[source]?.zone === 'graveyard' && (t as any).fromGy === false && !extra.lki) return;
  if ((t as any).fromGy === true && s.cards[source]?.zone !== 'graveyard') return;
  // eminence: only abilities that say "if ~ is in the command zone or on the battlefield" work from the command zone
  if (s.cards[source]?.zone === 'command' && !(s.cards[source] as any).emblem && (t.cond as any)?.name !== 'cmdOrBf') return;
  const cause = extra.noDouble ? null : causeFor(s, t);
  if (cause && triggerSuppressed(s, cause, controller)) return;
  // "This ability triggers only once each turn." (603.2h)
  if (/triggers only once each turn/.test(t.text ?? '') || /triggers only once each turn/.test(t.ability?.text ?? '')) {
    const used = ((s as any).oncePerTurn ??= {});
    const k = `${source}:${t.text}`;
    if (used[k] === s.turn) return;
    used[k] = s.turn;
  }

  const ab = t.ability;
  if (t.cond && !triggerCondOk(s, t.cond, controller, source, extra)) return;
  const item: StackItem = {
    id: uid(s, 's'),
    kind: 'trigger',
    controller,
    source,
    label: s.cards[source] ? nm(s, source) : 'Trigger',
    text: t.text,
    effects: clone(ab.effects),
    targets: [],
    manual: ab.manual.length ? [...ab.manual] : undefined,
  };
  (item as any).specs = clone(ab.specs);
  (item as any).modes = ab.modes ? clone(ab.modes) : undefined;
  (item as any).triggerObj = extra.triggerObj;
  (item as any).triggerPlayer = extra.triggerPlayer;
  (item as any).lkiCounters = extra.lkiCounters;
  (item as any).cond = t.cond;
  if (extra.amount !== undefined) (item as any).evAmount = extra.amount;
  if ((extra as any).refs) (item as any).lastTokens = [...(extra as any).refs];
  s.pendingTriggers.push(item);
  // Panharmonicon / Yarok / Teysa / Isshin: the ability triggers an additional time per doubler (rule 603.2d).
  const extraTimes = (cause ? triggerExtraTimes(s, cause, controller) : 0) + (extra.noDouble ? 0 : EXT.hooks.trigExtra.reduce((a, h) => a + (h(s, source, controller, api) ?? 0), 0));
  for (let i = 0; i < extraTimes; i++) s.pendingTriggers.push({ ...clone(item), id: uid(s, 's') });
  if (extraTimes) ((s as any).stats ??= {}).extraTriggers = ((s as any).stats.extraTriggers ?? 0) + extraTimes;
}

/** Which event (if any) is causing triggers right now, restricted to trigger events that event can cause. */
const CAUSE_EVENTS: Record<string, RegExp> = {
  enter: /^(etb|otherEtb|landfall)$/,
  die: /^(dies|otherDies|attachDies|damagedDies|toGraveyard|ltb|ctrlLeaves)$/,
  attack: /^(attacks|attacksOrBlocks|selfAttacks|ctrlAttacks|youAttack|anyAttacks|attackedYou|attachAttacks)$/,
};
function causeFor(s: GameState, t: Trigger): { k: string; iid: string; types: string[]; controller: PlayerIdx } | null {
  const c = (s as any).trigCause;
  if (!c || !CAUSE_EVENTS[c.k] || !CAUSE_EVENTS[c.k].test(t.event as string)) return null;
  return c;
}
function causeTypesOk(cause: { types: string[] }, types?: string[]) {
  return !types || types.some((ty) => ty === 'permanent' || cause.types.includes(ty));
}
/** Torpor Orb, Hushbringer, Elesh Norn (opponents' permanents). */
function triggerSuppressed(s: GameState, cause: { k: string; types: string[] }, controller: PlayerIdx): boolean {
  for (const b of s.battlefield) {
    for (const r of baseChars(s, b).pc.replacements as any[]) {
      if (r.k !== 'trigStop' || !r.causes.includes(cause.k) || !causeTypesOk(cause, r.types)) continue;
      if (!r.oppOnly || s.cards[b].controller !== controller) return true;
    }
  }
  return false;
}
function triggerExtraTimes(s: GameState, cause: { k: string; types: string[] }, controller: PlayerIdx): number {
  let n = 0;
  for (const b of s.battlefield) {
    if (s.cards[b].controller !== controller) continue;
    for (const r of baseChars(s, b).pc.replacements as any[]) if (r.k === 'trigDouble' && r.cause === cause.k && causeTypesOk(cause, r.types)) n++;
  }
  return n;
}

/** Broadcast a game event to plugins (EXT.hooks.event). */
export function emit(s: GameState, name: string, data: Record<string, any>) {
  for (const h of EXT.hooks.event) h(s, name, data, api);
}

function fireSimple(s: GameState, ev: TriggerEvent, player: PlayerIdx, extra: { amount?: number } = {}) {
  for (const oid of observers(s)) {
    const o = s.cards[oid];
    if (o.controller !== player) continue;
    for (const t of baseChars(s, oid).pc.triggers) if (t.event === ev) queueTrigger(s, oid, o.controller, t, { ...extra });
  }
}

function fireStepTriggers(s: GameState, step: Step) {
  const map: Partial<Record<Step, [TriggerEvent, TriggerEvent?, TriggerEvent?]>> = {
    upkeep: ['upkeep', 'eachUpkeep', 'oppUpkeep'],
    end: ['endStep', 'eachEndStep'],
    main1: ['mainPhase'],
    main2: ['main2Phase' as TriggerEvent],
    beginCombat: ['beginCombat'],
    draw: ['drawStep'],
  };
  const evs = map[step];
  if (!evs) return;
  for (const oid of [...observers(s)]) {
    const o = s.cards[oid];
    if (!o) continue;
    for (const t of baseChars(s, oid).pc.triggers) {
      const tp = { triggerPlayer: s.active };
      if (t.event === evs[0] && o.controller === s.active) queueTrigger(s, oid, o.controller, t, tp);
      else if (evs[1] && t.event === evs[1] && (evs[1] !== 'oppUpkeep')) queueTrigger(s, oid, o.controller, t, tp);
      else if (t.event === 'oppUpkeep' && step === 'upkeep' && o.controller !== s.active) queueTrigger(s, oid, o.controller, t, tp);
      else if ((t.event as string) === 'oppBeginCombat' && step === 'beginCombat' && o.controller !== s.active) queueTrigger(s, oid, o.controller, t, tp);
      else if ((t.event as string) === 'eachBeginCombat' && step === 'beginCombat') queueTrigger(s, oid, o.controller, t, tp);
    }
  }
}

function fireCast(s: GameState, item: StackItem) {
  const caster = item.controller;
  const ch = chars(s, item.source);
  if (ch.keywords.has('cascade')) {
    s.pendingTriggers.push({ id: uid(s, 's'), kind: 'trigger', controller: caster, source: item.source, label: `${ch.name} — cascade`, text: 'Cascade', effects: [{ k: 'cascade' }], targets: [] });
  }
  const noncreature = !ch.types.has('creature');
  for (const oid of observers(s)) {
    const o = s.cards[oid];
    const c = chars(s, oid);
    for (const t of c.pc.triggers) {
      if (t.event === 'castSpell' && o.controller === caster && (!t.filter || stackItemMatches(s, item, t.filter, caster, oid))) queueTrigger(s, oid, o.controller, t, { triggerObj: item.source });
      if (t.event === 'oppCastSpell' && o.controller !== caster && (!t.filter || stackItemMatches(s, item, t.filter, o.controller, oid))) queueTrigger(s, oid, o.controller, t, { triggerObj: item.source, triggerPlayer: caster });
    }
    if (noncreature && o.controller === caster && c.keywords.has('prowess')) {
      queueTrigger(s, oid, caster, {
        event: 'castSpell', text: 'Prowess', ability: { text: '~ gets +1/+1 until end of turn', effects: [{ k: 'pump', what: { t: 'self' }, p: 1, t: 1, kw: [], eot: true }], specs: [], manual: [] },
      }, {});
    }
  }
  emit(s, 'cast', { item });
}

/** Put pending triggers on the stack in APNAP order, asking for targets where needed. */
/** Triggers in one step with no player action before the game is declared a draw. */
export const LOOP_LIMIT = 2000;

function flushTriggers(s: GameState): boolean {
  if (!s.pendingTriggers.length || s.pendingCast || s.prompt) return false;
  // APNAP: active player's first (they end up lower on the stack)
  const order = [...s.pendingTriggers].sort((a, b) => (a.controller === s.active ? 0 : 1) - (b.controller === s.active ? 0 : 1));
  // 104.4b: a loop of mandatory actions nobody can stop ends the game in a draw.
  const guard = ((s as any).loopGuard ??= { n: 0, key: '' });
  const key = `${s.turn}:${s.step}`;
  if (guard.key !== key) { guard.key = key; guard.n = 0; }
  if (++guard.n > LOOP_LIMIT) {
    log(s, 'The game is a draw: an endless loop of mandatory triggers (rule 104.4b).', s.active, 'turn');
    s.over = true;
    s.winner = null;
    s.pendingTriggers = [];
    s.prompt = null;
    s.promptQueue = [];
    return false;
  }
  const item = order[0];
  s.pendingTriggers.splice(s.pendingTriggers.indexOf(item), 1);
  const specs: TargetSpec[] = (item as any).specs ?? [];
  const modes = (item as any).modes;
  s.pendingCast = { kind: 'trigger', player: item.controller, item, specs, targets: [], specIdx: 0, stage: modes ? 'mode' : 'targets', ability: { effects: item.effects, specs, modes, text: item.text, manual: item.manual ?? [] } };
  advanceCast(s);
  return true;
}

// ============================================================================================
// Mana
// ============================================================================================

export function manaAbilities(s: GameState, iid: string): { idx: number; a: Activated }[] {
  const c = chars(s, iid);
  return c.pc.activated.map((a, idx) => ({ a, idx })).filter((x) => x.a.isMana);
}

function canPayActCostBasics(s: GameState, p: PlayerIdx, iid: string, a: Activated): boolean {
  const c = s.cards[iid];
  if (a.zone === 'battlefield') {
    if (c.zone !== 'battlefield' || (c.controller !== p && !(a as any).anyPlayer)) return false;
    if ((a as any).onlyUpkeep && s.step !== 'upkeep') return false;
    const ch = chars(s, iid);
    if (a.cost.tap || a.cost.untap) {
      if (a.cost.tap && c.tapped) return false;
      if (a.cost.untap && !c.tapped) return false;
      if (ch.types.has('creature') && c.sick && !ch.keywords.has('haste')) return false;
    }
  } else if (a.zone === 'hand') {
    if (c.zone !== 'hand' || c.owner !== p) return false;
  } else if (a.zone === 'graveyard') {
    if (c.zone !== 'graveyard' || c.owner !== p) return false;
  }
  if (a.cost.life && P(s, p).life < a.cost.life) return false;
  if (a.cost.energy && (P(s, p).counters.energy ?? 0) < a.cost.energy) return false;
  if (a.special === 'foretell' && s.active !== p) return false;
  if (a.special === 'level' && (c.classLevel ?? 1) !== (a.level ?? 2) - 1) return false;
  if (a.level && a.special !== 'level' && (c.classLevel ?? 1) < a.level) return false;
  if ((a as any).gate && !gateOk(s, c, (a as any).gate)) return false;
  if (a.special === 'craft' && a.craft) {
    const n = craftMaterials(s, p, iid, a.craft.filter).length;
    if (n < a.craft.min) return false;
  }
  if (a.cost.removeCounters && (c.counters[a.cost.removeCounters.counter] ?? 0) < a.cost.removeCounters.n) return false;
  if (a.cost.discard && P(s, p).hand.filter((h) => h !== iid).length < a.cost.discard) return false;
  if (a.cost.sacrifice && s.battlefield.filter((b) => matchesFilter(s, b, a.cost.sacrifice!.filter, p, iid)).length < a.cost.sacrifice.n) return false;
  if (a.special === 'loyalty') {
    if (c.loyaltyUsed) return false;
    const l = a.cost.loyalty;
    if (typeof l === 'number' && l < 0 && (c.counters.loyalty ?? 0) < -l) return false;
  }
  for (const h of EXT.hooks.canActivate) if (h(s, p, iid, a, api) === false) return false;
  return true;
}

/** Sources the auto-payer may tap: untapped permanents with a simple {T}: Add mana ability. */
/** "Spend this mana only to cast a creature spell": does the spell being paid for qualify? */
function restrictOk(s: GameState, r: { spell?: any; ability?: any } | undefined): boolean {
  if (!r) return true;
  const iid = (s as any).payingFor as string | undefined;
  const c = iid ? s.cards[iid] : undefined;
  if (!c) return false;
  const f = (s as any).payingKind === 'ability' ? r.ability : r.spell;
  if (!f) return false;
  return matchesFilter(s, iid!, { ...f, zone: c.zone }, c.controller);
}
/** "… of the chosen type": the restriction is fixed to the mana source's chosen type as the mana is made. */
function bakeRestrict(r: any, src: any): any {
  if (!r) return r;
  const fix = (f: any): any => {
    if (!f) return f;
    if (f.anyOf) return { ...f, anyOf: f.anyOf.map(fix) };
    if (!f.chosenType) return f;
    const { chosenType: _c, ...rest } = f;
    return { ...rest, subtypes: [src?.chosenType ?? '__none__'] };
  };
  return { ...r, spell: fix(r.spell), ability: fix(r.ability) };
}
/** The normal pool plus any restricted mana the current payment may use. */
function payPool(s: GameState, p: PlayerIdx): ManaPool {
  const pool = { ...P(s, p).pool };
  for (const r of ((P(s, p) as any).rpool ?? []) as { col: Color; kind: any }[]) if (restrictOk(s, r.kind)) pool[r.col]++;
  return pool;
}
/** Run fn while paying for (or checking the cost of) this spell, so restricted mana can be counted. */
function payingFor<T>(s: GameState, iid: string | undefined, fn: () => T, kind: 'spell' | 'ability' = 'spell'): T {
  const prev = (s as any).payingFor;
  const prevK = (s as any).payingKind;
  (s as any).payingFor = iid;
  (s as any).payingKind = kind;
  try { return fn(); } finally { (s as any).payingFor = prev; (s as any).payingKind = prevK; }
}

export function autoSources(s: GameState, p: PlayerIdx, exclude?: string): ManaSource[] {
  const out: ManaSource[] = [];
  for (const iid of s.battlefield) {
    if (iid === exclude) continue;
    const c = s.cards[iid];
    if (c.controller !== p || c.tapped || c.phasedOut) continue;
    const ch = chars(s, iid);
    for (const { a, idx } of manaAbilities(s, iid)) {
      if (!a.cost.tap || a.cost.mana || a.cost.sacSelf || a.cost.sacrifice || a.cost.discard || a.cost.other || a.cost.removeCounters || (a.cost as any).extra) continue;
      if (!canPayActCostBasics(s, p, iid, a)) continue;
      const prod = effProduces(s, p, iid, a);
      if (!prod.length) continue;
      if ((a.ability as any)?.restrict && !restrictOk(s, bakeRestrict((a.ability as any).restrict, c))) continue;
      const isLand = ch.types.has('land');
      out.push({ iid, ability: idx, produces: prod, lifeCost: a.cost.life, priority: (isLand ? 0 : 5) + (prod[0].length > 1 ? 1 : 0) + (a.cost.life ? 3 : 0) });
      break; // one mana ability per permanent for autopay
    }
  }
  // Convoke / improvise / delve (702.51, 702.126, 702.66): while paying for such a spell, creatures, artifacts or
  // graveyard cards can stand in for mana. They're used last.
  const paying = (s as any).payingFor as string | undefined;
  if (paying && (s as any).payingKind !== 'ability' && s.cards[paying] && s.cards[paying].controller === p) {
    const kw = chars(s, paying).keywords;
    const used = new Set(out.map((o) => o.iid));
    if (kw.has('convoke') || kw.has('improvise')) {
      for (const iid of s.battlefield) {
        const c = s.cards[iid];
        if (iid === exclude || iid === paying || used.has(iid) || c.controller !== p || c.tapped || c.phasedOut) continue;
        const ch = chars(s, iid);
        if (kw.has('convoke') && ch.types.has('creature')) { out.push({ iid, ability: -1, produces: [ch.colors.length ? [...ch.colors] as Color[] : ['C']], priority: 20 }); used.add(iid); }
        else if (kw.has('improvise') && ch.types.has('artifact')) { out.push({ iid, ability: -1, produces: [['C']], priority: 19 }); used.add(iid); }
      }
    }
    if (kw.has('delve')) for (const g of P(s, p).graveyard) if (g !== paying) out.push({ iid: g, ability: -3, produces: [['C']], priority: 18 });
  }
  return out;
}

function availableMana(s: GameState, p: PlayerIdx): number {
  return poolTotal(P(s, p).pool) + autoSources(s, p).reduce((a, x) => a + x.produces.length, 0);
}

function applyManaAbilitySideEffects(s: GameState, p: PlayerIdx, iid: string, a: Activated) {
  for (const e of a.ability.effects) {
    if (e.k === 'damage') {
      const n = typeof e.n === 'number' ? e.n : 1;
      for (const to of e.to) if (to.t === 'you') damagePlayer(s, iid, p, n, false);
    }
    if (e.k === 'lose' && e.who.t === 'you') loseLife(s, p, typeof e.n === 'number' ? e.n : 1);
  }
}

/** "… and that spell can't be countered" (Cavern of Souls): mark the spell being paid for. */
function markUncounter(s: GameState) {
  const iid = (s as any).payingFor as string | undefined;
  if (iid && (s as any).payingKind !== 'ability' && s.cards[iid]) (s.cards[iid] as any).uncounterable = true;
}
/** Pay a mana cost, auto-tapping lands like Arena. Returns an error string on failure (state unchanged). */
export function payMana(s: GameState, p: PlayerIdx, costStr: string, x: number, exclude?: string): string | null {
  const cost = parseCost(costStr);
  const pl = P(s, p);
  const plan = planPayment(cost, x, payPool(s, p), autoSources(s, p, exclude), pl.life);
  if (!plan.ok) return plan.error ?? 'Cannot pay';
  // spend restricted mana first (it's the least flexible), then the normal pool
  const rpool = ((pl as any).rpool ?? []) as { col: Color; kind: any }[];
  for (const col of Object.keys(plan.fromPool) as Color[]) {
    let need = plan.fromPool[col];
    for (let i = rpool.length - 1; i >= 0 && need > 0; i--) if (rpool[i].col === col && restrictOk(s, rpool[i].kind)) { if (rpool[i].kind?.uncounter) markUncounter(s); rpool.splice(i, 1); need--; }
    pl.pool[col] -= need;
  }
  let treasureMana = 0;
  for (const t of plan.tapSources) if (t.ability >= 0 && s.cards[t.iid] && chars(s, t.iid).subtypes.has('treasure')) treasureMana += t.colors.length;
  for (const t of plan.tapSources) {
    const c = s.cards[t.iid];
    if (t.ability === -3) { moveCard(s, t.iid, 'exile'); continue; } // delve
    if (t.ability >= 0 && c && ((manaAbilities(s, t.iid).find((x) => x.idx === t.ability)?.a.ability as any)?.restrict?.uncounter)) markUncounter(s);
    c.tapped = true;
    if (t.ability < 0) continue; // convoke / improvise
    const a = chars(s, t.iid).pc.activated[t.ability];
    if (a) applyManaAbilitySideEffects(s, p, t.iid, a);
    if (a?.cost.tap) for (const h of EXT.hooks.manaTapped) h(s, p, t.iid, [...t.colors], api);
  }
  for (const col of Object.keys(plan.leftover) as Color[]) pl.pool[col] += plan.leftover[col];
  if (plan.lifePaid) loseLife(s, p, plan.lifePaid);
  if (plan.lifePaid) (s as any).lastPaidLife = ((s as any).lastPaidLife ?? 0) + plan.lifePaid;
  // colors actually spent (converge / "for each color of mana spent"): pool + tapped sources − leftover
  const spent: Record<string, number> = {};
  for (const col of Object.keys(plan.fromPool) as Color[]) spent[col] = (spent[col] ?? 0) + plan.fromPool[col];
  for (const t of plan.tapSources) for (const col of t.colors) spent[col] = (spent[col] ?? 0) + 1;
  for (const col of Object.keys(plan.leftover) as Color[]) spent[col] = (spent[col] ?? 0) - plan.leftover[col];
  (s as any).lastPaidColors = (['W', 'U', 'B', 'R', 'G'] as Color[]).filter((c) => (spent[c] ?? 0) > 0);
  {
    // "expend N": the total mana a player has spent this turn
    const tot = Object.values(spent).reduce((a: number, b: any) => a + Math.max(0, b), 0);
    const ms: any = ((pl as any).manaSpentTurn ??= { turn: -1, n: 0 });
    if (ms.turn !== s.turn) { ms.turn = s.turn; ms.n = 0; }
    const before = ms.n;
    ms.n += tot;
    if (tot > 0) emit(s, 'manaSpent', { p, before, after: ms.n });
  }
  const lc = ((s as any).lastPaidCounts ??= {});
  for (const c of ['W', 'U', 'B', 'R', 'G', 'C']) if ((spent[c] ?? 0) > 0) lc[c] = (lc[c] ?? 0) + spent[c];
  (s as any).lastPaidTreasure = ((s as any).lastPaidTreasure ?? 0) + treasureMana;
  return null;
}

/** canAfford for a specific spell (counts mana that may only be spent on it). */
export function canAffordSpell(s: GameState, p: PlayerIdx, iid: string, costStr: string): boolean {
  return payingFor(s, iid, () => canAfford(s, p, costStr));
}

export function canAfford(s: GameState, p: PlayerIdx, costStr: string, x = 0, exclude?: string): boolean {
  const pl = P(s, p);
  return planPayment(parseCost(costStr), x, payPool(s, p), autoSources(s, p, exclude), pl.life).ok;
}

/** A mana ability's options right now: "any color in your commander's color identity" narrows to the identity
 *  (CR 903.4f: no commander → no mana); a chosen color narrows to that color. */
export function effProduces(s: GameState, p: PlayerIdx, iid: string, a: any): Color[][] {
  const base: Color[][] = a.produces ?? [];
  if ((a.ability as any)?.identity) {
    const ids = new Set<Color>();
    for (const c of Object.values(s.cards)) if ((c as any).isCommander && c.owner === p) for (const col of (s.defs[c.defId] as any).colorIdentity ?? []) ids.add(col as Color);
    const cols = (['W', 'U', 'B', 'R', 'G'] as Color[]).filter((c) => ids.has(c));
    return cols.length ? base.map(() => cols) : [];
  }
  const dyn = (a.ability as any)?.dyn as string | undefined;
  if (dyn) {
    const cols = new Set<Color>();
    if (dyn === 'oppLands') {
      // Fellwar Stone: the colors an opponent's lands could produce
      for (const b of s.battlefield) {
        if (s.cards[b].controller === p || !chars(s, b).types.has('land')) continue;
        for (const x of chars(s, b).pc.activated) if (x.isMana) for (const o of x.produces ?? []) for (const c of o) if (c !== 'C') cols.add(c);
      }
    } else if (dyn === 'myLands') {
      // Reflecting Pool: any type your other lands could produce (a land of this kind adds nothing new)
      for (const b of s.battlefield) {
        if (b === iid || s.cards[b].controller !== p || !chars(s, b).types.has('land')) continue;
        for (const x of chars(s, b).pc.activated) if (x.isMana && !(x.ability as any)?.dyn) for (const o of x.produces ?? []) for (const c of o) cols.add(c);
      }
      const all = (['W', 'U', 'B', 'R', 'G', 'C'] as Color[]).filter((c) => cols.has(c));
      return all.length ? base.map(() => all) : [];
    } else if (dyn === 'exiledColors') {
      // Chrome Mox: the imprinted card's colors
      const src = s.cards[iid] as any;
      for (const x of [...(src?.linked ?? []), ...(src?.remembered ?? [])]) if (s.cards[x]?.zone === 'exile') for (const c of (s.defs[s.cards[x].defId].colors ?? []) as Color[]) cols.add(c);
    }
    const list = (['W', 'U', 'B', 'R', 'G'] as Color[]).filter((c) => cols.has(c));
    return list.length ? base.map(() => list) : [];
  }
  const ch = (a.ability as any)?.chosenColor ? ((s.cards[iid] as any)?.chosenColor as Color | undefined) : undefined;
  return ch && !(a.ability as any)?.chosenColorOr ? base.map(() => [ch]) : base;
}

function activateManaAbility(s: GameState, p: PlayerIdx, iid: string, idx: number, color?: Color | Color[], sac?: string[], nRemove?: number): string | null {
  const a = chars(s, iid).pc.activated[idx];
  if (!a?.isMana) return 'Not a mana ability';
  if (!canPayActCostBasics(s, p, iid, a)) return "Can't activate that now";
  if (a.cost.mana && !canAfford(s, p, a.cost.mana, 0, iid)) return 'Not enough mana';
  // "Sacrifice a creature: Add {C}{C}." (Ashnod's Altar): choose what to sacrifice first
  if (a.cost.sacrifice && !sac) {
    const cands = s.battlefield.filter((b) => matchesFilter(s, b, a.cost.sacrifice!.filter, p, iid));
    if (cands.length < a.cost.sacrifice.n) return 'Nothing to sacrifice';
    pushPrompt(s, { id: uid(s, 'p'), player: p, kind: 'chooseCards', title: `Sacrifice ${a.cost.sacrifice.n} (cost)`, cards: cands, min: a.cost.sacrifice.n, max: a.cost.sacrifice.n, canCancel: true, data: { ctx: 'manaSac', iid, idx, color, cost: 'sac' } });
    return null;
  }
  const rc = a.cost.removeCounters as any;
  if (rc?.any && nRemove === undefined) {
    // "Remove any number of storage counters from ~: Add {B} for each storage counter removed this way."
    pushPrompt(s, { id: uid(s, 'p'), player: p, kind: 'x', title: `Remove how many ${rc.counter} counters? (${nm(s, iid)})`, min: 0, max: s.cards[iid].counters[rc.counter] ?? 0, canCancel: true, data: { ctx: 'manaCount', iid, idx, color, sac } });
    return null;
  }
  let opts = effProduces(s, p, iid, a);
  if (!opts.length) return 'That produces no mana right now';
  const combo = (a.ability as any)?.combo as Color[] | undefined;
  if (combo) {
    // "Add N mana in any combination of {R} and/or {G}": one color pick per mana
    const total = (a.ability as any).perRemoved ? Math.min(nRemove ?? 0, s.cards[iid].counters[rc?.counter] ?? 0) : opts.length;
    const picks = Array.isArray(color) ? (color as Color[]) : [];
    if (picks.length < total) {
      pushPrompt(s, { id: uid(s, 'p'), player: p, kind: 'color', title: `Mana ${picks.length + 1} of ${total} (${nm(s, iid)})`, options: combo.map((c) => ({ id: c, label: c })), canCancel: true, data: { ctx: 'manaColor', iid, idx, sac, nRemove, picks } });
      return null;
    }
    opts = picks.map((c) => [c]);
    color = undefined;
  }
  const chosenCol = (a.ability as any)?.chosenColor ? ((s.cards[iid] as any).chosenColor as Color | undefined) : undefined;
  const orBase = (a.ability as any)?.chosenColorOr as Color | undefined;
  if (chosenCol) opts = opts.map(() => (orBase && orBase !== chosenCol ? [orBase, chosenCol] : [chosenCol]));
  else if (orBase) opts = opts.map(() => [orBase]);
  if (opts.some((o) => o.length > 1) && !color) {
    const all = [...new Set(opts.flat())];
    pushPrompt(s, { id: uid(s, 'p'), player: p, kind: 'color', title: `Choose a color to add (${nm(s, iid)})`, options: all.map((c) => ({ id: c, label: c })), canCancel: true, data: { ctx: 'manaColor', iid, idx, sac, nRemove } });
    return null;
  }
  if (a.cost.mana) payMana(s, p, a.cost.mana, 0, iid);
  const c = s.cards[iid];
  if (a.cost.tap) c.tapped = true;
  if (a.cost.untap) c.tapped = false;
  if ((a.cost as any).exert) (c as any).exertTurn = s.turn;
  if (a.cost.life) loseLife(s, p, a.cost.life);
  const removed = rc ? Math.min(rc.any ? nRemove ?? 0 : rc.n, c.counters[rc.counter] ?? 0) : 0;
  if (rc) c.counters[rc.counter] = (c.counters[rc.counter] ?? 0) - removed;
  const pl = P(s, p);
  const reps = combo ? 1 : (a.ability as any)?.perRemoved ? removed + ((a.ability as any).plus1 ? 1 : 0) : (a.ability as any)?.perPower ? Math.max(0, chars(s, iid).power) : 1; // "add an amount of {G} equal to ~'s power"
  const restrict = bakeRestrict((a.ability as any)?.restrict, c) as { spell?: any; ability?: any } | undefined;
  const made: string[] = [];
  for (const o of opts) {
    const col = o.length > 1 ? (color && o.includes(color as Color) ? (color as Color) : o[0]) : o[0];
    if (restrict) for (let k = 0; k < reps; k++) (((pl as any).rpool ??= []) as any[]).push({ col, kind: restrict });
    else pl.pool[col] += reps;
    for (let k = 0; k < reps; k++) made.push(col);
  }
  applyManaAbilitySideEffects(s, p, iid, a);
  if (a.cost.tap) for (const h of EXT.hooks.manaTapped) h(s, p, iid, made, api);
  for (const x of sac ?? []) if (s.cards[x]?.zone === 'battlefield') moveCard(s, x, 'graveyard', { cause: 'sacrifice' });
  if (sac?.length) log(s, `${pname(s, p)} sacrifices ${sac.map((x) => nm(s, x) ?? 'a token').join(', ')} to ${nm(s, iid)}.`, p);
  if (a.cost.sacSelf) moveCard(s, iid, 'graveyard', { cause: 'sacrifice' });
  return null;
}

// ============================================================================================
// Timing & legality
// ============================================================================================

function sorcerySpeed(s: GameState, p: PlayerIdx) {
  return s.active === p && (s.step === 'main1' || s.step === 'main2') && s.stack.length === 0 && !s.pendingCast;
}

function isInstantSpeed(s: GameState, iid: string, face: number) {
  const card = s.cards[iid];
  const def = s.defs[card.defId];
  const f = def.faces && def.faces.length > 1 && ['split', 'adventure', 'modal_dfc', 'prepare', 'omen'].includes(def.layout) ? def.faces[face] : null;
  const tl = (f?.typeLine ?? currentFace(s, card).typeLine).toLowerCase();
  if (tl.includes('instant')) return true;
  const pc = f ? parseCard(def, f) : parsedFor(s, card);
  return pc.keywords.includes('flash') || EXT.hooks.flash.some((h) => h(s, iid, api));
}

function landFace(s: GameState, iid: string): number | null {
  const card = s.cards[iid];
  const def = s.defs[card.defId];
  if (def.faces && def.layout === 'modal_dfc') {
    const i = def.faces.findIndex((f) => /\bland\b/i.test(f.typeLine));
    return i >= 0 ? i : null;
  }
  return /\bland\b/i.test(def.typeLine.split('//')[0]) ? 0 : null;
}

function landsAllowed(s: GameState, p: PlayerIdx) {
  let n = 1;
  for (const iid of s.battlefield) if (s.cards[iid].controller === p) n += baseChars(s, iid).pc.additionalLand ?? 0;
  for (const iid of s.battlefield) n += (baseChars(s, iid).pc as any).extraLandAll ?? 0;
  const xl = (P(s, p) as any).extraLands;
  if (xl && xl.turn === s.turn) n += xl.n;
  return n;
}

// ============================================================================================
// Targets
// ============================================================================================

function legalTargets(s: GameState, spec: TargetSpec, you: PlayerIdx, source: string, casterIsOpp = true): Target[] {
  const out: Target[] = [];
  const f = spec.filter;
  const srcColors = s.cards[source] ? chars(s, source).colors : [];
  if (spec.players) {
    for (const pi of [0, 1] as PlayerIdx[]) {
      if (spec.players === 'opp' && pi === you) continue;
      if (spec.players === 'you' && pi !== you) continue;
      // protection from everything (Teferi's Protection, The One Ring): can't be targeted (702.16)
      if (Math.max((P(s, pi) as any).protUntil ?? 0, (P(s, pi) as any).protAllUntil ?? 0) > s.turn) continue;
      // "You have hexproof / shroud." (Leyline of Sanctity, True Believer)
      if (s.battlefield.some((b) => s.cards[b].controller === pi && !s.cards[b].phasedOut && ((baseChars(s, b).pc as any).playerShroud || ((baseChars(s, b).pc as any).playerHexproof && pi !== you)))) continue;
      if (!P(s, pi).lost) out.push({ kind: 'player', idx: pi });
    }
  }
  if (f.types && f.types.length === 0 && spec.players) return out;
  if (f.zone === 'stack') {
    for (const it of s.stack) {
      if (it.source === source && it.kind === 'spell') continue;
      if (f.types?.includes('spell') && !f.types.some((t) => t !== 'spell') && !f.notTypes && !f.subtypes && !f.colors && !f.notColors && !f.cmcMax && !f.controller && !(f as any).targetsF) {
        if (it.kind === 'spell') out.push({ kind: 'stack', id: it.id });
        continue;
      }
      // "counter target activated ability (from an artifact source)"
      const kinds = (f as any).stackKinds as string[] | undefined;
      if (kinds) {
        if (!kinds.includes(it.kind)) continue;
        const srcTypes = (f as any).srcTypes as string[] | undefined;
        if (srcTypes && !(s.cards[it.source] && srcTypes.some((t) => baseChars(s, it.source).types.has(t)))) continue;
        out.push({ kind: 'stack', id: it.id });
        continue;
      }
      if (it.kind === 'spell' && stackItemMatches(s, it, f, you)) out.push({ kind: 'stack', id: it.id });
    }
    return out;
  }
  if (f.zone === 'graveyard') {
    for (const pi of [0, 1] as PlayerIdx[]) {
      if (f.owner === 'you' && pi !== you) continue;
      if (f.owner === 'opp' && pi === you) continue;
      for (const iid of P(s, pi).graveyard) if (matchesFilter(s, iid, f, you, source)) out.push({ kind: 'card', iid });
    }
    return out;
  }
  for (const iid of s.battlefield) {
    const c = s.cards[iid];
    if (c.phasedOut) continue;
    if (!matchesFilter(s, iid, { ...f, zone: 'battlefield' }, you, source)) continue;
    const ch = chars(s, iid);
    if (ch.keywords.has('shroud')) continue;
    if (ch.keywords.has('hexproof') && c.controller !== you) continue;
    if (protectedFrom(s, ch, source)) continue;
    if (EXT.hooks.cantTarget.some((h) => h(s, iid, source, you, api))) continue;
    out.push({ kind: 'card', iid });
  }
  return out;
}

function targetStillLegal(s: GameState, t: Target, spec: TargetSpec, you: PlayerIdx, source: string): boolean {
  if (t.kind === 'player') return !P(s, t.idx).lost;
  const legal = legalTargets(s, spec, you, source);
  return legal.some((l) => (l.kind === 'card' && t.kind === 'card' && l.iid === t.iid) || (l.kind === 'stack' && t.kind === 'stack' && l.id === t.id));
}

function describeTarget(s: GameState, t: Target) {
  if (t.kind === 'player') return pname(s, t.idx);
  if (t.kind === 'card') return nm(s, t.iid);
  const it = s.stack.find((x) => x.id === t.id);
  return it ? it.label : 'a spell';
}

// ============================================================================================
// Casting & activation pipeline
// ============================================================================================

function shiftSpecs(obj: any, off: number): any {
  if (Array.isArray(obj)) return obj.map((x) => shiftSpecs(x, off));
  if (obj && typeof obj === 'object') {
    const o: any = {};
    for (const [k, v] of Object.entries(obj)) o[k] = shiftSpecs(v, off);
    if (o.t === 'target' && typeof o.spec === 'number') o.spec += off;
    return o;
  }
  return obj;
}

function combineModes(ab: Ability, chosen: number[]): Ability {
  const out: Ability = { text: ab.text, effects: [], specs: [], manual: [] };
  for (const i of chosen) {
    const m = ab.modes!.options[i];
    const off = out.specs.length;
    out.specs.push(...clone(m.specs));
    out.effects.push(...shiftSpecs(clone(m.effects), off));
    out.manual.push(...m.manual);
  }
  return out;
}

/** Cards in hand that could be spliced onto this spell (type matches, not already modal, cost affordable on its own). */
function spliceCandidates(s: GameState, p: PlayerIdx, iid: string, face: number, ability: Ability, manaCost: string): string[] {
  if (ability.modes) return [];
  const card = s.cards[iid];
  const def = s.defs[card.defId];
  const tl = (def.faces?.[face]?.typeLine ?? def.typeLine).split(' // ')[0].toLowerCase();
  const isArcane = /\barcane\b/.test(tl);
  const isInstSorc = /\b(instant|sorcery)\b/.test(tl);
  if (!isArcane && !isInstSorc) return [];
  return P(s, p).hand.filter((h) => {
    if (h === iid) return false;
    const sp = (parsedFor(s, s.cards[h]) as any).splice as { onto: string; cost: string } | undefined;
    if (!sp || !parsedFor(s, s.cards[h]).spell) return false;
    if (sp.onto === 'arcane' ? !isArcane : !isInstSorc) return false;
    return canAfford(s, p, (manaCost ?? '') + sp.cost);
  });
}

/** Crucible of Worlds & co: "You may play lands from your graveyard." */
function gyLandsAllowed(s: GameState, p: PlayerIdx): boolean {
  return (P(s, p) as any).gyPlayTurn === s.turn || s.battlefield.some((b) => s.cards[b].controller === p && (baseChars(s, b).pc as any).playLandsFromGy);
}
const isLandCard = (s: GameState, c: CardObj) => /\bLand\b/.test(s.defs[c.defId].typeLine.split(' // ')[0]);

const MULTI_CAST = ['split', 'adventure', 'modal_dfc', 'prepare', 'omen'];

/** Work out how a card can be cast from where it is right now. */
function defaultAlt(s: GameState, p: PlayerIdx, card: CardObj, pcFront: ParsedCard): CastAlt | null {
  const core = defaultAltCore(s, p, card, pcFront);
  if (core) return core;
  for (const h of EXT.hooks.zoneCast) {
    const a = h(s, p, card, pcFront, api);
    if (a) return a as CastAlt;
  }
  return null;
}
function defaultAltCore(s: GameState, p: PlayerIdx, card: CardObj, pcFront: ParsedCard): CastAlt | null {
  if (card.zone === 'command') return card.owner === p && (card as any).isCommander ? 'commander' : null;
  const mayPlay = card.mayPlay && card.mayPlay.player === p && card.mayPlay.untilTurn >= s.turn;
  if (card.zone === 'hand') return card.owner === p ? 'normal' : null;
  if (card.zone === 'graveyard') {
    if (card.owner !== p && !mayPlay) return null;
    if (card.owner === p && !mayPlay && isLandCard(s, card) && gyLandsAllowed(s, p)) return 'mayPlay';
    if (pcFront.flashback || (card as any).tempFlashback?.turn === s.turn) return 'flashback';
    if (pcFront.escape) return 'escape';
    if (pcFront.disturb) return 'disturb';
    if (mayPlay) return 'mayPlay';
    return null;
  }
  if (card.zone === 'exile') {
    if (card.onAdventure && card.owner === p) return 'adventure';
    if (card.foretold != null && card.owner === p) return 'foretell';
    if (card.plotted != null && card.owner === p) return 'plot';
    if (mayPlay) return 'mayPlay';
  }
  return null;
}

/** Materials for craft: other permanents you control or cards in your graveyard that match. */
function craftMaterials(s: GameState, p: PlayerIdx, self: string, f: Filter): string[] {
  const bf = s.battlefield.filter((b) => b !== self && s.cards[b].controller === p && matchesFilter(s, b, { ...f, zone: 'battlefield' }, p));
  const gy = P(s, p).graveyard.filter((g) => g !== self && matchesFilter(s, g, { ...f, zone: 'graveyard' }, p));
  return [...bf, ...gy];
}

function beginCast(s: GameState, p: PlayerIdx, iid: string, face: number, alt: CastAlt | 'free' = 'normal', kicker = false): string | null {
  const card = s.cards[iid];
  if (!card) return 'No such card';
  const def = s.defs[card.defId];
  const pcFront = parseCard(def, def.faces && ['transform', 'modal_dfc'].includes(def.layout) ? def.faces[0] : undefined);
  if (alt !== 'free' && alt !== 'madness') {
    const auto = defaultAlt(s, p, card, pcFront);
    if (!auto) return card.zone === 'hand' ? "That's not your card" : "You can't cast that card from there";
    if (alt === 'normal' || (alt !== 'morph' && alt !== 'bestow' && alt !== 'mutate' && !String(alt).startsWith('ext:'))) alt = alt === 'normal' ? auto : alt;
    if ((alt === 'morph' || alt === 'bestow' || alt === 'mutate') && card.zone !== 'hand') return 'Only from your hand';
    if (alt === 'mutate' && !(pcFront as any).mutate) return 'This card has no mutate';
    if (alt === 'morph' && !pcFront.morph) return 'This card has no morph or disguise';
    if (alt === 'bestow' && !pcFront.bestow) return 'This card has no bestow';
    if (alt === 'foretell' && (card.foretold == null || card.foretold >= s.turn)) return "You can't cast a foretold card the turn you foretold it";
    if (alt === 'plot' && (card.plotted == null || card.plotted >= s.turn)) return "You can't cast a plotted card the turn you plotted it";
  }
  const faces = def.faces && def.faces.length > 1 ? def.faces : null;
  let useFace = face;
  if (!faces || !MULTI_CAST.includes(def.layout)) useFace = 0;
  if (alt === 'adventure') useFace = 0;
  if (alt === 'disturb') useFace = 1;
  const f = faces && (MULTI_CAST.includes(def.layout) || alt === 'disturb') ? faces[useFace] : null;
  const typeLine = alt === 'morph' ? 'Creature' : f?.typeLine ?? def.typeLine;
  if (/\bland\b/i.test(typeLine) && !/\b(instant|sorcery|creature|artifact|enchantment)\b/i.test(typeLine)) return 'Lands are played, not cast';
  const pc = f ? parseCard(def, f) : parseCard(def);
  let manaCost = f?.manaCost ?? def.manaCost;
  switch (alt) {
    case 'flashback': {
      // granted until end of turn (Snapcaster Mage): its own cost, or its mana cost
      const tf = (card as any).tempFlashback;
      manaCost = pcFront.flashback ?? (tf && tf.turn === s.turn ? tf.cost ?? s.defs[card.defId].manaCost : undefined)!;
      if (manaCost === undefined) return 'No flashback';
      break;
    }
    case 'escape': manaCost = pcFront.escape!.cost; break;
    case 'disturb': manaCost = pcFront.disturb!; break;
    case 'morph': manaCost = '{3}'; break;
    case 'bestow': manaCost = pcFront.bestow!; break;
    case 'foretell': manaCost = pcFront.foretell ?? manaCost; break;
    case 'plot': manaCost = ''; break;
    case 'free': manaCost = ''; break;
    case 'madness': manaCost = (pcFront as any).madness ?? manaCost; break;
    case 'commander': {
      // Commander tax (903.8): {2} more for each previous cast from the command zone
      const n = ((P(s, p) as any).commanderCasts ?? {})[iid] ?? 0;
      if (n) manaCost = (manaCost || '') + `{${2 * n}}`;
      break;
    }
    case 'mutate': manaCost = (pcFront as any).mutate; break;
    case 'alt': {
      const a = (pcFront as any).altCost;
      if (!a || card.zone !== 'hand') return 'This card has no alternative cost';
      if (!altCostPayable(s, p, iid, a)) return `You can't pay the alternative cost (${a.text})`;
      manaCost = a.mana ?? '';
      break;
    }
    case 'mayPlay': if (card.mayPlay?.free) manaCost = ''; break;
  }
  if (kicker) {
    if (!pcFront.kicker) return 'This card has no kicker';
    manaCost = (manaCost || '') + pcFront.kicker;
  }
  if (typeof alt === 'string' && alt.startsWith('ext:')) {
    const x = EXT.alts[alt.slice(4)];
    if (!x) return 'Unknown casting option';
    const r0 = x.begin(s, p, iid, pcFront, api);
    if (r0.startsWith('!')) return r0.slice(1);
    manaCost = r0;
  }
  for (const h of EXT.hooks.costMod) manaCost = h(s, p, iid, manaCost, alt as string, api);
  for (const h of EXT.hooks.castBlock) {
    const why = h(s, p, iid, alt as string, api, useFace);
    if (why) return why;
  }
  const instant = alt !== 'morph' && alt !== 'plot' && alt !== 'free' && (isInstantSpeed(s, iid, useFace) || (typeof alt === 'string' && alt.startsWith('ext:') && !!EXT.alts[alt.slice(4)]?.instant));
  // casting as part of a resolving effect ("you may cast the copy") ignores timing (608.2g)
  if (alt !== 'free' && alt !== 'madness' && !(s as any).castInResolution) {
    if (!instant && !sorcerySpeed(s, p)) return 'You can only cast that at sorcery speed (your main phase, empty stack)';
    if (instant && s.priority !== p) return "You don't have priority";
  }
  const isPerm = !/\b(instant|sorcery)\b/i.test(typeLine);
  let ability: Ability;
  if (alt === 'morph') ability = { text: '', effects: [], specs: [], manual: [] };
  else if (alt === 'mutate') {
    ability = { text: '', effects: [], specs: [{ filter: { types: ['creature'], notTypes: ['human'], owner: 'you' } as any, players: null, count: 1, upTo: false, label: 'non-Human creature you own to mutate onto' }], manual: [] };
  } else if (alt === 'bestow') {
    ability = { text: '', effects: [], specs: [{ filter: { types: ['creature'] }, players: null, count: 1, upTo: false, label: 'target creature to enchant (bestow)' }], manual: [] };
  } else if (isPerm) {
    ability = { text: '', effects: [], specs: [], manual: [] };
    if (/\baura\b/i.test(typeLine) && pc.enchant) {
      ability.specs = [{ filter: pc.enchant.filter, players: pc.enchant.players ?? null, count: 1, upTo: false, label: 'target to enchant' }];
    }
  } else {
    ability = pc.spell ?? { text: '', effects: [], specs: [], manual: [] };
  }
  if (typeof alt === 'string' && alt.startsWith('ext:')) {
    const ab2 = EXT.alts[alt.slice(4)]?.ability?.(s, p, iid, useFace, ability, api);
    if (ab2) ability = ab2;
  }
  // "As an additional cost to cast this spell, pay X life." (Toxic Deluge) also asks for X
  const hasX = /\{X\}/i.test(manaCost) || !!(pc as any).addCost?.lifeX;
  s.pendingCast = {
    kind: 'spell', player: p, iid, face: useFace, fromZone: card.zone, manaCost, isPerm, hasX, x: 0, alt, kicker,
    ability: clone(ability), specs: clone(ability.specs), targets: [], specIdx: 0,
    stage: spliceCandidates(s, p, iid, useFace, ability, manaCost).length ? 'splice' : ability.modes ? 'mode' : hasX ? 'x' : 'targets', label: alt === 'morph' ? 'a face-down creature spell' : f?.name ?? def.name, text: alt === 'morph' ? '' : f?.oracle ?? def.oracle,
    flashback: alt === 'flashback',
  };
  advanceCast(s);
  return null;
}

/** Special actions that don't use the stack: foretell, plot, suspend (rule 116.2). */
function specialAction(s: GameState, p: PlayerIdx, iid: string, a: Activated): string | null {
  const card = s.cards[iid];
  if (s.priority !== p) return "You don't have priority";
  if (a.sorcery && !sorcerySpeed(s, p)) return 'Only at sorcery speed';
  if (a.special === 'foretell' && s.active !== p) return 'You can only foretell during your turn';
  const err = a.cost.mana ? payMana(s, p, a.cost.mana, 0) : null;
  if (err) return err;
  const pc = parsedFor(s, card);
  moveCard(s, iid, 'exile');
  if (a.special === 'foretell') {
    card.faceDown = true;
    card.foretold = s.turn;
    log(s, `${pname(s, p)} foretells a card.`, p);
  } else if (a.special === 'plot') {
    card.plotted = s.turn;
    log(s, `${pname(s, p)} plots ${nm(s, iid)}.`, p);
  } else if (a.special === 'suspend') {
    card.suspended = true;
    card.counters.time = pc.suspend?.n ?? 1;
    log(s, `${pname(s, p)} suspends ${nm(s, iid)} with ${card.counters.time} time counters.`, p);
  }
  return null;
}

function beginActivate(s: GameState, p: PlayerIdx, iid: string, idx: number): string | null {
  const card = s.cards[iid];
  if (!card) return 'No such card';
  const ch = chars(s, iid);
  const a = ch.pc.activated[idx];
  if (!a) return 'No such ability';
  if (a.isMana) return activateManaAbility(s, p, iid, idx);
  if (!canPayActCostBasics(s, p, iid, a)) return "You can't activate that right now";
  if (a.special === 'foretell' || a.special === 'plot' || a.special === 'suspend') return specialAction(s, p, iid, a);
  if (s.priority !== p) return "You don't have priority";
  if (a.special === 'ninjutsu' && !ninjutsuWindow(s, p)) return 'Ninjutsu needs an unblocked attacker after blockers are declared';
  if ((a.sorcery || a.special === 'equip') && !sorcerySpeed(s, p)) return 'Activate only as a sorcery';
  if ((a as any).extSpecial) {
    const sp = EXT.specials[(a as any).extSpecial];
    return sp ? sp(s, p, iid, a, api) : 'Unknown ability';
  }
  if (a.once && (card as any).activatedThisTurn?.includes(idx)) return 'Already activated this turn';
  if ((a as any).maxPerTurn && ((card as any).activatedThisTurn ?? []).filter((x: number) => x === idx).length >= (a as any).maxPerTurn) return 'Activated the maximum number of times this turn';
  const hasX = /\{X\}/i.test(a.cost.mana) || a.cost.loyalty === 'X';
  let actCost = a.cost.mana;
  for (const h of EXT.hooks.actCostMod) actCost = h(s, p, iid, a, actCost, api);
  s.pendingCast = {
    kind: 'ability', player: p, iid, abilityIdx: idx, manaCost: actCost, hasX, x: 0,
    ability: clone(a.ability), specs: clone(a.ability.specs), targets: [], specIdx: 0,
    stage: a.ability.modes ? 'mode' : hasX ? 'x' : 'targets', label: `${ch.name} — ability`, text: a.label, special: a.special, crew: a.crew,
  };
  advanceCast(s);
  return null;
}

function cancelCast(s: GameState, reason?: string) {
  const pc = s.pendingCast;
  if (!pc) return;
  if (reason) (s as any).castError = { player: pc.player, text: reason };
  s.pendingCast = null;
}

function advanceCast(s: GameState) {
  const pc = s.pendingCast;
  if (!pc) return;
  const p: PlayerIdx = pc.player;
  const source = pc.kind === 'trigger' ? pc.item.source : pc.iid;

  // Splice (702.47): announced before modes/targets; the spliced cards stay revealed in hand.
  if (pc.stage === 'splice') {
    if (pc.extSplice === undefined) {
      const cands = spliceCandidates(s, p, pc.iid, pc.face, pc.ability, pc.manaCost);
      pushPrompt(s, { id: uid(s, 'p'), player: p, kind: 'chooseCards', title: `${pc.label}: splice any cards onto it? (pay each one's splice cost)`, cards: cands, min: 0, max: cands.length, canCancel: true, data: { ctx: 'cast', cost: 'extSplice' } });
      return;
    }
    const chosen: string[] = pc.extSplice ?? [];
    if (chosen.length) {
      const parts: Ability[] = [pc.ability, ...chosen.map((c) => parsedFor(s, s.cards[c]).spell!)];
      const merged = combineModes({ text: pc.ability.text, effects: [], specs: [], manual: [], modes: { min: 0, max: parts.length, options: parts } } as any, parts.map((_, i) => i));
      pc.ability = merged;
      pc.specs = merged.specs;
      pc.manaCost = (pc.manaCost ?? '') + chosen.map((c) => (parsedFor(s, s.cards[c]) as any).splice.cost).join('');
      pc.hasX = /\{X\}/i.test(pc.manaCost);
      log(s, `${pname(s, p)} splices ${chosen.map((c) => nm(s, c)).join(', ')} onto ${pc.label}.`, p);
      ev(s, { k: 'revealHand', p, cards: chosen.map((h) => ({ iid: h, name: nm(s, h), image: cardImageOf(s, h) })) });
    }
    pc.stage = pc.ability.modes ? 'mode' : pc.hasX ? 'x' : 'targets';
  }

  if (pc.stage === 'mode') {
    const modes = { ...pc.ability.modes };
    if (modes.commanderMax && s.battlefield.some((b) => s.cards[b].controller === p && (s.cards[b] as any).isCommander)) modes.max = modes.commanderMax;
    // "If this spell's additional cost was paid, choose both instead": the optional cost is decided first
    const cmc = modes.condMax?.cond as any;
    if (cmc?.k === 'ext' && cmc.name === 'castFlag' && cmc.flag === 'optPaid' && pc.extOpt === undefined) {
      for (const h of EXT.hooks.castCosts) if (h(s, pc, api)) return;
    }
    if (modes.condMax && (modes.condMax.cond.k === 'kickedCast' ? !!pc.kicker : cmc?.name === 'castFlag' && cmc.flag === 'optPaid' ? !!pc.extOpt?.length : evalCond(s, modes.condMax.cond, p, pc.iid))) modes.max = modes.condMax.max;
    if (modes.repeat) modes.max = pc.ability.modes.max;
    pushPrompt(s, {
      id: uid(s, 'p'), player: p, kind: 'mode', title: `${pc.kind === 'trigger' && (pc.label ?? pc.item?.label) ? (pc.label ?? pc.item?.label) + ': ' : ''}Choose ${modes.min === modes.max ? modes.min : `${modes.min}–${modes.max}`} mode${modes.max > 1 ? 's' : ''}`,
      options: modes.options.map((o: Ability, i: number) => ({ id: String(i), label: o.text })), min: modes.min, max: modes.max, canCancel: pc.kind !== 'trigger', data: { ctx: 'cast' },
      ...(modes.repeat ? { repeat: true } : {}),
    } as any);
    return;
  }
  if (pc.stage === 'x') {
    // {X}{X} (Walking Ballista) costs two mana per point of X
    const xs = Math.max(1, (pc.manaCost.match(/\{X\}/gi) ?? []).length);
    const max = Math.max(0, Math.floor((availableMana(s, p) - (parseCost(pc.manaCost).generic + Object.values(parseCost(pc.manaCost).colored).reduce((a: number, b: number) => a + b, 0))) / xs));
    const loyaltyX = pc.kind === 'ability' && chars(s, pc.iid).pc.activated[pc.abilityIdx].cost.loyalty === 'X';
    const lifeX = pc.kind === 'spell' && !/\{X\}/i.test(pc.manaCost) && !!(parsedFor(s, s.cards[pc.iid]) as any).addCost?.lifeX;
    pushPrompt(s, { id: uid(s, 'p'), player: p, kind: 'x', title: lifeX ? 'Choose X (you pay X life)' : 'Choose a value for X', min: 0, max: loyaltyX ? s.cards[pc.iid].counters.loyalty ?? 0 : lifeX ? Math.max(0, P(s, p).life) : max, canCancel: true, data: { ctx: 'cast' } });
    return;
  }
  if (pc.stage === 'targets') {
    while (pc.specIdx < pc.specs.length) {
      const sp: TargetSpec = pc.specs[pc.specIdx];
      // targets that exist only in the kicked (or unkicked) version of the spell
      const ci = (sp as any).castIf;
      if (ci && ci.kicked !== undefined && ci.kicked !== !!pc.kicker) { pc.targets.push([]); pc.specIdx++; continue; }
      if (ci && ci.gift !== undefined) {
        // the gift is promised as the spell is announced, so ask now
        if (pc.extGift === undefined) {
          pushPrompt(s, { id: uid(s, 'p'), player: p, kind: 'chooseCards', title: `${pc.label}: promise your opponent a gift? Choose this card to promise, or nothing`, cards: [pc.iid], min: 0, max: 1, canCancel: true, data: { ctx: 'cast', cost: 'extGift' } });
          return;
        }
        if (ci.gift !== (Array.isArray(pc.extGift) && pc.extGift.length > 0)) { pc.targets.push([]); pc.specIdx++; continue; }
      }
      const legal = legalTargets(s, sp, p, source).filter((t) => {
        // 115.3: one object may be the target of different instances of "target" — except "another / other target"
        if (!(sp.filter as any)?.other) return true;
        return !pc.targets.flat().some((x: Target) => JSON.stringify(x) === JSON.stringify(t));
      });
      const min = sp.upTo ? 0 : Math.min(sp.count, 1);
      if (legal.length < min) {
        if (pc.kind === 'trigger') {
          log(s, `${pc.item.label}: trigger removed (no legal targets).`, p);
          s.pendingCast = null;
          return;
        }
        cancelCast(s, `No legal targets for ${pc.label}.`);
        return;
      }
      if (legal.length === 0) {
        pc.targets.push([]);
        pc.specIdx++;
        continue;
      }
      pushPrompt(s, {
        id: uid(s, 'p'), player: p, kind: 'targets', title: `${pc.label ?? pc.item?.label ?? nm(s, source)}: choose ${sp.upTo ? 'up to ' : ''}${sp.count > 1 ? sp.count + ' ' : ''}${sp.label}`,
        targets: legal, min: sp.upTo ? 0 : sp.divided ? 1 : Math.min(sp.count, legal.length), max: sp.count, canCancel: pc.kind !== 'trigger', data: { ctx: 'cast' },
      });
      return;
    }
    pc.stage = 'costs';
  }
  if (pc.stage === 'costs') {
    if (pc.kind === 'spell' && pc.alt === 'escape' && !pc.escapeChosen) {
      const need = parsedFor(s, s.cards[pc.iid]).escape?.exile ?? parseCard(s.defs[s.cards[pc.iid].defId]).escape?.exile ?? 0;
      const cands = P(s, p).graveyard.filter((g) => g !== pc.iid);
      if (cands.length < need) {
        cancelCast(s, `Escape needs ${need} other cards in your graveyard.`);
        return;
      }
      pushPrompt(s, { id: uid(s, 'p'), player: p, kind: 'chooseCards', title: `Escape: exile ${need} other cards from your graveyard`, cards: cands, min: need, max: need, canCancel: true, data: { ctx: 'cast', cost: 'escape' } });
      return;
    }
    if (pc.kind === 'spell' && typeof pc.alt === 'string' && pc.alt.startsWith('ext:')) {
      const x = EXT.alts[pc.alt.slice(4)];
      if (x?.costs && x.costs(s, pc, api)) return;
    }
    for (const h of EXT.hooks.castCosts) if (h(s, pc, api)) return;
    if (pc.kind === 'spell' && pc.alt === 'alt') {
      const def = s.defs[s.cards[pc.iid].defId];
      const a = (parseCard(def, def.faces && ['transform', 'modal_dfc'].includes(def.layout) ? def.faces[0] : undefined) as any).altCost;
      const pick = (key: string, spec: any, pool: string[], verb: string) => {
        if (!spec || pc[key]) return false;
        const cands = pool.filter((x) => x !== pc.iid && matchesFilter(s, x, spec.filter ?? {}, p, pc.iid));
        pushPrompt(s, { id: uid(s, 'p'), player: p, kind: 'chooseCards', title: `${pc.label}: ${verb} ${spec.n} (alternative cost)`, cards: cands, min: spec.n, max: spec.n, canCancel: true, data: { ctx: 'cast', cost: key } });
        return true;
      };
      if (pick('altSac', a?.sac, s.battlefield, 'sacrifice')) return;
      if (pick('altBounce', a?.bounce, s.battlefield, 'return to hand')) return;
      if (pick('altExile', a?.exileHand, P(s, p).hand, 'exile from your hand')) return;
      if (pick('altDiscard', a?.discard ? { filter: a.discard.filter, n: a.discard.n } : null, P(s, p).hand, 'discard')) return;
      pc.altLife = a?.life ?? 0;
    }
    if (pc.kind === 'ability') {
      const a: Activated = chars(s, pc.iid).pc.activated[pc.abilityIdx];
      if (a.cost.sacrifice && !pc.sacChosen) {
        const cands = s.battlefield.filter((b) => matchesFilter(s, b, a.cost.sacrifice!.filter, p, pc.iid));
        pushPrompt(s, { id: uid(s, 'p'), player: p, kind: 'chooseCards', title: `Sacrifice ${a.cost.sacrifice.n} (cost)`, cards: cands, min: a.cost.sacrifice.n, max: a.cost.sacrifice.n, canCancel: true, data: { ctx: 'cast', cost: 'sac' } });
        return;
      }
      if (a.special === 'craft' && a.craft && !pc.craftChosen) {
        const cands = craftMaterials(s, p, pc.iid, a.craft.filter);
        pushPrompt(s, { id: uid(s, 'p'), player: p, kind: 'chooseCards', title: `Craft: exile ${a.craft.max > a.craft.min ? `${a.craft.min} or more` : a.craft.min} material${a.craft.min > 1 || a.craft.max > 1 ? 's' : ''}`, cards: cands, min: a.craft.min, max: Math.min(a.craft.max, cands.length), canCancel: true, data: { ctx: 'cast', cost: 'craft' } });
        return;
      }
      if (a.cost.discard && !pc.discardChosen) {
        const cands = P(s, p).hand.filter((h) => h !== pc.iid);
        pushPrompt(s, { id: uid(s, 'p'), player: p, kind: 'chooseCards', title: `Discard ${a.cost.discard} (cost)`, cards: cands, min: a.cost.discard, max: a.cost.discard, canCancel: true, data: { ctx: 'cast', cost: 'discard' } });
        return;
      }
      if (a.special === 'crew' && !pc.crewChosen) {
        const cands = s.battlefield.filter((b) => b !== pc.iid && s.cards[b].controller === p && !s.cards[b].tapped && chars(s, b).types.has('creature'));
        pushPrompt(s, { id: uid(s, 'p'), player: p, kind: 'chooseCards', title: `Crew ${a.crew}: tap creatures with total power ${a.crew} or more`, cards: cands, min: 1, max: cands.length, canCancel: true, data: { ctx: 'cast', cost: 'crew' } });
        return;
      }
      if (a.cost.tapCreatures && !pc.tapChosen) {
        const cands = s.battlefield.filter((b) => b !== pc.iid && !s.cards[b].tapped && matchesFilter(s, b, a.cost.tapCreatures!.filter, p));
        pushPrompt(s, { id: uid(s, 'p'), player: p, kind: 'chooseCards', title: `Tap ${a.cost.tapCreatures.n} (cost)`, cards: cands, min: a.cost.tapCreatures.n, max: a.cost.tapCreatures.n, canCancel: true, data: { ctx: 'cast', cost: 'tap' } });
        return;
      }
    }
    pc.stage = 'pay';
  }
  if (pc.stage === 'pay') {
    if (pc.kind !== 'trigger') {
      (s as any).lastPaidColors = [];
      (s as any).lastPaidCounts = {};
      (s as any).lastPaidTreasure = 0;
      (s as any).lastPaidLife = 0;
      if (pc.kind === 'spell' && !(pc as any).lateCostDone) { (pc as any).lateCostDone = true; for (const h of EXT.hooks.lateCost) pc.manaCost = h(s, pc, api) ?? pc.manaCost; }
      const err = pc.manaCost ? payingFor(s, pc.kind === 'trigger' ? undefined : pc.iid, () => payMana(s, p, pc.manaCost, pc.x, pc.kind === 'ability' ? pc.iid : undefined), pc.kind === 'ability' ? 'ability' : 'spell') : null;
      pc.colorsSpent = (s as any).lastPaidColors ?? [];
      (pc as any).colorCounts = { ...((s as any).lastPaidCounts ?? {}) };
      (pc as any).treasureSpent = (s as any).lastPaidTreasure ?? 0;
      if (err) {
        cancelCast(s, `Can't cast ${pc.label}: ${err}.`);
        return;
      }
      {
        const mc = parseCost(pc.manaCost || '');
        pc.manaSpent = mc.generic + Object.values(mc.colored).reduce((a: number, b: number) => a + b, 0) + mc.hybrid.length + mc.twoBrid.length * 2 + mc.phyrexian.length + mc.snow + mc.x * (pc.x ?? 0);
      }
      if (pc.kind === 'ability') {
        const card = s.cards[pc.iid];
        const a: Activated = chars(s, pc.iid).pc.activated[pc.abilityIdx];
        if (a.cost.tap) card.tapped = true;
        if (a.cost.untap) card.tapped = false;
        if (a.cost.life) loseLife(s, p, a.cost.life);
        if (a.cost.energy) P(s, p).counters.energy = (P(s, p).counters.energy ?? 0) - a.cost.energy;
        if (a.cost.removeCounters) card.counters[a.cost.removeCounters.counter] -= a.cost.removeCounters.n;
        if ((a.cost as any).exert) (card as any).exertTurn = s.turn;
        if (a.special === 'loyalty') {
          const l = a.cost.loyalty === 'X' ? -pc.x : (a.cost.loyalty as number);
          card.counters.loyalty = (card.counters.loyalty ?? 0) + l;
          card.loyaltyUsed = true;
        }
        if (a.once || (a as any).maxPerTurn) ((card as any).activatedThisTurn ??= []).push(pc.abilityIdx);
        if (pc.sacChosen?.length) { (s as any).lastSacrificed = [...pc.sacChosen]; if (s.cards[pc.iid]) (s.cards[pc.iid] as any).sacForCost = [...pc.sacChosen]; }
        for (const sid of pc.sacChosen ?? []) moveCard(s, sid, 'graveyard', { cause: 'sacrifice' });
        for (const mid of pc.craftChosen ?? []) moveCard(s, mid, 'exile');
        for (const did of pc.discardChosen ?? []) moveCard(s, did, 'graveyard', { cause: 'discard' });
        for (const tid of [...(pc.crewChosen ?? []), ...(pc.tapChosen ?? [])]) s.cards[tid].tapped = true;
        if (pc.crewChosen?.length) emit(s, 'crewed', { vehicle: pc.iid, crew: [...pc.crewChosen], saddle: /^Saddle/.test((parsedFor(s, s.cards[pc.iid]).activated[pc.abilityIdx ?? -1] as any)?.label ?? '') });
        if (a.cost.discardSelf) moveCard(s, pc.iid, 'graveyard', { cause: 'discard' });
        if (a.cost.exileSelf) moveCard(s, pc.iid, 'exile');
        if (a.cost.other) log(s, `Pay manually: ${a.cost.other}`, p, 'manual');
        if (a.cost.sacSelf) {
          // last known information: keep the ability's source name
          pc.lkiName = nm(s, pc.iid);
          moveCard(s, pc.iid, 'graveyard', { cause: 'sacrifice' });
        }
        emit(s, 'activate', { p, iid: pc.iid, a });
      }
      if (pc.kind === 'spell') for (const eid of pc.escapeChosen ?? []) moveCard(s, eid, 'exile');
      if (pc.kind === 'spell' && typeof pc.alt === 'string' && pc.alt.startsWith('ext:')) EXT.alts[pc.alt.slice(4)]?.pay?.(s, pc, api);
      for (const h of EXT.hooks.castPay) h(s, pc, api);
      if (pc.kind === 'spell' && pc.alt === 'alt') {
        if (pc.altLife) loseLife(s, p, pc.altLife);
        for (const x of pc.altSac ?? []) moveCard(s, x, 'graveyard', { cause: 'sacrifice' });
        for (const x of pc.altBounce ?? []) moveCard(s, x, 'hand');
        for (const x of pc.altExile ?? []) moveCard(s, x, 'exile');
        for (const x of pc.altDiscard ?? []) moveCard(s, x, 'graveyard', { cause: 'discard' });
      }
    }
    pushToStack(s);
  }
}

function pushToStack(s: GameState) {
  const pc = s.pendingCast;
  const p: PlayerIdx = pc.player;
  s.pendingCast = null;
  let item: StackItem;
  if (pc.kind === 'trigger') {
    item = pc.item;
    item.effects = pc.ability.effects;
    item.targets = pc.targets;
    (item as any).specs = pc.specs;
  } else {
    item = {
      id: uid(s, 's'), kind: pc.kind === 'spell' ? 'spell' : 'ability', controller: p, source: pc.iid,
      label: pc.lkiName ?? pc.label, text: pc.text ?? '', effects: pc.ability.effects, targets: pc.targets, x: pc.x, face: pc.face,
      manual: pc.ability.manual?.length ? [...pc.ability.manual] : undefined,
    };
    (item as any).specs = pc.specs;
    (item as any).special = pc.special;
    (item as any).costTapped = [...(pc.crewChosen ?? []), ...(pc.tapChosen ?? [])];
  }
  if (pc.kind === 'spell') {
    const card = s.cards[pc.iid];
    const wasAdventure = card.onAdventure;
    (item as any).fromZone = card.zone;
    (card as any).castFrom = card.zone;
    (card as any).castInMain = (s.step === 'main1' || s.step === 'main2') && s.active === p;
    (card as any).manaSpent = pc.manaSpent ?? 0;
    (card as any).colorsSpent = pc.colorsSpent ?? [];
    (card as any).colorCounts = (pc as any).colorCounts ?? {};
    (card as any).treasureSpent = (pc as any).treasureSpent ?? 0;
    (item as any).manaSpent = pc.manaSpent ?? 0;
    removeFromZone(s, pc.iid);
    card.zone = 'stack';
    card.face = pc.face ?? 0;
    card.onAdventure = false;
    if (pc.flashback) card.castFromGraveyardExile = true;
    if (pc.alt === 'morph') {
      const m = parseCard(s.defs[card.defId]).morph ?? parseCard(s.defs[card.defId], s.defs[card.defId].faces?.[0]).morph;
      card.faceDown = true;
      card.morph = m ? { cost: m.cost, kind: m.kind } : undefined;
    }
    if (pc.alt === 'disturb') card.disturbed = true;
    if (pc.alt === 'escape') card.escaped = true;
    if (pc.alt === 'bestow') card.bestowed = true;
    card.xPaid = pc.x;
    card.kicked = !!pc.kicker;
    if (pc.alt === 'mutate') (item as any).mutate = true;
    if (pc.alt === 'commander' || (item as any).fromZone === 'command') {
      const cc = ((P(s, p) as any).commanderCasts ??= {});
      cc[pc.iid] = (cc[pc.iid] ?? 0) + 1;
    }
    (item as any).isPerm = pc.isPerm;
    (item as any).fromAdventure = wasAdventure;
    P(s, p).spellsCastThisTurn++;
  }
  s.stack.push(item);
  ev(s, { k: 'stack', id: item.id, kind: item.kind, src: item.source, p, alt: pc.alt, kicked: !!pc.kicker, from: (item as any).fromZone, targets: item.targets.flat() });
  (item as any).alt = pc.alt;
  if (pc.kind === 'spell' && typeof pc.alt === 'string' && pc.alt.startsWith('ext:')) EXT.alts[pc.alt.slice(4)]?.afterPush?.(s, item, api);
  for (const h of EXT.hooks.pushed) h(s, item, api);
  const tgtDesc = item.targets.flat().map((t) => describeTarget(s, t));
  log(s, `${pname(s, p)} ${pc.kind === 'spell' ? 'casts' : pc.kind === 'trigger' ? 'puts a trigger on the stack:' : 'activates'} ${item.label}${tgtDesc.length ? ' → ' + tgtDesc.join(', ') : ''}${pc.x ? ` (X=${pc.x})` : ''}.`, p);
  if (pc.kind === 'spell') fireCast(s, item);
  // Ward
  if (pc.kind !== 'trigger' || true) {
    for (const t of item.targets.flat()) {
      if (t.kind !== 'card') continue;
      const tc = s.cards[t.iid];
      if (!tc || tc.controller === p) continue;
      const w = chars(s, t.iid).pc.ward;
      if (w) {
        s.pendingTriggers.push({
          id: uid(s, 's'), kind: 'trigger', controller: tc.controller, source: t.iid, label: `${nm(s, t.iid)} — Ward`, text: `Ward {${w}}`,
          effects: [{ k: 'counterSpell', what: { t: 'target', spec: 0 }, unlessPay: w }], targets: [[{ kind: 'stack', id: item.id }]],
        });
        (s.pendingTriggers[s.pendingTriggers.length - 1] as any).preTargeted = true;
      }
    }
  }
  s.priority = p;
  s.passes = 0;
}

// ============================================================================================
// Resolution
// ============================================================================================

function resolveTop(s: GameState) {
  const item = s.stack[s.stack.length - 1];
  if (!item) return;
  const specs: TargetSpec[] = (item as any).specs ?? [];
  // Re-check targets (608.2b)
  let anyTargets = false;
  let anyLegal = false;
  const you = item.controller;
  item.targets = item.targets.map((list, i) => {
    return list.filter((t) => {
      anyTargets = true;
      const sp = specs[i];
      (s as any).__curX = item.x ?? 0;
      const ok = !sp || (item as any).preTargeted || targetStillLegal(s, t, sp, you, item.source);
      (s as any).__curX = undefined;
      if (ok) anyLegal = true;
      return ok;
    });
  });
  const srcCard = s.cards[item.source];
  if (anyTargets && !anyLegal && item.kind === 'spell' && srcCard?.bestowed) {
    // 702.103e: a bestowed Aura spell with an illegal target resolves as a creature
    srcCard.bestowed = false;
    item.targets = [];
    anyTargets = false;
  }
  if (anyTargets && !anyLegal) {
    s.stack.pop();
    log(s, `${item.label} fizzles (all targets are illegal).`, item.controller);
    if (item.kind === 'spell') finishSpell(s, item, true);
    return;
  }
  if (item.kind === 'trigger' && (item as any).cond && !triggerCondOk(s, (item as any).cond, item.controller, item.source, { triggerObj: (item as any).triggerObj, triggerPlayer: (item as any).triggerPlayer, lkiCounters: (item as any).lkiCounters })) {
    s.stack.pop();
    log(s, `${item.label} does nothing (its condition is no longer true).`, item.controller);
    return;
  }
  if (item.kind === 'spell' && (item as any).isPerm && srcCard && !srcCard.faceDown && parsedFor(s, srcCard).clone) {
    item.effects = [{ k: 'cloneChoice' }, ...item.effects];
  }
  s.stack.pop();
  log(s, `${item.label} resolves.`, item.controller);
  if (item.manual?.length) {
    const txt = item.manual.join(' ');
    log(s, `Resolve manually — ${item.label}: ${txt}`, item.controller, 'manual');
    s.manualNotice = `${item.label}: ${txt}`;
  }
  s.resolving = { item, i: 0, sub: null };
  continueResolve(s);
}

function continueResolve(s: GameState) {
  const r = s.resolving;
  if (!r) return;
  const item: StackItem = r.item;
  while (r.i < item.effects.length) {
    const eff: Effect = item.effects[r.i];
    const hadBatch = !!(s as any).leaveBatch;
    if (!hadBatch) (s as any).leaveBatch = new Map();
    let res: ReturnType<typeof execEffect>;
    try { res = execEffect(s, item, eff, r); } finally { if (!hadBatch) (s as any).leaveBatch = undefined; }
    if (res === 'wait') return;
    r.i++;
    r.sub = null;
  }
  s.resolving = null;
  if (item.kind === 'spell') finishSpell(s, item, false);
  else if ((item as any).special === 'equip') {
    const t = item.targets[0]?.[0];
    const eq = s.cards[item.source];
    if (t?.kind === 'card' && eq?.zone === 'battlefield' && s.cards[t.iid]?.zone === 'battlefield') {
      eq.attachedTo = t.iid;
      log(s, `${nm(s, item.source)} is attached to ${nm(s, t.iid)}.`, item.controller);
    }
  } else if ((item as any).special === 'crew' && !/^Saddle/.test(item.text ?? '')) {
    const v = s.cards[item.source];
    if (v?.zone === 'battlefield') {
      v.mods.push({ until: 'eot', addTypes: ['creature'] } as any);
      log(s, `${nm(s, item.source)} becomes an artifact creature until end of turn.`, item.controller);
    }
  }
}

function finishSpell(s: GameState, item: StackItem, countered: boolean) {
  if ((item as any).isCopy) return; // a copy of a spell ceases to exist (rule 707.10)
  for (const h of EXT.hooks.finish) if (h(s, item, countered, api)) return;
  if ((item as any).mutate && !countered && mutateOnto(s, item)) return;
  const card = s.cards[item.source];
  if (!card || card.zone !== 'stack') return;
  const def = s.defs[card.defId];
  if (!countered && (item as any).isPerm) {
    // Auras attach to their target
    const t = item.targets[0]?.[0];
    card.zone = 'library'; // placeholder so moveCard's removeFromZone is a no-op
    const face = card.face;
    moveCard(s, item.source, 'battlefield', { controller: item.controller, resolved: true, face } as any);
    if (def.layout === 'modal_dfc' || card.disturbed || (def.layout === 'split' && /\bRoom\b/.test(def.typeLine))) card.face = face;
    if ((s as any).suspendHaste === item.source) {
      card.mods.push({ keywords: ['haste'], until: 'permanent', ts: s.ts++ });
      (s as any).suspendHaste = undefined;
    }
    if (t) {
      if (t.kind === 'card') card.attachedTo = t.iid;
      else if (t.kind === 'player') (card as any).attachedPlayer = t.idx;
    }
    if (chars(s, item.source).pc.controlEnchanted && t?.kind === 'card') {
      const tc = s.cards[t.iid];
      tc.controller = item.controller;
      tc.sick = true;
    }
    return;
  }
  card.zone = 'library';
  if (card.castFromGraveyardExile) {
    card.castFromGraveyardExile = false;
    moveCard(s, item.source, 'exile');
  } else if (!countered && ['adventure', 'prepare'].includes(def.layout) && item.face === 1 && !(item as any).fromAdventure) {
    moveCard(s, item.source, 'exile');
    card.onAdventure = true;
    log(s, `${def.name} goes on an adventure (can be cast later from exile).`, item.controller);
  } else moveCard(s, item.source, 'graveyard');
}

// ---- subjects ----

function subjCards(s: GameState, item: StackItem, subj: Subject): string[] {
  switch (subj.t) {
    case 'self': return s.cards[item.source] ? [item.source] : [];
    case 'target': return (item.targets[subj.spec] ?? []).filter((t) => t.kind === 'card').map((t: any) => t.iid).filter((i: string) => s.cards[i]);
    case 'all': {
      let f = subj.filter;
      // "with mana value X or less": X of the resolving spell/ability
      if ((f as any).dynMax?.amt === 'X') f = { ...f, dynMax: { ...(f as any).dynMax, amt: item.x ?? 0 } } as any;
      const of = (subj as any).ofPlayer as Subject | undefined;
      if (of) {
        // "each creature that player (or that planeswalker's controller) controls"
        const ps = of.t === 'target' ? (item.targets[(of as any).spec] ?? []).map((t) => (t.kind === 'player' ? t.idx : s.cards[(t as any).iid]?.controller)).filter((x) => x != null) : subjPlayers(s, item, of);
        return s.battlefield.filter((b) => ps.includes(s.cards[b].controller) && matchesFilter(s, b, { ...f, zone: 'battlefield' }, item.controller, item.source));
      }
      if (f.zone === 'graveyard') return s.players.flatMap((p) => p.graveyard.filter((g) => matchesFilter(s, g, f, item.controller, item.source)));
      return s.battlefield.filter((b) => matchesFilter(s, b, { ...f, zone: 'battlefield' }, item.controller, item.source));
    }
    case 'enchanted':
    case 'equipped': {
      const a = s.cards[item.source]?.attachedTo;
      return a && s.cards[a] ? [a] : [];
    }
    case 'triggerObj': {
      const o = (item as any).triggerObj;
      return o && s.cards[o] ? [o] : [];
    }
    case 'lastToken': return ((item as any).lastTokens ?? []).filter((i: string) => s.cards[i]);
    case 'none' as any: return [];
    case 'exiledTop': return ((item as any).exiledTop ?? []).filter((i: string) => s.cards[i]);
    case 'linkedExiled': return [...(s.cards[item.source]?.linked ?? []), ...((s.cards[item.source] as any)?.remembered ?? []), ...((item as any).exiledHere ?? [])].filter((i: string) => s.cards[i]?.zone === 'exile');
    case 'blockers': {
      const a = s.combat?.attackers.find((x) => x.iid === item.source);
      return (a?.blockedBy ?? []).filter((b) => s.cards[b] && (!subj.filter || matchesFilter(s, b, { ...subj.filter, zone: 'battlefield' }, item.controller)));
    }
    default: return [];
  }
}

function subjPlayers(s: GameState, item: StackItem, subj: Subject): PlayerIdx[] {
  switch (subj.t) {
    case 'you': return [item.controller];
    case 'eachOpp': return [opp(item.controller)];
    case 'eachPlayer': return [s.active, opp(s.active)];
    case 'defending': return [opp(s.active)];
    case 'triggerPlayer': return [(item as any).triggerPlayer ?? opp(item.controller)];
    case 'target': return (item.targets[subj.spec] ?? []).filter((t) => t.kind === 'player').map((t: any) => t.idx);
    case 'controllerOf': {
      if (subj.of.t === 'target') {
        const ts = item.targets[subj.of.spec] ?? [];
        return ts.map((t) => (t.kind === 'card' ? (s.cards[t.iid]?.zone === 'battlefield' ? s.cards[t.iid].controller : lkiController(s, t.iid)) : t.kind === 'stack' ? s.stack.find((x) => x.id === t.id)?.controller ?? (s as any).stackCtrl?.[t.id] ?? item.controller : t.idx)).filter((x) => x != null) as PlayerIdx[];
      }
      return subjCards(s, item, subj.of).map((i) => s.cards[i].controller);
    }
    case 'ownerOf': return subjCards(s, item, subj.of).map((i) => s.cards[i].owner);
    case 'all': return subj.players === 'any' ? [0, 1] : subj.players === 'opp' ? [opp(item.controller)] : [];
    default: return [];
  }
}

function lkiController(s: GameState, iid: string): PlayerIdx | undefined {
  return (s as any).lkiCache?.[iid]?.controller ?? s.cards[iid]?.owner;
}

function amount(s: GameState, item: StackItem, a: Amt): number {
  if (a && typeof a === 'object' && (a as any).sacStat) {
    const sid = ((s.cards[item.source] as any)?.sacForCost ?? (s as any).lastSacrificed ?? [])[0];
    const st = (a as any).sacStat as string;
    return sid && s.cards[sid] ? Math.max(0, st === 'cmc' ? chars(s, sid).cmc ?? 0 : (chars(s, sid) as any)[st] ?? 0) : 0;
  }
  if (a && typeof a === 'object' && (a as any).trigAmount) return ((item as any).evAmount ?? 0) * ((a as any).mult ?? 1);
  if (a && typeof a === 'object' && (a as any).lastCount) return ((item as any).lastCount ?? 1) * ((a as any).mult ?? 1);
  return evalAmt(s, a, item.controller, item.source, {
    x: item.x,
    item,
    lkiCounters: (item as any).lkiCounters,
    subjectCards: (sub) => subjCards(s, item, sub),
    subjectIds: (sub) => (sub?.t === 'target' ? (item.targets[sub.spec] ?? []).filter((t) => t.kind === 'card').map((t: any) => t.iid) : subjCards(s, item, sub)),
  });
}

// ---- damage & life ----

function loseLife(s: GameState, p: PlayerIdx, n: number) {
  if (n <= 0) return;
  for (const h of EXT.hooks.lifeLoss) n = h(s, p, n, api);
  if (n <= 0) return;
  P(s, p).life -= n;
  ev(s, { k: 'life', p, delta: -n });
  emit(s, 'lifeLost', { p, n });
}

function gainLife(s: GameState, p: PlayerIdx, n: number) {
  if (n <= 0) return;
  for (const h of EXT.hooks.lifeGain) n = h(s, p, n, api);
  if (n <= 0) return;
  const base = n;
  for (const b of s.battlefield) if (s.cards[b].controller === p) for (const r of baseChars(s, b).pc.replacements as any[]) if (r.k === 'lifePlus') n += r.n;
  for (const b of s.battlefield) if (s.cards[b].controller === p && baseChars(s, b).pc.replacements.some((r) => r.k === 'lifeDouble')) n *= 2;
  ev(s, { k: 'life', p, delta: n, base });
  P(s, p).life += n;
  P(s, p).lifeGainedThisTurn += n;
  fireSimple(s, 'gainLife', p, { amount: n });
  emit(s, 'lifeGained', { p, n });
}

function damagePlayer(s: GameState, source: string, p: PlayerIdx, n: number, combat: boolean) {
  if (n <= 0) return 0;
  P(s, p).damagedThisTurn = true;
  const src = s.cards[source];
  const sc = src && src.zone === 'battlefield' ? chars(s, source) : null;
  if (sc?.keywords.has('infect')) P(s, p).poison += n;
  else loseLife(s, p, n);
  if (combat && src && (src as any).isCommander) {
    const cd = ((P(s, p) as any).commanderDamage ??= {});
    cd[source] = (cd[source] ?? 0) + n;
  }
  if (sc?.keywords.has('toxic')) P(s, p).poison += 1;
  if (combat && (s as any).initiative === p && src && src.controller !== p) {
    const np = src.controller;
    const it: StackItem = { id: uid(s, 's'), kind: 'trigger', controller: np, source: source, label: `${pname(s, np)} takes the initiative`, text: 'Venture into Undercity.', effects: [{ k: 'venture', initiative: true }], targets: [] };
    (it as any).preTargeted = true;
    s.pendingTriggers.push(it);
  }
  if (combat && (s as any).monarch === p && src && src.controller !== p) {
    (s as any).monarch = src.controller;
    log(s, `${pname(s, src.controller)} becomes the monarch.`, src.controller, 'turn');
    ev(s, { k: 'monarch', p: src.controller });
  }
  return n;
}

/** Deal damage from a source to a target. Returns damage actually dealt (for lifelink). */
function dealDamage(s: GameState, source: string, to: Target, n: number, combat: boolean): number {
  if (n <= 0) return 0;
  const dealt = dealDamageInner(s, source, to, n, combat);
  return dealt;
}

function dealDamageInner(s: GameState, source: string, to: Target, n: number, combat: boolean): number {
  const src = s.cards[source];
  const sc = src ? chars(s, source) : null;
  // Replacement & prevention effects (rules 614/615)
  const srcCtrl = src?.controller;
  for (const h of EXT.hooks.damage) n = h(s, source, to, n, combat, api);
  if (n <= 0) return 0;
  const base = n;
  for (const b of s.battlefield) {
    for (const r of baseChars(s, b).pc.replacements) if (r.k === 'damageDouble' && (!r.yourSources || s.cards[b].controller === srcCtrl)) n *= 2;
  }
  const tgt = to.kind === 'player' ? { p: to.idx } : to.kind === 'card' ? { iid: to.iid } : {};
  const D = (dealt: number, extra: Record<string, any> = {}) => { ev(s, { k: 'damage', src: source, ...tgt, n: dealt, base, combat, ...extra }); (s as any).lastDealt = dealt; if (dealt > 0) emit(s, 'dealt', { source, to, n: dealt, combat }); return dealt; };
  // "Prevent the next N damage" shields
  const key = to.kind === 'player' ? `p${to.idx}` : to.kind === 'card' ? to.iid : '';
  let prevented = 0;
  const noPrev = (s as any).noPreventTurn === s.turn;
  for (const sh of (noPrev ? [] : (s as any).prevent ?? []) as { key: string; n: number }[]) {
    if (sh.key !== key || sh.n <= 0 || n <= 0) continue;
    const k = Math.min(sh.n, n);
    sh.n -= k;
    n -= k;
    prevented += k;
  }
  if (prevented && n <= 0) return D(0, { prevented });
  if (to.kind === 'card' && s.cards[to.iid]?.zone === 'battlefield') {
    const tcard = s.cards[to.iid];
    if (!noPrev && chars(s, to.iid).pc.replacements.some((r) => r.k === 'preventSelf' && (!r.combat || combat))) return D(0, { prevented: n });
    if ((tcard.counters.shield ?? 0) > 0) {
      tcard.counters.shield--;
      log(s, `A shield counter on ${nm(s, to.iid)} prevents the damage.`, tcard.controller);
      return D(0, { prevented: n, shield: true });
    }
  }
  if (to.kind === 'player') return D(damagePlayer(s, source, to.idx, n, combat));
  if (to.kind !== 'card') return 0;
  const tc = s.cards[to.iid];
  if (!tc || tc.zone !== 'battlefield') return 0;
  const tch = chars(s, to.iid);
  if (!noPrev && protectedFrom(s, tch, source)) return D(0, { prevented: n });
  if (tch.types.has('creature')) {
    if (sc?.keywords.has('infect') || sc?.keywords.has('wither')) tc.counters['-1/-1'] = (tc.counters['-1/-1'] ?? 0) + n;
    else tc.damage += n;
    if (sc?.keywords.has('deathtouch')) tc.deathtouched = true;
  }
  if (tch.types.has('planeswalker')) tc.counters.loyalty = Math.max(0, (tc.counters.loyalty ?? 0) - n);
  if (tch.types.has('battle')) tc.counters.defense = Math.max(0, (tc.counters.defense ?? 0) - n);
  return D(n);
}

function afterDamage(s: GameState, source: string, dealt: number, controller: PlayerIdx) {
  if (dealt <= 0) return;
  const src = s.cards[source];
  if (src && chars(s, source).keywords.has('lifelink')) gainLife(s, controller, dealt);
}

/** Regeneration (rule 701.19): replace destruction with tapping, removing damage and leaving combat. */
function tryRegenerate(s: GameState, iid: string): boolean {
  const c = s.cards[iid] as any;
  if (!c || !(c.regen > 0) || c.cantRegen) return false;
  c.regen--;
  c.tapped = true;
  c.damage = 0;
  c.deathtouched = false;
  if (s.combat) {
    s.combat.attackers = s.combat.attackers.filter((a) => a.iid !== iid);
    for (const a of s.combat.attackers) a.blockedBy = a.blockedBy.filter((b) => b !== iid);
  }
  log(s, `${nm(s, iid)} regenerates.`, c.controller);
  ev(s, { k: 'regenerate', iid });
  return true;
}

function destroy(s: GameState, iid: string): boolean {
  const c = s.cards[iid];
  if (!c || c.zone !== 'battlefield') return false;
  if (chars(s, iid).keywords.has('indestructible')) return false;
  if ((c.counters.shield ?? 0) > 0) {
    c.counters.shield--;
    log(s, `A shield counter saves ${nm(s, iid)}.`, c.controller);
    ev(s, { k: 'shield', iid });
    return false;
  }
  if (tryRegenerate(s, iid)) return false;
  const umbra = s.battlefield.find((b) => s.cards[b].attachedTo === iid && baseChars(s, b).pc.replacements.some((r) => r.k === 'umbra'));
  if (umbra) {
    c.damage = 0;
    c.deathtouched = false;
    log(s, `${nm(s, umbra)} is destroyed instead of ${nm(s, iid)}.`, c.controller);
    ev(s, { k: 'umbra', iid, aura: umbra });
    moveCard(s, umbra, 'graveyard');
    return false;
  }
  moveCard(s, iid, 'graveyard', { cause: 'destroy' });
  return true;
}

// ---- effect execution ----

function execEffect(s: GameState, item: StackItem, e: Effect, r: any): 'done' | 'wait' {
  const you = item.controller;
  switch (e.k) {
    case 'damage': {
      const n = amount(s, item, e.n);
      const src = e.from && e.from.t !== 'self' ? subjCards(s, item, e.from)[0] ?? item.source : item.source;
      let total = 0;
      const specs: TargetSpec[] = (item as any).specs ?? [];
      const div = e.to.length === 1 && e.to[0].t === 'target' ? specs[(e.to[0] as any).spec] : undefined;
      const divTargets = div?.divided ? item.targets[(e.to[0] as any).spec] ?? [] : [];
      if (div?.divided && divTargets.length > 1) {
        if (!r.sub?.answer) {
          r.sub = {};
          pushPrompt(s, { id: uid(s, 'p'), player: you, kind: 'divide', title: `Divide ${n} damage among the targets`, targets: divTargets, min: n, max: n, data: { ctx: 'resolve' } });
          return 'wait';
        }
        const alloc: number[] = r.sub.answer;
        divTargets.forEach((t, i) => (total += dealDamage(s, src, t, Math.max(0, alloc[i] ?? 0), false)));
        afterDamage(s, src, total, s.cards[src]?.controller ?? you);
        log(s, `${item.label} deals ${n} damage divided among ${divTargets.length} targets.`, you);
        return 'done';
      }
      for (const to of e.to) {
        const cards = subjCards(s, item, to);
        const players = subjPlayers(s, item, to);
        for (const c of cards) total += dealDamage(s, src, { kind: 'card', iid: c }, n, false);
        for (const p of players) total += dealDamage(s, src, { kind: 'player', idx: p }, n, false);
        if (to.t === 'all' && to.players) for (const p of subjPlayers(s, item, to)) void p;
      }
      afterDamage(s, src, total, s.cards[src]?.controller ?? you);
      log(s, `${item.label} deals ${n} damage.`, you);
      return 'done';
    }
    case 'draw': {
      for (const p of subjPlayers(s, item, e.who)) drawCards(s, p, amount(s, item, e.n));
      return 'done';
    }
    case 'gain': {
      for (const p of subjPlayers(s, item, e.who)) gainLife(s, p, amount(s, item, e.n));
      return 'done';
    }
    case 'lose': {
      for (const p of subjPlayers(s, item, e.who)) loseLife(s, p, amount(s, item, e.n));
      return 'done';
    }
    case 'destroy': {
      // "… It can't be regenerated.": that destruction ignores regeneration shields
      if ((e as any).noRegen) for (const c of subjCards(s, item, e.what)) if (s.cards[c]) { (s.cards[c] as any).cantRegen = true; (s.cards[c] as any).cantRegenTurn = s.turn; }
      let nd = 0;
      const dTypes: string[] = [];
      for (const c of subjCards(s, item, e.what)) { const ty = s.cards[c] ? [...chars(s, c).types] : []; if (destroy(s, c)) { nd++; dTypes.push(...ty); ((item as any).destroyedList ??= []).push(c); log(s, `${nm(s, c) ?? 'A permanent'} is destroyed.`, you); } }
      (item as any).destroyedN = ((item as any).destroyedN ?? 0) + nd;
      (item as any).destroyedCreatures = ((item as any).destroyedCreatures ?? 0) + dTypes.filter((t) => t === 'creature').length;
      return 'done';
    }
    case 'exile': {
      for (const c of subjCards(s, item, e.what)) {
        log(s, `${nm(s, c)} is exiled.`, you);
        const wasToken = s.cards[c].token;
        moveCard(s, c, 'exile');
        if (wasToken) continue;
        ((item as any).exiledHere ??= []).push(c);
        const srcCard = s.cards[item.source];
        if (!srcCard || srcCard.iid === c) continue;
        if (e.linked) {
          if (srcCard.zone !== 'battlefield') {
            // source already gone: the card comes right back (rule 610.3c)
            moveCard(s, c, 'battlefield', { controller: s.cards[c].owner });
            continue;
          }
          (srcCard.linked ??= []).push(c);
        } else ((srcCard as any).remembered ??= []).push(c); // remembered for a later return-the-exiled-card effect
      }
      return 'done';
    }
    case 'bounce': {
      for (const c of subjCards(s, item, e.what)) {
        log(s, `${nm(s, c)} returns to its owner's hand.`, you);
        moveCard(s, c, 'hand');
      }
      return 'done';
    }
    case 'toLibrary': {
      for (const c of subjCards(s, item, e.what)) moveCard(s, c, e.top ? 'libraryTop' : 'libraryBottom');
      return 'done';
    }
    case 'reanimate': {
      for (const c of subjCards(s, item, e.what)) {
        const cc = s.cards[c];
        if (cc.zone !== 'graveyard' && cc.zone !== 'exile') continue;
        if (e.dest === 'hand') {
          log(s, `${nm(s, c)} returns to hand.`, you);
          moveCard(s, c, 'hand');
          continue;
        }
        const ctrl = e.owner ? cc.owner : you;
        if (e.transformed) {
          const d = s.defs[cc.defId];
          if (d.faces?.length && d.layout === 'transform') cc.face = 1;
        }
        const face = cc.face;
        cc.zone = cc.zone; // keep
        log(s, `${nm(s, c)} returns to the battlefield${e.transformed ? ' transformed' : ''}.`, you);
        // counters placed "with" the return go on as it enters
        moveCard(s, c, 'battlefield', { controller: ctrl, tapped: e.tapped });
        if (e.transformed) cc.face = face;
        for (const [k, v] of Object.entries(e.counters ?? {})) addCounters(s, c, k, v);
      }
      return 'done';
    }
    case 'counterSpell': {
      const ts = e.what.t === 'target' ? item.targets[e.what.spec] ?? [] : [];
      for (const t of ts) {
        if (t.kind !== 'stack') continue;
        const it = s.stack.find((x) => x.id === t.id);
        if (!it) continue;
        if (it.kind === 'spell' && (chars(s, it.source).pc.cantBeCountered || (s.cards[it.source] as any)?.uncounterable)) {
          log(s, `${it.label} can't be countered.`);
          continue;
        }
        const up = e.unlessPay != null ? amount(s, item, e.unlessPay as any) : null;
        if (up != null && up > 0) {
          if (r.sub?.answered === undefined) {
            if (canAfford(s, it.controller, `{${up}}`)) {
              r.sub = { waiting: true };
              pushPrompt(s, { id: uid(s, 'p'), player: it.controller, kind: 'yesno', title: `Pay {${up}} to prevent ${it.label} from being countered?`, options: [{ id: 'yes', label: `Pay {${up}}` }, { id: 'no', label: "Don't pay" }], data: { ctx: 'resolve' } });
              return 'wait';
            }
          } else if (r.sub.answered === 'yes') {
            if (!payMana(s, it.controller, `{${up}}`, 0)) {
              log(s, `${pname(s, it.controller)} pays {${up}}.`, it.controller);
              continue;
            }
          }
        }
        counterItem(s, it);
      }
      return 'done';
    }
    case 'pump': {
      const p = amount(s, item, e.p) * (e.neg || (e as any).negP ? -1 : 1);
      const t = amount(s, item, e.t) * (e.neg || (e as any).negT ? -1 : 1);
      for (const c of subjCards(s, item, e.what)) {
        s.cards[c].mods.push({ power: p, toughness: t, keywords: e.kw.length ? e.kw : undefined, until: e.eot ? 'eot' : 'permanent', source: item.source });
      }
      return 'done';
    }
    case 'cantBlock': {
      for (const c of subjCards(s, item, e.what)) s.cards[c].mods.push({ cantBlock: true, until: 'eot' });
      return 'done';
    }
    case 'counters': {
      const n = amount(s, item, e.n);
      for (const c of subjCards(s, item, e.what)) addCounters(s, c, e.counter, n);
      return 'done';
    }
    case 'proliferate': {
      ev(s, { k: 'proliferate', p: you });
      emit(s, 'proliferate', { p: you });
      for (const b of [...s.battlefield]) {
        const c = s.cards[b];
        for (const k of Object.keys(c.counters)) {
          if (!(c.counters[k] > 0)) continue;
          const good = k !== '-1/-1' && k !== 'stun';
          if ((c.controller === you) === good) addCounters(s, b, k, 1);
        }
      }
      if (P(s, opp(you)).poison > 0) P(s, opp(you)).poison++;
      for (const k of Object.keys(P(s, you).counters)) if (P(s, you).counters[k] > 0 && k !== 'rad') P(s, you).counters[k]++;
      return 'done';
    }
    case 'token': {
      let total = 0;
      for (const p of subjPlayers(s, item, e.who)) {
        let spec = e.token;
        for (const h of EXT.hooks.tokenSpec) spec = h(s, p, spec, api) ?? spec;
        let n = tokenCount(s, p, amount(s, item, e.n));
        for (const h of EXT.hooks.tokenMult) n *= h(s, p, spec, api) ?? 1;
        total += n;
        if (n > 0) for (const h of EXT.hooks.tokensMade) h(s, p, n, spec, api);
        for (let i = 0; i < n; i++) {
          const tk = createToken(s, p, spec, e.tapped);
          ((item as any).lastTokens ??= []).push(tk);
          if (e.attacking && s.combat && s.active === p) s.combat.attackers.push({ iid: tk, target: { kind: 'player', idx: opp(p) }, blockedBy: [], blocked: false });
        }
      }
      log(s, `${pname(s, you)} creates ${total} ${e.token.name} token${total !== 1 ? 's' : ''}.`, you);
      return 'done';
    }
    case 'tap':
    case 'untap': {
      for (const c of subjCards(s, item, e.what)) {
        const was = s.cards[c].tapped;
        s.cards[c].tapped = e.k === 'tap';
        if (was && e.k === 'untap') emit(s, 'untapped', { iid: c });
      }
      return 'done';
    }
    case 'skipUntap': {
      for (const c of subjCards(s, item, e.what)) s.cards[c].skipUntap = true;
      return 'done';
    }
    case 'discard': {
      const players = subjPlayers(s, item, e.who);
      r.sub ??= { pi: 0 };
      while (r.sub.pi < players.length) {
        const p = players[r.sub.pi];
        const hand = P(s, p).hand;
        const n = Math.min(amount(s, item, e.n), hand.length);
        if (n <= 0) { r.sub.pi++; continue; }
        if (e.hand || n >= hand.length) {
          for (const h of [...hand]) moveCard(s, h, 'graveyard', { cause: 'discard' });
          log(s, `${pname(s, p)} discards ${n} card${n > 1 ? 's' : ''}.`, p);
          r.sub.pi++;
          continue;
        }
        if (e.random) {
          for (let i = 0; i < n; i++) {
            const h = hand[Math.floor(rand(s) * hand.length)];
            log(s, `${pname(s, p)} discards ${nm(s, h)} at random.`, p);
            moveCard(s, h, 'graveyard', { cause: 'discard' });
          }
          r.sub.pi++;
          continue;
        }
        if (r.sub.answer) {
          for (const h of r.sub.answer) {
            log(s, `${pname(s, p)} discards ${nm(s, h)}.`, p);
            moveCard(s, h, 'graveyard', { cause: 'discard' });
          }
          r.sub.answer = null;
          r.sub.pi++;
          continue;
        }
        pushPrompt(s, { id: uid(s, 'p'), player: p, kind: 'chooseCards', title: `Discard ${n} card${n > 1 ? 's' : ''}`, cards: [...hand], min: n, max: n, data: { ctx: 'resolve' } });
        return 'wait';
      }
      return 'done';
    }
    case 'mill': {
      for (const p of subjPlayers(s, item, e.who)) {
        const n = amount(s, item, e.n);
        for (let i = 0; i < n; i++) {
          const top = P(s, p).library[0];
          if (top) { moveCard(s, top, 'graveyard'); ((item as any).milled ??= []).push(top); }
        }
        log(s, `${pname(s, p)} mills ${n}.`, p);
      }
      return 'done';
    }
    case 'scry':
    case 'surveil': {
      const n = amount(s, item, e.n);
      const lib = P(s, you).library;
      const top = lib.slice(0, n);
      if (!top.length) return 'done';
      if (r.sub?.answer) {
        const toBottom: string[] = r.sub.answer;
        for (const iid of toBottom) moveCard(s, iid, e.k === 'scry' ? 'libraryBottom' : 'graveyard');
        log(s, `${pname(s, you)} ${e.k}s ${n}: ${top.length - toBottom.length} on top, ${toBottom.length} ${e.k === 'scry' ? 'on the bottom' : 'into the graveyard'}.`, you);
        emit(s, e.k, { p: you });
        return 'done';
      }
      r.sub = {};
      pushPrompt(s, { id: uid(s, 'p'), player: you, kind: 'chooseCards', title: e.k === 'scry' ? `Scry ${n}: choose cards to put on the bottom` : `Surveil ${n}: choose cards to put into your graveyard`, cards: top, min: 0, max: top.length, data: { ctx: 'resolve' } });
      return 'wait';
    }
    case 'search': {
      const lib = P(s, you).library;
      if (r.sub?.answer) {
        for (const iid of r.sub.answer as string[]) {
          if (e.dest === 'battlefield') moveCard(s, iid, 'battlefield', { controller: you, tapped: e.tapped });
          else if (e.dest === 'hand') moveCard(s, iid, 'hand');
          else moveCard(s, iid, 'libraryTop');
          log(s, `${pname(s, you)} searches and finds ${nm(s, iid)}.`, you);
        }
        if (e.dest !== 'libraryTop') shuffleArr(s, P(s, you).library);
        else {
          // shuffle rest then put found on top
          const found = r.sub.answer as string[];
          const rest = P(s, you).library.filter((x) => !found.includes(x));
          shuffleArr(s, rest);
          P(s, you).library.splice(0, P(s, you).library.length, ...found, ...rest);
        }
        return 'done';
      }
      const cands = lib.filter((iid) => matchesFilter(s, iid, { ...e.filter, zone: 'library' }, you));
      r.sub = {};
      pushPrompt(s, { id: uid(s, 'p'), player: you, kind: 'chooseCards', title: `Search your library (${cands.length} match${cands.length === 1 ? '' : 'es'})`, cards: cands, min: 0, max: Math.min(e.n, cands.length), data: { ctx: 'resolve' } });
      return 'wait';
    }
    case 'shuffle': {
      shuffleArr(s, P(s, you).library);
      return 'done';
    }
    case 'addMana': {
      const pool = P(s, you).pool;
      if ((e.colors as any) === 'chosen') {
        const col = ((s.cards[item.source] as any)?.chosenColor ?? 'C') as Color;
        pool[col] += Math.max(1, e.n);
        return 'done';
      }
      if (e.colors === 'any' || e.colors === 'anyOne' || e.n === -1) {
        if (r.sub?.answer) {
          const col = r.sub.answer as Color;
          pool[col] += e.n === -1 ? 1 : e.n;
          return 'done';
        }
        r.sub = {};
        const opts = (e as any).identity ? (effProduces(s, you, item.source, { produces: [COLORS], ability: { identity: true } })[0] ?? []) : Array.isArray(e.colors) ? e.colors : COLORS;
        if (!opts.length) return 'done';
        pushPrompt(s, { id: uid(s, 'p'), player: you, kind: 'color', title: 'Choose a color of mana', options: opts.map((c) => ({ id: c, label: c })), data: { ctx: 'resolve' } });
        return 'wait';
      }
      for (const c of e.colors) pool[c]++;
      return 'done';
    }
    case 'fight': {
      const a = subjCards(s, item, e.a)[0];
      const b = subjCards(s, item, e.b)[0];
      if (!a || !b || s.cards[a].zone !== 'battlefield' || s.cards[b].zone !== 'battlefield') return 'done';
      const pa = chars(s, a).power;
      const pb = chars(s, b).power;
      const da = dealDamage(s, a, { kind: 'card', iid: b }, pa, false);
      const db = dealDamage(s, b, { kind: 'card', iid: a }, pb, false);
      afterDamage(s, a, da, s.cards[a].controller);
      afterDamage(s, b, db, s.cards[b].controller);
      log(s, `${nm(s, a)} fights ${nm(s, b)}.`, you);
      return 'done';
    }
    case 'sacrifice': {
      const players = subjPlayers(s, item, e.who);
      r.sub ??= { pi: 0 };
      while (r.sub.pi < players.length) {
        const p = players[r.sub.pi];
        const cands = s.battlefield.filter((b) => s.cards[b].controller === p && matchesFilter(s, b, { ...e.filter, controller: undefined }, p, item.source));
        // "… If you can't, …": not enough to sacrifice
        if (players.length === 1) (item as any).didLast = cands.length >= (e.n ?? 1);
        if (!cands.length) { r.sub.pi++; continue; }
        if (r.sub.answer) {
          for (const c of r.sub.answer) {
            log(s, `${pname(s, p)} sacrifices ${nm(s, c)}.`, p);
            moveCard(s, c, 'graveyard', { cause: 'sacrifice' });
          }
          r.sub.answer = null;
          r.sub.pi++;
          continue;
        }
        if (cands.length <= e.n) {
          for (const c of cands) {
            log(s, `${pname(s, p)} sacrifices ${nm(s, c)}.`, p);
            moveCard(s, c, 'graveyard', { cause: 'sacrifice' });
          }
          r.sub.pi++;
          continue;
        }
        pushPrompt(s, { id: uid(s, 'p'), player: p, kind: 'chooseCards', title: `Sacrifice ${e.n}`, cards: cands, min: e.n, max: e.n, data: { ctx: 'resolve' } });
        return 'wait';
      }
      return 'done';
    }
    case 'sacSelf': {
      if (s.cards[item.source]?.zone === 'battlefield') moveCard(s, item.source, 'graveyard');
      return 'done';
    }
    case 'gainControl': {
      for (const c of subjCards(s, item, e.what)) {
        const cc = s.cards[c];
        if (e.whileYouControl) {
          if (s.cards[item.source]?.zone !== 'battlefield') continue;
          cc.mods.push({ until: 'whileSourceControlled', setController: cc.controller, source: item.source });
        }
        if (e.eot) cc.mods.push({ until: 'eot', setController: cc.controller });
        cc.controller = you;
        cc.sick = true;
        log(s, `${pname(s, you)} gains control of ${nm(s, c)}.`, you);
        ev(s, { k: 'control', iid: c, to: you });
      }
      return 'done';
    }
    case 'may': {
      // "You may X. Do this only once each turn." — declining doesn't use up the turn's chance
      const onceKey = (e as any).once ? `${item.source}:${e.text}` : null;
      const onceUsed = ((s as any).mayOnce ??= {});
      if (onceKey && onceUsed[onceKey] === s.turn && !r.sub) {
        (item as any).didLast = false;
        return 'done';
      }
      if (r.sub?.answered === 'yes') {
        if (onceKey) onceUsed[onceKey] = s.turn;
        (item as any).didLast = true;
        // splice inner effects in place of this one
        item.effects.splice(r.i, 1, ...e.effects);
        r.sub = null;
        return execEffect(s, item, item.effects[r.i], r);
      }
      if (r.sub?.answered === 'no') {
        (item as any).didLast = false;
        return 'done';
      }
      r.sub = {};
      pushPrompt(s, { id: uid(s, 'p'), player: you, kind: 'yesno', title: `${item.label}: you may ${e.text}`, options: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }], data: { ctx: 'resolve' } });
      return 'wait';
    }
    case 'fog': {
      (s as any).fog = true;
      return 'done';
    }
    case 'extraTurn': {
      ((s as any).extraTurns ??= []).push(you);
      log(s, `${pname(s, you)} will take an extra turn.`, you);
      return 'done';
    }
    case 'if': {
      if (e.cond.k === 'flip') {
        if (!!(item as any).flipWon !== e.cond.won) return 'done';
      } else if (e.cond.k === 'youDid') {
        const did = (item as any).didLast !== false;
        if (did === !!e.cond.not) return 'done';
      } else if ((e.cond as any).k === 'itemFlag') {
        // a condition evaluated once, earlier in the same resolution ("… instead if …")
        if (!!(item as any).flags?.[(e.cond as any).id] === !!(e.cond as any).not) return 'done';
      } else if (!evalCond(s, e.cond, you, item.source, { x: item.x, item })) return 'done';
      item.effects.splice(r.i, 1, ...e.effects);
      r.sub = null;
      return item.effects[r.i] ? execEffect(s, item, item.effects[r.i], r) : 'done';
    }
    case 'adapt': {
      const c = s.cards[item.source];
      if (c?.zone === 'battlefield' && !(c.counters['+1/+1'] > 0)) addCounters(s, item.source, '+1/+1', e.n);
      return 'done';
    }
    case 'bolster': {
      const mine = s.battlefield.filter((b) => s.cards[b].controller === you && chars(s, b).types.has('creature'));
      if (!mine.length) return 'done';
      const least = Math.min(...mine.map((b) => chars(s, b).toughness));
      const cands = mine.filter((b) => chars(s, b).toughness === least);
      if (cands.length > 1 && !r.sub?.answer) {
        r.sub = {};
        pushPrompt(s, { id: uid(s, 'p'), player: you, kind: 'chooseCards', title: `Bolster ${e.n}: choose a creature with the least toughness`, cards: cands, min: 1, max: 1, data: { ctx: 'resolve' } });
        return 'wait';
      }
      addCounters(s, (r.sub?.answer ?? cands)[0], '+1/+1', e.n);
      return 'done';
    }
    case 'energy': {
      const n = amount(s, item, e.n);
      P(s, you).counters.energy = (P(s, you).counters.energy ?? 0) + n;
      ev(s, { k: 'pcounter', p: you, counter: 'energy', n });
      if (n > 0) emit(s, 'energyGot', { p: you, n });
      return 'done';
    }
    case 'playerCounter': {
      for (const p of subjPlayers(s, item, e.who)) {
        const n = amount(s, item, e.n);
        if (e.counter === 'poison') P(s, p).poison += n;
        else P(s, p).counters[e.counter] = (P(s, p).counters[e.counter] ?? 0) + n;
        ev(s, { k: 'pcounter', p, counter: e.counter, n });
      }
      return 'done';
    }
    case 'animate': {
      for (const c of subjCards(s, item, e.what)) {
        s.cards[c].mods.push({ addTypes: e.types, addSubtypes: e.subtypes, colors: e.colors, setPT: e.p != null ? [e.p, e.t ?? e.p] : undefined, keywords: e.kw.length ? e.kw : undefined, until: e.eot ? 'eot' : 'permanent', source: item.source, ts: s.ts++ });
        ev(s, { k: 'animate', iid: c, eot: !!e.eot });
      }
      return 'done';
    }
    case 'setPT': {
      for (const c of subjCards(s, item, e.what)) s.cards[c].mods.push({ setPT: [e.p, e.t], until: e.eot ? 'eot' : 'permanent', source: item.source, ts: s.ts++ });
      return 'done';
    }
    case 'loseAbilities': {
      for (const c of subjCards(s, item, e.what)) {
        s.cards[c].mods.push({ loseAbilities: true, until: e.eot ? 'eot' : 'permanent', source: item.source, ts: s.ts++ });
        ev(s, { k: 'loseAbilities', iid: c });
      }
      return 'done';
    }
    case 'exchangeControl': {
      const a = subjCards(s, item, e.a)[0];
      const b = subjCards(s, item, e.b)[0];
      if (!a || !b || s.cards[a].zone !== 'battlefield' || s.cards[b].zone !== 'battlefield') return 'done';
      const ca = s.cards[a].controller;
      const cb = s.cards[b].controller;
      if (ca === cb) return 'done';
      s.cards[a].controller = cb;
      s.cards[b].controller = ca;
      s.cards[a].sick = s.cards[b].sick = true;
      log(s, `${nm(s, a)} and ${nm(s, b)} exchange controllers.`, you);
      return 'done';
    }
    case 'tokenCopy': {
      const n = tokenCount(s, you, amount(s, item, e.n));
      for (const c of subjCards(s, item, e.what)) {
        for (let i = 0; i < n; i++) ((item as any).lastTokens ??= []).push(copyToken(s, you, c, {}, e.tapped));
        log(s, `${pname(s, you)} creates ${n} token cop${n === 1 ? 'y' : 'ies'} of ${nm(s, c)}.`, you);
      }
      return 'done';
    }
    case 'populate': {
      const cands = s.battlefield.filter((b) => s.cards[b].token && s.cards[b].controller === you && chars(s, b).types.has('creature'));
      if (!cands.length) return 'done';
      if (cands.length > 1 && !r.sub?.answer) {
        r.sub = {};
        pushPrompt(s, { id: uid(s, 'p'), player: you, kind: 'chooseCards', title: 'Populate: choose a creature token to copy', cards: cands, min: 1, max: 1, data: { ctx: 'resolve' } });
        return 'wait';
      }
      const pick = (r.sub?.answer ?? cands)[0];
      for (let i = 0; i < tokenCount(s, you, 1); i++) copyToken(s, you, pick, {});
      log(s, `${pname(s, you)} populates (${nm(s, pick)}).`, you);
      return 'done';
    }
    case 'exileTop': {
      const n = amount(s, item, e.n);
      const got: string[] = [];
      const whos: PlayerIdx[] = (e as any).who ? subjPlayers(s, item, (e as any).who) : [you];
      for (const w of whos) {
        for (let i = 0; i < n; i++) {
          const top = P(s, w).library[0];
          if (!top) break;
          moveCard(s, top, 'exile');
          got.push(top);
        }
      }
      (item as any).exiledTop = got;
      if (got.length) log(s, `${pname(s, you)} exiles ${got.map((g) => nm(s, g)).join(', ')} from the top of ${(e as any).who ? 'a library' : 'their library'}.`, you);
      return 'done';
    }
    case 'mayPlay': {
      const until = (e as any).until === 'forever' ? 1e9 : e.until === 'eot' ? s.turn : s.active === you ? s.turn + 2 : s.turn + 1;
      for (const c of subjCards(s, item, e.what)) s.cards[c].mayPlay = { player: you, untilTurn: until, ...((e as any).free ? { free: true } : {}), ...((e as any).anyType ? { anyType: true } : {}), ...((e as any).exileAfter ? { exileAfter: true } : {}), ...((e as any).castOnly ? { castOnly: true } : {}) } as any;
      return 'done';
    }
    case 'returnLinked': {
      const src = s.cards[item.source];
      const list = [...(src?.linked ?? []), ...((src as any)?.remembered ?? [])];
      if (src) { src.linked = []; (src as any).remembered = []; }
      for (const l of list) if (s.cards[l]?.zone === 'exile') moveCard(s, l, 'battlefield', { controller: s.cards[l].owner });
      return 'done';
    }
    case 'delayed': {
      s.delayed.push({ at: e.at, controller: you, source: item.source, label: item.label, effects: clone(e.effects), targets: clone(item.targets), refs: [...((item as any).exiledHere ?? []), ...((item as any).lastTokens ?? [])], ...((e as any).yours ? { yours: true } : {}), ...((e as any).yours && e.at === 'nextEnd' && s.active === you && ['end', 'cleanup'].includes(s.step) ? { notBefore: s.turn + 1 } : {}) } as any);
      return 'done';
    }
    case 'attach': {
      const what = subjCards(s, item, e.what)[0];
      const to = subjCards(s, item, e.to)[0];
      if (what && to && s.cards[what].zone === 'battlefield' && s.cards[to].zone === 'battlefield') {
        s.cards[what].attachedTo = to;
        log(s, `${nm(s, what)} is attached to ${nm(s, to)}.`, you);
      }
      return 'done';
    }
    case 'transform': {
      for (const c of subjCards(s, item, e.what)) if (s.cards[c].zone === 'battlefield') transformCard(s, c);
      return 'done';
    }
    case 'manifest': {
      const lib = P(s, you).library;
      if (e.dread) {
        const top = lib.slice(0, 2);
        if (!top.length) return 'done';
        if (top.length > 1 && !r.sub?.answer) {
          r.sub = {};
          pushPrompt(s, { id: uid(s, 'p'), player: you, kind: 'chooseCards', title: 'Manifest dread: choose the card to manifest (the other goes to your graveyard)', cards: top, min: 1, max: 1, data: { ctx: 'resolve' } });
          return 'wait';
        }
        const pick = (r.sub?.answer ?? top)[0];
        for (const o of top) if (o !== pick) moveCard(s, o, 'graveyard');
        manifestCard(s, you, pick, false);
        return 'done';
      }
      for (let i = 0; i < e.n; i++) {
        const top = lib[0];
        if (top) manifestCard(s, you, top, !!e.cloak);
      }
      return 'done';
    }
    case 'vanishing': {
      const c = s.cards[item.source];
      if (!c || c.zone !== 'battlefield') return 'done';
      if ((c.counters.time ?? 0) > 0) c.counters.time--;
      if ((c.counters.time ?? 0) <= 0) {
        log(s, `${nm(s, item.source)} vanishes (last time counter removed).`, you);
        moveCard(s, item.source, 'graveyard');
      }
      return 'done';
    }
    case 'fading': {
      const c = s.cards[item.source];
      if (!c || c.zone !== 'battlefield') return 'done';
      if ((c.counters.fade ?? 0) > 0) c.counters.fade--;
      else {
        log(s, `${nm(s, item.source)} fades away.`, you);
        moveCard(s, item.source, 'graveyard');
      }
      return 'done';
    }
    case 'cumulativeUpkeep':
    case 'echo': {
      const c = s.cards[item.source];
      if (!c || c.zone !== 'battlefield') return 'done';
      let cost = e.cost;
      if (e.k === 'cumulativeUpkeep') {
        if (!r.sub) addCounters(s, item.source, 'age', 1, true);
        const n = c.counters.age ?? 1;
        cost = cost.repeat(n);
      }
      if (!r.sub) {
        r.sub = {};
        if (!canAfford(s, you, cost)) {
          log(s, `${pname(s, you)} can't pay ${cost} and sacrifices ${nm(s, item.source)}.`, you);
          moveCard(s, item.source, 'graveyard');
          return 'done';
        }
        pushPrompt(s, { id: uid(s, 'p'), player: you, kind: 'yesno', title: `${nm(s, item.source)}: pay ${cost} or sacrifice it`, options: [{ id: 'yes', label: `Pay ${cost}` }, { id: 'no', label: 'Sacrifice it' }], data: { ctx: 'resolve' } });
        return 'wait';
      }
      if (r.sub.answered === 'yes' && !payMana(s, you, cost, 0)) {
        log(s, `${pname(s, you)} pays ${cost} for ${nm(s, item.source)}.`, you);
        c.echoDue = false;
      } else {
        log(s, `${pname(s, you)} sacrifices ${nm(s, item.source)}.`, you);
        moveCard(s, item.source, 'graveyard');
      }
      return 'done';
    }
    case 'renown': {
      const c = s.cards[item.source];
      if (c?.zone === 'battlefield' && !c.renowned) {
        addCounters(s, item.source, '+1/+1', e.n);
        c.renowned = true;
      }
      return 'done';
    }
    case 'livingWeapon': {
      const germ = createToken(s, you, { name: 'Phyrexian Germ', power: '0', toughness: '0', colors: ['B'], types: 'Token Creature — Phyrexian Germ', keywords: [], oracle: '' });
      if (s.cards[item.source]?.zone === 'battlefield') s.cards[item.source].attachedTo = germ;
      return 'done';
    }
    case 'suspendTick': {
      const c = s.cards[item.source];
      if (!c || c.zone !== 'exile' || !c.suspended) return 'done';
      if ((c.counters.time ?? 0) > 0) { c.counters.time--; for (const t of parsedFor(s, c).triggers) if ((t.event as string) === 'timeOffExiled') queueTrigger(s, item.source, c.owner, t, {}); }
      if ((c.counters.time ?? 0) <= 0) {
        c.suspended = false;
        log(s, `${nm(s, item.source)}'s last time counter is removed — it's cast without paying its mana cost.`, c.owner);
        const err = beginCast(s, c.owner, item.source, 0, 'free');
        if (err) log(s, `Couldn't cast it: ${err}`, c.owner, 'warn');
        else if (chars(s, item.source).types.has('creature')) (s as any).suspendHaste = item.source;
      }
      return 'done';
    }
    case 'unearth': {
      const c = s.cards[item.source];
      if (!c || c.zone !== 'graveyard') return 'done';
      moveCard(s, item.source, 'battlefield', { controller: you });
      c.unearthed = true;
      c.mods.push({ keywords: ['haste'], until: 'permanent', ts: s.ts++ });
      s.delayed.push({ at: 'nextEnd', controller: you, source: item.source, label: `${nm(s, item.source)} — unearth`, effects: [{ k: 'exile', what: { t: 'self' } }], targets: [] });
      return 'done';
    }
    case 'embalm': {
      const def = s.defs[s.cards[item.source]?.defId];
      if (!def) return 'done';
      const tok = copyToken(s, you, item.source, e.eternalize ? { colors: ['B'], addSubtypes: ['zombie'], pt: ['4', '4'], noManaCost: true } : { colors: ['W'], addSubtypes: ['zombie'], noManaCost: true });
      log(s, `${pname(s, you)} creates a ${e.eternalize ? 'eternalized' : 'embalmed'} token of ${nm(s, tok)}.`, you);
      return 'done';
    }
    case 'reconfigure': {
      const c = s.cards[item.source];
      if (!c || c.zone !== 'battlefield') return 'done';
      if (e.attach) {
        const t = item.targets[0]?.[0];
        if (t?.kind === 'card' && s.cards[t.iid]?.zone === 'battlefield') c.attachedTo = t.iid;
      } else c.attachedTo = undefined;
      return 'done';
    }
    case 'cloneChoice': {
      const card = s.cards[item.source];
      const cl = card ? parsedFor(s, card).clone : undefined;
      if (!card || !cl) return 'done';
      if (!r.sub?.answer) {
        const cands = s.battlefield.filter((b) => matchesFilter(s, b, cl.filter, you));
        if (!cands.length) return 'done';
        r.sub = {};
        pushPrompt(s, { id: uid(s, 'p'), player: you, kind: 'chooseCards', title: `${nm(s, item.source)}: choose something to copy (or none)`, cards: cands, min: 0, max: 1, data: { ctx: 'resolve' } });
        return 'wait';
      }
      const pick = r.sub.answer[0];
      if (pick && s.cards[pick]) {
        const src = s.cards[pick];
        card.copyOf = src.copyOf ? { ...src.copyOf } : { defId: src.defId, face: src.face };
        log(s, `${pname(s, you)}'s ${s.defs[card.defId].name} enters as a copy of ${nm(s, pick)}.`, you);
      }
      return 'done';
    }
    case 'dig': {
      const sp = e.spec;
      // "look at the top three cards of target player's library" — someone else's library
      const libOwner = sp.owner ? (subjPlayers(s, item, sp.owner)[0] ?? you) : you;
      const lib = P(s, libOwner).library;
      const n = amount(s, item, sp.n);
      const top = lib.slice(0, n);
      if (!top.length) return 'done';
      if (sp.reveal) log(s, `${pname(s, you)} reveals ${top.map((t) => nm(s, t)).join(', ')}.`, you);
      let picked: string[] = [];
      if (sp.pick) {
        let cands = sp.pick.filter ? top.filter((t) => matchesFilter(s, t, { ...sp.pick!.filter, zone: 'library' }, you)) : top;
        if (sp.pick.dest === 'cast') cands = cands.filter((t) => !/\bLand\b/.test(s.defs[s.cards[t].defId].typeLine.split(' // ')[0]));
        if (sp.pick.all) picked = cands;
        else if (cands.length) {
          if (!r.sub?.answer) {
            r.sub = {};
            const need = sp.pick.upTo ? 0 : Math.min(sp.pick.count, cands.length);
            pushPrompt(s, {
              id: uid(s, 'p'), player: you, kind: 'chooseCards',
              title: sp.pick.dest === 'cast' ? `${item.label}: you may cast one for free` : `${item.label}: choose ${sp.pick.upTo ? 'up to ' : ''}${sp.pick.count >= 99 ? 'any number' : sp.pick.count} to put ${sp.pick.dest === 'hand' ? 'into your hand' : sp.pick.dest === 'battlefield' ? 'onto the battlefield' : sp.pick.dest === 'graveyard' ? 'into your graveyard' : sp.pick.dest === 'top' ? 'on top' : 'on the bottom'}`,
              cards: cands, min: need, max: Math.min(sp.pick.count, cands.length), data: { ctx: 'resolve' },
            });
            // show the whole look, not only the candidates
            (s.prompt as any).looked = top;
            return 'wait';
          }
          picked = r.sub.answer;
        }
      }
      const toCast = sp.pick?.dest === 'cast' ? picked : [];
      if (toCast.length) picked = [];
      for (const c of picked) {
        const d = sp.pick!.dest;
        if (d === 'hand') moveCard(s, c, 'hand');
        else if (d === 'battlefield') {
          moveCard(s, c, 'battlefield', { controller: you, tapped: sp.pick!.tapped });
          // "… onto the battlefield tapped and attacking": attacking whoever the source attacks (else the opponent)
          if ((sp.pick as any).attacking && s.combat && s.cards[c]?.zone === 'battlefield') {
            const tgt = s.combat.attackers.find((a) => a.iid === item.source)?.target ?? { kind: 'player', idx: opp(you) };
            s.combat.attackers.push({ iid: c, target: tgt, blockedBy: [] } as any);
          }
          const pcn = (sp as any).pickCounter;
          if (pcn && s.cards[c]?.zone === 'battlefield') addCounters(s, c, pcn.kind, pcn.n);
          const gk = (sp.pick as any).gainKw as string[] | undefined;
          if (gk && s.cards[c]?.zone === 'battlefield') s.cards[c].mods.push({ keywords: gk, until: 'eot', ts: s.ts++ } as any);
          if ((sp.pick as any).attachEquip && s.cards[c]?.zone === 'battlefield' && chars(s, c).subtypes.has('equipment')) ((item as any).equipToAttach ??= []).push(c);
        }
        else if (d === 'graveyard') moveCard(s, c, 'graveyard');
        else if (d === 'bottom') moveCard(s, c, 'libraryBottom');
        else if (d === 'exile') moveCard(s, c, 'exile');
        // 'top': it stays on top (the rest move away around it)
      }
      if (picked.length) log(s, `${pname(s, you)} takes ${picked.length} of the top ${top.length} card${top.length > 1 ? 's' : ''}.`, you);
      const rest = top.filter((t) => !picked.includes(t) && !toCast.includes(t) && s.cards[t]?.zone === 'library');
      if (sp.rest === 'bottom') {
        shuffleArr(s, rest);
        for (const c of rest) moveCard(s, c, 'libraryBottom');
      } else if (sp.rest === 'graveyard') for (const c of rest) moveCard(s, c, 'graveyard');
      else if (sp.rest === 'hand') for (const c of rest) moveCard(s, c, 'hand');
      else if (sp.rest === 'exile') for (const c of rest) moveCard(s, c, 'exile');
      // 'top': they stay on top in the same order
      for (const c of toCast) {
        if (s.cards[c]?.zone !== 'library') continue;
        moveCard(s, c, 'exile');
        const err = beginCast(s, you, c, 0, 'free');
        if (err) { log(s, `Couldn't cast ${nm(s, c)}: ${err}`, you, 'warn'); moveCard(s, c, 'libraryBottom'); }
      }
      return 'done';
    }
    case 'cascade': {
      if (!r.sub) {
        const mv = s.cards[item.source] ? chars(s, item.source).cmc : 99;
        const exiled: string[] = [];
        let hit: string | undefined;
        while (P(s, you).library.length) {
          const top = P(s, you).library[0];
          moveCard(s, top, 'exile');
          exiled.push(top);
          const d = s.defs[s.cards[top].defId];
          if (!/\bLand\b/.test(d.typeLine.split(' // ')[0]) && d.cmc < mv) { hit = top; break; }
        }
        r.sub = { exiled, hit };
        ev(s, { k: 'cascade', src: item.source, cards: exiled, hit });
        log(s, `Cascade exiles ${exiled.length} card${exiled.length === 1 ? '' : 's'}${hit ? ` and hits ${nm(s, hit)}` : ''}.`, you);
        if (hit) {
          pushPrompt(s, { id: uid(s, 'p'), player: you, kind: 'yesno', title: `Cascade: cast ${nm(s, hit)} without paying its mana cost?`, options: [{ id: 'yes', label: 'Cast it' }, { id: 'no', label: "Don't cast" }], cards: [hit], data: { ctx: 'resolve' } });
          return 'wait';
        }
      }
      const { exiled, hit } = r.sub;
      const rest = (exiled as string[]).filter((x) => x !== hit || r.sub.answered !== 'yes');
      shuffleArr(s, rest);
      for (const c of rest) if (s.cards[c]?.zone === 'exile') moveCard(s, c, 'libraryBottom');
      if (hit && r.sub.answered === 'yes') {
        const err = beginCast(s, you, hit, 0, 'free');
        if (err) {
          log(s, `Couldn't cast ${nm(s, hit)}: ${err}`, you, 'warn');
          moveCard(s, hit, 'libraryBottom');
        }
      }
      return 'done';
    }
    case 'levelUp': {
      const c = s.cards[item.source];
      if (c?.zone === 'battlefield') {
        c.classLevel = e.n;
        log(s, `${nm(s, item.source)} reaches level ${e.n}.`, you);
        ev(s, { k: 'level', iid: item.source, n: e.n });
        emit(s, 'classLevel', { iid: item.source, n: e.n });
      }
      return 'done';
    }
    case 'craft': {
      const c = s.cards[item.source];
      if (!c || c.zone !== 'exile') return 'done';
      const d = s.defs[c.defId];
      if (d.faces?.length && d.layout === 'transform') c.face = 1;
      const face = c.face;
      moveCard(s, item.source, 'battlefield', { controller: c.owner });
      c.face = face;
      log(s, `${pname(s, you)} crafts ${nm(s, item.source)}.`, you);
      ev(s, { k: 'craft', iid: item.source });
      return 'done';
    }
    case 'meld': {
      const self = s.cards[item.source];
      if (!self || self.zone !== 'battlefield' || self.owner !== you || self.controller !== you) return 'done';
      if (e.cond && !evalCond(s, e.cond, you, item.source)) return 'done';
      const partner = s.battlefield.find((b) => b !== item.source && s.cards[b].owner === you && s.cards[b].controller === you && s.defs[s.cards[b].defId].name.toLowerCase() === e.partner.toLowerCase());
      if (!partner) return 'done';
      const into = hooks.findCard?.(e.into);
      if (!into) {
        log(s, `Meld into ${e.into}: card not found in the database.`, you, 'warn');
        return 'done';
      }
      s.defs[into.id] = into;
      moveCard(s, item.source, 'exile');
      moveCard(s, partner, 'exile');
      self.copyOf = { defId: into.id };
      moveCard(s, item.source, 'battlefield', { controller: you });
      self.copyOf = { defId: into.id };
      self.meldedWith = partner;
      ev(s, { k: 'meld', iid: item.source, partner });
      log(s, `${pname(s, you)} melds them into ${into.name}.`, you);
      return 'done';
    }
    case 'flip': {
      const won = rand(s) < 0.5;
      (item as any).flipWon = won;
      emit(s, 'coinFlip', { p: you, won });
      log(s, `${pname(s, you)} flips a coin and ${won ? 'wins' : 'loses'} the flip.`, you);
      ev(s, { k: 'coin', p: you, won });
      return 'done';
    }
    case 'roll': {
      const n = 1 + Math.floor(rand(s) * e.sides);
      (item as any).rolled = n;
      log(s, `${pname(s, you)} rolls a d${e.sides}: ${n}.`, you);
      ev(s, { k: 'dice', p: you, sides: e.sides, n });
      emit(s, 'diceRolled', { p: you, sides: e.sides, n });
      const row = e.table.find((x) => n >= x.min && n <= x.max);
      if (row) item.effects.splice(r.i + 1, 0, ...clone(row.effects));
      return 'done';
    }
    case 'choose': {
      const c = s.cards[item.source] as any;
      if (!c) return 'done';
      if (r.sub?.answer != null || r.sub?.answered) {
        const v = r.sub.answer ?? r.sub.answered;
        const val = Array.isArray(v) ? v[0] : v;
        if (e.what === 'color') c.chosenColor = val;
        else if (e.what === 'creatureType') c.chosenType = val;
        else if (e.what === 'cardType') c.chosenCardType = val;
        else c.chosenLandType = val;
        log(s, `${pname(s, you)} chooses ${val} for ${nm(s, item.source)}.`, you);
        ev(s, { k: 'chosen', iid: item.source, value: val });
        return 'done';
      }
      r.sub = {};
      if (e.what === 'color') {
        pushPrompt(s, { id: uid(s, 'p'), player: you, kind: 'color', title: `${nm(s, item.source)}: choose a color`, options: ['W', 'U', 'B', 'R', 'G'].map((x) => ({ id: x, label: x })), data: { ctx: 'resolve' } });
        return 'wait';
      }
      let opts: string[] = [];
      if (e.what === 'creatureType') {
        const counts = new Map<string, number>();
        for (const [, cc] of Object.entries(s.cards)) {
          if (cc.owner !== you) continue;
          const d = s.defs[cc.defId];
          const tl = (d?.faces?.[0]?.typeLine ?? d?.typeLine ?? '');
          if (!/Creature|Kindred|Tribal/.test(tl) || !tl.includes('—')) continue;
          for (const st of tl.split('—')[1].trim().split(/\s+/)) counts.set(st.toLowerCase(), (counts.get(st.toLowerCase()) ?? 0) + 1);
        }
        opts = [...counts.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0]).slice(0, 12);
        for (const d of ['human', 'elf', 'goblin', 'zombie', 'soldier', 'wizard', 'dragon', 'merfolk', 'vampire', 'spirit']) if (opts.length < 16 && !opts.includes(d)) opts.push(d);
      } else if (e.what === 'cardType') opts = ['artifact', 'creature', 'enchantment', 'instant', 'land', 'planeswalker', 'sorcery', 'battle'];
      else opts = ['plains', 'island', 'swamp', 'mountain', 'forest'];
      pushPrompt(s, { id: uid(s, 'p'), player: you, kind: 'mode', title: `${nm(s, item.source)}: choose a ${e.what === 'creatureType' ? 'creature type' : e.what === 'cardType' ? 'card type' : 'basic land type'}`, options: opts.map((o) => ({ id: o, label: o[0].toUpperCase() + o.slice(1) })), min: 1, max: 1, data: { ctx: 'resolve' } });
      return 'wait';
    }
    case 'copySpell': {
      let orig: StackItem | undefined;
      if (e.what.t === 'target') {
        const t = (item.targets[e.what.spec] ?? [])[0];
        if (t?.kind === 'stack') orig = s.stack.find((x) => x.id === t.id);
      } else if (e.what.t === 'triggerObj') {
        const o = (item as any).triggerObj;
        orig = s.stack.find((x) => x.kind === 'spell' && x.source === o && !(x as any).isCopy);
      } else if (e.what.t === 'self') orig = s.stack.find((x) => x.kind === 'spell' && x.source === item.source && x.id !== item.id) ?? (item.kind === 'spell' ? item : undefined);
      if (!orig) return 'done';
      if (!r.sub) {
        const n = amount(s, item, e.n);
        const copies: StackItem[] = [];
        for (let k = 0; k < n; k++) {
          const cp: StackItem = { ...clone({ ...orig, effects: orig.effects }), id: uid(s, 's'), controller: you, label: `Copy of ${orig.label}` };
          (cp as any).isCopy = true;
          (cp as any).specs = clone((orig as any).specs ?? []);
          copies.push(cp);
        }
        log(s, `${pname(s, you)} copies ${orig.label}${copies.length > 1 ? ` ${copies.length} times` : ''}.`, you);
        r.sub = { copies, ci: 0, si: 0 };
        for (const cp of copies) ev(s, { k: 'copySpell', id: cp.id, src: cp.source });
      }
      // optionally choose new targets for each copy, spec by spec
      const st = r.sub;
      while (st.ci < st.copies.length) {
        const cp: StackItem = st.copies[st.ci];
        const specs: TargetSpec[] = (cp as any).specs ?? [];
        if (st.asked == null && specs.length) {
          if (st.answered == null) {
            pushPrompt(s, { id: uid(s, 'p'), player: you, kind: 'yesno', title: `${cp.label}: choose new targets?`, options: [{ id: 'yes', label: 'Choose new targets' }, { id: 'no', label: 'Keep the same targets' }], data: { ctx: 'resolve' } });
            return 'wait';
          }
          st.asked = st.answered === 'yes';
          st.answered = undefined;
        }
        if (st.asked && st.si < specs.length) {
          if (st.answer != null) {
            cp.targets[st.si] = st.answer;
            st.answer = null;
            st.si++;
            continue;
          }
          const legal = legalTargets(s, specs[st.si], you, cp.source);
          if (!legal.length) { st.si++; continue; }
          pushPrompt(s, { id: uid(s, 'p'), player: you, kind: 'targets', title: `${cp.label}: choose ${specs[st.si].label}`, targets: legal, min: specs[st.si].upTo ? 0 : Math.min(1, legal.length), max: specs[st.si].count, data: { ctx: 'resolve' } });
          return 'wait';
        }
        s.stack.push(cp);
        st.ci++;
        st.si = 0;
        st.asked = undefined;
      }
      return 'done';
    }
    case 'madnessCast': {
      const c = s.cards[e.iid];
      if (!c || c.zone !== 'exile') return 'done';
      const cost = (parsedFor(s, c) as any).madness;
      if (r.sub?.answered === 'yes') {
        const err = cost && !canAfford(s, c.owner, cost) ? 'not enough mana' : beginCast(s, c.owner, e.iid, 0, 'madness');
        if (err) {
          log(s, `Couldn't cast ${nm(s, e.iid)} for madness: ${err}`, c.owner, 'warn');
          moveCard(s, e.iid, 'graveyard');
        }
        return 'done';
      }
      if (r.sub?.answered === 'no') {
        moveCard(s, e.iid, 'graveyard');
        return 'done';
      }
      r.sub = {};
      pushPrompt(s, { id: uid(s, 'p'), player: c.owner, kind: 'yesno', title: `Madness: cast ${nm(s, e.iid)} for ${cost}?`, options: [{ id: 'yes', label: `Cast for ${cost}` }, { id: 'no', label: 'Put it into the graveyard' }], cards: [e.iid], data: { ctx: 'resolve' } });
      return 'wait';
    }
    case 'ninjutsu': {
      const src = s.cards[item.source];
      if (!src || src.zone !== 'hand' || !s.combat) return 'done';
      const unblocked = s.combat.attackers.filter((a) => a.blockedBy.length === 0 && s.cards[a.iid]?.controller === you);
      if (!unblocked.length) return 'done';
      let pick = unblocked[0].iid;
      if (unblocked.length > 1) {
        if (!r.sub?.answer) {
          r.sub = {};
          pushPrompt(s, { id: uid(s, 'p'), player: you, kind: 'chooseCards', title: 'Ninjutsu: return an unblocked attacker to your hand', cards: unblocked.map((a) => a.iid), min: 1, max: 1, data: { ctx: 'resolve' } });
          return 'wait';
        }
        pick = r.sub.answer[0];
      }
      const target = s.combat.attackers.find((a) => a.iid === pick)!.target;
      moveCard(s, pick, 'hand');
      moveCard(s, item.source, 'battlefield', { controller: you, tapped: true });
      s.combat.attackers.push({ iid: item.source, target, blockedBy: [] } as any);
      log(s, `${nm(s, item.source)} enters tapped and attacking (ninjutsu).`, you);
      return 'done';
    }
    case 'venture': {
      const pl = P(s, you) as any;
      if (e.initiative) {
        (s as any).initiative = you;
        log(s, `${pname(s, you)} takes the initiative.`, you, 'turn');
        ev(s, { k: 'initiative', p: you });
      }
      const dg = pl.dungeon;
      if (dg) {
        const d = s.defs[s.cards[dg.iid].defId];
        const rooms = dungeonRooms(d);
        const cur = rooms.find((x) => x.name === dg.room);
        if (cur && cur.next.length) {
          if (cur.next.length > 1 && r.sub?.answer == null) {
            r.sub = {};
            pushPrompt(s, { id: uid(s, 'p'), player: you, kind: 'mode', title: `${d.name}: choose the next room`, options: cur.next.map((n) => ({ id: n, label: `${n} — ${rooms.find((x) => x.name === n)?.effect ?? ''}` })), min: 1, max: 1, data: { ctx: 'resolve' } });
            return 'wait';
          }
          const nx = cur.next.length > 1 ? (Array.isArray(r.sub.answer) ? r.sub.answer[0] : r.sub.answer) : cur.next[0];
          const room = rooms.find((x) => x.name === nx);
          if (room) enterRoom(s, you, room);
          return 'done';
        }
        // completed: remove it and start a new one
        pl.dungeonsCompleted = (pl.dungeonsCompleted ?? 0) + 1;
        log(s, `${pname(s, you)} completes ${d.name}.`, you, 'turn');
        emit(s, 'dungeonDone', { p: you });
        pl.dungeon = null;
      }
      const choices = e.initiative || (s as any).initiative === you && pl.ventureUndercity ? ['Undercity'] : DUNGEONS;
      let name = choices[0];
      if (choices.length > 1) {
        if (r.sub?.answer == null) {
          r.sub = {};
          pushPrompt(s, { id: uid(s, 'p'), player: you, kind: 'mode', title: 'Venture into the dungeon: choose a dungeon', options: choices.map((n) => ({ id: n, label: n })), min: 1, max: 1, data: { ctx: 'resolve' } });
          return 'wait';
        }
        name = Array.isArray(r.sub.answer) ? r.sub.answer[0] : r.sub.answer;
      }
      const def = hooks.findCard?.(name) ?? (hooks.findToken?.(name) as any);
      if (!def || !/dungeon/i.test(def.typeLine ?? '')) {
        log(s, `${name}: dungeon not found in the card database.`, you, 'warn');
        return 'done';
      }
      s.defs[def.id] = def;
      const iid = uid(s);
      s.cards[iid] = newCardObj(iid, def.id, you, 'command' as any);
      pl.dungeon = { iid, room: '' };
      const rooms = dungeonRooms(def);
      if (rooms[0]) enterRoom(s, you, rooms[0]);
      return 'done';
    }
    case 'pay': {
      const err = payMana(s, you, e.cost, 0);
      if (err) {
        (item as any).didLast = false;
        log(s, `${pname(s, you)} can't pay ${e.cost}.`, you);
      } else {
        (item as any).didLast = true;
        log(s, `${pname(s, you)} pays ${e.cost}.`, you);
      }
      return 'done';
    }
    case 'regen': {
      for (const c of subjCards(s, item, e.what)) {
        if (s.cards[c]?.zone !== 'battlefield') continue;
        (s.cards[c] as any).regen = ((s.cards[c] as any).regen ?? 0) + 1;
        log(s, `${nm(s, c)} will regenerate the next time it would be destroyed this turn.`, you);
        ev(s, { k: 'regenShield', iid: c });
      }
      return 'done';
    }
    case 'monarch': {
      if ((s as any).monarch !== you) {
        (s as any).monarch = you;
        log(s, `${pname(s, you)} becomes the monarch.`, you, 'turn');
        ev(s, { k: 'monarch', p: you });
      }
      return 'done';
    }
    case 'sacObj': {
      for (const c of subjCards(s, item, e.what)) {
        if (s.cards[c]?.zone !== 'battlefield') continue;
        log(s, `${pname(s, s.cards[c].controller)} sacrifices ${nm(s, c)}.`, s.cards[c].controller);
        moveCard(s, c, 'graveyard', { cause: 'sacrifice' });
      }
      return 'done';
    }
    case 'preventNext': {
      const n = amount(s, item, e.n);
      const shields = ((s as any).prevent ??= []) as { key: string; n: number }[];
      for (const sub of e.to) {
        if (sub.t === 'target') {
          for (const t of item.targets[sub.spec] ?? []) shields.push({ key: t.kind === 'player' ? `p${t.idx}` : t.kind === 'card' ? t.iid : '', n });
        } else for (const c of subjCards(s, item, sub)) shields.push({ key: c, n });
      }
      log(s, `The next ${n} damage will be prevented.`, you);
      return 'done';
    }
    case 'revealHand': {
      for (const p of subjPlayers(s, item, e.who)) {
        const hand = P(s, p).hand;
        log(s, `${pname(s, p)} reveals their hand: ${hand.map((h) => nm(s, h)).join(', ') || 'nothing'}.`, p);
        for (const h of hand) s.cards[h].revealed = true;
        ev(s, { k: 'revealHand', p, cards: hand.map((h) => ({ iid: h, name: nm(s, h), image: cardImageOf(s, h) })) });
      }
      return 'done';
    }
    case 'handPick': {
      const p = subjPlayers(s, item, e.who)[0];
      if (p == null) return 'done';
      const hand = P(s, p).hand;
      if (!r.sub) {
        log(s, `${pname(s, p)} reveals their hand: ${hand.map((h) => nm(s, h)).join(', ') || 'nothing'}.`, p);
        ev(s, { k: 'revealHand', p, cards: hand.map((h) => ({ iid: h, name: nm(s, h), image: cardImageOf(s, h) })) });
        const cands = e.filter ? hand.filter((h) => matchesFilter(s, h, { ...e.filter!, zone: 'hand' }, you)) : [...hand];
        if (!cands.length) return 'done';
        r.sub = {};
        pushPrompt(s, { id: uid(s, 'p'), player: you, kind: 'chooseCards', title: `${item.label}: choose a card from ${pname(s, p)}'s hand to discard`, cards: cands, min: e.upTo ? 0 : 1, max: 1, data: { ctx: 'resolve' } });
        (s.prompt as any).looked = [...hand];
        return 'wait';
      }
      for (const h of r.sub.answer ?? []) {
        if (s.cards[h]?.zone !== 'hand') continue;
        log(s, `${pname(s, p)} discards ${nm(s, h)}.`, p);
        moveCard(s, h, 'graveyard', { cause: 'discard' });
      }
      return 'done';
    }
    case 'revealTop': {
      for (const p of subjPlayers(s, item, e.who)) {
        const top = P(s, p).library[0];
        if (!top) continue;
        log(s, `${pname(s, p)} reveals ${nm(s, top)} from the top of their library.`, p);
        ev(s, { k: 'reveal', iid: top, p, name: nm(s, top), image: cardImageOf(s, top) });
        ((item as any).exiledTop ??= []).push(top);
        const ok = !e.filter || matchesFilter(s, top, { ...e.filter, zone: 'library' }, p);
        if (e.dest && ok) {
          if (e.dest === 'hand') moveCard(s, top, 'hand');
          else moveCard(s, top, 'battlefield', { controller: p });
        } else if (e.otherwise === 'graveyard') moveCard(s, top, 'graveyard');
        else if (e.otherwise === 'bottom') moveCard(s, top, 'libraryBottom');
      }
      return 'done';
    }
    case 'ext': {
      const h = EXT.effects[(e as any).name];
      if (!h) return 'done';
      const prevEff = (s as any).__curEff;
      (s as any).__curEff = e;
      try { return h({ s, item, e, r, you, api }); } finally { (s as any).__curEff = prevEff; }
    }
    case 'manual':
    default:
      return 'done';
  }
}

/** Token doubling replacement effects (Parallel Lives style). */
function tokenCount(s: GameState, p: PlayerIdx, n: number): number {
  for (const b of s.battlefield) if (s.cards[b].controller === p && baseChars(s, b).pc.replacements.some((r) => r.k === 'tokenDouble')) n *= 2;
  return n;
}

/** Create a token that's a copy of a permanent or card (rule 707). */
export function copyToken(s: GameState, p: PlayerIdx, of: string, extra: Partial<CardObj['copyOf'] & {}>, tapped?: boolean): string {
  const src = s.cards[of];
  const iid = uid(s);
  s.cards[iid] = newCardObj(iid, src.defId, p, 'library');
  s.cards[iid].token = true;
  s.cards[iid].copyOf = { ...(src.copyOf ?? { defId: src.defId, face: src.face }), ...extra } as any;
  moveCard(s, iid, 'battlefield', { controller: p, tapped, cause: 'token' });
  ev(s, { k: 'copy', iid, of });
  return iid;
}

/** Manifest / cloak: put a card onto the battlefield face down as a 2/2 (rule 701.34). */
function manifestCard(s: GameState, p: PlayerIdx, iid: string, cloak: boolean) {
  const c = s.cards[iid];
  const def = s.defs[c.defId];
  removeFromZone(s, iid);
  c.zone = 'library';
  c.faceDown = true;
  const isCreature = /\bCreature\b/.test(def.faces?.[0]?.typeLine ?? def.typeLine);
  const m = parseCard(def).morph;
  c.morph = m ? { cost: m.cost, kind: m.kind } : isCreature ? { cost: def.faces?.[0]?.manaCost ?? def.manaCost, kind: cloak ? 'cloak' : 'manifest' } : { cost: '', kind: cloak ? 'cloak' : 'manifest' };
  if (!m && !isCreature) (c.morph as any).cantTurnUp = true;
  moveCard(s, iid, 'battlefield', { controller: p });
  log(s, `${pname(s, p)} ${cloak ? 'cloaks' : 'manifests'} the top card of their library.`, p);
}

/** Turn a face-down permanent face up (special action, rule 702.37e). */
function turnFaceUp(s: GameState, p: PlayerIdx, iid: string): string | null {
  const c = s.cards[iid];
  if (!c || c.zone !== 'battlefield' || !c.faceDown) return 'That is not a face-down permanent';
  if (c.controller !== p) return 'Not yours';
  if (s.priority !== p) return "You don't have priority";
  if (!c.morph || (c.morph as any).cantTurnUp) return "That card can't be turned face up this way";
  const err = c.morph.cost ? payMana(s, p, c.morph.cost, 0) : null;
  if (err) return err;
  const kind = c.morph.kind;
  c.faceDown = false;
  log(s, `${pname(s, p)} turns ${nm(s, iid)} face up.`, p);
  ev(s, { k: 'faceUp', iid });
  if (kind === 'megamorph') addCounters(s, iid, '+1/+1', 1);
  for (const t of chars(s, iid).pc.triggers) if (t.event === 'turnedFaceUp') queueTrigger(s, iid, p, t, {});
  emit(s, 'faceUp', { iid, p });
  return null;
}

function counterItem(s: GameState, it: StackItem) {
  ((s as any).stackCtrl ??= {})[it.id] = it.controller;
  s.stack = s.stack.filter((x) => x.id !== it.id);
  ev(s, { k: 'countered', id: it.id, src: it.source });
  (s as any).lastCountered = it.source;
  log(s, `${it.label} is countered.`);
  if (it.kind === 'spell' && !(it as any).isCopy) {
    const card = s.cards[it.source];
    if (card) {
      card.zone = 'library';
      if (card.castFromGraveyardExile) moveCard(s, it.source, 'exile');
      else moveCard(s, it.source, 'graveyard');
    }
  }
}

export function createToken(s: GameState, p: PlayerIdx, t: { name: string; power?: string; toughness?: string; colors: string[]; types: string; keywords: string[]; oracle: string }, tapped?: boolean): string {
  const found = hooks.findToken?.(t.name, t.power, t.toughness, t.colors);
  const id = `tok:${t.name}:${t.power ?? ''}/${t.toughness ?? ''}:${t.colors.join('')}:${t.keywords.join(',')}`;
  if (!s.defs[id]) {
    s.defs[id] = {
      id, name: t.name, manaCost: '', cmc: 0, typeLine: t.types, oracle: found?.oracle && found.typeLine.includes(t.name) && !t.oracle ? found.oracle : t.oracle,
      power: t.power, toughness: t.toughness, colors: t.colors, colorIdentity: t.colors,
      keywords: t.keywords.map((k) => k[0].toUpperCase() + k.slice(1)), layout: 'token', image: found?.image, token: true,
    };
  }
  const iid = uid(s);
  s.cards[iid] = newCardObj(iid, id, p, 'library');
  s.cards[iid].token = true;
  moveCard(s, iid, 'battlefield', { controller: p, tapped, cause: 'token' });
  return iid;
}

// ============================================================================================
// State-based actions (704)
// ============================================================================================

function checkSBA(s: GameState): boolean {
  let changed = false;
  for (const h of EXT.hooks.sba) if (h(s, api)) changed = true;
  for (const p of s.players) {
    if (p.lost) continue;
    if (p.life <= 0 || p.poison >= 10 || p.drewFromEmpty || p.conceded) {
      if (!p.conceded && EXT.hooks.cantLose.some((h) => h(s, p.idx, api))) continue;
      p.lost = true;
      changed = true;
      const why = p.conceded ? 'conceded' : p.life <= 0 ? 'has 0 or less life' : p.poison >= 10 ? 'has 10 poison counters' : 'drew from an empty library';
      log(s, `${p.name} ${why} and loses the game.`, p.idx, 'turn');
    }
  }
  const alive = s.players.filter((p) => !p.lost);
  if (alive.length < 2) {
    s.over = true;
    s.winner = alive.length === 1 ? alive[0].idx : null;
    if (alive.length === 1) log(s, `${alive[0].name} wins!`, alive[0].idx, 'turn');
    s.prompt = null;
    s.promptQueue = [];
    return false;
  }
  const toGrave: string[] = [];
  const legends = new Map<string, string[]>();
  for (const iid of s.battlefield) {
    const c = s.cards[iid];
    const ch = chars(s, iid);
    // +1/+1 and -1/-1 annihilate
    const pl = c.counters['+1/+1'] ?? 0;
    const mi = c.counters['-1/-1'] ?? 0;
    if (pl > 0 && mi > 0) {
      const k = Math.min(pl, mi);
      c.counters['+1/+1'] -= k;
      c.counters['-1/-1'] -= k;
      changed = true;
    }
    if (ch.types.has('creature')) {
      if (ch.toughness <= 0) toGrave.push(iid);
      else if ((c.damage >= ch.toughness || (c.deathtouched && c.damage > 0)) && !ch.keywords.has('indestructible')) {
        if (tryRegenerate(s, iid)) changed = true;
        else toGrave.push(iid);
      }
    }
    if (ch.types.has('planeswalker') && (c.counters.loyalty ?? 0) <= 0) toGrave.push(iid);
    if (ch.types.has('battle') && c.counters.defense !== undefined && c.counters.defense <= 0) toGrave.push(iid);
    if (ch.subtypes.has('aura') && !(c as any).attachedPlayer) {
      const host = c.attachedTo ? s.cards[c.attachedTo] : undefined;
      const hostOk = host && ((host.zone === 'battlefield' && (!c.bestowed || chars(s, c.attachedTo!).types.has('creature'))) || (host.zone === 'graveyard' && (ch.pc as any).enchant?.filter?.zone === 'graveyard'));
      if (!hostOk) {
        if (c.bestowed) {
          // 702.103f: an unattached bestowed Aura becomes a creature again
          c.bestowed = false;
          c.attachedTo = undefined;
          changed = true;
        } else toGrave.push(iid);
      }
    }
    if (ch.pc.reconfigure && c.attachedTo) {
      const host = s.cards[c.attachedTo];
      if (!host || host.zone !== 'battlefield' || !chars(s, c.attachedTo).types.has('creature')) {
        c.attachedTo = undefined;
        changed = true;
      }
    }
    // Saga: sacrificed once its final chapter has triggered and left the stack (714.4)
    if (ch.pc.finalChapter && (c.counters.lore ?? 0) >= ch.pc.finalChapter) {
      const busy = s.stack.some((it) => it.source === iid && (it as any).chapter) || s.pendingTriggers.some((it) => it.source === iid && (it as any).chapter) || (s.resolving && s.resolving.item.source === iid && (s.resolving.item as any).chapter) || (s.pendingCast?.item?.source === iid);
      if (!busy) {
        log(s, `${ch.name} is sacrificed (final chapter).`, c.controller);
        toGrave.push(iid);
      }
    }
    if ((ch.subtypes.has('equipment') || ch.subtypes.has('fortification')) && c.attachedTo) {
      const a = s.cards[c.attachedTo];
      if (!a || a.zone !== 'battlefield' || !chars(s, c.attachedTo).types.has('creature')) {
        c.attachedTo = undefined;
        changed = true;
      }
    }
    if (ch.supertypes.has('legendary')) {
      const key = `${c.controller}|${ch.name}`;
      legends.set(key, [...(legends.get(key) ?? []), iid]);
    }
  }
  for (const [, list] of legends) {
    if (list.length > 1) {
      list.sort((a, b) => s.cards[a].ts - s.cards[b].ts);
      for (const old of list.slice(0, -1)) {
        log(s, `Legend rule: ${nm(s, old)} is put into the graveyard.`, s.cards[old].controller);
        toGrave.push(old);
      }
    }
  }
  const hadBatch = !!(s as any).leaveBatch;
  if (!hadBatch) (s as any).leaveBatch = new Map();
  for (const iid of new Set(toGrave)) {
    if (s.cards[iid]?.zone === 'battlefield') {
      const ch = chars(s, iid);
      if (ch.types.has('creature') && (s.cards[iid].damage > 0 || ch.toughness <= 0)) log(s, `${ch.name} dies.`, s.cards[iid].controller);
      moveCard(s, iid, 'graveyard');
      changed = true;
    }
  }
  if (!hadBatch) (s as any).leaveBatch = undefined;
  return changed;
}

// ============================================================================================
// Turn structure
// ============================================================================================

function emptyPools(s: GameState) {
  // Mana that "lasts until end of combat" (firebending) survives the combat steps.
  const combat = ['declareAttackers', 'declareBlockers', 'firstStrikeDamage', 'combatDamage', 'endCombat'].includes(s.step);
  for (const p of s.players) {
    if ((p as any).keepManaTurn === s.turn) continue;
    const keep = combat ? Math.min((p as any).combatMana ?? 0, p.pool.R) : 0;
    p.pool = emptyPool();
    (p as any).rpool = [];
    p.pool.R += keep;
    (p as any).combatMana = keep;
  }
}

function potentialAttackers(s: GameState): string[] {
  return s.battlefield.filter((iid) => canAttack(s, iid));
}

export function canAttack(s: GameState, iid: string): boolean {
  const c = s.cards[iid];
  if (!c || c.zone !== 'battlefield' || c.controller !== s.active || c.tapped || c.phasedOut) return false;
  const ch = chars(s, iid);
  if (!ch.types.has('creature')) return false;
  if (c.sick && !ch.keywords.has('haste')) return false;
  if ((ch.keywords.has('defender') && !ch.keywords.has('attacks as though no defender')) || ch.cantAttack) return false;
  for (const h of EXT.hooks.canAttack) if (h(s, iid, api) === false) return false;
  return true;
}

export function canBlock(s: GameState, blocker: string, attacker: string): boolean {
  const b = s.cards[blocker];
  if (!b || b.zone !== 'battlefield' || b.tapped || b.controller === s.active || b.phasedOut) return false;
  const bc = chars(s, blocker);
  if (!bc.types.has('creature') || bc.cantBlock) return false;
  const ac = chars(s, attacker);
  if (ac.unblockable || ac.keywords.has('unblockable')) return false;
  if (ac.keywords.has('flying') && !bc.keywords.has('flying') && !bc.keywords.has('reach')) return false;
  if (ac.keywords.has('shadow') && !bc.keywords.has('shadow')) return false;
  if (ac.keywords.has('horsemanship') && !bc.keywords.has('horsemanship')) return false;
  if (ac.keywords.has('fear') && !bc.types.has('artifact') && !bc.colors.includes('B')) return false;
  if (ac.keywords.has('intimidate') && !bc.types.has('artifact') && !bc.colors.some((c) => ac.colors.includes(c))) return false;
  if (ac.keywords.has('skulk') && bc.power > ac.power) return false;
  if (protectedFrom(s, ac, blocker)) return false;
  const walks: Record<string, string> = { islandwalk: 'island', swampwalk: 'swamp', forestwalk: 'forest', mountainwalk: 'mountain', plainswalk: 'plains' };
  for (const [kw, type] of Object.entries(walks)) {
    if (ac.keywords.has(kw) && s.battlefield.some((i) => s.cards[i].controller === b.controller && baseChars(s, i).subtypes.has(type))) return false;
  }
  for (const h of EXT.hooks.canBlock) if (h(s, blocker, attacker, api) === false) return false;
  return true;
}

function beginStep(s: GameState, step: Step) {
  s.step = step;
  s.passes = 0;
  emptyPools(s);
  for (const h of EXT.hooks.step) h(s, step, api);
  const ap = s.active;
  switch (step) {
    case 'untap': {
      const pl = P(s, ap);
      pl.landsPlayed = 0;
      pl.landsAllowed = landsAllowed(s, ap);
      pl.lifeGainedThisTurn = 0;
      pl.spellsCastThisTurn = 0;
      P(s, opp(ap)).spellsCastThisTurn = 0;
      for (const q of s.players) q.damagedThisTurn = false;
      // Day/night check (726.3a) happens as the untap step begins
      if (s.dayNight === 'day' && s.lastTurnActiveSpells === 0 && s.turn > 1) setDayNight(s, 'night');
      else if (s.dayNight === 'night' && s.lastTurnActiveSpells >= 2) setDayNight(s, 'day');
      for (const iid of s.battlefield) {
        const c = s.cards[iid];
        if (c.controller !== ap) continue;
        c.sick = false;
        c.loyaltyUsed = false;
        (c as any).activatedThisTurn = undefined;
        if (c.skipUntap) {
          c.skipUntap = false;
          continue;
        }
        if (c.tapped && !chars(s, iid).noUntap && !EXT.hooks.untap.some((h) => h(s, iid, api) === false)) {
          if ((c.counters.stun ?? 0) > 0) {
            c.counters.stun--; // 122.1d: remove a stun counter instead of untapping
            continue;
          }
          c.tapped = false;
          emit(s, 'untapped', { iid });
        }
      }
      for (const iid of s.battlefield) (s.cards[iid] as any).activatedThisTurn = undefined;
      (s as any).needAdvance = true; // no priority in untap step
      return;
    }
    case 'upkeep': {
      fireStepTriggers(s, 'upkeep');
      if ((s as any).initiative === ap) {
        const it: StackItem = { id: uid(s, 's'), kind: 'trigger', controller: ap, source: (P(s, ap) as any).dungeon?.iid ?? '', label: 'The initiative — venture into Undercity', text: 'Venture into Undercity.', effects: [{ k: 'venture' }], targets: [] };
        (it as any).preTargeted = true;
        s.pendingTriggers.push(it);
      }
      {
        const isDue = (d: any) => d.at === 'nextUpkeep' && (!d.yours || d.controller === ap) && !(d.notBefore > s.turn);
        const due = s.delayed.filter(isDue);
        s.delayed = s.delayed.filter((d) => !isDue(d));
        for (const d of due) {
          const it: StackItem = { id: uid(s, 's'), kind: 'trigger', controller: d.controller, source: d.source, label: d.label, text: 'Delayed trigger', effects: d.effects, targets: d.targets };
          (it as any).exiledHere = d.refs;
          (it as any).lastTokens = d.refs;
          (it as any).preTargeted = true;
          s.pendingTriggers.push(it);
        }
      }
      const mk = (source: string, label: string, effects: Effect[]) =>
        s.pendingTriggers.push({ id: uid(s, 's'), kind: 'trigger', controller: ap, source, label, text: label, effects, targets: [] });
      for (const e of P(s, ap).exile) if (s.cards[e].suspended) mk(e, `${nm(s, e)} — suspend`, [{ k: 'suspendTick' }]);
      for (const b of s.battlefield) {
        const c = s.cards[b];
        if (c.controller === ap && c.echoDue) {
          const echo = chars(s, b).pc.echo;
          if (echo) mk(b, `${nm(s, b)} — echo`, [{ k: 'echo', cost: echo }]);
          else c.echoDue = false;
        }
      }
      break;
    }
    case 'draw':
      if (s.turn === 1 && ap === s.startingPlayer) {
        log(s, `${pname(s, ap)} skips the first draw.`, ap);
      } else if (s.battlefield.some((b) => s.cards[b].controller === ap && (baseChars(s, b).pc as any).skipDraw)) log(s, `${pname(s, ap)} skips their draw step.`, ap);
      else drawCards(s, ap, 1);
      fireStepTriggers(s, 'draw');
      break;
    case 'main1': {
      // Sagas get a lore counter as the precombat main phase begins (714.3b)
      for (const b of [...s.battlefield]) {
        const c = s.cards[b];
        if (c.controller === ap && chars(s, b).pc.chapters?.length) addCounters(s, b, 'lore', 1);
      }
      // Rad counters (Fallout): mill that many, lose 1 life and a rad counter per nonland milled
      const rad = P(s, ap).counters.rad ?? 0;
      if (rad > 0) {
        let nonland = 0;
        for (let i = 0; i < rad; i++) {
          const top = P(s, ap).library[0];
          if (!top) break;
          if (!/\bLand\b/.test(s.defs[s.cards[top].defId].typeLine)) nonland++;
          moveCard(s, top, 'graveyard');
        }
        if (nonland) {
          loseLife(s, ap, nonland);
          P(s, ap).counters.rad = rad - nonland;
        }
        log(s, `${pname(s, ap)} mills ${rad} for rad counters and loses ${nonland} life.`, ap);
      }
      fireStepTriggers(s, 'main1');
      break;
    }
    case 'beginCombat':
      s.combat = { attackers: [], declared: false, blocksDeclared: false, firstStrike: false };
      fireStepTriggers(s, 'beginCombat');
      if (!potentialAttackers(s).length && !s.pendingTriggers.length) {
        // Arena skips combat when you have nothing that can attack
        s.combat = null;
        (s as any).skipTo = 'main2';
        (s as any).needAdvance = true;
        return;
      }
      break;
    case 'declareAttackers': {
      const cands = potentialAttackers(s);
      if (!cands.length) {
        (s as any).skipTo = 'endCombat';
        (s as any).needAdvance = true;
        return;
      }
      const targets: Target[] = [{ kind: 'player', idx: opp(ap) }];
      for (const iid of s.battlefield) {
        const c = s.cards[iid];
        const ch = chars(s, iid);
        if (c.controller !== ap && ch.types.has('planeswalker')) targets.push({ kind: 'card', iid });
        if (ch.types.has('battle') && c.controller !== ap) targets.push({ kind: 'card', iid });
      }
      pushPrompt(s, { id: uid(s, 'p'), player: ap, kind: 'declareAttackers', title: 'Declare attackers', cards: cands, targets, data: { ctx: 'attack' } });
      return;
    }
    case 'declareBlockers': {
      if (!s.combat?.attackers.length) {
        (s as any).skipTo = 'endCombat';
        (s as any).needAdvance = true;
        return;
      }
      const def = opp(ap);
      const blockers = s.battlefield.filter((b) => s.cards[b].controller === def && s.combat!.attackers.some((a) => canBlock(s, b, a.iid)));
      if (blockers.length) {
        pushPrompt(s, { id: uid(s, 'p'), player: def, kind: 'declareBlockers', title: 'Declare blockers', cards: blockers, data: { ctx: 'block' } });
        return;
      }
      s.combat.blocksDeclared = true;
      break;
    }
    case 'firstStrikeDamage': {
      const cmb = s.combat;
      if (!cmb || !cmb.attackers.length) {
        (s as any).skipTo = 'endCombat';
        (s as any).needAdvance = true;
        return;
      }
      const involved = [...cmb.attackers.map((a) => a.iid), ...cmb.attackers.flatMap((a) => a.blockedBy)];
      const any = involved.some((i) => s.cards[i] && (chars(s, i).keywords.has('first strike') || chars(s, i).keywords.has('double strike')));
      if (!any) {
        (s as any).needAdvance = true;
        return;
      }
      cmb.firstStrike = true;
      combatDamage(s, true);
      break;
    }
    case 'combatDamage':
      if (!s.combat || !s.combat.attackers.length) {
        (s as any).needAdvance = true;
        return;
      }
      combatDamage(s, false);
      break;
    case 'endCombat':
      break;
    case 'main2':
      s.combat = null;
      fireStepTriggers(s, 'main2');
      break;
    case 'end': {
      fireStepTriggers(s, 'end');
      if ((s as any).monarch === ap) s.pendingTriggers.push({ id: uid(s, 's'), kind: 'trigger', controller: ap, source: P(s, ap).library[0] ?? '', label: 'The monarch draws a card', text: 'At the beginning of your end step, draw a card.', effects: [{ k: 'draw', n: 1, who: { t: 'you' } }], targets: [] });
      const isDueE = (d: any) => d.at === 'nextEnd' && (!d.yours || d.controller === ap) && !(d.notBefore > s.turn);
      const due = s.delayed.filter(isDueE);
      s.delayed = s.delayed.filter((d) => !isDueE(d));
      for (const d of due) {
        const it: StackItem = { id: uid(s, 's'), kind: 'trigger', controller: d.controller, source: d.source, label: d.label, text: 'Delayed trigger', effects: d.effects, targets: d.targets };
        (it as any).exiledHere = d.refs;
        (it as any).lastTokens = d.refs;
        (it as any).preTargeted = true;
        s.pendingTriggers.push(it);
      }
      break;
    }
    case 'cleanup': {
      const pl = P(s, ap);
      const max = (P(s, ap) as any).noMaxHandGame || s.battlefield.some((b) => (s.cards[b].controller === ap && (baseChars(s, b).pc as any).noMaxHand) || (baseChars(s, b).pc as any).noMaxHandAll) ? 999 : 7;
      if (pl.hand.length > max) {
        const n = pl.hand.length - max;
        pushPrompt(s, { id: uid(s, 'p'), player: ap, kind: 'chooseCards', title: `Discard ${n} card${n > 1 ? 's' : ''} to hand size`, cards: [...pl.hand], min: n, max: n, data: { ctx: 'cleanup' } });
        return;
      }
      doCleanup(s);
      return;
    }
  }
  s.priority = ap;
}

function doCleanup(s: GameState) {
  for (const iid of s.battlefield) {
    const c = s.cards[iid];
    c.damage = 0;
    c.deathtouched = false;
    const keep: typeof c.mods = [];
    for (const m of c.mods) {
      if (m.until === 'eot') {
        if (m.setController !== undefined) c.controller = m.setController;
      } else keep.push(m);
    }
    c.mods = keep;
  }
  for (const iid of s.battlefield) delete (s.cards[iid] as any).regen;
  (s as any).prevent = [];
  for (const p of s.players) p.passUntilEOT = false;
  (s as any).fog = false;
  s.combat = null;
  (s as any).needAdvance = true;
}

function nextTurn(s: GameState) {
  s.lastTurnActiveSpells = P(s, s.active).spellsCastThisTurn;
  s.lastTurnSpells = P(s, 0).spellsCastThisTurn + P(s, 1).spellsCastThisTurn;
  const extra: PlayerIdx[] = (s as any).extraTurns ?? [];
  if (extra.length) s.active = extra.shift()!;
  else s.active = opp(s.active);
  // "Skip your next turn"
  if (((P(s, s.active) as any).skipTurns ?? 0) > 0 && !extra.includes(s.active)) {
    (P(s, s.active) as any).skipTurns--;
    log(s, `${pname(s, s.active)} skips their turn.`, s.active, 'turn');
    s.active = opp(s.active);
  }
  s.turn++;
  (s as any).ghosts = undefined;
  log(s, `Turn ${s.turn} — ${pname(s, s.active)}`, s.active, 'turn');
  ev(s, { k: 'turn', p: s.active, turn: s.turn });
  beginStep(s, 'untap');
}

function advanceStep(s: GameState) {
  (s as any).needAdvance = false;
  const skip: Step | undefined = (s as any).skipTo;
  (s as any).skipTo = undefined;
  if (s.step === 'cleanup') {
    nextTurn(s);
    return;
  }
  let next = skip ?? STEPS[STEPS.indexOf(s.step) + 1];
  // Additional combat phases ("after this main phase, there is an additional combat phase …")
  const xc = (s as any).extraCombats as { turn: number; n: number } | undefined;
  if (!skip && (s.step === 'main1' || s.step === 'main2') && xc && xc.turn === s.turn && xc.n > 0) {
    xc.n--;
    if (s.step === 'main2') s.combat = null;
    next = 'beginCombat';
  }
  beginStep(s, next);
}

// ============================================================================================
// Combat damage (510)
// ============================================================================================

function dealsInStep(s: GameState, iid: string, first: boolean, alreadyDealt: boolean): boolean {
  const k = chars(s, iid).keywords;
  const fs = k.has('first strike');
  const ds = k.has('double strike');
  if (first) return fs || ds;
  if (!s.combat?.firstStrike) return true;
  if (ds) return true;
  return !fs && !alreadyDealt;
}

/** The amount of combat damage a creature assigns: its power, or its toughness under Doran-style effects. */
function combatAmount(s: GameState, iid: string, ch: ReturnType<typeof chars>): number {
  if ((ch as any).dmgByToughness || EXT.hooks.dmgByToughness.some((h) => h(s, iid, api))) return ch.toughness;
  return ch.power;
}
function combatDamage(s: GameState, first: boolean) {
  const cmb = s.combat!;
  if ((s as any).fog) {
    log(s, 'Combat damage is prevented.', undefined, 'combat');
    return;
  }
  // "You may have ~ assign its combat damage as though it weren't blocked." — asked as damage is assigned (510.1c).
  // While the prompt is open nobody can act, so dealing the damage once it's answered is the same moment.
  for (const a of cmb.attackers) {
    if (!a.blocked || (a as any).unblockedAsked || !s.cards[a.iid] || s.cards[a.iid].zone !== 'battlefield') continue;
    if (!(chars(s, a.iid).pc as any).unblockedOption || !dealsInStep(s, a.iid, first, (a as any).dealtFirst)) continue;
    (a as any).unblockedAsked = true;
    pushPrompt(s, { id: uid(s, 'p'), player: s.cards[a.iid].controller, kind: 'yesno', title: `${nm(s, a.iid)}: assign its combat damage as though it weren't blocked?`, options: [{ id: 'yes', label: 'Damage the player' }, { id: 'no', label: 'Damage the blockers' }], cards: [a.iid], data: { ctx: 'unblocked', iid: a.iid, first } });
    return;
  }
  const assignments: { src: string; to: Target; n: number }[] = [];
  const dealtFS: Set<string> = (s as any).dealtFS ?? new Set();
  for (const a of cmb.attackers) {
    const ac = s.cards[a.iid];
    if (!ac || ac.zone !== 'battlefield') continue;
    if (!dealsInStep(s, a.iid, first, (a as any).dealtFirst)) continue;
    const ch = chars(s, a.iid);
    let power = Math.max(0, combatAmount(s, a.iid, ch));
    if (power === 0) continue;
    if (first) (a as any).dealtFirst = true;
    if (!a.blocked || (a as any).asUnblocked) {
      assignments.push({ src: a.iid, to: a.target, n: power });
      continue;
    }
    const blockers = a.blockedBy.filter((b) => s.cards[b]?.zone === 'battlefield');
    if (!blockers.length) {
      if (ch.keywords.has('trample')) assignments.push({ src: a.iid, to: a.target, n: power });
      continue;
    }
    const dt = ch.keywords.has('deathtouch');
    for (let i = 0; i < blockers.length && power > 0; i++) {
      const b = blockers[i];
      const bc = chars(s, b);
      const lethal = dt ? 1 : Math.max(0, bc.toughness - s.cards[b].damage);
      const last = i === blockers.length - 1;
      let n = Math.min(power, Math.max(lethal, 0));
      if (last && !ch.keywords.has('trample')) n = power;
      if (n > 0) assignments.push({ src: a.iid, to: { kind: 'card', iid: b }, n });
      power -= n;
    }
    if (power > 0 && ch.keywords.has('trample')) assignments.push({ src: a.iid, to: a.target, n: power });
  }
  for (const a of cmb.attackers) {
    for (const b of a.blockedBy) {
      const bc = s.cards[b];
      if (!bc || bc.zone !== 'battlefield') continue;
      if (!dealsInStep(s, b, first, dealtFS.has(b))) continue;
      if (first) dealtFS.add(b);
      if (!s.cards[a.iid] || s.cards[a.iid].zone !== 'battlefield') continue;
      const p = Math.max(0, combatAmount(s, b, chars(s, b)));
      // A creature blocking several attackers would divide; we assign to the first.
      if (p > 0 && !assignments.some((x) => x.src === b)) assignments.push({ src: b, to: { kind: 'card', iid: a.iid }, n: p });
    }
  }
  (s as any).dealtFS = first ? dealtFS : undefined;
  // simultaneous
  const dealtBy = new Map<string, number>();
  const hitPlayer = new Set<string>();
  const hitPlayerAmt = new Map<string, number>();
  for (const as of assignments) {
    // planeswalker target that left: no damage
    if (as.to.kind === 'card' && s.cards[as.to.iid]?.zone !== 'battlefield') continue;
    const n = dealDamage(s, as.src, as.to, as.n, true);
    dealtBy.set(as.src, (dealtBy.get(as.src) ?? 0) + n);
    if (as.to.kind === 'player' && n > 0) { hitPlayer.add(as.src); hitPlayerAmt.set(as.src, (hitPlayerAmt.get(as.src) ?? 0) + n); }
    const tgt = as.to.kind === 'player' ? pname(s, as.to.idx) : nm(s, (as.to as any).iid);
    log(s, `${nm(s, as.src)} deals ${as.n} combat damage to ${tgt}.`, s.cards[as.src]?.controller, 'combat');
  }
  for (const [src, n] of dealtBy) afterDamage(s, src, n, s.cards[src].controller);
  void 0;
  for (const src of hitPlayer) {
    for (const t of chars(s, src).pc.triggers) if (t.event === 'combatDamagePlayer') queueTrigger(s, src, s.cards[src].controller, t, { triggerPlayer: opp(s.cards[src].controller), amount: hitPlayerAmt.get(src) });
  }
  for (const [src, n] of dealtBy) {
    for (const t of chars(s, src).pc.triggers) if (t.event === 'dealsDamage') queueTrigger(s, src, s.cards[src].controller, t, { amount: n });
  }
}

// ============================================================================================
// Auto-pass (Arena-style smart stops)
// ============================================================================================

export function canPlaySomething(s: GameState, p: PlayerIdx): boolean {
  return playableCards(s, p, true).size > 0;
}

/** Cards the player could play or activate right now (used for auto-pass and the Arena-style shimmer). */
export interface CastOption {
  label: string;
  action: Action;
  ok: boolean; // affordable & legal right now
}

/** Every way the player could cast/play this card right now (normal, faces, morph, bestow, flashback, foretell …). */
function ninjutsuWindow(s: GameState, p: PlayerIdx): boolean {
  return !!s.combat?.blocksDeclared && s.active === p && ['declareBlockers', 'firstStrikeDamage', 'combatDamage'].includes(s.step) && s.combat.attackers.some((a) => a.blockedBy.length === 0 && s.cards[a.iid]?.controller === p);
}

/** Mutate (702.140): the spell merges with its target instead of entering on its own. Goes on top. */
function mutateOnto(s: GameState, item: StackItem): boolean {
  const t = item.targets[0]?.[0];
  const card = s.cards[item.source];
  if (!t || t.kind !== 'card' || !card) return false;
  const host = s.cards[t.iid];
  if (!host || host.zone !== 'battlefield' || host.owner !== item.controller || !chars(s, t.iid).types.has('creature') || chars(s, t.iid).subtypes.has('human')) return false;
  const hostDef = host.copyOf?.defId ?? host.defId;
  (host as any).mutatedDefs = [...((host as any).mutatedDefs ?? []), hostDef];
  (host as any).mutatedCards = [...((host as any).mutatedCards ?? []), item.source];
  host.copyOf = { defId: card.defId } as any;
  card.zone = 'mutated' as any;
  log(s, `${nm(s, item.source)} mutates onto ${s.defs[hostDef]?.name ?? 'a creature'}.`, item.controller);
  ev(s, { k: 'transform', iid: t.iid });
  for (const tr of chars(s, t.iid).pc.triggers) if ((tr as any).event === 'mutates' || /^whenever this creature mutates/.test(tr.text)) queueTrigger(s, t.iid, host.controller, tr, {});
  return true;
}

// ---- dungeons (rule 309) ----
const DUNGEONS = ['Lost Mine of Phandelver', 'Dungeon of the Mad Mage', 'Tomb of Annihilation'];
function dungeonRooms(def: CardDef): { name: string; effect: string; next: string[] }[] {
  return def.oracle.split('\n').map((l) => {
    const m = l.match(/^(.+?) — (.+?)\s*(?:\(Leads to: (.+)\))?$/);
    return m ? { name: m[1].trim(), effect: m[2].trim(), next: m[3] ? m[3].split(/,\s*(?:or\s+)?|\s+or\s+/).map((x) => x.trim()).filter(Boolean) : [] } : null;
  }).filter(Boolean) as any;
}
function enterRoom(s: GameState, p: PlayerIdx, room: { name: string; effect: string }) {
  const dg = (P(s, p) as any).dungeon;
  dg.room = room.name;
  log(s, `${pname(s, p)} enters ${room.name} (${s.defs[s.cards[dg.iid].defId].name}).`, p);
  ev(s, { k: 'dungeon', p, room: room.name });
  queueTrigger(s, dg.iid, p, { event: 'etb' as any, ability: parseAbility(normalizeText(room.effect, s.defs[s.cards[dg.iid].defId].name).replace(/\.$/, '')), text: room.effect }, { noDouble: true });
  s.pendingTriggers[s.pendingTriggers.length - 1].label = `${room.name} — ${room.effect}`;
}

function altCostPayable(s: GameState, p: PlayerIdx, iid: string, a: any): boolean {
  if (a.cond && !evalCond(s, a.cond, p, iid)) return false;
  if (a.mana && !canAfford(s, p, a.mana)) return false;
  if (a.life && P(s, p).life < a.life) return false;
  const count = (f: any, pool: string[]) => pool.filter((x) => x !== iid && matchesFilter(s, x, f, p, iid)).length;
  if (a.sac && count(a.sac.filter, s.battlefield) < a.sac.n) return false;
  if (a.bounce && count(a.bounce.filter, s.battlefield) < a.bounce.n) return false;
  if (a.exileHand && count(a.exileHand.filter, P(s, p).hand) < a.exileHand.n) return false;
  if (a.discard && (a.discard.filter ? count(a.discard.filter, P(s, p).hand) : P(s, p).hand.filter((h) => h !== iid).length) < a.discard.n) return false;
  return true;
}

export function castOptions(s: GameState, p: PlayerIdx, iid: string, onlyOk = false): CastOption[] {
  return payingFor(s, iid, () => castOptionsInner(s, p, iid, onlyOk));
}
function castOptionsInner(s: GameState, p: PlayerIdx, iid: string, onlyOk = false): CastOption[] {
  const card = s.cards[iid];
  if (!card) return [];
  const def = s.defs[card.defId];
  const out: CastOption[] = [];
  const pl = P(s, p);
  const sorc = s.active === p && (s.step === 'main1' || s.step === 'main2') && s.stack.length === 0 && !s.pendingCast;
  const prio = s.priority === p && !s.prompt;
  const pcFront = parseCard(def, def.faces && ['transform', 'modal_dfc'].includes(def.layout) ? def.faces[0] : undefined);
  const alt = defaultAlt(s, p, card, pcFront);
  if (!alt) return out;
  const faces = def.faces && MULTI_CAST.includes(def.layout) && alt !== 'adventure' ? def.faces.map((_, i) => i) : [0];
  const push = (label: string, action: Action, ok: boolean) => {
    if (!onlyOk || ok) out.push({ label, action, ok });
  };
  for (const f of faces) {
    const face = def.faces && faces.length > 1 ? def.faces[f] : null;
    const tl = (face?.typeLine ?? def.typeLine.split(' // ')[0]).toLowerCase();
    const name = face?.name ?? def.name.split(' // ')[0];
    if (/\bland\b/.test(tl) && !/(instant|sorcery|creature)/.test(tl)) {
      const canLand = (card.zone === 'hand' || (alt === 'mayPlay' && !(card.mayPlay as any)?.castOnly)) && sorc && prio && pl.landsPlayed < landsAllowed(s, p);
      push(`Play ${name}`, { type: 'playLand', iid, face: f }, canLand);
      continue;
    }
    let cost = face?.manaCost ?? def.manaCost;
    const xAlt = typeof alt === 'string' && alt.startsWith('ext:') ? EXT.alts[alt.slice(4)] : null;
    const labelAlt = alt === 'normal' || alt === 'adventure' ? '' : ` (${alt === 'mayPlay' ? (card.zone === 'graveyard' ? 'from graveyard' : 'from exile') : xAlt ? xAlt.label ?? alt.slice(4) : alt})`;
    if (xAlt) {
      const c0 = xAlt.begin(s, p, iid, pcFront, api);
      if (c0.startsWith('!')) continue;
      cost = c0;
    }
    if (alt === 'flashback') cost = pcFront.flashback!;
    if (alt === 'escape') cost = pcFront.escape!.cost;
    if (alt === 'foretell') cost = pcFront.foretell ?? cost;
    if (alt === 'plot') cost = '';
    if (alt === 'disturb') {
      cost = pcFront.disturb!;
      if (f !== 0) continue;
    }
    if (alt === 'commander') {
      const n = ((P(s, p) as any).commanderCasts ?? {})[iid] ?? 0;
      if (n) cost = (cost || '') + `{${2 * n}}`;
    }
    for (const h of EXT.hooks.costMod) cost = h(s, p, iid, cost, alt, api);
    const instant = alt !== 'plot' && isInstantSpeed(s, iid, alt === 'disturb' ? 1 : f);
    let timingOk = prio && (instant || sorc);
    if (alt === 'foretell' && card.foretold != null && card.foretold >= s.turn) timingOk = false;
    if (alt === 'plot' && card.plotted != null && card.plotted >= s.turn) timingOk = false;
    if (alt === 'escape' && pl.graveyard.length - 1 < (pcFront.escape?.exile ?? 0)) timingOk = false;
    const nm2 = alt === 'disturb' ? def.faces?.[1]?.name ?? name : name;
    const blocked = EXT.hooks.castBlock.some((h) => !!h(s, p, iid, alt, api, alt === 'disturb' ? 1 : f));
    push(`Cast ${nm2}${labelAlt} ${cost}`.trim(), { type: 'cast', iid, face: alt === 'disturb' ? 1 : f, alt }, timingOk && !blocked && (!cost || canAfford(s, p, cost)));
    const kick = (face ? parseCard(def, face) : pcFront).kicker;
    if (kick && f === faces[0]) {
      const kc = (cost || '') + kick;
      push(`Cast ${nm2}${labelAlt} with kicker ${kc}`, { type: 'cast', iid, face: f, alt, kicker: true }, timingOk && canAfford(s, p, kc));
    }
  }
  const mut = (pcFront as any).mutate as string | undefined;
  if (mut && card.zone === 'hand' && card.owner === p) {
    const hasTarget = s.battlefield.some((b) => s.cards[b].owner === p && s.cards[b].controller === p && chars(s, b).types.has('creature') && !chars(s, b).subtypes.has('human'));
    push(`Cast ${def.name} with mutate ${mut}`, { type: 'cast', iid, alt: 'mutate' } as Action, prio && sorc && hasTarget && canAfford(s, p, mut));
  }
  const altC = (pcFront as any).altCost as any;
  if (altC && card.zone === 'hand' && card.owner === p) {
    const instant = isInstantSpeed(s, iid, 0);
    const name0 = def.faces?.[0]?.name ?? def.name;
    push(`Cast ${name0} (${altC.text})`, { type: 'cast', iid, alt: 'alt' } as Action, prio && (instant || sorc) && altCostPayable(s, p, iid, altC));
  }
  if (card.zone === 'hand' && card.owner === p) {
    if (pcFront.morph) push(`Cast face down (${pcFront.morph.kind}) {3}`, { type: 'cast', iid, alt: 'morph' }, prio && sorc && canAfford(s, p, '{3}'));
    if (pcFront.bestow) push(`Cast with bestow ${pcFront.bestow}`, { type: 'cast', iid, alt: 'bestow' }, prio && (sorc || isInstantSpeed(s, iid, 0)) && canAfford(s, p, pcFront.bestow));
    const pcNow = parsedFor(s, card);
    pcNow.activated.forEach((a, idx) => {
      if (a.zone !== 'hand') return;
      const timing = a.special === 'foretell' ? s.active === p && prio : a.special === 'ninjutsu' ? prio && ninjutsuWindow(s, p) : a.sorcery ? sorc && prio : prio;
      push(a.label, { type: 'activate', iid, ability: idx }, timing && (!a.cost.mana || canAfford(s, p, a.cost.mana)));
    });
  }
  for (const h of EXT.hooks.castOptions) for (const o of h(s, p, iid, api)) push(o.label, o.action, o.ok && prio);
  if (card.zone === 'graveyard' && card.owner === p) {
    parsedFor(s, card).activated.forEach((a, idx) => {
      if (a.zone !== 'graveyard') return;
      push(a.label, { type: 'activate', iid, ability: idx }, (a.sorcery ? sorc : true) && prio && (!a.cost.mana || canAfford(s, p, a.cost.mana)));
    });
  }
  return out;
}

/** Cards the player could play or activate right now (used for auto-pass and the Arena-style shimmer). */
export function playableCards(s: GameState, p: PlayerIdx, stopEarly = false): Set<string> {
  const out = new Set<string>();
  const pl = P(s, p);
  const sorc = s.active === p && (s.step === 'main1' || s.step === 'main2') && s.stack.length === 0;
  const zones = [
    ...pl.hand,
    ...pl.graveyard,
    ...pl.exile.filter((e) => s.cards[e].onAdventure || s.cards[e].foretold != null || s.cards[e].plotted != null || s.cards[e].mayPlay),
    ...P(s, opp(p)).exile.filter((e) => s.cards[e].mayPlay?.player === p),
    ...P(s, opp(p)).graveyard.filter((e) => s.cards[e].mayPlay?.player === p),
    // "You may play lands and cast spells from the top of your library."
    ...(pl.library[0] && s.battlefield.some((b) => s.cards[b].controller === p && (baseChars(s, b).pc as any).topPlay) ? [pl.library[0]] : []),
  ];
  for (const iid of zones) {
    const c = s.cards[iid];
    if (c.zone === 'graveyard' && c.owner === p && !c.mayPlay && !(isLandCard(s, c) && gyLandsAllowed(s, p))) {
      const pcx = parsedFor(s, c);
      const d = s.defs[c.defId];
      const front = parseCard(d, d.faces && ['transform', 'modal_dfc'].includes(d.layout) ? d.faces[0] : undefined);
      if (!front.flashback && (c as any).tempFlashback?.turn !== s.turn && !front.escape && !front.disturb && !pcx.activated.some((a) => a.zone === 'graveyard') && !EXT.hooks.zoneCast.some((h) => h(s, p, c, front, api))) continue;
    }
    if (castOptions(s, p, iid, true).length) {
      out.add(iid);
      if (stopEarly) return out;
    }
  }
  for (const iid of s.battlefield) {
    const c = s.cards[iid];
    if (c.controller !== p) continue;
    if (c.faceDown && c.morph && !(c.morph as any).cantTurnUp && (!c.morph.cost || canAfford(s, p, c.morph.cost))) {
      out.add(iid);
      if (stopEarly) return out;
      continue;
    }
    const acts = chars(s, iid).pc.activated;
    for (const a of acts) {
      if (a.isMana || a.zone !== 'battlefield') continue;
      if ((a.sorcery || a.special === 'equip') && !sorc) continue;
      if (!canPayActCostBasics(s, p, iid, a)) continue;
      if (a.cost.mana && !canAfford(s, p, a.cost.mana, 0, a.cost.tap ? iid : undefined)) continue;
      out.add(iid);
      if (stopEarly) return out;
      break;
    }
  }
  return out;
}

function shouldAutoPass(s: GameState, p: PlayerIdx): boolean {
  const pl = P(s, p);
  if (!pl.connected && (s as any).autoDisconnected) return true;
  if (pl.fullControl) return false;
  if (pl.passUntilEOT) return true;
  if (s.stack.length) {
    const top = s.stack[s.stack.length - 1];
    if (top.controller === p) return true; // Arena passes after you cast
    return !canPlaySomething(s, p);
  }
  const stops = s.active === p ? pl.stops.own : pl.stops.opp;
  if (!stops.includes(s.step)) return true;
  return !canPlaySomething(s, p);
}

// ============================================================================================
// Driver
// ============================================================================================

function doPass(s: GameState, p: PlayerIdx) {
  s.passes++;
  if (s.passes >= 2) {
    s.passes = 0;
    if (s.stack.length) {
      resolveTop(s);
      if (!s.resolving) s.priority = s.active;
    } else {
      (s as any).needAdvance = true;
    }
  } else {
    s.priority = opp(p);
  }
}

/** "Whenever ~ becomes tapped": compare each permanent's tapped state with the last scan (a permanent that entered
 *  tapped never "became" tapped). */
function tapScan(s: GameState) {
  const prev: Record<string, boolean> | undefined = (s as any).tapSnap;
  const now: Record<string, boolean> = {};
  const newly: string[] = [];
  for (const b of s.battlefield) {
    const t = !!s.cards[b]?.tapped;
    now[b] = t;
    if (prev && t && prev[b] === false) newly.push(b);
    if (prev && !t && prev[b] === true) emit(s, 'untapScan', { iid: b });
  }
  (s as any).tapSnap = now;
  for (const b of newly) {
    const c = s.cards[b];
    for (const t of chars(s, b).pc.triggers) if (t.event === 'becomesTapped') queueTrigger(s, b, c.controller, t, {});
    emit(s, 'tapped', { iid: b, p: c.controller });
  }
}

// --------------------------------------------------------------------------------------------
// Pacing ("beats"): in a live game the server sets s.paced. Instead of auto-passing straight through a
// whole chain (cast → resolve → triggers → combat damage → next step) in one update, settle() stops
// right after something visible happened, so the client can show it. The server waits a moment and
// calls resumeBeat(). Players can still act during a pause (it just continues from there).
// --------------------------------------------------------------------------------------------
// every animation event is something to look at; only pure bookkeeping kinds are skipped
const NOT_BEAT = new Set(['chosen']);
function beatDue(s: GameState): boolean {
  const st = s as any;
  if (!st.paced || st.over) return false;
  const mark = st.beatMark ?? 0;
  const seq = st.evSeq ?? 0;
  if (seq <= mark) return false;
  const evs = (st.events ?? []) as any[];
  for (let i = evs.length - 1; i >= 0 && evs[i].seq > mark; i--) {
    if (!NOT_BEAT.has(evs[i].k)) {
      st.beat = { from: mark, to: seq };
      st.beatMark = seq;
      return true;
    }
  }
  st.beatMark = seq;
  return false;
}
/** The events of the pause the game is waiting on (null when not paused). */
export function pendingBeat(s: GameState): { from: number; to: number } | null {
  return (s as any).beat ?? null;
}
/** Continue a paced game after the server has let a beat play out. */
export function resumeBeat(s: GameState): boolean {
  const st = s as any;
  if (!st.beat) return false;
  st.beat = null;
  settle(s);
  s.version++;
  return true;
}

/** Run the game forward until a player decision is needed. */
export function settle(s: GameState) {
  let guard = 0;
  (s as any).beat = null;
  while (guard++ < 2000) {
    if (s.over) return;
    tapScan(s);
    if (s.prompt) return;
    if (s.resolving) {
      continueResolve(s);
      if (s.prompt) return;
      if (!s.resolving) s.priority = s.active;
      continue;
    }
    if (s.pendingCast) {
      advanceCast(s);
      if (s.prompt) return;
      continue;
    }
    if (checkSBA(s)) continue;
    if (s.over) return;
    if (s.pendingTriggers.length) {
      // pre-targeted triggers (ward) go straight on the stack
      const pre = s.pendingTriggers.find((t) => (t as any).preTargeted);
      if (pre) {
        s.pendingTriggers.splice(s.pendingTriggers.indexOf(pre), 1);
        s.stack.push(pre);
        log(s, `${pre.label} triggers.`, pre.controller);
        s.passes = 0;
        s.priority = s.active;
        continue;
      }
      flushTriggers(s);
      s.passes = 0;
      if (!s.pendingCast) s.priority = s.active;
      continue;
    }
    if ((s as any).needAdvance) {
      if (beatDue(s)) return;
      advanceStep(s);
      continue;
    }
    if (!s.started) return;
    if (!P(s, 0).kept || !P(s, 1).kept) return;
    if (s.step === 'untap' || s.step === 'cleanup') {
      (s as any).needAdvance = true;
      continue;
    }
    if (shouldAutoPass(s, s.priority)) {
      if (beatDue(s)) return;
      doPass(s, s.priority);
      continue;
    }
    // stopping for a player decision: whatever happened so far is shown with this update
    if ((s as any).paced) (s as any).beatMark = (s as any).evSeq ?? 0;
    return;
  }
  log(s, 'Engine loop guard hit — pausing automation.', undefined, 'warn');
}

// ============================================================================================
// Actions
// ============================================================================================

export function dispatch(s: GameState, p: PlayerIdx, a: Action): string | null {
  if (a.type === 'cast' || a.type === 'activate' || a.type === 'playLand') { const g = (s as any).loopGuard; if (g) g.n = 0; }
  if (s.over && a.type !== 'chat') return 'The game is over';
  let err: string | null = null;
  switch (a.type) {
    case 'chat':
      log(s, `${pname(s, p)}: ${a.text.slice(0, 300)}`, p, 'chat');
      break;
    case 'concede': {
      // 104.3a: conceding takes effect immediately (even during mulligans), not as a state-based action
      const pl = P(s, p);
      pl.conceded = true;
      if (!pl.lost) {
        pl.lost = true;
        log(s, `${pl.name} conceded and loses the game.`, p, 'turn');
      }
      const alive = s.players.filter((x) => !x.lost);
      if (alive.length < 2) {
        s.over = true;
        s.winner = alive.length === 1 ? alive[0].idx : null;
        if (alive.length === 1) log(s, `${alive[0].name} wins!`, alive[0].idx, 'turn');
        s.prompt = null;
        s.promptQueue = [];
      }
      break;
    }
    case 'setPace':
      (P(s, p) as any).pace = ['fast', 'normal', 'slow'].includes((a as any).pace) ? (a as any).pace : 'normal';
      break;
    case 'setStops':
      P(s, p).stops = { own: a.own, opp: a.opp };
      if (a.fullControl !== undefined) P(s, p).fullControl = a.fullControl;
      break;
    case 'passUntilEOT':
      P(s, p).passUntilEOT = a.on;
      if (a.on && s.priority === p && !s.prompt && !s.pendingCast) doPass(s, p);
      break;
    case 'pass':
      if (s.prompt) return 'Answer the current prompt first';
      if (s.priority !== p) return "You don't have priority";
      doPass(s, p);
      break;
    case 'playLand': {
      if (s.prompt) return 'Answer the current prompt first';
      const c = s.cards[a.iid];
      const fromOther = c && (((c.zone === 'exile' || c.zone === 'graveyard') && c.mayPlay?.player === p && c.mayPlay.untilTurn >= s.turn && !(c.mayPlay as any).castOnly) || (c.zone === 'graveyard' && c.owner === p && gyLandsAllowed(s, p)) || (c.zone === 'library' && c.owner === p && P(s, p).library[0] === c.iid && EXT.hooks.zoneCast.some((h) => h(s, p, c, null, api) === 'mayPlay')));
      if (!c || ((c.zone !== 'hand' || c.owner !== p) && !fromOther)) return 'That card is not in your hand';
      const lf = a.face ?? landFace(s, a.iid);
      if (lf === null || lf === undefined) return 'Not a land';
      if (!sorcerySpeed(s, p)) return 'You can play lands only in your main phase with an empty stack';
      if ((P(s, p) as any).noLandsTurn === s.turn || EXT.hooks.cantPlayLand.some((h) => h(s, p, api))) return "You can't play lands right now";
      if (s.priority !== p) return "You don't have priority";
      const pl = P(s, p);
      if (pl.landsPlayed >= landsAllowed(s, p)) return "You've already played a land this turn";
      pl.landsPlayed++;
      c.face = lf;
      moveCard(s, a.iid, 'battlefield', { controller: p });
      c.face = lf;
      log(s, `${pl.name} plays ${nm(s, a.iid)}.`, p);
      emit(s, 'landPlayed', { p, iid: a.iid });
      break;
    }
    case 'cast':
      if (s.prompt || s.pendingCast) return 'Finish the current action first';
      err = beginCast(s, p, a.iid, a.face ?? 0, a.alt ?? 'normal', !!a.kicker);
      break;
    case 'turnFaceUp':
      if (s.prompt || s.pendingCast) return 'Finish the current action first';
      err = turnFaceUp(s, p, a.iid);
      break;
    case 'activate':
      if (s.prompt || s.pendingCast) return 'Finish the current action first';
      err = beginActivate(s, p, a.iid, a.ability);
      break;
    case 'tapForMana': {
      if (s.prompt && !(s.prompt.player === p && ['x', 'targets'].includes(s.prompt.kind))) return 'Answer the current prompt first';
      const c = s.cards[a.iid];
      if (!c || c.controller !== p || c.zone !== 'battlefield') return 'Not your permanent';
      const abs = manaAbilities(s, a.iid);
      if (!abs.length) return 'That has no mana ability';
      const pick = a.ability != null ? abs.find((x) => x.idx === a.ability) : abs.find((x) => canPayActCostBasics(s, p, a.iid, x.a));
      if (!pick) return "Can't tap that for mana now";
      err = activateManaAbility(s, p, a.iid, pick.idx);
      break;
    }
    case 'answer':
      err = answer(s, p, a.promptId, a.choice);
      break;
    case 'cancel': {
      const pr = s.prompt;
      if (!pr || pr.id !== a.promptId || pr.player !== p) return 'No such prompt';
      if (!pr.canCancel) return "This can't be cancelled";
      nextPrompt(s);
      if (pr.data?.ctx === 'cast') cancelCast(s);
      break;
    }
    case 'keep':
    case 'mulligan':
      if (!s.prompt || s.prompt.kind !== 'mulligan' || s.prompt.player !== p) return 'Not deciding a mulligan';
      err = answer(s, p, s.prompt.id, a.type);
      break;
    case 'manual':
      err = manual(s, p, a.op);
      break;
  }
  if (!err) {
    settle(s);
    s.version++;
  }
  const ce = (s as any).castError;
  if (ce) {
    (s as any).castError = undefined;
    if (ce.player === p && !err) return ce.text;
    log(s, ce.text, ce.player, 'warn');
  }
  return err;
}

function answer(s: GameState, p: PlayerIdx, promptId: string, choice: any): string | null {
  const pr = s.prompt;
  if (!pr || pr.id !== promptId) return 'That prompt is no longer active';
  if (pr.player !== p) return 'Not your decision';
  const ctx = pr.data?.ctx;

  if (pr.kind === 'divide') {
    const arr: number[] = Array.isArray(choice) ? choice.map((x) => Math.floor(+x || 0)) : [];
    const total = pr.min ?? 0;
    // (if X ended up smaller than the number of targets, the extra targets may get 0)
    const least = (pr.targets?.length ?? 0) > total ? 0 : 1;
    if (arr.length !== (pr.targets?.length ?? 0) || arr.some((x) => x < least) || arr.reduce((a, b) => a + b, 0) !== total) return `Assign at least ${least} to each target, ${total} in total`;
    choice = arr;
  }
  // validate counts for card/target choices
  if (pr.kind === 'chooseCards' || pr.kind === 'targets') {
    const arr: any[] = Array.isArray(choice) ? choice : [];
    if (pr.min != null && arr.length < pr.min) return `Choose at least ${pr.min}`;
    if (pr.max != null && arr.length > pr.max) return `Choose at most ${pr.max}`;
    if (pr.kind === 'chooseCards' && arr.some((x) => !pr.cards?.includes(x))) return 'Invalid choice';
    if (pr.kind === 'targets' && arr.some((x) => !pr.targets?.some((t) => JSON.stringify(t) === JSON.stringify(x)))) return 'Illegal target';
  }

  switch (ctx) {
    case 'mulligan': {
      const pl = P(s, p);
      nextPrompt(s);
      if (choice === 'mulligan' && pl.mulligans < 7) {
        pl.mulligans++;
        for (const h of [...pl.hand]) moveCard(s, h, 'libraryBottom');
        shuffleArr(s, pl.library);
        drawCards(s, p, 7, true);
        log(s, `${pl.name} mulligans (${pl.mulligans}).`, p);
        pushPrompt(s, mulliganPrompt(s, p));
        return null;
      }
      if (pl.mulligans > 0) {
        pushPrompt(s, { id: uid(s, 'p'), player: p, kind: 'chooseCards', title: `Put ${pl.mulligans} card${pl.mulligans > 1 ? 's' : ''} on the bottom of your library`, cards: [...pl.hand], min: Math.min(pl.mulligans, pl.hand.length), max: Math.min(pl.mulligans, pl.hand.length), data: { ctx: 'bottom' } });
        return null;
      }
      keptHand(s, p);
      return null;
    }
    case 'bottom': {
      nextPrompt(s);
      for (const iid of choice as string[]) moveCard(s, iid, 'libraryBottom');
      keptHand(s, p);
      return null;
    }
    case 'manaColor': {
      nextPrompt(s);
      return activateManaAbility(s, p, pr.data.iid, pr.data.idx, pr.data.picks ? [...pr.data.picks, choice as Color] : (choice as Color), pr.data.sac, pr.data.nRemove);
    }
    case 'manaCount': {
      const n = Math.max(0, Math.min(pr.max ?? 0, Math.floor(+(choice as any) || 0)));
      nextPrompt(s);
      return activateManaAbility(s, p, pr.data.iid, pr.data.idx, pr.data.color, pr.data.sac, n);
    }
    case 'unblocked': {
      nextPrompt(s);
      const a = s.combat?.attackers.find((x) => x.iid === pr.data.iid);
      if (a) (a as any).asUnblocked = choice === 'yes';
      combatDamage(s, pr.data.first);
      return null;
    }
    case 'manaSac': {
      const picked = (choice as string[]) ?? [];
      if (picked.length !== pr.min || picked.some((x) => !pr.cards!.includes(x))) return `Choose ${pr.min} to sacrifice`;
      nextPrompt(s);
      return activateManaAbility(s, p, pr.data.iid, pr.data.idx, pr.data.color, picked);
    }
    case 'cleanup': {
      nextPrompt(s);
      for (const iid of choice as string[]) moveCard(s, iid, 'graveyard');
      log(s, `${pname(s, p)} discards ${(choice as string[]).length} to hand size.`, p);
      doCleanup(s);
      return null;
    }
    case 'attack':
      return declareAttackers(s, p, choice);
    case 'block':
      return declareBlockers(s, p, choice);
    case 'cast': {
      const pc = s.pendingCast;
      if (!pc) { nextPrompt(s); return null; }
      if (pr.kind === 'mode') {
        const chosen: number[] = (Array.isArray(choice) ? choice : [choice]).map((x: any) => +x);
        const modes = { ...pc.ability.modes };
        if (modes.commanderMax && s.battlefield.some((b) => s.cards[b].controller === pr.player && (s.cards[b] as any).isCommander)) modes.max = modes.commanderMax;
        if (modes.condMax && (modes.condMax.cond.k === 'kickedCast' ? !!pc.kicker : (modes.condMax.cond as any).name === 'castFlag' && (modes.condMax.cond as any).flag === 'optPaid' ? !!pc.extOpt?.length : evalCond(s, modes.condMax.cond, pr.player, pc.iid))) modes.max = modes.condMax.max;
        if (!modes.repeat && new Set(chosen).size !== chosen.length) return 'Each mode can be chosen only once';
        if (chosen.some((i) => !(i >= 0 && i < modes.options.length))) return 'Invalid mode';
        if (chosen.length < modes.min || chosen.length > modes.max) return `Choose ${modes.min}–${modes.max} modes`;
        nextPrompt(s);
        // Spree: each chosen mode adds its own cost
        const modeCosts = (modes as any).costs as string[] | undefined;
        if (modeCosts && pc.kind !== 'trigger' && pc.kind !== 'ability') pc.manaCost = (pc.manaCost ?? '') + chosen.map((i) => modeCosts[i] ?? '').join('');
        const esc = (modes as any).escalate as string | undefined; // escalate: once per mode beyond the first
        if (esc && /^(?:\{[^}]+\})+$/.test(esc) && chosen.length > 1) pc.manaCost = (pc.manaCost ?? '') + esc.toUpperCase().repeat(chosen.length - 1);
        const comb = combineModes(pc.ability, chosen);
        pc.ability = comb;
        pc.specs = comb.specs;
        if (pc.kind === 'trigger') {
          pc.item.manual = comb.manual.length ? comb.manual : undefined;
        }
        pc.stage = pc.hasX ? 'x' : 'targets';
        return null;
      }
      if (pr.kind === 'x') {
        const x = Math.max(0, Math.floor(+choice || 0));
        nextPrompt(s);
        pc.x = x;
        pc.stage = 'targets';
        return null;
      }
      if (pr.kind === 'targets') {
        nextPrompt(s);
        pc.targets.push(choice as Target[]);
        pc.specIdx++;
        return null;
      }
      if (pr.kind === 'yesno' && typeof pr.data.cost === 'string' && pr.data.cost.startsWith('ext')) {
        pc[pr.data.cost] = choice;
        nextPrompt(s);
        return null;
      }
      if (pr.kind === 'chooseCards') {
        const cost = pr.data.cost;
        if (cost === 'crew') {
          const total = (choice as string[]).reduce((acc, i) => acc + chars(s, i).power, 0);
          if (total < (pc.crew ?? 0)) return `Total power must be at least ${pc.crew}`;
          pc.crewChosen = choice;
        } else if (cost === 'sac') pc.sacChosen = choice;
        else if (cost === 'escape') pc.escapeChosen = choice;
        else if (cost === 'craft') pc.craftChosen = choice;
        else if (cost === 'discard') pc.discardChosen = choice;
        else if (cost === 'tap') pc.tapChosen = choice;
        else if (cost === 'altSac' || cost === 'altBounce' || cost === 'altExile' || cost === 'altDiscard') pc[cost] = choice;
        else if (typeof cost === 'string' && cost.startsWith('ext')) {
          // collect evidence N: the exiled cards' total mana value must be N or more (or choose none to skip)
          const need = pr.data.minTotalMv as number | undefined;
          if (need && (choice as string[]).length && (choice as string[]).reduce((a, i) => a + (s.defs[s.cards[i].defId].cmc ?? 0), 0) < need) return `Choose cards with total mana value ${need} or more (or none)`;
          pc[cost] = choice;
        }
        nextPrompt(s);
        return null;
      }
      nextPrompt(s);
      return null;
    }
    case 'resolve': {
      const r = s.resolving;
      nextPrompt(s);
      if (!r) return null;
      r.sub ??= {};
      if (pr.kind === 'yesno') r.sub.answered = choice;
      else r.sub.answer = choice;
      return null;
    }
  }
  nextPrompt(s);
  return null;
}

function keptHand(s: GameState, p: PlayerIdx) {
  const pl = P(s, p);
  pl.kept = true;
  log(s, `${pl.name} keeps ${pl.hand.length} cards.`, p);
  const other = opp(p);
  if (!P(s, other).kept) {
    pushPrompt(s, mulliganPrompt(s, other));
    return;
  }
  // both kept: begin turn 1
  s.turn = 1;
  s.active = s.startingPlayer;
  log(s, `Turn 1 — ${pname(s, s.active)}`, s.active, 'turn');
  beginStep(s, 'untap');
}

export function attackCostOf(s: GameState, iid: string, target: any): string | null {
  const parts = EXT.hooks.attackCost.map((h) => h(s, iid, target, api)).filter(Boolean);
  return parts.length ? parts.join('') : null;
}

function attackers_list_check(s: GameState, choice: { iid: string; target: Target }[]): string | null {
  if (choice.length !== 1) return null;
  return (chars(s, choice[0].iid).pc as any).cantAttackAlone ? `${nm(s, choice[0].iid)} can't attack alone` : null;
}

function declareAttackers(s: GameState, p: PlayerIdx, choice: { iid: string; target: Target }[]): string | null {
  const pr = s.prompt!;
  const list = Array.isArray(choice) ? choice : [];
  const seen = new Set<string>();
  for (const a of list) {
    if (seen.has(a.iid)) return 'Duplicate attacker';
    seen.add(a.iid);
    if (!pr.cards?.includes(a.iid) || !canAttack(s, a.iid)) return `${nm(s, a.iid)} can't attack`;
    if (!pr.targets?.some((t) => JSON.stringify(t) === JSON.stringify(a.target))) return 'Invalid attack target';
  }
  // "attacks each combat if able"
  // "~ can't attack alone"
  const alone = attackers_list_check(s, choice);
  if (alone) return alone;
  const must = (pr.cards ?? []).filter((i) => canAttack(s, i) && !attackCostOf(s, i, pr.targets?.find((t) => t.kind === 'player')) && (chars(s, i).pc.mustAttack || (chars(s, i) as any).mustAttackSt || (s.cards[i] as any).mustAttackTurn === s.turn || ((s.cards[i] as any).goadUntil ?? 0) > s.turn) && !seen.has(i));
  if (must.length) return `${nm(s, must[0])} attacks each combat if able`;
  // "creatures can't attack you unless their controller pays {2} for each …" (508.1h): pay the total now
  const tax = list.map((a) => attackCostOf(s, a.iid, a.target) ?? '').join('');
  if (tax) {
    if (!canAfford(s, p, tax)) return `Attacking costs ${tax} — not enough mana`;
    payMana(s, p, tax, 0);
    log(s, `${pname(s, p)} pays ${tax} to attack.`, p);
  }
  nextPrompt(s);
  const cmb = (s.combat ??= { attackers: [], declared: false, blocksDeclared: false, firstStrike: false });
  cmb.declared = true;
  const prevCause = (s as any).trigCause;
  (s as any).trigCause = { k: 'attack', iid: list[0]?.iid, types: ['creature'], controller: p };
  // all attackers are declared at once (508.1): conditions checked by attack triggers see the whole list
  (s as any).attackDeclared = { turn: s.turn, ids: list.map((a) => a.iid) };
  for (const a of list) {
    const c = s.cards[a.iid];
    const ch = chars(s, a.iid);
    if (!ch.keywords.has('vigilance')) {
      c.tapped = true; // "becomes tapped" triggers: tapScan
    }
    cmb.attackers.push({ iid: a.iid, target: a.target, blockedBy: [], blocked: false });
    for (const t of ch.pc.triggers) if (t.event === 'attacks' || t.event === 'attacksOrBlocks') queueTrigger(s, a.iid, p, t, {});
    if (ch.keywords.has('exalted') && list.length === 1) void 0;
  }
  // exalted: each instance triggers when a creature attacks alone
  if (list.length === 1) {
    for (const iid of s.battlefield) {
      if (s.cards[iid].controller === p && chars(s, iid).keywords.has('exalted')) {
        queueTrigger(s, iid, p, { event: 'attacks', text: 'Exalted', ability: { text: 'exalted', effects: [{ k: 'pump', what: { t: 'triggerObj' }, p: 1, t: 1, kw: [], eot: true }], specs: [], manual: [] } }, { triggerObj: list[0].iid });
      }
    }
  }
  if (list.length) emit(s, 'attack', { p, list });
  (s as any).trigCause = prevCause;
  if (list.length) ev(s, { k: 'attack', p, attackers: list.map((a) => a.iid) });
  if (list.length) log(s, `${pname(s, p)} attacks with ${list.map((a) => nm(s, a.iid)).join(', ')}.`, p, 'combat');
  else {
    log(s, `${pname(s, p)} doesn't attack.`, p, 'combat');
    (s as any).skipTo = 'endCombat';
    (s as any).needAdvance = true;
    return null;
  }
  s.priority = s.active;
  s.passes = 0;
  return null;
}

function declareBlockers(s: GameState, p: PlayerIdx, choice: { blocker: string; attacker: string }[]): string | null {
  const pr = s.prompt!;
  const cmb = s.combat!;
  const list = Array.isArray(choice) ? choice : [];
  const used = new Set<string>();
  for (const b of list) {
    const maxB = Math.max(1, ...EXT.hooks.maxBlocks.map((h) => h(s, b.blocker, api) ?? 1));
    const usedN = list.filter((x) => x.blocker === b.blocker).length;
    if (usedN > maxB) return `${nm(s, b.blocker)} can only block ${maxB === 1 ? 'one creature' : `${maxB} creatures`}`;
    used.add(b.blocker);
    if (!pr.cards?.includes(b.blocker)) return 'Invalid blocker';
    if (!cmb.attackers.some((a) => a.iid === b.attacker)) return 'Invalid attacker';
    if (!canBlock(s, b.blocker, b.attacker)) return `${nm(s, b.blocker)} can't block ${nm(s, b.attacker)}`;
  }
  for (const a of cmb.attackers) {
    const n = list.filter((b) => b.attacker === a.iid).length;
    if (n === 1 && chars(s, a.iid).keywords.has('menace')) return `${nm(s, a.iid)} has menace and must be blocked by two or more creatures`;
  }
  for (const h of EXT.hooks.validateBlocks) {
    const err = h(s, list, api);
    if (err) return err;
  }
  nextPrompt(s);
  for (const b of list) {
    const a = cmb.attackers.find((x) => x.iid === b.attacker)!;
    a.blockedBy.push(b.blocker);
    a.blocked = true;
    for (const t of chars(s, b.blocker).pc.triggers) if (t.event === 'blocks' || t.event === 'attacksOrBlocks') queueTrigger(s, b.blocker, p, t, {});
  }
  for (const a of cmb.attackers) {
    if (a.blocked) for (const t of chars(s, a.iid).pc.triggers) if (t.event === 'blocked') queueTrigger(s, a.iid, s.cards[a.iid].controller, t, {});
  }
  cmb.blocksDeclared = true;
  emit(s, 'blocks', { p, list });
  ev(s, { k: 'blocks', p, blocks: list.map((b) => ({ blocker: b.blocker, attacker: b.attacker })) });
  if (list.length) log(s, `${pname(s, p)} blocks: ${list.map((b) => `${nm(s, b.blocker)} → ${nm(s, b.attacker)}`).join(', ')}.`, p, 'combat');
  else log(s, `${pname(s, p)} doesn't block.`, p, 'combat');
  s.priority = s.active;
  s.passes = 0;
  return null;
}

// ============================================================================================
// Manual (untap-style) operations — always logged
// ============================================================================================

function manual(s: GameState, p: PlayerIdx, op: ManualOp): string | null {
  const me = pname(s, p);
  const own = (iid: string) => {
    const c = s.cards[iid];
    if (!c) return false;
    return c.zone === 'battlefield' ? c.controller === p : c.owner === p;
  };
  const L = (t: string) => log(s, `${me} (manual): ${t}`, p, 'manual');
  switch (op.op) {
    case 'tap': {
      if (!own(op.iid)) return 'Not yours';
      const c = s.cards[op.iid];
      c.tapped = !c.tapped;
      L(`${c.tapped ? 'taps' : 'untaps'} ${nm(s, op.iid)}`);
      break;
    }
    case 'move': {
      if (!own(op.iid)) return 'Not yours';
      const c = s.cards[op.iid];
      const from = c.zone;
      const n = c.zone === 'library' || (c.zone === 'hand' && op.to !== 'battlefield') ? 'a card' : nm(s, op.iid);
      if (c.zone === 'stack') {
        s.stack = s.stack.filter((x) => !(x.kind === 'spell' && x.source === op.iid));
        c.zone = 'library';
      }
      moveCard(s, op.iid, op.to as any, { controller: p });
      L(`moves ${n} from ${from} to ${op.to}`);
      break;
    }
    case 'counter': {
      const c = s.cards[op.iid];
      if (!c) return 'No card';
      c.counters[op.counter] = Math.max(0, (c.counters[op.counter] ?? 0) + op.delta);
      if (c.counters[op.counter] === 0) delete c.counters[op.counter];
      L(`${op.delta > 0 ? 'adds' : 'removes'} ${Math.abs(op.delta)} ${op.counter} counter(s) ${op.delta > 0 ? 'to' : 'from'} ${nm(s, op.iid)}`);
      break;
    }
    case 'damage': {
      const c = s.cards[op.iid];
      if (!c) return 'No card';
      c.damage = Math.max(0, c.damage + op.delta);
      L(`marks ${op.delta} damage on ${nm(s, op.iid)}`);
      break;
    }
    case 'life': {
      if (op.delta < 0) loseLife(s, op.player, -op.delta);
      else gainLife(s, op.player, op.delta);
      L(`${op.delta > 0 ? '+' : ''}${op.delta} life for ${pname(s, op.player)}`);
      break;
    }
    case 'poison':
      P(s, op.player).poison = Math.max(0, P(s, op.player).poison + op.delta);
      L(`${op.delta > 0 ? '+' : ''}${op.delta} poison for ${pname(s, op.player)}`);
      break;
    case 'draw':
      drawCards(s, p, Math.max(1, Math.min(op.n, 20)));
      L(`draws ${op.n}`);
      break;
    case 'shuffle':
      shuffleArr(s, P(s, p).library);
      L('shuffles their library');
      break;
    case 'mill':
      for (let i = 0; i < op.n; i++) {
        const t = P(s, p).library[0];
        if (t) moveCard(s, t, 'graveyard');
      }
      L(`mills ${op.n}`);
      break;
    case 'transform': {
      if (!own(op.iid)) return 'Not yours';
      const c = s.cards[op.iid];
      const def = s.defs[c.defId];
      if (!def.faces || def.faces.length < 2) return 'This card has only one face';
      c.face = c.face ? 0 : 1;
      c.transformed = !!c.face;
      L(`turns ${def.faces[c.face ? 0 : 1].name} to ${def.faces[c.face].name}`);
      break;
    }
    case 'faceDown': {
      if (!own(op.iid)) return 'Not yours';
      const c = s.cards[op.iid];
      c.faceDown = !c.faceDown;
      L(`turns a card face ${c.faceDown ? 'down' : 'up'}`);
      break;
    }
    case 'token': {
      const n = Math.max(1, Math.min(op.count ?? 1, 20));
      for (let i = 0; i < n; i++) {
        createToken(s, p, {
          name: op.name || 'Token', power: op.power, toughness: op.toughness, colors: op.colors ?? [],
          types: op.types || (op.power ? `Token Creature — ${op.name}` : `Token Artifact — ${op.name}`), keywords: (op.keywords ?? []).map((k) => k.toLowerCase()), oracle: (op.keywords ?? []).join(', '),
        });
      }
      L(`creates ${n} ${op.name} token(s)`);
      break;
    }
    case 'clone': {
      const c = s.cards[op.iid];
      if (!c) return 'No card';
      const iid = uid(s);
      s.cards[iid] = newCardObj(iid, c.defId, p, 'library');
      s.cards[iid].token = true;
      moveCard(s, iid, 'battlefield', { controller: p });
      L(`creates a token copy of ${nm(s, op.iid)}`);
      break;
    }
    case 'control': {
      const c = s.cards[op.iid];
      if (!c || c.zone !== 'battlefield') return 'Not on the battlefield';
      c.controller = opp(c.controller);
      L(`gives control of ${nm(s, op.iid)} to ${pname(s, c.controller)}`);
      break;
    }
    case 'pump': {
      const c = s.cards[op.iid];
      if (!c) return 'No card';
      c.mods.push({ power: op.power, toughness: op.toughness, until: 'eot' });
      L(`gives ${nm(s, op.iid)} ${op.power >= 0 ? '+' : ''}${op.power}/${op.toughness >= 0 ? '+' : ''}${op.toughness} until end of turn`);
      break;
    }
    case 'reveal': {
      if (!own(op.iid)) return 'Not yours';
      const c = s.cards[op.iid];
      c.revealed = !c.revealed;
      L(`${c.revealed ? 'reveals' : 'hides'} ${nm(s, op.iid)}`);
      break;
    }
    case 'untapAll':
      for (const iid of s.battlefield) if (s.cards[iid].controller === p) s.cards[iid].tapped = false;
      L('untaps all permanents');
      break;
    case 'mana': {
      const pool = P(s, p).pool;
      pool[op.color] = Math.max(0, pool[op.color] + op.delta);
      L(`${op.delta > 0 ? 'adds' : 'removes'} {${op.color}}`);
      break;
    }
    case 'attach': {
      const c = s.cards[op.iid];
      if (!c || !own(op.iid)) return 'Not yours';
      c.attachedTo = op.to ?? undefined;
      L(op.to ? `attaches ${nm(s, op.iid)} to ${nm(s, op.to)}` : `unattaches ${nm(s, op.iid)}`);
      break;
    }
    case 'resolveTop': {
      // Emergency: skip the rest of a stuck resolution / clear the top of the stack
      if (s.resolving) {
        const it = s.resolving.item;
        s.resolving = null;
        s.prompt = null;
        if (it.kind === 'spell') finishSpell(s, it, false);
        L('finishes resolving manually');
      }
      s.manualNotice = null;
      break;
    }
  }
  return null;
}

// ============================================================================================
// Views (hidden information)
// ============================================================================================

export interface CardView extends Partial<CardObj> {
  iid: string;
  hidden?: boolean;
  p?: number;
  t?: number;
  kw?: string[];
  auto?: 'full' | 'partial' | 'manual';
  canAttack?: boolean;
  abilities?: { idx: number; label: string; isMana: boolean; ok: boolean }[];
  playable?: boolean;
}

function deckImagesOf(s: GameState, p: PlayerIdx): string[] {
  const memo = ((s as any).deckImg ??= {}) as Record<number, string[]>;
  if (memo[p]) return memo[p];
  const out = new Set<string>();
  for (const c of Object.values(s.cards)) {
    if (c.owner !== p || c.token) continue;
    const d = s.defs[c.defId];
    if (!d) continue;
    if (d.image) out.add(d.image);
    for (const f of d.faces ?? []) if (f.image) out.add(f.image);
  }
  return (memo[p] = [...out]);
}

export function viewFor(s: GameState, viewer: PlayerIdx | null) {
  const visible = (c: CardObj): boolean => {
    if (c.zone === 'battlefield') return !c.faceDown || c.controller === viewer;
    if (c.zone === 'stack' || c.zone === 'graveyard' || c.zone === 'exile') return !c.faceDown || c.owner === viewer;
    if (c.zone === 'hand') return c.owner === viewer || !!c.revealed;
    if (c.zone === 'command') return true;
    return false; // library
  };
  const promptCards = new Set<string>(s.prompt && s.prompt.player === viewer ? [...(s.prompt.cards ?? []), ...(((s.prompt as any).looked ?? []) as string[])] : []);
  const promptCardsAdd = (x: string) => promptCards.add(x);
  const topPeek = new Set<string>();
  const revealedTops = new Map<number, string>();
  for (const pl of s.players) {
    const top = pl.library[0];
    // "Play with the top card of your library revealed." (also implied by playing from the top, 401.5)
    if (top && s.battlefield.some((b) => s.cards[b].controller === pl.idx && ((baseChars(s, b).pc as any).topRevealed))) { revealedTops.set(pl.idx, top); promptCardsAdd(top); }
  }
  if (viewer != null) {
    const top = P(s, viewer).library[0];
    if (top && s.battlefield.some((b) => s.cards[b].controller === viewer && ((baseChars(s, b).pc as any).lookTop || (baseChars(s, b).pc as any).topPlay))) topPeek.add(top);
  }
  for (const t of topPeek) promptCards.add(t);
  const playable = viewer != null && s.priority === viewer && !s.prompt && !s.pendingCast && !s.over && s.started ? playableCards(s, viewer) : new Set<string>();
  const cards: Record<string, CardView> = {};
  const defs: Record<string, CardDef> = {};
  for (const [iid, c] of Object.entries(s.cards)) {
    if (c.zone === 'library' && !promptCards.has(iid)) continue;
    if (visible(c) || promptCards.has(iid)) {
      const v: CardView = { ...c };
      if (c.zone === 'battlefield') {
        const ch = chars(s, iid);
        v.p = ch.power;
        v.t = ch.toughness;
        v.kw = [...ch.keywords];
        v.canAttack = s.step === 'declareAttackers' && canAttack(s, iid);
        (v as any).types = [...ch.types];
      }
      if (c.zone !== 'library' || promptCards.has(iid)) {
        const pc = parsedFor(s, c);
        v.abilities = pc.activated.map((a, idx) => ({ idx, label: a.label, isMana: a.isMana, zone: a.zone, ok: viewer != null && canPayActCostBasics(s, viewer, iid, a) })) as any;
        (v as any).unparsed = pc.unparsed;
      }
      if (playable.has(iid)) v.playable = true;
      if (viewer != null && (c.owner === viewer || c.mayPlay?.player === viewer) && ['hand', 'graveyard', 'exile'].includes(c.zone)) {
        const opts = castOptions(s, viewer, iid);
        if (opts.length) (v as any).castOptions = opts;
      }
      if (viewer != null && c.zone === 'battlefield' && c.faceDown && c.controller === viewer && c.morph && !(c.morph as any).cantTurnUp) {
        (v as any).faceUpCost = c.morph.cost || '{0}';
      }
      cards[iid] = v;
      defs[c.defId] = s.defs[c.defId];
    } else {
      cards[iid] = { iid, hidden: true, zone: c.zone, owner: c.owner, controller: c.controller, tapped: c.tapped, faceDown: c.faceDown, attachedTo: c.attachedTo, counters: c.zone === 'battlefield' ? c.counters : {} };
    }
  }
  const players = s.players.map((p) => ({
    ...p,
    library: [] as string[],
    libraryCount: p.library.length,
    stops: p.idx === viewer ? p.stops : undefined,
    pace: p.idx === viewer ? (p as any).pace ?? 'normal' : undefined,
    libraryTop: revealedTops.get(p.idx) ?? (p.idx === viewer ? [...topPeek][0] : undefined),
    monarch: (s as any).monarch === p.idx,
    command: (p as any).command ?? [],
    commanderCasts: (p as any).commanderCasts ?? {},
    commanderDamage: (p as any).commanderDamage ?? {},
    initiative: (s as any).initiative === p.idx,
    dungeon: (p as any).dungeon ? { name: s.defs[s.cards[(p as any).dungeon.iid]?.defId]?.name, room: (p as any).dungeon.room, image: cardImageOf(s, (p as any).dungeon.iid), oracle: s.defs[s.cards[(p as any).dungeon.iid]?.defId]?.oracle } : null,
  }));
  let prompt: any = null;
  if (s.prompt) {
    const { data, ...rest } = s.prompt;
    prompt = s.prompt.player === viewer ? rest : { id: rest.id, player: rest.player, kind: rest.kind, title: rest.kind === 'declareBlockers' ? 'Opponent is declaring blockers' : rest.kind === 'declareAttackers' ? 'Opponent is declaring attackers' : 'Opponent is deciding…' };
  }
  let casting: any = null;
  if (s.pendingCast) casting = { player: s.pendingCast.player, label: s.pendingCast.label ?? s.pendingCast.item?.label, iid: s.pendingCast.iid ?? s.pendingCast.item?.source };
  const out = {
    id: s.id, version: s.version, started: s.started, over: s.over, winner: s.winner, turn: s.turn, active: s.active,
    startingPlayer: s.startingPlayer, step: s.step, stepLabel: STEP_LABEL[s.step], priority: s.priority, players, cards, defs,
    battlefield: s.battlefield, stack: s.stack.map((it) => ({ ...it, effects: undefined, specs: undefined })), combat: s.combat,
    prompt, casting, log: s.log.slice(-150), manualNotice: s.manualNotice, you: viewer,
    // your own deck's card images (never the opponent's), so the client can load them before you draw them
    deckImages: viewer != null ? deckImagesOf(s, viewer) : undefined,
    canPlay: viewer != null && s.priority === viewer && !s.prompt ? canPlaySomething(s, viewer) : false,
    landsPlayed: viewer != null ? P(s, viewer).landsPlayed : 0, landsAllowed: viewer != null ? landsAllowed(s, viewer) : 1,
    dayNight: s.dayNight,
    format: (s as any).format ?? 'constructed',
    events: ((s as any).events ?? []).slice(-60) as any[],
    evSeq: (s as any).evSeq ?? 0,
  };
  for (const h of EXT.hooks.view) h(s, viewer, out);
  return out;
}

export type GameView = ReturnType<typeof viewFor>;

/** Engine internals exposed to plugins (src/engine/ext/*). */
export const api: Record<string, any> = {
  P, log, ev, uid, nm, pname, rand, shuffleArr, clone, moveCard, addCounters, transformCard, drawCards, pushPrompt, queueTrigger,
  dealDamage, damagePlayer, gainLife, loseLife, destroy, createToken, copyToken, subjCards, subjPlayers, amount, payMana, canAfford,
  legalTargets, beginCast, chars, baseChars, parsedFor, matchesFilter, evalCond, evalAmt, gateOk, opp, cardImageOf, execEffect, removeFromZone,
  newCardObj, parseCard, parseAbility, normalizeText, finishSpell, canAttack, canBlock, availableMana, emit, fireSimple, observers, counterItem,
};
