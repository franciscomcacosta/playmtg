// src/engine/ext/dmgrepl.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll } from './helpers';

const bolt = (s: any, p: any, target: any, n = 3) => {
  lands(s, p, 1);
  cast(s, p, add(s, p, def('Test Bolt', '{0}', 'Instant', `Test Bolt deals ${n} damage to any target.`)));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [target] : undefined));
};

test('Phytohydra: damage becomes +1/+1 counters', () => {
  const { s, ap, op } = setup();
  const h = add(s, op, def('Test Phyto', '{4}', 'Creature — Plant Hydra', 'If damage would be dealt to this creature, put that many +1/+1 counters on it instead.', ['1', '1']), 'battlefield');
  bolt(s, ap, { kind: 'card', iid: h });
  assert.equal(s.cards[h].zone, 'battlefield');
  assert.equal(s.cards[h].counters['+1/+1'], 3);
});

test('Fiendish Duo doubles damage to opponents', () => {
  const { s, ap, op } = setup();
  add(s, ap, def('Test Duo', '{4}', 'Creature — Devil', 'If a source would deal damage to an opponent, it deals double that damage to that player instead.', ['4', '2']), 'battlefield');
  bolt(s, ap, { kind: 'player', idx: op });
  assert.equal(s.players[op].life, 14);
});

test('Shield: prevent 2 of that damage', () => {
  const { s, ap, op } = setup();
  const b = add(s, op, def('Test Ogre', '{3}', 'Creature — Ogre', '', ['3', '3']), 'battlefield');
  const sh = add(s, op, def('Test Shield', '{1}', 'Artifact — Equipment', 'If a source would deal damage to equipped creature, prevent 2 of that damage.\nEquip {1}'), 'battlefield');
  s.cards[sh].attachedTo = b;
  bolt(s, ap, { kind: 'card', iid: b });
  assert.equal(s.cards[b].damage, 1);
});

test('Laboratory Maniac wins on an empty-library draw', () => {
  const { s, ap } = setup();
  add(s, ap, def('Test Maniac', '{2}{U}', 'Creature — Human Wizard', 'If you would draw a card while your library has no cards in it, you win the game instead.', ['2', '2']), 'battlefield');
  s.players[ap].library.length = 0;
  lands(s, ap, 1);
  cast(s, ap, add(s, ap, def('Test Draw', '{0}', 'Instant', 'Draw a card.')));
  resolveAll(s);
  assert.ok(s.over);
  assert.equal(s.players[1 - ap].lost, true);
});
