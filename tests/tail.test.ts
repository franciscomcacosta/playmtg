// Tests for src/engine/ext/tail.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll, passUntil, dispatch, chars, Bear, Forest } from './helpers';

test('counter unless pays {X}; replicate copies', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 10);
  const spell = add(s, op, def('Test Opp Heal', '{0}', 'Instant', 'You gain 1 life.'));
  s.priority = op;
  cast(s, op, spell);
  dispatch(s, op, { type: 'pass' });
  cast(s, ap, add(s, ap, def('Test Tax', '{X}{U}', 'Instant', 'Counter target spell unless its controller pays {X}.')), { });
  resolveAll(s, (st) => (st.prompt?.kind === 'x' ? 3 : st.prompt?.kind === 'targets' ? [st.prompt.targets![0]] : st.prompt?.kind === 'yesno' ? 'yes' : undefined));
  assert.equal(s.cards[spell].zone, 'graveyard');
  assert.equal(s.players[op].life, 20, 'countered: opponent had no mana');
  const life = s.players[ap].life;
  cast(s, ap, add(s, ap, def('Test Rep', '{1}', 'Instant', 'Replicate {1}\nYou gain 1 life.')), { alt: 'ext:replicate2' });
  resolveAll(s);
  assert.equal(s.players[ap].life, life + 3);
});

