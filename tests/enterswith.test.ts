// src/engine/ext/enterswith.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll, Bear } from './helpers';

test('enters with a +1/+1 counter for each creature card in your graveyard', () => {
  const { s, ap } = setup();
  lands(s, ap, 2);
  add(s, ap, Bear, 'graveyard'); add(s, ap, Bear, 'graveyard'); add(s, ap, Bear, 'graveyard');
  const c = add(s, ap, def('Test Horror', '{1}{B}', 'Creature — Horror', 'This creature enters with a +1/+1 counter on it for each creature card in your graveyard.', ['0', '0']));
  cast(s, ap, c);
  resolveAll(s);
  assert.equal(s.cards[c].counters['+1/+1'], 3);
  assert.equal(s.cards[c].zone, 'battlefield');
});
