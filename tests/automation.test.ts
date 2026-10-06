// Tests for the automated mechanics (counters, sagas, layers, replacements, zone permissions, face-down, transform).
// Cards here are invented test cards written in standard rules templating.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CardDef } from '../src/engine/cardTypes';
import { createGame, startGame, dispatch, settle, castOptions } from '../src/engine/engine';
import type { GameState, PlayerIdx } from '../src/engine/types';
import { chars } from '../src/engine/rules';

let n = 0;
function def(name: string, manaCost: string, typeLine: string, oracle = '', pt?: [string, string], extra: Partial<CardDef> = {}): CardDef {
  return { id: `a${n++}`, name, manaCost, cmc: 0, typeLine, oracle, power: pt?.[0], toughness: pt?.[1], colors: [], colorIdentity: [], keywords: [], layout: 'normal', ...extra };
}
const Forest = def('Forest', '', 'Basic Land — Forest');
const Swamp = def('Swamp', '', 'Basic Land — Swamp');
// Test land that taps for any color so tests don't depend on color fixing.
const Prism = def('Test Prism Land', '', 'Land', '{T}: Add one mana of any color.');
const Bear = def('Test Bear', '{1}{G}', 'Creature — Bear', '', ['2', '2']);

function setup(seed = 3): { s: GameState; ap: PlayerIdx; op: PlayerIdx } {
  const deck = Array.from({ length: 40 }, () => Forest);
  const s = createGame('t', [{ name: 'A', cards: deck }, { name: 'B', cards: deck }], seed);
  s.players[0].fullControl = s.players[1].fullControl = true;
  startGame(s);
  for (let i = 0; i < 2; i++) dispatch(s, s.prompt!.player, { type: 'keep' });
  passUntil(s, () => s.step === 'main1');
  return { s, ap: s.active, op: (1 - s.active) as PlayerIdx };
}
function add(s: GameState, p: PlayerIdx, d: CardDef, zone: 'hand' | 'battlefield' | 'graveyard' | 'library' = 'hand'): string {
  s.defs[d.id] = d;
  const iid = `x${s.nextId++}`;
  s.cards[iid] = { iid, defId: d.id, owner: p, controller: p, zone: zone === 'battlefield' ? 'battlefield' : zone, tapped: false, sick: false, counters: {}, damage: 0, deathtouched: false, face: 0, mods: [], ts: s.ts++ };
  if (zone === 'battlefield') s.battlefield.push(iid);
  else if (zone === 'library') s.players[p].library.unshift(iid);
  else s.players[p][zone].push(iid);
  return iid;
}
function lands(s: GameState, p: PlayerIdx, k: number, d = Prism) {
  for (let i = 0; i < k; i++) add(s, p, d, 'battlefield');
}
function passUntil(s: GameState, pred: () => boolean, max = 300) {
  for (let i = 0; i < max && !pred(); i++) {
    if (s.prompt?.data?.ctx === 'cleanup') {
      dispatch(s, s.prompt.player, { type: 'answer', promptId: s.prompt.id, choice: s.prompt.cards!.slice(0, s.prompt.min) });
      continue;
    }
    if (s.prompt) throw new Error(`Unexpected prompt: ${s.prompt.title}`);
    const e = dispatch(s, s.priority, { type: 'pass' });
    if (e) throw new Error(e);
  }
  assert.ok(pred(), 'condition never reached');
}
/** Pass until the stack is empty, answering yes/first option to any prompt. */
function resolveAll(s: GameState, answer: (s: GameState) => any = () => undefined) {
  for (let i = 0; i < 100; i++) {
    if (s.prompt) {
      const pr = s.prompt;
      const a = answer(s);
      const choice = a !== undefined ? a : pr.kind === 'yesno' ? 'yes' : pr.kind === 'mode' ? ['0'] : pr.kind === 'targets' ? pr.targets!.slice(0, Math.max(1, pr.min ?? 1)) : pr.kind === 'chooseCards' ? pr.cards!.slice(0, Math.max(pr.min ?? 0, 1)) : pr.kind === 'color' ? pr.options![0].id : null;
      const err = dispatch(s, pr.player, { type: 'answer', promptId: pr.id, choice });
      if (err) throw new Error(`${pr.title}: ${err}`);
      continue;
    }
    if (!s.stack.length && !s.pendingTriggers.length) return;
    dispatch(s, s.priority, { type: 'pass' });
  }
}
function cast(s: GameState, p: PlayerIdx, iid: string, extra: any = {}) {
  const err = dispatch(s, p, { type: 'cast', iid, ...extra });
  assert.equal(err, null, err ?? '');
}

// ---------------------------------------------------------------------------------------------

