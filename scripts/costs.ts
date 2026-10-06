// Unparsed "cost: effect" lines grouped by cost: npx tsx scripts/costs.ts
import { readFileSync } from 'node:fs';
import { parseCard } from '../src/engine/oracle';
import '../src/engine/ext/index';
const db = JSON.parse(readFileSync(new URL('../data/cards.json', import.meta.url), 'utf8'));
const m = new Map<string, string[]>();
for (const d of db.cards) {
  let ps: any[];
  try { ps = d.faces?.length > 1 && d.layout !== 'meld' ? d.faces.map((x: any) => parseCard(d, x)) : [parseCard(d)]; } catch { continue; }
  for (const p of ps) for (const u of p.unparsed as string[]) {
    const mm = u.match(/^([^":]+?): (.+)$/);
    if (!mm || /^(when|whenever|at|if|as long as)\b/.test(mm[1])) continue;
    const k = mm[1].replace(/\{[^}]+\}/g, '{C}').replace(/\d+/g, 'N');
    (m.get(k) ?? m.set(k, []).get(k)!).push(`${d.name} :: ${u}`);
  }
}
const arr = [...m.entries()].sort((a, b) => b[1].length - a[1].length);
if (process.argv[2]) for (const x of m.get(process.argv[2]) ?? []) console.log(x.slice(0, 220));
else for (const [k, v] of arr.slice(0, 60)) console.log(String(v.length).padStart(4), k);
