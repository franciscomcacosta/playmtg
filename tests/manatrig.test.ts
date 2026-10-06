// src/engine/ext/manatrig.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, def, dispatch } from './helpers';

test('Wild Growth adds an extra {G}; Mana Flare doubles any land', () => {
  const { s, ap } = setup();
  const f = add(s, ap, def('Forest', '', 'Basic Land — Forest', '{T}: Add {G}.'), 'battlefield');
  const wg = add(s, ap, def('Test Growth', '{G}', 'Enchantment — Aura', 'Enchant land\nWhenever enchanted land is tapped for mana, its controller adds an additional {G}.'), 'battlefield');
  s.cards[wg].attachedTo = f;
  add(s, ap, def('Test Flare', '{2}{R}', 'Enchantment', 'Whenever a player taps a land for mana, that player adds one mana of any type that land produced.'), 'battlefield');
  assert.equal(dispatch(s, ap, { type: 'activate', iid: f, ability: 0 }), null);
  assert.equal(s.players[ap].pool.G, 3);
});
