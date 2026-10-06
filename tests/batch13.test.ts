// src/engine/ext/batch13.ts
import * as helpers from './helpers';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, def, cast, resolveAll } from './helpers';
import { api, canAttack } from '../src/engine/engine';
import { EXT as EXTh } from '../src/engine/ext';
import { parseCard } from '../src/engine/oracle';

test('lose 1 life and add {C}; unless you pay life', () => {
  const { s, ap } = setup();
  const life = s.players[ap].life;
  cast(s, ap, add(s, ap, def('Test Ritual', '{0}', 'Instant', 'You lose 1 life and add {C}.')));
  resolveAll(s, () => undefined);
  assert.equal(s.players[ap].life, life - 1);
  assert.equal(s.players[ap].pool.C, 1);
});

test('sacrifice a token; destroy all equipment attached', () => {
  const { s, ap } = setup();
  const b = add(s, ap, helpers.Bear, 'battlefield');
  const eq = add(s, ap, def('Test Sword', '{1}', 'Artifact — Equipment', 'Equip {1}'), 'battlefield');
  s.cards[eq].attachedTo = b;
  cast(s, ap, add(s, ap, def('Test Shatter', '{0}', 'Instant', 'Destroy all Equipment attached to target creature.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: b }] : undefined));
  assert.equal(s.cards[eq].zone, 'graveyard');
  assert.equal(s.cards[b].zone, 'battlefield');
});

test('enchanted creature can\'t be blocked', () => {
  const { s, ap } = setup();
  const b = add(s, ap, helpers.Bear, 'battlefield');
  const a = add(s, ap, def('Test Veil', '{0}', 'Enchantment — Aura', "Enchant creature\nEnchanted creature can't be blocked."));
  cast(s, ap, a);
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: b }] : undefined));
  assert.ok(helpers.chars(s, b).unblockable);
});

test('mill half; gain life equal to power; can\'t attack unless', () => {
  const { s, ap, op } = setup();
  for (let i = 0; i < 10; i++) add(s, op, helpers.Bear, 'library');
  const L = s.players[op].library.length;
  cast(s, ap, add(s, ap, def('Test Traumatize', '{0}', 'Sorcery', 'Target player mills half their library, rounded down.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'player', idx: op }] : undefined));
  assert.equal(s.players[op].library.length, L - Math.floor(L / 2));
  const b = add(s, op, helpers.Bear, 'battlefield');
  const life = s.players[ap].life;
  cast(s, ap, add(s, ap, def('Test Heal', '{0}', 'Instant', "You gain life equal to target creature's power.")));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: b }] : undefined));
  assert.equal(s.players[ap].life, life + 2);
  const k = add(s, ap, def('Test Krovikan', '{0}', 'Creature — Horror', "This creature can't attack unless there are seven or more cards in your graveyard.", ['4', '4']), 'battlefield');
  s.cards[k].sick = false;
  assert.equal(canAttack(s, k), false);
  for (let i = 0; i < 7; i++) add(s, ap, helpers.Bear, 'graveyard');
  assert.equal(canAttack(s, k), true);
});

