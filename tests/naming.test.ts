// "Choose a card name" and its follow-ups (src/engine/ext/naming.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll, Bear, Forest } from './helpers';
import { aiDecide } from '../src/engine/ai';

const Bolt = def('Test Bolt', '{R}', 'Instant', 'Test Bolt deals 3 damage to any target.');
const answers = (op: number, name: string) => (st: any) => {
  if (st.prompt?.kind === 'cardName') return name;
  if (st.prompt?.kind === 'targets') return st.prompt.targets.filter((t: any) => t.kind === 'player' && t.idx === op).slice(0, 1);
  return undefined;
};

test('name a card, then they discard every copy from their hand', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 2);
  s.players[op].hand.length = 0;
  const b1 = add(s, op, Bolt), b2 = add(s, op, Bolt), bear = add(s, op, Bear);
  cast(s, ap, add(s, ap, def('Test Therapy', '{B}', 'Sorcery', 'Choose a nonland card name. Target player reveals their hand and discards all cards with that name.')));
  resolveAll(s, answers(op, 'Test Bolt'));
  assert.equal(s.cards[b1].zone, 'graveyard');
  assert.equal(s.cards[b2].zone, 'graveyard');
  assert.equal(s.cards[bear].zone, 'hand');
});

test('search graveyard, hand and library for up to N and exile them', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 4);
  s.players[op].hand.length = 0;
  const g = add(s, op, Bolt, 'graveyard'), h = add(s, op, Bolt), l = add(s, op, Bolt, 'library'), extra = add(s, op, Bolt, 'library');
  cast(s, ap, add(s, ap, def('Test Vendetta', '{B}', 'Sorcery', "Choose a card name. Search target opponent's graveyard, hand, and library for up to three cards with that name and exile them. Then that player shuffles.")));
  resolveAll(s, answers(op, 'Test Bolt'));
  const exiled = [g, h, l, extra].filter((x) => s.cards[x].zone === 'exile');
  assert.equal(exiled.length, 3, 'only up to three');
});

test('Brain Pry: draw when they have no card with that name', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 2);
  add(s, ap, Forest, 'library');
  const hand = s.players[ap].hand.length;
  cast(s, ap, add(s, ap, def('Test Pry', '{1}', 'Sorcery', "Choose a nonland card name. Target player reveals their hand. That player discards a card with that name. If they can't, you draw a card.")));
  resolveAll(s, answers(op, 'Nothing Like This'));
  assert.equal(s.players[ap].hand.length, hand + 1, 'the drawn card (the spell was added after counting)');
});

test('Demonic Consultation: dig to the named card, exile the rest', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 2);
  const want = add(s, ap, Bear, 'library');
  const skip = add(s, ap, Forest, 'library');
  for (let i = 0; i < 6; i++) add(s, ap, Forest, 'library'); // the card exiles the top six first
  cast(s, ap, add(s, ap, def('Test Consult', '{B}', 'Instant', 'Choose a card name. Exile the top six cards of your library, then reveal cards from the top of your library until you reveal a card with the chosen name. Put that card into your hand and exile all other cards revealed this way.')));
  resolveAll(s, answers(op, 'Test Bear'));
  assert.equal(s.cards[want].zone, 'hand');
  assert.equal(s.cards[skip].zone, 'exile');
});

test('the AI names a card the opponent has visibly played, never a hidden one', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 2);
  add(s, op, Bolt, 'graveyard');
  add(s, op, Bear); // hidden in hand: must not be named
  cast(s, ap, add(s, ap, def('Test Therapy', '{B}', 'Sorcery', 'Choose a nonland card name. Target player reveals their hand and discards all cards with that name.')));
  let named = '';
  resolveAll(s, (st) => {
    if (st.prompt?.kind === 'cardName') { const a: any = aiDecide(st, st.prompt.player); named = a.choice; return a.choice; }
    return answers(op, '')(st);
  });
  assert.equal(named, 'Test Bolt');
});

test('flashback with a non-mana cost: Cabal Therapy sacrifices a creature and is exiled after', async () => {
  const { readFileSync } = await import('node:fs');
  const db = JSON.parse(readFileSync('data/cards.json', 'utf8'));
  const therapyDef = db.cards.find((c: any) => c.name === 'Cabal Therapy');
  const { s, ap, op } = setup();
  const therapy = add(s, ap, therapyDef, 'graveyard');
  const bear = add(s, ap, Bear, 'battlefield');
  s.players[op].hand.length = 0;
  const bolt = add(s, op, Bolt);
  const { dispatch } = await import('./helpers');
  assert.equal(dispatch(s, ap, { type: 'cast', iid: therapy, alt: 'flashback' } as any), null);
  resolveAll(s, (st) => {
    if (st.prompt?.kind === 'chooseCards' && st.prompt.cards!.includes(bear)) return [bear];
    return answers(op, 'Test Bolt')(st);
  });
  assert.equal(s.cards[bear].zone, 'graveyard', 'the creature was sacrificed as the cost');
  assert.equal(s.cards[bolt].zone, 'graveyard', 'named card discarded');
  assert.equal(s.cards[therapy].zone, 'exile', 'flashback exiles the spell');
});
