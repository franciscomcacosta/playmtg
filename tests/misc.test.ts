// Tests for src/engine/ext/misc.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll, passUntil, dispatch, chars, Bear, Forest } from './helpers';

test('path to exile: its controller may search for a basic land', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 2);
  const b = add(s, op, Bear, 'battlefield');
  const f = add(s, op, Forest, 'library');
  cast(s, ap, add(s, ap, def('Test Path', '{W}', 'Instant', 'Exile target creature. Its controller may search their library for a basic land card, put that card onto the battlefield tapped, then shuffle.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: b }] : st.prompt?.kind === 'chooseCards' ? [f] : undefined));
  assert.equal(s.cards[b].zone, 'exile');
  assert.equal(s.cards[f].zone, 'battlefield');
  assert.equal(s.cards[f].controller, op);
});

test('switch power and toughness; you win the game; afterlife', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 4);
  const w = add(s, ap, def('Test Wall', '{1}', 'Creature — Wall', '{0}: Switch Test Wall\'s power and toughness until end of turn.', ['1', '4']), 'battlefield');
  assert.equal(dispatch(s, ap, { type: 'activate', iid: w, ability: 0 }), null);
  resolveAll(s);
  assert.equal(chars(s, w).power, 4);
  assert.equal(chars(s, w).toughness, 1);
  const sp = add(s, ap, def('Test Soul', '{1}', 'Creature — Spirit', 'Afterlife 2', ['1', '1']), 'battlefield');
  cast(s, ap, add(s, ap, def('Test Kill', '{1}', 'Instant', 'Destroy target creature.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: sp }] : undefined));
  assert.equal(s.battlefield.filter((x) => chars(s, x).name === 'Spirit').length, 2);
  cast(s, ap, add(s, ap, def('Test Alt Win', '{1}', 'Sorcery', 'You win the game.')));
  resolveAll(s);
  assert.equal(s.over, true);
  assert.equal(s.winner, ap);
  void op;
});

test('destroy that creature at end of combat (Cockatrice)', () => {
  const { s, ap, op } = setup();
  const c = add(s, ap, def('Test Cockatrice', '{3}', 'Creature — Cockatrice', 'Whenever Test Cockatrice blocks or becomes blocked by a non-Wall creature, destroy that creature at end of combat.', ['2', '4']), 'battlefield');
  const b = add(s, op, def('Test Ox', '{3}', 'Creature — Ox', '', ['1', '5']), 'battlefield');
  passUntil(s, () => s.prompt?.kind === 'declareAttackers');
  dispatch(s, ap, { type: 'answer', promptId: s.prompt!.id, choice: [{ iid: c, target: { kind: 'player', idx: op } }] });
  passUntil(s, () => s.prompt?.kind === 'declareBlockers');
  dispatch(s, op, { type: 'answer', promptId: s.prompt!.id, choice: [{ blocker: b, attacker: c }] });
  resolveAll(s);
  passUntil(s, () => s.step === 'main2');
  assert.equal(s.cards[b].zone, 'graveyard');
});

test('mobilize creates attacking tokens that are sacrificed at end step; transmute', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 3);
  const m = add(s, ap, def('Test Mobilizer', '{2}', 'Creature — Warrior', 'Mobilize 2', ['2', '2']), 'battlefield');
  passUntil(s, () => s.prompt?.kind === 'declareAttackers');
  dispatch(s, ap, { type: 'answer', promptId: s.prompt!.id, choice: [{ iid: m, target: { kind: 'player', idx: op } }] });
  resolveAll(s);
  passUntil(s, () => s.step === 'main2');
  assert.equal(s.players[op].life, 16);
  passUntil(s, () => s.step === 'cleanup' || s.turn > 2);
  assert.equal(s.battlefield.filter((x) => s.cards[x] && chars(s, x).name === 'Warrior').length, 0);
});

test('transmute searches for a card with the same mana value', () => {
  const { s, ap } = setup();
  lands(s, ap, 3);
  const t = add(s, ap, def('Test Transmuter', '{1}{U}{U}', 'Instant', 'Draw a card.\nTransmute {1}{U}{U}', undefined, { cmc: 3 }));
  const three = add(s, ap, def('Test Three', '{3}', 'Artifact', '', undefined, { cmc: 3 }), 'library');
  const idx = chars(s, t).pc.activated.findIndex((a: any) => /Transmute/.test(a.label));
  assert.equal(dispatch(s, ap, { type: 'activate', iid: t, ability: idx }), null);
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? [three] : undefined));
  assert.equal(s.cards[three].zone, 'hand');
});
