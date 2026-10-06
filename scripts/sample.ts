// Show whole oracle text of cards whose gaps match a regex: npx tsx scripts/sample.ts "regex" [n]
import { readFileSync } from 'node:fs';
import { parseCard } from '../src/engine/oracle';
const db = JSON.parse(readFileSync(new URL('../data/cards.json', import.meta.url), 'utf8'));
const re = new RegExp(process.argv[2]); const N = +(process.argv[3] ?? 12); let k = 0;
for (const d of db.cards) {
  if (d.faces?.length > 1) continue;
  const p: any = parseCard(d);
  const gaps = [...p.unparsed, ...(p.spell?.manual ?? []), ...p.triggers.flatMap((t: any) => t.ability.manual), ...p.activated.flatMap((a: any) => a.ability?.manual ?? [])];
  if (!gaps.some((g: string) => re.test(g))) continue;
  console.log(`## ${d.name}\n${d.oracle.replace(/\n/g, ' ¶ ')}\n  GAPS: ${gaps.join(' | ')}`);
  if (++k >= N) break;
}
