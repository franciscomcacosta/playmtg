// Colors of mana spent, and target-dependent discounts (src/engine/ext/spent.ts + payMana color tracking).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll, Bear, Forest, Mountain, Island } from './helpers';

const Crawler = def('Test Crawler', '{4}', 'Artifact Creature — Construct', 'This creature enters with a +1/+1 counter on it for each color of mana spent to cast it.', ['0', '0']);

test('a +1/+1 counter for each color of mana spent', () => {
  const { s, ap } = setup();
  add(s, ap, Forest, 'battlefield'); add(s, ap, Mountain, 'battlefield'); add(s, ap, Island, 'battlefield'); add(s, ap, Forest, 'battlefield');
  const c = add(s, ap, Crawler);
  cast(s, ap, c);
  resolveAll(s);
  assert.equal(s.cards[c].counters['+1/+1'], 3, 'green, red and blue were spent');
});

test('colorless mana adds no counters', () => {
  const { s, ap } = setup();
  for (let i = 0; i < 4; i++) add(s, ap, def('Test Wastes', '', 'Land', '{T}: Add {C}.'), 'battlefield');
  const c = add(s, ap, Crawler);
  cast(s, ap, c);
  resolveAll(s);
  assert.equal(s.cards[c].counters['+1/+1'] ?? 0, 0);
});

const Response = def('Test Response', '{4}{W}', 'Instant', 'This spell costs {3} less to cast if it targets a tapped creature.\nDestroy target creature.');

test('discount applies when it targets a tapped creature', () => {
  const { s, ap, op } = setup();
  const L = lands(s, ap, 5);
  const bear = add(s, op, Bear, 'battlefield');
  s.cards[bear].tapped = true;
  cast(s, ap, add(s, ap, Response));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: bear }] : undefined));
  assert.equal(s.cards[bear]?.zone ?? 'graveyard', 'graveyard');
  assert.equal(L.filter((l) => s.cards[l].tapped).length, 2, '{1}{W}');
});

test('no discount when the target is untapped, even if some tapped creature exists', () => {
  const { s, ap, op } = setup();
  const L = lands(s, ap, 5);
  const tapped = add(s, op, Bear, 'battlefield');
  s.cards[tapped].tapped = true;
  const untapped = add(s, op, Bear, 'battlefield');
  cast(s, ap, add(s, ap, Response));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: untapped }] : undefined));
  assert.equal(s.cards[untapped]?.zone ?? 'graveyard', 'graveyard');
  assert.equal(L.filter((l) => s.cards[l].tapped).length, 5, 'full {4}{W}');
});
