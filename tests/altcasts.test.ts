// Tests for src/engine/ext/altcasts.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll, passUntil, dispatch, castOptions, chars, Bear } from './helpers';

const split = (name: string, a: any, b: any) => def(`${a.name} // ${b.name}`, `${a.manaCost} // ${b.manaCost}`, `${a.typeLine} // ${b.typeLine}`, `${a.oracle}\n//\n${b.oracle}`, undefined, { layout: 'split', faces: [a, b] } as any);

test('aftermath: first half from hand, second half only from the graveyard, then exiled', () => {
  const { s, ap } = setup();
  lands(s, ap, 6);
  const c = add(s, ap, split('x', { name: 'Test Start', manaCost: '{1}', typeLine: 'Sorcery', oracle: 'You gain 2 life.' }, { name: 'Test Finish', manaCost: '{1}', typeLine: 'Sorcery', oracle: 'Aftermath (Cast this spell only from your graveyard. Then exile it.)\nYou gain 5 life.' }));
  assert.ok(dispatch(s, ap, { type: 'cast', iid: c, face: 1 }), 'second half not castable from hand');
  const life = s.players[ap].life;
  cast(s, ap, c, { face: 0 });
  resolveAll(s);
  assert.equal(s.cards[c].zone, 'graveyard');
  const opts = castOptions(s, ap, c).filter((o: any) => o.ok);
  assert.equal(opts.length, 1);
  cast(s, ap, c, opts[0].action);
  resolveAll(s);
  assert.equal(s.players[ap].life, life + 7);
  assert.equal(s.cards[c].zone, 'exile');
});

test('jump-start: cast from graveyard by discarding a card, then exile', () => {
  const { s, ap } = setup();
  lands(s, ap, 4);
  const c = add(s, ap, def('Test Jumper', '{1}', 'Sorcery', 'You gain 3 life.\nJump-start'), 'graveyard');
  const junk = add(s, ap, Bear);
  const life = s.players[ap].life;
  const o = castOptions(s, ap, c).find((x: any) => x.ok);
  assert.ok(o);
  cast(s, ap, c, o!.action);
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? [junk] : undefined));
  assert.equal(s.players[ap].life, life + 3);
  assert.equal(s.cards[junk].zone, 'graveyard');
  assert.equal(s.cards[c].zone, 'exile');
});

test('overload hits each creature; fuse casts both halves', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 8);
  const b1 = add(s, op, Bear, 'battlefield');
  const b2 = add(s, op, Bear, 'battlefield');
  const ov = add(s, ap, def('Test Overload', '{1}{R}', 'Instant', "Test Overload deals 2 damage to target creature you don't control.\nOverload {3}{R}"));
  cast(s, ap, ov, { alt: 'ext:overload' });
  resolveAll(s);
  assert.equal(s.cards[b1].zone, 'graveyard');
  assert.equal(s.cards[b2].zone, 'graveyard');
  const fz = add(s, ap, split('y', { name: 'Test Heal', manaCost: '{1}', typeLine: 'Instant', oracle: 'You gain 2 life.\nFuse' }, { name: 'Test Hurt', manaCost: '{1}', typeLine: 'Instant', oracle: 'Test Hurt deals 3 damage to any target.\nFuse' }));
  const life = s.players[ap].life;
  cast(s, ap, fz, { alt: 'ext:fuse' });
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'player', idx: op }] : undefined));
  assert.equal(s.players[ap].life, life + 2);
  assert.equal(s.players[op].life, 17);
});

test('blitz: haste, draw when it dies, sacrificed at end step; prototype is smaller', () => {
  const { s, ap } = setup();
  lands(s, ap, 8);
  const bz = add(s, ap, def('Test Blitzer', '{3}{R}', 'Creature — Devil', 'Blitz {1}{R}', ['4', '4']));
  cast(s, ap, bz, { alt: 'ext:blitz' });
  resolveAll(s);
  assert.ok(chars(s, bz).keywords.has('haste'));
  const hand = s.players[ap].hand.length;
  passUntil(s, () => s.prompt?.kind === 'declareAttackers');
  dispatch(s, ap, { type: 'answer', promptId: s.prompt!.id, choice: [] });
  passUntil(s, () => s.step === 'end' && !s.stack.length && !s.pendingTriggers.length && s.cards[bz].zone !== 'battlefield' || s.turn > 2);
  resolveAll(s);
  assert.equal(s.cards[bz].zone, 'graveyard');
  assert.ok(s.players[ap].hand.length >= hand + 1, 'drew a card');
});

test('prototype and casualty', () => {
  const { s, ap } = setup();
  lands(s, ap, 8);
  const pr = add(s, ap, def('Test Proto', '{7}', 'Artifact Creature — Construct', 'Prototype {1}{R} — 2/2', ['7', '7']));
  cast(s, ap, pr, { alt: 'ext:prototype' });
  resolveAll(s);
  assert.equal(chars(s, pr).power, 2);
  assert.deepEqual(chars(s, pr).colors, ['R']);
  const fodder = add(s, ap, Bear, 'battlefield');
  const cs = add(s, ap, def('Test Casualty', '{1}', 'Sorcery', 'Casualty 1\nYou gain 2 life.'));
  const life = s.players[ap].life;
  cast(s, ap, cs, { alt: 'ext:casualty' });
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? [fodder] : undefined));
  assert.equal(s.cards[fodder].zone, 'graveyard');
  assert.equal(s.players[ap].life, life + 4, 'copied');
});

test('earthbend animates a land and returns it when it dies', () => {
  const { s, ap } = setup();
  const [l] = lands(s, ap, 4);
  cast(s, ap, add(s, ap, def('Test Bend', '{1}', 'Sorcery', 'Earthbend 3.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: l }] : undefined));
  assert.ok(chars(s, l).types.has('creature'));
  assert.equal(chars(s, l).power, 3);
  cast(s, ap, add(s, ap, def('Test Kill', '{1}', 'Instant', 'Destroy target creature.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: l }] : undefined));
  assert.equal(s.cards[l].zone, 'battlefield');
  assert.ok(s.cards[l].tapped);
  assert.ok(!chars(s, l).types.has('creature'));
});
