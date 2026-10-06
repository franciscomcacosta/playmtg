// Tests for src/engine/ext/mechanics.ts: speed, prepared, the Ring; and "any player may activate".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll, passUntil, dispatch, chars, Bear } from './helpers';

test('start your engines: speed starts at 1, rises once per turn, max speed unlocks abilities', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 6);
  const car = add(s, ap, def('Test Racer', '{2}', 'Creature — Vehicle', 'Start your engines!\nMax speed — Test Racer has flying.', ['2', '2']));
  cast(s, ap, car);
  resolveAll(s);
  assert.equal((s.players[ap] as any).speed, 1);
  assert.ok(!chars(s, car).keywords.has('flying'));
  const bolt = () => {
    cast(s, ap, add(s, ap, def('Test Shock', '{0}', 'Instant', 'Test Shock deals 1 damage to any target.')));
    resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'player', idx: op }] : undefined));
  };
  bolt(); bolt();
  assert.equal((s.players[ap] as any).speed, 2, 'only once per turn');
  (s.players[ap] as any).speed = 4;
  assert.ok(chars(s, car).keywords.has('flying'));
});

test('prepared: cast a copy of the spell half, which unprepares the creature', () => {
  const { s, ap } = setup();
  lands(s, ap, 6);
  const d = def('Test Chef // Snack', '{1}{G} // {G}', 'Creature — Human // Sorcery', '', ['2', '2'], {
    layout: 'prepare',
    faces: [
      { name: 'Test Chef', manaCost: '{1}{G}', typeLine: 'Creature — Human', oracle: 'This creature enters prepared.', power: '2', toughness: '2' },
      { name: 'Snack', manaCost: '{G}', typeLine: 'Sorcery', oracle: 'You gain 3 life.' },
    ],
  } as any);
  const chef = add(s, ap, d);
  cast(s, ap, chef, { face: 0 });
  resolveAll(s);
  assert.equal((s.cards[chef] as any).prepared, true);
  const idx = chars(s, chef).pc.activated.findIndex((a: any) => a.extSpecial === 'prepare');
  assert.ok(idx >= 0);
  const life = s.players[ap].life;
  assert.equal(dispatch(s, ap, { type: 'activate', iid: chef, ability: idx }), null);
  resolveAll(s);
  assert.equal(s.players[ap].life, life + 3);
  assert.equal((s.cards[chef] as any).prepared, false);
  assert.equal(s.cards[chef].zone, 'battlefield');
  assert.ok(!Object.values(s.cards).some((c: any) => c.prepCopy), 'copy is gone');
  assert.ok(dispatch(s, ap, { type: 'activate', iid: chef, ability: idx }), 'not prepared any more');
});

test('the Ring tempts you: choose a Ring-bearer, level 1 evasion, tempted triggers', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 4);
  const hob = add(s, ap, def('Test Hobbit', '{1}', 'Creature — Halfling', '', ['1', '1']), 'battlefield');
  const gan = add(s, ap, def('Test Wizard', '{1}', 'Creature — Wizard', 'Whenever the Ring tempts you, if you chose a creature other than Test Wizard as your Ring-bearer, you gain 2 life.', ['2', '2']), 'battlefield');
  const life = s.players[ap].life;
  cast(s, ap, add(s, ap, def('Test Call', '{1}', 'Sorcery', 'The Ring tempts you.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? [hob] : undefined));
  assert.equal((s.players[ap] as any).ringBearer, hob);
  assert.equal((s.players[ap] as any).ringLevel, 1);
  assert.equal(s.players[ap].life, life + 2);
  const big = add(s, op, Bear, 'battlefield');
  passUntil(s, () => s.prompt?.kind === 'declareAttackers');
  dispatch(s, ap, { type: 'answer', promptId: s.prompt!.id, choice: [{ iid: hob, target: { kind: 'player', idx: op } }] });
  passUntil(s, () => s.step === 'main2');
  assert.equal(s.players[op].life, 19, 'greater power cannot block the Ring-bearer');
  void big;
  void gan;
});

test('any player may activate this ability', () => {
  const { s, ap, op } = setup();
  const d = add(s, ap, def('Test Bazaar', '{2}', 'Artifact', '{0}: You draw a card. Any player may activate this ability.'), 'battlefield');
  add(s, op, Bear, 'library');
  s.priority = op;
  const h = s.players[op].hand.length;
  assert.equal(dispatch(s, op, { type: 'activate', iid: d, ability: 0 }), null);
  resolveAll(s);
  assert.equal(s.players[op].hand.length, h + 1);
});
