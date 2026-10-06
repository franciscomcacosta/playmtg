// Cross-card interactions with REAL cards: triggers from other permanents, replacement effects,
// simultaneous events, and combos (including infinite ones the engine must stop safely).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setup, add, lands, cast, resolveAll, passUntil, dispatch, chars } from './helpers';
import type { CardDef } from '../src/engine/cardTypes';
import type { GameState, PlayerIdx } from '../src/engine/types';

const db = JSON.parse(readFileSync(new URL('../data/cards.json', import.meta.url), 'utf8'));
const byName = new Map<string, any>(db.cards.map((c: any) => [c.name.toLowerCase(), c]));
/** A real card from the database. */
export function real(name: string): CardDef {
  const c = byName.get(name.toLowerCase());
  if (!c) throw new Error(`no card ${name}`);
  return c;
}
const named = (s: GameState, name: string) => s.battlefield.filter((b) => s.defs[s.cards[b].defId].name === name || chars(s, b).name === name);
const act = (s: GameState, p: PlayerIdx, iid: string, i = 0) => assert.equal(dispatch(s, p, { type: 'activate', iid, ability: i }), null);
const tgt = (iid: string) => ({ kind: 'card', iid });
const auto = (pick: (st: GameState) => any) => (st: GameState) => pick(st);

test('Blood Artist sees every creature that dies at the same time, including itself (Wrath of God)', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 6);
  add(s, ap, real('Blood Artist'), 'battlefield');
  add(s, ap, real('Grizzly Bears'), 'battlefield');
  add(s, op, real('Grizzly Bears'), 'battlefield');
  add(s, op, real('Grizzly Bears'), 'battlefield');
  cast(s, ap, add(s, ap, real('Wrath of God')));
  resolveAll(s, auto((st) => (st.prompt?.kind === 'targets' ? [{ kind: 'player', idx: op }] : undefined)));
  // 4 creatures died → 4 Blood Artist triggers
  assert.equal(s.players[op].life, 16);
  assert.equal(s.players[ap].life, 24);
});

test('sacrifice outlet + death trigger engines (Viscera Seer, Zulaport Cutthroat, Blood Artist)', () => {
  const { s, ap, op } = setup();
  const seer = add(s, ap, real('Viscera Seer'), 'battlefield');
  add(s, ap, real('Zulaport Cutthroat'), 'battlefield');
  add(s, ap, real('Blood Artist'), 'battlefield');
  const fodder = [add(s, ap, real('Grizzly Bears'), 'battlefield'), add(s, ap, real('Grizzly Bears'), 'battlefield')];
  for (const f of fodder) {
    act(s, ap, seer);
    resolveAll(s, auto((st) => (st.prompt?.kind === 'chooseCards' && /sacrifice|Sacrifice/.test(st.prompt.title) ? [f] : st.prompt?.kind === 'targets' ? [{ kind: 'player', idx: op }] : undefined)));
  }
  // each sacrifice: Zulaport drains 1, Blood Artist drains 1
  assert.equal(s.players[op].life, 16);
  assert.equal(s.players[ap].life, 24);
});

test('token makers + ETB/anthem/damage engines (Raise the Alarm, Soul Warden, Impact Tremors, Anointed Procession, Glorious Anthem)', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 4);
  add(s, ap, real('Soul Warden'), 'battlefield');
  add(s, ap, real('Impact Tremors'), 'battlefield');
  add(s, ap, real('Anointed Procession'), 'battlefield');
  add(s, ap, real('Glorious Anthem'), 'battlefield');
  cast(s, ap, add(s, ap, real('Raise the Alarm')));
  resolveAll(s);
  const soldiers = named(s, 'Soldier');
  assert.equal(soldiers.length, 4, 'Anointed Procession doubles the two tokens');
  assert.equal(chars(s, soldiers[0]).power, 2, 'anthem applies to new tokens');
  assert.equal(s.players[ap].life, 24, 'Soul Warden sees each token');
  assert.equal(s.players[op].life, 16, 'Impact Tremors sees each token');
});

test('counter replacement stacking: Hardened Scales + Walking Ballista', () => {
  const { s, ap } = setup();
  lands(s, ap, 4);
  add(s, ap, real('Hardened Scales'), 'battlefield');
  const b = add(s, ap, real('Walking Ballista'));
  cast(s, ap, b);
  resolveAll(s, auto((st) => (st.prompt?.kind === 'x' ? 2 : undefined)));
  assert.equal(s.cards[b].counters['+1/+1'], 3);
});

