// src/engine/ext/oneliners3.ts + "can't be regenerated" as part of destroy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll, passUntil, dispatch, chars, Bear, Forest } from './helpers';

const tgt = (iid: string) => (st: any) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid }] : undefined);
const tgtP = (op: number) => (st: any) => (st.prompt?.kind === 'targets' ? st.prompt.targets.filter((t: any) => t.kind === 'player' && t.idx === op).slice(0, 1) : undefined);

test('regeneration: a plain destroy is regenerated; "it can\'t be regenerated" (Terror) and Wrath are not', () => {
  for (const [text, all] of [['Destroy target creature.', false], ["Destroy target creature. It can't be regenerated.", false], ["Destroy all creatures. They can't be regenerated.", true]] as const) {
    const { s, ap, op } = setup();
    lands(s, ap, 4);
    const troll = add(s, op, Bear, 'battlefield');
    (s.cards[troll] as any).regen = 1;
    cast(s, ap, add(s, ap, def('Test Kill', '{1}', 'Sorcery', text)));
    resolveAll(s, all ? undefined : tgt(troll));
    const survived = s.cards[troll].zone === 'battlefield';
    assert.equal(survived, text === 'Destroy target creature.', text);
  }
});

test('discard up to two cards', () => {
  const { s, ap } = setup();
  lands(s, ap, 1);
  s.players[ap].hand.length = 0;
  const a = add(s, ap, Forest), b = add(s, ap, Forest), c = add(s, ap, Forest);
  cast(s, ap, add(s, ap, def('Test Loot', '{1}', 'Sorcery', 'Discard up to two cards.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? [a] : undefined));
  assert.equal(s.cards[a].zone, 'graveyard');
  assert.equal(s.cards[b].zone, 'hand');
  assert.equal(s.cards[c].zone, 'hand');
});

test('noncreature spells cost {1} more — for everyone', () => {
  const { s, ap } = setup();
  const L = lands(s, ap, 4);
  add(s, ap, def('Test Thalia', '{1}{W}', 'Creature — Human', 'Noncreature spells cost {1} more to cast.', ['2', '1']), 'battlefield');
  cast(s, ap, add(s, ap, def('Test Spell', '{1}', 'Sorcery', 'You gain 1 life.'))); resolveAll(s);
  assert.equal(L.filter((l) => s.cards[l].tapped).length, 2);
  cast(s, ap, add(s, ap, Bear)); resolveAll(s);
  assert.equal(L.filter((l) => s.cards[l].tapped).length, 4, 'creature spells unaffected ({1}{G})');
});

test('loses half their life, rounded up', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 1);
  s.players[op].life = 15;
  cast(s, ap, add(s, ap, def('Test Cut', '{1}', 'Sorcery', 'Target player loses half their life, rounded up.')));
  resolveAll(s, tgtP(op));
  assert.equal(s.players[op].life, 7);
});

test('return it to its owner\'s hand at the beginning of the next end step', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 1);
  const bear = add(s, ap, Bear, 'graveyard');
  cast(s, ap, add(s, ap, def('Test Unearth', '{B}', 'Sorcery', "Return target creature card from your graveyard to the battlefield. Return it to its owner's hand at the beginning of the next end step.")));
  resolveAll(s, tgt(bear));
  assert.equal(s.cards[bear].zone, 'battlefield');
  passUntil(s, () => s.active === op, 400);
  assert.equal(s.cards[bear].zone, 'hand');
});

test('target opponent exiles a card from their hand (they choose)', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 1);
  s.players[op].hand.length = 0;
  const a = add(s, op, Forest), b = add(s, op, Bear);
  let chooser = -1;
  cast(s, ap, add(s, ap, def('Test Raid', '{1}', 'Sorcery', 'Target opponent exiles a card from their hand.')));
  resolveAll(s, (st) => { if (st.prompt?.kind === 'chooseCards') { chooser = st.prompt.player; return [a]; } return tgtP(op)(st); });
  assert.equal(chooser, op);
  assert.equal(s.cards[a].zone, 'exile');
  assert.equal(s.cards[b].zone, 'hand');
});

test('target land becomes an Island until end of turn', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 1);
  const f = add(s, op, Forest, 'battlefield');
  cast(s, ap, add(s, ap, def('Test Tide', '{U}', 'Instant', 'Target land becomes an Island until end of turn.')));
  resolveAll(s, tgt(f));
  assert.ok(chars(s, f).subtypes.has('island') && !chars(s, f).subtypes.has('forest'));
});
