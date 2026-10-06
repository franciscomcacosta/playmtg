// src/engine/ext/evidence.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll } from './helpers';
const Bear = def('Test Bear', '{1}{G}', 'Creature — Bear', '', ['2', '2'], { cmc: 2 });

test('collect evidence: exile total MV 3+, then the bonus applies', () => {
  const { s, ap } = setup();
  lands(s, ap, 2);
  const g1 = add(s, ap, Bear, 'graveyard'), g2 = add(s, ap, Bear, 'graveyard');
  const hand = s.players[ap].hand.length;
  cast(s, ap, add(s, ap, def('Test Sample', '{1}{U}', 'Sorcery', 'As an additional cost to cast this spell, you may collect evidence 3.\nDraw a card. If evidence was collected, draw two cards instead.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? [g1, g2] : undefined));
  assert.equal(s.cards[g1].zone, 'exile');
  assert.equal(s.players[ap].hand.length, hand + 2);
});

test('collect evidence skipped: normal effect', () => {
  const { s, ap } = setup();
  lands(s, ap, 2);
  const g1 = add(s, ap, Bear, 'graveyard'), g2 = add(s, ap, Bear, 'graveyard');
  const hand = s.players[ap].hand.length;
  cast(s, ap, add(s, ap, def('Test Sample', '{1}{U}', 'Sorcery', 'As an additional cost to cast this spell, you may collect evidence 3.\nDraw a card. If evidence was collected, draw two cards instead.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? [] : undefined));
  assert.equal(s.cards[g1].zone, 'graveyard');
  assert.equal(s.players[ap].hand.length, hand + 1);
  void g2;
});

test('blight as an optional additional cost: "it deals 4 damage instead if this spell\'s additional cost was paid"', () => {
  for (const pay of [false, true]) {
    const { s, ap, op } = setup();
    lands(s, ap, 2);
    const mine = add(s, ap, Bear, 'battlefield');
    cast(s, ap, add(s, ap, def('Test Strike', '{1}{R}', 'Instant', "As an additional cost to cast this spell, you may blight 1.\nTest Strike deals 2 damage to target player. It deals 4 damage to that player instead if this spell's additional cost was paid.")));
    resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? (pay ? [mine] : []) : st.prompt?.kind === 'targets' ? [{ kind: 'player', idx: op }] : undefined));
    assert.equal(s.players[op].life, pay ? 16 : 18);
    assert.equal(s.cards[mine].counters['-1/-1'] ?? 0, pay ? 1 : 0);
  }
});

test('"choose one; if the additional cost was paid, choose both" asks for the cost first', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 3);
  const mine = add(s, ap, Bear, 'battlefield');
  cast(s, ap, add(s, ap, def('Test Pyrrhic', '{2}{R}', 'Instant', "As an additional cost to cast this spell, you may blight 2.\nChoose one. If this spell's additional cost was paid, choose both instead.\n• Target player loses 1 life.\n• Target player loses 2 life.")));
  let maxSeen = 0;
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? [mine] : st.prompt?.kind === 'mode' ? ((maxSeen = st.prompt.max ?? 0), ['0', '1']) : st.prompt?.kind === 'targets' ? [{ kind: 'player', idx: op }] : undefined));
  assert.equal(maxSeen, 2);
  assert.equal(s.players[op].life, 17);
});
