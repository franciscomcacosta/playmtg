// src/engine/ext/gycast.ts: casting a targeted graveyard card, "exile it instead", per-extra-target cost.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll, Bear } from './helpers';

const Heal = def('Test Heal', '{3}{W}', 'Instant', 'You gain 5 life.');

test('free graveyard cast: resolves, then exiled instead of going back to the graveyard', () => {
  const { s, ap } = setup();
  lands(s, ap, 1);
  const heal = add(s, ap, Heal, 'graveyard');
  cast(s, ap, add(s, ap, def('Test Snap', '{U}', 'Sorcery', 'You may cast target instant or sorcery card with mana value 4 or less from your graveyard without paying its mana cost. If that spell would be put into your graveyard, exile it instead.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: heal }] : st.prompt?.kind === 'yesno' ? 'yes' : undefined));
  assert.equal(s.players[ap].life, 25);
  assert.equal(s.cards[heal].zone, 'exile');
});

test('paid graveyard cast pays the card\'s own cost', () => {
  const { s, ap } = setup();
  const L = lands(s, ap, 5);
  const heal = add(s, ap, Heal, 'graveyard');
  cast(s, ap, add(s, ap, def('Test Recall', '{U}', 'Sorcery', 'You may cast target instant or sorcery card from your graveyard. If that spell would be put into your graveyard, exile it instead.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: heal }] : st.prompt?.kind === 'yesno' ? 'yes' : undefined));
  assert.equal(s.players[ap].life, 25);
  assert.equal(L.filter((l) => s.cards[l].tapped).length, 5, '{U} + {3}{W}');
  assert.equal(s.cards[heal].zone, 'exile');
});

test('mana value cap: with only a 4-drop in the graveyard, the spell can\'t even be cast (no legal target)', async () => {
  const { dispatch } = await import('./helpers');
  const { s, ap } = setup();
  lands(s, ap, 1);
  add(s, ap, Heal, 'graveyard');
  const err = dispatch(s, ap, { type: 'cast', iid: add(s, ap, def('Test Snap 3', '{U}', 'Sorcery', 'You may cast target instant or sorcery card with mana value 3 or less from your graveyard without paying its mana cost.')) });
  assert.match(err ?? '', /no legal targets/i);
});

test('costs {1} more for each target beyond the first', () => {
  const { s, ap, op } = setup();
  const L = lands(s, ap, 4);
  const a = add(s, op, Bear, 'battlefield'), b = add(s, op, Bear, 'battlefield');
  cast(s, ap, add(s, ap, def('Test Fork', '{R}', 'Instant', 'This spell costs {1} more to cast for each target beyond the first.\nTest Fork deals 2 damage to each of up to three target creatures.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: a }, { kind: 'card', iid: b }] : undefined));
  assert.equal(L.filter((l) => s.cards[l].tapped).length, 2, '{R} + {1}');
});
