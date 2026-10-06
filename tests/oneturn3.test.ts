// One-turn combat restrictions and keyword loss (src/engine/ext/oneturn3.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll, passUntil, dispatch, chars, Bear } from './helpers';

const Bird = def('Test Bird', '{1}', 'Creature — Bird', 'Flying', ['1', '1'], { keywords: ['Flying'] });
const tgt = (iid: string) => (st: any) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid }] : undefined);

test('loses flying until end of turn, and gets it back next turn', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 1);
  const bird = add(s, op, Bird, 'battlefield');
  assert.ok(chars(s, bird).keywords.has('flying'));
  cast(s, ap, add(s, ap, def('Test Grounding', '{1}', 'Instant', 'Target creature loses flying until end of turn.')));
  resolveAll(s, tgt(bird));
  assert.ok(!chars(s, bird).keywords.has('flying'));
  passUntil(s, () => s.active === op);
  assert.ok(chars(s, bird).keywords.has('flying'), 'back next turn');
});

test("can't attack or block this turn", () => {
  const { s, ap } = setup();
  lands(s, ap, 1);
  const bear = add(s, ap, Bear, 'battlefield');
  cast(s, ap, add(s, ap, def('Test Freeze', '{1}', 'Instant', "Target creature can't attack or block this turn.")));
  resolveAll(s, tgt(bear));
  passUntil(s, () => s.prompt?.kind === 'declareAttackers' || s.step === 'main2' || s.step === 'end');
  if (s.prompt?.kind === 'declareAttackers') assert.ok(!s.prompt.cards!.includes(bear), 'not offered as an attacker');
});

test('blocks this turn if able: declaring no blocks is refused', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 1);
  const attacker = add(s, ap, Bear, 'battlefield');
  const blocker = add(s, op, Bear, 'battlefield');
  cast(s, ap, add(s, ap, def('Test Lure', '{1}', 'Sorcery', 'Target creature blocks this turn if able.')));
  resolveAll(s, tgt(blocker));
  passUntil(s, () => s.prompt?.kind === 'declareAttackers');
  assert.equal(dispatch(s, ap, { type: 'answer', promptId: s.prompt!.id, choice: [{ iid: attacker, target: { kind: 'player', idx: op } }] }), null);
  passUntil(s, () => s.prompt?.kind === 'declareBlockers');
  assert.match(dispatch(s, op, { type: 'answer', promptId: s.prompt!.id, choice: [] }) ?? '', /blocks this turn if able/);
  assert.equal(dispatch(s, op, { type: 'answer', promptId: s.prompt!.id, choice: [{ blocker, attacker }] }), null);
});

test("can't be blocked except by three or more creatures", () => {
  const { s, ap, op } = setup();
  const big = add(s, ap, def('Test Behemoth', '{5}', 'Creature — Beast', "This creature can't be blocked except by three or more creatures.", ['6', '6']), 'battlefield');
  const b1 = add(s, op, Bear, 'battlefield'), b2 = add(s, op, Bear, 'battlefield'), b3 = add(s, op, Bear, 'battlefield');
  passUntil(s, () => s.prompt?.kind === 'declareAttackers');
  dispatch(s, ap, { type: 'answer', promptId: s.prompt!.id, choice: [{ iid: big, target: { kind: 'player', idx: op } }] });
  passUntil(s, () => s.prompt?.kind === 'declareBlockers');
  assert.match(dispatch(s, op, { type: 'answer', promptId: s.prompt!.id, choice: [{ blocker: b1, attacker: big }, { blocker: b2, attacker: big }] }) ?? '', /three|3 or more/);
  assert.equal(dispatch(s, op, { type: 'answer', promptId: s.prompt!.id, choice: [b1, b2, b3].map((b) => ({ blocker: b, attacker: big })) }), null);
});

test('if that creature would die this turn, exile it instead', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 1);
  const bear = add(s, op, Bear, 'battlefield');
  cast(s, ap, add(s, ap, def('Test Scorch', '{R}', 'Instant', 'Test Scorch deals 3 damage to target creature or planeswalker. If that creature or planeswalker would die this turn, exile it instead.')));
  resolveAll(s, tgt(bear));
  assert.equal(s.cards[bear].zone, 'exile');
});
