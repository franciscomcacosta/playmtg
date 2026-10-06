// src/engine/ext/batch7.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll, Bear } from './helpers';

test('your life total becomes N', () => {
  const { s, ap } = setup();
  lands(s, ap, 1);
  s.players[ap].life = 3;
  cast(s, ap, add(s, ap, def('Test Grace', '{1}', 'Instant', 'Your life total becomes 10.')));
  resolveAll(s);
  assert.equal(s.players[ap].life, 10);
});

test("each player's life total becomes the number of creatures they control", () => {
  const { s, ap, op } = setup();
  lands(s, ap, 1);
  add(s, ap, Bear, 'battlefield'); add(s, ap, Bear, 'battlefield'); add(s, op, Bear, 'battlefield');
  cast(s, ap, add(s, ap, def('Test Rhythm', '{1}', 'Sorcery', "Each player's life total becomes the number of creatures they control.")));
  resolveAll(s);
  assert.equal(s.players[ap].life, 2);
  assert.equal(s.players[op].life, 1);
});

test("target player's life total becomes half their starting life total, rounded down", () => {
  const { s, ap, op } = setup();
  lands(s, ap, 1);
  cast(s, ap, add(s, ap, def('Test Famine', '{1}', 'Sorcery', "Target player's life total becomes half their starting life total, rounded down.")));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'player', idx: op }] : undefined));
  assert.equal(s.players[op].life, 10);
});
