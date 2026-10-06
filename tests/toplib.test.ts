// src/engine/ext/toplib.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, dispatch, resolveAll, viewFor, Forest, Bear } from './helpers';

const top = (s: any, p: number, iid: string) => { const L = s.players[p].library; L.splice(L.indexOf(iid), 1); L.unshift(iid); };

test('Courser-style: play lands from the top of your library; revealed to everyone', () => {
  const { s, ap, op } = setup();
  add(s, ap, def('Test Courser', '{1}{G}{G}', 'Enchantment Creature — Centaur', 'Play with the top card of your library revealed.\nYou may play lands from the top of your library.', ['2', '4']), 'battlefield');
  const f = add(s, ap, Forest, 'library'); top(s, ap, f);
  assert.equal((viewFor(s, op) as any).players[ap].libraryTop, f);
  assert.equal(dispatch(s, ap, { type: 'playLand', iid: f }), null);
  assert.equal(s.cards[f].zone, 'battlefield');
});

test('Future Sight: cast a spell from the top', () => {
  const { s, ap } = setup();
  lands(s, ap, 2);
  add(s, ap, def('Test Sight', '{2}{U}{U}{U}', 'Enchantment', 'Play with the top card of your library revealed.\nYou may play lands and cast spells from the top of your library.'), 'battlefield');
  const b = add(s, ap, Bear, 'library'); top(s, ap, b);
  assert.equal(dispatch(s, ap, { type: 'cast', iid: b, alt: 'mayPlay' } as any), null);
  resolveAll(s);
  assert.equal(s.cards[b].zone, 'battlefield');
});
