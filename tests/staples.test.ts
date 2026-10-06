// src/engine/ext/staples.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll, dispatch, chars, Bear } from './helpers';
import { drawCards } from '../src/engine/engine';

test("Narset: opponents can't draw more than one card each turn", () => {
  const { s, ap, op } = setup();
  add(s, ap, def('Test Narset', '{1}{U}{U}', 'Legendary Planeswalker — Narset', 'Each opponent can\'t draw more than one card each turn.', undefined, { loyalty: '5' } as any), 'battlefield');
  const h = s.players[op].hand.length;
  drawCards(s, op, 3);
  assert.equal(s.players[op].hand.length, h + 1);
});

test("Teferi's Protection: life can't change; permanents phase out", () => {
  const { s, ap, op } = setup();
  lands(s, ap, 3);
  const b = add(s, ap, Bear, 'battlefield');
  cast(s, ap, add(s, ap, def('Test Prot', '{2}{W}', 'Instant', "Until your next turn, your life total can't change and you gain protection from everything. All permanents you control phase out.")));
  resolveAll(s);
  assert.ok(s.cards[b].phasedOut);
  s.priority = op;
  cast(s, op, add(s, op, def('Test Zap', '', 'Instant', 'Test Zap deals 3 damage to each opponent.')));
  resolveAll(s);
  assert.equal(s.players[ap].life, 20);
  // protection from everything: not a legal target either
  s.priority = op;
  cast(s, op, add(s, op, def('Test Zap2', '', 'Instant', 'Test Zap2 deals 3 damage to target player.')));
  assert.ok(!((s.prompt as any)?.targets ?? []).some((t: any) => t.kind === 'player' && t.idx === ap));
});

test('Windfall: everyone draws the most discarded', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 3);
  for (let k = 0; k < 3; k++) add(s, op, Bear);
  const sp = add(s, ap, def('Test Windfall', '{2}{U}', 'Sorcery', 'Each player discards their hand, then draws cards equal to the greatest number of cards a player discarded this way.'));
  const most = Math.max(s.players[ap].hand.length - 1, s.players[op].hand.length);
  cast(s, ap, sp);
  resolveAll(s);
  assert.equal(s.players[ap].hand.length, most);
  assert.equal(s.players[op].hand.length, most);
});

test("Thassa's Oracle wins with a tiny library", () => {
  const { s, ap } = setup();
  lands(s, ap, 2);
  add(s, ap, def('Test Blue', '{U}{U}{U}', 'Enchantment', ''), 'battlefield');
  s.players[ap].library.splice(2);
  cast(s, ap, add(s, ap, def('Test Oracle', '{U}{U}', 'Creature — Merfolk Wizard', "When this creature enters, look at the top X cards of your library, where X is your devotion to blue. Put up to one of them on top of your library and the rest on the bottom of your library in a random order. If X is greater than or equal to the number of cards in your library, you win the game.", ['1', '3'])));
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? [] : undefined));
  assert.ok(s.over);
  assert.equal(s.winner, ap);
});

test('Fellwar Stone makes what opposing lands could make', () => {
  const { s, ap, op } = setup();
  const st = add(s, ap, def('Test Fellwar', '{2}', 'Artifact', '{T}: Add one mana of any color that a land an opponent controls could produce.'), 'battlefield');
  add(s, op, def('Mountain', '', 'Basic Land — Mountain', ''), 'battlefield');
  assert.equal(dispatch(s, ap, { type: 'tapForMana', iid: st }), null);
  assert.equal(s.players[ap].pool.R, 1);
});

test('Tarmogoyf and Death\'s Shadow', () => {
  const { s, ap, op } = setup();
  const g = add(s, ap, def('Test Goyf', '{1}{G}', 'Creature — Lhurgoyf', "Test Goyf's power is equal to the number of card types among cards in all graveyards and its toughness is equal to that number plus 1.", ['*', '1+*']), 'battlefield');
  add(s, op, Bear, 'graveyard');
  add(s, ap, def('Test Bolt', '{R}', 'Instant', ''), 'graveyard');
  assert.equal(chars(s, g).power, 2);
  assert.equal(chars(s, g).toughness, 3);
  const d = add(s, ap, def('Test Shadow', '{B}', 'Creature — Avatar', 'Test Shadow gets -X/-X, where X is your life total.', ['13', '13']), 'battlefield');
  s.players[ap].life = 5;
  assert.equal(chars(s, d).power, 8);
});

