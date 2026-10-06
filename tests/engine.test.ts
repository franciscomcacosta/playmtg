import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CardDef } from '../src/engine/cardTypes';
import { createGame, startGame, dispatch, settle, viewFor, canAttack } from '../src/engine/engine';
import type { GameState, PlayerIdx } from '../src/engine/types';
import { chars } from '../src/engine/rules';
import { parseCard } from '../src/engine/oracle';

// Invented test cards using standard rules templating.
let n = 0;
function def(name: string, manaCost: string, typeLine: string, oracle = '', pt?: [string, string], keywords: string[] = []): CardDef {
  return { id: `t${n++}`, name, manaCost, cmc: 0, typeLine, oracle, power: pt?.[0], toughness: pt?.[1], colors: [], colorIdentity: [], keywords, layout: 'normal' };
}
const Forest = def('Forest', '', 'Basic Land — Forest');
const Mountain = def('Mountain', '', 'Basic Land — Mountain');
const Island = def('Island', '', 'Basic Land — Island');
const Bear = def('Test Bear', '{1}{G}', 'Creature — Bear', '', ['2', '2']);
const Ogre = def('Test Trampler', '{2}{G}', 'Creature — Beast', 'Trample', ['4', '4'], ['Trample']);
const Bolt = def('Test Zap', '{R}', 'Instant', 'Test Zap deals 3 damage to any target.');
const Counter = def('Test Negate', '{U}{U}', 'Instant', 'Counter target spell.');
const Knight = def('Test Duelist', '{1}{R}', 'Creature — Human Knight', 'First strike', ['2', '1'], ['First strike']);
const Healer = def('Test Healer', '{G}', 'Creature — Elf', 'When Test Healer enters, you gain 3 life.', ['1', '1']);
const Anthem = def('Test Banner', '{2}', 'Artifact', 'Creatures you control get +1/+1.');
const Elf = def('Test Mana Elf', '{G}', 'Creature — Elf Druid', '{T}: Add {G}.', ['1', '1']);

function deck(cards: CardDef[], total = 40): CardDef[] {
  const out: CardDef[] = [];
  while (out.length < total) out.push(...cards);
  return out.slice(0, total);
}

function setup(d0: CardDef[], d1: CardDef[], seed = 7): GameState {
  const s = createGame('g', [{ name: 'Alice', cards: deck(d0) }, { name: 'Bob', cards: deck(d1) }], seed);
  // everyone full control so the test drives priority explicitly
  s.players[0].fullControl = true;
  s.players[1].fullControl = true;
  startGame(s);
  keepBoth(s);
  return s;
}

function keepBoth(s: GameState) {
  for (let i = 0; i < 2; i++) {
    const pr = s.prompt!;
    assert.equal(pr.kind, 'mulligan');
    assert.equal(dispatch(s, pr.player, { type: 'keep' }), null);
  }
}

/** Put a specific card in a player's hand (moved from library). */
function give(s: GameState, p: PlayerIdx, d: CardDef): string {
  const iid = Object.keys(s.cards).find((k) => s.cards[k].defId === d.id && s.cards[k].zone === 'library' && s.cards[k].owner === p);
  if (!iid) {
    s.defs[d.id] = d;
    const id = `x${s.nextId++}`;
    s.cards[id] = { iid: id, defId: d.id, owner: p, controller: p, zone: 'hand', tapped: false, sick: false, counters: {}, damage: 0, deathtouched: false, face: 0, mods: [], ts: 0 };
    s.players[p].hand.push(id);
    return id;
  }
  s.players[p].library.splice(s.players[p].library.indexOf(iid), 1);
  s.cards[iid].zone = 'hand';
  s.players[p].hand.push(iid);
  return iid;
}

function putOnBattlefield(s: GameState, p: PlayerIdx, d: CardDef): string {
  const iid = give(s, p, d);
  s.players[p].hand.splice(s.players[p].hand.indexOf(iid), 1);
  s.cards[iid].zone = 'battlefield';
  s.cards[iid].controller = p;
  s.battlefield.push(iid);
  return iid;
}

function passUntil(s: GameState, pred: () => boolean, max = 200) {
  for (let i = 0; i < max && !pred(); i++) {
    if (s.prompt) throw new Error(`Unexpected prompt ${s.prompt.kind}: ${s.prompt.title}`);
    const err = dispatch(s, s.priority, { type: 'pass' });
    if (err) throw new Error(err);
  }
  assert.ok(pred(), 'condition never reached');
}

