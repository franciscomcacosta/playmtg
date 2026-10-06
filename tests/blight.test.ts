// Blight and "Do this only once each turn." (src/engine/ext/blight.ts + the core 'may' effect).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll, Bear, Forest } from './helpers';

const Seizer = def('Test Seizer', '{2}', 'Creature — Faerie', 'When this creature enters, you may blight 1. If you do, you gain 5 life.', ['3', '3']);

test('blight 1: a -1/-1 counter on the chosen creature, then the payoff', () => {
  const { s, ap } = setup();
  lands(s, ap, 2);
  const bear = add(s, ap, Bear, 'battlefield');
  const life = s.players[ap].life;
  cast(s, ap, add(s, ap, Seizer));
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? [bear] : undefined));
  assert.equal(s.cards[bear].counters['-1/-1'], 1);
  assert.equal(s.players[ap].life, life + 5);
});

test('declining the blight: no counter, no payoff', () => {
  const { s, ap } = setup();
  lands(s, ap, 2);
  const bear = add(s, ap, Bear, 'battlefield');
  const life = s.players[ap].life;
  cast(s, ap, add(s, ap, Seizer));
  resolveAll(s, (st) => (st.prompt?.kind === 'yesno' ? 'no' : undefined));
  assert.equal(s.cards[bear].counters['-1/-1'] ?? 0, 0);
  assert.equal(s.players[ap].life, life);
});

test('do this only once each turn: the second trigger in a turn does nothing', () => {
  const { s, ap } = setup();
  lands(s, ap, 4);
  add(s, ap, def('Test Feeder', '{1}', 'Enchantment', 'Whenever a creature you control enters, you may gain 3 life. Do this only once each turn.'), 'battlefield');
  const life = s.players[ap].life;
  cast(s, ap, add(s, ap, Bear)); resolveAll(s);
  cast(s, ap, add(s, ap, Bear)); resolveAll(s);
  assert.equal(s.players[ap].life, life + 3, 'only once this turn');
});

test('do this only once each turn: declining keeps the chance for later', () => {
  const { s, ap } = setup();
  lands(s, ap, 4);
  add(s, ap, def('Test Feeder', '{1}', 'Enchantment', 'Whenever a creature you control enters, you may gain 3 life. Do this only once each turn.'), 'battlefield');
  const life = s.players[ap].life;
  cast(s, ap, add(s, ap, Bear)); resolveAll(s, (st) => (st.prompt?.kind === 'yesno' ? 'no' : undefined));
  cast(s, ap, add(s, ap, Bear)); resolveAll(s);
  assert.equal(s.players[ap].life, life + 3);
});
