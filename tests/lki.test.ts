// Shapes exposed by the subtype fix: edicts, graveyard exile, back-referenced amounts, "dealt damage this turn".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll, dispatch, Bear, Forest } from './helpers';

const tgtP = (op: number) => (st: any) => (st.prompt?.kind === 'targets' ? st.prompt.targets.filter((t: any) => t.kind === 'player' && t.idx === op).slice(0, 1) : undefined);

test('edict: each opponent sacrifices a creature of THEIR choice', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 1);
  const a = add(s, op, Bear, 'battlefield'), b = add(s, op, Bear, 'battlefield');
  let chooser = -1;
  cast(s, ap, add(s, ap, def('Test Edict', '{B}', 'Sorcery', 'Each opponent sacrifices a creature of their choice.')));
  resolveAll(s, (st) => { if (st.prompt?.kind === 'chooseCards') { chooser = st.prompt.player; return [b]; } return undefined; });
  assert.equal(chooser, op);
  assert.equal(s.cards[b].zone, 'graveyard');
  assert.equal(s.cards[a].zone, 'battlefield');
});

test("exile target player's graveyard / all graveyards", () => {
  const { s, ap, op } = setup();
  lands(s, ap, 2);
  const g1 = add(s, op, Bear, 'graveyard'), g2 = add(s, ap, Bear, 'graveyard');
  cast(s, ap, add(s, ap, def('Test Void', '{B}', 'Sorcery', "Exile target player's graveyard.")));
  resolveAll(s, tgtP(op));
  assert.equal(s.cards[g1].zone, 'exile');
  assert.equal(s.cards[g2].zone, 'graveyard');
  cast(s, ap, add(s, ap, def('Test Bowl', '{1}', 'Sorcery', 'Exile all graveyards.')));
  resolveAll(s);
  assert.equal(s.cards[g2].zone, 'exile');
});

test("destroy it, gain life equal to that creature's toughness", () => {
  const { s, ap, op } = setup();
  lands(s, ap, 2);
  const wall = add(s, op, def('Test Wall', '{1}', 'Creature — Wall', '', ['0', '5']), 'battlefield');
  cast(s, ap, add(s, ap, def('Test Absorb', '{1}{W}', 'Instant', "Destroy target creature. You gain life equal to that creature's toughness.")));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: wall }] : undefined));
  assert.equal(s.players[ap].life, 25);
});

test('gain life equal to the life lost this way', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 2);
  cast(s, ap, add(s, ap, def('Test Drain', '{1}{B}', 'Sorcery', 'Target player loses 3 life. You gain life equal to the life lost this way.')));
  resolveAll(s, tgtP(op));
  assert.equal(s.players[op].life, 17);
  assert.equal(s.players[ap].life, 23);
});

test('deal damage equal to the sacrificed creature\'s power', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 2);
  const big = add(s, ap, def('Test Brute', '{4}', 'Creature — Ogre', '', ['5', '5']), 'battlefield');
  cast(s, ap, add(s, ap, def('Test Fling', '{1}{R}', 'Instant', "As an additional cost to cast this spell, sacrifice a creature.\nTest Fling deals damage equal to the sacrificed creature's power to any target.")));
  resolveAll(s, (st) => {
    if (st.prompt?.kind === 'chooseCards') return [big];
    return tgtP(op)(st);
  });
  assert.equal(s.players[op].life, 15);
});

test('target creature that was dealt damage this turn: undamaged ones are not legal targets', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 3);
  const hurt = add(s, op, def('Test Wall', '{1}', 'Creature — Wall', '', ['0', '5']), 'battlefield');
  const fresh = add(s, op, Bear, 'battlefield');
  cast(s, ap, add(s, ap, def('Test Ping', '{R}', 'Instant', 'Test Ping deals 1 damage to target creature.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: hurt }] : undefined));
  let offered: any[] = [];
  cast(s, ap, add(s, ap, def('Test Finish', '{1}{B}', 'Instant', 'Destroy target creature that was dealt damage this turn.')));
  resolveAll(s, (st) => { if (st.prompt?.kind === 'targets') { offered = st.prompt.targets!; return [{ kind: 'card', iid: hurt }]; } return undefined; });
  assert.ok(offered.some((t) => t.iid === hurt) && !offered.some((t) => t.iid === fresh));
  assert.equal(s.cards[hurt].zone, 'graveyard');
});
