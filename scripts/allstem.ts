// All gap lines (any card) grouped by first K words: npx tsx scripts/allstem.ts K [key]
import { readFileSync } from 'node:fs';
import { parseCard } from '../src/engine/oracle';
const db = JSON.parse(readFileSync(new URL('../data/cards.json', import.meta.url), 'utf8'));
const K = +(process.argv[2] ?? 2);
const skip = /draft|specialize|seek|conjure|perpetual|attraction|contraption|sticker|spellbook|\{tk\}/;
const gaps = (p: any): string[] => [...p.unparsed, ...(p.spell?.manual ?? []), ...p.triggers.flatMap((t: any) => t.ability.manual), ...p.activated.flatMap((a: any) => a.ability.manual)];
const m = new Map<string, string[]>();
for (const d of db.cards) {
  let ps: any[];
  try { ps = d.faces?.length > 1 && d.layout !== 'meld' ? d.faces.map((f: any) => parseCard(d, f)) : [parseCard(d)]; } catch { continue; }
  const gs = [...new Set(ps.flatMap(gaps))];
  if (gs.some((g) => skip.test(g))) continue;
  for (const g of gs) {
    const t = g.replace(/^(?:when|whenever|at|if)[^,]*, /, '').replace(/\d+/g, 'N');
    const k = t.split(' ').slice(0, K).join(' ');
    (m.get(k) ?? m.set(k, []).get(k)!).push(`${d.name} :: ${g}`);
  }
}
const arr = [...m.entries()].sort((a, b) => b[1].length - a[1].length);
if (process.argv[3]) { for (const x of m.get(process.argv[3]) ?? []) console.log(x.slice(0, 220)); }
else for (const [k, v] of arr.slice(0, 80)) console.log(String(v.length).padStart(4), k);
