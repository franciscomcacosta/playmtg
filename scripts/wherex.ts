// Most common "where x is …" amount tails among unparsed lines (the amount is the usual blocker).
import { readFileSync } from 'node:fs';
import { parseCard, parseAmtPhrase } from '../src/engine/oracle';
const db = JSON.parse(readFileSync(new URL('../data/cards.json', import.meta.url), 'utf8'));
const tails = new Map<string, number>(); let n = 0;
for (const d of db.cards) {
  if (d.faces?.length > 1) continue;
  const p: any = parseCard(d);
  const gaps = [...p.unparsed, ...(p.spell?.manual ?? []), ...p.triggers.flatMap((t: any) => t.ability.manual), ...p.activated.flatMap((a: any) => a.ability?.manual ?? [])];
  for (const g of gaps) {
    const m = g.match(/,? where x is (.+)$/) ?? g.match(/ equal to (the number of .+|the total .+|the greatest .+|its .+|your .+)$/);
    if (!m) continue;
    const tail = m[1].replace(/\b\d+\b/g, 'N');
    const ok = parseAmtPhrase(m[1], { specs: [], selfName: '~', last: { t: 'self' } } as any);
    if (ok) continue; // amount itself parses; the rest of the sentence is the gap
    n++; tails.set(tail, (tails.get(tail) ?? 0) + 1);
  }
}
console.log('lines whose amount does not parse:', n);
console.log([...tails.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([t, k]) => `${String(k).padStart(4)}  ${t}`).join('\n'));
