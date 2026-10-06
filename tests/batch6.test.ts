// src/engine/ext/batch6.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll, chars, Bear } from './helpers';

const top = (s: any, p: number, iid: string) => { const L = s.players[p].library; L.splice(L.indexOf(iid), 1); L.unshift(iid); };
const ARCH = 'Look at the top card of your library. If it\'s a Zombie card, you may reveal it and put it into your hand. If you don\'t put the card into your hand, you may put it into your graveyard.';

test('top card matches: into hand', () => {
  const { s, ap } = setup();
  lands(s, ap, 1);
  const z = add(s, ap, def('Test Zed', '{1}', 'Creature — Zombie', '', ['2', '2']), 'library'); top(s, ap, z);
  cast(s, ap, add(s, ap, def('Test Peek', '{1}', 'Sorcery', ARCH)));
  resolveAll(s);
  assert.equal(s.cards[z].zone, 'hand');
});

test('top card does not match: may mill it', () => {
  const { s, ap } = setup();
  lands(s, ap, 1);
  const b = add(s, ap, Bear, 'library'); top(s, ap, b);
  cast(s, ap, add(s, ap, def('Test Peek', '{1}', 'Sorcery', ARCH)));
  resolveAll(s);
  assert.equal(s.cards[b].zone, 'graveyard');
});

test('search for up to three cards named ~', () => {
  const { s, ap } = setup();
  lands(s, ap, 1);
  const D = def('Test Rats', '{1}', 'Sorcery', 'You may search your library for up to three cards named ~, reveal them, put them into your hand, then shuffle.');
  const xs = [add(s, ap, D, 'library'), add(s, ap, D, 'library')];
  cast(s, ap, add(s, ap, D));
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? st.prompt.cards : undefined));
  assert.ok(xs.every((x) => s.cards[x].zone === 'hand'));
});

test("owner's choice of top or bottom", () => {
  const { s, ap, op } = setup();
  lands(s, ap, 1);
  const b = add(s, op, Bear, 'battlefield');
  cast(s, ap, add(s, ap, def('Test Spin', '{1}', 'Instant', "Target creature's owner puts it on their choice of the top or bottom of their library.")));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: b }] : st.prompt?.kind === 'yesno' ? 'no' : undefined));
  assert.equal(s.cards[b].zone, 'library');
  assert.equal(s.players[op].library.at(-1), b);
});

test('aura: +1/+1 and unblockable', () => {
  const { s, ap } = setup();
  const bear = add(s, ap, Bear, 'battlefield');
  const a = add(s, ap, def('Test Cloak', '{U}', 'Enchantment — Aura', 'Enchant creature\nEnchanted creature gets +1/+1 and can\'t be blocked.'), 'battlefield');
  s.cards[a].attachedTo = bear;
  assert.equal(chars(s, bear).power, 3);
  assert.ok(chars(s, bear).unblockable);
});
