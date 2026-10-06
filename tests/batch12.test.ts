// src/engine/ext/batch11.ts (unless-you costs), batch12.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as helpers from './helpers';
import { api } from '../src/engine/engine';
import { setup, add, lands, def, cast, resolveAll } from './helpers';

const Hawk = def('Test Hawk', '{0}', 'Creature — Bird', "When this creature enters, sacrifice it unless you return an artifact you control to its owner's hand.", ['2', '2']);
test('sacrifice it unless you return an artifact: return one', () => {
  const { s, ap } = setup();
  const a = add(s, ap, def('Test Rock', '{0}', 'Artifact', ''), 'battlefield');
  const h = add(s, ap, Hawk);
  cast(s, ap, h);
  resolveAll(s, (st) => (st.prompt?.kind === 'yesno' ? 'yes' : undefined));
  assert.equal(s.cards[a].zone, 'hand');
  assert.equal(s.cards[h].zone, 'battlefield');
});
test('sacrifice it unless you return an artifact: none to return', () => {
  const { s, ap } = setup();
  const h = add(s, ap, Hawk);
  cast(s, ap, h);
  resolveAll(s, () => undefined);
  assert.equal(s.cards[h].zone, 'graveyard');
});
test('sacrifice it unless {U} was spent to cast it', () => {
  const { s, ap } = setup();
  lands(s, ap, 1);
  const h = add(s, ap, def('Test Herald', '{1}', 'Creature — Bird', 'When this creature enters, sacrifice it unless {U} was spent to cast it.', ['2', '2']));
  cast(s, ap, h);
  resolveAll(s, () => undefined);
  assert.equal(s.cards[h].zone, 'graveyard');
});

test('circle of protection: prevents the next damage from the chosen red source', () => {
  const { s, ap, op } = setup();
  const cop = add(s, ap, def('Test Circle', '{1}{W}', 'Enchantment', '{0}: The next time a red source of your choice would deal damage to you this turn, prevent that damage.'), 'battlefield');
  const bolt = add(s, op, def('Test Ogre', '{R}', 'Creature — Ogre', '', ['3', '3'], { colors: ['R'] }), 'battlefield');
  assert.equal(helpers.dispatch(s, ap, { type: 'activate', iid: cop, ability: 0 }), null);
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? [bolt] : undefined));
  assert.equal((s as any).nextDmg.length, 1);
  const life = s.players[ap].life;
  api.dealDamage(s, bolt, { kind: 'player', idx: ap }, 3, false);
  assert.equal(s.players[ap].life, life);
  api.dealDamage(s, bolt, { kind: 'player', idx: ap }, 3, false);
  assert.equal(s.players[ap].life, life - 3);
});

test('words of worship: next draw becomes gain 5 life', () => {
  const { s, ap } = setup();
  const w = add(s, ap, def('Test Words', '{2}{W}', 'Enchantment', '{1}: The next time you would draw a card this turn, you gain 5 life instead.'), 'battlefield');
  lands(s, ap, 1);
  assert.equal(helpers.dispatch(s, ap, { type: 'activate', iid: w, ability: 0 }), null);
  resolveAll(s, () => undefined);
  const hand = s.players[ap].hand.length, life = s.players[ap].life;
  api.drawCards(s, ap, 1);
  resolveAll(s, () => undefined);
  assert.equal(s.players[ap].hand.length, hand);
  assert.equal(s.players[ap].life, life + 5);
});

test('threshold: conditional color, pump and gated quoted ability', () => {
  const { s, ap } = setup();
  const c = add(s, ap, def('Test Thresh', '{1}{W}', 'Creature — Human', 'As long as there are seven or more cards in your graveyard, this creature gets +1/+1, is black, and has "{T}: Draw a card."', ['2', '2'], { colors: ['W'] }), 'battlefield');
  s.cards[c].sick = false;
  assert.equal(helpers.chars(s, c).power, 2);
  assert.deepEqual(helpers.chars(s, c).colors, ['W']);
  assert.notEqual(helpers.dispatch(s, ap, { type: 'activate', iid: c, ability: 0 }), null);
  for (let i = 0; i < 7; i++) add(s, ap, helpers.Bear, 'graveyard');
  assert.equal(helpers.chars(s, c).power, 3);
  assert.deepEqual(helpers.chars(s, c).colors, ['B']);
  const hand = s.players[ap].hand.length;
  assert.equal(helpers.dispatch(s, ap, { type: 'activate', iid: c, ability: 0 }), null);
  resolveAll(s, () => undefined);
  assert.equal(s.players[ap].hand.length, hand + 1);
});

