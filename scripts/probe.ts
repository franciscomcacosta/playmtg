// Print how the parser reads specific cards: npx tsx scripts/probe.ts "Name" "Name" ...
import { readFileSync } from 'node:fs';
import { parseCard, automationLevel } from '../src/engine/oracle';
const db = JSON.parse(readFileSync(new URL('../data/cards.json', import.meta.url), 'utf8'));
const byName = new Map<string, any>(db.cards.map((c: any) => [c.name.toLowerCase(), c]));
for (const n of process.argv.slice(2)) {
  const d = byName.get(n.toLowerCase());
  if (!d) { console.log(`?? ${n}`); continue; }
  const p: any = parseCard(d);
  const trig = p.triggers.map((t: any) => `${t.event}${t.ability.manual.length ? '(MANUAL)' : ''}`).join(',');
  const gaps = [...p.unparsed, ...(p.spell?.manual ?? []), ...p.triggers.flatMap((t: any) => t.ability.manual), ...p.activated.flatMap((a: any) => a.ability?.manual ?? [])];
  console.log(`${automationLevel(p).padEnd(7)} ${d.name} | trig=[${trig}] repl=[${p.replacements.map((r: any) => r.k).join(',')}]${gaps.length ? ' | GAP: ' + gaps.join(' / ').slice(0, 140) : ''}`);
}
