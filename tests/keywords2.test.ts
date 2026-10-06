// src/engine/ext/keywords2.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, dispatch, resolveAll } from './helpers';

test('storm copies for each spell cast before it', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 4);
  for (let k = 0; k < 2; k++) { cast(s, ap, add(s, ap, def('Test Ritual', '{0}', 'Instant', 'Scry 1.'))); resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? [] : undefined)); }
  cast(s, ap, add(s, ap, def('Test Grapeshot', '{1}{R}', 'Sorcery', 'Test Grapeshot deals 1 damage to any target.\nStorm')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'player', idx: op }] : st.prompt?.kind === 'yesno' ? 'no' : undefined));
  assert.equal(s.players[op].life, 17);
});

test("split second: can't respond", () => {
  const { s, ap, op } = setup();
  lands(s, ap, 2);
  cast(s, ap, add(s, ap, def('Test Krosan', '{2}', 'Instant', 'Split second\nDraw a card.')));
  s.priority = op;
  lands(s, op, 1);
  assert.match(dispatch(s, op, { type: 'cast', iid: add(s, op, def('Test Zap', '{0}', 'Instant', 'Draw a card.')) }) ?? '', /split second/);
});

test('rebound: exiled and cast again next upkeep', () => {
  const { s, ap } = setup();
  lands(s, ap, 1);
  const sp = add(s, ap, def('Test Rebound', '{1}', 'Sorcery', 'Draw a card.\nRebound'));
  cast(s, ap, sp);
  resolveAll(s);
  assert.equal(s.cards[sp].zone, 'exile');
});
