// src/engine/ext/castlock.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll, passUntil, dispatch, Bear } from './helpers';

test("Dromoka: opponents can't cast spells during your turn", () => {
  const { s, ap, op } = setup();
  add(s, ap, def('Test Dromoka', '{4}', 'Creature — Dragon', "Your opponents can't cast spells during your turn.", ['5', '7']), 'battlefield');
  lands(s, op, 2);
  const shock = add(s, op, def('Test Zap', '{R}', 'Instant', 'Test Zap deals 1 damage to any target.'));
  s.priority = op;
  assert.match(dispatch(s, op, { type: 'cast', iid: shock }) ?? '', /can't cast/);
});

test("Cease-Fire: target player can't cast creature spells this turn", () => {
  const { s, ap, op } = setup();
  lands(s, ap, 3);
  cast(s, ap, add(s, ap, def('Test Cease', '{1}', 'Instant', "Target player can't cast creature spells this turn.")));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'player', idx: ap }] : undefined));
  assert.match(dispatch(s, ap, { type: 'cast', iid: add(s, ap, Bear) }) ?? '', /can't cast/);
  passUntil(s, () => s.turn === 3 && s.step === 'main1');
  void op;
  lands(s, ap, 2);
  assert.equal(dispatch(s, ap, { type: 'cast', iid: add(s, ap, Bear) }), null);
});

test("Grafdigger's Cage: no casting from graveyards", () => {
  const { s, ap } = setup();
  add(s, ap, def('Test Cage', '{1}', 'Artifact', "Players can't cast spells from graveyards or libraries."), 'battlefield');
  const g = add(s, ap, def('Test Recall', '{1}', 'Sorcery', 'Draw a card.\nFlashback {1}'), 'graveyard');
  lands(s, ap, 2);
  assert.match(dispatch(s, ap, { type: 'cast', iid: g, alt: 'flashback' }) ?? '', /can't cast/);
});
