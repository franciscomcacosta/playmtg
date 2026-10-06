// Tests for the trigger-event plugin (src/engine/ext/events.ts) and compound trigger heads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll, passUntil, dispatch, Bear, Forest } from './helpers';
import { parseCard } from '../src/engine/oracle';
import { automationLevel } from '../src/engine/oracle';

const attack = (s: any, ap: any, op: any, ids: string[]) => {
  passUntil(s, () => s.prompt?.kind === 'declareAttackers');
  assert.equal(dispatch(s, ap, { type: 'answer', promptId: s.prompt!.id, choice: ids.map((iid) => ({ iid, target: { kind: 'player', idx: op } })) }), null);
};
const block = (s: any, op: any, list: { blocker: string; attacker: string }[]) => {
  passUntil(s, () => s.prompt?.kind === 'declareBlockers');
  assert.equal(dispatch(s, op, { type: 'answer', promptId: s.prompt!.id, choice: list }), null);
};

test('when you cast ~ triggers from the stack; noncreature spell filter parses', () => {
  const { s, ap } = setup();
  lands(s, ap, 6);
  const t = add(s, ap, def('Test Titan', '{3}', 'Creature — Eldrazi', 'When you cast this spell, draw a card.', ['4', '4']));
  const hand = s.players[ap].hand.length;
  cast(s, ap, t);
  resolveAll(s);
  assert.equal(s.players[ap].hand.length, hand); // -1 cast, +1 draw
  const pro = add(s, ap, def('Test Prowler', '{1}', 'Creature — Cat', 'Whenever you cast a noncreature spell, put a +1/+1 counter on Test Prowler.', ['1', '1']), 'battlefield');
  add(s, ap, Forest, 'library');
  cast(s, ap, add(s, ap, def('Test Draw', '{1}', 'Instant', 'Draw a card.')));
  resolveAll(s);
  cast(s, ap, add(s, ap, Bear));
  resolveAll(s);
  assert.equal(s.cards[pro].counters['+1/+1'], 1);
});

test('compound heads: "when ~ enters or dies" and "~ or another Ally enters"', () => {
  const pc: any = parseCard(def('Test Twin', '{1}', 'Creature — Spirit', 'When Test Twin enters or dies, you gain 2 life.', ['1', '1']));
  assert.deepEqual(pc.triggers.map((t: any) => t.event).sort(), ['dies', 'etb']);
  const ally: any = parseCard(def('Test Ally', '{1}', 'Creature — Ally', 'Whenever Test Ally or another Ally you control enters, you gain 1 life.', ['1', '1']));
  assert.deepEqual(ally.triggers.map((t: any) => t.event).sort(), ['etb', 'otherEtb']);
  const { s, ap } = setup();
  lands(s, ap, 4);
  const a = add(s, ap, def('Test Ally', '{1}', 'Creature — Ally', 'Whenever Test Ally or another Ally you control enters, you gain 1 life.', ['1', '1']));
  const life = s.players[ap].life;
  cast(s, ap, a); resolveAll(s);
  cast(s, ap, add(s, ap, def('Test Ally 2', '{1}', 'Creature — Ally', '', ['1', '1']))); resolveAll(s);
  assert.equal(s.players[ap].life, life + 2);
});

test('whenever you attack / attacks alone / equipped creature attacks', () => {
  const { s, ap, op } = setup();
  const b = add(s, ap, Bear, 'battlefield');
  add(s, ap, def('Test Banner', '{1}', 'Enchantment', 'Whenever you attack, you gain 1 life.'), 'battlefield');
  add(s, ap, def('Test Lone', '{1}', 'Enchantment', 'Whenever a creature you control attacks alone, it gets +2/+2 until end of turn.'), 'battlefield');
  const eq = add(s, ap, def('Test Sword', '{1}', 'Artifact — Equipment', 'Whenever equipped creature attacks, you gain 3 life.\nEquip {1}'), 'battlefield');
  s.cards[eq].attachedTo = b;
  const life = s.players[ap].life;
  attack(s, ap, op, [b]);
  resolveAll(s);
  assert.equal(s.players[ap].life, life + 4);
  passUntil(s, () => s.step === 'main2');
  assert.equal(s.players[op].life, 20 - 4);
});

