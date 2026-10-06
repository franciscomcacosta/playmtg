// protection beyond colors (702.16): card types, creature types, multicolored, everything
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, dispatch, Bear } from './helpers';
import { canBlock } from '../src/engine/engine';

test('protection from instants: can\'t be targeted by an instant', () => {
  const { s, ap, op } = setup();
  const h = add(s, op, def('Test Drinker', '{G}', 'Creature — Snake', 'Protection from instants', ['2', '2']), 'battlefield');
  lands(s, ap, 1);
  const zap = add(s, ap, def('Test Zap', '{R}', 'Instant', 'Test Zap deals 1 damage to target creature.'));
  assert.match(dispatch(s, ap, { type: 'cast', iid: zap }) ?? '', /No legal targets/);
  void h;
});

test('protection from Dogs: can\'t be blocked by a Dog', () => {
  const { s, ap, op } = setup();
  const cat = add(s, ap, def('Test Cat', '{1}', 'Creature — Cat', 'Protection from Dogs', ['2', '2']), 'battlefield');
  const dog = add(s, op, def('Test Dog', '{1}', 'Creature — Dog', '', ['2', '2']), 'battlefield');
  const bear = add(s, op, Bear, 'battlefield');
  s.combat = { attackers: [{ iid: cat, target: { kind: 'player', idx: op }, blockedBy: [] }], declared: true, blocksDeclared: false, firstStrike: false } as any;
  assert.equal(canBlock(s, dog, cat), false);
  assert.equal(canBlock(s, bear, cat), true);
});
