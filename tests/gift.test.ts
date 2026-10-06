// src/engine/ext/gift.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, dispatch, resolveAll, Bear } from './helpers';

const Maw = def('Test Maw', '{U}', 'Instant', "Gift a tapped Fish\nReturn target creature an opponent controls to its owner's hand. If the gift was promised, instead return target nonland permanent an opponent controls to its owner's hand.");

for (const promise of [false, true]) test(`gift ${promise ? 'promised' : 'not promised'}`, () => {
  const { s, ap, op } = setup();
  lands(s, ap, 1);
  const b = add(s, op, Bear, 'battlefield');
  const ench = add(s, op, def('Test Aura', '{1}', 'Enchantment', ''), 'battlefield');
  const sp = add(s, ap, Maw);
  assert.equal(dispatch(s, ap, { type: 'cast', iid: sp }), null);
  resolveAll(s, (st) => {
    if (st.prompt?.kind === 'chooseCards' && st.prompt.data?.cost === 'extGift') return promise ? [sp] : [];
    if (st.prompt?.kind === 'targets') return [{ kind: 'card', iid: promise ? ench : b }];
    return undefined;
  });
  assert.equal(s.cards[promise ? ench : b].zone, 'hand');
  const fish = s.battlefield.filter((x) => s.cards[x].controller === op && s.defs[s.cards[x].defId].name === 'Fish');
  assert.equal(fish.length, promise ? 1 : 0);
  if (promise) assert.ok(s.cards[fish[0]].tapped);
});
