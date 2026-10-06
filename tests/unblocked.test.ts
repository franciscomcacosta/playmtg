// "You may have ~ assign its combat damage as though it weren't blocked." — asked during combat damage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, def, passUntil, dispatch } from './helpers';

const Rhox = def('Test Rhox', '{4}{G}', 'Creature — Rhino', 'You may have this creature assign its combat damage as though it weren\'t blocked.', ['5', '5']);
const Wall = def('Test Wall', '{2}', 'Creature — Wall', '', ['0', '6']);

function fight(choice: 'yes' | 'no') {
  const { s, ap, op } = setup();
  const r = add(s, ap, Rhox, 'battlefield');
  const w = add(s, op, Wall, 'battlefield');
  passUntil(s, () => s.prompt?.kind === 'declareAttackers');
  assert.equal(dispatch(s, ap, { type: 'answer', promptId: s.prompt!.id, choice: [{ iid: r, target: { kind: 'player', idx: op } }] }), null);
  passUntil(s, () => s.prompt?.kind === 'declareBlockers');
  assert.equal(dispatch(s, op, { type: 'answer', promptId: s.prompt!.id, choice: [{ blocker: w, attacker: r }] }), null);
  let asked = false;
  for (let i = 0; i < 100 && s.step !== 'endCombat' && s.step !== 'main2'; i++) {
    if (s.prompt) { asked = true; assert.equal(s.prompt.player, ap); assert.equal(dispatch(s, ap, { type: 'answer', promptId: s.prompt.id, choice }), null); continue; }
    dispatch(s, s.priority, { type: 'pass' });
  }
  assert.ok(asked, 'the attacker\'s controller was asked');
  return { s, ap, op, r, w };
}

test('yes: all damage to the player, none to the blocker', () => {
  const { s, op, w } = fight('yes');
  assert.equal(s.players[op].life, 15);
  assert.equal(s.cards[w].damage, 0);
});

test('no: damage to the blocker as usual', () => {
  const { s, op, w } = fight('no');
  assert.equal(s.players[op].life, 20);
  assert.equal(s.cards[w].damage, 5);
});
