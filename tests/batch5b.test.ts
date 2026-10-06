// Count phrases with names and "N plus", damaged-creature exile, "during your turn" statics.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setup, add, lands, def, cast, resolveAll, passUntil, dispatch, chars, Bear, Forest } from './helpers';

const db = JSON.parse(readFileSync('data/cards.json', 'utf8'));
const real = (n: string) => db.cards.find((c: any) => c.name === n);

test('Accumulated Knowledge counts copies in all graveyards (+1 for itself? no — it resolves first)', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 2);
  const AK = real('Accumulated Knowledge');
  add(s, ap, AK, 'graveyard'); add(s, op, AK, 'graveyard');
  for (let i = 0; i < 5; i++) add(s, ap, Forest, 'library');
  const hand = s.players[ap].hand.length;
  cast(s, ap, add(s, ap, AK));
  resolveAll(s);
  // draws 1 plus the number of cards named Accumulated Knowledge in all graveyards (2) → 3; cast one from hand
  assert.equal(s.players[ap].hand.length, hand + 3);
});

test('Kindle: 2 plus the number in all graveyards', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 2);
  const K = real('Kindle');
  add(s, ap, K, 'graveyard');
  cast(s, ap, add(s, ap, K));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? st.prompt.targets!.filter((t: any) => t.kind === 'player' && t.idx === op).slice(0, 1) : undefined));
  assert.equal(s.players[op].life, 17);
});

test('creatures this source damaged this turn are exiled instead of dying', () => {
  const { s, ap, op } = setup();
  const src = add(s, ap, def('Test Scorcher', '{1}', 'Creature — Elemental', '{T}: This creature deals 2 damage to target creature.\nIf a creature dealt damage by this creature this turn would die, exile it instead.', ['1', '1']), 'battlefield');
  const bear = add(s, op, Bear, 'battlefield');
  assert.equal(dispatch(s, ap, { type: 'activate', iid: src, ability: 0 }), null);
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: bear }] : undefined));
  assert.equal(s.cards[bear].zone, 'exile');
});

test('during your turn, equipped creature gets +2/+0 and has first strike', () => {
  const { s, ap, op } = setup();
  const bear = add(s, ap, Bear, 'battlefield');
  const eq = add(s, ap, def('Test Lance', '{1}', 'Artifact — Equipment', 'During your turn, equipped creature gets +2/+0 and has first strike.\nEquip {1}'), 'battlefield');
  s.cards[eq].attachedTo = bear;
  assert.equal(chars(s, bear).power, 4);
  assert.ok(chars(s, bear).keywords.has('first strike'));
  for (let i = 0; i < 400 && s.active !== op; i++) {
    if (s.prompt?.kind === 'declareAttackers') { dispatch(s, ap, { type: 'answer', promptId: s.prompt.id, choice: [] }); continue; }
    dispatch(s, s.priority, { type: 'pass' });
  }
  assert.equal(chars(s, bear).power, 2, 'not on the opponent\'s turn');
});