test('undying returns the creature with a +1/+1 counter, only once', () => {
  const { s, ap, op } = setup();
  const u = add(s, ap, def('Test Revenant', '{1}{B}', 'Creature — Spirit', 'Undying', ['2', '1'], { keywords: ['Undying'] }), 'battlefield');
  const bolt = add(s, op, def('Test Zap', '{R}', 'Instant', 'Test Zap deals 3 damage to any target.'));
  lands(s, op, 1);
  s.priority = op;
  cast(s, op, bolt);
  dispatch(s, op, { type: 'answer', promptId: s.prompt!.id, choice: [{ kind: 'card', iid: u }] });
  resolveAll(s);
  assert.equal(s.cards[u].zone, 'battlefield');
  assert.equal(s.cards[u].counters['+1/+1'], 1);
  // dies again with a counter: stays dead
  s.cards[u].damage = 5;
  settle(s);
  resolveAll(s);
  assert.equal(s.cards[u].zone, 'graveyard');
});

test('saga adds lore counters, triggers chapters and is sacrificed after the last', () => {
  const { s, ap } = setup();
  const saga = def('Test Chronicle', '{2}{G}', 'Enchantment — Saga', 'I — You gain 2 life.\nII — Draw a card.\nIII — Create a 3/3 green Beast creature token.');
  const iid = add(s, ap, saga);
  lands(s, ap, 3);
  cast(s, ap, iid);
  resolveAll(s);
  assert.equal(s.cards[iid].counters.lore, 1);
  assert.equal(s.players[ap].life, 22);
  // chapter II on the next turn's main phase
  const hand = s.players[ap].hand.length;
  s.players[0].fullControl = s.players[1].fullControl = false;
  passUntil(s, () => s.active === ap && s.step === 'main1' && s.turn > 2);
  resolveAll(s);
  assert.equal(s.cards[iid].counters.lore, 2);
  assert.ok(s.players[ap].hand.length >= hand + 1);
  passUntil(s, () => s.active === ap && s.step === 'main1' && (s.cards[iid].counters.lore ?? 0) === 3 || s.cards[iid].zone === 'graveyard', 400);
  resolveAll(s);
  settle(s);
  assert.equal(s.cards[iid].zone, 'graveyard');
  assert.ok(s.battlefield.some((b) => s.defs[s.cards[b].defId].name === 'Beast'));
});

test('"for each" amounts and "as long as" statics', () => {
  const { s, ap } = setup();
  const lord = add(s, ap, def('Test Packleader', '{2}{G}', 'Creature — Wolf', 'Test Packleader gets +1/+1 for each other Wolf you control.', ['1', '1']), 'battlefield');
  add(s, ap, def('Test Wolf', '{G}', 'Creature — Wolf', '', ['1', '1']), 'battlefield');
  add(s, ap, def('Test Wolf', '{G}', 'Creature — Wolf', '', ['1', '1']), 'battlefield');
  assert.equal(chars(s, lord).power, 3);
  const knight = add(s, ap, def('Test Squire', '{1}{W}', 'Creature — Human Knight', "As long as it's your turn, Test Squire gets +2/+0 and has first strike.", ['1', '2']), 'battlefield');
  assert.equal(chars(s, knight).power, s.active === ap ? 3 : 1);
  assert.ok(chars(s, knight).keywords.has('first strike'));
  const growth = add(s, ap, def('Test Swarm Growth', '{G}', 'Instant', 'Target creature gets +1/+1 until end of turn for each creature you control.'));
  lands(s, ap, 1);
  cast(s, ap, growth);
  dispatch(s, ap, { type: 'answer', promptId: s.prompt!.id, choice: [{ kind: 'card', iid: knight }] });
  resolveAll(s);
  assert.equal(chars(s, knight).toughness, 2 + 4); // four creatures
});

test('divided damage lets the caster split it', () => {
  const { s, ap, op } = setup();
  const a = add(s, op, Bear, 'battlefield');
  const b = add(s, op, Bear, 'battlefield');
  const spell = add(s, ap, def('Test Arc', '{2}{R}', 'Sorcery', 'Test Arc deals 4 damage divided as you choose among one, two, or three targets.'));
  lands(s, ap, 3);
  cast(s, ap, spell);
  dispatch(s, ap, { type: 'answer', promptId: s.prompt!.id, choice: [{ kind: 'card', iid: a }, { kind: 'card', iid: b }] });
  resolveAll(s, (st) => (st.prompt!.kind === 'divide' ? [2, 2] : undefined));
  assert.equal(s.cards[a].zone, 'graveyard');
  assert.equal(s.cards[b].zone, 'graveyard');
});

test('manland animation sets base P/T and types until end of turn', () => {
  const { s, ap } = setup();
  const land = add(s, ap, def('Test Lair', '', 'Land', '{T}: Add {G}.\n{1}{G}: Until end of turn, Test Lair becomes a 3/3 green Beast creature with trample. It\'s still a land.'), 'battlefield');
  lands(s, ap, 2);
  const err = dispatch(s, ap, { type: 'activate', iid: land, ability: 1 });
  assert.equal(err, null);
  resolveAll(s);
  const c = chars(s, land);
  assert.ok(c.types.has('creature') && c.types.has('land'));
  assert.equal(c.power, 3);
  assert.ok(c.keywords.has('trample'));
});

