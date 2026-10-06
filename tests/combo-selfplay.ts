// AI vs AI with combo decks: checks the AI assembles and uses combos, and the engine survives them.
//   npx tsx tests/combo-selfplay.ts [games=24]
import { readFileSync } from 'node:fs';
import { createGame, startGame, dispatch } from '../src/engine/engine';
import { aiDecide, aiActionFailed, aiNeedsToAct } from '../src/engine/ai';
import { EXT } from '../src/engine/ext';
import type { PlayerIdx } from '../src/engine/types';

const db = JSON.parse(readFileSync('data/cards.json', 'utf8'));
const byName = new Map<string, any>(db.cards.map((c: any) => [c.name, c]));
const card = (n: string) => { const c = byName.get(n); if (!c) throw new Error('missing ' + n); return c; };

const DECKS: { name: string; land: string; pieces: Record<string, number> }[] = [
  { name: 'Aristocrats', land: 'Swamp', pieces: { 'Blood Artist': 4, 'Zulaport Cutthroat': 4, 'Viscera Seer': 4, "Ashnod's Altar": 2, 'Kitchen Finks': 0, 'Teysa Karlov': 2, 'Carrion Feeder': 4, 'Gravedigger': 4, 'Typhoid Rats': 4 } },
  { name: 'Lifelink loop', land: 'Swamp', pieces: { 'Sanguine Bond': 4, 'Exquisite Blood': 4, 'Vito, Thorn of the Dusk Rose': 4, 'Marauding Blight-Priest': 4, 'Bloodthirsty Conqueror': 2, 'Typhoid Rats': 4, 'Vampire Nighthawk': 4, 'Gravedigger': 2 } },
  { name: 'ETB value', land: 'Plains', pieces: { 'Panharmonicon': 4, 'Soul Warden': 4, 'Kitchen Finks': 0, 'Elvish Visionary': 0, 'Attended Knight': 4, 'Cloudgoat Ranger': 2, 'Thraben Inspector': 4, 'Elite Vanguard': 4, 'Serra Angel': 4 } },
  { name: 'Doubling', land: 'Forest', pieces: { 'Doubling Season': 4, 'Parallel Lives': 2, 'Hardened Scales': 4, 'Walking Ballista': 4, 'Llanowar Elves': 4, 'Grizzly Bears': 4, 'Avenger of Zendikar': 2, 'Craterhoof Behemoth': 1, 'Giant Growth': 4 } },
];
function build(d: (typeof DECKS)[number]) {
  const out: any[] = [];
  for (const [n, k] of Object.entries(d.pieces)) for (let i = 0; i < k; i++) out.push(card(n));
  while (out.length < 60) out.push(card(d.land));
  return out;
}

// Watch which combos actually fire.
const stats = { drains: 0, sacs: 0, loopKills: 0 };
EXT.hooks.event.push((_s, name, d) => {
  if (name === 'lifeLost') stats.drains++;
  if (name === 'leave' && d.opts?.cause === 'sacrifice') stats.sacs++;
});

const games = +(process.argv[2] ?? 24);
let stuck = 0, crashes = 0, turns = 0, extra = 0, draws = 0;
const wins: Record<string, number> = {};
for (let g = 0; g < games; g++) {
  const a = DECKS[g % DECKS.length], b = DECKS[(g + 1 + Math.floor(g / DECKS.length)) % DECKS.length];
  const s = createGame('cs' + g, [{ name: a.name, cards: build(a) }, { name: b.name, cards: build(b) }], 1000 + g);
  try {
    startGame(s);
    let steps = 0, lastLife = [20, 20];
    while (!s.over && steps++ < 8000 && s.turn < 40) {
      const p = ([0, 1] as PlayerIdx[]).find((i) => aiNeedsToAct(s, i));
      if (p == null) { console.log('  nobody to act', s.step, s.prompt?.title); break; }
      const act = aiDecide(s, p)!;
      const err = dispatch(s, p, act);
      if (err) { aiActionFailed(s, act); if (act.type === 'answer') { console.log('  answer rejected:', s.prompt?.title, err); break; } }
      lastLife = s.players.map((x) => x.life);
    }
    if (!s.over) { stuck++; console.log(`  game ${g} unfinished at turn ${s.turn} ${s.step} ${s.prompt?.title ?? ''}`); }
    else if (s.winner == null) draws++;
    else wins[s.players[s.winner].name] = (wins[s.players[s.winner].name] ?? 0) + 1;
    turns += s.turn;
    extra += (s as any).stats?.extraTriggers ?? 0;
    console.log(`game ${g}: ${a.name} vs ${b.name} -> ${s.over ? (s.winner == null ? 'draw' : s.players[s.winner].name) : 'none'} in ${s.turn} turns (life ${lastLife.join('/')})`);
  } catch (e: any) { crashes++; console.log(`CRASH game ${g}`, e.stack?.split('\n').slice(0, 4).join(' | ')); }
}
console.log({ games, crashes, stuck, draws, avgTurns: +(turns / games).toFixed(1), wins, extraTriggersFromDoublers: extra, sacrifices: stats.sacs, lifeLossEvents: stats.drains });
