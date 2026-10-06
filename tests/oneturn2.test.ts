// src/engine/ext/oneturn2.ts: graveyard lands, damage-equal rewrite, endure, same-name exile, exile-two-choose-one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll, dispatch, castOptions, Bear, Forest } from './helpers';

test('Crucible: a land in your graveyard can be played (and counts as your land drop)', () => {
  const { s, ap } = setup();
  add(s, ap, def('Test Crucible', '{3}', 'Artifact', 'You may play lands from your graveyard.'), 'battlefield');
  const f = add(s, ap, Forest, 'graveyard');
  assert.ok(castOptions(s, ap, f).some((o: any) => o.action.type === 'playLand' && o.ok), 'offered');
  assert.equal(dispatch(s, ap, { type: 'playLand', iid: f }), null);
  assert.equal(s.cards[f].zone, 'battlefield');
  const g = add(s, ap, Forest, 'graveyard');
  assert.notEqual(dispatch(s, ap, { type: 'playLand', iid: g }), null, 'only one land per turn');
});

test('without the permission, graveyard lands stay put', () => {
  const { s, ap } = setup();
  const f = add(s, ap, Forest, 'graveyard');
  assert.notEqual(dispatch(s, ap, { type: 'playLand', iid: f }), null);
});

test('damage to target creature equal to the number of lands you control', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 3);
  const big = add(s, op, def('Test Wall', '{3}', 'Creature — Wall', '', ['0', '3']), 'battlefield');
  cast(s, ap, add(s, ap, def('Test Assault', '{1}', 'Sorcery', 'Test Assault deals damage to target creature equal to the number of lands you control.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: big }] : undefined));
  assert.equal(s.cards[big]?.zone ?? 'graveyard', 'graveyard', '3 damage from 3 lands');
});

const Endurer = def('Test Endurer', '{2}', 'Creature — Human', 'When this creature enters, it endures 2.', ['1', '1']);
test('endure: counters on it, or a Spirit token', () => {
  const { s, ap } = setup();
  lands(s, ap, 4);
  const a = add(s, ap, Endurer);
  cast(s, ap, a); resolveAll(s, (st) => (st.prompt?.kind === 'yesno' ? 'yes' : undefined));
  assert.equal(s.cards[a].counters['+1/+1'], 2);
  const before = s.battlefield.length;
  cast(s, ap, add(s, ap, Endurer)); resolveAll(s, (st) => (st.prompt?.kind === 'yesno' ? 'no' : undefined));
  assert.equal(s.battlefield.length, before + 2, 'the creature and a 2/2 Spirit');
});

test('Eradicate-style: destroy target, then exile every card with its name from its owner\'s zones', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 4);
  const t = add(s, op, Bear, 'battlefield');
  const h = add(s, op, Bear), g = add(s, op, Bear, 'graveyard'), l = add(s, op, Bear, 'library');
  const other = add(s, op, Forest);
  cast(s, ap, add(s, ap, def('Test Eradicate', '{2}{B}', 'Sorcery', "Exile target nonblack creature. Search its controller's graveyard, hand, and library for all cards with the same name as that creature and exile them. That player shuffles.")));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: t }] : undefined));
  for (const x of [t, h, g, l]) assert.equal(s.cards[x].zone, 'exile');
  assert.equal(s.cards[other].zone, 'hand');
});

test('exile the top two, choose one, you may play it this turn', () => {
  const { s, ap } = setup();
  lands(s, ap, 1);
  const a = add(s, ap, Bear, 'library'), b = add(s, ap, Forest, 'library'); // b on top
  cast(s, ap, add(s, ap, def('Test Channel', '{1}', 'Sorcery', 'Exile the top two cards of your library, then choose one of them. You may play that card this turn.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? [b] : undefined));
  assert.equal(s.cards[a].zone, 'exile');
  assert.equal(s.cards[b].zone, 'exile');
  assert.equal(s.cards[b].mayPlay?.player, ap);
  assert.ok(!s.cards[a].mayPlay, 'only the chosen one');
  assert.equal(dispatch(s, ap, { type: 'playLand', iid: b }), null);
});
