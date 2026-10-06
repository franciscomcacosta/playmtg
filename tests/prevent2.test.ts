// src/engine/ext/prevent2.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll, dispatch, Bear } from './helpers';

const Bolt = def('Test Bolt', '{R}', 'Instant', 'Test Bolt deals 3 damage to any target.');

test('prevent all damage that would be dealt to target creature this turn', () => {
  const { s, ap } = setup();
  lands(s, ap, 2);
  const b = add(s, ap, Bear, 'battlefield');
  cast(s, ap, add(s, ap, def('Test Shield', '{W}', 'Instant', 'Prevent all damage that would be dealt to target creature this turn.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: b }] : undefined));
  cast(s, ap, add(s, ap, Bolt));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: b }] : undefined));
  assert.equal(s.cards[b].zone, 'battlefield');
  assert.equal(s.cards[b].damage, 0);
});

test('static: prevent all damage that would be dealt by enchanted creature', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 1);
  const b = add(s, op, def('Test Pinger', '{1}', 'Creature — Wizard', '{T}: This creature deals 1 damage to any target.', ['1', '1']), 'battlefield');
  const aura = add(s, ap, def('Test Pacifism', '{W}', 'Enchantment — Aura', 'Enchant creature\nPrevent all damage that would be dealt by enchanted creature.'), 'battlefield');
  s.cards[aura].attachedTo = b;
  s.cards[b].sick = false;
  s.priority = op;
  assert.equal(dispatch(s, op, { type: 'activate', iid: b, ability: 0 }), null);
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'player', idx: ap }] : undefined));
  assert.equal(s.players[ap].life, 20);
});
