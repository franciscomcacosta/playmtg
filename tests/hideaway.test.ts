// src/engine/ext/hideaway.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, dispatch, resolveAll } from './helpers';

const Isle = def('Test Isle', '', 'Land', "Hideaway 4\nThis land enters tapped.\n{T}: Add {U}.\n{U}, {T}: You may play the exiled card without paying its mana cost if a library has twenty or fewer cards in it.");

test('hideaway: exile one face down; play it free when the condition holds', () => {
  const { s, ap, op } = setup();
  const L = s.players[ap].library;
  const bolt = add(s, ap, def('Test Bolt', '{R}', 'Instant', 'Test Bolt deals 3 damage to any target.'), 'library');
  L.splice(L.indexOf(bolt), 1); L.unshift(bolt);
  const isle = add(s, ap, Isle, 'hand');
  assert.equal(dispatch(s, ap, { type: 'playLand', iid: isle }), null);
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? [bolt] : undefined));
  assert.equal(s.cards[bolt].zone, 'exile');
  assert.ok((s.cards[bolt] as any).faceDown);
  s.cards[isle].tapped = false;
  lands(s, ap, 1);
  // condition false: library is big
  s.players[op].library.splice(30);
  s.players[ap].library.splice(30);
  dispatch(s, ap, { type: 'activate', iid: isle, ability: 1 });
  resolveAll(s);
  assert.equal(s.cards[bolt].zone, 'exile');
  // condition true
  s.players[op].library.splice(15);
  s.cards[isle].tapped = false;
  for (const b of s.battlefield) if (s.cards[b].controller === ap) s.cards[b].tapped = false;
  assert.equal(dispatch(s, ap, { type: 'activate', iid: isle, ability: 1 }), null);
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'player', idx: op }] : undefined));
  assert.equal(s.players[op].life, 17);
});
