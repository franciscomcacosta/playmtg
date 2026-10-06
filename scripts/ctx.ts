// Show oracle context around an unparsed gap: npx tsx scripts/ctx.ts "regex" [n]
import { readFileSync } from 'node:fs';
import { parseCard } from '../src/engine/oracle';
const db = JSON.parse(readFileSync(new URL('../data/cards.json', import.meta.url), 'utf8'));
const re = new RegExp(process.argv[2]);
const N = +(process.argv[3] ?? 30);
let n = 0;
for (const d of db.cards) {
  let p: any;
  try { p = d.faces?.length > 1 ? null : parseCard(d); } catch { continue; }
  if (!p) continue;
  const gs: string[] = [...p.unparsed, ...(p.spell?.manual ?? []), ...p.triggers.flatMap((t: any) => t.ability.manual), ...p.activated.flatMap((a: any) => a.ability?.manual ?? [])];
  if (gs.some((g) => re.test(g))) { if (n++ < N) console.log(`${d.name} :: ${d.oracle.replace(/\n/g, ' | ').slice(0, 300)}`); }
}
console.log(n, 'cards');
