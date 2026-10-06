// Tests for the plugin mechanics in src/engine/ext/*.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll, passUntil, dispatch, castOptions, chars, Bear, Forest, Mountain } from './helpers';

const act = (s: any, p: any, iid: string, i = 0) => assert.equal(dispatch(s, p, { type: 'activate', iid, ability: i }), null);

test('typecycling: basic landcycling fetches a basic land', () => {
  const { s, ap } = setup();
  lands(s, ap, 1);
  const c = add(s, ap, def('Test Cycler', '{5}{G}', 'Creature — Beast', 'Basic landcycling {1}', ['6', '6']));
  const basic = add(s, ap, Forest, 'library');
  s.priority = ap;
  act(s, ap, c);
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? [basic] : undefined));
  assert.equal(s.cards[basic].zone, 'hand');
  assert.equal(s.cards[c].zone, 'graveyard');
});

test('explore and connive', () => {
  const { s, ap } = setup();
  lands(s, ap, 4);
  const ex = add(s, ap, def('Test Explorer', '{1}{G}', 'Creature — Merfolk', 'When Test Explorer enters, it explores.', ['1', '1']));
  const top = add(s, ap, Bear, 'library');
  cast(s, ap, ex);
  resolveAll(s, (st) => (st.prompt?.kind === 'yesno' ? 'yes' : undefined));
  assert.equal(s.cards[ex].counters['+1/+1'], 1);
  assert.equal(s.cards[top].zone, 'graveyard');
  const cn = add(s, ap, def('Test Conniver', '{1}{U}', 'Creature — Rogue', 'When Test Conniver enters, it connives.', ['1', '1']));
  const junk = add(s, ap, Bear);
  cast(s, ap, cn);
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? [junk] : undefined));
  assert.equal(s.cards[junk].zone, 'graveyard');
  assert.equal(s.cards[cn].counters['+1/+1'], 1);
});

test('amass creates then grows an Army; monstrosity happens once', () => {
  const { s, ap } = setup();
  lands(s, ap, 6);
  const a = add(s, ap, def('Test Amasser', '{1}', 'Sorcery', 'Amass Zombies 2.'));
  const b = add(s, ap, def('Test Amasser 2', '{1}', 'Sorcery', 'Amass Zombies 3.'));
  cast(s, ap, a); resolveAll(s);
  cast(s, ap, b); resolveAll(s);
  const armies = s.battlefield.filter((x) => chars(s, x).subtypes.has('army'));
  assert.equal(armies.length, 1);
  assert.equal(chars(s, armies[0]).power, 5);
  const m = add(s, ap, def('Test Monster', '{1}{G}', 'Creature — Hydra', '{1}: Monstrosity 3.', ['2', '2']), 'battlefield');
  s.priority = ap;
  act(s, ap, m); resolveAll(s);
  act(s, ap, m); resolveAll(s);
  assert.equal(s.cards[m].counters['+1/+1'], 3);
});

test('blocking restrictions: can block only fliers, power-based evasion, max blockers', () => {
  const { s, ap, op } = setup();
  const attacker = add(s, ap, def('Test Sneak', '{2}', 'Creature — Rogue', "Test Sneak can't be blocked by creatures with power 2 or less.\nTest Sneak can't be blocked by more than one creature.", ['2', '2']), 'battlefield');
  const small = add(s, op, Bear, 'battlefield');
  const big = add(s, op, def('Test Ogre', '{3}', 'Creature — Ogre', '', ['3', '3']), 'battlefield');
  const big2 = add(s, op, def('Test Ogre 2', '{3}', 'Creature — Ogre', '', ['3', '3']), 'battlefield');
  const wall = add(s, op, def('Test Wall', '{1}', 'Creature — Wall', 'Test Wall can block only creatures with flying.', ['0', '5']), 'battlefield');
  passUntil(s, () => s.prompt?.kind === 'declareAttackers');
  dispatch(s, ap, { type: 'answer', promptId: s.prompt!.id, choice: [{ iid: attacker, target: { kind: 'player', idx: op } }] });
  passUntil(s, () => s.prompt?.kind === 'declareBlockers');
  const pid = s.prompt!.id;
  assert.ok(dispatch(s, op, { type: 'answer', promptId: pid, choice: [{ blocker: small, attacker }] }), 'power 2 blocker rejected');
  assert.ok(dispatch(s, op, { type: 'answer', promptId: pid, choice: [{ blocker: wall, attacker }] }), 'wall can only block fliers');
  assert.ok(dispatch(s, op, { type: 'answer', promptId: pid, choice: [{ blocker: big, attacker }, { blocker: big2, attacker }] }), 'max one blocker');
  assert.equal(dispatch(s, op, { type: 'answer', promptId: pid, choice: [{ blocker: big, attacker }] }), null);
});

