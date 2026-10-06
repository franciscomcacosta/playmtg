// AI vs AI games with the starter decks: checks the bot always makes progress and games finish.
import { readFileSync } from 'node:fs';
import { createGame, startGame, dispatch } from '../src/engine/engine';
import { aiDecide, aiActionFailed, aiNeedsToAct } from '../src/engine/ai';
import { STARTERS } from '../src/client/decks';
import type { PlayerIdx } from '../src/engine/types';
const db = JSON.parse(readFileSync('data/cards.json', 'utf8'));
const byName = new Map<string, any>(db.cards.map((c: any) => [c.name.toLowerCase(), c]));
const deck = (text: string) => text.split('\n').flatMap((l) => { const m = l.match(/^(\d+) (.+)$/); return m ? Array(+m[1]).fill(byName.get(m[2].toLowerCase())).filter(Boolean) : []; });
const games = +(process.argv[2] ?? 12);
const wins = [0, 0]; let stuck = 0, turns = 0;
for (let g = 0; g < games; g++) {
  const a = STARTERS[g % 3], b = STARTERS[(g + 1) % 3];
  const s = createGame('ai' + g, [{ name: a.name, cards: deck(a.text) }, { name: b.name, cards: deck(b.text) }], g + 1);
  startGame(s);
  let steps = 0;
  while (!s.over && steps++ < 5000 && s.turn < 60) {
    const p = ([0, 1] as PlayerIdx[]).find((i) => aiNeedsToAct(s, i));
    if (p == null) { console.log('nobody to act', s.step, s.prompt?.title); break; }
    const act = aiDecide(s, p)!;
    const err = dispatch(s, p, act);
    if (err) {
      aiActionFailed(s, act);
      if (act.type === 'answer') { console.log('answer rejected:', s.prompt?.title, err); stuck++; break; }
    }
  }
  if (!s.over) { stuck++; console.log('game', g, 'unfinished at turn', s.turn, s.step); }
  else wins[s.winner ?? 0]++;
  turns += s.turn;
  console.log(`game ${g}: ${a.name} vs ${b.name} -> ${s.over ? s.players[s.winner!].name : 'none'} in ${s.turn} turns (life ${s.players[0].life}/${s.players[1].life})`);
}
console.log({ games, stuck, avgTurns: turns / games });
