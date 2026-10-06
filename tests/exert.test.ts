// src/engine/ext/exert.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, def, passUntil, dispatch, resolveAll, Bear } from './helpers';

test('exert as it attacks: effect happens, and it skips the next untap', () => {
  const { s, ap, op } = setup();
  const c = add(s, ap, def('Test Crasher', '{2}{R}', 'Creature — Human Warrior', "You may exert this creature as it attacks. When you do, target creature can't block this turn.", ['2', '2']), 'battlefield');
  const bear = add(s, op, Bear, 'battlefield');
  passUntil(s, () => s.prompt?.kind === 'declareAttackers');
  assert.equal(dispatch(s, ap, { type: 'answer', promptId: s.prompt!.id, choice: [{ iid: c, target: { kind: 'player', idx: op } }] }), null);
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: bear }] : undefined));
  assert.ok((s.cards[c] as any).exertTurn === s.turn);
  const go = (turn: number) => { for (let k = 0; k < 400 && !(s.turn === turn && s.step === 'main1'); k++) { if (s.prompt?.kind === 'declareAttackers' || s.prompt?.kind === 'declareBlockers') dispatch(s, s.prompt.player, { type: 'answer', promptId: s.prompt.id, choice: [] }); else if (s.prompt?.data?.ctx === 'cleanup') dispatch(s, s.prompt.player, { type: 'answer', promptId: s.prompt.id, choice: s.prompt.cards!.slice(0, s.prompt.min) }); else passUntil(s, () => !!s.prompt || (s.turn === turn && s.step === 'main1')); } };
  go(3);
  assert.ok(s.cards[c].tapped, 'stayed tapped through the next untap step');
  go(5);
  assert.ok(!s.cards[c].tapped, 'untaps the turn after');
});
