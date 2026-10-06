// src/engine/ext/actcosts.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, dispatch, resolveAll, Bear } from './helpers';

test('Survival of the Fittest: discard a creature card as a cost', () => {
  const { s, ap } = setup();
  lands(s, ap, 1);
  const sv = add(s, ap, def('Test Survival', '{1}{G}', 'Enchantment', '{G}, Discard a creature card: Search your library for a creature card, reveal that card, put it into your hand, then shuffle.'), 'battlefield');
  const fodder = add(s, ap, Bear);
  const target = add(s, ap, def('Test Big', '{6}', 'Creature — Wurm', '', ['6', '6']), 'library');
  assert.equal(dispatch(s, ap, { type: 'activate', iid: sv, ability: 0 }), null);
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? (st.prompt.cards!.includes(fodder) ? [fodder] : [target]) : undefined));
  assert.equal(s.cards[fodder].zone, 'graveyard');
  assert.equal(s.cards[target].zone, 'hand');
});

test("can't activate when the cost can't be paid", () => {
  const { s, ap } = setup();
  lands(s, ap, 1);
  const sv = add(s, ap, def('Test Survival', '{1}{G}', 'Enchantment', '{G}, Discard a creature card: Draw a card.'), 'battlefield');
  for (const h of [...s.players[ap].hand]) s.cards[h].zone = 'graveyard';
  s.players[ap].hand.length = 0;
  assert.notEqual(dispatch(s, ap, { type: 'activate', iid: sv, ability: 0 }), null);
});

test('sacrifice another creature', () => {
  const { s, ap } = setup();
  const outlet = add(s, ap, def('Test Outlet', '{1}{B}', 'Creature — Vampire', 'Sacrifice another creature: Put a +1/+1 counter on this creature.', ['1', '1']), 'battlefield');
  const b = add(s, ap, Bear, 'battlefield');
  assert.equal(dispatch(s, ap, { type: 'activate', iid: outlet, ability: 0 }), null);
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? (assert.ok(!st.prompt.cards!.includes(outlet)), [b]) : undefined));
  assert.equal(s.cards[b].zone, 'graveyard');
  assert.equal(s.cards[outlet].counters['+1/+1'], 1);
});

test('convoke: tap creatures to help pay', () => {
  const { s, ap } = setup();
  lands(s, ap, 1);
  const b1 = add(s, ap, Bear, 'battlefield'), b2 = add(s, ap, Bear, 'battlefield');
  const sp = add(s, ap, def('Test Convoke', '{2}{G}', 'Sorcery', 'Convoke\nDraw a card.'));
  assert.equal(dispatch(s, ap, { type: 'cast', iid: sp }), null);
  resolveAll(s);
  assert.equal(s.cards[sp].zone, 'graveyard');
  assert.ok(s.cards[b1].tapped && s.cards[b2].tapped);
});

test('delve: exile graveyard cards to help pay', () => {
  const { s, ap } = setup();
  lands(s, ap, 1);
  const g = [add(s, ap, Bear, 'graveyard'), add(s, ap, Bear, 'graveyard'), add(s, ap, Bear, 'graveyard')];
  const sp = add(s, ap, def('Test Cruise', '{3}{U}', 'Sorcery', 'Delve\nDraw three cards.'));
  assert.equal(dispatch(s, ap, { type: 'cast', iid: sp }), null);
  resolveAll(s);
  assert.ok(g.every((x) => s.cards[x].zone === 'exile'));
});
