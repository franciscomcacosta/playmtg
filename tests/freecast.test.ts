// Casting without paying mana costs (src/engine/ext/freecast.ts and the dig 'cast' destination).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll, Bear, Forest } from './helpers';

const Ogre = def('Test Ogre', '{5}{G}', 'Creature — Ogre', '', ['5', '5']);

test('dig: cast a spell from among the top cards for free; the rest go to the bottom', () => {
  const { s, ap } = setup();
  lands(s, ap, 1);
  const ogre = add(s, ap, Ogre, 'library');
  const f = add(s, ap, Forest, 'library');
  cast(s, ap, add(s, ap, def('Test Marvel', '{1}', 'Sorcery', 'Look at the top two cards of your library. You may cast a spell from among them without paying its mana cost. Put the rest on the bottom of your library in a random order.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? [ogre] : undefined));
  assert.equal(s.cards[ogre].zone, 'battlefield', 'the 6-drop was cast for free');
  assert.equal(s.players[ap].library.at(-1), f, 'the land went to the bottom');
});

test('dig: lands are never offered as spells to cast', () => {
  const { s, ap } = setup();
  lands(s, ap, 1);
  add(s, ap, Forest, 'library');
  cast(s, ap, add(s, ap, def('Test Marvel', '{1}', 'Sorcery', 'Look at the top card of your library. You may cast a spell from among them without paying its mana cost. Put the rest on the bottom of your library in a random order.')));
  resolveAll(s, (st) => { assert.notEqual(st.prompt?.kind, 'chooseCards', 'no prompt when only a land was seen'); return undefined; });
});

test('exile the top card, cast it if nonland', () => {
  const { s, ap } = setup();
  lands(s, ap, 1);
  const ogre = add(s, ap, Ogre, 'library');
  cast(s, ap, add(s, ap, def('Test Wildfire', '{1}', 'Sorcery', "Exile the top card of your library. If it's a nonland card, you may cast it without paying its mana cost.")));
  resolveAll(s);
  assert.equal(s.cards[ogre].zone, 'battlefield');
});

test('cast from hand with no mana value cap', () => {
  const { s, ap } = setup();
  lands(s, ap, 1);
  const ogre = add(s, ap, Ogre);
  cast(s, ap, add(s, ap, def('Test Gate', '{1}', 'Sorcery', 'You may cast a creature spell from your hand without paying its mana cost.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? [ogre] : undefined));
  assert.equal(s.cards[ogre].zone, 'battlefield');
});
