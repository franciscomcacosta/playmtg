// src/engine/ext/prevent.ts: chosen-source prevention, cumulative upkeep (life), can't attack alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll, passUntil, dispatch, Bear } from './helpers';

test('prevent the next damage from a chosen source — once, and only that source', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 1);
  const pinger = add(s, op, def('Test Pinger', '{1}', 'Creature — Wizard', '{T}: Test Pinger deals 1 damage to any target.', ['1', '1']), 'battlefield');
  const other = add(s, op, def('Test Pinger 2', '{1}', 'Creature — Wizard', '{T}: Test Pinger 2 deals 1 damage to any target.', ['1', '1']), 'battlefield');
  cast(s, ap, add(s, ap, def('Test Circle', '{W}', 'Instant', 'The next time a source of your choice would deal damage to you this turn, prevent that damage.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? [pinger] : undefined));
  const ping = (iid: string) => {
    s.priority = op;
    assert.equal(dispatch(s, op, { type: 'activate', iid, ability: 0 }), null);
    if (s.prompt?.kind === 'targets') dispatch(s, op, { type: 'answer', promptId: s.prompt.id, choice: [{ kind: 'player', idx: ap }] });
    resolveAll(s);
  };
  ping(pinger);
  assert.equal(s.players[ap].life, 20, 'prevented');
  ping(other);
  assert.equal(s.players[ap].life, 19, 'a different source is not prevented');
  s.cards[pinger].tapped = false;
  ping(pinger);
  assert.equal(s.players[ap].life, 18, 'the shield was used up');
});

test('cumulative upkeep — pay N life: grows each upkeep, sacrificed when declined', () => {
  const { s, ap, op } = setup();
  const c = add(s, ap, def('Test Ancient', '{2}', 'Creature — Spirit', 'Cumulative upkeep—Pay 2 life.', ['4', '4']), 'battlefield');
  const life = s.players[ap].life;
  const runTo = (pred: () => boolean, answer: 'yes' | 'no') => {
    for (let i = 0; i < 600 && !pred(); i++) {
      if (s.prompt) { const k = s.prompt.kind; dispatch(s, s.prompt.player, { type: 'answer', promptId: s.prompt.id, choice: k === 'yesno' ? answer : k === 'declareAttackers' || k === 'declareBlockers' ? [] : s.prompt.cards?.slice(0, s.prompt.min ?? 0) ?? null }); continue; }
      dispatch(s, s.priority, { type: 'pass' });
    }
  };
  runTo(() => s.active === op, 'yes');
  runTo(() => s.active === ap && s.step === 'main1', 'yes');
  assert.equal(s.players[ap].life, life - 2, 'first upkeep: 2 life');
  runTo(() => s.active === op, 'yes');
  runTo(() => s.active === ap && s.step === 'main1', 'yes');
  assert.equal(s.players[ap].life, life - 2 - 4, 'second upkeep: 4 life');
  runTo(() => s.active === op, 'no');
  runTo(() => s.active === ap && s.step === 'main1', 'no');
  assert.equal(s.cards[c].zone, 'graveyard');
});

test("can't attack alone", () => {
  const { s, ap, op } = setup();
  const loner = add(s, ap, def('Test Loner', '{1}', 'Creature — Goblin', "This creature can't attack alone.", ['2', '2']), 'battlefield');
  const pal = add(s, ap, Bear, 'battlefield');
  passUntil(s, () => s.prompt?.kind === 'declareAttackers');
  assert.match(dispatch(s, ap, { type: 'answer', promptId: s.prompt!.id, choice: [{ iid: loner, target: { kind: 'player', idx: op } }] }) ?? '', /can't attack alone/);
  assert.equal(dispatch(s, ap, { type: 'answer', promptId: s.prompt!.id, choice: [loner, pal].map((iid) => ({ iid, target: { kind: 'player', idx: op } })) }), null);
});
