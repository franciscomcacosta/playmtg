// src/engine/ext/batch10.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll, Bear, chars, dispatch, passUntil } from './helpers';

test('double power until end of turn', () => {
  const { s, ap } = setup();
  const b = add(s, ap, def('Test Big', '{1}', 'Creature — Bear', '', ['3', '3']), 'battlefield');
  lands(s, ap, 1);
  cast(s, ap, add(s, ap, def('Test Double', '{0}', 'Instant', "Double target creature's power until end of turn.")));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: b }] : undefined));
  assert.equal(chars(s, b).power, 6);
  assert.equal(chars(s, b).toughness, 3);
});

test('put target creature second from the top', () => {
  const { s, ap, op } = setup();
  const b = add(s, op, Bear, 'battlefield');
  lands(s, ap, 1);
  cast(s, ap, add(s, ap, def('Test Hold', '{0}', 'Instant', "Put target creature into its owner's library second from the top.")));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: b }] : undefined));
  assert.equal(s.players[op].library[1], b);
});

test('target opponent puts a card from hand on top', () => {
  const { s, ap, op } = setup();
  const h = s.players[op].hand.length;
  lands(s, ap, 1);
  cast(s, ap, add(s, ap, def('Test Brainbite', '{0}', 'Sorcery', 'Target opponent puts a card from their hand on top of their library.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'player', idx: op }] : st.prompt?.kind === 'chooseCards' ? [st.prompt.cards![0]] : undefined));
  assert.equal(s.players[op].hand.length, h - 1);
});

test("creature can't block power 2 or greater", () => {
  const { s, ap, op } = setup();
  const orc = add(s, op, def('Test Orcs', '{1}', 'Creature — Orc', "This creature can't block creatures with power 2 or greater.", ['3', '2']), 'battlefield');
  const a = add(s, ap, Bear, 'battlefield');
  s.cards[a].sick = false;
  void orc; void dispatch;
  assert.ok((chars(s, orc).pc as any).blockPowLimit);
});

test('Blightsteel: shuffled into library instead of the graveyard', () => {
  const { s, ap } = setup();
  const b = add(s, ap, def('Test Blight', '{12}', 'Artifact Creature — Golem', "Indestructible\nIf Test Blight would be put into a graveyard from anywhere, reveal Test Blight and shuffle it into its owner's library instead.", ['11', '11']), 'hand');
  lands(s, ap, 1);
  cast(s, ap, add(s, ap, def('Test Mind Rot', '{0}', 'Sorcery', 'Target player discards a card.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'player', idx: ap }] : st.prompt?.kind === 'chooseCards' ? [b] : undefined));
  assert.equal(s.cards[b].zone, 'library');
});

test('put into a graveyard from anywhere trigger (Kozilek-style)', () => {
  const { s, ap } = setup();
  const k = add(s, ap, def('Test Titan', '{10}', 'Legendary Creature — Eldrazi', "When Test Titan is put into a graveyard from anywhere, its owner shuffles their graveyard into their library.", ['12', '12']), 'library');
  const lib = s.players[ap].library; lib.splice(lib.indexOf(k), 1); lib.unshift(k);
  lands(s, ap, 1);
  cast(s, ap, add(s, ap, def('Test Mill', '{0}', 'Sorcery', 'Mill ten cards.')));
  resolveAll(s);
  assert.equal(s.cards[k].zone, 'library');
  assert.equal(s.players[ap].graveyard.length, 0);
});

test('end the turn: stack exiled, goes to the next turn', () => {
  const { s, ap } = setup();
  lands(s, ap, 1);
  const t0 = s.turn;
  const stop = add(s, ap, def('Test Stop', '{0}', 'Instant', 'End the turn.'));
  cast(s, ap, stop);
  resolveAll(s);
  assert.equal(s.cards[stop].zone, 'exile');
  assert.ok(s.turn > t0 || s.step === 'cleanup');
});

test('you lose the game', () => {
  const { s, ap } = setup();
  lands(s, ap, 1);
  cast(s, ap, add(s, ap, def('Test Death', '{0}', 'Sorcery', 'You lose the game.')));
  resolveAll(s);
  assert.ok(s.over);
});

test('cast ~ from your graveyard', () => {
  const { s, ap } = setup();
  lands(s, ap, 2);
  const g = add(s, ap, def('Test Gravecrawl', '{B}', 'Creature — Zombie', 'You may cast this card from your graveyard.', ['2', '1']), 'graveyard');
  const err = dispatch(s, ap, { type: 'cast', iid: g, alt: 'ext:gyself' } as any);
  assert.equal(err, null);
  resolveAll(s);
  assert.equal(s.cards[g].zone, 'battlefield');
});

test('Shallow Grave: top creature card returns with haste, exiled at end step', () => {
  const { s, ap } = setup();
  const b = add(s, ap, Bear, 'graveyard');
  lands(s, ap, 1);
  cast(s, ap, add(s, ap, def('Test Grave', '{0}', 'Instant', 'Return the top creature card of your graveyard to the battlefield. That creature gains haste until end of turn. Exile it at the beginning of the next end step.')));
  resolveAll(s);
  assert.equal(s.cards[b].zone, 'battlefield');
  assert.ok(chars(s, b).keywords.has('haste'));
  assert.equal(s.delayed.length, 1);
});

test('Searing Blood: delayed "when that creature dies this turn"', () => {
  const { s, ap, op } = setup();
  const b = add(s, op, Bear, 'battlefield');
  lands(s, ap, 1);
  cast(s, ap, add(s, ap, def('Test Searing', '{0}', 'Instant', "Test Searing deals 2 damage to target creature. When that creature dies this turn, Test Searing deals 3 damage to the creature's controller.")));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: b }] : undefined));
  assert.equal(s.cards[b].zone, 'graveyard');
  assert.equal(s.players[op].life, 17);
});

test("Pact: can't pay at your next upkeep → you lose", () => {
  const { s, ap } = setup();
  cast(s, ap, add(s, ap, def('Test Pact', '{0}', 'Instant', "Draw a card.\nAt the beginning of your next upkeep, pay {3}{U}{U}. If you don't, you lose the game.")));
  resolveAll(s);
  assert.equal(s.delayed.length, 1);
  passUntil(s, () => s.over || (s.turn > 2 && s.step === 'main1'), 400);
  assert.ok(s.over);
  assert.equal(s.players[ap].lost, true);
});

test('granted "when ~ dies, return it" until end of turn', () => {
  const { s, ap } = setup();
  const b = add(s, ap, Bear, 'battlefield');
  lands(s, ap, 1);
  cast(s, ap, add(s, ap, def('Test Endurance', '{0}', 'Instant', 'Until end of turn, target creature gets +2/+0 and gains "When this creature dies, return it to the battlefield tapped under its owner\'s control."')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: b }] : undefined));
  assert.equal(chars(s, b).power, 4);
  cast(s, ap, add(s, ap, def('Test Murder', '{0}', 'Instant', 'Destroy target creature.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: b }] : undefined));
  assert.equal(s.cards[b].zone, 'battlefield');
  assert.ok(s.cards[b].tapped);
});

test('channel: costs {1} less for each legendary creature you control', () => {
  const { s, ap, op } = setup();
  add(s, ap, def('Test Legend', '{2}', 'Legendary Creature — Human', '', ['2', '2']), 'battlefield');
  add(s, ap, def('Test Legend 2', '{2}', 'Legendary Creature — Elf', '', ['2', '2']), 'battlefield');
  const b = add(s, op, Bear, 'battlefield');
  const o = add(s, ap, def('Test Otawara', '', 'Legendary Land', "Channel — {3}{U}, Discard this card: Return target creature to its owner's hand. This ability costs {1} less to activate for each legendary creature you control."));
  lands(s, ap, 2);
  assert.equal(dispatch(s, ap, { type: 'activate', iid: o, ability: 0 }), null);
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: b }] : undefined));
  assert.equal(s.cards[b].zone, 'hand');
});

