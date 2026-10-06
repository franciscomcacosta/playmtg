// src/engine/ext/reveal.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll, Bear, chars } from './helpers';

const top = (s: any, p: number, iid: string) => { const l = s.players[p].library; l.splice(l.indexOf(iid), 1); l.unshift(iid); };

test("reveal top: if it isn't a creature, graveyard; otherwise battlefield", () => {
  const { s, ap } = setup();
  const b = add(s, ap, Bear, 'library');
  top(s, ap, b);
  lands(s, ap, 1);
  cast(s, ap, add(s, ap, def('Test Raid', '{0}', 'Sorcery', "Reveal the top card of your library. If it isn't a creature card, put it into your graveyard. Otherwise, put that card onto the battlefield.")));
  resolveAll(s);
  assert.equal(s.cards[b].zone, 'battlefield');
});

test('reveal top: draw cards equal to its power', () => {
  const { s, ap } = setup();
  const b = add(s, ap, def('Test Big', '{3}', 'Creature — Beast', '', ['3', '3']), 'library');
  top(s, ap, b);
  lands(s, ap, 1);
  const h = s.players[ap].hand.length;
  cast(s, ap, add(s, ap, def('Test Rev', '{0}', 'Sorcery', "Reveal the top card of your library. If it's a creature card, you draw cards equal to its power and you gain life equal to its toughness.")));
  resolveAll(s);
  assert.equal(s.players[ap].hand.length, h + 3);
  assert.equal(s.players[ap].life, 23);
});

test("reveal top: land → the Deceiver gets +1/+0", () => {
  const { s, ap } = setup();
  const d = add(s, ap, def('Test Deceiver', '{4}', 'Creature — Spirit', "{2}: Reveal the top card of your library. If it's a land card, this creature gets +1/+0 and gains first strike until end of turn.", ['4', '2']), 'battlefield');
  const l = add(s, ap, def('Forest', '', 'Basic Land — Forest'), 'library');
  top(s, ap, l);
  void chars; void d;
});

test('reveal top, then cast it for free', () => {
  const { s, ap } = setup();
  const o = add(s, ap, def('Test Ogre', '{5}{G}', 'Creature — Ogre', '', ['5', '5']), 'library');
  top(s, ap, o);
  lands(s, ap, 1);
  cast(s, ap, add(s, ap, def('Test Path', '{0}', 'Sorcery', "Reveal the top card of your library. If it's a creature card, you may cast it without paying its mana cost.")));
  resolveAll(s, (st) => (st.prompt?.kind === 'yesno' ? 'yes' : undefined));
  assert.equal(s.cards[o].zone, 'battlefield');
});

test('reveal until nonland: damage equal to its mana value, card to hand, rest to bottom', () => {
  const { s, ap, op } = setup();
  const o = add(s, ap, def('Test Ogre', '{3}{G}', 'Creature — Ogre', '', ['5', '5']), 'library');
  const f = add(s, ap, def('Forest', '', 'Basic Land — Forest'), 'library');
  top(s, ap, o); top(s, ap, f);
  lands(s, ap, 1);
  cast(s, ap, add(s, ap, def('Test Revelation', '{0}', 'Sorcery', 'Choose any target. Reveal cards from the top of your library until you reveal a nonland card. Test Revelation deals damage equal to that card\'s mana value to that permanent or player. Put the nonland card into your hand and the rest on the bottom of your library in any order.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'player', idx: op }] : undefined));
  assert.equal(s.players[op].life, 16);
  assert.equal(s.cards[o].zone, 'hand');
  assert.equal(s.players[ap].library.at(-1), f);
});

test('exile until nonland, cast it free', () => {
  const { s, ap } = setup();
  const o = add(s, ap, def('Test Ogre', '{3}{G}', 'Creature — Ogre', '', ['5', '5']), 'library');
  const f = add(s, ap, def('Forest', '', 'Basic Land — Forest'), 'library');
  top(s, ap, o); top(s, ap, f);
  lands(s, ap, 1);
  cast(s, ap, add(s, ap, def('Test Tome', '{0}', 'Sorcery', 'Exile cards from the top of your library until you exile a nonland card. You may cast that card without paying its mana cost.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'yesno' ? 'yes' : undefined));
  assert.equal(s.cards[o].zone, 'battlefield');
  assert.equal(s.cards[f].zone, 'exile');
});

test('Coiling Oracle: nonland goes to hand', () => {
  const { s, ap } = setup();
  const o = add(s, ap, def('Test Ogre', '{3}{G}', 'Creature — Ogre', '', ['5', '5']), 'library');
  top(s, ap, o);
  lands(s, ap, 1);
  cast(s, ap, add(s, ap, def('Test Oracle', '{0}', 'Creature — Snake', "When this creature enters, reveal the top card of your library. If it's a land card, put it onto the battlefield. Otherwise, put that card into your hand.", ['1', '1'])));
  resolveAll(s);
  assert.equal(s.cards[o].zone, 'hand');
});

test('parley: a token per nonland card revealed', () => {
  const { s, ap, op } = setup();
  top(s, ap, add(s, ap, def('Test Ogre', '{3}{G}', 'Creature — Ogre', '', ['5', '5']), 'library'));
  top(s, op, add(s, op, def('Test Ogre', '{3}{G}', 'Creature — Ogre', '', ['5', '5']), 'library'));
  lands(s, ap, 1);
  const before = s.battlefield.length;
  cast(s, ap, add(s, ap, def('Test Rousing', '{0}', 'Sorcery', 'Each player reveals the top card of their library. For each nonland card revealed this way, you create a 1/1 white Spirit creature token with flying. Then each player draws a card.')));
  resolveAll(s);
  assert.equal(s.battlefield.length, before + 2);
});
