// src/engine/ext/staples2.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, dispatch, resolveAll, Bear } from './helpers';

test('Fatal Push: only mana value 2 or less (4 with revolt)', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 2);
  const three = add(s, op, def('Test Three', '{3}', 'Creature — Ogre', '', ['3', '3'], { cmc: 3 }), 'battlefield');
  const push = def('Test Push', '{B}', 'Instant', 'Destroy target creature if it has mana value 2 or less.\nRevolt — Destroy that creature if it has mana value 4 or less instead if a permanent you controlled left the battlefield this turn.');
  cast(s, ap, add(s, ap, push));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: three }] : undefined));
  assert.equal(s.cards[three].zone, 'battlefield');
  // revolt: a permanent of ours leaves
  const mine = add(s, ap, Bear, 'battlefield');
  cast(s, ap, add(s, ap, def('Test Sac', '', 'Instant', 'Sacrifice a creature.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? [mine] : undefined));
  cast(s, ap, add(s, ap, push));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: three }] : undefined));
  assert.equal(s.cards[three].zone, 'graveyard');
});

test('Cut Down: total power and toughness 5 or less', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 1);
  const big = add(s, op, def('Test Big', '{3}', 'Creature — Ogre', '', ['3', '3']), 'battlefield');
  const b = add(s, op, Bear, 'battlefield');
  const sp = add(s, ap, def('Test Cut', '{B}', 'Instant', 'Destroy target creature with total power and toughness 5 or less.'));
  assert.equal(dispatch(s, ap, { type: 'cast', iid: sp }), null);
  assert.deepEqual(s.prompt?.targets?.map((t: any) => t.iid), [b]);
  void big;
});

test("chosen type: Herald's Horn discount and Vanquisher's Banner draw", () => {
  const { s, ap } = setup();
  const horn = add(s, ap, def('Test Horn', '{3}', 'Artifact', 'As this artifact enters, choose a creature type.\nCreature spells you cast of the chosen type cost {1} less to cast.'), 'battlefield');
  const banner = add(s, ap, def('Test Banner', '{5}', 'Artifact', 'As this artifact enters, choose a creature type.\nWhenever you cast a creature spell of the chosen type, draw a card.'), 'battlefield');
  (s.cards[horn] as any).chosenType = 'elf';
  (s.cards[banner] as any).chosenType = 'elf';
  lands(s, ap, 1);
  const elf = add(s, ap, def('Test Elf', '{1}{G}', 'Creature — Elf', '', ['2', '2']));
  const hand = s.players[ap].hand.length;
  assert.equal(dispatch(s, ap, { type: 'cast', iid: elf }), null);
  resolveAll(s);
  assert.equal(s.cards[elf].zone, 'battlefield');
  assert.equal(s.players[ap].hand.length, hand - 1 + 1);
});
