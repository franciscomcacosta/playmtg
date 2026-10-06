// src/engine/ext/batch11.ts
import * as helpers from './helpers';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll, Bear, dispatch } from './helpers';

test('put target card from your graveyard on top of your library', () => {
  const { s, ap } = setup();
  const g = add(s, ap, Bear, 'graveyard');
  lands(s, ap, 1);
  cast(s, ap, add(s, ap, def('Test Recall', '{0}', 'Instant', 'Put target card from your graveyard on top of your library.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: g }] : undefined));
  assert.equal(s.players[ap].library[0], g);
});

test('tap or untap another target permanent', () => {
  const { s, ap, op } = setup();
  const b = add(s, op, Bear, 'battlefield');
  lands(s, ap, 1);
  cast(s, ap, add(s, ap, def('Test Twiddle', '{0}', 'Instant', 'You may tap or untap another target permanent.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: b }] : st.prompt?.kind === 'yesno' ? (st.prompt.options?.some((o: any) => o.id === 'tap') ? 'tap' : 'yes') : undefined));
  assert.ok(s.cards[b].tapped);
});

test('move a +1/+1 counter onto target creature', () => {
  const { s, ap } = setup();
  const src = add(s, ap, def('Test Mover', '{1}', 'Creature — Elf', '{0}: Move a +1/+1 counter from this creature onto target creature.', ['1', '1']), 'battlefield');
  s.cards[src].counters['+1/+1'] = 2;
  const b = add(s, ap, Bear, 'battlefield');
  assert.equal(dispatch(s, ap, { type: 'activate', iid: src, ability: 0 }), null);
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: b }] : undefined));
  assert.equal(s.cards[src].counters['+1/+1'], 1);
  assert.equal(s.cards[b].counters['+1/+1'], 1);
});

test('until your next turn: lasts through the opponent turn, ends in your untap step', () => {
  const { s, ap } = setup();
  const b = add(s, ap, Bear, 'battlefield');
  lands(s, ap, 1);
  cast(s, ap, add(s, ap, def('Test Guard', '{0}', 'Instant', 'Target creature gets +2/+2 until your next turn.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: b }] : undefined));
  const { chars, dispatch: d } = helpers;
  const go = (pred: () => boolean) => { for (let i = 0; i < 400 && !pred(); i++) { if (s.prompt) { d(s, s.prompt.player, { type: 'answer', promptId: s.prompt.id, choice: s.prompt.kind === 'chooseCards' ? s.prompt.cards!.slice(0, s.prompt.min) : [] } as any); continue; } d(s, s.priority, { type: 'pass' } as any); } };
  go(() => s.active !== ap && s.step === 'main1');
  assert.equal(chars(s, b).power, 4);
  go(() => s.active === ap && s.step === 'main1');
  assert.equal(chars(s, b).power, 2);
});

test("for as long as you control ~: ends when ~ leaves", () => {
  const { s, ap, op } = setup();
  const b = add(s, op, Bear, 'battlefield');
  lands(s, ap, 1);
  const t = add(s, ap, def('Test Tidebinder', '{0}', 'Creature — Merfolk', "When this creature enters, tap target creature an opponent controls. That creature doesn't untap during its controller's untap step for as long as you control this creature.", ['2', '2']));
  cast(s, ap, t);
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: b }] : undefined));
  assert.ok(s.cards[b].tapped);
  assert.ok(helpers.chars(s, b).noUntap);
  cast(s, ap, add(s, ap, def('Test Murder', '{0}', 'Instant', 'Destroy target creature.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: t }] : undefined));
  assert.ok(!helpers.chars(s, b).noUntap);
});

test('Doublecast: the next instant or sorcery this turn is copied', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 1);
  cast(s, ap, add(s, ap, def('Test Doublecast', '{0}', 'Sorcery', 'When you next cast an instant or sorcery spell this turn, copy that spell. You may choose new targets for the copy.')));
  resolveAll(s);
  cast(s, ap, add(s, ap, def('Test Shock', '{0}', 'Instant', 'Test Shock deals 2 damage to target player.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'player', idx: op }] : st.prompt?.kind === 'yesno' ? 'no' : undefined));
  assert.equal(s.players[op].life, 16);
});

test('Vexing Devil: opponent takes 4 or it stays', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 1);
  const v = add(s, ap, def('Test Devil', '{0}', 'Creature — Devil', 'When this creature enters, any opponent may have it deal 4 damage to them. If a player does, sacrifice this creature.', ['4', '3']));
  cast(s, ap, v);
  resolveAll(s, (st) => (st.prompt?.kind === 'yesno' ? 'yes' : undefined));
  assert.equal(s.players[op].life, 16);
  assert.equal(s.cards[v].zone, 'graveyard');
});

test('exile a card from your graveyard, copy it, cast the copy (paying)', () => {
  const { s, ap, op } = setup();
  const g = add(s, ap, def('Test Shock', '{R}', 'Instant', 'Test Shock deals 2 damage to any target.'), 'graveyard');
  lands(s, ap, 2);
  cast(s, ap, add(s, ap, def('Test Echo', '{0}', 'Sorcery', 'Exile target instant card from your graveyard and copy it. You may cast the copy.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? (st.prompt.targets!.some((t: any) => t.iid === g) ? [{ kind: 'card', iid: g }] : [{ kind: 'player', idx: op }]) : st.prompt?.kind === 'yesno' ? 'yes' : undefined));
  assert.equal(s.cards[g].zone, 'exile');
  assert.equal(s.players[op].life, 18);
});

test('equipped creature: list of clauses (pump, keyword, quoted ability, type)', () => {
  const { s, ap } = setup();
  const b = add(s, ap, Bear, 'battlefield');
  const e = add(s, ap, def('Test Lute', '{2}', 'Artifact — Equipment', 'Equipped creature gets +2/+2, has reach, and is a Bard in addition to its other types.\nEquip {1}'), 'battlefield');
  s.cards[e].attachedTo = b;
  const c = helpers.chars(s, b);
  assert.equal(c.power, 4);
  assert.ok(c.keywords.has('reach'));
  assert.ok(c.subtypes.has('bard') && c.subtypes.has('bear'));
});
