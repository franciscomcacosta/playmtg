// src/engine/ext/emblem.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll, chars, Bear } from './helpers';

test('emblem statics and triggers work from the command zone', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 4);
  const b = add(s, ap, Bear, 'battlefield');
  cast(s, ap, add(s, ap, def('Test Ult', '{1}', 'Sorcery', 'You get an emblem with "Creatures you control get +2/+2."')));
  resolveAll(s);
  assert.equal(chars(s, b).power, 4);
  cast(s, ap, add(s, ap, def('Test Ult2', '{1}', 'Sorcery', 'You get an emblem with "Whenever you cast a spell, this emblem deals 5 damage to any target."')));
  resolveAll(s);
  cast(s, ap, add(s, ap, def('Test Spell', '{1}', 'Sorcery', 'Draw a card.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'player', idx: op }] : undefined));
  assert.equal(s.players[op].life, 15);
  const em = (s.players[ap] as any).command.filter((i: string) => (s.cards[i] as any).emblem);
  assert.equal(em.length, 2);
});
