// storage lands, mana batteries, "any combination of {R} and/or {G}"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, def, dispatch } from './helpers';

const ans = (s: any, choice: any) => assert.equal(dispatch(s, s.prompt.player, { type: 'answer', promptId: s.prompt.id, choice }), null);

test('storage land: remove any number, add that much', () => {
  const { s, ap } = setup();
  const v = add(s, ap, def('Test Vault', '', 'Land', '{T}: Put a storage counter on this land.\n{T}, Remove any number of storage counters from this land: Add {B} for each storage counter removed this way.'), 'battlefield');
  s.cards[v].counters.storage = 3;
  assert.equal(dispatch(s, ap, { type: 'tapForMana', iid: v, ability: 1 }), null);
  assert.equal(s.prompt?.kind, 'x');
  ans(s, 2);
  assert.equal(s.players[ap].pool.B, 2);
  assert.equal(s.cards[v].counters.storage, 1);
  assert.ok(s.cards[v].tapped);
});

test('mana battery: base plus one per counter', () => {
  const { s, ap } = setup();
  const b = add(s, ap, def('Test Battery', '{4}', 'Artifact', '{2}, {T}: Put a charge counter on this artifact.\n{T}, Remove any number of charge counters from this artifact: Add {R}, then add an additional {R} for each charge counter removed this way.'), 'battlefield');
  s.cards[b].counters.charge = 2;
  dispatch(s, ap, { type: 'tapForMana', iid: b, ability: 1 });
  ans(s, 2);
  assert.equal(s.players[ap].pool.R, 3);
});

test('any combination: pick each mana', () => {
  const { s, ap } = setup();
  const r = add(s, ap, def('Test Relic', '{3}', 'Artifact', '{T}: Add two mana in any combination of {U}, {B}, and/or {R}.'), 'battlefield');
  dispatch(s, ap, { type: 'tapForMana', iid: r });
  ans(s, 'U'); ans(s, 'R');
  assert.equal(s.players[ap].pool.U, 1);
  assert.equal(s.players[ap].pool.R, 1);
});

test('remove X storage counters: X in any combination', () => {
  const { s, ap } = setup();
  const l = add(s, ap, def('Test Pools', '', 'Land', '{T}: Add {C}.\n{T}: Put a storage counter on this land.\n{1}, Remove X storage counters from this land: Add X mana in any combination of {W} and/or {U}.'), 'battlefield');
  s.cards[l].counters.storage = 2;
  s.players[ap].pool.C = 1;
  dispatch(s, ap, { type: 'tapForMana', iid: l, ability: 2 });
  ans(s, 2); ans(s, 'W'); ans(s, 'U');
  assert.equal(s.players[ap].pool.W, 1);
  assert.equal(s.players[ap].pool.U, 1);
  assert.equal(s.cards[l].counters.storage, 0);
});