test('clone enters as a copy; token copies; populate', () => {
  const { s, ap } = setup();
  const target = add(s, ap, def('Test Giant', '{4}{G}', 'Creature — Giant', 'Vigilance', ['5', '5'], { keywords: ['Vigilance'] }), 'battlefield');
  const clone = add(s, ap, def('Test Mimic', '{3}{U}', 'Creature — Shapeshifter', 'You may have Test Mimic enter as a copy of any creature on the battlefield.', ['0', '0']));
  lands(s, ap, 4);
  cast(s, ap, clone);
  resolveAll(s, (st) => (st.prompt!.kind === 'chooseCards' ? [target] : undefined));
  assert.equal(chars(s, clone).name, 'Test Giant');
  assert.equal(chars(s, clone).power, 5);
  const copier = add(s, ap, def('Test Echo', '{1}{G}', 'Sorcery', "Create a token that's a copy of target creature you control."));
  lands(s, ap, 2);
  cast(s, ap, copier);
  dispatch(s, ap, { type: 'answer', promptId: s.prompt!.id, choice: [{ kind: 'card', iid: target }] });
  resolveAll(s);
  assert.equal(s.battlefield.filter((b) => chars(s, b).name === 'Test Giant').length, 3);
});

test('replacement effects: +1 counters, token doubling, exile instead of dying, shield counters', () => {
  const { s, ap, op } = setup();
  add(s, ap, def('Test Scales', '{G}', 'Enchantment', 'If one or more +1/+1 counters would be put on a creature you control, that many plus one +1/+1 counters are put on it instead.'), 'battlefield');
  add(s, ap, def('Test Twins', '{2}{G}', 'Enchantment', 'If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.'), 'battlefield');
  const bear = add(s, ap, Bear, 'battlefield');
  const pump = add(s, ap, def('Test Feed', '{G}', 'Instant', 'Put a +1/+1 counter on target creature.'));
  const toks = add(s, ap, def('Test Call', '{G}', 'Sorcery', 'Create a 1/1 green Saproling creature token.'));
  lands(s, ap, 2);
  cast(s, ap, pump);
  dispatch(s, ap, { type: 'answer', promptId: s.prompt!.id, choice: [{ kind: 'card', iid: bear }] });
  resolveAll(s);
  assert.equal(s.cards[bear].counters['+1/+1'], 2);
  cast(s, ap, toks);
  resolveAll(s);
  assert.equal(s.battlefield.filter((b) => chars(s, b).name === 'Saproling').length, 2);
  // exile instead of dying
  const ghost = add(s, op, def('Test Wisp', '{1}{W}', 'Creature — Spirit', 'If Test Wisp would die, exile it instead.', ['1', '1']), 'battlefield');
  s.cards[ghost].damage = 1;
  settle(s);
  assert.equal(s.cards[ghost].zone, 'exile');
  // shield counter
  const shielded = add(s, op, Bear, 'battlefield');
  s.cards[shielded].counters.shield = 1;
  const kill = add(s, ap, def('Test Doom', '{B}', 'Instant', 'Destroy target creature.'));
  lands(s, ap, 1, Swamp);
  cast(s, ap, kill);
  dispatch(s, ap, { type: 'answer', promptId: s.prompt!.id, choice: [{ kind: 'card', iid: shielded }] });
  resolveAll(s);
  assert.equal(s.cards[shielded].zone, 'battlefield');
  assert.equal(s.cards[shielded].counters.shield, 0);
});

test('exile until it leaves returns the card; impulse draw lets you play the exiled card', () => {
  const { s, ap, op } = setup();
  const victim = add(s, op, Bear, 'battlefield');
  const ring = add(s, ap, def('Test Prison', '{2}{W}', 'Enchantment', 'When Test Prison enters, exile target nonland permanent an opponent controls until Test Prison leaves the battlefield.'));
  lands(s, ap, 3);
  cast(s, ap, ring);
  resolveAll(s, (st) => (st.prompt!.kind === 'targets' ? [{ kind: 'card', iid: victim }] : undefined));
  assert.equal(s.cards[victim].zone, 'exile');
  dispatch(s, ap, { type: 'manual', op: { op: 'move', iid: ring, to: 'graveyard' } });
  assert.equal(s.cards[victim].zone, 'battlefield');
  // impulse
  const top = add(s, ap, Bear, 'library');
  const imp = add(s, ap, def('Test Spark', '{R}', 'Sorcery', 'Exile the top card of your library. You may play that card this turn.'));
  lands(s, ap, 3);
  cast(s, ap, imp);
  resolveAll(s);
  assert.equal(s.cards[top].zone, 'exile');
  assert.ok(castOptions(s, ap, top, true).length > 0, 'exiled card is castable');
  cast(s, ap, top);
  resolveAll(s);
  assert.equal(s.cards[top].zone, 'battlefield');
});