test('Mox Diamond: discard a land or it goes to the graveyard', () => {
  const { s, ap } = setup();
  const land = add(s, ap, def('Forest', '', 'Basic Land — Forest'));
  const mox = add(s, ap, def('Test Mox', '{0}', 'Artifact', "If this artifact would enter, you may discard a land card instead. If you do, put this artifact onto the battlefield. If you don't, put it into its owner's graveyard.\n{T}: Add one mana of any color."));
  cast(s, ap, mox);
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? [land] : undefined));
  assert.equal(s.cards[mox].zone, 'battlefield');
  assert.equal(s.cards[land].zone, 'graveyard');
  const mox2 = add(s, ap, def('Test Mox', '{0}', 'Artifact', "If this artifact would enter, you may discard a land card instead. If you do, put this artifact onto the battlefield. If you don't, put it into its owner's graveyard.\n{T}: Add one mana of any color."));
  for (const h of [...s.players[ap].hand]) if (/Land/.test(s.defs[s.cards[h].defId].typeLine)) s.cards[h].zone = 'exile', s.players[ap].hand.splice(s.players[ap].hand.indexOf(h), 1);
  cast(s, ap, mox2);
  resolveAll(s);
  assert.equal(s.cards[mox2].zone, 'graveyard');
});

test("you have hexproof: opponents can't target you", () => {
  const { s, ap, op } = setup();
  add(s, op, def('Test Leyline', '{2}{W}', 'Enchantment', 'You have hexproof.'), 'battlefield');
  lands(s, ap, 1);
  cast(s, ap, add(s, ap, def('Test Shock', '{0}', 'Instant', 'Test Shock deals 2 damage to any target.')));
  assert.equal(s.prompt?.kind, 'targets');
  assert.ok(!(s.prompt as any).targets.some((t: any) => t.kind === 'player' && t.idx === op));
  assert.ok((s.prompt as any).targets.some((t: any) => t.kind === 'player' && t.idx === ap));
});

