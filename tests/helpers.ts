// Shared helpers for engine tests (used by tests/ext-*.test.ts).
import assert from 'node:assert/strict';
import type { CardDef } from '../src/engine/cardTypes';
import { createGame, startGame, dispatch, castOptions } from '../src/engine/engine';
import type { GameState, PlayerIdx } from '../src/engine/types';
export { chars } from '../src/engine/rules';
export { dispatch, castOptions, settle, viewFor } from '../src/engine/engine';

let n = 0;
/** Invent a test card. Oracle text uses the card's own name (it's normalised to ~). */
export function def(name: string, manaCost: string, typeLine: string, oracle = '', pt?: [string, string], extra: Partial<CardDef> = {}): CardDef {
  return { id: `h${n++}`, name, manaCost, cmc: 0, typeLine, oracle, power: pt?.[0], toughness: pt?.[1], colors: [], colorIdentity: [], keywords: [], layout: 'normal', ...extra };
}
export const Forest = def('Forest', '', 'Basic Land — Forest');
export const Mountain = def('Mountain', '', 'Basic Land — Mountain');
export const Island = def('Island', '', 'Basic Land — Island');
/** Taps for any color. */
export const Prism = def('Test Prism Land', '', 'Land', '{T}: Add one mana of any color.');
export const Bear = def('Test Bear', '{1}{G}', 'Creature — Bear', '', ['2', '2']);

/** A started game in the active player's first main phase. Both players have full control (no auto-pass). */
export function setup(seed = 3): { s: GameState; ap: PlayerIdx; op: PlayerIdx } {
  const deck = Array.from({ length: 40 }, () => Forest);
  const s = createGame('t', [{ name: 'A', cards: deck }, { name: 'B', cards: deck }], seed);
  s.players[0].fullControl = s.players[1].fullControl = true;
  startGame(s);
  for (let i = 0; i < 2; i++) dispatch(s, s.prompt!.player, { type: 'keep' });
  passUntil(s, () => s.step === 'main1');
  return { s, ap: s.active, op: (1 - s.active) as PlayerIdx };
}
/** Put a card straight into a zone. Returns its iid. */
export function add(s: GameState, p: PlayerIdx, d: CardDef, zone: 'hand' | 'battlefield' | 'graveyard' | 'library' | 'exile' = 'hand'): string {
  s.defs[d.id] = d;
  const iid = `x${s.nextId++}`;
  s.cards[iid] = { iid, defId: d.id, owner: p, controller: p, zone, tapped: false, sick: false, counters: {}, damage: 0, deathtouched: false, face: 0, mods: [], ts: s.ts++ };
  if (zone === 'battlefield') s.battlefield.push(iid);
  else if (zone === 'library') s.players[p].library.unshift(iid);
  else (s.players[p] as any)[zone].push(iid);
  return iid;
}
export function lands(s: GameState, p: PlayerIdx, k: number, d = Prism) {
  const out: string[] = [];
  for (let i = 0; i < k; i++) out.push(add(s, p, d, 'battlefield'));
  return out;
}
/** Pass priority until pred() holds. Throws on unexpected prompts (except cleanup discards). */
export function passUntil(s: GameState, pred: () => boolean, max = 300) {
  for (let i = 0; i < max && !pred(); i++) {
    if (s.prompt?.data?.ctx === 'cleanup') {
      dispatch(s, s.prompt.player, { type: 'answer', promptId: s.prompt.id, choice: s.prompt.cards!.slice(0, s.prompt.min) });
      continue;
    }
    if (s.prompt) throw new Error(`Unexpected prompt: ${s.prompt.title}`);
    const e = dispatch(s, s.priority, { type: 'pass' });
    if (e) throw new Error(e);
  }
  assert.ok(pred(), 'condition never reached');
}
/** Pass until the stack is empty, answering prompts with `answer` or a sensible default. */
export function resolveAll(s: GameState, answer: (s: GameState) => any = () => undefined) {
  for (let i = 0; i < 200; i++) {
    if (s.prompt) {
      const pr = s.prompt;
      const a = answer(s);
      const choice = a !== undefined ? a : pr.kind === 'yesno' ? 'yes' : pr.kind === 'mode' ? [pr.options![0].id] : pr.kind === 'targets' ? pr.targets!.slice(0, Math.max(1, pr.min ?? 1)) : pr.kind === 'chooseCards' ? pr.cards!.slice(0, Math.max(pr.min ?? 0, 1)) : pr.kind === 'color' ? pr.options![0].id : pr.kind === 'x' ? 1 : null;
      const err = dispatch(s, pr.player, { type: 'answer', promptId: pr.id, choice });
      if (err) throw new Error(`${pr.title}: ${err}`);
      continue;
    }
    if (!s.stack.length && !s.pendingTriggers.length) return;
    dispatch(s, s.priority, { type: 'pass' });
  }
}
export function cast(s: GameState, p: PlayerIdx, iid: string, extra: any = {}) {
  const err = dispatch(s, p, { type: 'cast', iid, ...extra });
  assert.equal(err, null, err ?? '');
}