test('tribute: declined → the ability happens; paid → counters', () => {
  for (const pay of [false, true]) {
    const { s, ap } = setup();
    const c = add(s, ap, def('Test Fanatic', '{0}', 'Creature — Centaur', "Tribute 1 (As this creature enters, an opponent of your choice may put a +1/+1 counter on it.)\nWhen this creature enters, if tribute wasn't paid, it gets +1/+1 and gains haste until end of turn.", ['3', '3']));
    cast(s, ap, c);
    resolveAll(s, (st) => (st.prompt?.kind === 'yesno' ? (pay ? 'yes' : 'no') : undefined));
    assert.equal(helpers.chars(s, c).power, 4);
    assert.equal(helpers.chars(s, c).keywords.has('haste'), !pay);
    assert.equal(s.cards[c].counters['+1/+1'] ?? 0, pay ? 1 : 0);
  }
});

test('if at least three white mana was spent, enters with a counter', () => {
  const W = def('Test Plains', '', 'Basic Land — Plains', '', undefined, {});
  for (const k of [2, 3]) {
    const { s, ap } = setup();
    lands(s, ap, k, W);
    lands(s, ap, 3 - k, helpers.Mountain);
    const c = add(s, ap, def('Test Paladin', '{2}{W}', 'Creature — Human', "If at least three white mana was spent to cast this spell, it enters with a +1/+1 counter on it.", ['2', '2']));
    cast(s, ap, c);
    resolveAll(s, () => undefined);
    assert.equal(s.cards[c].counters['+1/+1'] ?? 0, k === 3 ? 1 : 0);
  }
});

test('draw replacement: draw two instead (not replaced again); may skip declined → normal draw', () => {
  const { s, ap } = setup();
  for (let i = 0; i < 10; i++) add(s, ap, helpers.Bear, 'library');
  add(s, ap, def('Test Reflection', '{4}{U}', 'Enchantment', 'If you would draw a card, draw two cards instead.'), 'battlefield');
  const h = s.players[ap].hand.length;
  api.drawCards(s, ap, 1);
  resolveAll(s, () => undefined);
  assert.equal(s.players[ap].hand.length, h + 2);
  const t = setup();
  for (let i = 0; i < 10; i++) add(t.s, t.ap, helpers.Bear, 'library');
  add(t.s, t.ap, def('Test Familiar', '{R}', 'Creature — Lizard', 'If you would draw a card, you may skip that draw instead.', ['1', '1']), 'battlefield');
  const h2 = t.s.players[t.ap].hand.length;
  api.drawCards(t.s, t.ap, 1);
  resolveAll(t.s, (st) => (st.prompt?.kind === 'yesno' ? 'no' : undefined));
  assert.equal(t.s.players[t.ap].hand.length, h2 + 1);
});

test('cast trigger "from your hand" / "during an opponent\'s turn"', () => {
  const { s, ap } = setup();
  add(s, ap, def('Test Hand Watcher', '{1}', 'Enchantment', 'Whenever you cast an instant or sorcery spell from your hand, you gain 1 life.'), 'battlefield');
  add(s, ap, def('Test Opp Watcher', '{1}', 'Enchantment', "Whenever you cast an instant or sorcery spell during an opponent's turn, you gain 10 life."), 'battlefield');
  const life = s.players[ap].life;
  cast(s, ap, add(s, ap, def('Test Ping', '{0}', 'Instant', 'Draw a card.')));
  resolveAll(s, () => undefined);
  assert.equal(s.players[ap].life, life + 1);
});

test('reveal land: untapped only with a matching card in hand', () => {
  for (const has of [false, true]) {
    const { s, ap } = setup();
    if (has) add(s, ap, def('Test Plains', '', 'Basic Land — Plains'));
    const l = add(s, ap, def('Test Port', '', 'Land', "As this land enters, you may reveal a Plains or Island card from your hand. If you don't, this land enters tapped.\n{T}: Add {W} or {U}."));
    assert.equal(helpers.dispatch(s, ap, { type: 'playLand', iid: l } as any), null);
    assert.equal(s.cards[l].tapped, !has);
  }
});

test("arrest: enchanted creature's activated abilities can't be activated", () => {
  const { s, ap, op } = setup();
  void op;
  const b = add(s, ap, def('Test Pinger', '{1}', 'Creature — Wizard', '{T}: You gain 1 life.', ['1', '1']), 'battlefield');
  s.cards[b].sick = false;
  const b2 = add(s, ap, def('Test Pinger', '{1}', 'Creature — Wizard', '{T}: You gain 1 life.', ['1', '1']), 'battlefield');
  s.cards[b2].sick = false;
  const ar = add(s, ap, def('Test Arrest', '{0}', 'Enchantment — Aura', "Enchant creature\nEnchanted creature can't attack or block, and its activated abilities can't be activated."));
  cast(s, ap, ar);
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: b }] : undefined));
  assert.equal(s.cards[ar].attachedTo, b);
  assert.notEqual(helpers.dispatch(s, ap, { type: 'activate', iid: b, ability: 0 }), null);
  assert.equal(helpers.dispatch(s, ap, { type: 'activate', iid: b2, ability: 0 }), null);
});

