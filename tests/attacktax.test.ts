// src/engine/ext/attacktax.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, passUntil, dispatch, Bear } from './helpers';
import { canAttack } from '../src/engine/engine';

const Prison = def('Test Prison', '{2}{W}', 'Enchantment', "Creatures can't attack you unless their controller pays {2} for each creature they control that's attacking you.");
const atk = (s: any, ap: any, ids: string[], op: number) => dispatch(s, ap, { type: 'answer', promptId: s.prompt.id, choice: ids.map((iid) => ({ iid, target: { kind: 'player', idx: op } })) });

test('Propaganda: pay {2} per attacker', () => {
  const { s, ap, op } = setup();
  add(s, op, Prison, 'battlefield');
  const a = add(s, ap, Bear, 'battlefield'), b = add(s, ap, Bear, 'battlefield');
  lands(s, ap, 3);
  passUntil(s, () => s.prompt?.kind === 'declareAttackers');
  assert.match(atk(s, ap, [a, b], op) ?? '', /not enough mana/);
  assert.equal(atk(s, ap, [a], op), null);
  assert.equal(s.battlefield.filter((x) => s.cards[x].controller === ap && s.cards[x].tapped).length, 3); // 2 lands + attacker
});

test("filtered can't attack you", () => {
  const { s, ap, op } = setup();
  add(s, op, def('Test Grass', '{G}', 'Enchantment', "Black creatures can't attack you."), 'battlefield');
  const k = add(s, ap, def('Test Ghoul', '{B}', 'Creature — Zombie', '', ['2', '2'], { colors: ['B'] }), 'battlefield');
  const b = add(s, ap, Bear, 'battlefield');
  assert.equal(canAttack(s, k), false);
  assert.equal(canAttack(s, b), true);
});

test('Archangel: only while untapped', () => {
  const { s, ap, op } = setup();
  const g = add(s, op, def('Test Tithes', '{1}{W}{W}', 'Creature — Angel', "As long as this creature is untapped, creatures can't attack you or planeswalkers you control unless their controller pays {1} for each of those creatures.", ['3', '5']), 'battlefield');
  const a = add(s, ap, Bear, 'battlefield');
  s.cards[g].tapped = true;
  passUntil(s, () => s.prompt?.kind === 'declareAttackers');
  assert.equal(atk(s, ap, [a], op), null);
});