test('oracle parser understands common templates', () => {
  const zap = parseCard(Bolt);
  assert.equal(zap.spell?.effects[0].k, 'damage');
  assert.equal(zap.spell?.specs[0].players, 'any');
  const elf = parseCard(Elf);
  assert.ok(elf.activated[0].isMana);
  const heal = parseCard(Healer);
  assert.equal(heal.triggers[0].event, 'etb');
  assert.equal(parseCard(Anthem).statics[0].kind, 'anthem');
  const f = parseCard(Forest);
  assert.deepEqual(f.intrinsicMana, ['G']);
});

test('game starts with mulligans, turn 1 and no first draw', () => {
  const s = setup([Forest, Bear], [Mountain, Bolt]);
  assert.equal(s.turn, 1);
  assert.equal(s.step, 'upkeep');
  const ap = s.active;
  passUntil(s, () => s.step === 'main1');
  assert.equal(s.players[ap].hand.length, 7, 'starting player skips draw');
});

test('London mulligan puts cards on the bottom', () => {
  const s = createGame('g', [{ name: 'A', cards: deck([Forest, Bear]) }, { name: 'B', cards: deck([Mountain]) }], 3);
  startGame(s);
  const p = s.prompt!.player;
  dispatch(s, p, { type: 'mulligan' });
  dispatch(s, p, { type: 'keep' });
  assert.equal(s.prompt!.kind, 'chooseCards');
  dispatch(s, p, { type: 'answer', promptId: s.prompt!.id, choice: [s.players[p].hand[0]] });
  assert.equal(s.players[p].hand.length, 6);
});

test('lands, mana auto-payment and casting a creature', () => {
  const s = setup([Forest, Bear], [Mountain]);
  const ap = s.active;
  passUntil(s, () => s.step === 'main1');
  const f1 = give(s, ap, Forest);
  assert.equal(dispatch(s, ap, { type: 'playLand', iid: f1 }), null);
  assert.match(dispatch(s, ap, { type: 'playLand', iid: give(s, ap, Forest) }) ?? '', /already played/);
  putOnBattlefield(s, ap, Forest);
  const bear = give(s, ap, Bear);
  assert.equal(dispatch(s, ap, { type: 'cast', iid: bear }), null);
  assert.equal(s.stack.length, 1);
  assert.ok(s.battlefield.filter((i) => s.cards[i].tapped).length === 2, 'two lands auto-tapped');
  dispatch(s, ap, { type: 'pass' });
  dispatch(s, s.priority, { type: 'pass' });
  assert.equal(s.cards[bear].zone, 'battlefield');
  assert.equal(s.cards[bear].sick, true);
});

test('sorcery-speed restriction and priority', () => {
  const s = setup([Forest, Bear], [Mountain]);
  const ap = s.active;
  const bear = give(s, ap, Bear);
  putOnBattlefield(s, ap, Forest);
  putOnBattlefield(s, ap, Forest);
  assert.match(dispatch(s, ap, { type: 'cast', iid: bear }) ?? '', /sorcery speed/);
});

test('burn spell kills a creature via state-based actions', () => {
  const s = setup([Mountain, Bolt], [Forest, Bear]);
  const ap = s.active;
  const other = (1 - ap) as PlayerIdx;
  const bear = putOnBattlefield(s, other, Bear);
  putOnBattlefield(s, ap, Mountain);
  passUntil(s, () => s.step === 'main1');
  const zap = give(s, ap, Bolt);
  assert.equal(dispatch(s, ap, { type: 'cast', iid: zap }), null);
  assert.equal(s.prompt?.kind, 'targets');
  dispatch(s, ap, { type: 'answer', promptId: s.prompt!.id, choice: [{ kind: 'card', iid: bear }] });
  dispatch(s, ap, { type: 'pass' });
  dispatch(s, other, { type: 'pass' });
  assert.equal(s.cards[bear].zone, 'graveyard');
  assert.equal(s.cards[zap].zone, 'graveyard');
});

test('counterspell counters a spell', () => {
  const s = setup([Forest, Bear], [Island, Counter]);
  const ap = s.active;
  const other = (1 - ap) as PlayerIdx;
  passUntil(s, () => s.step === 'main1');
  putOnBattlefield(s, ap, Forest);
  putOnBattlefield(s, ap, Forest);
  putOnBattlefield(s, other, Island);
  putOnBattlefield(s, other, Island);
  const bear = give(s, ap, Bear);
  const neg = give(s, other, Counter);
  dispatch(s, ap, { type: 'cast', iid: bear });
  dispatch(s, ap, { type: 'pass' });
  assert.equal(s.priority, other);
  assert.equal(dispatch(s, other, { type: 'cast', iid: neg }), null);
  assert.equal(s.prompt?.kind, 'targets');
  dispatch(s, other, { type: 'answer', promptId: s.prompt!.id, choice: [s.prompt!.targets![0]] });
  dispatch(s, other, { type: 'pass' });
  dispatch(s, ap, { type: 'pass' });
  assert.equal(s.cards[neg].zone, 'graveyard');
  assert.equal(s.cards[bear].zone, 'graveyard');
});