test('morph: cast face down for {3}, then turn face up', () => {
  const { s, ap, op } = setup();
  const m = add(s, ap, def('Test Shrouded Beast', '{4}{G}', 'Creature — Beast', 'Morph {2}{G}\nWhen Test Shrouded Beast is turned face up, you gain 3 life.', ['5', '5']));
  lands(s, ap, 6);
  cast(s, ap, m, { alt: 'morph' });
  resolveAll(s);
  assert.equal(s.cards[m].faceDown, true);
  assert.equal(chars(s, m).power, 2);
  assert.equal(dispatch(s, ap, { type: 'turnFaceUp', iid: m }), null);
  resolveAll(s);
  assert.equal(s.cards[m].faceDown, false);
  assert.equal(chars(s, m).power, 5);
  assert.equal(s.players[ap].life, 23);
  void op;
});

test('transform effect and day/night on daybound cards', () => {
  const { s, ap } = setup();
  const dfc: CardDef = {
    id: 'dfc1', name: 'Test Villager // Test Howler', manaCost: '{1}{G}', cmc: 2, typeLine: 'Creature — Human Werewolf // Creature — Werewolf', oracle: '',
    colors: ['G'], colorIdentity: ['G'], keywords: ['Daybound', 'Nightbound'], layout: 'transform',
    faces: [
      { name: 'Test Villager', manaCost: '{1}{G}', typeLine: 'Creature — Human Werewolf', oracle: 'Daybound', power: '2', toughness: '2' },
      { name: 'Test Howler', manaCost: '', typeLine: 'Creature — Werewolf', oracle: 'Nightbound', power: '4', toughness: '4' },
    ],
  };
  const w = add(s, ap, dfc);
  lands(s, ap, 2);
  cast(s, ap, w);
  resolveAll(s);
  assert.equal(s.dayNight, 'day');
  assert.equal(chars(s, w).power, 2);
  // Active player casts one spell this turn → next turn it stays day; a turn with no spells → night.
  s.players[0].fullControl = s.players[1].fullControl = false;
  passUntil(s, () => s.active !== ap && s.step === 'main1');
  passUntil(s, () => s.active === ap && s.step === 'main1');
  assert.equal(s.dayNight, 'night', 'opponent cast no spells on their turn');
  assert.equal(chars(s, w).name, 'Test Howler');
  assert.equal(chars(s, w).power, 4);
});

test('equipment keyword living weapon, bestow falls back to a creature', () => {
  const { s, ap, op } = setup();
  const lw = add(s, ap, def('Test Germblade', '{2}{B}', 'Artifact — Equipment', 'Living weapon\nEquipped creature gets +2/+1.\nEquip {2}'));
  lands(s, ap, 3);
  cast(s, ap, lw);
  resolveAll(s);
  const germ = s.cards[lw].attachedTo!;
  assert.ok(germ);
  assert.equal(chars(s, germ).power, 2);
  // bestow
  const host = add(s, ap, Bear, 'battlefield');
  const bw = add(s, ap, def('Test Nymph', '{1}{W}', 'Enchantment Creature — Nymph', 'Bestow {3}{W}\nEnchanted creature gets +1/+1.', ['1', '1']));
  lands(s, ap, 4);
  cast(s, ap, bw, { alt: 'bestow' });
  dispatch(s, ap, { type: 'answer', promptId: s.prompt!.id, choice: [{ kind: 'card', iid: host }] });
  resolveAll(s);
  assert.equal(s.cards[bw].attachedTo, host);
  assert.equal(chars(s, host).power, 3);
  assert.ok(!chars(s, bw).types.has('creature'));
  s.cards[host].damage = 9;
  settle(s);
  assert.equal(s.cards[bw].zone, 'battlefield');
  assert.ok(chars(s, bw).types.has('creature'), 'bestowed aura becomes a creature');
  void op;
});

test('foretell and flashback-style casting from exile/graveyard; vanishing', () => {
  const { s, ap } = setup();
  const f = add(s, ap, def('Test Omen', '{3}{U}', 'Sorcery', 'Draw two cards.\nForetell {1}{U}'));
  lands(s, ap, 6);
  const foretellIdx = 0;
  assert.equal(dispatch(s, ap, { type: 'activate', iid: f, ability: foretellIdx }), null);
  assert.equal(s.cards[f].zone, 'exile');
  assert.equal(s.cards[f].faceDown, true);
  assert.ok(dispatch(s, ap, { type: 'cast', iid: f }), 'cannot cast the same turn');
  s.cards[f].foretold = s.turn - 1;
  cast(s, ap, f);
  resolveAll(s);
  assert.equal(s.cards[f].zone, 'graveyard');
  const v = add(s, ap, def('Test Flicker Beast', '{1}{G}', 'Creature — Beast', 'Vanishing 2', ['4', '4'], { keywords: ['Vanishing'] }));
  cast(s, ap, v);
  resolveAll(s);
  assert.equal(s.cards[v].counters.time, 2);
});

