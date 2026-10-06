// "Add one mana of any color in your commander's color identity" (Command Tower, Arcane Signet)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, startGame, dispatch, effProduces } from '../src/engine/engine';
import { def, add, passUntil, Forest, setup, chars, resolveAll } from './helpers';
import type { PlayerIdx } from '../src/engine/types';

const Cmdr = def('Test Duo', '{1}{G}{U}', 'Legendary Creature — Elf Wizard', '', ['3', '3'], { colorIdentity: ['G', 'U'] });
const Tower = def('Test Tower', '', 'Land', "{T}: Add one mana of any color in your commander's color identity.");

test('commander identity limits the colors', () => {
  const deck = Array.from({ length: 99 }, () => Forest);
  const s = createGame('c', [{ name: 'A', cards: deck, commanders: [Cmdr] }, { name: 'B', cards: deck, commanders: [Cmdr] }], 7, { format: 'commander' });
  s.players[0].fullControl = s.players[1].fullControl = true;
  startGame(s);
  for (let i = 0; i < 2; i++) dispatch(s, s.prompt!.player, { type: 'keep' });
  passUntil(s, () => s.step === 'main1');
  const ap = s.active as PlayerIdx;
  const t = add(s, ap, Tower, 'battlefield');
  const a = chars(s, t).pc.activated[0];
  assert.deepEqual(effProduces(s, ap, t, a), [['U', 'G']]);
});

test('no commander: no mana', () => {
  const { s, ap } = setup();
  const t = add(s, ap, Tower, 'battlefield');
  assert.deepEqual(effProduces(s, ap, t, chars(s, t).pc.activated[0]), []);
});

test('eminence works from the command zone', () => {
  const Ed = def('Test Edgar Markov', '{3}{R}{W}{B}', 'Legendary Creature — Vampire Knight', 'Eminence — Whenever you cast another Vampire spell, if Test Edgar Markov is in the command zone or on the battlefield, create a 1/1 black Vampire creature token.', ['4', '4'], { colorIdentity: ['R', 'W', 'B'] });
  const deck = Array.from({ length: 99 }, () => Forest);
  const s = createGame('c', [{ name: 'A', cards: deck, commanders: [Ed] }, { name: 'B', cards: deck, commanders: [Ed] }], 7, { format: 'commander' });
  s.players[0].fullControl = s.players[1].fullControl = true;
  startGame(s);
  for (let i = 0; i < 2; i++) dispatch(s, s.prompt!.player, { type: 'keep' });
  passUntil(s, () => s.step === 'main1');
  const ap = s.active as PlayerIdx;
  for (let k = 0; k < 2; k++) add(s, ap, def('Test Prism', '', 'Land', '{T}: Add one mana of any color.'), 'battlefield');
  const v = add(s, ap, def('Test Vamp', '{1}{B}', 'Creature — Vampire', '', ['2', '2']));
  assert.equal(dispatch(s, ap, { type: 'cast', iid: v }), null);
  resolveAll(s);
  assert.equal(s.battlefield.filter((b) => s.cards[b].controller === ap && s.defs[s.cards[b].defId].name === 'Vampire').length, 1);
});
