// src/engine/ext/batch8.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, resolveAll, dispatch } from './helpers';

const Bolt = def('Test Shock', '{R}', 'Instant', 'Test Shock deals 2 damage to any target.');
const Scepter = def('Test Scepter', '{2}', 'Artifact', 'Imprint — When this artifact enters, you may exile an instant card with mana value 2 or less from your hand.\n{2}, {T}: You may copy the exiled card. If you do, you may cast the copy without paying its mana cost.');

test('Isochron Scepter: imprint and cast copies', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 6);
  const bolt = add(s, ap, Bolt);
  const sc = add(s, ap, Scepter);
  dispatch(s, ap, { type: 'cast', iid: sc });
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? [bolt] : undefined));
  assert.equal(s.cards[bolt].zone, 'exile');
  const before = Object.keys(s.cards).length;
  for (let k = 0; k < 2; k++) {
    s.cards[sc].tapped = false;
    assert.equal(dispatch(s, ap, { type: 'activate', iid: sc, ability: 0 }), null);
    resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'player', idx: op }] : undefined));
  }
  assert.equal(s.players[op].life, 16);
  assert.equal(s.cards[bolt].zone, 'exile');
  assert.equal(Object.keys(s.cards).length, before, 'copies are gone');
});

test('Telling Time: hand / top / bottom', () => {
  const { s, ap } = setup();
  lands(s, ap, 2);
  const L = s.players[ap].library;
  const [a, b, c] = L.slice(0, 3);
  dispatch(s, ap, { type: 'cast', iid: add(s, ap, def('Test Time', '{1}{U}', 'Instant', 'Look at the top three cards of your library. Put one of those cards into your hand, one on top of your library, and one on the bottom of your library.')) });
  let k = 0;
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? [[c, a][k++]] : undefined));
  assert.equal(s.cards[c].zone, 'hand');
  assert.equal(L[0], a);
  assert.equal(L[L.length - 1], b);
});

test('Winota-style dig: tapped and attacking, gains indestructible', () => {
  const { s, ap } = setup();
  lands(s, ap, 2);
  const h = add(s, ap, def('Test Human', '{1}', 'Creature — Human Soldier', '', ['2', '2']), 'library');
  const L = s.players[ap].library; L.splice(L.indexOf(h), 1); L.unshift(h);
  s.combat = { attackers: [], declared: true, blocksDeclared: false, firstStrike: false } as any;
  dispatch(s, ap, { type: 'cast', iid: add(s, ap, def('Test Call', '{1}', 'Instant', 'Look at the top six cards of your library. You may put a Human creature card from among them onto the battlefield tapped and attacking. It gains indestructible until end of turn. Put the rest of the cards on the bottom of your library in a random order.')) });
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? [h] : undefined));
  assert.equal(s.cards[h].zone, 'battlefield');
  assert.ok(s.cards[h].tapped);
  assert.ok(s.combat!.attackers.some((x) => x.iid === h));
});
