// src/engine/ext/become.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, def, chars } from './helpers';

const attach = (s: any, aura: string, to: string) => { s.cards[aura].attachedTo = to; };

test('Frogify: loses abilities, blue 1/1 Frog', () => {
  const { s, ap, op } = setup();
  const d = add(s, op, def('Test Dragon', '{4}{R}', 'Creature — Dragon', 'Flying', ['5', '5']), 'battlefield');
  const a = add(s, ap, def('Test Frogify', '{1}{U}', 'Enchantment — Aura', 'Enchant creature\nEnchanted creature loses all abilities and is a blue Frog creature with base power and toughness 1/1.'), 'battlefield');
  attach(s, a, d);
  const c = chars(s, d);
  assert.equal(c.power, 1); assert.equal(c.toughness, 1);
  assert.ok(!c.keywords.has('flying'));
  assert.deepEqual(c.colors, ['U']);
  assert.ok(c.subtypes.has('frog') && !c.subtypes.has('dragon'));
});

test('Song of the Dryads: a colorless Forest land that taps for G', () => {
  const { s, ap, op } = setup();
  const d = add(s, op, def('Test Golem', '{4}', 'Artifact Creature — Golem', 'Trample', ['5', '5']), 'battlefield');
  const a = add(s, ap, def('Test Song', '{2}{G}', 'Enchantment — Aura', 'Enchant permanent\nEnchanted permanent is a colorless Forest land.'), 'battlefield');
  attach(s, a, d);
  const c = chars(s, d);
  assert.ok(c.types.has('land') && !c.types.has('creature') && !c.types.has('artifact'));
  assert.ok(c.subtypes.has('forest'));
  assert.ok(!c.keywords.has('trample'));
  assert.ok(c.pc.activated.some((x: any) => x.isMana && JSON.stringify(x.produces).includes('G')));
});

test('Imprisoned in the Moon: colorless land with {T}: Add {C}', () => {
  const { s, ap, op } = setup();
  const d = add(s, op, def('Test Walker', '{3}', 'Legendary Planeswalker — Test', '+1: Draw a card.'), 'battlefield');
  const a = add(s, ap, def('Test Moon', '{2}{U}', 'Enchantment — Aura', 'Enchant creature, land, or planeswalker\nEnchanted permanent is a colorless land with "{T}: Add {C}" and loses all other card types and abilities.'), 'battlefield');
  attach(s, a, d);
  const c = chars(s, d);
  assert.ok(c.types.has('land') && !c.types.has('planeswalker'));
  assert.equal(c.pc.activated.length, 1);
});

test('as long as enchanted creature is blue, it gets +1/+1', () => {
  const { s, ap } = setup();
  const b = add(s, ap, def('Test Bear', '{1}{G}', 'Creature — Bear', '', ['2', '2'], { colors: ['G'] }), 'battlefield');
  const u = add(s, ap, def('Test Drake', '{1}{U}', 'Creature — Drake', '', ['2', '2'], { colors: ['U'] }), 'battlefield');
  const a = add(s, ap, def('Test Clout', '{2}{U}', 'Enchantment — Aura', 'Enchant creature\nAs long as enchanted creature is blue, it gets +1/+1 and has shroud.'), 'battlefield');
  attach(s, a, b);
  assert.equal(chars(s, b).power, 2);
  attach(s, a, u);
  assert.equal(chars(s, u).power, 3);
  assert.ok(chars(s, u).keywords.has('shroud'));
});
