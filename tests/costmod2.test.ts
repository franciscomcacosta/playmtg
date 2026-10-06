// src/engine/ext/costmod2.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, castOptions, Bear } from './helpers';

const ok = (s: any, p: any, iid: string) => castOptions(s, p, iid).some((x: any) => x.ok);

test('costs {X} less where X is the greatest power among creatures you control', () => {
  const { s, ap } = setup();
  lands(s, ap, 2);
  const sp = add(s, ap, def('Test Reward', '{5}{G}', 'Sorcery', 'This spell costs {X} less to cast, where X is the greatest power among creatures you control.\nDraw two cards.'));
  assert.ok(!ok(s, ap, sp));
  add(s, ap, def('Test Big', '{4}', 'Creature — Giant', '', ['4', '4']), 'battlefield');
  assert.ok(ok(s, ap, sp));
});

test('costs {1} less for each color among permanents you control', () => {
  const { s, ap } = setup();
  lands(s, ap, 2);
  const sp = add(s, ap, def('Test Hue', '{4}', 'Sorcery', 'This spell costs {1} less to cast for each color among permanents you control.\nDraw a card.'));
  assert.ok(!ok(s, ap, sp));
  add(s, ap, def('Test G', '{G}', 'Creature — Elf', '', ['1', '1'], { colors: ['G'] }), 'battlefield');
  add(s, ap, def('Test R', '{R}', 'Creature — Goblin', '', ['1', '1'], { colors: ['R'] }), 'battlefield');
  assert.ok(ok(s, ap, sp));
  void Bear;
});