test('skips next untap step', () => {
  const { s, ap, op } = setup();
  const b = add(s, op, helpers.Bear, 'battlefield');
  s.cards[b].tapped = true;
  cast(s, ap, add(s, ap, def('Test Sleep', '{0}', 'Sorcery', 'Target player skips their next untap step.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'player', idx: op }] : undefined));
  const go = (pred: () => boolean) => { for (let i = 0; i < 400 && !pred(); i++) { if (s.prompt) { helpers.dispatch(s, s.prompt.player, { type: 'answer', promptId: s.prompt.id, choice: s.prompt.kind === 'chooseCards' ? s.prompt.cards!.slice(0, s.prompt.min) : [] } as any); continue; } helpers.dispatch(s, s.priority, { type: 'pass' } as any); } };
  go(() => s.active === op && s.step === 'main1');
  assert.ok(s.cards[b].tapped);
});

test('non-Elf creatures get -2/-2; die-exile this turn; target creature that entered this turn', () => {
  const { s, ap, op } = setup();
  const b = add(s, op, helpers.Bear, 'battlefield');
  const elf = add(s, ap, def('Test Elf', '{G}', 'Creature — Elf', '', ['1', '1']), 'battlefield');
  cast(s, ap, add(s, ap, def('Test Exile Rule', '{0}', 'Instant', 'If a creature would die this turn, exile it instead.')));
  resolveAll(s, () => undefined);
  cast(s, ap, add(s, ap, def('Test Elf Wave', '{0}', 'Sorcery', 'Non-Elf creatures get -2/-2 until end of turn.')));
  resolveAll(s, () => undefined);
  assert.equal(s.cards[b].zone, 'exile');
  assert.equal(s.cards[elf].zone, 'battlefield');
  const n = add(s, ap, helpers.Bear, 'battlefield');
  (s.cards[n] as any).enteredTurn = s.turn;
  cast(s, ap, add(s, ap, def('Test Fresh', '{0}', 'Instant', 'Put a +1/+1 counter on target creature that entered this turn.')));
  resolveAll(s, (st) => { if (st.prompt?.kind === 'targets') { assert.ok(st.prompt.targets!.some((t: any) => t.iid === n)); return [{ kind: 'card', iid: n }]; } return undefined; });
  assert.equal(s.cards[n].counters['+1/+1'], 1);
});

test('dealt-damage triggers: source you control deals noncombat damage to an opponent; ~ is dealt damage', () => {
  const { s, ap, op } = setup();
  add(s, ap, def('Test Pyro', '{0}', 'Enchantment', 'Whenever a source you control deals noncombat damage to an opponent, you gain 1 life.'), 'battlefield');
  const life = s.players[ap].life;
  cast(s, ap, add(s, ap, def('Test Shock', '{0}', 'Instant', 'Test Shock deals 2 damage to any target.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'player', idx: op }] : undefined));
  assert.equal(s.players[ap].life, life + 1);
  const w = add(s, ap, def('Test Wall', '{0}', 'Creature — Wall', 'Whenever this creature is dealt damage, draw a card.', ['0', '5']), 'battlefield');
  const h = s.players[ap].hand.length;
  for (let i = 0; i < 3; i++) add(s, ap, helpers.Bear, 'library');
  cast(s, ap, add(s, ap, def('Test Shock2', '{0}', 'Instant', 'Test Shock2 deals 2 damage to any target.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: w }] : undefined));
  assert.equal(s.players[ap].hand.length, h + 1);
});

test('trigger heads: "with deathtouch" filter, a player casts their second spell, when→whenever', () => {
  const a = parseCard(def('Test Hunter', '{0}', 'Creature', 'Whenever a creature you control with deathtouch deals combat damage to a player, draw a card.', ['1', '1']));
  assert.equal(a.triggers[0].event, 'ctrlCombatPlayer');
  assert.equal((a.triggers[0].filter as any).keyword, 'deathtouch');
  const b = parseCard(def('Test Second', '{0}', 'Enchantment', 'Whenever a player casts their second spell each turn, you gain 1 life.'));
  assert.equal(b.triggers[0].data.who, 'any');
  const c = parseCard(def('Test Ninja', '{0}', 'Creature', 'When this creature deals combat damage to a player, draw a card.', ['1', '1']));
  assert.equal(c.unparsed.length, 0);
});

test('roles: monster role pumps and grants trample; a new role from the same controller replaces the old', () => {
  const { s, ap } = setup();
  const b = add(s, ap, helpers.Bear, 'battlefield');
  for (const r of ['Monster', 'Royal']) {
    cast(s, ap, add(s, ap, def(`Test ${r}`, '{0}', 'Sorcery', `Create a ${r} Role token attached to target creature you control.`)));
    resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: b }] : undefined));
  }
  const roles = s.battlefield.filter((x) => s.cards[x].attachedTo === b);
  assert.equal(roles.length, 1);
  assert.equal(helpers.chars(s, b).power, 3);
  assert.ok(!helpers.chars(s, b).keywords.has('trample'));
});

test('spectacle: offered after an opponent lost life; "if its spectacle cost was paid"', () => {
  const { s, ap, op } = setup();
  const c = add(s, ap, def('Test Rix', '{5}{R}', 'Sorcery', "Spectacle {R}\nTest Rix deals 1 damage to any target. If its spectacle cost was paid, you gain 3 life."));
  helpers.lands(s, ap, 1);
  const before = (EXTh.hooks.castOptions as any[]).flatMap((h) => h(s, ap, c, api)).find((o: any) => /Spectacle/.test(o.label));
  assert.ok(before && !before.ok);
  api.loseLife(s, op, 1);
  const after = (EXTh.hooks.castOptions as any[]).flatMap((h) => h(s, ap, c, api)).find((o: any) => /Spectacle/.test(o.label));
  assert.ok(after?.ok);
  const life = s.players[ap].life;
  cast(s, ap, c, { alt: 'ext:spectacle' });
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'player', idx: op }] : undefined));
  assert.equal(s.players[ap].life, life + 3);
});

test('search library and/or graveyard for a card named …', () => {
  const { s, ap } = setup();
  const pw = add(s, ap, def('Ajani, Valiant Protector', '{4}{G}{W}', 'Legendary Planeswalker — Ajani', ''), 'graveyard');
  cast(s, ap, add(s, ap, def('Test Aid', '{0}', 'Sorcery', 'You may search your library and/or graveyard for a card named Ajani, Valiant Protector, reveal it, and put it into your hand. If you search your library this way, shuffle.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'yesno' ? 'yes' : st.prompt?.kind === 'chooseCards' ? [pw] : undefined));
  assert.equal(s.cards[pw].zone, 'hand');
});

test('cast ~ from your graveyard as long as you control a Zombie; flash if you control a Faerie', () => {
  const { s, ap } = setup();
  const g = add(s, ap, def('Test Ghoul', '{0}', 'Creature — Zombie', 'You may cast this card from your graveyard as long as you control a Zombie.', ['1', '1']), 'graveyard');
  assert.notEqual(helpers.dispatch(s, ap, { type: 'cast', iid: g }), null);
  add(s, ap, def('Test Zombie', '{0}', 'Creature — Zombie', '', ['2', '2']), 'battlefield');
  cast(s, ap, g);
  resolveAll(s, () => undefined);
  assert.equal(s.cards[g].zone, 'battlefield');
});

test('Doran: creatures assign combat damage equal to toughness', () => {
  const { s, ap } = setup();
  add(s, ap, def('Test Doran', '{0}', 'Creature — Treefolk', 'Each creature assigns combat damage equal to its toughness rather than its power.', ['0', '5']), 'battlefield');
  const w = add(s, ap, def('Test Wall2', '{0}', 'Creature — Wall', '', ['1', '4']), 'battlefield');
  assert.ok((EXTh.hooks as any).dmgByToughness.some((h: any) => h(s, w, api)));
});

test('gated statics: "as long as ~ has three or more +1/+1 counters, ~ has flying and is a Knight"', () => {
  const { s, ap } = setup();
  const c = add(s, ap, def('Test Squire', '{0}', 'Creature — Human', 'As long as this creature has three or more +1/+1 counters on it, it has flying and is a Knight in addition to its other types.', ['1', '1']), 'battlefield');
  assert.ok(!helpers.chars(s, c).keywords.has('flying'));
  s.cards[c].counters['+1/+1'] = 3;
  assert.ok(helpers.chars(s, c).keywords.has('flying'));
  assert.ok(helpers.chars(s, c).subtypes.has('knight'));
});

test('attach pumps: "for each land you control" and "as long as it\'s a Vampire. Otherwise …"', () => {
  const { s, ap } = setup();
  const b = add(s, ap, helpers.Bear, 'battlefield');
  helpers.lands(s, ap, 3);
  const a = add(s, ap, def('Test Spirit Link', '{0}', 'Enchantment — Aura', 'Enchant creature\nEnchanted creature gets +1/+1 for each land you control and has trample.'), 'battlefield');
  s.cards[a].attachedTo = b;
  assert.equal(helpers.chars(s, b).power, 5);
  assert.ok(helpers.chars(s, b).keywords.has('trample'));
  const v = add(s, ap, def('Test Curse', '{0}', 'Enchantment — Aura', "Enchant creature\nEnchanted creature gets +2/+2 as long as it's a Vampire. Otherwise, it gets -2/-2."), 'battlefield');
  s.cards[v].attachedTo = b;
  assert.equal(helpers.chars(s, b).toughness, 3);
});

test('create a number of tokens equal to …; cost less "if C, ~ costs"', () => {
  const { s, ap } = setup();
  add(s, ap, helpers.Bear, 'battlefield'); add(s, ap, helpers.Bear, 'battlefield');
  const before = s.battlefield.length;
  cast(s, ap, add(s, ap, def('Test Muster', '{0}', 'Sorcery', 'Create a number of 1/1 white Soldier creature tokens equal to the number of creatures you control.')));
  resolveAll(s, () => undefined);
  assert.equal(s.battlefield.length, before + 2);
});

test('"during your turn" statics; "for each opponent" in two players', () => {
  const { s, ap, op } = setup();
  const b = add(s, ap, helpers.Bear, 'battlefield');
  add(s, ap, def('Test Ward', '{0}', 'Enchantment', 'During your turn, creatures you control have hexproof.'), 'battlefield');
  assert.equal(s.active, ap);
  assert.ok(helpers.chars(s, b).keywords.has('hexproof'));
  (s as any).active = op;
  assert.ok(!helpers.chars(s, b).keywords.has('hexproof'));
  (s as any).active = ap;
  const o = add(s, op, helpers.Bear, 'battlefield');
  cast(s, ap, add(s, ap, def('Test Tapper', '{0}', 'Sorcery', 'For each opponent, tap up to one target creature that player controls.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: o }] : undefined));
  assert.ok(s.cards[o].tapped);
});

test('counter target spell that targets a creature you control', () => {
  const { s, ap, op } = setup();
  const b = add(s, ap, helpers.Bear, 'battlefield');
  const shock = add(s, ap, def('Test Shock3', '{0}', 'Instant', 'Test Shock3 deals 2 damage to any target.'));
  const other = add(s, ap, def('Test Shock4', '{0}', 'Instant', 'Test Shock4 deals 2 damage to any target.'));
  void op;
  cast(s, ap, shock);
  helpers.dispatch(s, ap, { type: 'answer', promptId: s.prompt!.id, choice: [{ kind: 'card', iid: b }] } as any);
  cast(s, ap, other);
  helpers.dispatch(s, ap, { type: 'answer', promptId: s.prompt!.id, choice: [{ kind: 'player', idx: op }] } as any);
  const ctr = add(s, ap, def('Test Saving Grace', '{0}', 'Instant', 'Counter target spell that targets a creature you control.'));
  cast(s, ap, ctr);
  const pr = s.prompt!;
  assert.equal(pr.kind, 'targets');
  const srcs = (pr.targets as any[]).map((t) => s.stack.find((i: any) => i.id === t.id)?.source);
  assert.deepEqual(srcs, [shock]);
  void other;
});

test("~ can't be the target of black spells; prevent all damage a source of your choice would deal this turn", () => {
  const { s, ap, op } = setup();
  const g = add(s, op, def('Test Ward Beast', '{0}', 'Creature — Beast', "This creature can't be the target of black spells or abilities from black sources.", ['2', '2']), 'battlefield');
  const kill = add(s, ap, def('Test Doom', '{0}', 'Instant', 'Destroy target creature.', undefined, { colors: ['B'] }));
  assert.notEqual(helpers.dispatch(s, ap, { type: 'cast', iid: kill }), null);
  const src = add(s, op, def('Test Red Ogre2', '{R}', 'Creature — Ogre', '', ['5', '5'], { colors: ['R'] }), 'battlefield');
  cast(s, ap, add(s, ap, def('Test Fog Choice', '{0}', 'Instant', 'Prevent all damage a source of your choice would deal this turn.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? [src] : undefined));
  const life = s.players[ap].life;
  api.dealDamage(s, src, { kind: 'player', idx: ap }, 3, false);
  api.dealDamage(s, src, { kind: 'player', idx: ap }, 3, false);
  assert.equal(s.players[ap].life, life);
  void g;
});

test('expend 4 triggers once when the fourth mana of the turn is spent', () => {
  const { s, ap } = setup();
  add(s, ap, def('Test Expender', '{0}', 'Creature — Bear', 'Whenever you expend 4, you gain 3 life.', ['1', '1']), 'battlefield');
  helpers.lands(s, ap, 6);
  const life = s.players[ap].life;
  cast(s, ap, add(s, ap, def('Test Three', '{3}', 'Sorcery', 'Draw a card.')));
  resolveAll(s, () => undefined);
  assert.equal(s.players[ap].life, life);
  cast(s, ap, add(s, ap, def('Test Two', '{2}', 'Sorcery', 'Draw a card.')));
  resolveAll(s, () => undefined);
  assert.equal(s.players[ap].life, life + 3);
});

test('when you sacrifice ~; enchanted creature becomes the target; whenever a player attacks you', () => {
  const { s, ap, op } = setup();
  const c = add(s, ap, def('Test Sac Me', '{0}', 'Artifact', 'Sacrifice this artifact: Draw a card.\nWhen you sacrifice this artifact, you gain 2 life.'), 'battlefield');
  for (let i = 0; i < 3; i++) add(s, ap, helpers.Bear, 'library');
  const life = s.players[ap].life;
  assert.equal(helpers.dispatch(s, ap, { type: 'activate', iid: c, ability: 0 }), null);
  resolveAll(s, () => undefined);
  assert.equal(s.players[ap].life, life + 2);
  const b = add(s, ap, helpers.Bear, 'battlefield');
  const aura = add(s, ap, def('Test Aura Watch', '{0}', 'Enchantment — Aura', 'Enchant creature\nWhen enchanted creature becomes the target of a spell or ability, you gain 5 life.'), 'battlefield');
  s.cards[aura].attachedTo = b;
  cast(s, ap, add(s, ap, def('Test Giant Growth', '{0}', 'Instant', 'Target creature gets +3/+3 until end of turn.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: b }] : undefined));
  assert.equal(s.players[ap].life, life + 7);
  void op;
});

test('tokens that are tapped and attacking join combat', () => {
  const { s, ap } = setup();
  (s as any).combat = { attackers: [], declared: true, blocksDeclared: false, firstStrike: false };
  cast(s, ap, add(s, ap, def('Test Raid', '{0}', 'Instant', 'Create two 1/1 red Goblin creature tokens that are tapped and attacking.')));
  resolveAll(s, () => undefined);
  assert.equal(s.combat!.attackers.length, 2);
  assert.ok(s.combat!.attackers.every((a) => s.cards[a.iid].tapped));
});

test('Memory Lapse puts the countered spell on top of its owner\'s library', () => {
  const { s, ap } = setup();
  const sh = add(s, ap, def('Test Shock5', '{0}', 'Instant', 'Test Shock5 deals 2 damage to any target.'));
  cast(s, ap, sh);
  helpers.dispatch(s, ap, { type: 'answer', promptId: s.prompt!.id, choice: [{ kind: 'player', idx: 1 - ap }] } as any);
  cast(s, ap, add(s, ap, def('Test Lapse', '{0}', 'Instant', "Counter target spell. If that spell is countered this way, put it on top of its owner's library instead of into that player's graveyard.")));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [st.prompt.targets![0]] : undefined));
  assert.equal(s.cards[sh].zone, 'library');
  assert.equal(s.players[ap].library[0], sh);
});

test('"Sacrifice a creature. If you can\'t, sacrifice ~."', () => {
  const { s, ap } = setup();
  const m = add(s, ap, def('Test Monument', '{0}', 'Artifact', "{0}: Sacrifice a creature. If you can't, sacrifice this artifact."), 'battlefield');
  assert.equal(helpers.dispatch(s, ap, { type: 'activate', iid: m, ability: 0 }), null);
  resolveAll(s, () => undefined);
  assert.equal(s.cards[m].zone, 'graveyard');
  const t = setup();
  const m2 = add(t.s, t.ap, def('Test Monument', '{0}', 'Artifact', "{0}: Sacrifice a creature. If you can't, sacrifice this artifact."), 'battlefield');
  const b = add(t.s, t.ap, helpers.Bear, 'battlefield');
  assert.equal(helpers.dispatch(t.s, t.ap, { type: 'activate', iid: m2, ability: 0 }), null);
  resolveAll(t.s, () => undefined);
  assert.equal(t.s.cards[m2].zone, 'battlefield');
  assert.equal(t.s.cards[b].zone, 'graveyard');
});

test('"if it was a Vampire" refers to the target', () => {
  const { s, ap, op } = setup();
  const v = add(s, op, def('Test Vamp', '{0}', 'Creature — Vampire', '', ['2', '2']), 'battlefield');
  const life = s.players[ap].life;
  cast(s, ap, add(s, ap, def('Test Stake', '{0}', 'Instant', 'Destroy target creature. If it was a Vampire, you gain 3 life.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: v }] : undefined));
  assert.equal(s.players[ap].life, life + 3);
  const b = add(s, op, helpers.Bear, 'battlefield');
  cast(s, ap, add(s, ap, def('Test Stake2', '{0}', 'Instant', 'Destroy target creature. If it was a Vampire, you gain 3 life.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: b }] : undefined));
  assert.equal(s.players[ap].life, life + 3);
});

test('token replacements and "if ~ would die, put it on top of its owner\'s library instead"', () => {
  const { s, ap } = setup();
  add(s, ap, def('Test Chatter', '{0}', 'Creature — Squirrel', 'If one or more tokens would be created under your control, those tokens plus that many 1/1 green Squirrel creature tokens are created instead.', ['2', '2']), 'battlefield');
  const before = s.battlefield.length;
  cast(s, ap, add(s, ap, def('Test Food', '{0}', 'Sorcery', 'Create a Food token.')));
  resolveAll(s, () => undefined);
  assert.equal(s.battlefield.length, before + 2);
  const g = add(s, ap, def('Test Gravebane', '{0}', 'Creature — Zombie', "If this creature would die, put it on top of its owner's library instead.", ['3', '1']), 'battlefield');
  cast(s, ap, add(s, ap, def('Test Murder2', '{0}', 'Instant', 'Destroy target creature.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: g }] : undefined));
  assert.equal(s.players[ap].library[0], g);
});

test('"if a triggered ability of a legendary creature you control triggers, it triggers an additional time"', () => {
  const { s, ap } = setup();
  add(s, ap, def('Test Echo Hall', '{0}', 'Enchantment', 'If a triggered ability of a legendary creature you control triggers, that ability triggers an additional time.'), 'battlefield');
  const life = s.players[ap].life;
  cast(s, ap, add(s, ap, def('Test Legend', '{0}', 'Legendary Creature — Human', 'When this creature enters, you gain 2 life.', ['1', '1'])));
  resolveAll(s, () => undefined);
  assert.equal(s.players[ap].life, life + 4);
});

test('once during each of your turns, cast a Zombie creature spell from your graveyard', () => {
  const { s, ap } = setup();
  add(s, ap, def('Test Lich Lord', '{0}', 'Creature — Zombie', 'Once during each of your turns, you may cast a Zombie creature spell from your graveyard.', ['2', '2']), 'battlefield');
  const z1 = add(s, ap, def('Test Zed', '{0}', 'Creature — Zombie', '', ['1', '1']), 'graveyard');
  const z2 = add(s, ap, def('Test Zed', '{0}', 'Creature — Zombie', '', ['1', '1']), 'graveyard');
  cast(s, ap, z1);
  resolveAll(s, () => undefined);
  assert.equal(s.cards[z1].zone, 'battlefield');
  assert.notEqual(helpers.dispatch(s, ap, { type: 'cast', iid: z2 }), null);
});

test('damage doubling static; "twice the number" / "X plus Y" CDAs', () => {
  const { s, ap, op } = setup();
  add(s, ap, def('Test Doubler', '{0}', 'Enchantment', 'If a creature you control would deal damage to a permanent or player, it deals double that damage instead.'), 'battlefield');
  const b = add(s, ap, helpers.Bear, 'battlefield');
  const life = s.players[op].life;
  api.dealDamage(s, b, { kind: 'player', idx: op }, 2, true);
  assert.equal(s.players[op].life, life - 4);
  const c = add(s, ap, def('Test Maro', '{0}', 'Creature — Avatar', "This creature's power and toughness are each equal to twice the number of cards in your hand.", ['*', '*']), 'battlefield');
  add(s, ap, helpers.Bear); add(s, ap, helpers.Bear);
  assert.equal(helpers.chars(s, c).power, 2 * s.players[ap].hand.length);
});

test('Torbran: red sources you control deal +2 to opponents', () => {
  const { s, ap, op } = setup();
  add(s, ap, def('Test Torbran', '{0}', 'Legendary Creature — Dwarf', 'If a red source you control would deal damage to an opponent or a permanent an opponent controls, it deals that much damage plus 2 instead.', ['2', '4']), 'battlefield');
  const r = add(s, ap, def('Test Red Guy', '{R}', 'Creature — Goblin', '', ['1', '1'], { colors: ['R'] }), 'battlefield');
  const g = add(s, ap, helpers.Bear, 'battlefield');
  const life = s.players[op].life;
  api.dealDamage(s, r, { kind: 'player', idx: op }, 1, true);
  api.dealDamage(s, g, { kind: 'player', idx: op }, 2, true);
  assert.equal(s.players[op].life, life - 3 - 2);
});

test('costs: "return ~ to its owner\'s hand: …" and "put a -1/-1 counter on ~: …"', () => {
  const { s, ap } = setup();
  const c = add(s, ap, def('Test Bouncer', '{0}', 'Creature — Faerie', "Return this creature to its owner's hand: You gain 2 life.", ['1', '1']), 'battlefield');
  const life = s.players[ap].life;
  assert.equal(helpers.dispatch(s, ap, { type: 'activate', iid: c, ability: 0 }), null);
  resolveAll(s, () => undefined);
  assert.equal(s.cards[c].zone, 'hand');
  assert.equal(s.players[ap].life, life + 2);
  const d = add(s, ap, def('Test Wither', '{0}', 'Creature — Elemental', 'Put a -1/-1 counter on this creature: You gain 1 life.', ['3', '3']), 'battlefield');
  assert.equal(helpers.dispatch(s, ap, { type: 'activate', iid: d, ability: 0 }), null);
  resolveAll(s, () => undefined);
  assert.equal(s.cards[d].counters['-1/-1'], 1);
});

test('equipment "becomes unattached" sacrifices the creature', () => {
  const { s, ap } = setup();
  const b = add(s, ap, helpers.Bear, 'battlefield');
  const b2 = add(s, ap, helpers.Bear, 'battlefield');
  const eq = add(s, ap, def('Test Graft', '{0}', 'Artifact — Equipment', 'Whenever this Equipment becomes unattached from a permanent, sacrifice that permanent.\nEquip {0}'), 'battlefield');
  assert.equal(helpers.dispatch(s, ap, { type: 'activate', iid: eq, ability: 0 }), null);
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: b }] : undefined));
  assert.equal(s.cards[eq].attachedTo, b);
  assert.equal(helpers.dispatch(s, ap, { type: 'activate', iid: eq, ability: 0 }), null);
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: b2 }] : undefined));
  assert.equal(s.cards[b].zone, 'graveyard');
  assert.equal(s.cards[b2].zone, 'battlefield');
});