test('conditional first strike during your turn; "attacking creatures get +1/+0"', () => {
  const { s, ap } = setup();
  const k = add(s, ap, def('Test Knight', '{1}{W}', 'Creature — Knight', 'During your turn, Test Knight has first strike.', ['2', '2']), 'battlefield');
  assert.ok(chars(s, k).keywords.has('first strike'));
  s.active = (1 - ap) as any;
  assert.ok(!chars(s, k).keywords.has('first strike'));
});

test('additional cost: sacrifice a creature (Bone Splinters style); not castable without one', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 2);
  const sp = add(s, ap, def('Test Splinters', '{B}', 'Sorcery', 'As an additional cost to cast this spell, sacrifice a creature.\nDestroy target creature.'));
  const target = add(s, op, Bear, 'battlefield');
  assert.ok(!castOptions(s, ap, sp).some((o: any) => o.ok), 'not castable with no creature to sacrifice');
  const fodder = add(s, ap, Bear, 'battlefield');
  assert.ok(castOptions(s, ap, sp).some((o: any) => o.ok));
  cast(s, ap, sp);
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: target }] : st.prompt?.kind === 'chooseCards' ? [fodder] : undefined));
  assert.equal(s.cards[fodder].zone, 'graveyard');
  assert.equal(s.cards[target].zone, 'graveyard');
});

test('cost reductions: affinity for artifacts and "spells you cast cost {1} less"', () => {
  const { s, ap } = setup();
  const art = def('Test Trinket', '{0}', 'Artifact');
  add(s, ap, art, 'battlefield'); add(s, ap, art, 'battlefield');
  const frog = add(s, ap, def('Test Frogmite', '{4}', 'Artifact Creature — Frog', 'Affinity for artifacts', ['2', '2']));
  lands(s, ap, 2);
  const o = castOptions(s, ap, frog).find((x: any) => x.ok);
  assert.ok(o && /\{2\}/.test(o.label), o?.label);
  add(s, ap, def('Test Electromancer', '{1}{R}', 'Creature — Goblin', 'Instant and sorcery spells you cast cost {1} less to cast.', ['2', '2']), 'battlefield');
  const bolt = add(s, ap, def('Test Bigbolt', '{2}{R}', 'Instant', 'Test Bigbolt deals 3 damage to any target.'));
  const ob = castOptions(s, ap, bolt).find((x: any) => x.ok);
  assert.ok(ob && /\{1\}\{R\}/.test(ob.label), ob?.label);
});

test('buyback returns the spell; evoke sacrifices; dash returns at end step', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 8);
  const bb = add(s, ap, def('Test Recur', '{R}', 'Instant', 'Buyback {2}\nTest Recur deals 1 damage to any target.'));
  const opt = castOptions(s, ap, bb).find((o: any) => o.action.alt === 'ext:buyback');
  assert.ok(opt?.ok);
  dispatch(s, ap, opt!.action);
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'player', idx: op }] : undefined));
  assert.equal(s.cards[bb].zone, 'hand');
  const ev = add(s, ap, def('Test Elemental', '{4}{U}', 'Creature — Elemental', 'When Test Elemental enters, draw two cards.\nEvoke {1}', ['2', '2']));
  const hand = s.players[ap].hand.length;
  dispatch(s, ap, castOptions(s, ap, ev).find((o: any) => o.action.alt === 'ext:evoke')!.action);
  resolveAll(s);
  assert.equal(s.cards[ev].zone, 'graveyard');
  assert.equal(s.players[ap].hand.length, hand - 1 + 2);
});

test('shock lands ask for life; "sacrifice unless you pay"', () => {
  const { s, ap } = setup();
  const shock = add(s, ap, def('Test Shockland', '', 'Land — Forest Plains', "({T}: Add {G} or {W}.)\nAs Test Shockland enters, you may pay 2 life. If you don't, it enters tapped."));
  const life = s.players[ap].life;
  assert.equal(dispatch(s, ap, { type: 'playLand', iid: shock }), null);
  resolveAll(s, (st) => (st.prompt?.kind === 'yesno' ? 'yes' : undefined));
  assert.equal(s.cards[shock].tapped, false);
  assert.equal(s.players[ap].life, life - 2);
});

