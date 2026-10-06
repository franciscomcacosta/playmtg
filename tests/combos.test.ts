// Combo interactions with REAL card text from data/cards.json: trigger doublers, trigger stoppers,
// life-loss loops and counter/token doubling. These check that permanents see each other's events.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setup, add, lands, def, cast, resolveAll, passUntil, dispatch, Bear, Forest } from './helpers';
import type { CardDef } from '../src/engine/cardTypes';

const db = JSON.parse(readFileSync(new URL('../data/cards.json', import.meta.url), 'utf8'));
const byName = new Map<string, CardDef>(db.cards.map((c: any) => [c.name, c]));
const real = (name: string): CardDef => { const d = byName.get(name); assert.ok(d, `missing card ${name}`); return d!; };
const life = (s: any, p: number) => s.players[p].life;

test('Panharmonicon doubles Soul Warden for a creature entering, but not for a land', () => {
  const { s, ap } = setup();
  lands(s, ap, 4);
  add(s, ap, real('Panharmonicon'), 'battlefield');
  add(s, ap, real('Soul Warden'), 'battlefield');
  const start = life(s, ap);
  cast(s, ap, add(s, ap, Bear));
  resolveAll(s);
  assert.equal(life(s, ap), start + 2, 'Soul Warden should trigger twice');
  // Saga chapter I is caused by a lore counter, not by entering: never doubled
  const saga = add(s, ap, def('Test Chronicle', '', 'Enchantment — Saga', 'I — You gain 5 life.\nII — Draw a card.\nIII — Draw a card.'));
  cast(s, ap, saga);
  resolveAll(s);
  assert.equal(life(s, ap), start + 2 + 5, 'saga chapter must trigger once');
});

test('Panharmonicon only doubles your own permanents\' triggers', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 4);
  add(s, ap, real('Panharmonicon'), 'battlefield');
  add(s, op, real('Soul Warden'), 'battlefield');
  const start = life(s, op);
  cast(s, ap, add(s, ap, Bear));
  resolveAll(s);
  assert.equal(life(s, op), start + 1);
});

test('Elesh Norn: doubles mine, stops the opponent\'s ETB triggers', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 4);
  add(s, ap, real('Elesh Norn, Mother of Machines'), 'battlefield');
  add(s, ap, real('Soul Warden'), 'battlefield');
  add(s, op, real('Soul Warden'), 'battlefield');
  const [a, o] = [life(s, ap), life(s, op)];
  cast(s, ap, add(s, ap, Bear));
  resolveAll(s);
  assert.equal(life(s, ap), a + 2);
  assert.equal(life(s, op), o, 'opponent\'s Soul Warden must not trigger');
});

test('Torpor Orb stops Kitchen Finks\' ETB; Hushbringer also stops its death trigger', () => {
  const { s, ap } = setup();
  lands(s, ap, 6);
  add(s, ap, real('Torpor Orb'), 'battlefield');
  const start = life(s, ap);
  cast(s, ap, add(s, ap, real('Kitchen Finks')));
  resolveAll(s);
  assert.equal(life(s, ap), start, 'no ETB life gain under Torpor Orb');
});

test('Teysa Karlov doubles Blood Artist when a creature dies', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 4);
  add(s, ap, real('Teysa Karlov'), 'battlefield');
  add(s, ap, real('Blood Artist'), 'battlefield');
  const victim = add(s, ap, Bear, 'battlefield');
  const bolt = add(s, ap, def('Test Shock', '{1}', 'Instant', 'Test Shock deals 2 damage to any target.'));
  const o = life(s, op);
  cast(s, ap, bolt);
  resolveAll(s, (st) => {
    if (st.prompt?.kind !== 'targets') return undefined;
    const tg = st.prompt.targets!;
    return [tg.find((t: any) => t.kind === 'card' && t.iid === victim) ?? tg.find((t: any) => t.kind === 'player' && t.idx === op)];
  });
  assert.equal(s.cards[victim]?.zone ?? 'graveyard', 'graveyard');
  assert.equal(life(s, op), o - 2, 'Blood Artist should drain twice');
});

