// src/engine/ext/blockrules.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll, Bear } from './helpers';
import { canBlock } from '../src/engine/engine';

const atk = (s: any, a: string, op: number) => { s.combat = { attackers: [{ iid: a, target: { kind: 'player', idx: op }, blockedBy: [] }], declared: true, blocksDeclared: false, firstStrike: false }; };

test("can't be blocked except by black creatures", () => {
  const { s, ap, op } = setup();
  const a = add(s, ap, def('Test Shade', '{B}', 'Creature — Shade', "This creature can't be blocked except by black creatures.", ['2', '2']), 'battlefield');
  const black = add(s, op, def('Test Zombie', '{B}', 'Creature — Zombie', '', ['2', '2'], { colors: ['B'] }), 'battlefield');
  const bear = add(s, op, Bear, 'battlefield');
  atk(s, a, op);
  assert.equal(canBlock(s, black, a), true);
  assert.equal(canBlock(s, bear, a), false);
});

test("can't be blocked as long as it's attacking alone", () => {
  const { s, ap, op } = setup();
  const a = add(s, ap, def('Test Lone', '{1}', 'Creature — Rogue', "This creature can't be blocked as long as it's attacking alone.", ['2', '2']), 'battlefield');
  const bear = add(s, op, Bear, 'battlefield');
  atk(s, a, op);
  assert.equal(canBlock(s, bear, a), false);
});

test("target creature can't be blocked this turn except by creatures with haste", () => {
  const { s, ap, op } = setup();
  lands(s, ap, 1);
  const a = add(s, ap, Bear, 'battlefield');
  const bear = add(s, op, Bear, 'battlefield');
  cast(s, ap, add(s, ap, def('Test Charge', '{R}', 'Instant', "Target creature can't be blocked this turn except by creatures with haste.")));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: a }] : undefined));
  atk(s, a, op);
  assert.equal(canBlock(s, bear, a), false);
});
