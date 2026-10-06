// src/engine/ext/combat2.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll, passUntil, dispatch, chars, Bear } from './helpers';

const tgt = (iid: string) => (st: any) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid }] : undefined);

test('must be blocked this turn if able', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 1);
  const lure = add(s, ap, Bear, 'battlefield');
  const blocker = add(s, op, Bear, 'battlefield');
  cast(s, ap, add(s, ap, def('Test Lure', '{G}', 'Instant', 'Target creature must be blocked this turn if able.')));
  resolveAll(s, tgt(lure));
  passUntil(s, () => s.prompt?.kind === 'declareAttackers');
  dispatch(s, ap, { type: 'answer', promptId: s.prompt!.id, choice: [{ iid: lure, target: { kind: 'player', idx: op } }] });
  passUntil(s, () => s.prompt?.kind === 'declareBlockers');
  assert.match(dispatch(s, op, { type: 'answer', promptId: s.prompt!.id, choice: [] }) ?? '', /must be blocked/);
  assert.equal(dispatch(s, op, { type: 'answer', promptId: s.prompt!.id, choice: [{ blocker, attacker: lure }] }), null);
});

const Commons = def('Test Commons', '', 'Land', 'This land enters tapped.\nWhen this land enters, sacrifice it unless you pay {1}.\n{T}: Add {C}.');
test('sacrifice it unless you pay {1}: no other mana → sacrificed', () => {
  const { s, ap } = setup();
  const land = add(s, ap, Commons);
  assert.equal(dispatch(s, ap, { type: 'playLand', iid: land }), null);
  resolveAll(s);
  assert.equal(s.cards[land].zone, 'graveyard');
});
test('sacrifice it unless you pay {1}: paid with another land → it stays', () => {
  const { s, ap } = setup();
  const other = lands(s, ap, 1)[0];
  const land = add(s, ap, Commons);
  assert.equal(dispatch(s, ap, { type: 'playLand', iid: land }), null);
  resolveAll(s, (st) => (st.prompt?.kind === 'yesno' ? 'yes' : undefined));
  assert.equal(s.cards[land].zone, 'battlefield');
  assert.equal(s.cards[other].tapped, true);
});

test('Clockwork: remove a +1/+1 counter at end of combat', () => {
  const { s, ap, op } = setup();
  const beetle = add(s, ap, def('Test Beetle', '{1}', 'Artifact Creature — Insect', 'Whenever this creature attacks or blocks, remove a +1/+1 counter from it at end of combat.', ['0', '0']), 'battlefield');
  s.cards[beetle].counters['+1/+1'] = 2;
  passUntil(s, () => s.prompt?.kind === 'declareAttackers');
  dispatch(s, ap, { type: 'answer', promptId: s.prompt!.id, choice: [{ iid: beetle, target: { kind: 'player', idx: op } }] });
  passUntil(s, () => s.step === 'main2');
  assert.equal(s.cards[beetle].counters['+1/+1'], 1);
  assert.equal(s.players[op].life, 18, 'it dealt damage at full size first');
});

test('put any number of creature cards from your graveyard on top of your library', () => {
  const { s, ap } = setup();
  lands(s, ap, 1);
  const a = add(s, ap, Bear, 'graveyard'), b = add(s, ap, Bear, 'graveyard');
  cast(s, ap, add(s, ap, def('Test Harvest', '{G}', 'Instant', 'Put any number of target creature cards from your graveyard on top of your library.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: a }, { kind: 'card', iid: b }] : undefined));
  assert.ok(s.players[ap].library.slice(0, 2).includes(a) && s.players[ap].library.slice(0, 2).includes(b));
});

test("can't block and can't be blocked; color of your choice", () => {
  const { s, ap } = setup();
  lands(s, ap, 1);
  const c = add(s, ap, def('Test Outcast', '{1}', 'Creature — Shapeshifter', "This creature can't block and can't be blocked.\n{G}: This creature becomes the color of your choice until end of turn.", ['2', '1']), 'battlefield');
  assert.ok(chars(s, c).cantBlock && chars(s, c).unblockable);
  assert.equal(dispatch(s, ap, { type: 'activate', iid: c, ability: 0 }), null);
  resolveAll(s, (st) => (st.prompt?.kind === 'color' ? 'U' : undefined));
  assert.deepEqual(chars(s, c).colors, ['U']);
});