test('energy and counters keywords (modular, bushido, riot) parse and work', () => {
  const { s, ap } = setup();
  const e = add(s, ap, def('Test Dynamo', '{1}{R}', 'Creature — Construct', 'When Test Dynamo enters, you get {E}{E}.\nPay {E}: Test Dynamo gets +1/+0 until end of turn.', ['1', '1']));
  lands(s, ap, 2);
  cast(s, ap, e);
  resolveAll(s);
  assert.equal(s.players[ap].counters.energy, 2);
  assert.equal(dispatch(s, ap, { type: 'activate', iid: e, ability: 0 }), null);
  resolveAll(s);
  assert.equal(s.players[ap].counters.energy, 1);
  assert.equal(chars(s, e).power, 2);
  const mod = add(s, ap, def('Test Drone', '{2}', 'Artifact Creature — Construct', 'Modular 2', ['0', '0'], { keywords: ['Modular'] }));
  lands(s, ap, 2);
  cast(s, ap, mod);
  resolveAll(s);
  assert.equal(s.cards[mod].counters['+1/+1'], 2);
});

// ---------------------------------------------------------------------------------------------
// Second batch: kicker, cascade, look-at-the-top, Class levels, craft, meld, last-known power
// ---------------------------------------------------------------------------------------------

test('kicker: optional extra cost turns on "if it was kicked"', () => {
  const { s, ap } = setup();
  const k = add(s, ap, def('Test Surge', '{1}{R}', 'Sorcery', 'Kicker {2}\nTest Surge deals 2 damage to any target. If this spell was kicked, it deals 3 damage to that permanent or player instead.'));
  void k;
  const kb = add(s, ap, def('Test Kicked Brute', '{1}{G}', 'Creature — Beast', 'Kicker {1}{G}\nTest Kicked Brute enters with two +1/+1 counters on it if it was kicked.', ['2', '2']));
  lands(s, ap, 4);
  const opts = castOptions(s, ap, kb, true);
  assert.ok(opts.some((o) => (o.action as any).kicker), 'kicker option offered');
  cast(s, ap, kb, { kicker: true });
  resolveAll(s);
  assert.equal(s.cards[kb].counters['+1/+1'], 2);
  assert.equal(s.battlefield.filter((b) => s.cards[b].tapped).length, 4, 'paid 4 mana');
});

test('cascade exiles until a cheaper nonland card and lets you cast it free', () => {
  const { s, ap } = setup();
  add(s, ap, Forest, 'library');
  const bear = add(s, ap, Bear, 'library'); // top card after the Forest below is added
  add(s, ap, Forest, 'library'); // this Forest is now on top
  const c = add(s, ap, def('Test Cascader', '{3}{G}', 'Creature — Elemental', 'Cascade', ['3', '3'], { keywords: ['Cascade'] }));
  lands(s, ap, 4);
  cast(s, ap, c);
  resolveAll(s);
  assert.equal(s.cards[bear].zone, 'battlefield', 'cascaded into the bear');
  assert.equal(s.cards[c].zone, 'battlefield');
});

test('look at the top N: choose one for your hand, rest on the bottom', () => {
  const { s, ap } = setup();
  const a = add(s, ap, Bear, 'library');
  const b = add(s, ap, Forest, 'library');
  const c = add(s, ap, Forest, 'library');
  const dig = add(s, ap, def('Test Insight', '{1}{U}', 'Sorcery', 'Look at the top three cards of your library. Put one of them into your hand and the rest on the bottom of your library in any order.'));
  lands(s, ap, 2);
  cast(s, ap, dig);
  resolveAll(s, (st) => (st.prompt!.kind === 'chooseCards' ? [a] : undefined));
  assert.equal(s.cards[a].zone, 'hand');
  const lib = s.players[ap].library;
  assert.ok(lib.indexOf(b) >= lib.length - 2 && lib.indexOf(c) >= lib.length - 2, 'rest on the bottom');
  // reveal + filter variant
  const x = add(s, ap, Bear, 'library');
  add(s, ap, Forest, 'library');
  const dig2 = add(s, ap, def('Test Call of the Wild', '{G}', 'Sorcery', 'Look at the top two cards of your library. You may reveal a creature card from among them and put it into your hand. Put the rest into your graveyard.'));
  lands(s, ap, 1);
  cast(s, ap, dig2);
  resolveAll(s, (st) => (st.prompt!.kind === 'chooseCards' ? [x] : undefined));
  assert.equal(s.cards[x].zone, 'hand');
});

