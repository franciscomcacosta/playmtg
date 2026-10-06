// src/engine/ext/search2.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll, Forest, Bear } from './helpers';

test('Cultivate: one land to the battlefield tapped, the other to hand', () => {
  const { s, ap } = setup();
  lands(s, ap, 3);
  const a = add(s, ap, Forest, 'library'), b = add(s, ap, Forest, 'library');
  cast(s, ap, add(s, ap, def('Test Cultivate', '{2}{G}', 'Sorcery', 'Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.')));
  let k = 0;
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? (k++ === 0 ? [a, b] : [b]) : undefined));
  assert.equal(s.cards[b].zone, 'battlefield');
  assert.ok(s.cards[b].tapped);
  assert.equal(s.cards[a].zone, 'hand');
});

test('Entomb: a card into your graveyard', () => {
  const { s, ap } = setup();
  lands(s, ap, 1);
  const x = add(s, ap, Bear, 'library');
  cast(s, ap, add(s, ap, def('Test Entomb', '{B}', 'Instant', 'Search your library for a card, put that card into your graveyard, then shuffle.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? [x] : undefined));
  assert.equal(s.cards[x].zone, 'graveyard');
});

test('qualified filter is enforced: mana value 6 or greater', () => {
  const { s, ap } = setup();
  lands(s, ap, 1);
  const big = add(s, ap, def('Test Big', '{6}', 'Creature — Giant', '', ['6', '6'], { cmc: 6 }), 'library');
  add(s, ap, def('Test Small', '{1}', 'Creature — Elf', '', ['1', '1'], { cmc: 1 }), 'library');
  cast(s, ap, add(s, ap, def('Test Empath', '{G}', 'Sorcery', 'Search your library for a creature card with mana value 6 or greater, reveal it, put it into your hand, then shuffle.')));
  let offered: string[] = [];
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? ((offered = st.prompt.cards!), [big]) : undefined));
  assert.deepEqual(offered, [big]);
  assert.equal(s.cards[big].zone, 'hand');
});
