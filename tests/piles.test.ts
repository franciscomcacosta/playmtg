// src/engine/ext/piles.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, dispatch, resolveAll, Bear } from './helpers';

test('Fact or Fiction: opponent splits, you pick a pile', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 4);
  const top5 = s.players[ap].library.slice(0, 5);
  const hand = s.players[ap].hand.length;
  cast(s, ap, add(s, ap, def('Test FoF', '{3}{U}', 'Instant', 'Reveal the top five cards of your library. An opponent separates those cards into two piles. Put one pile into your hand and the other into your graveyard.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? (assert.equal(st.prompt.player, op), top5.slice(0, 2)) : st.prompt?.kind === 'yesno' ? 'no' : undefined));
  assert.equal(s.players[ap].hand.length, hand + 3);
  assert.ok(top5.slice(0, 2).every((c) => s.cards[c].zone === 'graveyard'));
});

test('Counterbalance counters a spell with the same mana value as the top card', () => {
  const { s, ap, op } = setup();
  add(s, op, def('Test Balance', '{U}{U}', 'Enchantment', 'Whenever an opponent casts a spell, you may reveal the top card of your library. If you do, counter that spell if it has the same mana value as the revealed card.'), 'battlefield');
  const L = s.players[op].library;
  const t = add(s, op, def('Test Two', '{2}', 'Artifact', '', undefined, { cmc: 2 }), 'library'); L.splice(L.indexOf(t), 1); L.unshift(t);
  lands(s, ap, 2);
  const bear = add(s, ap, def('Test Bear2', '{1}{G}', 'Creature — Bear', '', ['2', '2'], { cmc: 2 }));
  assert.equal(dispatch(s, ap, { type: 'cast', iid: bear }), null);
  resolveAll(s);
  assert.equal(s.cards[bear].zone, 'graveyard');
  void Bear;
});
