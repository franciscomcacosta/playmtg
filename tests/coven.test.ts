// src/engine/ext/coven.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll, chars, Bear, Forest } from './helpers';

const P = (n: number) => def(`Test P${n}`, '{1}', 'Creature — Human', '', [String(n), String(n)]);

test('coven: three or more creatures with different powers', async () => {
  const { evalCond } = await import('../src/engine/rules');
  const { parseCond } = await import('../src/engine/oracle');
  const { s, ap } = setup();
  const cond = parseCond('you control three or more creatures with different powers')!;
  add(s, ap, P(1), 'battlefield'); add(s, ap, P(2), 'battlefield'); add(s, ap, P(2), 'battlefield');
  assert.equal(evalCond(s, cond, ap), false, 'powers 1, 2, 2: only two different');
  add(s, ap, P(3), 'battlefield');
  assert.equal(evalCond(s, cond, ap), true);
});

test('threshold: +2/+2 and can\'t block with seven or more cards in the graveyard', () => {
  const { s, ap } = setup();
  const c = add(s, ap, def('Test Nomad', '{1}{G}', 'Creature — Human', "As long as there are seven or more cards in your graveyard, this creature gets +2/+2 and can't block.", ['1', '1']), 'battlefield');
  for (let i = 0; i < 6; i++) add(s, ap, Forest, 'graveyard');
  assert.equal(chars(s, c).power, 1);
  assert.ok(!chars(s, c).cantBlock);
  add(s, ap, Forest, 'graveyard');
  assert.equal(chars(s, c).power, 3);
  assert.ok(chars(s, c).cantBlock);
});

test('exile an instant from your graveyard; "if you do" only when one was exiled', () => {
  const run = (withInstant: boolean) => {
    const { s, ap } = setup();
    lands(s, ap, 1);
    const inst = withInstant ? add(s, ap, def('Test Inst', '{U}', 'Instant', ''), 'graveyard') : '';
    add(s, ap, Bear, 'graveyard');
    cast(s, ap, add(s, ap, def('Test Delve', '{1}', 'Sorcery', 'You may exile an instant or sorcery card from your graveyard. If you do, you gain 4 life.')));
    resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? [inst] : st.prompt?.kind === 'yesno' ? 'yes' : undefined));
    return { s, ap, inst };
  };
  const a = run(true);
  assert.equal(a.s.cards[a.inst].zone, 'exile');
  assert.equal(a.s.players[a.ap].life, 24);
  const b = run(false);
  assert.equal(b.s.players[b.ap].life, 20, 'nothing to exile: no life');
});
