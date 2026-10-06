// src/engine/ext/misc2.ts: goad, phasing, extra block, controller discard, draw per counter, no max hand size.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll, passUntil, dispatch, Bear, Forest } from './helpers';

const tgt = (iid: string) => (st: any) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid }] : undefined);

test('goad: the goaded creature must attack on its controller\'s next turn', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 1);
  const theirs = add(s, op, Bear, 'battlefield');
  cast(s, ap, add(s, ap, def('Test Goad', '{R}', 'Sorcery', 'Goad target creature.')));
  resolveAll(s, tgt(theirs));
  passUntil(s, () => s.active === op && s.prompt?.kind === 'declareAttackers', 400);
  assert.match(dispatch(s, op, { type: 'answer', promptId: s.prompt!.id, choice: [] }) ?? '', /attacks each combat if able/);
});

test('phase out: gone until its controller\'s next untap step', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 1);
  const bear = add(s, ap, Bear, 'battlefield');
  cast(s, ap, add(s, ap, def('Test Fade', '{U}', 'Instant', 'Target creature phases out.')));
  resolveAll(s, tgt(bear));
  assert.equal(s.cards[bear].phasedOut, true);
  passUntil(s, () => s.active === op);
  assert.equal(s.cards[bear].phasedOut, true, 'still out on the opponent\'s turn');
  passUntil(s, () => s.active === ap && s.step !== 'untap', 400);
  assert.equal(s.cards[bear].phasedOut, false);
});

test('its controller discards a card', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 2);
  const bear = add(s, op, Bear, 'battlefield');
  s.players[op].hand.length = 0;
  const h = add(s, op, Forest);
  cast(s, ap, add(s, ap, def('Test Ruin', '{1}{B}', 'Sorcery', 'Destroy target creature. Its controller discards a card.')));
  resolveAll(s, tgt(bear));
  assert.equal(s.cards[h].zone, 'graveyard');
});

test('draw a card for each +1/+1 counter on target creature', () => {
  const { s, ap } = setup();
  lands(s, ap, 1);
  const bear = add(s, ap, Bear, 'battlefield');
  s.cards[bear].counters['+1/+1'] = 2;
  for (let i = 0; i < 3; i++) add(s, ap, Forest, 'library');
  const hand = s.players[ap].hand.length;
  cast(s, ap, add(s, ap, def('Test Harvest', '{G}', 'Sorcery', 'Draw a card for each +1/+1 counter on target creature.')));
  resolveAll(s, tgt(bear));
  assert.equal(s.players[ap].hand.length, hand + 2);
});

test('can block an additional creature this turn', () => {
  const { s, ap, op } = setup();
  lands(s, op, 1);
  const a1 = add(s, ap, Bear, 'battlefield'), a2 = add(s, ap, Bear, 'battlefield');
  const wall = add(s, op, def('Test Wall', '{1}', 'Creature — Wall', '', ['0', '5']), 'battlefield');
  passUntil(s, () => s.prompt?.kind === 'declareAttackers');
  dispatch(s, ap, { type: 'answer', promptId: s.prompt!.id, choice: [a1, a2].map((iid) => ({ iid, target: { kind: 'player', idx: op } })) });
  // give the wall the extra block during the attack, then block both
  s.cards[wall] && ((s.cards[wall] as any).extraBlockTurn = s.turn);
  passUntil(s, () => s.prompt?.kind === 'declareBlockers');
  assert.equal(dispatch(s, op, { type: 'answer', promptId: s.prompt!.id, choice: [{ blocker: wall, attacker: a1 }, { blocker: wall, attacker: a2 }] }), null);
});

test('no maximum hand size for the rest of the game', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 1);
  cast(s, ap, add(s, ap, def('Test Reliquary', '{1}', 'Sorcery', 'You have no maximum hand size for the rest of the game.')));
  resolveAll(s);
  for (let i = 0; i < 10; i++) add(s, ap, Forest);
  passUntil(s, () => s.active === op, 400);
  assert.ok(s.players[ap].hand.length > 7, 'no discard to seven');
});