test('excess damage is dealt to the controller', () => {
  const { s, ap, op } = setup();
  const b = add(s, op, helpers.Bear, 'battlefield');
  const life = s.players[op].life;
  cast(s, ap, add(s, ap, def('Test Spill', '{0}', 'Instant', "Test Spill deals 5 damage to target creature. Excess damage is dealt to that creature's controller instead.")));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: b }] : undefined));
  assert.equal(s.cards[b].zone, 'graveyard');
  assert.equal(s.players[op].life, life - 3);
});

test('en-Kor: the next 1 damage to ~ is dealt to target creature you control instead', () => {
  const { s, ap } = setup();
  const k = add(s, ap, def('Test en-Kor', '{0}', 'Creature — Kor', '{0}: The next 1 damage that would be dealt to this creature this turn is dealt to target creature you control instead.', ['1', '1']), 'battlefield');
  const b = add(s, ap, helpers.Bear, 'battlefield');
  assert.equal(helpers.dispatch(s, ap, { type: 'activate', iid: k, ability: 0 }), null);
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: b }] : undefined));
  api.dealDamage(s, b, { kind: 'card', iid: k }, 1, false);
  assert.equal(s.cards[k].damage, 0);
  assert.equal(s.cards[b].damage, 1);
});

test('worship floor, platinum angel, sphere prevention', () => {
  const { s, ap, op } = setup();
  const src = add(s, op, def('Test Red Ogre', '{R}', 'Creature — Ogre', '', ['5', '5'], { colors: ['R'] }), 'battlefield');
  add(s, ap, def('Test Sphere', '{3}', 'Artifact', 'If a red source would deal damage to you, prevent 2 of that damage.'), 'battlefield');
  s.players[ap].life = 10;
  api.dealDamage(s, src, { kind: 'player', idx: ap }, 5, false);
  assert.equal(s.players[ap].life, 7);
  add(s, ap, def('Test Worship', '{3}{W}', 'Enchantment', 'If you control a creature, damage that would reduce your life total to less than 1 reduces it to 1 instead.'), 'battlefield');
  add(s, ap, helpers.Bear, 'battlefield');
  api.dealDamage(s, src, { kind: 'player', idx: ap }, 20, false);
  assert.equal(s.players[ap].life, 1);
  const t = setup();
  add(t.s, t.ap, def('Test Platinum', '{7}', 'Artifact Creature — Angel', "You can't lose the game and your opponents can't win the game.", ['4', '4']), 'battlefield');
  t.s.players[t.ap].life = 0;
  resolveAll(t.s, () => undefined);
  assert.ok(!t.s.players[t.ap].lost);
});

test('fumigate gains life per creature destroyed; first creature spell costs less', () => {
  const { s, ap, op } = setup();
  add(s, op, helpers.Bear, 'battlefield'); add(s, op, helpers.Bear, 'battlefield'); add(s, ap, helpers.Bear, 'battlefield');
  const life = s.players[ap].life;
  cast(s, ap, add(s, ap, def('Test Fumigate', '{0}', 'Sorcery', 'Destroy all creatures. You gain 1 life for each creature destroyed this way.')));
  resolveAll(s, () => undefined);
  assert.equal(s.players[ap].life, life + 3);
  add(s, ap, def('Test Conduit', '{4}', 'Enchantment', 'The first creature spell you cast each turn costs {2} less to cast.'), 'battlefield');
  lands(s, ap, 2);
  cast(s, ap, add(s, ap, def('Test Ogre2', '{2}{R}', 'Creature — Ogre', '', ['3', '3'])));
  resolveAll(s, () => undefined);
  assert.notEqual(helpers.dispatch(s, ap, { type: 'cast', iid: add(s, ap, def('Test Ogre3', '{2}', 'Creature — Ogre', '', ['1', '1'])) }), null);
});

test('it gains suspend', () => {
  const { s, ap, op } = setup();
  const b = add(s, op, helpers.Bear, 'battlefield');
  cast(s, ap, add(s, ap, def('Test Suspend', '{0}', 'Instant', "Exile target creature and put two time counters on it. If it doesn't have suspend, it gains suspend.")));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: b }] : undefined));
  assert.equal(s.cards[b].zone, 'exile');
  assert.equal(s.cards[b].counters.time, 2);
  assert.ok((s.cards[b] as any).suspended);
});

test('target tax: spells your opponents cast that target ~ cost {2} more', () => {
  const { s, ap, op } = setup();
  const e = add(s, op, def('Test Boreal', '{4}{U}', 'Creature — Elemental', 'Spells your opponents cast that target this creature cost {2} more to cast.', ['3', '4']), 'battlefield');
  lands(s, ap, 1);
  const bolt = add(s, ap, def('Test Shock', '{0}', 'Instant', 'Test Shock deals 2 damage to any target.'));
  helpers.dispatch(s, ap, { type: 'cast', iid: bolt });
  try { resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: e }] : undefined)); } catch (err: any) { assert.match(String(err.message), /Not enough mana/); }
  assert.equal(s.cards[e].damage, 0);
  assert.notEqual(s.cards[bolt].zone, 'graveyard');
});