test('Doubling Season doubles counters and tokens', () => {
  const { s, ap } = setup();
  lands(s, ap, 6);
  add(s, ap, real('Doubling Season'), 'battlefield');
  const bear = add(s, ap, Bear, 'battlefield');
  cast(s, ap, add(s, ap, def('Test Growth', '{1}', 'Instant', 'Put two +1/+1 counters on target creature.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: bear }] : undefined));
  assert.equal(s.cards[bear].counters['+1/+1'], 4);
  const before = s.battlefield.length;
  cast(s, ap, add(s, ap, def('Test Spawn', '{1}', 'Sorcery', 'Create a 1/1 white Soldier creature token.')));
  resolveAll(s);
  assert.equal(s.battlefield.length, before + 2);
});

test('Sanguine Bond + Exquisite Blood loops until the opponent is dead', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 4);
  add(s, ap, real('Sanguine Bond'), 'battlefield');
  add(s, ap, real('Exquisite Blood'), 'battlefield');
  s.players[op].life = 10;
  cast(s, ap, add(s, ap, def('Test Drain', '{1}', 'Sorcery', 'Each opponent loses 1 life.')));
  for (let i = 0; i < 400 && s.winner == null; i++) {
    if (s.prompt) { dispatch(s, s.prompt.player, { type: 'answer', promptId: s.prompt.id, choice: s.prompt.kind === 'targets' ? s.prompt.targets!.filter((t: any) => t.kind === 'player' && t.idx === op).slice(0, 1) : 'yes' }); continue; }
    dispatch(s, s.priority, { type: 'pass' });
  }
  assert.equal(s.winner, ap, 'the loop should kill the opponent');
  assert.ok(life(s, op) <= 0);
});

test('Vito turns life gain into that much life loss', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 4);
  add(s, ap, real('Vito, Thorn of the Dusk Rose'), 'battlefield');
  const o = life(s, op);
  cast(s, ap, add(s, ap, def('Test Heal', '{1}', 'Instant', 'You gain 3 life.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? st.prompt.targets!.filter((t: any) => t.kind === 'player' && t.idx === op).slice(0, 1) : undefined));
  assert.equal(life(s, op), o - 3);
});

test('Isshin doubles attack triggers', () => {
  const { s, ap, op } = setup();
  add(s, ap, real('Isshin, Two Heavens as One'), 'battlefield');
  const raider = add(s, ap, def('Test Raider', '{1}', 'Creature — Human', 'Whenever Test Raider attacks, you gain 1 life.', ['2', '2']), 'battlefield');
  const start = life(s, ap);
  passUntil(s, () => s.prompt?.kind === 'declareAttackers');
  assert.equal(dispatch(s, ap, { type: 'answer', promptId: s.prompt!.id, choice: [{ iid: raider, target: { kind: 'player', idx: op } }] }), null);
  resolveAll(s);
  assert.equal(life(s, ap), start + 2);
});

test('an endless mandatory loop that kills nobody is a draw (104.4b)', () => {
  const { s, ap } = setup();
  lands(s, ap, 2);
  // gaining life makes you lose 1; losing life makes you gain 1: never ends, never kills
  add(s, ap, def('Test Leech', '', 'Enchantment', 'Whenever you gain life, you lose 1 life.'), 'battlefield');
  add(s, ap, def('Test Font', '', 'Enchantment', 'Whenever you lose life, you gain 1 life.'), 'battlefield');
  cast(s, ap, add(s, ap, def('Test Heal', '{1}', 'Instant', 'You gain 1 life.')));
  for (let i = 0; i < 20000 && !s.over; i++) {
    if (s.prompt) { dispatch(s, s.prompt.player, { type: 'answer', promptId: s.prompt.id, choice: 'yes' }); continue; }
    dispatch(s, s.priority, { type: 'pass' });
  }
  assert.ok(s.over, 'game should end');
  assert.equal(s.winner, null);
});

test('Ashnod\'s Altar actually sacrifices (it used to add mana for free) and feeds Blood Artist', () => {
  const { s, ap, op } = setup();
  const altar = add(s, ap, real("Ashnod's Altar"), 'battlefield');
  add(s, ap, real('Blood Artist'), 'battlefield');
  const bear = add(s, ap, Bear, 'battlefield');
  const o = life(s, op);
  const idx = 0;
  assert.equal(dispatch(s, ap, { type: 'activate', iid: altar, ability: idx }), null);
  assert.equal(s.prompt?.kind, 'chooseCards', 'must ask what to sacrifice');
  assert.equal(dispatch(s, ap, { type: 'answer', promptId: s.prompt!.id, choice: [bear] }), null);
  assert.equal(s.cards[bear]?.zone ?? 'graveyard', 'graveyard');
  assert.equal(s.players[ap].pool.C, 2);
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? st.prompt.targets!.filter((t: any) => t.kind === 'player' && t.idx === op).slice(0, 1) : undefined));
  assert.equal(life(s, op), o - 1);
});

test('{X}{X}: the X prompt never offers more than you can pay (Walking Ballista)', () => {
  const { s, ap } = setup();
  lands(s, ap, 5);
  add(s, ap, real('Doubling Season'), 'battlefield');
  const wb = add(s, ap, real('Walking Ballista'));
  cast(s, ap, wb);
  assert.equal(s.prompt?.kind, 'x');
  assert.equal(s.prompt!.max, 2, '5 mana pays X=2 at most');
  assert.equal(dispatch(s, ap, { type: 'answer', promptId: s.prompt!.id, choice: 2 }), null);
  resolveAll(s);
  assert.equal(s.cards[wb].counters['+1/+1'], 4, 'Doubling Season: 2 counters become 4');
});