test('extra land, skip next turn, extra combat phase', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 4);
  cast(s, ap, add(s, ap, def('Test Explore', '{1}', 'Sorcery', 'You may play an additional land this turn.')));
  resolveAll(s);
  const f1 = add(s, ap, Forest); const f2 = add(s, ap, Forest);
  assert.equal(dispatch(s, ap, { type: 'playLand', iid: f1 }), null);
  assert.equal(dispatch(s, ap, { type: 'playLand', iid: f2 }), null);
  const b = add(s, ap, Bear, 'battlefield');
  s.cards[b].mods.push({ keywords: ['vigilance'], until: 'permanent', ts: s.ts++ } as any);
  cast(s, ap, add(s, ap, def('Test Relentless', '{1}', 'Sorcery', 'After this main phase, there is an additional combat phase followed by an additional main phase.')));
  resolveAll(s);
  for (let i = 0; i < 2; i++) {
    passUntil(s, () => s.prompt?.kind === 'declareAttackers');
    dispatch(s, ap, { type: 'answer', promptId: s.prompt!.id, choice: [{ iid: b, target: { kind: 'player', idx: op } }] });
    passUntil(s, () => s.step === 'main2' || s.step === 'main1');
  }
  assert.equal(s.players[op].life, 16, 'two combats');
  cast(s, ap, add(s, ap, def('Test Skip', '{0}', 'Sorcery', 'Target opponent skips their next turn.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'player', idx: op }] : undefined));
  const t = s.turn;
  passUntil(s, () => s.turn > t);
  assert.equal(s.active, ap, 'opponent turn skipped');
});

test('phantom prevention and detain', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 4);
  const ph = add(s, ap, def('Test Phantom', '{2}', 'Creature — Spirit', 'Test Phantom enters with two +1/+1 counters on it.\nIf damage would be dealt to Test Phantom, prevent that damage. Remove a +1/+1 counter from Test Phantom.', ['0', '0']), 'battlefield');
  s.cards[ph].counters['+1/+1'] = 2;
  cast(s, ap, add(s, ap, def('Test Bolt', '{0}', 'Instant', 'Test Bolt deals 3 damage to any target.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: ph }] : undefined));
  assert.equal(s.cards[ph].zone, 'battlefield');
  assert.equal(s.cards[ph].counters['+1/+1'], 1);
  const ob = add(s, op, Bear, 'battlefield');
  cast(s, ap, add(s, ap, def('Test Detain', '{0}', 'Sorcery', 'Detain target creature an opponent controls.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: ob }] : undefined));
  assert.ok((s.cards[ob] as any).detained);
});

test('modes: repeat the same mode; "choose one. activate only as a sorcery."', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 6);
  const c = add(s, ap, def('Test Confluence', '{3}', 'Instant', 'Choose three. You may choose the same mode more than once.\n• Test Confluence deals 1 damage to each opponent.\n• You gain 1 life.'));
  cast(s, ap, c);
  assert.equal(s.prompt?.kind, 'mode');
  assert.equal(dispatch(s, ap, { type: 'answer', promptId: s.prompt!.id, choice: ['0', '0', '0'] }), null);
  resolveAll(s);
  assert.equal(s.players[op].life, 17);
  const a = add(s, ap, def('Test Amp', '{1}', 'Artifact', '{0}, {T}: Choose one. Activate only as a sorcery.\n• You gain 2 life.\n• Draw a card.'), 'battlefield');
  const life = s.players[ap].life;
  assert.equal(dispatch(s, ap, { type: 'activate', iid: a, ability: 0 }), null);
  resolveAll(s);
  assert.equal(s.players[ap].life, life + 2);
});

test('wheel: discard hand then draw that many; hand pick; tutor to top; multikicker counters', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 10);
  for (let i = 0; i < 8; i++) add(s, ap, Forest, 'library');
  add(s, ap, Bear); add(s, ap, Bear);
  const w = add(s, ap, def('Test Wheel', '{1}', 'Sorcery', 'Discard all the cards in your hand, then draw that many cards.'));
  const before = s.players[ap].hand.length - 1;
  cast(s, ap, w);
  resolveAll(s);
  assert.equal(s.players[ap].hand.length, before);
  assert.ok(s.players[ap].graveyard.length >= before);
  const ob = add(s, op, Bear);
  cast(s, ap, add(s, ap, def('Test Pick', '{1}', 'Sorcery', 'Target opponent reveals their hand and you choose a nonland card from it. That player discards that card.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'player', idx: op }] : st.prompt?.kind === 'chooseCards' ? [ob] : undefined));
  assert.equal(s.cards[ob].zone, 'graveyard');
  const g = add(s, ap, def('Test Goblin', '{1}', 'Creature — Goblin', '', ['1', '1']), 'library');
  s.players[ap].library.push(s.players[ap].library.shift()!);
  cast(s, ap, add(s, ap, def('Test Harbinger', '{1}', 'Sorcery', 'Search your library for a Goblin card, reveal it, then shuffle and put that card on top.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? [g] : undefined));
  assert.equal(s.players[ap].library[0], g);
  const mk = add(s, ap, def('Test Kicker', '{1}', 'Creature — Beast', 'Multikicker {1}\nTest Kicker enters with a +1/+1 counter on it for each time it was kicked.', ['0', '0']));
  cast(s, ap, mk, { alt: 'ext:mk2' });
  resolveAll(s);
  assert.equal(chars(s, mk).power, 2);
});

test('"that player"/"they" from trigger events; twice each turn; can\'t block ~', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 6);
  add(s, ap, def('Test Wurm', '{2}', 'Creature — Wurm', 'Whenever a creature an opponent controls dies, that player loses 2 life.', ['6', '5']), 'battlefield');
  add(s, ap, def('Test Havoc', '{1}', 'Enchantment', 'Whenever an opponent casts a spell, they lose 1 life.'), 'battlefield');
  const ob = add(s, op, Bear, 'battlefield');
  cast(s, ap, add(s, ap, def('Test Kill', '{1}', 'Instant', 'Destroy target creature.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: ob }] : undefined));
  assert.equal(s.players[op].life, 18);
  assert.equal(s.players[ap].life, 20);
  const t = add(s, ap, def('Test Pinger', '{1}', 'Artifact', '{0}: You gain 1 life. Activate no more than twice each turn.'), 'battlefield');
  assert.equal(dispatch(s, ap, { type: 'activate', iid: t, ability: 0 }), null); resolveAll(s);
  assert.equal(dispatch(s, ap, { type: 'activate', iid: t, ability: 0 }), null); resolveAll(s);
  assert.ok(dispatch(s, ap, { type: 'activate', iid: t, ability: 0 }));
  assert.equal(s.players[ap].life, 22);
});
