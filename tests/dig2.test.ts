// More dig wordings: historic picks, "put one of those back on top", exile from among them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll, Bear, Forest } from './helpers';

test('reveal a historic card from among them: artifacts and legendaries qualify, plain creatures do not', () => {
  const { s, ap } = setup();
  lands(s, ap, 1);
  const art = add(s, ap, def('Test Relic', '{2}', 'Artifact', ''), 'library');
  const bear = add(s, ap, Bear, 'library');
  const legend = add(s, ap, def('Test Legend', '{2}', 'Legendary Sorcery', 'You gain 1 life.'), 'library');
  let offered: string[] = [];
  cast(s, ap, add(s, ap, def('Test Seek', '{1}', 'Sorcery', 'Look at the top three cards of your library. You may reveal a historic card from among them and put it into your hand. Put the rest on the bottom of your library in a random order.')));
  resolveAll(s, (st) => { if (st.prompt?.kind === 'chooseCards') { offered = st.prompt.cards!; return [legend]; } return undefined; });
  assert.ok(offered.includes(art) && offered.includes(legend) && !offered.includes(bear));
  assert.equal(s.cards[legend].zone, 'hand');
});

test('put one of those cards back on top; the rest into the graveyard', () => {
  const { s, ap } = setup();
  lands(s, ap, 1);
  const a = add(s, ap, Forest, 'library'), b = add(s, ap, Bear, 'library'), c = add(s, ap, Forest, 'library');
  cast(s, ap, add(s, ap, def('Test Grind', '{1}', 'Sorcery', 'Look at the top three cards of your library. You may put one of those cards back on top of your library. Put the rest into your graveyard.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? [b] : undefined));
  assert.equal(s.players[ap].library[0], b);
  assert.equal(s.cards[a].zone, 'graveyard');
  assert.equal(s.cards[c].zone, 'graveyard');
});

test('exile a creature card from among them', () => {
  const { s, ap } = setup();
  lands(s, ap, 1);
  const bear = add(s, ap, Bear, 'library');
  add(s, ap, Forest, 'library');
  cast(s, ap, add(s, ap, def('Test Lift', '{1}', 'Sorcery', 'Look at the top two cards of your library. You may exile a creature card from among them. Put the rest on the bottom of your library in a random order.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? [bear] : undefined));
  assert.equal(s.cards[bear].zone, 'exile');
});
