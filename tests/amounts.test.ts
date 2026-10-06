// src/engine/ext/amounts.ts — plugin amounts evaluated through evalAmt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, Bear, Forest, Island } from './helpers';
import { parseCountPhrase } from '../src/engine/oracle';
import { evalAmt } from '../src/engine/rules';

const amt = (phrase: string) => { const a = parseCountPhrase(phrase); assert.ok(a, `parses: ${phrase}`); return a!; };

test('domain, devotion, life gained, life total', () => {
  const { s, ap } = setup();
  add(s, ap, Forest, 'battlefield'); add(s, ap, Forest, 'battlefield'); add(s, ap, Island, 'battlefield');
  assert.equal(evalAmt(s, amt('the number of basic land types among lands you control'), ap), 2);
  add(s, ap, def('Test Knight', '{B}{B}', 'Creature — Knight', '', ['2', '2']), 'battlefield');
  add(s, ap, def('Test Hybrid', '{1}{B/G}', 'Creature — Elf', '', ['1', '1']), 'battlefield');
  assert.equal(evalAmt(s, amt('your devotion to black'), ap), 3, 'BB + hybrid B/G');
  s.players[ap].lifeGainedThisTurn = 4;
  assert.equal(evalAmt(s, amt('the amount of life you gained this turn'), ap), 4);
  assert.equal(evalAmt(s, amt('your life total'), ap), 20);
});

test('counters on it, greatest power among creatures you control, "2 plus" combined', () => {
  const { s, ap, op } = setup();
  const c = add(s, ap, def('Test Lancer', '{2}', 'Creature — Soldier', '', ['1', '1']), 'battlefield');
  s.cards[c].counters['+1/+1'] = 3;
  assert.equal(evalAmt(s, amt('the number of +1/+1 counters on ~'), ap, c), 3);
  add(s, ap, def('Test Ogre', '{4}', 'Creature — Ogre', '', ['5', '5']), 'battlefield');
  add(s, op, def('Test Giant', '{6}', 'Creature — Giant', '', ['9', '9']), 'battlefield');
  assert.equal(evalAmt(s, amt('the greatest power among creatures you control'), ap), 5, 'only mine');
  assert.equal(evalAmt(s, amt('2 plus the number of +1/+1 counters on ~'), ap, c), 5);
});

test('creature cards in all graveyards / your graveyard', () => {
  const { s, ap, op } = setup();
  add(s, ap, Bear, 'graveyard'); add(s, op, Bear, 'graveyard'); add(s, ap, Forest, 'graveyard');
  assert.equal(evalAmt(s, amt('the number of creature cards in all graveyards'), ap), 2);
  assert.equal(evalAmt(s, amt('the number of creature cards in your graveyard'), ap), 1);
  void lands;
});

test('Matca Rioters (P/T = domain) computes without recursing', async () => {
  const { readFileSync } = await import('node:fs');
  const { chars } = await import('../src/engine/rules');
  const db = JSON.parse(readFileSync('data/cards.json', 'utf8'));
  const { s, ap } = setup();
  const r = add(s, ap, db.cards.find((c: any) => c.name === 'Matca Rioters'), 'battlefield');
  add(s, ap, Forest, 'battlefield'); add(s, ap, Island, 'battlefield');
  assert.equal(chars(s, r).power, 2);
});

test('party size, card types in all graveyards, "Zombies you control"', () => {
  const { s, ap, op } = setup();
  add(s, ap, def('Test Cleric', '{1}', 'Creature — Human Cleric', '', ['1', '1']), 'battlefield');
  add(s, ap, def('Test Wizard', '{1}', 'Creature — Human Wizard', '', ['1', '1']), 'battlefield');
  assert.equal(evalAmt(s, amt('the number of creatures in your party'), ap), 2);
  add(s, ap, Forest, 'graveyard'); add(s, op, Bear, 'graveyard'); add(s, op, def('Test Inst', '{1}', 'Instant', ''), 'graveyard');
  assert.equal(evalAmt(s, amt('the number of card types among cards in all graveyards'), ap), 3);
  assert.equal(evalAmt(s, amt('the number of card types among cards in your graveyard'), ap), 1);
  add(s, ap, def('Test Zombie', '{B}', 'Creature — Zombie', '', ['2', '2']), 'battlefield');
  add(s, op, def('Test Zombie', '{B}', 'Creature — Zombie', '', ['2', '2']), 'battlefield');
  assert.equal(evalAmt(s, amt('the number of zombies you control'), ap), 1);
});