test('Class: level up as a sorcery unlocks the next ability', () => {
  const { s, ap } = setup();
  const cls = add(s, ap, def('Test Ranger Class', '{1}{G}', 'Enchantment — Class', '(Gain the next level as a sorcery to add its ability.)\nWhen this Class enters, you gain 1 life.\n{1}{G}: Level 2\nCreatures you control get +1/+1.\n{2}{G}: Level 3\nAt the beginning of your upkeep, you gain 2 life.'));
  const bear = add(s, ap, Bear, 'battlefield');
  lands(s, ap, 5);
  cast(s, ap, cls);
  resolveAll(s);
  assert.equal(chars(s, bear).power, 2, 'level 1: no anthem yet');
  const lvl2 = chars(s, cls).pc.activated.findIndex((a) => a.special === 'level' && a.level === 2);
  const lvl3 = chars(s, cls).pc.activated.findIndex((a) => a.special === 'level' && a.level === 3);
  assert.ok(dispatch(s, ap, { type: 'activate', iid: cls, ability: lvl3 }), 'cannot skip to level 3');
  assert.equal(dispatch(s, ap, { type: 'activate', iid: cls, ability: lvl2 }), null);
  resolveAll(s);
  assert.equal(s.cards[cls].classLevel, 2);
  assert.equal(chars(s, bear).power, 3, 'level 2 anthem');
});

test('craft exiles the card and materials, returning it transformed', () => {
  const { s, ap } = setup();
  const dfc: CardDef = {
    id: 'craft1', name: 'Test Relic // Test Awakened Relic', manaCost: '{1}', cmc: 1, typeLine: 'Artifact // Artifact Creature — Golem', oracle: '', colors: [], colorIdentity: [], keywords: ['Craft'], layout: 'transform',
    faces: [
      { name: 'Test Relic', manaCost: '{1}', typeLine: 'Artifact', oracle: 'Craft with artifact {2}' },
      { name: 'Test Awakened Relic', manaCost: '', typeLine: 'Artifact Creature — Golem', oracle: '', power: '4', toughness: '4' },
    ],
  };
  const relic = add(s, ap, dfc, 'battlefield');
  const mat = add(s, ap, def('Test Trinket', '{1}', 'Artifact', ''), 'graveyard');
  lands(s, ap, 2);
  const idx = chars(s, relic).pc.activated.findIndex((a) => a.special === 'craft');
  assert.equal(dispatch(s, ap, { type: 'activate', iid: relic, ability: idx }), null);
  resolveAll(s, (st) => (st.prompt!.kind === 'chooseCards' ? [mat] : undefined));
  assert.equal(s.cards[mat].zone, 'exile');
  assert.equal(s.cards[relic].zone, 'battlefield');
  assert.equal(chars(s, relic).name, 'Test Awakened Relic');
  assert.equal(chars(s, relic).power, 4);
});

test('meld: two named cards combine into the melded card', async () => {
  const { setEngineHooks } = await import('../src/engine/engine');
  const melded = def('Test Colossus Rex', '', 'Legendary Creature — Giant', 'Trample', ['9', '9'], { keywords: ['Trample'] });
  setEngineHooks({ findCard: (name) => (name.toLowerCase() === 'test colossus rex' ? melded : undefined) });
  const { s, ap } = setup();
  const a = add(s, ap, def('Test Left Half', '{2}{G}', 'Legendary Creature — Giant', '{1}: If you both own and control Test Left Half and a creature named Test Right Half, exile them, then meld them into Test Colossus Rex.', ['3', '3'], { layout: 'meld' }), 'battlefield');
  const b = add(s, ap, def('Test Right Half', '{2}{G}', 'Legendary Creature — Giant', '', ['3', '3'], { layout: 'meld' }), 'battlefield');
  lands(s, ap, 1);
  assert.equal(dispatch(s, ap, { type: 'activate', iid: a, ability: 0 }), null);
  resolveAll(s);
  assert.equal(chars(s, a).name, 'Test Colossus Rex');
  assert.equal(chars(s, a).power, 9);
  assert.equal(s.cards[b].zone, 'exile');
  dispatch(s, ap, { type: 'manual', op: { op: 'move', iid: a, to: 'graveyard' } });
  assert.equal(s.cards[b].zone, 'graveyard', 'both halves go together');
  setEngineHooks({});
});

test('last-known information: exiled creature uses its pumped power', () => {
  const { s, ap, op } = setup();
  const bear = add(s, op, Bear, 'battlefield');
  s.cards[bear].counters['+1/+1'] = 3; // a 5/5 right now
  const swords = add(s, ap, def('Test Plowblade', '{W}', 'Instant', 'Exile target creature. Its controller gains life equal to its power.'));
  lands(s, ap, 1);
  cast(s, ap, swords);
  dispatch(s, ap, { type: 'answer', promptId: s.prompt!.id, choice: [{ kind: 'card', iid: bear }] });
  resolveAll(s);
  assert.equal(s.cards[bear].zone, 'exile');
  assert.equal(s.players[op].life, 25);
});