test('combat: trample, first strike, blocking and damage', () => {
  const s = setup([Forest, Ogre], [Mountain, Knight]);
  const ap = s.active;
  const other = (1 - ap) as PlayerIdx;
  const ogre = putOnBattlefield(s, ap, Ogre);
  const knight = putOnBattlefield(s, other, Knight);
  passUntil(s, () => s.step === 'main1');
  assert.ok(canAttack(s, ogre));
  passUntil(s, () => s.prompt?.kind === 'declareAttackers' || s.step === 'declareAttackers');
  assert.equal(s.prompt?.kind, 'declareAttackers');
  dispatch(s, ap, { type: 'answer', promptId: s.prompt!.id, choice: [{ iid: ogre, target: { kind: 'player', idx: other } }] });
  assert.equal(s.cards[ogre].tapped, true);
  passUntil(s, () => s.prompt?.kind === 'declareBlockers');
  dispatch(s, other, { type: 'answer', promptId: s.prompt!.id, choice: [{ blocker: knight, attacker: ogre }] });
  passUntil(s, () => s.step === 'endCombat' || s.step === 'main2');
  // Knight (2/1 first strike) deals 2 first; Ogre (4/4) survives, assigns 1 lethal to Knight and 3 tramples over.
  assert.equal(s.cards[knight].zone, 'graveyard');
  assert.equal(s.players[other].life, 17);
  assert.equal(s.cards[ogre].damage, 2);
});

test('ETB trigger and anthem static', () => {
  const s = setup([Forest, Healer, Anthem], [Mountain]);
  const ap = s.active;
  passUntil(s, () => s.step === 'main1');
  putOnBattlefield(s, ap, Anthem);
  putOnBattlefield(s, ap, Forest);
  const h = give(s, ap, Healer);
  dispatch(s, ap, { type: 'cast', iid: h });
  dispatch(s, ap, { type: 'pass' });
  dispatch(s, s.priority, { type: 'pass' });
  assert.equal(s.cards[h].zone, 'battlefield');
  assert.equal(s.stack.length, 1, 'ETB trigger on the stack');
  dispatch(s, s.priority, { type: 'pass' });
  dispatch(s, s.priority, { type: 'pass' });
  assert.equal(s.players[ap].life, 23);
  const c = chars(s, h);
  assert.equal(c.power, 2);
  assert.equal(c.toughness, 2);
});

test('mana creatures cannot tap while summoning sick; lose on empty library', () => {
  const s = setup([Forest, Elf], [Mountain]);
  const ap = s.active;
  passUntil(s, () => s.step === 'main1');
  const elf = putOnBattlefield(s, ap, Elf);
  s.cards[elf].sick = true;
  assert.ok(dispatch(s, ap, { type: 'tapForMana', iid: elf }));
  s.cards[elf].sick = false;
  assert.equal(dispatch(s, ap, { type: 'tapForMana', iid: elf }), null);
  assert.equal(s.players[ap].pool.G, 1);
  // empty library loss
  const other = (1 - ap) as PlayerIdx;
  s.players[other].library = [];
  s.players[0].fullControl = false;
  s.players[1].fullControl = false;
  passUntil(s, () => s.over, 400);
  assert.equal(s.winner, ap);
});

test('views hide opponent hand and library', () => {
  const s = setup([Forest, Bear], [Mountain, Bolt]);
  const v = viewFor(s, 0);
  const oppHand = s.players[1].hand;
  for (const iid of oppHand) assert.equal(v.cards[iid].hidden, true);
  assert.equal(v.players[1].library.length, 0);
  assert.ok(v.players[1].libraryCount > 0);
  for (const iid of s.players[0].hand) assert.ok(!v.cards[iid].hidden);
});

test('auto-pass advances through a full turn cycle', () => {
  const s = setup([Forest], [Mountain]);
  s.players[0].fullControl = false;
  s.players[1].fullControl = false;
  settle(s);
  // Both players only have lands; the game should stop at the active player's main phase with a land to play.
  assert.equal(s.step, 'main1');
  const ap = s.active;
  const land = s.players[ap].hand[0];
  dispatch(s, ap, { type: 'playLand', iid: land });
  // nothing else to do: the engine passes to the next turn's main phase
  assert.equal(s.active, 1 - ap);
  assert.equal(s.step, 'main1');
  assert.equal(s.turn, 2);
});
