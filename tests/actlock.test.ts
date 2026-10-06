// src/engine/ext/actlock.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, def, dispatch, chars } from './helpers';

test("Stony Silence: artifact abilities (mana too) can't be activated", () => {
  const { s, ap, op } = setup();
  add(s, op, def('Test Silence', '{1}{W}', 'Enchantment', "Activated abilities of artifacts can't be activated."), 'battlefield');
  const rock = add(s, ap, def('Test Rock', '{1}', 'Artifact', '{T}: Add {C}.'), 'battlefield');
  assert.notEqual(dispatch(s, ap, { type: 'tapForMana', iid: rock }), null);
  assert.equal(s.players[ap].pool.C, 0);
});

test('Blood Moon: nonbasic lands are Mountains', () => {
  const { s, ap, op } = setup();
  add(s, op, def('Test Moon', '{2}{R}', 'Enchantment', 'Nonbasic lands are Mountains.'), 'battlefield');
  const dual = add(s, ap, def('Test Dual', '', 'Land — Island Swamp', '({T}: Add {U} or {B}.)\n{T}: Add {U} or {B}.'), 'battlefield');
  const basic = add(s, ap, def('Island', '', 'Basic Land — Island', ''), 'battlefield');
  assert.ok(chars(s, dual).subtypes.has('mountain'));
  assert.ok(!chars(s, dual).subtypes.has('island'));
  assert.ok(chars(s, basic).subtypes.has('island'));
  assert.equal(dispatch(s, ap, { type: 'tapForMana', iid: dual }), null);
  assert.equal(s.players[ap].pool.R, 1);
});

test('Urborg: each land is also a Swamp (and taps for {B})', () => {
  const { s, ap, op } = setup();
  add(s, op, def('Test Urborg', '', 'Legendary Land', 'Each land is a Swamp in addition to its other land types.'), 'battlefield');
  const f = add(s, ap, def('Forest', '', 'Basic Land — Forest', ''), 'battlefield');
  assert.ok(chars(s, f).subtypes.has('swamp') && chars(s, f).subtypes.has('forest'));
  const idx = chars(s, f).pc.activated.findIndex((a: any) => a.produces?.[0]?.[0] === 'B');
  assert.equal(dispatch(s, ap, { type: 'tapForMana', iid: f, ability: idx }), null);
  assert.equal(s.players[ap].pool.B, 1);
});