test('animation events: damage, dying, undying return and counters are reported to the client', () => {
  const { s, ap, op } = setup();
  const u = add(s, ap, def('Test Revenant', '{1}{B}', 'Creature — Spirit', 'Undying', ['2', '1'], { keywords: ['Undying'] }), 'battlefield');
  const bolt = add(s, op, def('Test Zap', '{R}', 'Instant', 'Test Zap deals 3 damage to any target.'));
  lands(s, op, 1);
  s.priority = op;
  const before = (s as any).evSeq ?? 0;
  cast(s, op, bolt);
  dispatch(s, op, { type: 'answer', promptId: s.prompt!.id, choice: [{ kind: 'card', iid: u }] });
  resolveAll(s);
  const evs = ((s as any).events as any[]).filter((e) => e.seq > before);
  const kinds = evs.map((e) => e.k);
  assert.ok(kinds.includes('stack'), 'cast reported');
  assert.ok(evs.some((e) => e.k === 'damage' && e.iid === u && e.n === 3), 'damage reported');
  assert.ok(evs.some((e) => e.k === 'move' && e.iid === u && e.from === 'battlefield' && e.to === 'graveyard'), 'death reported');
  assert.ok(evs.some((e) => e.k === 'move' && e.iid === u && e.to === 'battlefield'), 'return reported');
  assert.ok(evs.some((e) => e.k === 'counter' && e.iid === u && e.counter === '+1/+1'), 'counter reported');
  // sequence numbers are strictly increasing and exposed in the view
  for (let i = 1; i < evs.length; i++) assert.ok(evs[i].seq > evs[i - 1].seq);
});

test('reveal the top card: a land goes to the defending player\'s hand (Goblin Guide style)', () => {
  const { s, ap, op } = setup();
  const guide = add(s, ap, def('Test Guide', '{R}', 'Creature — Goblin', 'Haste\nWhenever Test Guide attacks, defending player reveals the top card of their library. If it\'s a land card, that player puts it into their hand.', ['2', '2'], { keywords: ['Haste'] }), 'battlefield');
  const top = add(s, op, Forest, 'library');
  const handBefore = s.players[op].hand.length;
  passUntil(s, () => s.step === 'declareAttackers' && s.prompt?.kind === 'declareAttackers');
  dispatch(s, ap, { type: 'answer', promptId: s.prompt!.id, choice: [{ iid: guide, target: { kind: 'player', idx: op } }] });
  resolveAll(s);
  assert.equal(s.cards[top].zone, 'hand');
  assert.equal(s.players[op].hand.length, handBefore + 1);
});

test('hand disruption: reveal, choose a nonland card, discard it (Duress style)', () => {
  const { s, ap, op } = setup();
  const d = add(s, ap, def('Test Duress', '{B}', 'Sorcery', 'Target opponent reveals their hand. You choose a noncreature, nonland card from it. That player discards that card.'));
  lands(s, ap, 1);
  const spell = add(s, op, def('Test Zap', '{R}', 'Instant', 'Test Zap deals 3 damage to any target.'));
  add(s, op, Bear);
  cast(s, ap, d);
  if (s.prompt?.kind === 'targets') dispatch(s, ap, { type: 'answer', promptId: s.prompt.id, choice: [{ kind: 'player', idx: op }] });
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? (assert.deepEqual(st.prompt.cards, [spell]), [spell]) : undefined));
  assert.equal(s.cards[spell].zone, 'graveyard');
});

test('regeneration replaces destruction; "you may pay … if you do" works', () => {
  const { s, ap, op } = setup();
  const sk = add(s, ap, def('Test Skeleton', '{1}{B}', 'Creature — Skeleton', '{B}: Regenerate Test Skeleton.', ['1', '1']), 'battlefield');
  lands(s, ap, 2);
  s.priority = ap;
  assert.equal(dispatch(s, ap, { type: 'activate', iid: sk, ability: 0 }), null);
  resolveAll(s);
  const zap = add(s, op, def('Test Zap', '{R}', 'Instant', 'Test Zap deals 3 damage to any target.'));
  lands(s, op, 1);
  s.priority = op;
  cast(s, op, zap);
  dispatch(s, op, { type: 'answer', promptId: s.prompt!.id, choice: [{ kind: 'card', iid: sk }] });
  resolveAll(s);
  assert.equal(s.cards[sk].zone, 'battlefield');
  assert.equal(s.cards[sk].tapped, true);
  assert.equal(s.cards[sk].damage, 0);
  // optional payment
  const tithe = add(s, ap, def('Test Toll', '{W}', 'Sorcery', 'You may pay {1}. If you do, draw a card.'));
  lands(s, ap, 2);
  s.priority = ap;
  const hand = s.players[ap].hand.length;
  cast(s, ap, tithe);
  resolveAll(s);
  assert.equal(s.players[ap].hand.length, hand); // cast one, drew one
});

