// Read ahead and cipher (src/engine/ext/sagacipher.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll, passUntil, dispatch, Bear, Forest } from './helpers';

const Saga = def('Test Tale', '{2}', 'Enchantment — Saga', 'Read ahead (Choose a chapter and start with that many lore counters. Add one after your draw step. Skipped chapters don\'t trigger. Sacrifice after III.)\nI — You gain 1 life.\nII — You gain 10 life.\nIII — Draw a card.');

test('read ahead: start on chapter II — chapter I never triggers', () => {
  const { s, ap } = setup();
  lands(s, ap, 2);
  const life = s.players[ap].life;
  const saga = add(s, ap, Saga);
  cast(s, ap, saga);
  resolveAll(s, (st) => (st.prompt?.kind === 'mode' && /read ahead/.test(st.prompt.title) ? ['1'] : undefined));
  assert.equal(s.cards[saga].counters.lore, 2);
  assert.equal(s.players[ap].life, life + 10, 'only chapter II');
});

test('read ahead: starting on chapter I behaves like a normal Saga', () => {
  const { s, ap } = setup();
  lands(s, ap, 2);
  const life = s.players[ap].life;
  const saga = add(s, ap, Saga);
  cast(s, ap, saga);
  resolveAll(s, (st) => (st.prompt?.kind === 'mode' ? ['0'] : undefined));
  assert.equal(s.cards[saga].counters.lore, 1);
  assert.equal(s.players[ap].life, life + 1);
});

test('cipher: encode on a creature, then copy the spell when it deals combat damage to a player', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 3);
  const bear = add(s, ap, Bear, 'battlefield');
  add(s, ap, Forest, 'library'); add(s, ap, Forest, 'library');
  const spell = add(s, ap, def('Test Whisper', '{1}', 'Sorcery', 'Draw a card.\nCipher (Then you may exile this spell card encoded on a creature you control. Whenever that creature deals combat damage to a player, its controller may cast a copy of the encoded card without paying its mana cost.)'));
  const hand0 = s.players[ap].hand.length; // includes the spell
  cast(s, ap, spell);
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? [bear] : undefined));
  assert.equal(s.cards[spell].zone, 'exile');
  assert.equal(s.players[ap].hand.length, hand0 - 1 + 1, 'drew one');
  // attack with the bear: the copy draws another card
  passUntil(s, () => s.prompt?.kind === 'declareAttackers');
  assert.equal(dispatch(s, ap, { type: 'answer', promptId: s.prompt!.id, choice: [{ iid: bear, target: { kind: 'player', idx: op } }] }), null);
  // no creatures on their side: the engine skips declare blockers and goes straight to damage
  let asked = false;
  for (let i = 0; i < 200 && !(s.step === 'main2' && !s.stack.length && !s.pendingTriggers.length); i++) {
    if (s.prompt) { asked ||= /Cipher/.test(s.prompt.title); assert.equal(dispatch(s, s.prompt.player, { type: 'answer', promptId: s.prompt.id, choice: s.prompt.kind === 'declareBlockers' ? [] : 'yes' }), null); continue; }
    dispatch(s, s.priority, { type: 'pass' });
  }
  assert.ok(asked, 'the cipher trigger asked to cast the copy');
  assert.equal(s.players[ap].hand.length, hand0 - 1 + 2, 'the cipher copy drew a second card');
});
