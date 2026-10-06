// src/engine/ext/batch9.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll, chars, dispatch, Bear, Forest } from './helpers';

test('Cataclysm: keep one of each type, sacrifice the rest', () => {
  const { s, ap, op } = setup();
  const myLands = lands(s, ap, 4) as any;
  const b1 = add(s, ap, Bear, 'battlefield'), b2 = add(s, ap, Bear, 'battlefield');
  const o1 = add(s, op, Bear, 'battlefield');
  const ol = add(s, op, Forest, 'battlefield'), ol2 = add(s, op, Forest, 'battlefield');
  cast(s, ap, add(s, ap, def('Test Cata', '{2}{W}{W}', 'Sorcery', 'Each player chooses from among the permanents they control an artifact, a creature, an enchantment, and a land, then sacrifices the rest.')));
  resolveAll(s);
  const mine = s.battlefield.filter((x) => s.cards[x].controller === ap);
  const theirs = s.battlefield.filter((x) => s.cards[x].controller === op);
  assert.equal(mine.length, 2, 'one creature + one land');
  assert.ok(mine.includes(b1) !== mine.includes(b2));
  assert.equal(theirs.length, 2);
  assert.ok(theirs.includes(o1));
  assert.ok(theirs.includes(ol) !== theirs.includes(ol2));
  void myLands;
});

test("Razia's Purification: keep three", () => {
  const { s, ap, op } = setup();
  lands(s, ap, 5);
  for (let k = 0; k < 4; k++) add(s, op, Bear, 'battlefield');
  cast(s, ap, add(s, ap, def('Test Razia', '{2}{R}{W}', 'Sorcery', 'Each player chooses three permanents they control, then sacrifices the rest.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? st.prompt.cards!.slice(0, st.prompt.max) : undefined));
  assert.equal(s.battlefield.filter((x) => s.cards[x].controller === ap).length, 3);
  assert.equal(s.battlefield.filter((x) => s.cards[x].controller === op).length, 3);
});

test('becomes a blue Frog 1/1 with no abilities until end of turn', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 2);
  const d = add(s, op, def('Test Drake', '{3}', 'Creature — Drake', 'Flying', ['4', '4']), 'battlefield');
  cast(s, ap, add(s, ap, def('Test Frogify', '{1}{U}', 'Instant', 'Until end of turn, target creature loses all abilities and becomes a blue Frog with base power and toughness 1/1.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: d }] : undefined));
  const c = chars(s, d);
  assert.equal(c.power, 1);
  assert.ok(!c.keywords.has('flying'));
  assert.ok(c.subtypes.has('frog') && !c.subtypes.has('drake'));
  assert.deepEqual(c.colors, ['U']);
});

test('until end of turn, prefix form pump', () => {
  const { s, ap } = setup();
  lands(s, ap, 1);
  const b = add(s, ap, Bear, 'battlefield');
  cast(s, ap, add(s, ap, def('Test Armor', '{B}', 'Instant', 'Until end of turn, target creature gets +1/+0 and gains indestructible.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: b }] : undefined));
  assert.equal(chars(s, b).power, 3);
  assert.ok(chars(s, b).keywords.has('indestructible'));
});

test('"… instead if …": checked once, one branch happens', () => {
  for (const arts of [0, 3]) {
    const { s, ap, op } = setup();
    lands(s, ap, 2);
    for (let k = 0; k < arts; k++) add(s, ap, def('Test Cog', '{1}', 'Artifact', ''), 'battlefield');
    cast(s, ap, add(s, ap, def('Test Blast', '{1}{R}', 'Instant', 'Test Blast deals 2 damage to any target. Test Blast deals 4 damage instead if you control three or more artifacts.')));
    resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'player', idx: op }] : undefined));
    assert.equal(s.players[op].life, arts ? 16 : 18);
  }
});

test('divided damage among target attacking or blocking creatures', () => {
  const { s, ap } = setup();
  lands(s, ap, 2);
  const b = add(s, ap, Bear, 'battlefield');
  const v = add(s, ap, def('Test Volley', '{1}{R}', 'Instant', 'Test Volley deals 3 damage divided as you choose among one, two, or three target attacking or blocking creatures.'));
  assert.match(dispatch(s, ap, { type: 'cast', iid: v }) ?? '', /No legal targets/, 'a creature not in combat is not a legal target');
  void b;
});

test('damage to target player or planeswalker and each creature that player controls', () => {
  for (const who of ['ap', 'op'] as const) {
    const { s, ap, op } = setup();
    lands(s, ap, 2);
    const mine = add(s, ap, Bear, 'battlefield'), theirs = add(s, op, Bear, 'battlefield');
    const P = who === 'ap' ? ap : op;
    cast(s, ap, add(s, ap, def('Test Quake', '{1}{R}', 'Sorcery', "Test Quake deals 2 damage to target player or planeswalker and each creature that player or that planeswalker's controller controls.")));
    resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'player', idx: P }] : undefined));
    assert.equal(s.players[P].life, 18);
    assert.equal(s.cards[who === 'ap' ? mine : theirs].zone, 'graveyard');
    assert.equal(s.cards[who === 'ap' ? theirs : mine].zone, 'battlefield');
  }
});