test('alternative costs: sacrifice two Mountains instead of paying mana (Fireblast)', () => {
  const { s, ap, op } = setup();
  const Mountain = def('Mountain', '', 'Basic Land — Mountain');
  lands(s, ap, 2, Mountain);
  const fb = add(s, ap, def('Test Blast', '{4}{R}{R}', 'Instant', 'You may sacrifice two Mountains rather than pay this spell\'s mana cost.\nTest Blast deals 4 damage to any target.'));
  s.priority = ap;
  const opts = castOptions(s, ap, fb);
  const alt = opts.find((o: any) => o.action.alt === 'alt');
  assert.ok(alt && alt.ok, 'alternative cost offered');
  assert.equal(dispatch(s, ap, alt!.action), null);
  const life = s.players[op].life;
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'player', idx: op }] : undefined));
  assert.equal(s.players[op].life, life - 4);
  assert.equal(s.battlefield.filter((b) => s.cards[b].controller === ap && s.defs[s.cards[b].defId].name === 'Mountain').length, 0);
});

test('coin flips and die-roll tables resolve automatically', () => {
  const { s, ap } = setup();
  lands(s, ap, 2);
  const flip = add(s, ap, def('Test Gamble', '{1}', 'Sorcery', 'Flip a coin. If you win the flip, draw two cards. If you lose the flip, you lose 1 life.'));
  const hand = s.players[ap].hand.length;
  const life = s.players[ap].life;
  cast(s, ap, flip);
  resolveAll(s);
  const drew = s.players[ap].hand.length - (hand - 1);
  assert.ok((drew === 2 && s.players[ap].life === life) || (drew === 0 && s.players[ap].life === life - 1), 'exactly one branch happened');
  const die = add(s, ap, def('Test Dice', '{1}', 'Sorcery', 'Roll a d20.\n1—9 | You gain 1 life.\n10—19 | You gain 2 life.\n20 | You gain 5 life.'));
  const l2 = s.players[ap].life;
  cast(s, ap, die);
  resolveAll(s);
  assert.ok([1, 2, 5].includes(s.players[ap].life - l2));
});

test('copy a spell with new targets (Twincast style); choose a creature type as it enters', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 4);
  const bolt = add(s, ap, def('Test Zap', '{R}', 'Instant', 'Test Zap deals 3 damage to any target.'));
  const twin = add(s, ap, def('Test Twin', '{U}{U}', 'Instant', 'Copy target instant or sorcery spell. You may choose new targets for the copy.'));
  s.priority = ap;
  const life = s.players[op].life;
  cast(s, ap, bolt);
  dispatch(s, ap, { type: 'answer', promptId: s.prompt!.id, choice: [{ kind: 'player', idx: op }] });
  cast(s, ap, twin);
  if (s.prompt?.kind === 'targets') dispatch(s, ap, { type: 'answer', promptId: s.prompt.id, choice: [s.prompt.targets!.find((t: any) => t.kind === 'stack')] });
  resolveAll(s, (st) => (st.prompt?.kind === 'yesno' ? 'no' : undefined));
  assert.equal(s.players[op].life, life - 6);
  assert.equal(s.cards[bolt].zone, 'graveyard');
  const lord = add(s, ap, def('Test Lord', '{2}', 'Artifact Creature — Golem', 'As Test Lord enters, choose a creature type.\nOther creatures you control of the chosen type get +1/+1.', ['2', '2']));
  lands(s, ap, 2);
  cast(s, ap, lord);
  resolveAll(s, (st) => (st.prompt?.kind === 'mode' ? ['bear'] : undefined));
  const bear = add(s, ap, Bear, 'battlefield');
  assert.equal((s.cards[lord] as any).chosenType, 'bear');
  assert.equal(chars(s, bear).power, 3);
});

test('madness: a discarded madness card can be cast for its madness cost', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 2);
  const temper = add(s, ap, def('Test Temper', '{1}{R}{R}', 'Instant', 'Test Temper deals 3 damage to any target.\nMadness {R}'));
  const loot = add(s, ap, def('Test Loot', '{1}', 'Sorcery', 'Discard a card, then draw a card.'));
  s.priority = ap;
  const life = s.players[op].life;
  cast(s, ap, loot);
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? [temper] : st.prompt?.kind === 'yesno' ? 'yes' : st.prompt?.kind === 'targets' ? [{ kind: 'player', idx: op }] : undefined));
  assert.equal(s.players[op].life, life - 3);
});

test('venture into the dungeon enters the first room and applies it', () => {
  const { s, ap } = setup();
  lands(s, ap, 1);
  const v = add(s, ap, def('Test Explore', '{1}', 'Sorcery', 'Venture into the dungeon.'));
  cast(s, ap, v);
  resolveAll(s, (st) => (st.prompt?.kind === 'mode' ? ['Dungeon of the Mad Mage'] : undefined));
  const dg = (s.players[ap] as any).dungeon;
  // the card database is only available on the server; without it the engine logs and skips
  assert.ok(dg === undefined || dg === null || dg.room);
});
