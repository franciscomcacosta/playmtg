// Distributing counters and conditional discounts (src/engine/ext/distribute.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll, Bear } from './helpers';

const Bounty = def('Test Bounty', '{G}', 'Instant', 'Distribute three +1/+1 counters among one, two, or three target creatures.');

test('distribute 3 counters among two creatures as chosen', () => {
  const { s, ap } = setup();
  lands(s, ap, 1);
  const a = add(s, ap, Bear, 'battlefield'), b = add(s, ap, Bear, 'battlefield');
  cast(s, ap, add(s, ap, Bounty));
  resolveAll(s, (st) => {
    if (st.prompt?.kind === 'targets') return [{ kind: 'card', iid: a }, { kind: 'card', iid: b }];
    if (st.prompt?.kind === 'divide') return [2, 1];
    return undefined;
  });
  assert.equal(s.cards[a].counters['+1/+1'], 2);
  assert.equal(s.cards[b].counters['+1/+1'], 1);
});

test('one target gets all the counters', () => {
  const { s, ap } = setup();
  lands(s, ap, 1);
  const a = add(s, ap, Bear, 'battlefield');
  cast(s, ap, add(s, ap, Bounty));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: a }] : undefined));
  assert.equal(s.cards[a].counters['+1/+1'], 3);
});

test('costs {1} less if you control a Wizard', () => {
  const { s, ap } = setup();
  const L = lands(s, ap, 3);
  add(s, ap, def('Test Wizard', '{1}', 'Creature — Human Wizard', '', ['1', '1']), 'battlefield');
  cast(s, ap, add(s, ap, def('Test Lore', '{2}{U}', 'Sorcery', 'This spell costs {1} less to cast if you control a Wizard.\nYou gain 1 life.')));
  resolveAll(s);
  assert.equal(L.filter((l) => s.cards[l].tapped).length, 2);
});

test('the second spell each turn costs {2} less', () => {
  const { s, ap } = setup();
  const L = lands(s, ap, 6);
  add(s, ap, def('Test Alisaie', '{3}', 'Creature — Elf', 'The second spell you cast each turn costs {2} less to cast.', ['2', '2']), 'battlefield');
  const spell = () => add(s, ap, def('Test Spell', '{3}', 'Sorcery', 'You gain 1 life.'));
  cast(s, ap, spell()); resolveAll(s);
  assert.equal(L.filter((l) => s.cards[l].tapped).length, 3, 'first spell: full cost');
  cast(s, ap, spell()); resolveAll(s);
  assert.equal(L.filter((l) => s.cards[l].tapped).length, 4, 'second spell: {1}');
});
