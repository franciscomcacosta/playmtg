// Harmonize: graveyard cast for the harmonize cost, optionally tapping a creature to cut generic mana by its power.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, resolveAll, dispatch, Forest } from './helpers';

const Song = def('Test Song', '{3}{G}', 'Sorcery', 'Draw two cards.\nHarmonize {4}{G}');
const Brute = def('Test Brute', '{2}{G}', 'Creature — Beast', '', ['3', '3']);

test('harmonize: tap a 3-power creature, {4}{G} costs {1}{G}; the spell is exiled', () => {
  const { s, ap } = setup();
  const L = lands(s, ap, 2);
  const song = add(s, ap, Song, 'graveyard');
  const brute = add(s, ap, Brute, 'battlefield');
  add(s, ap, Forest, 'library'); add(s, ap, Forest, 'library');
  const hand = s.players[ap].hand.length;
  assert.equal(dispatch(s, ap, { type: 'cast', iid: song, alt: 'flashback' } as any), null);
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' && st.prompt.cards!.includes(brute) ? [brute] : undefined));
  assert.equal(s.cards[brute].tapped, true, 'the creature was tapped');
  assert.equal(L.filter((l) => s.cards[l].tapped).length, 2, 'paid {1}{G}');
  assert.equal(s.players[ap].hand.length, hand + 2);
  assert.equal(s.cards[song].zone, 'exile');
});

test('harmonize: without a creature to tap you pay the full cost', () => {
  const { s, ap } = setup();
  lands(s, ap, 2);
  const song = add(s, ap, Song, 'graveyard');
  const err = dispatch(s, ap, { type: 'cast', iid: song, alt: 'flashback' } as any);
  // either refused up front or stuck at payment — it must not resolve for 2 mana
  if (!err) resolveAll(s, () => undefined);
  assert.notEqual(s.cards[song].zone, 'exile', 'could not afford {4}{G} with two lands');
});
