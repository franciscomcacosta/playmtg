// events.ts: "whenever N or more <filter> you control attack" / "whenever you attack with one or more <type>"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, def, dispatch, passUntil, chars, Bear, cast, resolveAll, settle } from './helpers';

test('whenever one or more creatures you control attack, they gain indestructible', () => {
  const { s, ap } = setup();
  add(s, ap, def('Test Guardian', '{3}', 'Creature — Angel', 'Whenever one or more creatures you control attack, they gain indestructible until end of turn.', ['1', '1']), 'battlefield');
  const b = add(s, ap, Bear, 'battlefield');
  for (const x of s.battlefield) s.cards[x].sick = false;
  passUntil(s, () => s.prompt?.kind === 'declareAttackers');
  const err = dispatch(s, ap, { type: 'answer', promptId: s.prompt!.id, choice: [{ iid: b, target: { kind: 'player', idx: 1 - ap } }] } as any);
  assert.equal(err, null);
  passUntil(s, () => chars(s, b).keywords.has('indestructible') || s.step === 'end');
  assert.ok(chars(s, b).keywords.has('indestructible'));
});

test('whenever a player sacrifices a permanent / an opponent plays a land', () => {
  const { s, ap } = setup();
  const w = add(s, ap, def('Test Watcher', '{2}', 'Creature — Horror', 'Whenever a player sacrifices a permanent, put a +1/+1 counter on this creature.', ['1', '1']), 'battlefield');
  const f = add(s, ap, def('Test Food', '{0}', 'Artifact — Food', 'Sacrifice this artifact: You gain 1 life.'), 'battlefield');
  const i = s.cards[f] && 0;
  void i;
  const err = dispatch(s, ap, { type: 'activate', iid: f, ability: 0 } as any);
  assert.equal(err, null);
  passUntil(s, () => !s.stack.length && !s.pendingTriggers.length && (s.cards[w].counters['+1/+1'] ?? 0) > 0, 50);
  assert.equal(s.cards[w].counters['+1/+1'], 1);
});

test('whenever enchanted land becomes tapped (Psychic Venom)', () => {
  const { s, ap, op } = setup();
  const land = add(s, ap, def('Test Island', '', 'Basic Land — Island', '{T}: Add {U}.'), 'battlefield');
  const v = add(s, op, def('Test Venom', '{1}{U}', 'Enchantment — Aura', "Enchant land\nWhenever enchanted land becomes tapped, Test Venom deals 2 damage to that land's controller."), 'battlefield');
  s.cards[v].attachedTo = land;
  settle(s);
  cast(s, ap, add(s, ap, def('Test Opt', '{U}', 'Instant', 'Scry 1.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? [] : undefined));
  assert.ok(s.cards[land].tapped);
  assert.equal(s.players[ap].life, 18);
});

test('whenever one or more creatures die: triggers once for a board wipe', () => {
  const { s, ap, op } = setup();
  const w = add(s, ap, def('Test Watcher', '{2}', 'Enchantment', 'Whenever one or more creatures die, draw a card.'), 'battlefield');
  void w;
  for (let i = 0; i < 3; i++) add(s, op, Bear, 'battlefield');
  const h = s.players[ap].hand.length;
  cast(s, ap, add(s, ap, def('Test Wrath', '{0}', 'Sorcery', 'Destroy all creatures.')));
  resolveAll(s);
  assert.equal(s.players[ap].hand.length, h + 1);
});