test('damage events: is dealt damage, deals damage to a player (that player discards), creature dealt damage dies', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 4);
  const spec = add(s, ap, def('Test Specter', '{2}', 'Creature — Specter', 'Whenever Test Specter deals damage to a player, that player discards a card.', ['2', '2']), 'battlefield');
  const vict = add(s, op, Bear);
  const enr = add(s, op, def('Test Enrage', '{2}', 'Creature — Dinosaur', 'Whenever Test Enrage is dealt damage, its controller draws a card.', ['3', '5']), 'battlefield');
  add(s, op, Forest, 'library');
  const opHand = s.players[op].hand.length;
  cast(s, ap, add(s, ap, def('Test Ping', '{1}', 'Instant', 'Test Ping deals 1 damage to any target.')), {});
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: enr }] : undefined));
  assert.equal(s.players[op].hand.length, opHand + 1, 'enrage drew');
  attack(s, ap, op, [spec]);
  block(s, op, []);
  passUntil(s, () => s.stack.length > 0 || s.pendingTriggers.length > 0 || !!s.prompt);
  resolveAll(s, (st) => (st.prompt?.kind === 'chooseCards' ? [vict] : undefined));
  assert.equal(s.cards[vict].zone, 'graveyard');
});

test('enchanted creature dies; you cycle ~; one or more cards leave your graveyard', () => {
  const { s, ap } = setup();
  lands(s, ap, 6);
  const b = add(s, ap, Bear, 'battlefield');
  const aura = add(s, ap, def('Test Mourning', '{1}', 'Enchantment — Aura', 'Enchant creature\nWhen enchanted creature dies, you gain 4 life.'), 'battlefield');
  s.cards[aura].attachedTo = b;
  const life = s.players[ap].life;
  cast(s, ap, add(s, ap, def('Test Kill', '{1}', 'Instant', 'Destroy target creature.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: b }] : undefined));
  assert.equal(s.players[ap].life, life + 4);
  const cyc = add(s, ap, def('Test Cycler', '{5}', 'Creature — Beast', 'When you cycle Test Cycler, you gain 2 life.\nCycling {1}', ['5', '5']));
  add(s, ap, Forest, 'library');
  assert.equal(dispatch(s, ap, { type: 'activate', iid: cyc, ability: 0 }), null);
  resolveAll(s);
  assert.equal(s.players[ap].life, life + 6);
});

test('coverage sanity: common heads are recognised', () => {
  for (const o of [
    'Whenever you cast your second spell each turn, draw a card.',
    'Whenever Test X attacks and isn\'t blocked, you gain 1 life.',
    'At the beginning of each combat, you gain 1 life.',
    'Whenever one or more +1/+1 counters are put on Test X, draw a card.',
    'Whenever you commit a crime, you gain 1 life.',
    'Whenever Test X becomes blocked by a creature, destroy that creature at end of combat.',
  ]) {
    const pc: any = parseCard(def('Test X', '{1}', 'Creature — Test', o, ['1', '1']));
    assert.equal(pc.unparsed.length, 0, o + ' → ' + pc.unparsed.join('|'));
    void automationLevel;
  }
});

test('more heads: ability-word compound, big spells, first life gain each turn', () => {
  const ally: any = parseCard(def('Test Naiad', '{1}', 'Creature — Naiad', 'Constellation — Whenever Test Naiad or another enchantment you control enters, you gain 1 life.', ['1', '1']));
  assert.deepEqual(ally.triggers.map((t: any) => t.event).sort(), ['etb', 'otherEtb']);
  const { s, ap } = setup();
  lands(s, ap, 8);
  add(s, ap, def('Test Stalk', '{1}', 'Enchantment', 'Whenever you cast a spell with mana value 5 or greater, draw a card.'), 'battlefield');
  add(s, ap, def('Test Seraph', '{1}', 'Enchantment', 'Whenever you gain life for the first time each turn, draw a card.'), 'battlefield');
  for (let i = 0; i < 5; i++) add(s, ap, Forest, 'library');
  const h = s.players[ap].hand.length;
  cast(s, ap, add(s, ap, def('Test Big', '{5}', 'Sorcery', 'You gain 1 life.', undefined, { cmc: 5 })));
  resolveAll(s);
  cast(s, ap, add(s, ap, def('Test Small', '{1}', 'Sorcery', 'You gain 1 life.', undefined, { cmc: 1 })));
  resolveAll(s);
  assert.equal(s.players[ap].hand.length, h + 2, 'one for the big spell, one for the first life gain');
});