test('Snapcaster Mage: flashback for its mana cost, then exiled', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 4);
  const bolt = add(s, ap, def('Test Bolt', '{R}', 'Instant', 'Test Bolt deals 3 damage to any target.'), 'graveyard');
  cast(s, ap, add(s, ap, def('Test Snap', '{1}{U}', 'Creature — Human Wizard', 'Flash\nWhen this creature enters, target instant or sorcery card in your graveyard gains flashback until end of turn. The flashback cost is equal to its mana cost.', ['2', '1'])));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: bolt }] : undefined));
  assert.equal(dispatch(s, ap, { type: 'cast', iid: bolt, alt: 'flashback' } as any), null);
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'player', idx: op }] : undefined));
  assert.equal(s.players[op].life, 17);
  assert.equal(s.cards[bolt].zone, 'exile');
});

test('Chalice of the Void on 1 counters a one-drop; Eidolon pings', () => {
  const { s, ap, op } = setup();
  const ch = add(s, op, def('Test Chalice', '{X}{X}', 'Artifact', 'This artifact enters with X charge counters on it.\nWhenever a player casts a spell with mana value equal to the number of charge counters on this artifact, counter that spell.'), 'battlefield');
  s.cards[ch].counters.charge = 1;
  add(s, op, def('Test Eidolon', '{R}{R}', 'Enchantment Creature — Spirit', 'Whenever a player casts a spell with mana value 3 or less, this creature deals 2 damage to that player.', ['2', '2']), 'battlefield');
  lands(s, ap, 1);
  const one = add(s, ap, def('Test One', '{G}', 'Creature — Elf', '', ['1', '1'], { cmc: 1 }));
  assert.equal(dispatch(s, ap, { type: 'cast', iid: one }), null);
  resolveAll(s);
  assert.equal(s.cards[one].zone, 'graveyard');
  assert.equal(s.players[ap].life, 18);
});

test('Living End swaps graveyard and battlefield creatures', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 4);
  const onBf = add(s, op, Bear, 'battlefield');
  const inGy = add(s, ap, Bear, 'graveyard');
  cast(s, ap, add(s, ap, def('Test End', '{2}{B}{B}', 'Sorcery', 'Each player exiles all creature cards from their graveyard, then sacrifices all creatures they control, then puts all cards they exiled this way onto the battlefield.')));
  resolveAll(s);
  assert.equal(s.cards[onBf].zone, 'graveyard');
  assert.equal(s.cards[inGy].zone, 'battlefield');
});

test('Show and Tell: both players may put a permanent onto the battlefield', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 3);
  const mine = add(s, ap, Bear), theirs = add(s, op, Bear);
  cast(s, ap, add(s, ap, def('Test Show', '{2}{U}', 'Sorcery', 'Each player may put an artifact, creature, enchantment, or land card from their hand onto the battlefield.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? [st.prompt.player === ap ? mine : theirs] : undefined));
  assert.equal(s.cards[mine].zone, 'battlefield');
  assert.equal(s.cards[theirs].zone, 'battlefield');
  assert.equal(s.cards[theirs].controller, op);
});

test('Theros god is a creature only with enough devotion', () => {
  const { s, ap } = setup();
  const g = add(s, ap, def('Test God', '{3}{W}', 'Legendary Enchantment Creature — God', 'Indestructible\nAs long as your devotion to white is less than five, Test God isn\'t a creature.', ['5', '5']), 'battlefield');
  assert.ok(!chars(s, g).types.has('creature'));
  add(s, ap, def('Test WW', '{W}{W}{W}{W}', 'Enchantment', ''), 'battlefield');
  assert.ok(chars(s, g).types.has('creature'));
});

test('Underworld Breach: cast from graveyard by exiling three others', () => {
  const { s, ap, op } = setup();
  add(s, ap, def('Test Breach', '{1}{R}', 'Enchantment', "Each nonland card in your graveyard has escape. The escape cost is equal to the card's mana cost plus exile three other cards from your graveyard.\nAt the beginning of the end step, sacrifice this enchantment."), 'battlefield');
  lands(s, ap, 1);
  const bolt = add(s, ap, def('Test Bolt', '{R}', 'Instant', 'Test Bolt deals 3 damage to any target.'), 'graveyard');
  const others = [add(s, ap, Bear, 'graveyard'), add(s, ap, Bear, 'graveyard'), add(s, ap, Bear, 'graveyard')];
  assert.equal(dispatch(s, ap, { type: 'cast', iid: bolt, alt: 'ext:breach' } as any), null);
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? others : st.prompt?.kind === 'targets' ? [{ kind: 'player', idx: op }] : undefined));
  assert.equal(s.players[op].life, 17);
  assert.ok(others.every((o) => s.cards[o].zone === 'exile'));
  assert.equal(s.cards[bolt].zone, 'graveyard');
});