test('spell triggers: Young Pyromancer, Guttersnipe and prowess all fire off one instant', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 4);
  add(s, ap, real('Young Pyromancer'), 'battlefield');
  add(s, ap, real('Guttersnipe'), 'battlefield');
  const monk = add(s, ap, real('Monastery Swiftspear'), 'battlefield');
  const shock = add(s, ap, real('Shock'));
  cast(s, ap, shock);
  resolveAll(s, auto((st) => (st.prompt?.kind === 'targets' ? [{ kind: 'player', idx: op }] : undefined)));
  assert.equal(named(s, 'Elemental').length, 1);
  assert.equal(s.players[op].life, 20 - 2 - 2);
  assert.equal(chars(s, monk).power, 2);
});

test('landfall and fetch: Lotus Cobra / Evolving Wilds put two lands in, two landfall triggers', () => {
  const { s, ap } = setup();
  add(s, ap, real('Omnath, Locus of Rage'), 'battlefield');
  const wilds = add(s, ap, real('Evolving Wilds'));
  const forest = add(s, ap, real('Forest'), 'library');
  assert.equal(dispatch(s, ap, { type: 'playLand', iid: wilds }), null);
  resolveAll(s);
  act(s, ap, wilds);
  resolveAll(s, auto((st) => (st.prompt?.kind === 'chooseCards' ? [forest] : undefined)));
  assert.equal(s.cards[forest].zone, 'battlefield');
  assert.equal(named(s, 'Elemental').length, 2);
});

test('Grave Pact makes the opponent sacrifice when your creature dies', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 2);
  add(s, ap, real('Grave Pact'), 'battlefield');
  const mine = add(s, ap, real('Grizzly Bears'), 'battlefield');
  const theirs = add(s, op, real('Grizzly Bears'), 'battlefield');
  cast(s, ap, add(s, ap, real('Shock')));
  resolveAll(s, auto((st) => (st.prompt?.kind === 'targets' ? [tgt(mine)] : undefined)));
  assert.equal(s.cards[mine].zone, 'graveyard');
  assert.equal(s.cards[theirs].zone, 'graveyard');
});

test('Clone copying a creature with an ETB trigger gets the ETB', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 6);
  add(s, ap, real('Flametongue Kavu'), 'battlefield');
  const victim = add(s, op, real('Grizzly Bears'), 'battlefield');
  cast(s, ap, add(s, ap, real('Clone')));
  resolveAll(s, auto((st) => (st.prompt?.kind === 'chooseCards' || st.prompt?.kind === 'targets' ? (st.prompt.kind === 'targets' ? [st.prompt.targets!.find((t: any) => t.iid === victim) ?? st.prompt.targets![0]] : [named(st, 'Flametongue Kavu')[0]]) : undefined)));
  assert.equal(s.cards[victim].zone, 'graveyard');
});

test('Panharmonicon doubles ETB triggers; Doubling Season doubles counters and tokens', () => {
  const { s, ap } = setup();
  lands(s, ap, 8);
  add(s, ap, real('Panharmonicon'), 'battlefield');
  add(s, ap, real('Soul Warden'), 'battlefield');
  const life = s.players[ap].life;
  cast(s, ap, add(s, ap, real('Grizzly Bears')));
  resolveAll(s);
  assert.equal(s.players[ap].life, life + 2, 'Soul Warden triggers twice');
  add(s, ap, real('Doubling Season'), 'battlefield');
  const b = add(s, ap, real('Walking Ballista'));
  cast(s, ap, b);
  resolveAll(s, auto((st) => (st.prompt?.kind === 'x' ? 1 : undefined)));
  assert.equal(s.cards[b].counters['+1/+1'], 2);
});

test('infinite combo: Exquisite Blood + Sanguine Bond ends the game instead of hanging', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 2);
  add(s, ap, real('Exquisite Blood'), 'battlefield');
  add(s, ap, real('Sanguine Bond'), 'battlefield');
  cast(s, ap, add(s, ap, real('Shock')));
  resolveAll(s, auto((st) => (st.prompt?.kind === 'targets' ? [{ kind: 'player', idx: op }] : undefined)));
  for (let i = 0; i < 200 && !s.over; i++) resolveAll(s);
  assert.equal(s.over, true);
  assert.equal(s.winner, ap);
});

test('infinite combo: Kiki-Jiki + Pestermite makes as many hasty copies as you want', () => {
  const { s, ap } = setup();
  lands(s, ap, 8);
  const kiki = add(s, ap, real('Kiki-Jiki, Mirror Breaker'), 'battlefield');
  add(s, ap, real('Pestermite'), 'battlefield');
  for (let i = 0; i < 5; i++) {
    const pes = named(s, 'Pestermite');
    act(s, ap, kiki);
    resolveAll(s, auto((st) => (st.prompt?.kind === 'targets' ? (st.prompt.targets!.some((t: any) => t.iid === kiki) ? [tgt(kiki)] : [st.prompt.targets!.find((t: any) => pes.includes(t.iid)) ?? st.prompt.targets![0]]) : undefined)));
  }
  assert.ok(named(s, 'Pestermite').length >= 6, `copies: ${named(s, 'Pestermite').length}`);
});

