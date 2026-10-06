// Tests for src/engine/ext/conds.ts (turn history conditions).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll, passUntil, dispatch, chars, Bear } from './helpers';

test('raid: "if you attacked this turn" and "if you cast it"', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 8);
  const roc = () => add(s, ap, def('Test Roc', '{2}', 'Creature — Bird', 'When Test Roc enters, if you attacked this turn, create a 3/4 white Bird creature token with flying.', ['3', '4']));
  cast(s, ap, roc());
  resolveAll(s);
  assert.equal(s.battlefield.filter((x) => chars(s, x).name === 'Bird').length, 0);
  const b = add(s, ap, Bear, 'battlefield');
  passUntil(s, () => s.prompt?.kind === 'declareAttackers');
  dispatch(s, ap, { type: 'answer', promptId: s.prompt!.id, choice: [{ iid: b, target: { kind: 'player', idx: op } }] });
  passUntil(s, () => s.step === 'main2');
  cast(s, ap, roc());
  resolveAll(s);
  assert.equal(s.battlefield.filter((x) => chars(s, x).name === 'Bird').length, 1);
});

test('morbid at end step; graveyard upkeep trigger', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 4);
  add(s, ap, def('Test Morbid', '{2}', 'Enchantment', 'At the beginning of your end step, if a creature died this turn, you gain 3 life.'), 'battlefield');
  const v = add(s, op, Bear, 'battlefield');
  cast(s, ap, add(s, ap, def('Test Kill', '{1}', 'Instant', 'Destroy target creature.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: v }] : undefined));
  const life = s.players[ap].life;
  passUntil(s, () => s.step === 'end' && s.stack.length > 0);
  resolveAll(s);
  assert.equal(s.players[ap].life, life + 3);
  add(s, op, def('Test Phoenix', '{2}', 'Creature — Phoenix', 'At the beginning of your upkeep, if Test Phoenix is in your graveyard, you gain 2 life.', ['2', '2']), 'graveyard');
  const olife = s.players[op].life;
  passUntil(s, () => s.active === op && s.step === 'upkeep' && s.stack.length > 0);
  resolveAll(s);
  assert.equal(s.players[op].life, olife + 2);
});

test('"if you cast it" is true only for cast permanents', () => {
  const { s, ap } = setup();
  lands(s, ap, 4);
  const mk = () => add(s, ap, def('Test Caster', '{1}', 'Creature — Elf', 'When Test Caster enters, if you cast it, you gain 3 life.', ['1', '1']));
  const life = s.players[ap].life;
  cast(s, ap, mk());
  resolveAll(s);
  assert.equal(s.players[ap].life, life + 3);
  const x = mk();
  s.cards[x].zone = 'graveyard'; s.players[ap].hand.splice(s.players[ap].hand.indexOf(x), 1); s.players[ap].graveyard.push(x);
  cast(s, ap, add(s, ap, def('Test Reanimate', '{1}', 'Sorcery', 'Return target creature card from your graveyard to the battlefield.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: x }] : undefined));
  assert.equal(s.cards[x].zone, 'battlefield');
  assert.equal(s.players[ap].life, life + 3);
});
