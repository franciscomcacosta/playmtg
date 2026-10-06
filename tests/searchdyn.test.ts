// src/engine/ext/search2.ts — dynamic mana value searches
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll, dispatch, Bear } from './helpers';

test("Green Sun's Zenith: X caps the mana value", () => {
  const { s, ap } = setup();
  const small = add(s, ap, def('Test Elf', '{G}', 'Creature — Elf', '', ['1', '1'], { colors: ['G'] }), 'library');
  const big = add(s, ap, def('Test Wurm', '{6}{G}', 'Creature — Wurm', '', ['6', '6'], { colors: ['G'] }), 'library');
  lands(s, ap, 3);
  cast(s, ap, add(s, ap, def('Test Zenith', '{X}{G}', 'Sorcery', 'Search your library for a green creature card with mana value X or less, put it onto the battlefield, then shuffle.')));
  let seen: string[] = [];
  resolveAll(s, (st) => (st.prompt?.kind === 'x' ? 2 : st.prompt?.kind === 'chooseCards' ? ((seen = st.prompt.cards!), [small]) : undefined));
  assert.ok(seen.includes(small) && !seen.includes(big));
  assert.equal(s.cards[small].zone, 'battlefield');
});

test('Birthing Pod: mana value equal to 1 plus the sacrificed creature', () => {
  const { s, ap } = setup();
  const b = add(s, ap, Bear, 'battlefield');
  const three = add(s, ap, def('Test Three', '{3}', 'Creature — Beast', '', ['3', '3']), 'library');
  add(s, ap, def('Test Four', '{4}', 'Creature — Beast', '', ['4', '4']), 'library');
  const pod = add(s, ap, def('Test Pod', '{3}', 'Artifact', "{1}, {T}, Sacrifice a creature: Search your library for a creature card with mana value equal to 1 plus the sacrificed creature's mana value, put that card onto the battlefield, then shuffle. Activate only as a sorcery."), 'battlefield');
  lands(s, ap, 1);
  assert.equal(dispatch(s, ap, { type: 'activate', iid: pod, ability: 0 }), null);
  let seen: string[] = [];
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' && /acrifice/.test(st.prompt.title) ? [b] : st.prompt?.kind === 'chooseCards' ? ((seen = st.prompt.cards!), [three]) : undefined));
  assert.deepEqual(seen, [three]);
  assert.equal(s.cards[three].zone, 'battlefield');
});
