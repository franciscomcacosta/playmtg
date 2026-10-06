// src/engine/ext/punisher.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, dispatch, resolveAll } from './helpers';

for (const pay of [true, false]) test(`Rhystic Study: opponent ${pay ? 'pays' : "doesn't pay"}`, () => {
  const { s, ap, op } = setup();
  add(s, op, def('Test Study', '{2}{U}', 'Enchantment', 'Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.'), 'battlefield');
  lands(s, ap, 2);
  const hand = s.players[op].hand.length;
  const sp = add(s, ap, def('Test Opt', '{U}', 'Instant', 'Scry 1.'));
  assert.equal(dispatch(s, ap, { type: 'cast', iid: sp }), null);
  resolveAll(s, (st) => (st.prompt?.kind === 'yesno' && st.prompt.player === ap ? (pay ? 'yes' : 'no') : st.prompt?.kind === 'chooseCards' ? [] : undefined));
  assert.equal(s.players[op].hand.length, hand + (pay ? 0 : 1));
  assert.equal(s.battlefield.filter((x) => s.cards[x].controller === ap && s.cards[x].tapped).length, pay ? 2 : 1);
});

test("Beast Within: its controller gets the 3/3", () => {
  const { s, ap, op } = setup();
  lands(s, ap, 3);
  const t = add(s, op, def('Test Rock', '{2}', 'Artifact', ''), 'battlefield');
  dispatch(s, ap, { type: 'cast', iid: add(s, ap, def('Test Within', '{2}{G}', 'Instant', 'Destroy target permanent. Its controller creates a 3/3 green Beast creature token.')) });
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: t }] : undefined));
  assert.equal(s.cards[t].zone, 'graveyard');
  assert.equal(s.battlefield.filter((x) => s.cards[x].controller === op && s.defs[s.cards[x].defId].name === 'Beast').length, 1);
});
