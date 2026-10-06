// src/engine/ext/batch4.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setup, add, lands, def, cast, resolveAll, passUntil, dispatch, castOptions, chars, Bear, Forest } from './helpers';
import { canBlock } from '../src/engine/engine';

const db = JSON.parse(readFileSync('data/cards.json', 'utf8'));
const real = (n: string) => db.cards.find((c: any) => c.name === n);

test('Sneak Attack: the creature enters with haste and is sacrificed at the next end step', () => {
  const { s, ap, op } = setup();
  const sa = add(s, ap, real('Sneak Attack'), 'battlefield');
  lands(s, ap, 1, def('Test Mountain', '', 'Basic Land — Mountain', '{T}: Add {R}.'));
  const big = add(s, ap, def('Test Titan', '{7}', 'Creature — Giant', '', ['7', '7']));
  assert.equal(dispatch(s, ap, { type: 'activate', iid: sa, ability: 0 }), null);
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? [big] : st.prompt?.kind === 'yesno' ? 'yes' : undefined));
  assert.equal(s.cards[big].zone, 'battlefield');
  assert.ok(chars(s, big).keywords.has('haste'));
  // it has haste, so the game offers it as an attacker; keep it home and run to the opponent's turn
  for (let i = 0; i < 400 && s.active !== op; i++) {
    if (s.prompt?.kind === 'declareAttackers') { dispatch(s, ap, { type: 'answer', promptId: s.prompt.id, choice: [] }); continue; }
    if (s.prompt) throw new Error('unexpected prompt ' + s.prompt.title);
    dispatch(s, s.priority, { type: 'pass' });
  }
  assert.equal(s.cards[big].zone, 'graveyard');
});

test('two targets, two amounts', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 1);
  const bear = add(s, op, Bear, 'battlefield');
  cast(s, ap, add(s, ap, def('Test Arc', '{R}', 'Sorcery', 'Test Arc deals 2 damage to any target and 1 damage to any other target.')));
  let n = 0;
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? (n++ === 0 ? [{ kind: 'card', iid: bear }] : [{ kind: 'player', idx: op }]) : undefined));
  assert.equal(s.cards[bear]?.zone ?? 'graveyard', 'graveyard');
  assert.equal(s.players[op].life, 19);
});

test('cast spells this turn as though they had flash', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 2);
  cast(s, ap, add(s, ap, def('Test Haste', '{1}', 'Sorcery', 'You may cast spells this turn as though they had flash.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'yesno' ? 'yes' : undefined));
  const sorc = add(s, ap, def('Test Late', '{1}', 'Sorcery', 'You gain 1 life.'));
  passUntil(s, () => s.step === 'end' && s.priority === ap, 400);
  assert.ok(castOptions(s, ap, sorc).some((o: any) => o.ok), 'castable in the end step');
  void op;
});

test("can't be blocked by artifact creatures", async () => {
  const { matchesFilter } = await import('../src/engine/rules');
  const { s, ap, op } = setup();
  const c = add(s, ap, def('Test Sneak', '{1}', 'Creature — Rogue', "This creature can't be blocked by artifact creatures.", ['2', '2']), 'battlefield');
  const golem = add(s, op, def('Test Golem', '{2}', 'Artifact Creature — Golem', '', ['2', '2']), 'battlefield');
  const bear = add(s, op, Bear, 'battlefield');
  const fs = (chars(s, c).pc as any).notBlockableBy as any[];
  assert.equal(fs.length, 1);
  assert.equal(matchesFilter(s, golem, fs[0], ap, c), true, 'golem excluded as a blocker');
  assert.equal(matchesFilter(s, bear, fs[0], ap, c), false, 'bear can block');
});

test('attacking creatures gain first strike until end of turn', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 1);
  const a = add(s, ap, Bear, 'battlefield');
  passUntil(s, () => s.prompt?.kind === 'declareAttackers');
  dispatch(s, ap, { type: 'answer', promptId: s.prompt!.id, choice: [{ iid: a, target: { kind: 'player', idx: op } }] });
  cast(s, ap, add(s, ap, def('Test Charge', '{W}', 'Instant', 'Attacking creatures gain first strike until end of turn.')));
  resolveAll(s);
  assert.ok(chars(s, a).keywords.has('first strike'));
});

test('"artifact creature" means both types; "artifact or creature" means either', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 3);
  const golem = add(s, op, def('Test Golem', '{2}', 'Artifact Creature — Golem', '', ['2', '2']), 'battlefield');
  const bear = add(s, op, Bear, 'battlefield');
  const relic = add(s, op, def('Test Relic', '{1}', 'Artifact', ''), 'battlefield');
  let offered: string[] = [];
  cast(s, ap, add(s, ap, def('Test Shatter', '{1}', 'Instant', 'Destroy target artifact creature.')));
  resolveAll(s, (st) => { if (st.prompt?.kind === 'targets') { offered = st.prompt.targets!.map((t: any) => t.iid); return [{ kind: 'card', iid: golem }]; } return undefined; });
  assert.deepEqual(offered, [golem], 'only the artifact creature');
  cast(s, ap, add(s, ap, def('Test Smash', '{1}', 'Instant', 'Destroy target artifact or creature.')));
  resolveAll(s, (st) => { if (st.prompt?.kind === 'targets') { offered = st.prompt.targets!.map((t: any) => t.iid); return [{ kind: 'card', iid: relic }]; } return undefined; });
  assert.ok(offered.includes(bear) && offered.includes(relic), 'either type');
});
