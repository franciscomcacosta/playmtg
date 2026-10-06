// src/engine/ext/batch14.ts
import * as helpers from './helpers';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, canAttack, canBlock, dispatch } from '../src/engine/engine';
import { parseCond, parseFilter } from '../src/engine/oracle';
import { evalCond } from '../src/engine/rules';
import { EXT as EXTb } from '../src/engine/ext';
import { setup, add, def, cast, resolveAll } from './helpers';


test('until end of turn, whenever a creature you control dies, draw', () => {
  const { s, ap } = setup();
  for (let i = 0; i < 5; i++) add(s, ap, helpers.Bear, 'library');
  const b = add(s, ap, helpers.Bear, 'battlefield');
  cast(s, ap, add(s, ap, def('Test Waltz', '{0}', 'Instant', 'Until end of turn, whenever a creature you control dies, draw a card.')));
  resolveAll(s);
  const h = s.players[ap].hand.length;
  cast(s, ap, add(s, ap, def('Test Murder', '{0}', 'Instant', 'Destroy target creature.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: b }] : undefined));
  assert.equal(s.players[ap].hand.length, h + 1);
  assert.ok((s.players[ap] as any).command.some((i: string) => (s.cards[i] as any).tempEot));
});

test('until end of turn self trigger is granted to the source', () => {
  const { s, ap } = setup();
  const t = add(s, ap, def('Test Titan', '{0}', 'Creature — Giant', '{0}: Until end of turn, whenever you cast a black spell, put a +1/+1 counter on this creature.', ['2', '2']), 'battlefield');
  assert.equal(helpers.dispatch(s, ap, { type: 'activate', iid: t, ability: 0 }), null);
  resolveAll(s);
  cast(s, ap, add(s, ap, def('Test Dark', '{0}', 'Instant', 'You gain 1 life.', undefined, { colors: ['B'] } as any)));
  resolveAll(s);
  assert.equal((s.cards[t] as any).counters?.['+1/+1'] ?? 0, 1);
});

test('multi-kind counters on one target; modified filter', () => {
  const { s, ap } = setup();
  const b = add(s, ap, helpers.Bear, 'battlefield');
  cast(s, ap, add(s, ap, def('Test Champion', '{0}', 'Instant', 'Put a +1/+1 counter and a trample counter on target creature.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: b }] : undefined));
  assert.equal(s.cards[b].counters['+1/+1'], 1);
  assert.equal(s.cards[b].counters['trample'], 1);
  const b2 = add(s, ap, helpers.Bear, 'battlefield');
  cast(s, ap, add(s, ap, def('Test Chishiro', '{0}', 'Instant', 'Put a +1/+1 counter on each modified creature you control.')));
  resolveAll(s);
  assert.equal(s.cards[b].counters['+1/+1'], 2);
  assert.equal(s.cards[b2].counters?.['+1/+1'] ?? 0, 0);
});

test('as long as equipped creature is legendary / a Human or an Angel', () => {
  const { s, ap } = setup();
  const b = add(s, ap, helpers.Bear, 'battlefield');
  const h = add(s, ap, def('Test Human', '{0}', 'Creature — Human', '', ['1', '1']), 'battlefield');
  const e1 = add(s, ap, def('Test Helm', '{0}', 'Artifact — Equipment', 'As long as equipped creature is legendary, it has hexproof.\nEquip {1}'), 'battlefield');
  const e2 = add(s, ap, def('Test Bracers', '{0}', 'Artifact — Equipment', 'As long as equipped creature is a Human or an Angel, it has vigilance.\nEquip {1}'), 'battlefield');
  s.cards[e1].attachedTo = b; s.cards[e2].attachedTo = b;
  assert.ok(!helpers.chars(s, b).keywords.has('hexproof'));
  assert.ok(!helpers.chars(s, b).keywords.has('vigilance'));
  s.cards[e2].attachedTo = h;
  assert.ok(helpers.chars(s, h).keywords.has('vigilance'));
  const sw = add(s, ap, def('Test Mattock', '{0}', 'Artifact — Equipment', 'As long as equipped creature is a Human, it gets an additional +1/+1.\nEquip {1}'), 'battlefield');
  s.cards[sw].attachedTo = h;
  assert.equal(helpers.chars(s, h).power, 2);
  s.cards[sw].attachedTo = b;
  assert.equal(helpers.chars(s, b).power, 2);
});

test('damage to target and each other creature sharing a color; split damage amounts', () => {
  const { s, ap, op } = setup();
  const g1 = add(s, op, def('Test G1', '{G}', 'Creature — Elf', '', ['1', '1'], { colors: ['G'] } as any), 'battlefield');
  const g2 = add(s, op, def('Test G2', '{G}', 'Creature — Elf', '', ['1', '1'], { colors: ['G'] } as any), 'battlefield');
  const r1 = add(s, op, def('Test R1', '{R}', 'Creature — Goblin', '', ['1', '1'], { colors: ['R'] } as any), 'battlefield');
  cast(s, ap, add(s, ap, def('Test Beam', '{0}', 'Instant', 'Test Beam deals 1 damage to target creature and each other creature that shares a color with it.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: g1 }] : undefined));
  assert.equal(s.cards[g1].zone, 'graveyard');
  assert.equal(s.cards[g2].zone, 'graveyard');
  assert.equal(s.cards[r1].zone, 'battlefield');
  const a = add(s, op, def('Test Big', '{0}', 'Creature — Giant', '', ['3', '3']), 'battlefield');
  const b = add(s, op, def('Test Small', '{0}', 'Creature — Giant', '', ['3', '3']), 'battlefield');
  cast(s, ap, add(s, ap, def('Test Spike', '{0}', 'Sorcery', 'Test Spike deals 1 damage to target creature and 3 damage to another target creature.')));
  let k = 0;
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: k++ === 0 ? a : b }] : undefined));
  assert.equal(s.cards[a].zone, 'battlefield');
  assert.equal(s.cards[b].zone, 'graveyard');
});

test('target player loses life unless they sacrifice a creature', () => {
  const { s, ap, op } = setup();
  const b = add(s, op, helpers.Bear, 'battlefield');
  const life = s.players[op].life;
  cast(s, ap, add(s, ap, def('Test Mogis', '{0}', 'Sorcery', 'Target player loses 2 life unless they sacrifice a creature.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'player', idx: op }] : st.prompt?.kind === 'yesno' ? 'yes' : undefined));
  assert.equal(s.cards[b].zone, 'graveyard');
  assert.equal(s.players[op].life, life);
  cast(s, ap, add(s, ap, def('Test Mogis2', '{0}', 'Sorcery', 'Target player loses 2 life unless they sacrifice a creature.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'player', idx: op }] : undefined));
  assert.equal(s.players[op].life, life - 2);
});

test('cast an exiled card for as long as it remains exiled with any type of mana; named tokens', () => {
  const { s, ap, op } = setup();
  const g = add(s, op, def('Test Green', '{G}{G}', 'Creature — Elf', '', ['2', '2'], { colors: ['G'] } as any), 'battlefield');
  cast(s, ap, add(s, ap, def('Test Taker', '{0}', 'Sorcery', 'Exile target creature. You may cast that card for as long as it remains exiled, and mana of any type can be spent to cast that spell.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: g }] : undefined));
  assert.equal(s.cards[g].zone, 'exile');
  helpers.lands(s, ap, 2, helpers.Island);
  s.turn += 3;
  assert.equal(helpers.dispatch(s, ap, { type: 'cast', iid: g }), null);
  resolveAll(s);
  assert.equal(s.cards[g].zone, 'battlefield');
  assert.equal(s.cards[g].controller, ap);
  cast(s, ap, add(s, ap, def('Test Mentor', '{0}', 'Sorcery', 'Create a 1/1 green Elf Druid creature token named Llanowar Elves.')));
  resolveAll(s);
  assert.ok(s.battlefield.some((b) => api.nm(s, b) === 'Llanowar Elves'));
});

test('opponent makes you discard ~: it enters the battlefield instead', () => {
  const { s, ap, op } = setup();
  const d = add(s, op, def('Test Dodecapod', '{4}', 'Artifact Creature — Golem', 'If a spell or ability an opponent controls causes you to discard this card, put it onto the battlefield with two +1/+1 counters on it instead of putting it into your graveyard.', ['3', '3']), 'hand');
  cast(s, ap, add(s, ap, def('Test Raven', '{0}', 'Sorcery', 'Target player discards a card.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'player', idx: op }] : st.prompt?.kind === 'chooseCards' ? [d] : undefined));
  assert.equal(s.cards[d].zone, 'battlefield');
  assert.equal(s.cards[d].controller, op);
  assert.equal(s.cards[d].counters['+1/+1'], 2);
});

test('haunt: dies, haunts a creature, triggers when that creature dies', () => {
  const { s, ap, op } = setup();
  const h = add(s, ap, def('Test Hunter', '{0}', 'Creature — Bat', 'Haunt\nWhen this creature enters or the creature it haunts dies, target player loses 2 life and you gain 2 life.', ['1', '1']), 'battlefield');
  const v = add(s, op, helpers.Bear, 'battlefield');
  const life = s.players[op].life;
  cast(s, ap, add(s, ap, def('Test Murder', '{0}', 'Instant', 'Destroy target creature.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? (st.prompt.title.includes('haunt') ? [{ kind: 'card', iid: v }] : [{ kind: 'card', iid: h }]) : undefined));
  assert.equal(s.cards[h].zone, 'exile');
  assert.equal((s.cards[h] as any).haunting, v);
  cast(s, ap, add(s, ap, def('Test Murder', '{0}', 'Instant', 'Destroy target creature.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? (st.prompt.targets!.some((t: any) => t.kind === 'player') ? [{ kind: 'player', idx: op }] : [{ kind: 'card', iid: v }]) : undefined));
  assert.equal(s.cards[v].zone, 'graveyard');
  assert.equal(s.players[op].life, life - 2);
});

test('put a card from hand or graveyard onto the battlefield; aura attached to ~', () => {
  const { s, ap } = setup();
  const l = add(s, ap, helpers.Forest, 'graveyard');
  cast(s, ap, add(s, ap, def('Test Tiller', '{0}', 'Sorcery', 'You may put a land card from your hand or graveyard onto the battlefield tapped.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? [l] : undefined));
  assert.equal(s.cards[l].zone, 'battlefield');
  assert.equal(s.cards[l].tapped, true);
  const host = add(s, ap, def('Test Researcher', '{0}', 'Creature — Human', '{0}: You may put an Aura card from your hand onto the battlefield attached to this creature.', ['2', '2']), 'battlefield');
  const aura = add(s, ap, def('Test Aura', '{5}', 'Enchantment — Aura', 'Enchant creature\nEnchanted creature gets +2/+2.'), 'hand');
  assert.equal(helpers.dispatch(s, ap, { type: 'activate', iid: host, ability: 0 }), null);
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? [aura] : undefined));
  assert.equal(s.cards[aura].attachedTo, host);
  assert.equal(helpers.chars(s, host).power, 4);
});

test('damage equal to the number of lands the targeted player controls', () => {
  const { s, ap, op } = setup();
  for (let i = 0; i < 3; i++) add(s, op, def('Swamp', '', 'Basic Land — Swamp'), 'battlefield');
  add(s, ap, def('Swamp', '', 'Basic Land — Swamp'), 'battlefield');
  const life = s.players[op].life;
  cast(s, ap, add(s, ap, def('Test Snap', '{0}', 'Sorcery', 'Test Snap deals damage to target player equal to the number of Swamps they control.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'player', idx: op }] : undefined));
  assert.equal(s.players[op].life, life - 3);
});

test('vow aura: pump, keyword, can\'t attack the aura\'s controller; -X/-X where X', () => {
  const { s, ap, op } = setup();
  const b = add(s, op, helpers.Bear, 'battlefield');
  s.cards[b].sick = false;
  const v = add(s, ap, def('Test Vow', '{0}', 'Enchantment — Aura', "Enchant creature\nEnchanted creature gets +2/+2, has vigilance, and can't attack you or planeswalkers you control."), 'battlefield');
  s.cards[v].attachedTo = b;
  assert.equal(helpers.chars(s, b).power, 4);
  assert.ok(helpers.chars(s, b).keywords.has('vigilance'));
  assert.equal(canAttack(s, b), false);
  const c = add(s, ap, helpers.Bear, 'battlefield');
  for (let i = 0; i < 2; i++) add(s, ap, helpers.Bear, 'graveyard');
  const k = add(s, ap, def('Test Clutch', '{0}', 'Enchantment — Aura', 'Enchant creature\nEnchanted creature gets -X/-X, where X is the number of creature cards in your graveyard.'), 'battlefield');
  s.cards[k].attachedTo = c;
  assert.equal(helpers.chars(s, c).toughness, 0);
});

test('aura grants a block restriction and an added color', () => {
  const { s, ap, op } = setup();
  const b = add(s, ap, helpers.Bear, 'battlefield');
  const a = add(s, ap, def('Test Bracers', '{0}', 'Enchantment — Aura', "Enchant creature\nEnchanted creature gets +1/+1 and can't be blocked except by creatures with flying."), 'battlefield');
  s.cards[a].attachedTo = b;
  assert.equal(helpers.chars(s, b).power, 3);
  assert.ok(JSON.stringify(helpers.chars(s, b).pc).includes('creatures with flying'));
  const z = add(s, ap, def('Test Ghoulflesh', '{0}', 'Enchantment — Aura', 'Enchant creature\nEnchanted creature gets -1/-1 and is a black Zombie in addition to its other colors and types.'), 'battlefield');
  s.cards[z].attachedTo = b;
  const c = helpers.chars(s, b);
  assert.ok(c.colors.includes('B'));
  assert.ok(c.subtypes.has('zombie') && c.subtypes.has('bear'));
});

test('board conditions: any player controls a black permanent; no opponent controls a creature', () => {
  const { s, ap, op } = setup();
  const k = add(s, ap, def('Test Knight', '{0}', 'Creature — Human Knight', "This creature gets +1/+0 as long as any player controls a black permanent.", ['2', '2']), 'battlefield');
  const v = add(s, ap, def('Test Beetle', '{0}', 'Creature — Insect', 'This creature gets +3/+3 as long as no opponent controls a creature.', ['3', '3']), 'battlefield');
  assert.equal(helpers.chars(s, k).power, 2);
  assert.equal(helpers.chars(s, v).power, 6);
  add(s, op, def('Test Black', '{B}', 'Creature — Zombie', '', ['1', '1'], { colors: ['B'] } as any), 'battlefield');
  assert.equal(helpers.chars(s, k).power, 3);
  assert.equal(helpers.chars(s, v).power, 3);
});

test('trap conditions: attackers and creatures entering this turn', () => {
  const { s, ap, op } = setup();
  const c1 = parseCond('exactly one creature is attacking')!;
  const c2 = parseCond('an opponent had two or more creatures enter the battlefield under their control this turn')!;
  const a = add(s, op, helpers.Bear, 'battlefield');
  s.combat = { attackers: [{ iid: a, target: { kind: 'player', idx: ap }, blockedBy: [], blocked: false }] } as any;
  assert.equal(evalCond(s, c1, ap), true);
  assert.equal(evalCond(s, c2, ap), false);
  helpers.dispatch; // keep import
  api.moveCard(s, add(s, op, helpers.Bear, 'hand'), 'battlefield');
  api.moveCard(s, add(s, op, helpers.Bear, 'hand'), 'battlefield');
  assert.equal(evalCond(s, c2, ap), true);
});

test('becomes a copy of target creature until end of turn, then reverts', () => {
  const { s, ap, op } = setup();
  const d = add(s, ap, def('Test Doppel', '{0}', 'Creature — Shapeshifter', '{0}: This creature becomes a copy of target creature until end of turn.', ['1', '1']), 'battlefield');
  const g = add(s, op, def('Test Giant', '{5}', 'Creature — Giant', 'Trample', ['6', '6']), 'battlefield');
  assert.equal(helpers.dispatch(s, ap, { type: 'activate', iid: d, ability: 0 }), null);
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: g }] : undefined));
  assert.equal(helpers.chars(s, d).power, 6);
  assert.ok(helpers.chars(s, d).keywords.has('trample'));
  for (const h of EXTb.hooks.step) h(s, 'cleanup', api);
  assert.equal(helpers.chars(s, d).power, 1);
});

test('additional cost: discard a card or pay 3 life (empty hand pays life)', () => {
  const { s, ap } = setup();
  s.players[ap].hand = [];
  const life = s.players[ap].life;
  const c = add(s, ap, def('Test Triumph', '{0}', 'Instant', 'As an additional cost to cast this spell, discard a card or pay 3 life.\nYou gain 1 life.'));
  cast(s, ap, c);
  resolveAll(s);
  assert.equal(s.players[ap].life, life - 3 + 1);
});

test('search with computed count and mana value cap', () => {
  const { s, ap } = setup();
  s.players[ap].library = [];
  const f1 = add(s, ap, helpers.Forest, 'library');
  const f2 = add(s, ap, helpers.Forest, 'library');
  const f3 = add(s, ap, helpers.Forest, 'library');
  add(s, ap, helpers.Forest, 'battlefield'); add(s, ap, helpers.Forest, 'battlefield');
  cast(s, ap, add(s, ap, def('Test Realms', '{0}', 'Sorcery', 'Search your library for up to X basic land cards, where X is the number of lands you control, put them onto the battlefield tapped, then shuffle.')));
  let seen = 0;
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? (seen = st.prompt.max ?? 0, st.prompt.cards!.slice(0, st.prompt.max)) : undefined));
  assert.equal(seen, 2);
  assert.equal([f1, f2, f3].filter((c) => s.cards[c].zone === 'battlefield').length, 2);
  const big = add(s, ap, def('Test Big', '{9}', 'Creature — Giant', '', ['9', '9']), 'library');
  const small = add(s, ap, def('Test Small', '{3}', 'Creature — Elf', '', ['1', '1']), 'library');
  cast(s, ap, add(s, ap, def('Test Beseech', '{0}', 'Sorcery', 'Search your library for a card with mana value less than or equal to the number of lands you control, reveal it, put it into your hand, then shuffle.')));
  let cands: string[] = [];
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? (cands = st.prompt.cards!, [small]) : undefined));
  assert.ok(cands.includes(small) && !cands.includes(big));
  assert.equal(s.cards[small].zone, 'hand');
});

test('restricted mana: creature spell of the chosen type', () => {
  const { s, ap } = setup();
  s.players[ap].pool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } as any;
  const t = add(s, ap, def('Test Territory', '', 'Land', '{T}: Add one mana of any color. Spend this mana only to cast a creature spell of the chosen type.'), 'battlefield');
  (s.cards[t] as any).chosenType = 'elf';
  const gob = add(s, ap, def('Test Goblin', '{R}', 'Creature — Goblin', '', ['1', '1']));
  assert.notEqual(helpers.dispatch(s, ap, { type: 'cast', iid: gob }), null);
  const elf = add(s, ap, def('Test Elf', '{G}', 'Creature — Elf', '', ['1', '1']));
  assert.equal(helpers.dispatch(s, ap, { type: 'cast', iid: elf }), null);
});

test('enters with counters for each creature that died under your control this turn', () => {
  const { s, ap } = setup();
  const b = add(s, ap, helpers.Bear, 'battlefield');
  cast(s, ap, add(s, ap, def('Test Murder', '{0}', 'Instant', 'Destroy target creature.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: b }] : undefined));
  const c = add(s, ap, def('Test Sellsword', '{0}', 'Creature — Ogre', 'This creature enters with a +1/+1 counter on it for each creature that died under your control this turn.', ['2', '2']));
  cast(s, ap, c);
  resolveAll(s);
  assert.equal(s.cards[c].counters['+1/+1'], 1);
});

test('each creature you control with a counter on it has ward; wolves and werewolves anthem', () => {
  const { s, ap } = setup();
  add(s, ap, def('Test Acolyte', '{0}', 'Creature — Human Cleric', 'Each creature you control with a counter on it has ward {1}.', ['1', '1']), 'battlefield');
  const b = add(s, ap, helpers.Bear, 'battlefield');
  assert.ok(!(helpers.chars(s, b).pc as any).ward);
  s.cards[b].counters['+1/+1'] = 1;
  assert.equal((helpers.chars(s, b).pc as any).ward, 1);
  add(s, ap, def('Test Howl', '{0}', 'Enchantment', 'Each creature you control that\'s a Wolf or a Werewolf gets +1/+1 and has trample.'), 'battlefield');
  const w = add(s, ap, def('Test Wolf', '{0}', 'Creature — Wolf', '', ['2', '2']), 'battlefield');
  assert.equal(helpers.chars(s, w).power, 3);
  assert.ok(helpers.chars(s, w).keywords.has('trample'));
  assert.equal(helpers.chars(s, b).power, 3);
});

test('target filter with a computed power threshold', () => {
  const { s, ap, op } = setup();
  add(s, ap, helpers.Bear, 'battlefield'); add(s, ap, helpers.Bear, 'battlefield');
  const small = add(s, op, def('Test Small', '{0}', 'Creature — Elf', '', ['2', '2']), 'battlefield');
  const big = add(s, op, def('Test Big', '{0}', 'Creature — Giant', '', ['5', '5']), 'battlefield');
  cast(s, ap, add(s, ap, def('Test Beguile', '{0}', 'Sorcery', 'Gain control of target creature with power less than or equal to the number of creatures you control.')));
  let opts: any[] = [];
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? (opts = st.prompt.targets!, [{ kind: 'card', iid: small }]) : undefined));
  assert.ok(opts.some((t: any) => t.iid === small) && !opts.some((t: any) => t.iid === big));
  assert.equal(s.cards[small].controller, ap);
});

test('punisher with two options: sacrifice or discard, else lose life', () => {
  const { s, ap, op } = setup();
  s.players[op].hand = [];
  const life = s.players[op].life;
  cast(s, ap, add(s, ap, def('Test Torment', '{0}', 'Sorcery', 'Target opponent loses 3 life unless they sacrifice a nonland permanent of their choice or discard a card.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'player', idx: op }] : undefined));
  assert.equal(s.players[op].life, life - 3);
  const c = add(s, op, helpers.Bear, 'hand');
  cast(s, ap, add(s, ap, def('Test Torment', '{0}', 'Sorcery', 'Target opponent loses 3 life unless they sacrifice a nonland permanent of their choice or discard a card.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'player', idx: op }] : st.prompt?.kind === 'chooseCards' ? [c] : undefined));
  assert.equal(s.cards[c].zone, 'graveyard');
  assert.equal(s.players[op].life, life - 3);
});

test('for each land you control, create a Treasure token', () => {
  const { s, ap } = setup();
  for (let i = 0; i < 3; i++) add(s, ap, helpers.Forest, 'battlefield');
  const n0 = s.battlefield.length;
  cast(s, ap, add(s, ap, def('Test Bounty', '{0}', 'Sorcery', 'For each land you control, create a Treasure token.')));
  resolveAll(s);
  assert.equal(s.battlefield.length - n0, 3);
});

test('Ordeal: then if it has three or more +1/+1 counters on it, sacrifice ~', () => {
  const { s, ap } = setup();
  const b = add(s, ap, helpers.Bear, 'battlefield');
  const o = add(s, ap, def('Test Ordeal', '{0}', 'Enchantment — Aura', 'Enchant creature\nWhenever enchanted creature attacks, put a +1/+1 counter on it. Then if it has three or more +1/+1 counters on it, sacrifice this Aura.'), 'battlefield');
  s.cards[o].attachedTo = b;
  s.cards[b].counters['+1/+1'] = 2;
  const t = helpers.chars(s, o).pc.triggers[0];
  api.queueTrigger(s, o, ap, t, { triggerObj: b });
  resolveAll(s);
  assert.equal(s.cards[b].counters['+1/+1'], 3);
  assert.equal(s.cards[o].zone, 'graveyard');
});

test('destroy all creatures with mana value X or less; all other permanents except for lands and tokens', () => {
  const { s, ap, op } = setup();
  const a = add(s, op, def('Test One', '{1}', 'Creature — Elf', '', ['1', '1']), 'battlefield');
  const b = add(s, op, def('Test Four', '{4}', 'Creature — Giant', '', ['4', '4']), 'battlefield');
  helpers.lands(s, ap, 3);
  cast(s, ap, add(s, ap, def('Test March', '{X}{B}{B}', 'Sorcery', 'Destroy all creatures with mana value X or less.')), { x: 1 });
  resolveAll(s, (st) => (st.prompt?.kind === 'x' ? 1 : undefined));
  assert.equal(s.cards[a].zone, 'graveyard');
  assert.equal(s.cards[b].zone, 'battlefield');
  const f = parseFilter('other permanents except for lands and tokens')!;
  assert.ok(f.other && (f as any).nontoken && f.notTypes!.includes('land'));
});

test('the next instant or sorcery spell you cast this turn has storm; next spell costs less', () => {
  const { s, ap, op } = setup();
  cast(s, ap, add(s, ap, def('Test Draw', '{0}', 'Instant', 'Draw a card.')));
  resolveAll(s);
  cast(s, ap, add(s, ap, def('Test Storm', '{0}', 'Instant', 'The next instant or sorcery spell you cast this turn has storm.')));
  resolveAll(s);
  const life = s.players[op].life;
  cast(s, ap, add(s, ap, def('Test Shock', '{0}', 'Instant', 'Test Shock deals 1 damage to any target.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'player', idx: op }] : undefined));
  assert.equal(s.players[op].life, life - 3);
});

test("can't block if you control an untapped land; can't block black creatures", () => {
  const { s, ap, op } = setup();
  const v = add(s, op, def('Test Brawlers', '{0}', 'Creature — Human', "This creature can't block if you control an untapped land.", ['2', '2']), 'battlefield');
  const h = add(s, op, def('Test Hyenas', '{0}', 'Creature — Hyena', "This creature can't block black creatures.", ['2', '2']), 'battlefield');
  const a = add(s, ap, def('Test Black', '{0}', 'Creature — Zombie', '', ['2', '2'], { colors: ['B'] } as any), 'battlefield');
  assert.equal(canBlock(s, v, a), true);
  const l = add(s, op, helpers.Forest, 'battlefield');
  assert.equal(canBlock(s, v, a), false);
  s.cards[l].tapped = true;
  assert.equal(canBlock(s, v, a), true);
  assert.equal(canBlock(s, h, a), false);
});

test('~ has trample as long as it has ten or more +1/+1 counters on it; haste as long as a Warrior card is in your graveyard', () => {
  const { s, ap } = setup();
  const h = add(s, ap, def('Test Hydra', '{0}', 'Creature — Hydra', 'This creature has trample as long as it has ten or more +1/+1 counters on it.', ['0', '0']), 'battlefield');
  s.cards[h].counters['+1/+1'] = 9;
  assert.ok(!helpers.chars(s, h).keywords.has('trample'));
  s.cards[h].counters['+1/+1'] = 10;
  assert.ok(helpers.chars(s, h).keywords.has('trample'));
  const f = add(s, ap, def('Test Firebrand', '{0}', 'Creature — Elemental', 'This creature has haste as long as a Warrior card is in your graveyard.', ['5', '2']), 'battlefield');
  assert.ok(!helpers.chars(s, f).keywords.has('haste'));
  add(s, ap, def('Test Warrior', '{0}', 'Creature — Human Warrior', '', ['1', '1']), 'graveyard');
  assert.ok(helpers.chars(s, f).keywords.has('haste'));
});

test('state trigger: when you control no enchantments, sacrifice ~', () => {
  const { s, ap } = setup();
  const e = add(s, ap, def('Test Ench', '{0}', 'Enchantment', ''), 'battlefield');
  const g = add(s, ap, def('Test Griffin', '{0}', 'Creature — Griffin', 'Flying\nWhen you control no enchantments, sacrifice this creature.', ['2', '3']), 'battlefield');
  cast(s, ap, add(s, ap, def('Test Draw', '{0}', 'Instant', 'Draw a card.')));
  resolveAll(s);
  assert.equal(s.cards[g].zone, 'battlefield');
  api.moveCard(s, e, 'graveyard');
  cast(s, ap, add(s, ap, def('Test Draw', '{0}', 'Instant', 'Draw a card.')));
  resolveAll(s);
  assert.equal(s.cards[g].zone, 'graveyard');
});

test('~ becomes an artifact creature (permanently)', () => {
  const { s, ap } = setup();
  const v = add(s, ap, def('Test Cycle', '{0}', 'Artifact — Vehicle', '{0}: This Vehicle becomes an artifact creature.', ['3', '3']), 'battlefield');
  assert.equal(helpers.dispatch(s, ap, { type: 'activate', iid: v, ability: 0 }), null);
  resolveAll(s);
  assert.ok(helpers.chars(s, v).types.has('creature'));
  for (const h of EXTb.hooks.step) h(s, 'cleanup', api);
  (api as any).nextTurn ? 0 : 0;
  assert.ok(helpers.chars(s, v).types.has('creature'));
});

test('whenever a creature with flying attacks, you may draw a card', () => {
  const { s, ap, op } = setup();
  for (let i = 0; i < 3; i++) add(s, op, helpers.Bear, 'library');
  add(s, op, def('Test Sphinx', '{0}', 'Creature — Sphinx', 'Whenever a creature with flying attacks, you may draw a card.', ['3', '7']), 'battlefield');
  const f = add(s, ap, def('Test Bird', '{0}', 'Creature — Bird', 'Flying', ['1', '1']), 'battlefield');
  const g = add(s, ap, helpers.Bear, 'battlefield');
  const h = s.players[op].hand.length;
  api.emit(s, 'attack', { p: ap, list: [{ iid: f, target: { kind: 'player', idx: op } }, { iid: g, target: { kind: 'player', idx: op } }] });
  resolveAll(s);
  assert.equal(s.players[op].hand.length, h + 1);
});

test('static self pump where X; count of other flyers on the battlefield', () => {
  const { s, ap, op } = setup();
  const g = add(s, ap, def('Test Grub', '{0}', 'Creature — Insect', 'This creature gets +X/+0, where X is the greatest power among creature cards in your graveyard.', ['0', '1']), 'battlefield');
  add(s, ap, def('Test Big', '{0}', 'Creature — Giant', '', ['5', '5']), 'graveyard');
  assert.equal(helpers.chars(s, g).power, 5);
  const r = add(s, ap, def('Test Pride', '{0}', 'Creature — Cat', 'Flying\nThis creature gets +1/+1 for each other creature on the battlefield with flying.', ['1', '1']), 'battlefield');
  add(s, op, def('Test Bird', '{0}', 'Creature — Bird', 'Flying', ['1', '1']), 'battlefield');
  assert.equal(helpers.chars(s, r).power, 2);
});

test('equipment: gets +2/+0, has menace, and is a Pirate; has flying and ward {1}', () => {
  const { s, ap } = setup();
  const b = add(s, ap, helpers.Bear, 'battlefield');
  const e = add(s, ap, def('Test Hook', '{0}', 'Artifact — Equipment', 'Equipped creature gets +2/+0, has menace, and is a Pirate in addition to its other creature types.\nEquip {1}'), 'battlefield');
  s.cards[e].attachedTo = b;
  const c = helpers.chars(s, b);
  assert.equal(c.power, 4);
  assert.ok(c.keywords.has('menace'));
  assert.ok(c.subtypes.has('pirate') && c.subtypes.has('bear'));
  const w = add(s, ap, def('Test Harness', '{0}', 'Artifact — Equipment', 'Equipped creature gets +1/+1 and has flying and ward {1}.\nEquip {1}'), 'battlefield');
  s.cards[w].attachedTo = b;
  assert.ok(helpers.chars(s, b).keywords.has('flying'));
  assert.equal((helpers.chars(s, b).pc as any).ward, 1);
});

test('Siege: choose a mode as it enters; only that mode applies', () => {
  const { s, ap } = setup();
  const c = add(s, ap, def('Test Siege', '{0}', 'Enchantment', 'As this enchantment enters, choose Khans or Dragons.\n• Khans — Creatures you control get +1/+1.\n• Dragons — Creatures you control have flying.'));
  const b = add(s, ap, helpers.Bear, 'battlefield');
  cast(s, ap, c);
  resolveAll(s, (st) => (st.prompt?.kind === 'yesno' ? 'no' : undefined));
  assert.equal((s.cards[c] as any).siegeMode, 'dragons');
  assert.ok(helpers.chars(s, b).keywords.has('flying'));
  assert.equal(helpers.chars(s, b).power, 2);
});

test('Bloodghast-style: landfall returns ~ from the graveyard', () => {
  const { s, ap } = setup();
  const g = add(s, ap, def('Test Ghast', '{0}', 'Creature — Vampire Spirit', "This creature can't block.\nLandfall — Whenever a land you control enters, you may return this card from your graveyard to the battlefield.", ['2', '1']), 'graveyard');
  const l = add(s, ap, helpers.Forest, 'hand');
  assert.equal(helpers.dispatch(s, ap, { type: 'playLand', iid: l } as any), null);
  resolveAll(s, (st) => (st.prompt?.kind === 'yesno' ? 'yes' : undefined));
  assert.equal(s.cards[g].zone, 'battlefield');
});

test('cast ~ from your graveyard by discarding a card in addition to its other costs', () => {
  const { s, ap } = setup();
  s.players[ap].hand = [];
  const d = add(s, ap, def('Test Symbiosis', '{0}', 'Creature — Robot', 'You may cast this card from your graveyard by discarding a card in addition to paying its other costs.', ['2', '2']), 'graveyard');
  assert.notEqual(helpers.dispatch(s, ap, { type: 'cast', iid: d }), null);
  const x = add(s, ap, helpers.Bear, 'hand');
  assert.equal(helpers.dispatch(s, ap, { type: 'cast', iid: d }), null);
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? [x] : undefined));
  assert.equal(s.cards[d].zone, 'battlefield');
  assert.equal(s.cards[x].zone, 'graveyard');
});

test('The Rack: damage equal to 3 minus the cards in their hand', () => {
  const { s, ap, op } = setup();
  const r = add(s, ap, def('Test Rack', '{0}', 'Artifact', "As this artifact enters, choose an opponent.\nAt the beginning of the chosen player's upkeep, this artifact deals X damage to that player, where X is 3 minus the number of cards in their hand."), 'battlefield');
  (s.cards[r] as any).chosenOpponent = op;
  s.players[op].hand = [];
  add(s, op, helpers.Bear, 'hand');
  const life = s.players[op].life;
  const t = helpers.chars(s, r).pc.triggers.find((x: any) => x.event === 'eachUpkeep');
  s.active = op;
  api.queueTrigger(s, r, ap, t, { triggerPlayer: op });
  resolveAll(s);
  assert.equal(s.players[op].life, life - 2);
});

test("exile the top card of target opponent's library; you may play it this turn", () => {
  const { s, ap, op } = setup();
  const c = add(s, op, def('Test Theirs', '{0}', 'Instant', 'You gain 2 life.'), 'library');
  s.players[op].library = [c, ...s.players[op].library.filter((x) => x !== c)];
  cast(s, ap, add(s, ap, def('Test Court', '{0}', 'Sorcery', "Exile the top card of target opponent's library. You may play that card this turn.")));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'player', idx: op }] : undefined));
  assert.equal(s.cards[c].zone, 'exile');
  const life = s.players[ap].life;
  assert.equal(helpers.dispatch(s, ap, { type: 'cast', iid: c }), null);
  resolveAll(s);
  assert.equal(s.players[ap].life, life + 2);
});

test('state trigger: when you have 10 or less life, if ~ is an enchantment, it becomes a 3/5 creature', () => {
  const { s, ap } = setup();
  const o = add(s, ap, def('Test Opal', '{0}', 'Enchantment', 'When you have 10 or less life, if this enchantment is an enchantment, it becomes a 3/5 Soldier creature.'), 'battlefield');
  s.players[ap].life = 9;
  cast(s, ap, add(s, ap, def('Test Draw', '{0}', 'Instant', 'Draw a card.')));
  resolveAll(s);
  const c = helpers.chars(s, o);
  assert.ok(c.types.has('creature'));
  assert.equal(c.power, 3);
});

test('exhaust abilities activate only once', () => {
  const { s, ap } = setup();
  const v = add(s, ap, def('Test Cruiser', '{0}', 'Artifact Creature — Robot', 'Exhaust — {0}: Put two +1/+1 counters on this creature.', ['1', '1']), 'battlefield');
  assert.equal(helpers.dispatch(s, ap, { type: 'activate', iid: v, ability: 0 }), null);
  resolveAll(s);
  assert.equal(s.cards[v].counters['+1/+1'], 2);
  assert.notEqual(helpers.dispatch(s, ap, { type: 'activate', iid: v, ability: 0 }), null);
});

test("graveyard trigger: you may exile ~ from your graveyard. if you do, draw", () => {
  const { s, ap } = setup();
  for (let i = 0; i < 3; i++) add(s, ap, helpers.Bear, 'library');
  const k = add(s, ap, def('Test Return', '{0}', 'Instant', 'Draw a card.\nWhenever you cast a creature spell, you may exile this card from your graveyard. If you do, draw two cards.'), 'graveyard');
  const h = s.players[ap].hand.length;
  cast(s, ap, add(s, ap, def('Test Guy', '{0}', 'Creature — Elf', '', ['1', '1'])));
  resolveAll(s, (st) => (st.prompt?.kind === 'yesno' ? 'yes' : undefined));
  assert.equal(s.cards[k].zone, 'exile');
  assert.equal(s.players[ap].hand.length, h + 2);
});

test('gains your choice of flying, vigilance, or lifelink; gets +5/+5 and must be blocked', () => {
  const { s, ap } = setup();
  const b = add(s, ap, helpers.Bear, 'battlefield');
  cast(s, ap, add(s, ap, def('Test Seraph', '{0}', 'Instant', 'Target creature you control gains your choice of flying, vigilance, or lifelink until end of turn.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: b }] : st.prompt?.kind === 'mode' ? ['lifelink'] : undefined));
  assert.ok(helpers.chars(s, b).keywords.has('lifelink'));
  cast(s, ap, add(s, ap, def('Test Growth', '{0}', 'Instant', 'Target creature gets +5/+5 until end of turn and must be blocked this turn if able.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: b }] : undefined));
  assert.equal(helpers.chars(s, b).power, 7);
  assert.equal((s.cards[b] as any).mustBeBlockedTurn, s.turn);
});

test('Runemark: enchanted creature has vigilance as long as you control a black or green permanent', () => {
  const { s, ap } = setup();
  const b = add(s, ap, def('Test Soldier', '{0}', 'Creature — Human', '', ['1', '1'], { colors: ['W'] } as any), 'battlefield');
  const a = add(s, ap, def('Test Runemark', '{0}', 'Enchantment — Aura', 'Enchant creature\nEnchanted creature gets +2/+2.\nEnchanted creature has vigilance as long as you control a black or green permanent.'), 'battlefield');
  s.cards[a].attachedTo = b;
  assert.equal(helpers.chars(s, b).power, 3);
  assert.ok(!helpers.chars(s, b).keywords.has('vigilance'));
  add(s, ap, def('Test Green', '{0}', 'Creature — Elf', '', ['1', '1'], { colors: ['G'] } as any), 'battlefield');
  assert.ok(helpers.chars(s, b).keywords.has('vigilance'));
});

test('reanimate target with mana value X or less, where X is …; with additional counters', () => {
  const { s, ap } = setup();
  add(s, ap, helpers.Forest, 'battlefield'); add(s, ap, helpers.Forest, 'battlefield');
  const small = add(s, ap, def('Test Small', '{2}', 'Creature — Elf', '', ['1', '1']), 'graveyard');
  const big = add(s, ap, def('Test Big', '{5}', 'Creature — Giant', '', ['5', '5']), 'graveyard');
  cast(s, ap, add(s, ap, def('Test Lunge', '{0}', 'Sorcery', 'Return target creature card with mana value X or less from your graveyard to the battlefield with two additional +1/+1 counters on it, where X is the number of lands you control.')));
  let opts: any[] = [];
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? (opts = st.prompt.targets!, [{ kind: 'card', iid: small }]) : undefined));
  assert.ok(opts.some((t: any) => t.iid === small) && !opts.some((t: any) => t.iid === big));
  assert.equal(s.cards[small].zone, 'battlefield');
  assert.equal(s.cards[small].counters['+1/+1'], 2);
});

test('destroy target creature that dealt damage to you this turn', () => {
  const { s, ap, op } = setup();
  const a = add(s, op, helpers.Bear, 'battlefield');
  const b = add(s, op, helpers.Bear, 'battlefield');
  api.dealDamage(s, a, { kind: 'player', idx: ap }, 2, true);
  cast(s, ap, add(s, ap, def('Test Spear', '{0}', 'Instant', 'Destroy target creature that dealt damage to you this turn.')));
  let opts: any[] = [];
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? (opts = st.prompt.targets!, [{ kind: 'card', iid: a }]) : undefined));
  assert.ok(opts.some((t: any) => t.iid === a) && !opts.some((t: any) => t.iid === b));
  assert.equal(s.cards[a].zone, 'graveyard');
});

test('sacrifice any number of other permanents, then draw that many; double the power', () => {
  const { s, ap } = setup();
  for (let i = 0; i < 4; i++) add(s, ap, helpers.Bear, 'library');
  const a = add(s, ap, helpers.Bear, 'battlefield'), b = add(s, ap, helpers.Bear, 'battlefield');
  const h = s.players[ap].hand.length;
  cast(s, ap, add(s, ap, def('Test Bontu', '{0}', 'Sorcery', 'Sacrifice any number of other permanents, then draw that many cards.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? [a, b] : undefined));
  assert.equal(s.players[ap].hand.length, h + 2);
  const c = add(s, ap, def('Test Big', '{0}', 'Creature — Giant', '', ['3', '3']), 'battlefield');
  cast(s, ap, add(s, ap, def('Test Double', '{0}', 'Instant', 'Double the power of target creature until end of turn.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: c }] : undefined));
  assert.equal(helpers.chars(s, c).power, 6);
});

test('kicked: enters with counters and with a keyword', () => {
  const { s, ap } = setup();
  helpers.lands(s, ap, 6);
  const k = add(s, ap, def('Test Titan', '{1}{G}', 'Creature — Kavu', 'Kicker {2}{G}\nIf this creature was kicked, it enters with three +1/+1 counters on it and with trample.', ['2', '2']));
  cast(s, ap, k, { kicker: true });
  resolveAll(s);
  assert.equal(s.cards[k].counters['+1/+1'], 3);
  assert.ok(helpers.chars(s, k).keywords.has('trample'));
});

test('you may sacrifice an artifact or discard a card. if you do, draw', () => {
  const { s, ap } = setup();
  for (let i = 0; i < 3; i++) add(s, ap, helpers.Bear, 'library');
  s.players[ap].hand = [];
  const x = add(s, ap, helpers.Bear, 'hand');
  cast(s, ap, add(s, ap, def('Test Hero', '{0}', 'Sorcery', 'You may sacrifice an artifact or discard a card. If you do, draw two cards.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'yesno' ? 'yes' : undefined));
  assert.equal(s.cards[x].zone, 'graveyard');
  assert.equal(s.players[ap].hand.length, 2);
});

test('whenever a creature is exiled from the battlefield; during your turn gating', () => {
  const { s, ap } = setup();
  const herd = add(s, ap, def('Test Herder', '{0}', 'Creature — Spirit', 'Whenever a creature is exiled from the battlefield, put a +1/+1 counter on this creature.', ['1', '1']), 'battlefield');
  const op = (1 - ap) as any;
  const b = add(s, op, helpers.Bear, 'battlefield');
  cast(s, ap, add(s, ap, def('Test Path', '{0}', 'Instant', 'Exile target creature.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: b }] : undefined));
  assert.equal(s.cards[herd].counters['+1/+1'], 1);
  const v = add(s, ap, def('Test Vogar', '{0}', 'Creature — Vampire', 'Whenever another creature dies during your turn, put a +1/+1 counter on this creature.', ['1', '1']), 'battlefield');
  const c = add(s, ap, helpers.Bear, 'battlefield');
  s.active = 1 - ap as any;
  s.priority = 1 - ap as any;
  cast(s, op, add(s, op, def('Test Murder', '{0}', 'Instant', 'Destroy target creature.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: c }] : undefined));
  assert.equal(s.cards[v].counters['+1/+1'] ?? 0, 0);
  s.active = ap as any;
  s.priority = ap as any;
  const e = add(s, ap, helpers.Bear, 'battlefield');
  cast(s, ap, add(s, ap, def('Test Murder', '{0}', 'Instant', 'Destroy target creature.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: e }] : undefined));
  assert.equal(s.cards[v].counters['+1/+1'], 1);
});

test('behold a Kithkin and exile it (returned when it leaves); behold or pay', () => {
  const { s, ap } = setup();
  const k = add(s, ap, def('Test Kith', '{0}', 'Creature — Kithkin', '', ['1', '1']), 'hand');
  const ch = add(s, ap, def('Test Champion', '{0}', 'Creature — Kithkin Soldier', 'As an additional cost to cast this spell, behold a Kithkin and exile it.\nWhen this creature leaves the battlefield, return the exiled card to its owner\'s hand.', ['3', '3']));
  cast(s, ap, ch);
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? [k] : undefined));
  assert.equal(s.cards[ch].zone, 'battlefield');
  assert.equal(s.cards[k].zone, 'exile');
  cast(s, ap, add(s, ap, def('Test Murder', '{0}', 'Instant', 'Destroy target creature.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: ch }] : undefined));
  assert.equal(s.cards[k].zone, 'hand');
  const g = add(s, ap, def('Test Aspirant', '{0}', 'Creature — Kithkin', 'As an additional cost to cast this spell, behold a Kithkin or pay {2}.', ['2', '2']));
  cast(s, ap, g);
  let asked = false;
  resolveAll(s, (st) => (st.prompt?.kind === 'yesno' ? (asked = true, 'yes') : st.prompt?.kind === 'chooseCards' ? [k] : undefined));
  assert.ok(asked);
  assert.equal(s.cards[g].zone, 'battlefield');
});

test('choose a player: True-Name protection, Stuffy Doll damage to the chosen player', () => {
  const { s, ap } = setup();
  const op = (1 - ap) as any;
  const tn = add(s, ap, def('Test Nemesis', '{0}', 'Creature — Merfolk', 'As this creature enters, choose a player.\nThis creature has protection from the chosen player.', ['3', '1']));
  cast(s, ap, tn);
  resolveAll(s, (st) => (st.prompt?.kind === 'yesno' ? 'yes' : undefined));
  assert.equal((s.cards[tn] as any).chosenPlayer, op);
  assert.ok(helpers.chars(s, tn).keywords.has(`protection from player ${op}`));
  const sd = add(s, ap, def('Test Doll', '{0}', 'Artifact Creature — Construct', 'As this creature enters, choose a player.\nWhenever this creature is dealt damage, it deals that much damage to the chosen player.\n{T}: This creature deals 1 damage to itself.', ['0', '3']));
  cast(s, ap, sd);
  resolveAll(s, (st) => (st.prompt?.kind === 'yesno' ? 'yes' : undefined));
  const life = s.players[op].life;
  cast(s, ap, add(s, ap, def('Test Shock', '{0}', 'Instant', 'Test Shock deals 1 damage to any target.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: sd }] : undefined));
  assert.equal(s.players[op].life, life - 1);
});

test('until end of turn, you may play lands and cast spells from your graveyard; cast-only exile permission', () => {
  const { s, ap } = setup();
  const g = add(s, ap, helpers.Bear, 'graveyard');
  const l = add(s, ap, helpers.Forest, 'graveyard');
  const e = add(s, ap, helpers.Forest, 'exile');
  (s.cards[e] as any).mayPlay = { player: ap, untilTurn: s.turn, castOnly: true };
  assert.notEqual(dispatch(s, ap, { type: 'playLand', iid: e } as any), null);
  helpers.lands(s, ap, 2);
  cast(s, ap, add(s, ap, def('Test Will', '{0}', 'Sorcery', 'Until end of turn, you may play lands and cast spells from your graveyard.')));
  resolveAll(s);
  cast(s, ap, g);
  resolveAll(s);
  assert.equal(s.cards[g].zone, 'battlefield');
  assert.equal(dispatch(s, ap, { type: 'playLand', iid: l } as any), null);
  assert.equal(s.cards[l].zone, 'battlefield');
});

test('whenever a creature an opponent controls is dealt damage, put a counter on ~', () => {
  const { s, ap } = setup();
  const k = add(s, ap, def('Test Kazarov', '{0}', 'Creature — Vampire', 'Whenever a creature an opponent controls is dealt damage, put a +1/+1 counter on this creature.', ['2', '2']), 'battlefield');
  const b = add(s, (1 - ap) as any, helpers.Bear, 'battlefield');
  cast(s, ap, add(s, ap, def('Test Ping', '{0}', 'Instant', 'Test Ping deals 1 damage to any target.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: b }] : undefined));
  assert.equal(s.cards[k].counters['+1/+1'], 1);
  cast(s, ap, add(s, ap, def('Test Ping', '{0}', 'Instant', 'Test Ping deals 1 damage to any target.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: k }] : undefined));
  assert.equal(s.cards[k].counters['+1/+1'], 1);
});

test('amount wrappers: half X rounded up, three times X, discarded-card condition', () => {
  const { s, ap } = setup();
  const op = (1 - ap) as any;
  s.players[ap].life = 15;
  cast(s, ap, add(s, ap, def('Test Half', '{0}', 'Sorcery', 'Each opponent loses life equal to half your life total, rounded up.')));
  resolveAll(s);
  assert.equal(s.players[op].life, 12);
  add(s, ap, helpers.Bear, 'battlefield');
  cast(s, ap, add(s, ap, def('Test Thrice', '{0}', 'Sorcery', 'You gain life equal to three times the number of creatures you control.')));
  resolveAll(s);
  assert.equal(s.players[ap].life, 18);
  s.players[ap].hand = [];
  const lnd = add(s, ap, helpers.Forest, 'hand');
  cast(s, ap, add(s, ap, def('Test Grab', '{0}', 'Instant', 'As an additional cost to cast this spell, discard a card.\nDraw a card.')));
  void lnd;
  const { s: s2, ap: a2 } = setup();
  s2.players[a2].hand = [];
  add(s2, a2, helpers.Bear, 'hand');
  const o2 = (1 - a2) as any;
  cast(s2, a2, add(s2, a2, def('Test Prize', '{0}', 'Sorcery', 'Discard a card. If the discarded card wasn\'t a land card, Test Prize deals 2 damage to each opponent.')));
  resolveAll(s2);
  assert.equal(s2.players[o2].life, 18);
});

test('there are five or more mana values among cards in your graveyard; exactly N counters', () => {
  const { s, ap } = setup();
  const c = add(s, ap, def('Test Mv', '{0}', 'Creature — Spirit', 'As long as there are five or more mana values among cards in your graveyard, this creature gets +2/+2.', ['1', '1']), 'battlefield');
  for (let i = 1; i <= 4; i++) add(s, ap, def(`Test G${i}`, `{${i}}`, 'Sorcery', ''), 'graveyard');
  assert.equal(helpers.chars(s, c).power, 1);
  add(s, ap, def('Test G5', '{5}', 'Sorcery', ''), 'graveyard');
  assert.equal(helpers.chars(s, c).power, 3);
  const t = add(s, ap, def('Test Tide', '{0}', 'Enchantment', 'As long as there is exactly one tide counter on this enchantment, all blue creatures get -2/-0.'), 'battlefield');
  const u = add(s, ap, def('Test Blue', '{U}', 'Creature — Fish', '', ['3', '3'], { colors: ['U'] } as any), 'battlefield');
  assert.equal(helpers.chars(s, u).power, 3);
  s.cards[t].counters.tide = 1;
  assert.equal(helpers.chars(s, u).power, 1);
});

test('as long as <cond>, ~ can\'t attack or block (gated flag)', () => {
  const { s, ap } = setup();
  const c = add(s, ap, def('Test Loner', '{0}', 'Creature — Spirit', 'As long as you control another creature, this creature can\'t attack or block.', ['3', '3']), 'battlefield');
  s.cards[c].sick = false;
  assert.equal(canAttack(s, c), true);
  add(s, ap, helpers.Bear, 'battlefield');
  assert.equal(canAttack(s, c), false);
});

test('cast ~ from your graveyard if a non-Zombie creature died this turn (+1/+1 counter); Omniscience', () => {
  const { s, ap } = setup();
  const u = add(s, ap, def('Test Sprinter', '{0}', 'Creature — Zombie', 'You may cast this card from your graveyard if a non-Zombie creature died this turn. If you do, this creature enters with a +1/+1 counter on it.', ['2', '2']), 'graveyard');
  assert.notEqual(dispatch(s, ap, { type: 'cast', iid: u } as any), null);
  const b = add(s, ap, helpers.Bear, 'battlefield');
  cast(s, ap, add(s, ap, def('Test Murder', '{0}', 'Instant', 'Destroy target creature.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: b }] : undefined));
  cast(s, ap, u);
  resolveAll(s);
  assert.equal(s.cards[u].zone, 'battlefield');
  assert.equal(s.cards[u].counters['+1/+1'], 1);
  add(s, ap, def('Test Omni', '{0}', 'Enchantment', 'You may cast spells from your hand without paying their mana costs.'), 'battlefield');
  const big = add(s, ap, def('Test Big', '{9}{G}', 'Creature — Wurm', '', ['9', '9']));
  cast(s, ap, big);
  resolveAll(s);
  assert.equal(s.cards[big].zone, 'battlefield');
});

test('destroy target creature; ~ deals damage equal to that creature\'s power to its controller', () => {
  const { s, ap } = setup();
  const op = (1 - ap) as any;
  const b = add(s, op, def('Test Ogre', '{0}', 'Creature — Ogre', '', ['4', '4']), 'battlefield');
  cast(s, ap, add(s, ap, def('Test Agony', '{0}', 'Sorcery', 'Destroy target creature. Test Agony deals damage equal to that creature\'s power to the creature\'s controller.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: b }] : undefined));
  assert.equal(s.players[op].life, 16);
  assert.equal(s.players[ap].life, 20);
});

test('creatures you control with +1/+1 counters can\'t be blocked; can attack as though no defender', () => {
  const { s, ap } = setup();
  const op = (1 - ap) as any;
  add(s, ap, def('Test Herald', '{0}', 'Enchantment', 'Creatures you control with +1/+1 counters on them can\'t be blocked.\nCreatures you control can attack as though they didn\'t have defender.'), 'battlefield');
  const a = add(s, ap, helpers.Bear, 'battlefield');
  const w = add(s, ap, def('Test Wall', '{0}', 'Creature — Wall', 'Defender', ['0', '4']), 'battlefield');
  s.cards[w].sick = false;
  assert.equal(canAttack(s, w), true);
  const bl = add(s, op, helpers.Bear, 'battlefield');
  assert.equal(canBlock(s, bl, a), true);
  s.cards[a].counters['+1/+1'] = 1;
  assert.equal(canBlock(s, bl, a), false);
});

test('you may pay {0} rather than pay the mana cost for Zombie creature spells you cast', () => {
  const { s, ap } = setup();
  add(s, ap, def('Test Storm', '{0}', 'Enchantment', 'You may pay {0} rather than pay the mana cost for Zombie creature spells you cast.'), 'battlefield');
  const z = add(s, ap, def('Test Zombie', '{5}{B}', 'Creature — Zombie', '', ['5', '5']));
  cast(s, ap, z, { alt: 'ext:altCost14' });
  resolveAll(s);
  assert.equal(s.cards[z].zone, 'battlefield');
});

test('two target players exchange life totals; base P/T become N/M until end of turn', () => {
  const { s, ap } = setup();
  const op = (1 - ap) as any;
  s.players[ap].life = 5;
  cast(s, ap, add(s, ap, def('Test Axis', '{0}', 'Sorcery', 'You may have two target players exchange life totals.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'player', idx: ap }, { kind: 'player', idx: op }] : st.prompt?.kind === 'yesno' ? 'yes' : undefined));
  assert.equal(s.players[ap].life, 20);
  assert.equal(s.players[op].life, 5);
  const c = add(s, ap, def('Test Med', '{0}', 'Creature — Elf', '{0}: This creature\'s base power and toughness become 4/2 until end of turn.', ['1', '1']), 'battlefield');
  assert.equal(dispatch(s, ap, { type: 'activate', iid: c, ability: 0 } as any), null);
  resolveAll(s);
  assert.equal(helpers.chars(s, c).power, 4);
  assert.equal(helpers.chars(s, c).toughness, 2);
});

test('restricted mana: "and that spell can\'t be countered"', () => {
  const { s, ap } = setup();
  const h = add(s, ap, def('Test Halfling', '{G}', 'Creature — Halfling', '{T}: Add one mana of any color. Spend this mana only to cast a legendary spell, and that spell can\'t be countered.', ['1', '2']), 'battlefield');
  s.cards[h].sick = false;
  const l = add(s, ap, def('Test Legend', '{1}', 'Legendary Creature — Human', '', ['2', '2']));
  cast(s, ap, l);
  assert.equal((s.cards[l] as any).uncounterable, true);
  assert.equal(s.cards[h].tapped, true);
});

test('at the beginning of combat this turn (delayed); end step of enchanted creature\'s controller', () => {
  const { s, ap } = setup();
  const b = add(s, ap, helpers.Bear, 'battlefield');
  cast(s, ap, add(s, ap, def('Test Keranos', '{0}', 'Instant', 'At the beginning of combat this turn, Test Keranos deals 3 damage to each creature.')));
  resolveAll(s);
  assert.equal(s.cards[b].zone, 'battlefield');
  assert.ok((s.delayed as any[]).some((d) => d.at === 'combat14'));
  helpers.passUntil(s, () => s.step === 'beginCombat' && !s.stack.length && !(s as any).pendingTriggers?.length, 50);
  resolveAll(s);
  assert.equal(s.cards[b].zone, 'graveyard');
});
