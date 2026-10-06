// src/engine/ext/fromhand.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll, Bear, Forest } from './helpers';

test('put a creature card with mana value 3 or less from your hand onto the battlefield', () => {
  const { s, ap } = setup();
  lands(s, ap, 1);
  const small = add(s, ap, Bear);
  const big = add(s, ap, def('Test Giant', '{5}{G}', 'Creature — Giant', '', ['6', '6']));
  add(s, ap, Forest);
  let offered: string[] = [];
  cast(s, ap, add(s, ap, def('Test Piper', '{G}', 'Sorcery', 'You may put a creature card with mana value 3 or less from your hand onto the battlefield.')));
  resolveAll(s, (st) => { if (st.prompt?.kind === 'chooseCards') { offered = st.prompt.cards!; return [small]; } return st.prompt?.kind === 'yesno' ? 'yes' : undefined; });
  assert.deepEqual(offered, [small], 'only the cheap creature is offered');
  assert.equal(s.cards[small].zone, 'battlefield');
  assert.equal(s.cards[big].zone, 'hand');
});
