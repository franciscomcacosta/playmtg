// AI vs AI with random decks from the whole card pool — the closest thing to "a real game with random cards".
//   npx tsx tests/random-ai.ts [seed] [games]
import { readFileSync } from 'node:fs';
import { createGame, startGame, dispatch, viewFor } from '../src/engine/engine';
import { aiDecide, aiActionFailed, aiNeedsToAct } from '../src/engine/ai';
import type { PlayerIdx } from '../src/engine/types';
const db = JSON.parse(readFileSync('data/cards.json', 'utf8'));
const pool = db.cards.filter((c: any) => !/\bLand\b/.test(c.typeLine) && c.legal?.includes('vintage') && c.layout !== 'meld');
const basics: Record<string, any> = Object.fromEntries(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'].map((n) => [n, db.cards.find((c: any) => c.name === n)]));
const BASIC: Record<string, string> = { W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain', G: 'Forest' };
let seed = +(process.argv[2] ?? 1);
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
function deck() {
  // two random colors, 36 random spells in those colors (or colorless), lands to match
  const cols = ['W', 'U', 'B', 'R', 'G'].sort(() => rnd() - 0.5).slice(0, 2);
  const ok = pool.filter((c: any) => (c.colorIdentity ?? []).every((x: string) => cols.includes(x)));
  const out: any[] = [];
  for (let i = 0; i < 36; i++) out.push(pick(ok));
  for (let i = 0; i < 24; i++) out.push(basics[BASIC[cols[i % 2]]]);
  return out;
}
const games = +(process.argv[3] ?? 30);
process.on("exit", () => { const g: any = globalThis as any; if (g.__cp) console.error([...g.__cp.entries()].sort((a: any, b: any) => b[1] - a[1]).slice(0, 12).map((e: any) => e[1] + " " + e[0]).join("\n")); });
let crashes = 0, stuck = 0, finished = 0, turns = 0, timeouts = 0;
const problems: string[] = [];
for (let g = 0; g < games; g++) {
  const s = createGame('r' + g, [{ name: 'A', cards: deck() }, { name: 'B', cards: deck() }], seed + g);
  if (process.env.RAI_ONLY && +process.env.RAI_ONLY !== g) continue;
  try {
    startGame(s);
    let steps = 0, rejected = 0;
    const t0 = Date.now();
    if (process.env.RAI_TRACE) process.stderr.write(`game ${g} start\n`);
    while (!s.over && steps++ < 6000 && s.turn < 40) {
      if (Date.now() - t0 > 20000) { stuck++; problems.push(`game ${g}: too slow (20s) at turn ${s.turn} ${s.step} — last: ${s.log.slice(-3).map((l: any) => l.text).join(' / ')}`); if (process.env.RAI_TRACE) process.stderr.write(s.log.slice(-60).map((l: any) => l.text).join('\n') + `\nbattlefield ${s.battlefield.length} stack ${s.stack.length} pending ${s.pendingTriggers.length}\n`); break; }
      const p = ([0, 1] as PlayerIdx[]).find((i) => aiNeedsToAct(s, i));
      if (p == null) { stuck++; problems.push(`game ${g}: nobody can act (${s.step}, prompt: ${s.prompt?.title ?? 'none'})`); break; }
      const act = aiDecide(s, p)!;
      const err = dispatch(s, p, act);
      if (err) {
        aiActionFailed(s, act);
        if (act.type === 'answer' && s.prompt && (act as any).promptId === s.prompt.id && ++rejected > 20) { stuck++; problems.push(`game ${g}: AI answer keeps being rejected: ${s.prompt.title} — ${err}`); if (process.env.RAI_TRACE) process.stderr.write(JSON.stringify(act).slice(0, 400) + "\n" + JSON.stringify(s.combat?.attackers) + "\n" + s.battlefield.map((b) => `${s.cards[b].controller}:${s.defs[s.cards[b].defId].name}${s.cards[b].tapped ? "(T)" : ""}:${b}`).join(", ") + "\n"); break; }
      }
      if (steps % 40 === 0) viewFor(s, 0);
    }
    if (s.over) finished++;
    else if (s.turn >= 40) timeouts++;
    else if (!problems.some((x) => x.startsWith(`game ${g}:`))) { stuck++; problems.push(`game ${g}: step limit at turn ${s.turn} ${s.step} (${s.prompt?.title ?? 'no prompt'})`); }
    turns += s.turn;
  } catch (e: any) {
    crashes++;
    problems.push(`game ${g}: CRASH ${e.message} | ${e.stack?.split("\n").slice(1,12).map((x:string)=>x.trim().replace(/.*mf\//,"")).join(" < ")} | last: ${s.log.slice(-2).map((l: any) => l.text).join(' / ')}`);
  }
}
console.log({ games, finished, turnLimit: timeouts, stuck, crashes, avgTurns: +(turns / games).toFixed(1) });
for (const p of problems) console.log(' -', p.slice(0, 260));
