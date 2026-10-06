// "creatures target player controls …"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll, chars, Bear } from './helpers';

test('creatures target player controls get -1/-1', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 2);
  const mine = add(s, ap, Bear, 'battlefield'), theirs = add(s, op, Bear, 'battlefield');
  cast(s, ap, add(s, ap, def('Test Marsh', '{B}{B}', 'Sorcery', 'Creatures target player controls get -1/-1 until end of turn.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'player', idx: ap }] : undefined));
  assert.equal(chars(s, mine).power, 1);
  assert.equal(chars(s, theirs).power, 2);
});

test('tap all lands target player controls', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 2);
  const ls = lands(s, op, 3) as any;
  cast(s, ap, add(s, ap, def('Test Short', '{1}{U}', 'Instant', 'Tap all lands target player controls.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'player', idx: op }] : undefined));
  assert.equal(s.battlefield.filter((b) => s.cards[b].controller === op && s.cards[b].tapped).length, 3);
  void ls;
});
