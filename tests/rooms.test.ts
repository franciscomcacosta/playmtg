import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll, dispatch, chars, Bear } from './helpers';

test('rooms: cast one door, unlock the other later; unlock triggers', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 10);
  const d = def('Test Hall // Test Crypt', '{1} // {2}', 'Enchantment — Room // Enchantment — Room', '', undefined, {
    layout: 'split',
    faces: [
      { name: 'Test Hall', manaCost: '{1}', typeLine: 'Enchantment — Room', oracle: 'When you unlock this door, you gain 2 life.' },
      { name: 'Test Crypt', manaCost: '{2}', typeLine: 'Enchantment — Room', oracle: 'Creatures you control get +1/+0.' },
    ],
  } as any);
  const r = add(s, ap, d);
  const b = add(s, ap, Bear, 'battlefield');
  const life = s.players[ap].life;
  cast(s, ap, r, { face: 0 });
  resolveAll(s);
  assert.equal(s.players[ap].life, life + 2);
  assert.equal(chars(s, b).power, 2);
  const idx = chars(s, r).pc.activated.findIndex((a: any) => a.extSpecial === 'unlock');
  assert.ok(idx >= 0);
  assert.equal(dispatch(s, ap, { type: 'activate', iid: r, ability: idx }), null);
  assert.equal(chars(s, b).power, 3);
  void op;
});
