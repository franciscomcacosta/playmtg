// Random-play fuzzer over the real card database: catches engine crashes/loops.
import { readFileSync } from 'node:fs';
import { createGame, startGame, dispatch, viewFor } from '../src/engine/engine';
import type { GameState, PlayerIdx } from '../src/engine/types';
const db = JSON.parse(readFileSync('data/cards.json', 'utf8'));
const cards = db.cards.filter((c: any) => !/\bLand\b/.test(c.typeLine) && c.legal?.includes('vintage') && c.layout !== 'meld');
const basics = db.cards.filter((c: any) => ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'].includes(c.name));
let seed = +(process.argv[2] ?? 1);
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
function deck() { const out = []; for (let i = 0; i < 24; i++) out.push(pick(basics)); for (let i = 0; i < 36; i++) out.push(pick(cards)); return out; }
function answerPrompt(s: GameState) {
  const pr = s.prompt!; const p = pr.player;
  let choice: any;
  switch (pr.kind) {
    case 'mulligan': choice = 'keep'; break;
    case 'yesno': case 'color': choice = pick(pr.options!).id; break;
    case 'mode': choice = Array.from({ length: pr.min ?? 1 }, (_, i) => String(i)); break;
    case 'x': choice = Math.floor(rnd() * ((pr.max ?? 0) + 1)); break;
    case 'targets': choice = pr.targets!.slice(0, Math.max(pr.min ?? 0, 1)).slice(0, pr.max ?? 1); break;
    case 'chooseCards': choice = pr.cards!.slice(0, pr.min ?? 0); break;
    case 'declareAttackers': choice = pr.cards!.filter(() => rnd() < 0.6).map((iid) => ({ iid, target: pr.targets![0] })); break;
    case 'declareBlockers': { const att = s.combat!.attackers.map((a) => a.iid); choice = pr.cards!.filter(() => rnd() < 0.4).map((b) => ({ blocker: b, attacker: pick(att) })); break; }
    default: choice = null;
  }
  const err = dispatch(s, p, { type: 'answer', promptId: pr.id, choice });
  // an answer can be applied and still return a message (e.g. "No legal targets for X" after choosing to cast it)
  if (err && s.prompt?.id === pr.id) { if (pr.canCancel) dispatch(s, p, { type: 'cancel', promptId: pr.id }); else if (pr.kind === 'declareBlockers' || pr.kind === 'declareAttackers') dispatch(s, p, { type: 'answer', promptId: pr.id, choice: [] }); else if (pr.kind === 'targets' || pr.kind === 'chooseCards') { const r = dispatch(s, p, { type: 'answer', promptId: pr.id, choice: (pr.kind === 'targets' ? pr.targets! : pr.cards!).slice(0, pr.max ?? 1) }); if (r) throw new Error('stuck prompt: ' + pr.title + ' ' + r); } else throw new Error('stuck prompt: ' + pr.title + ' ' + err); }
}
function act(s: GameState) {
  if (s.prompt) return answerPrompt(s);
  const p = s.priority as PlayerIdx; const pl = s.players[p];
  const tries: any[] = [];
  for (const h of pl.hand) { tries.push({ type: 'playLand', iid: h }); tries.push({ type: 'cast', iid: h, face: rnd() < 0.3 ? 1 : 0 }); }
  for (const b of s.battlefield) if (s.cards[b].controller === p) for (let i = 0; i < 3; i++) tries.push({ type: 'activate', iid: b, ability: i });
  for (const t of tries.sort(() => rnd() - 0.5).slice(0, 6)) { if (!dispatch(s, p, t)) return; }
  dispatch(s, p, { type: 'pass' });
}
let games = +(process.argv[3] ?? 60), crashes = 0, turns = 0;
for (let g = 0; g < games; g++) {
  const s = createGame('f' + g, [{ name: 'A', cards: deck() }, { name: 'B', cards: deck() }], g + seed);
  try {
    startGame(s);
    let steps = 0;
    while (!s.over && s.turn < 30 && steps++ < 4000) { act(s); if (steps % 50 === 0) viewFor(s, 0); }
    turns += s.turn;
    if (steps >= 4000) console.log('game', g, 'did not finish in steps; turn', s.turn, s.step, s.prompt?.title);
  } catch (e: any) { crashes++; console.log('CRASH game', g, e.stack?.split('\n').slice(0, 12).join(' | ')); console.log(s.log.slice(-4).map(l=>l.text).join(' / ')); }
}
console.log({ games, crashes, avgTurns: turns / games });
