// src/engine/ext/tempmods.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, dispatch, resolveAll, chars } from './helpers';

test('creature land: becomes a 3/2 red Goblin creature with haste and a granted trigger, still a land', () => {
  const { s, ap } = setup();
  const l = add(s, ap, def('Test Lair', '', 'Land', '{T}: Add {R}.\n{0}: Until end of turn, this land becomes a 3/2 red Goblin creature with haste and "Whenever this creature attacks, draw a card." It\'s still a land.'), 'battlefield');
  assert.equal(dispatch(s, ap, { type: 'activate', iid: l, ability: 1 }), null);
  resolveAll(s);
  const c = chars(s, l);
  assert.ok(c.types.has('creature') && c.types.has('land'));
  assert.equal(c.power, 3);
  assert.ok(c.keywords.has('haste'));
  assert.ok(c.pc.triggers.some((t: any) => t.event === 'attacks'));
  assert.deepEqual(c.colors, ['R']);
});

test('becomes a Dragon with base power and toughness 4/4, flying, and haste', () => {
  const { s, ap } = setup();
  lands(s, ap, 1);
  const b = add(s, ap, def('Test Bear', '{1}', 'Creature — Bear', '{0}: Until end of turn, this creature becomes a Dragon with base power and toughness 4/4, flying, and haste.', ['2', '2']), 'battlefield');
  assert.equal(dispatch(s, ap, { type: 'activate', iid: b, ability: 0 }), null);
  resolveAll(s);
  const c = chars(s, b);
  assert.equal(c.power, 4);
  assert.ok(c.subtypes.has('dragon') && !c.subtypes.has('bear'));
  assert.ok(c.keywords.has('flying'));
});