test('opponent triggers: Rhystic Study draws unless they pay', () => {
  const { s, ap, op } = setup();
  add(s, op, real('Rhystic Study'), 'battlefield');
  lands(s, ap, 2);
  const h = s.players[op].hand.length;
  cast(s, ap, add(s, ap, real('Grizzly Bears')));
  resolveAll(s, auto((st) => (st.prompt?.kind === 'yesno' ? (st.prompt.player === ap ? 'no' : 'yes') : undefined)));
  assert.equal(s.players[op].hand.length, h + 1);
});

test('both players\' triggers on one event go on the stack in APNAP order', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 2);
  add(s, ap, real('Soul Warden'), 'battlefield');
  add(s, op, real('Soul Warden'), 'battlefield');
  cast(s, ap, add(s, ap, real('Grizzly Bears')));
  resolveAll(s);
  assert.equal(s.players[ap].life, 21);
  assert.equal(s.players[op].life, 21);
  passUntil(s, () => true);
});

test('"lesser" comparisons: Colfenor returns only creature cards with lesser toughness than the creature that died', () => {
  const { s, ap } = setup();
  lands(s, ap, 2);
  add(s, ap, real('Colfenor, the Last Yew'), 'battlefield');
  const bear = add(s, ap, real('Grizzly Bears'), 'battlefield'); // toughness 2
  const elf = add(s, ap, real('Llanowar Elves'), 'graveyard'); // toughness 1
  const big = add(s, ap, real('Craw Wurm'), 'graveyard'); // toughness 4
  cast(s, ap, add(s, ap, real('Shock')));
  let offered: string[] = [];
  resolveAll(s, auto((st) => {
    if (st.prompt?.kind !== 'targets') return undefined;
    if (st.prompt.targets!.some((t: any) => t.iid === bear)) return [tgt(bear)];
    offered = st.prompt.targets!.map((t: any) => t.iid);
    return [tgt(elf)];
  }));
  assert.ok(!offered.includes(big), 'Craw Wurm is not a legal target');
  assert.equal(s.cards[elf].zone, 'hand');
  assert.equal(s.cards[big].zone, 'graveyard');
});

test('Mentor only targets an attacking creature with lesser power', () => {
  const { s, ap, op } = setup();
  const mentor = add(s, ap, real('Boros Challenger'), 'battlefield'); // 2/3 mentor
  const small = add(s, ap, real('Llanowar Elves'), 'battlefield');
  const big = add(s, ap, real('Craw Wurm'), 'battlefield');
  for (const c of [mentor, small, big]) s.cards[c].sick = false;
  passUntil(s, () => s.prompt?.kind === 'declareAttackers');
  dispatch(s, ap, { type: 'answer', promptId: s.prompt!.id, choice: [mentor, small, big].map((iid) => ({ iid, target: { kind: 'player', idx: op } })) });
  let offered: string[] = [];
  resolveAll(s, auto((st) => (st.prompt?.kind === 'targets' ? ((offered = st.prompt.targets!.map((t: any) => t.iid)), [tgt(small)]) : undefined)));
  assert.deepEqual(offered, [small]);
  assert.equal(s.cards[small].counters['+1/+1'], 1);
});

for (const pay of [true, false]) test(`Monstrosity of the Lake: stun counters go on the opponent's creatures only, and only if you pay (${pay ? 'paid' : 'declined'})`, () => {
  const { s, ap, op } = setup();
  lands(s, ap, 10);
  const theirs = [add(s, op, real('Grizzly Bears'), 'battlefield'), add(s, op, real('Llanowar Elves'), 'battlefield')];
  const mine = add(s, ap, real('Grizzly Bears'), 'battlefield');
  const m = add(s, ap, real('Monstrosity of the Lake'));
  cast(s, ap, m);
  resolveAll(s, auto((st) => (st.prompt?.kind === 'yesno' ? (pay ? 'yes' : 'no') : undefined)));
  assert.equal(s.cards[m].zone, 'battlefield');
  for (const t of theirs) {
    assert.equal(s.cards[t].tapped, pay);
    assert.equal(s.cards[t].counters.stun ?? 0, pay ? 1 : 0);
  }
  assert.equal(s.cards[m].counters.stun ?? 0, 0, 'never on the Monstrosity itself');
  assert.equal(s.cards[mine].counters.stun ?? 0, 0);
});
