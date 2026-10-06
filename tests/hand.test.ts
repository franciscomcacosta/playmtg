// Hand disruption shapes (src/engine/ext/hand.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll, dispatch, Bear, Forest } from './helpers';

const Bolt = def('Test Bolt', '{R}', 'Instant', 'Test Bolt deals 3 damage to any target.');
const target = (op: number) => (st: any) => (st.prompt?.kind === 'targets' ? st.prompt.targets.filter((t: any) => t.kind === 'player' && t.idx === op).slice(0, 1) : undefined);

test('three-sentence Thoughtseize: only nonland cards are offered', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 2);
  s.players[op].hand.length = 0;
  const f = add(s, op, Forest), b = add(s, op, Bolt);
  let offered: string[] = [];
  cast(s, ap, add(s, ap, def('Test Seize', '{B}', 'Sorcery', 'Target opponent reveals their hand. You choose a nonland card from it. That player discards that card.')));
  resolveAll(s, (st) => { if (st.prompt?.kind === 'chooseCards') { offered = st.prompt.cards!; return [b]; } return target(op)(st); });
  assert.deepEqual(offered, [b]);
  assert.equal(s.cards[b].zone, 'graveyard');
  assert.equal(s.cards[f].zone, 'hand');
});

test('look at their hand, choose two, put them on top of their library', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 2);
  s.players[op].hand.length = 0;
  const a = add(s, op, Bolt), b = add(s, op, Bear), c = add(s, op, Forest);
  cast(s, ap, add(s, ap, def('Test Hoodwink', '{1}', 'Sorcery', "Look at target player's hand and choose two cards from it. Put them on top of that player's library in any order.")));
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? [a, b] : target(op)(st)));
  assert.equal(s.cards[a].zone, 'library');
  assert.equal(s.cards[b].zone, 'library');
  assert.ok(s.players[op].library.slice(0, 2).includes(a) && s.players[op].library.slice(0, 2).includes(b));
  assert.equal(s.cards[c].zone, 'hand');
});

test('they reveal three of their choice, I pick one of those to discard', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 2);
  s.players[op].hand.length = 0;
  const h = [add(s, op, Bolt), add(s, op, Bear), add(s, op, Forest), add(s, op, Forest)];
  cast(s, ap, add(s, ap, def('Test Probe', '{1}', 'Sorcery', 'Target player reveals three cards from their hand and you choose one of them. That player discards that card.')));
  let stage = 0;
  resolveAll(s, (st) => {
    if (st.prompt?.kind !== 'chooseCards') return target(op)(st);
    stage++;
    if (stage === 1) { assert.equal(st.prompt.player, op, 'the opponent picks what to reveal'); return [h[1], h[2], h[3]]; }
    assert.equal(st.prompt.player, ap);
    assert.ok(!st.prompt.cards!.includes(h[0]), 'the hidden card is not offered');
    return [h[1]];
  });
  assert.equal(stage, 2);
  assert.equal(s.cards[h[1]].zone, 'graveyard');
  assert.equal(s.cards[h[0]].zone, 'hand');
});

test('reveal and discard all nonland cards', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 2);
  s.players[op].hand.length = 0;
  const f = add(s, op, Forest), b = add(s, op, Bolt), c = add(s, op, Bear);
  cast(s, ap, add(s, ap, def('Test Rip', '{1}', 'Sorcery', 'Target player reveals their hand and discards all nonland cards.')));
  resolveAll(s, target(op));
  assert.equal(s.cards[b].zone, 'graveyard');
  assert.equal(s.cards[c].zone, 'graveyard');
  assert.equal(s.cards[f].zone, 'hand');
});
