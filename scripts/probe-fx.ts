import { readFileSync } from 'node:fs';
import { parseCard } from '../src/engine/oracle';
const db = JSON.parse(readFileSync(new URL('../data/cards.json', import.meta.url), 'utf8'));
for (const n of process.argv.slice(2)) {
  const d = db.cards.find((c: any) => c.name === n); const p: any = parseCard(d);
  console.log(n, '| trig:', JSON.stringify(p.triggers.map((t: any) => [t.event, t.filter, t.ability.effects.map((e: any) => [e.k, e.name, e.who?.t, e.n])])).slice(0, 300), '| act:', JSON.stringify(p.activated.map((a: any) => [a.cost, a.ability?.effects?.map((e: any) => e.k)])).slice(0, 200));
}
