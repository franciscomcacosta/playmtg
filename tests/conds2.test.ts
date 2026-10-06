// src/engine/ext/conds2.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll } from './helpers';
import { evalCond } from '../src/engine/rules';
import { parseCond } from '../src/engine/oracle';
import '../src/engine/ext/index';

test('life total / zone / opponent-control conditions', () => {
  const { s, ap, op } = setup();
  const c = (t: string) => evalCond(s, parseCond(t)!, ap, undefined);
  assert.equal(c('your life total is 5 or less'), false);
  s.players[ap].life = 4;
  assert.equal(c('your life total is 5 or less'), true);
  assert.equal(c('there is a land card in your graveyard'), false);
  add(s, ap, def('Forest', '', 'Basic Land — Forest'), 'graveyard');
  assert.equal(c('there is a land card in your graveyard'), true);
  for (let i = 0; i < 3; i++) add(s, op, def('Test Bear', '{1}', 'Creature — Bear', '', ['2', '2']), 'battlefield');
  assert.equal(c('your opponents control three or more creatures'), true);
});

test("you've cast an instant or sorcery this turn", () => {
  const { s, ap } = setup();
  const c = (t: string) => evalCond(s, parseCond(t)!, ap, undefined);
  assert.equal(c("you've cast an instant or sorcery spell this turn"), false);
  lands(s, ap, 1);
  cast(s, ap, add(s, ap, def('Test Opt', '{0}', 'Instant', 'Scry 1.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? [] : undefined));
  assert.equal(c("you've cast an instant or sorcery spell this turn"), true);
});

test('hand size and opponent-control conditions', () => {
  const { s, ap } = setup();
  const c = (t: string) => evalCond(s, parseCond(t)!, ap, undefined);
  s.players[ap].hand.length = 2;
  assert.equal(c('you have three or fewer cards in hand'), true);
  assert.equal(c('your opponents control no creatures'), true);
  add(s, 1 - ap as any, def('Test Bear', '{1}', 'Creature — Bear', '', ['2', '2']), 'battlefield');
  assert.equal(c('your opponents control no creatures'), false);
});
