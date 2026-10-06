// Commander format: command zone, commander tax, returning to the command zone, commander damage, deck validation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, startGame, dispatch, castOptions } from '../src/engine/engine';
import { validateCommanderDeck } from '../src/engine/ext/commander';
import { def, add, lands, resolveAll, passUntil, Forest } from './helpers';
import type { PlayerIdx } from '../src/engine/types';

const Cmdr = def('Test Warlord', '{1}{G}', 'Legendary Creature — Elf Warrior', '', ['3', '3'], { colorIdentity: ['G'] });

function cmdGame() {
  const deck = Array.from({ length: 99 }, () => Forest);
  const s = createGame('c', [{ name: 'A', cards: deck, commanders: [Cmdr] }, { name: 'B', cards: deck, commanders: [Cmdr] }], 7, { format: 'commander' });
  s.players[0].fullControl = s.players[1].fullControl = true;
  startGame(s);
  for (let i = 0; i < 2; i++) dispatch(s, s.prompt!.player, { type: 'keep' });
  passUntil(s, () => s.step === 'main1');
  return { s, ap: s.active, op: (1 - s.active) as PlayerIdx };
}

test('commander: 40 life, cast from the command zone, tax, and return to the command zone', () => {
  const { s, ap, op } = cmdGame();
  assert.equal(s.players[ap].life, 40);
  const cmd = (s.players[ap] as any).command[0] as string;
  assert.equal(s.cards[cmd].zone, 'command');
  lands(s, ap, 6);
  const o = castOptions(s, ap, cmd).find((x: any) => x.ok);
  assert.ok(o, 'commander is castable from the command zone');
  assert.equal(dispatch(s, ap, o!.action), null);
  resolveAll(s);
  assert.equal(s.cards[cmd].zone, 'battlefield');
  // it dies → owner chooses the command zone
  s.cards[cmd].damage = 5;
  resolveAll(s, (st) => (st.prompt?.kind === 'yesno' ? 'yes' : undefined));
  dispatch(s, s.priority, { type: 'pass' });
  resolveAll(s, (st) => (st.prompt?.kind === 'yesno' ? 'yes' : undefined));
  assert.equal(s.cards[cmd].zone, 'command');
  // second cast costs {2} more: 2 + 2 = 4 mana; we have 6 lands, 2 already tapped
  const untapped = s.battlefield.filter((b) => s.cards[b].controller === ap && !s.cards[b].tapped).length;
  assert.equal(untapped, 4);
  const o2 = castOptions(s, ap, cmd).find((x: any) => x.ok);
  assert.ok(o2 && /\{2\}/.test(o2.label), `tax shown in "${o2?.label}"`);
  assert.equal(dispatch(s, ap, o2!.action), null);
  resolveAll(s);
  assert.equal(s.cards[cmd].zone, 'battlefield');
  assert.equal(s.battlefield.filter((b) => s.cards[b].controller === ap && !s.cards[b].tapped && s.cards[b].defId !== Cmdr.id).length, 0);
  void op;
});

test('commander: 21 combat damage from one commander loses the game', () => {
  const { s, ap, op } = cmdGame();
  const cmd = (s.players[ap] as any).command[0] as string;
  (s.players[op] as any).commanderDamage = { [cmd]: 21 };
  dispatch(s, s.priority, { type: 'pass' });
  assert.equal(s.players[op].lost, true);
  assert.equal(s.over, true);
  void add;
});

test('commander deck validation', () => {
  const G = def('Forest', '', 'Basic Land — Forest', '', undefined, { colorIdentity: ['G'] });
  const R = def('Test Bolt', '{R}', 'Instant', 'deals 3 damage', undefined, { colorIdentity: ['R'] });
  const ok = Array.from({ length: 99 }, () => G);
  assert.deepEqual(validateCommanderDeck(ok, [Cmdr]), []);
  const bad = [...Array.from({ length: 97 }, () => G), R, R];
  const errs = validateCommanderDeck(bad, [Cmdr]);
  assert.ok(errs.some((e) => /Singleton/.test(e)));
  assert.ok(errs.some((e) => /color identity/.test(e)));
});
