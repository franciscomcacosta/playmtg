// src/engine/ext/delirium.ts: delirium condition, per-blocker pump, party discount.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll, passUntil, dispatch, chars, Bear, Forest } from './helpers';

test('delirium: +2/+2 only with four or more card types in your graveyard', () => {
  const { s, ap } = setup();
  const c = add(s, ap, def('Test Fiend', '{1}{B}', 'Creature — Horror', 'This creature gets +2/+2 as long as there are four or more card types among cards in your graveyard.', ['1', '1']), 'battlefield');
  add(s, ap, Forest, 'graveyard'); add(s, ap, Bear, 'graveyard'); add(s, ap, def('Test Inst', '{1}', 'Instant', ''), 'graveyard');
  assert.equal(chars(s, c).power, 1, 'three types');
  add(s, ap, def('Test Art', '{1}', 'Artifact', ''), 'graveyard');
  assert.equal(chars(s, c).power, 3, 'four types');
});

test('+1/+1 for each creature blocking it', () => {
  const { s, ap, op } = setup();
  const r = add(s, ap, def('Test Rampager', '{3}', 'Creature — Beast', 'Whenever this creature becomes blocked, it gets +1/+1 until end of turn for each creature blocking it.', ['3', '3']), 'battlefield');
  const b1 = add(s, op, Bear, 'battlefield'), b2 = add(s, op, Bear, 'battlefield');
  passUntil(s, () => s.prompt?.kind === 'declareAttackers');
  dispatch(s, ap, { type: 'answer', promptId: s.prompt!.id, choice: [{ iid: r, target: { kind: 'player', idx: op } }] });
  passUntil(s, () => s.prompt?.kind === 'declareBlockers');
  dispatch(s, op, { type: 'answer', promptId: s.prompt!.id, choice: [{ blocker: b1, attacker: r }, { blocker: b2, attacker: r }] });
  resolveAll(s);
  assert.equal(chars(s, r).power, 5);
});

test('party discount counts one each of Cleric, Rogue, Warrior, Wizard', () => {
  const { s, ap } = setup();
  const L = lands(s, ap, 6);
  for (const t of ['Cleric', 'Rogue', 'Rogue']) add(s, ap, def(`Test ${t}`, '{1}', `Creature — Human ${t}`, '', ['1', '1']), 'battlefield');
  cast(s, ap, add(s, ap, def('Test Party', '{5}{W}', 'Sorcery', 'This spell costs {1} less to cast for each creature in your party.\nYou gain 1 life.')));
  resolveAll(s);
  assert.equal(L.filter((l) => s.cards[l].tapped).length, 4, 'party of 2 (two Rogues count once)');
});

test('+1/+1 for each Aura attached to it — only Auras on THIS creature count', () => {
  const { s, ap } = setup();
  const c = add(s, ap, def('Test Spirit', '{1}{W}', 'Creature — Spirit', 'This creature gets +1/+1 for each Aura attached to it.', ['1', '1']), 'battlefield');
  const other = add(s, ap, Bear, 'battlefield');
  const Aura = def('Test Aura', '{W}', 'Enchantment — Aura', 'Enchant creature');
  const a1 = add(s, ap, Aura, 'battlefield'), a2 = add(s, ap, Aura, 'battlefield'), a3 = add(s, ap, Aura, 'battlefield');
  s.cards[a1].attachedTo = c; s.cards[a2].attachedTo = c; s.cards[a3].attachedTo = other;
  assert.equal(chars(s, c).power, 3);
});
