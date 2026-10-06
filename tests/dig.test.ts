// Library digging: reveal-until, the top card, and other players' libraries (src/engine/ext/dig.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll, Bear, Forest } from './helpers';

const lib = (s: any, p: number) => s.players[p].library as string[];
const name = (s: any, iid: string) => s.defs[s.cards[iid].defId].name;

test('reveal until a creature: it goes to hand, the rest to the bottom', () => {
  const { s, ap } = setup();
  lands(s, ap, 2);
  // library top → bottom: Forest, Forest, Bear, …
  const bear = add(s, ap, Bear, 'library');
  const f1 = add(s, ap, Forest, 'library');
  const f2 = add(s, ap, Forest, 'library');
  const spell = add(s, ap, def('Test Seek', '{1}', 'Sorcery', 'Reveal cards from the top of your library until you reveal a creature card. Put that card into your hand and the rest on the bottom of your library in a random order.'));
  cast(s, ap, spell);
  resolveAll(s);
  assert.equal(s.cards[bear].zone, 'hand');
  const L = lib(s, ap);
  assert.ok(L.slice(-2).includes(f1) && L.slice(-2).includes(f2), 'both Forests on the bottom');
});

test('reveal until onto the battlefield, with no match leaving everything on the bottom', () => {
  const { s, ap } = setup();
  lands(s, ap, 2);
  const art = add(s, ap, def('Test Relic', '{3}', 'Artifact', ''), 'library');
  add(s, ap, Forest, 'library');
  cast(s, ap, add(s, ap, def('Test Dig', '{1}', 'Sorcery', 'Reveal cards from the top of your library until you reveal an artifact card. Put that card onto the battlefield and the rest on the bottom of your library in a random order.')));
  resolveAll(s);
  assert.equal(s.cards[art].zone, 'battlefield');
  assert.equal(s.cards[art].controller, ap);
});

test('the top card: land goes onto the battlefield, otherwise to the bottom', () => {
  const { s, ap } = setup();
  lands(s, ap, 2);
  const top = add(s, ap, Bear, 'library');
  const txt = 'Reveal the top card of your library. If it\'s a land card, put it onto the battlefield. Otherwise, put it on the bottom of your library.';
  cast(s, ap, add(s, ap, def('Test Scout', '{1}', 'Sorcery', txt)));
  resolveAll(s);
  assert.equal(s.cards[top].zone, 'library');
  assert.equal(lib(s, ap).at(-1), top, 'non-land goes to the bottom');
  const land = add(s, ap, Forest, 'library');
  cast(s, ap, add(s, ap, def('Test Scout 2', '{1}', 'Sorcery', txt)));
  resolveAll(s);
  assert.equal(s.cards[land].zone, 'battlefield');
});

test('may put the top card into your graveyard', () => {
  const { s, ap } = setup();
  lands(s, ap, 2);
  const top = add(s, ap, Bear, 'library');
  cast(s, ap, add(s, ap, def('Test Peek', '{1}', 'Sorcery', 'Look at the top card of your library. You may put that card into your graveyard.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? [top] : undefined));
  assert.equal(s.cards[top].zone, 'graveyard');
});

test("look at the top two of target player's library and mill any number", () => {
  const { s, ap, op } = setup();
  lands(s, ap, 2);
  const a = add(s, op, Bear, 'library');
  const b = add(s, op, Forest, 'library'); // b on top
  cast(s, ap, add(s, ap, def('Test Mesmer', '{1}', 'Sorcery', "Look at the top two cards of target player's library, then put any number of them into that player's graveyard and the rest back on top in any order.")));
  resolveAll(s, (st) => {
    if (st.prompt?.kind === 'targets') return st.prompt.targets!.filter((t: any) => t.kind === 'player' && t.idx === op).slice(0, 1);
    if (st.prompt?.kind === 'chooseCards') return [b];
    return undefined;
  });
  assert.equal(s.cards[b].zone, 'graveyard');
  assert.equal(s.cards[b].owner, op);
  assert.equal(lib(s, op)[0], a, 'the other card stays on top of THEIR library');
  assert.ok(!lib(s, ap).includes(a));
});
