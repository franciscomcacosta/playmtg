// src/engine/ext/packripple.ts + the "whenever a land enters" (any player) fix.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setup, add, lands, def, cast, resolveAll, passUntil, dispatch, Bear, Forest } from './helpers';

const db = JSON.parse(readFileSync('data/cards.json', 'utf8'));
const real = (n: string) => db.cards.find((c: any) => c.name === n);

test('Ankh of Mishra hits whoever played the land — including the opponent', () => {
  const { s, ap, op } = setup();
  add(s, ap, real('Ankh of Mishra'), 'battlefield');
  const mine = add(s, ap, Forest);
  assert.equal(dispatch(s, ap, { type: 'playLand', iid: mine }), null);
  resolveAll(s);
  assert.equal(s.players[ap].life, 18, 'my land hurts me');
  passUntil(s, () => s.active === op && s.step === 'main1', 400);
  const theirs = add(s, op, Forest);
  assert.equal(dispatch(s, op, { type: 'playLand', iid: theirs }), null);
  resolveAll(s);
  assert.equal(s.players[op].life, 18, "the opponent's land hurts them");
});

test('pack tactics: triggers only with 6+ total attacking power', () => {
  const { s, ap, op } = setup();
  const gnoll = add(s, ap, real('Gnoll Hunter'), 'battlefield');
  const big = add(s, ap, def('Test Brute', '{4}', 'Creature — Ogre', '', ['4', '4']), 'battlefield');
  passUntil(s, () => s.prompt?.kind === 'declareAttackers');
  dispatch(s, ap, { type: 'answer', promptId: s.prompt!.id, choice: [gnoll, big].map((iid) => ({ iid, target: { kind: 'player', idx: op } })) });
  resolveAll(s);
  assert.equal(s.cards[gnoll].counters['+1/+1'], 1, '2 + 4 = 6 power');
});

test('ripple: reveals the top cards and casts a same-named copy for free; the rest go to the bottom', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 1);
  const Surge = def('Test Surge', '{R}', 'Instant', "Ripple 2 (When you cast this spell, you may reveal the top two cards of your library. You may cast spells with the same name as this spell from among those cards without paying their mana costs. Put the rest on the bottom of your library.)\nTest Surge deals 2 damage to any target.");
  const other = add(s, ap, Forest, 'library');
  const copy = add(s, ap, Surge, 'library');
  cast(s, ap, add(s, ap, Surge));
  resolveAll(s, (st) => {
    if (st.prompt?.kind === 'yesno') return 'yes';
    if (st.prompt?.kind === 'chooseCards') return [copy];
    if (st.prompt?.kind === 'targets') return st.prompt.targets!.filter((t: any) => t.kind === 'player' && t.idx === op).slice(0, 1);
    return undefined;
  });
  assert.equal(s.players[op].life, 16, 'both copies hit');
  // the free copy is cast too, so it ripples again and puts two more cards under this one
  const L = s.players[ap].library;
  assert.ok(L.indexOf(other) >= L.length - 3, 'the non-matching card went to the bottom');
});
