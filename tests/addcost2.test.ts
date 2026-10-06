// "As an additional cost to cast this spell, pay X life."
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll, Bear } from './helpers';

test('Toxic Deluge: choose X, pay X life, creatures get -X/-X', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 3);
  const b = add(s, op, Bear, 'battlefield');
  cast(s, ap, add(s, ap, def('Test Deluge', '{2}{B}', 'Sorcery', 'As an additional cost to cast this spell, pay X life.\nAll creatures get -X/-X until end of turn.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'x' ? 2 : undefined));
  assert.equal(s.players[ap].life, 18);
  assert.equal(s.cards[b].zone, 'graveyard');
});

test('additional cost: return a land you control to its owner\'s hand', () => {
  const { s, ap } = setup();
  const ls = lands(s, ap, 3) as any;
  const hand = s.players[ap].hand.length;
  cast(s, ap, add(s, ap, def('Test Bounce', '{1}', 'Instant', "As an additional cost to cast this spell, return a land you control to its owner's hand.\nDraw two cards.")));
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? [st.prompt.cards![0]] : undefined));
  assert.equal(s.players[ap].hand.length, hand + 3);
  void ls;
});

for (const pick of ['yes', 'no']) test(`additional cost "sacrifice a creature or pay {2}" — ${pick === 'yes' ? 'sacrifice' : 'pay'}`, () => {
  const { s, ap, op } = setup();
  lands(s, ap, 3);
  const b = add(s, ap, Bear, 'battlefield');
  cast(s, ap, add(s, ap, def('Test Payment', '{B}', 'Instant', 'As an additional cost to cast this spell, sacrifice a creature or pay {2}.\nTarget player loses 2 life.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'yesno' ? pick : st.prompt?.kind === 'chooseCards' ? [b] : st.prompt?.kind === 'targets' ? [{ kind: 'player', idx: op }] : undefined));
  assert.equal(s.players[op].life, 18);
  assert.equal(s.cards[b].zone, pick === 'yes' ? 'graveyard' : 'battlefield');
  assert.equal(s.battlefield.filter((x) => s.cards[x].controller === ap && s.cards[x].tapped).length, pick === 'yes' ? 1 : 3);
});