test('strive: {1}{W} more per extra target; any number of targets each get the pump', () => {
  const { s, ap } = setup();
  lands(s, ap, 4);
  const a = add(s, ap, Bear, 'battlefield'), b = add(s, ap, Bear, 'battlefield');
  const sp = add(s, ap, def('Test Strive', '{W}', 'Instant', 'Strive — This spell costs {1}{W} more to cast for each target beyond the first.\nAny number of target creatures each get +1/+1 until end of turn.'));
  cast(s, ap, sp);
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: a }, { kind: 'card', iid: b }] : undefined));
  assert.equal(chars(s, a).power, 3);
  assert.equal(chars(s, b).power, 3);
  assert.equal(s.battlefield.filter((x) => s.cards[x].controller === ap && s.cards[x].tapped).length, 3, 'paid {1}{W}{W}');
});

test('escalate: pay the escalate cost for each mode beyond the first', () => {
  const { s, ap } = setup();
  lands(s, ap, 5);
  const b = add(s, ap, Bear, 'battlefield');
  cast(s, ap, add(s, ap, def('Test Hostility', '{R}', 'Instant', 'Escalate {3}\nChoose one or both —\n• Target creature gets +3/+0 until end of turn.\n• Target creature gains first strike until end of turn.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'mode' ? st.prompt.options!.map((o) => o.id) : st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: b }] : undefined));
  assert.equal(chars(s, b).power, 5);
  assert.ok(chars(s, b).keywords.has('first strike'));
  assert.equal(s.battlefield.filter((x) => s.cards[x].controller === ap && s.cards[x].tapped).length, 4, 'paid {R} + {3}');
});

test('kicked version with its own targets', () => {
  for (const kick of [false, true]) {
    const { s, ap, op } = setup();
    lands(s, ap, 4);
    const big = add(s, op, def('Test Big', '{4}', 'Creature — Giant', '', ['5', '5'], { cmc: 4 }), 'battlefield');
    const small = add(s, op, def('Test Small', '{1}', 'Creature — Elf', '', ['1', '1'], { cmc: 1 }), 'battlefield');
    const sp = add(s, ap, def('Test Thirst', '{B}', 'Sorcery', 'Kicker {2}{B}\nDestroy target creature or planeswalker with mana value 2 or less. If this spell was kicked, instead destroy target creature or planeswalker.'));
    assert.equal(dispatch(s, ap, { type: 'cast', iid: sp, kicker: kick } as any), null);
    let seen: string[] = [];
    resolveAll(s, (st) => { if (st.prompt?.kind !== 'targets') return undefined; seen = st.prompt.targets!.map((t: any) => t.iid); return [{ kind: 'card', iid: kick ? big : small }]; });
    assert.equal(s.cards[kick ? big : small].zone, 'graveyard');
    assert.equal(seen.includes(big), kick);
  }
});

test('"gets +1/+1 until end of turn and deals 1 damage to you" and "+N/-N or -N/+N"', () => {
  const { s, ap } = setup();
  lands(s, ap, 2);
  const b = add(s, ap, def('Test Imp', '{1}', 'Creature — Imp', '{B}: This creature gets +1/+1 until end of turn and deals 1 damage to you.\n{U}: This creature gets +1/-1 or -1/+1 until end of turn.', ['2', '2']), 'battlefield');
  assert.equal(dispatch(s, ap, { type: 'activate', iid: b, ability: 0 }), null);
  resolveAll(s);
  assert.equal(chars(s, b).power, 3);
  assert.equal(s.players[ap].life, 19);
  assert.equal(dispatch(s, ap, { type: 'activate', iid: b, ability: 1 }), null);
  resolveAll(s, (st) => (st.prompt?.kind === 'yesno' ? 'no' : undefined));
  assert.equal(chars(s, b).power, 2);
  assert.equal(chars(s, b).toughness, 4);
});

test('mill, then put a land from among them into your hand', () => {
  const { s, ap } = setup();
  lands(s, ap, 1);
  const L = s.players[ap].library;
  const f = add(s, ap, Forest, 'library'); L.splice(L.indexOf(f), 1); L.unshift(f);
  cast(s, ap, add(s, ap, def('Test Dig', '{G}', 'Sorcery', 'Mill three cards. You may put a land card from among them into your hand.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? [f] : undefined));
  assert.equal(s.cards[f].zone, 'hand');
});

test('choose target creature you control and target creature you don\'t control, then they fight', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 2);
  const mine = add(s, ap, def('Test Big', '{3}', 'Creature — Bear', '', ['4', '4']), 'battlefield');
  const theirs = add(s, op, Bear, 'battlefield');
  cast(s, ap, add(s, ap, def('Test Brawl', '{G}', 'Sorcery', "Choose target creature you control and target creature you don't control. The creature you control gets +1/+0 until end of turn. Then those creatures fight each other.")));
  let k = 0;
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: k++ === 0 ? mine : theirs }] : undefined));
  assert.equal(s.cards[theirs].zone, 'graveyard');
  assert.equal(chars(s, mine).power, 5);
  assert.equal(s.cards[mine].damage, 2);
});