test("Bolas's Citadel: cast the top card by paying life", () => {
  const { s, ap } = setup();
  add(s, ap, def('Test Citadel', '{3}{B}{B}{B}', 'Legendary Artifact', 'You may look at the top card of your library any time.\nYou may play lands and cast spells from the top of your library. If you cast a spell this way, pay life equal to its mana value rather than pay its mana cost.'), 'battlefield');
  const o = add(s, ap, def('Test Ogre', '{3}{G}', 'Creature — Ogre', '', ['5', '5']), 'library');
  const l = s.players[ap].library; l.splice(l.indexOf(o), 1); l.unshift(o);
  assert.equal(dispatch(s, ap, { type: 'cast', iid: o, alt: 'ext:citadel' } as any), null);
  resolveAll(s);
  assert.equal(s.cards[o].zone, 'battlefield');
  assert.equal(s.players[ap].life, 16);
});

test('Animate Dead returns a creature card and sacrifices it when it leaves', () => {
  const { s, ap, op } = setup();
  const g = add(s, op, def('Test Ogre', '{3}{G}', 'Creature — Ogre', '', ['5', '5']), 'graveyard');
  lands(s, ap, 2);
  const ad = add(s, ap, def('Test Animate', '{1}{B}', 'Enchantment — Aura', 'Enchant creature card in a graveyard\nWhen this Aura enters, if it\'s on the battlefield, it loses "enchant creature card in a graveyard" and gains "enchant creature put onto the battlefield with this Aura." Return enchanted creature card to the battlefield under your control and attach this Aura to it. When this Aura leaves the battlefield, that creature\'s controller sacrifices it.\nEnchanted creature gets -1/-0.'));
  cast(s, ap, ad);
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: g }] : undefined));
  assert.equal(s.cards[g].zone, 'battlefield');
  assert.equal(s.cards[g].controller, ap);
  assert.equal(chars(s, g).power, 4);
  cast(s, ap, add(s, ap, def('Test Erase', '{0}', 'Instant', 'Destroy target enchantment.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: ad }] : undefined));
  assert.equal(s.cards[g].zone, 'graveyard');
});