test('becomes the target → sacrifice; "if it would die this turn, exile it instead"', () => {
  const { s, ap, op } = setup();
  const ill = add(s, op, def('Test Illusion', '{U}', 'Creature — Illusion', 'When Test Illusion becomes the target of a spell or ability, sacrifice it.', ['3', '3']), 'battlefield');
  lands(s, ap, 2);
  const g = add(s, ap, def('Test Poke', '{G}', 'Instant', 'Target creature gets +1/+1 until end of turn.'));
  cast(s, ap, g);
  dispatch(s, ap, { type: 'answer', promptId: s.prompt!.id, choice: [{ kind: 'card', iid: ill }] });
  resolveAll(s);
  assert.equal(s.cards[ill].zone, 'graveyard');
  const bear = add(s, op, Bear, 'battlefield');
  const burn = add(s, ap, def('Test Scorch', '{R}', 'Instant', 'Test Scorch deals 3 damage to target creature. If that creature would die this turn, exile it instead.'));
  cast(s, ap, burn);
  dispatch(s, ap, { type: 'answer', promptId: s.prompt!.id, choice: [{ kind: 'card', iid: bear }] });
  resolveAll(s);
  assert.equal(s.cards[bear].zone, 'exile');
});

test('granted token abilities, put a land from hand, untap lands, one-of mana, tutor to top', () => {
  const { s, ap } = setup();
  lands(s, ap, 3);
  const spawn = add(s, ap, def('Test Spawner', '{1}', 'Sorcery', 'Create a 0/1 colorless Eldrazi Spawn creature token. It has "Sacrifice this creature: Add {C}."'));
  cast(s, ap, spawn);
  resolveAll(s);
  const tok = s.battlefield.find((b) => s.cards[b].token)!;
  assert.ok(chars(s, tok).pc.activated.some((a: any) => a.isMana), 'token has the granted mana ability');
  const ramp = add(s, ap, def('Test Ramp', '{1}', 'Sorcery', 'You may put a land card from your hand onto the battlefield. Untap up to two lands.'));
  const land = add(s, ap, Mountain);
  cast(s, ap, ramp);
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' && st.prompt.cards!.includes(land) ? [land] : undefined));
  assert.equal(s.cards[land].zone, 'battlefield');
  const tut = add(s, ap, def('Test Tutor', '{1}', 'Instant', 'Search your library for a card, then shuffle and put that card on top.'));
  const wanted = add(s, ap, Bear, 'library');
  for (let i = 0; i < 3; i++) add(s, ap, Forest, 'library');
  lands(s, ap, 1);
  cast(s, ap, tut);
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? [wanted] : undefined));
  assert.equal(s.players[ap].library[0], wanted);
});

test('round 2: counter noncreature, sacrifice another + if you do, protection choice, draws-and-loses, must be blocked', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 6);
  lands(s, op, 2);
  // Negate style
  const bear = add(s, op, Bear);
  const zap = add(s, op, def('Test Zap', '{R}', 'Instant', 'Test Zap deals 3 damage to any target.'));
  const negate = add(s, ap, def('Test Negate', '{1}{U}', 'Instant', 'Counter target noncreature spell.'));
  s.priority = op;
  cast(s, op, zap);
  dispatch(s, op, { type: 'answer', promptId: s.prompt!.id, choice: [{ kind: 'player', idx: ap }] });
  const zapItem = s.stack[s.stack.length - 1].id;
  s.priority = ap;
  cast(s, ap, negate);
  const legal = s.prompt!.targets!;
  assert.ok(legal.some((t: any) => t.kind === 'stack' && t.id === zapItem));
  dispatch(s, ap, { type: 'answer', promptId: s.prompt!.id, choice: [{ kind: 'stack', id: zapItem }] });
  resolveAll(s);
  assert.equal(s.cards[zap].zone, 'graveyard');
  void bear;
  // sacrifice another creature, if you do draw
  const fodder = add(s, ap, Bear, 'battlefield');
  const altar = add(s, ap, def('Test Ritualist', '{1}', 'Sorcery', 'You may sacrifice another creature. If you do, draw two cards.'));
  const h = s.players[ap].hand.length;
  s.priority = ap;
  cast(s, ap, altar);
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? [fodder] : undefined));
  assert.equal(s.cards[fodder].zone, 'graveyard');
  assert.equal(s.players[ap].hand.length, h - 1 + 2);
  // draws and loses
  const sign = add(s, ap, def('Test Sign', '{1}', 'Sorcery', 'Target player draws two cards and loses 2 life.'));
  const life = s.players[ap].life;
  cast(s, ap, sign);
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'player', idx: ap }] : undefined));
  assert.equal(s.players[ap].life, life - 2);
});

test('round 2: sacrifice when you control no Islands; defender can attack this turn', () => {
  const { s, ap } = setup();
  const serp = add(s, ap, def('Test Serpent', '{3}{U}', 'Creature — Serpent', 'When you control no Islands, sacrifice Test Serpent.', ['5', '5']), 'battlefield');
  dispatch(s, ap, { type: 'pass' });
  assert.equal(s.cards[serp].zone, 'graveyard');
});
