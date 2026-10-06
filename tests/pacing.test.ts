// Paced games: the engine stops after each visible event ("beat") instead of auto-passing through a whole
// chain, and resumeBeat() carries on. The game must reach the same kind of end, never get stuck.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame, startGame, dispatch, pendingBeat, resumeBeat } from '../src/engine/engine';
import { aiDecide, aiNeedsToAct, aiActionFailed } from '../src/engine/ai';
import { setup, add, lands, cast } from './helpers';
import type { PlayerIdx } from '../src/engine/types';

const db = JSON.parse(readFileSync(new URL('../data/cards.json', import.meta.url), 'utf8'));
const real = (n: string) => db.cards.find((c: any) => c.name === n);

test('a paced AI game pauses on beats and still plays to the end', () => {
  const deck = () => [...Array(20).fill(real('Mountain')), ...Array(10).fill(real('Shock')), ...Array(10).fill(real('Raging Goblin')), ...Array(10).fill(real('Grizzly Bears')), ...Array(10).fill(real('Forest'))];
  const s = createGame('pace', [{ name: 'A', cards: deck() }, { name: 'B', cards: deck() }], 7);
  startGame(s);
  (s as any).paced = true;
  (s as any).beatMark = (s as any).evSeq ?? 0;
  let beats = 0, steps = 0;
  while (!s.over && steps++ < 20000 && s.turn < 40) {
    if (pendingBeat(s)) { beats++; resumeBeat(s); continue; }
    const p = ([0, 1] as PlayerIdx[]).find((i) => aiNeedsToAct(s, i));
    assert.notEqual(p, undefined, `nobody can act at ${s.step}`);
    const a = aiDecide(s, p!);
    assert.ok(a);
    if (dispatch(s, p!, a as any)) aiActionFailed(s, a as any);
  }
  assert.ok(s.over || s.turn >= 40);
  assert.ok(beats > s.turn * 2, `beats ${beats} over ${s.turn} turns`);
});

test('an opponent spell pauses on the stack before it resolves', () => {
  const { s, ap, op } = setup();
  s.players[0].fullControl = s.players[1].fullControl = false;
  (s as any).paced = true;
  (s as any).beatMark = (s as any).evSeq ?? 0;
  lands(s, ap, 1);
  cast(s, ap, add(s, ap, real('Raging Goblin')));
  // cast → paused with the spell still on the stack
  assert.ok(pendingBeat(s));
  assert.equal(s.stack.length, 1);
  resumeBeat(s);
  for (let i = 0; i < 10 && pendingBeat(s); i++) resumeBeat(s);
  assert.equal(s.stack.length, 0);
  assert.equal(s.battlefield.filter((b) => s.defs[s.cards[b].defId].name === 'Raging Goblin').length, 1);
  void op;
});
