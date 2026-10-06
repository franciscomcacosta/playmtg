// Abilities as stack targets and two mana-ability shapes (src/engine/ext/stackmana.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll, dispatch, Bear } from './helpers';

test('counter target activated ability: the ability is removed, spells are never offered', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 2);
  lands(s, op, 2);
  const pinger = add(s, op, def('Test Pinger', '{1}', 'Creature — Wizard', '{T}: Test Pinger deals 1 damage to any target.', ['1', '1']), 'battlefield');
  const bind = add(s, ap, def('Test Bind', '{1}', 'Instant', 'Counter target activated ability.'));
  const life = s.players[ap].life;
  // opponent activates the pinger at our face; we respond with Bind
  s.priority = op;
  assert.equal(dispatch(s, op, { type: 'activate', iid: pinger, ability: 0 }), null);
  if (s.prompt?.kind === 'targets') dispatch(s, op, { type: 'answer', promptId: s.prompt.id, choice: [{ kind: 'player', idx: ap }] });
  assert.equal(s.stack.length, 1);
  const abilityId = s.stack[0].id;
  s.priority = ap;
  cast(s, ap, bind);
  assert.equal(s.prompt?.kind, 'targets');
  assert.deepEqual(s.prompt!.targets, [{ kind: 'stack', id: abilityId }]);
  dispatch(s, ap, { type: 'answer', promptId: s.prompt!.id, choice: [{ kind: 'stack', id: abilityId }] });
  resolveAll(s);
  assert.equal(s.players[ap].life, life, 'the ping was countered');
});

test('Gate: add the printed color or the chosen color', () => {
  const { s, ap } = setup();
  const gate = add(s, ap, def('Test Gate', '', 'Land — Gate', 'As this land enters, choose a color other than black.\n{T}: Add {B} or one mana of the chosen color.'), 'battlefield');
  (s.cards[gate] as any).chosenColor = 'G';
  assert.equal(dispatch(s, ap, { type: 'tapForMana', iid: gate } as any) ?? null, null);
  if (s.prompt?.kind === 'color') {
    assert.deepEqual(s.prompt.options!.map((o) => o.id).sort(), ['B', 'G']);
    dispatch(s, ap, { type: 'answer', promptId: s.prompt.id, choice: 'G' });
  }
  assert.equal(s.players[ap].pool.G, 1);
});

test('add an amount of {G} equal to its power', () => {
  const { s, ap } = setup();
  const elf = add(s, ap, def('Test Grower', '{2}{G}', 'Creature — Elf', "{T}: Add an amount of {G} equal to Test Grower's power.", ['3', '3']), 'battlefield');
  assert.equal(dispatch(s, ap, { type: 'tapForMana', iid: elf } as any) ?? null, null);
  assert.equal(s.players[ap].pool.G, 3);
});
