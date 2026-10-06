// Restricted mana ("Spend this mana only to cast a creature spell."): a separate pool, auto-tapped only when allowed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, def, cast, resolveAll, dispatch, castOptions, Bear } from './helpers';

const Ranch = def('Test Ranch', '', 'Land', '{T}: Add {C}{C}. Spend this mana only to cast a creature spell.');
const Ogre = def('Test Ogre', '{2}', 'Creature — Ogre', '', ['2', '2']);
const Draw = def('Test Draw', '{2}', 'Sorcery', 'You gain 2 life.');

test('auto-tap: restricted land pays for a creature spell', () => {
  const { s, ap } = setup();
  const land = add(s, ap, Ranch, 'battlefield');
  const o = add(s, ap, Ogre);
  assert.ok(castOptions(s, ap, o).some((x: any) => x.ok), 'castable');
  cast(s, ap, o);
  resolveAll(s);
  assert.equal(s.cards[o].zone, 'battlefield');
  assert.equal(s.cards[land].tapped, true);
});

test('auto-tap: restricted land does NOT pay for a sorcery', () => {
  const { s, ap } = setup();
  add(s, ap, Ranch, 'battlefield');
  const d = add(s, ap, Draw);
  assert.ok(!castOptions(s, ap, d).some((x: any) => x.ok), 'not castable with creature-only mana');
});

test('floating restricted mana: spent on a creature, refused for a sorcery, gone at end of step', () => {
  const { s, ap } = setup();
  const land = add(s, ap, Ranch, 'battlefield');
  assert.equal(dispatch(s, ap, { type: 'tapForMana', iid: land } as any) ?? null, null);
  assert.equal(s.players[ap].pool.C, 0, 'not in the normal pool');
  assert.equal((s.players[ap] as any).rpool.length, 2);
  const d = add(s, ap, Draw);
  assert.ok(!castOptions(s, ap, d).some((x: any) => x.ok));
  const o = add(s, ap, Ogre);
  cast(s, ap, o);
  resolveAll(s);
  assert.equal(s.cards[o].zone, 'battlefield');
  assert.equal((s.players[ap] as any).rpool.length, 0);
});

test('a dragon-only land with "or activate abilities of dragons" parses both halves', async () => {
  const { parseCard } = await import('../src/engine/oracle');
  const pc: any = parseCard(def('Test Crucible', '', 'Land', '{T}: Add one mana of any color. Spend this mana only to cast Dragon spells or activate abilities of Dragons.'));
  const r = pc.activated[0].ability.restrict;
  assert.deepEqual(r.spell.subtypes, ['dragon']);
  assert.deepEqual(r.ability.subtypes, ['dragon']);
});
