// src/engine/ext/soulbond.ts, batch10.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll } from './helpers';
import { chars } from '../src/engine/rules';

test('soulbond pairs and both creatures get the bonus', () => {
  const { s, ap } = setup();
  const bear = add(s, ap, def('Test Bear', '{1}{G}', 'Creature — Bear', '', ['2', '2']), 'battlefield');
  lands(s, ap, 2);
  const w = add(s, ap, def('Test Wolfir', '{2}', 'Creature — Wolf', 'Soulbond\nAs long as Test Wolfir is paired with another creature, each of those creatures gets +4/+4.', ['1', '1']));
  cast(s, ap, w);
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? [bear] : undefined));
  assert.equal(chars(s, bear).power, 6);
  assert.equal(chars(s, w).toughness, 5);
});

test('soulbond grants keywords; pairing ends when one leaves', () => {
  const { s, ap } = setup();
  const bear = add(s, ap, def('Test Bear', '{1}{G}', 'Creature — Bear', '', ['2', '2']), 'battlefield');
  lands(s, ap, 2);
  const w = add(s, ap, def('Test Lancer', '{2}', 'Creature — Human', 'Soulbond\nAs long as Test Lancer is paired with another creature, both creatures have first strike.', ['1', '1']));
  cast(s, ap, w);
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? [bear] : undefined));
  assert.ok(chars(s, bear).keywords.has('first strike'));
  s.battlefield.splice(s.battlefield.indexOf(w), 1); s.cards[w].zone = 'graveyard'; s.players[ap].graveyard.push(w);
  assert.ok(!chars(s, bear).keywords.has('first strike'));
});

test('ravenous: X counters and a card at X >= 5', () => {
  const { s, ap } = setup();
  lands(s, ap, 6);
  const hand = s.players[ap].hand.length;
  const r = add(s, ap, def('Test Gaunt', '{X}{G}', 'Creature — Tyranid', 'Ravenous', ['0', '0']));
  cast(s, ap, r);
  resolveAll(s, (st) => (st.prompt?.kind === 'x' ? 5 : undefined));
  assert.equal(s.cards[r].counters['+1/+1'], 5);
  assert.equal(s.players[ap].hand.length, hand + 1);
});

test("Enduring: returns as a non-creature enchantment", () => {
  const { s, ap } = setup();
  const e = add(s, ap, def('Test Enduring', '{2}{G}', 'Enchantment Creature — Elk', 'When Test Enduring dies, if it was a creature, return it to the battlefield under its owner\'s control. It\'s an enchantment. (It\'s not a creature.)', ['3', '3']), 'battlefield');
  lands(s, ap, 1);
  cast(s, ap, add(s, ap, def('Test Murder', '{0}', 'Instant', 'Destroy target creature.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: e }] : undefined));
  assert.equal(s.cards[e].zone, 'battlefield');
  assert.ok(!chars(s, e).types.has('creature'));
  assert.ok(chars(s, e).types.has('enchantment'));
});

test("Enduring: as a non-creature it doesn't come back again", () => {
  const { s, ap } = setup();
  const e = add(s, ap, def('Test Enduring', '{2}{G}', 'Enchantment Creature — Elk', 'When Test Enduring dies, if it was a creature, return it to the battlefield under its owner\'s control. It\'s an enchantment. (It\'s not a creature.)', ['3', '3']), 'battlefield');
  lands(s, ap, 1);
  cast(s, ap, add(s, ap, def('Test Murder', '{0}', 'Instant', 'Destroy target creature.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: e }] : undefined));
  cast(s, ap, add(s, ap, def('Test Erase', '{0}', 'Instant', 'Destroy target enchantment.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: e }] : undefined));
  assert.equal(s.cards[e].zone, 'graveyard');
});
