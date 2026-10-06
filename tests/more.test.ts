// Tests for src/engine/ext/more.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll, dispatch, passUntil, chars, Bear, Forest } from './helpers';

test('level up bands change P/T and abilities', () => {
  const { s, ap } = setup();
  lands(s, ap, 12);
  const c = add(s, ap, def('Test Leveler', '{1}{G}', 'Creature — Beast', 'Level up {1}\nLEVEL 1-2\n4/4\nLEVEL 3+\n6/6\nTrample', ['2', '2']), 'battlefield');
  const up = () => { assert.equal(dispatch(s, ap, { type: 'activate', iid: c, ability: 0 }), null); resolveAll(s); };
  assert.equal(chars(s, c).power, 2);
  up();
  assert.equal(chars(s, c).power, 4);
  assert.ok(!chars(s, c).keywords.has('trample'));
  up(); up();
  assert.equal(chars(s, c).power, 6);
  assert.ok(chars(s, c).keywords.has('trample'));
});

test('station: tap a creature to add charge counters; becomes a creature at the threshold', () => {
  const { s, ap } = setup();
  const ship = add(s, ap, def('Test Ship', '{3}', 'Artifact — Spacecraft', 'Station\nSTATION 4+\nFlying\n3/5'), 'battlefield');
  const crew = add(s, ap, def('Test Big', '{4}', 'Creature — Giant', '', ['5', '5']), 'battlefield');
  assert.ok(!chars(s, ship).types.has('creature'));
  assert.equal(dispatch(s, ap, { type: 'activate', iid: ship, ability: 0 }), null);
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? [crew] : undefined));
  assert.equal(s.cards[ship].counters.charge, 5);
  assert.ok(chars(s, ship).types.has('creature'));
  assert.ok(chars(s, ship).keywords.has('flying'));
  assert.equal(chars(s, ship).toughness, 5);
});

test('shuffle hand and graveyard into library, then draw seven (subject carried)', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 3);
  for (let i = 0; i < 10; i++) { add(s, ap, Forest, 'library'); add(s, op, Forest, 'library'); }
  add(s, op, Bear, 'graveyard');
  cast(s, ap, add(s, ap, def('Test Twister', '{2}', 'Sorcery', 'Each player shuffles their hand and graveyard into their library, then draws seven cards.')));
  resolveAll(s);
  assert.equal(s.players[ap].hand.length, 7);
  assert.equal(s.players[op].hand.length, 7);
  assert.equal(s.players[op].graveyard.length, 0);
});

test('clash: winner gets the bonus', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 2);
  add(s, ap, def('Test Big Top', '{7}', 'Creature — Giant', '', ['7', '7'], { cmc: 7 }), 'library');
  add(s, op, Forest, 'library');
  const life = s.players[ap].life;
  cast(s, ap, add(s, ap, def('Test Clasher', '{1}', 'Sorcery', 'Clash with an opponent. If you win, you gain 5 life.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'yesno' ? 'no' : undefined));
  assert.equal(s.players[ap].life, life + 5);
});

test('counter filters, lure, life-gain plus, search by name, new-style station rows', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 6);
  add(s, ap, def('Test Trample Lord', '{2}', 'Enchantment', 'Each creature you control with a +1/+1 counter on it has trample.'), 'battlefield');
  const a = add(s, ap, Bear, 'battlefield');
  const b = add(s, ap, Bear, 'battlefield');
  s.cards[a].counters['+1/+1'] = 1;
  assert.ok(chars(s, a).keywords.has('trample'));
  assert.ok(!chars(s, b).keywords.has('trample'));
  add(s, ap, def('Test Angel', '{2}', 'Enchantment', 'If you would gain life, you gain that much life plus 1 instead.'), 'battlefield');
  const life = s.players[ap].life;
  cast(s, ap, add(s, ap, def('Test Heal', '{1}', 'Instant', 'You gain 2 life.')));
  resolveAll(s);
  assert.equal(s.players[ap].life, life + 3);
  const want = add(s, ap, def('Test Buddy', '{1}', 'Creature — Dog', '', ['1', '1']), 'library');
  cast(s, ap, add(s, ap, def('Test Caller', '{1}', 'Sorcery', 'Search your library for a card named Test Buddy, reveal it, put it into your hand, then shuffle.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? [want] : undefined));
  assert.equal(s.cards[want].zone, 'hand');
  const ship = add(s, ap, def('Test Ship 2', '{3}', 'Artifact — Spacecraft', 'Station (Tap another creature you control: Put charge counters equal to its power on this Spacecraft. Station only as a sorcery. It\'s an artifact creature at 3+.)\n3+ | Flying', ['4', '4']), 'battlefield');
  assert.ok(!chars(s, ship).types.has('creature'));
  s.cards[ship].counters.charge = 3;
  assert.ok(chars(s, ship).types.has('creature'));
  assert.ok(chars(s, ship).keywords.has('flying'));
  void op;
});

test('lure: all creatures able to block it do so', () => {
  const { s, ap, op } = setup();
  const l = add(s, ap, def('Test Lure', '{2}', 'Creature — Beast', 'All creatures able to block Test Lure do so.', ['2', '2']), 'battlefield');
  const x = add(s, ap, Bear, 'battlefield');
  const b = add(s, op, Bear, 'battlefield');
  passUntil(s, () => s.prompt?.kind === 'declareAttackers');
  dispatch(s, ap, { type: 'answer', promptId: s.prompt!.id, choice: [{ iid: l, target: { kind: 'player', idx: op } }, { iid: x, target: { kind: 'player', idx: op } }] });
  passUntil(s, () => s.prompt?.kind === 'declareBlockers');
  assert.ok(dispatch(s, op, { type: 'answer', promptId: s.prompt!.id, choice: [] }), 'must block the lure');
  assert.ok(dispatch(s, op, { type: 'answer', promptId: s.prompt!.id, choice: [{ blocker: b, attacker: x }] }), 'must block the lure, not the other');
  assert.equal(dispatch(s, op, { type: 'answer', promptId: s.prompt!.id, choice: [{ blocker: b, attacker: l }] }), null);
});
