// src/engine/ext/grants.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, def, dispatch, resolveAll, chars, Bear } from './helpers';

test('enchanted creature has "{T}: This creature deals 1 damage to any target."', () => {
  const { s, ap, op } = setup();
  const b = add(s, ap, Bear, 'battlefield');
  s.cards[b].sick = false;
  const aura = add(s, ap, def('Test Field', '{1}{R}', 'Enchantment — Aura', 'Enchant creature\nEnchanted creature has "{T}: This creature deals 1 damage to any target."'), 'battlefield');
  s.cards[aura].attachedTo = b;
  assert.equal(dispatch(s, ap, { type: 'activate', iid: b, ability: 0 }), null);
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'player', idx: op }] : undefined));
  assert.equal(s.players[op].life, 19);
  s.cards[aura].attachedTo = undefined;
  s.cards[b].tapped = false;
  assert.notEqual(dispatch(s, ap, { type: 'activate', iid: b, ability: 0 }), null, 'gone once the Aura is off');
});

test('Cranial Plating: +1/+0 for each artifact you control', () => {
  const { s, ap } = setup();
  const b = add(s, ap, Bear, 'battlefield');
  const eq = add(s, ap, def('Test Plating', '{2}', 'Artifact — Equipment', 'Equipped creature gets +1/+0 for each artifact you control.\nEquip {1}'), 'battlefield');
  add(s, ap, def('Test Cog', '{1}', 'Artifact', ''), 'battlefield');
  s.cards[eq].attachedTo = b;
  assert.equal(chars(s, b).power, 4);
  assert.equal(chars(s, b).toughness, 2);
});

test('Cryptolith Rite: creatures you control have "{T}: Add one mana of any color."', () => {
  const { s, ap } = setup();
  add(s, ap, def('Test Rite', '{1}{G}', 'Enchantment', 'Creatures you control have "{T}: Add one mana of any color."'), 'battlefield');
  const b = add(s, ap, Bear, 'battlefield');
  s.cards[b].sick = false;
  assert.equal(dispatch(s, ap, { type: 'tapForMana', iid: b }), null);
  if (s.prompt) dispatch(s, ap, { type: 'answer', promptId: s.prompt.id, choice: 'R' });
  assert.equal(s.players[ap].pool.R, 1);
});
