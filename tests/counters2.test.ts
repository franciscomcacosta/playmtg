// src/engine/ext/counters2.ts: doubling counters, changing a spell's target, end-of-combat return.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll, passUntil, dispatch, Bear } from './helpers';

test('double the +1/+1 counters on target creature (adds counters, so Hardened Scales adds one)', () => {
  const { s, ap } = setup();
  lands(s, ap, 1);
  const bear = add(s, ap, Bear, 'battlefield');
  s.cards[bear].counters['+1/+1'] = 3;
  add(s, ap, def('Test Scales', '{G}', 'Enchantment', 'If one or more +1/+1 counters would be put on a creature you control, that many plus one +1/+1 counters are put on it instead.'), 'battlefield');
  cast(s, ap, add(s, ap, def('Test Double', '{G}', 'Instant', 'Double the number of +1/+1 counters on target creature.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: bear }] : undefined));
  assert.equal(s.cards[bear].counters['+1/+1'], 7, '3 + (3 + 1)');
});

test('change the target of target spell with a single target', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 2);
  lands(s, op, 1);
  const mine = add(s, ap, Bear, 'battlefield');
  const theirs = add(s, op, Bear, 'battlefield');
  // opponent bolts my bear; I redirect it to their bear
  s.priority = op;
  const bolt = add(s, op, def('Test Bolt', '{R}', 'Instant', 'Test Bolt deals 3 damage to target creature.'));
  assert.equal(dispatch(s, op, { type: 'cast', iid: bolt }), null);
  dispatch(s, op, { type: 'answer', promptId: s.prompt!.id, choice: [{ kind: 'card', iid: mine }] });
  const boltId = s.stack[s.stack.length - 1].id;
  s.priority = ap;
  cast(s, ap, add(s, ap, def('Test Deflect', '{U}', 'Instant', 'Change the target of target spell with a single target.')));
  resolveAll(s, (st) => {
    if (st.prompt?.kind === 'targets' && st.prompt.targets!.some((t: any) => t.kind === 'stack')) return [{ kind: 'stack', id: boltId }];
    if (st.prompt?.kind === 'targets') return [{ kind: 'card', iid: theirs }];
    return undefined;
  });
  assert.equal(s.cards[mine].zone, 'battlefield');
  assert.equal(s.cards[theirs]?.zone ?? 'graveyard', 'graveyard');
});

test('return that creature to its owner\'s hand at end of combat', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 1);
  const bear = add(s, ap, Bear, 'battlefield');
  cast(s, ap, add(s, ap, def('Test Blink', '{U}', 'Instant', "Target creature gets +1/+1 until end of turn. Return that creature to its owner's hand at end of combat.")));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: bear }] : undefined));
  assert.equal(s.cards[bear].zone, 'battlefield');
  passUntil(s, () => s.prompt?.kind === 'declareAttackers' || s.step === 'main2');
  if (s.prompt?.kind === 'declareAttackers') dispatch(s, ap, { type: 'answer', promptId: s.prompt.id, choice: [{ iid: bear, target: { kind: 'player', idx: op } }] });
  passUntil(s, () => s.step === 'main2');
  assert.equal(s.cards[bear].zone, 'hand');
});
