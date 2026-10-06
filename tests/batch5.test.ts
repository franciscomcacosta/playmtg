// src/engine/ext/batch5.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll, passUntil, dispatch, chars, Bear } from './helpers';

const tgt = (iid: string) => (st: any) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid }] : undefined);

test("opponents' creatures that die are exiled; mine still go to the graveyard", () => {
  const { s, ap, op } = setup();
  lands(s, ap, 2);
  add(s, ap, def('Test Void Rend', '{2}', 'Enchantment', 'If a creature an opponent controls would die, exile it instead.'), 'battlefield');
  const theirs = add(s, op, Bear, 'battlefield'), mine = add(s, ap, Bear, 'battlefield');
  cast(s, ap, add(s, ap, def('Test Wrath', '{2}', 'Sorcery', 'Destroy all creatures.')));
  resolveAll(s);
  assert.equal(s.cards[theirs].zone, 'exile');
  assert.equal(s.cards[mine].zone, 'graveyard');
});

test('indestructible only while it has a divinity counter', () => {
  const { s, ap } = setup();
  const k = add(s, ap, def('Test Kami', '{3}', 'Creature — Spirit', 'This creature has indestructible as long as it has a divinity counter on it.', ['3', '3']), 'battlefield');
  assert.ok(!chars(s, k).keywords.has('indestructible'));
  s.cards[k].counters.divinity = 1;
  assert.ok(chars(s, k).keywords.has('indestructible'));
});

test('enchanted creature attacks each combat if able', () => {
  const { s, ap, op } = setup();
  const bear = add(s, ap, Bear, 'battlefield');
  const aura = add(s, ap, def('Test Rage', '{R}', 'Enchantment — Aura', 'Enchant creature\nEnchanted creature gets +2/+2 and attacks each combat if able.'), 'battlefield');
  s.cards[aura].attachedTo = bear;
  assert.equal(chars(s, bear).power, 4);
  passUntil(s, () => s.prompt?.kind === 'declareAttackers');
  assert.match(dispatch(s, ap, { type: 'answer', promptId: s.prompt!.id, choice: [] }) ?? '', /attacks each combat if able/);
  void op;
});

test('suspect: menace and can\'t block', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 1);
  const bear = add(s, op, Bear, 'battlefield');
  cast(s, ap, add(s, ap, def('Test Accuse', '{1}', 'Sorcery', 'Suspect target creature.')));
  resolveAll(s, tgt(bear));
  assert.ok(chars(s, bear).keywords.has('menace') && chars(s, bear).cantBlock);
});

test('shuffle up to two target cards from a graveyard into the library', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 1);
  const a = add(s, op, Bear, 'graveyard'), b = add(s, op, Bear, 'graveyard');
  cast(s, ap, add(s, ap, def('Test Recycle', '{1}', 'Sorcery', 'Target player shuffles up to two target cards from their graveyard into their library.')));
  let n = 0;
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? (n++ === 0 ? [{ kind: 'player', idx: op }] : [{ kind: 'card', iid: a }, { kind: 'card', iid: b }]) : undefined));
  assert.equal(s.cards[a].zone, 'library');
  assert.equal(s.cards[b].zone, 'library');
});

test('untap it and remove it from combat', () => {
  const { s, ap, op } = setup();
  const bear = add(s, ap, def('Test Escapee', '{2}', 'Creature — Rogue', 'Whenever this creature becomes blocked, you may untap it and remove it from combat.', ['2', '2']), 'battlefield');
  const wall = add(s, op, def('Test Wall', '{1}', 'Creature — Wall', '', ['0', '5']), 'battlefield');
  passUntil(s, () => s.prompt?.kind === 'declareAttackers');
  dispatch(s, ap, { type: 'answer', promptId: s.prompt!.id, choice: [{ iid: bear, target: { kind: 'player', idx: op } }] });
  passUntil(s, () => s.prompt?.kind === 'declareBlockers');
  dispatch(s, op, { type: 'answer', promptId: s.prompt!.id, choice: [{ blocker: wall, attacker: bear }] });
  resolveAll(s, (st) => (st.prompt?.kind === 'yesno' ? 'yes' : undefined));
  assert.equal(s.cards[bear].tapped, false);
  assert.ok(!s.combat?.attackers.some((a) => a.iid === bear));
});
