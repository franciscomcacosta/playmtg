// Sole-gap trigger heads (text before the first comma), normalised: npx tsx scripts/soletrig.ts [filter]
import { readFileSync } from 'node:fs';
import { parseCard } from '../src/engine/oracle';
const db = JSON.parse(readFileSync(new URL('../data/cards.json', import.meta.url), 'utf8'));
const skip = /draft|specialize|seek|conjure|perpetual|attraction|contraption|sticker|spellbook|\{tk\}/;
const gaps = (p: any): string[] => [...p.unparsed, ...(p.spell?.manual ?? []), ...p.triggers.flatMap((t: any) => t.ability.manual), ...p.activated.flatMap((a: any) => a.ability.manual)];
const m = new Map<string, string[]>();
const f = process.argv[2] ? new RegExp(process.argv[2]) : null;
for (const d of db.cards) {
  let ps: any[];
  try { ps = d.faces?.length > 1 && d.layout !== 'meld' ? d.faces.map((x: any) => parseCard(d, x)) : [parseCard(d)]; } catch { continue; }
  const gs = [...new Set(ps.flatMap(gaps))];
  if (gs.length !== 1 || skip.test(gs[0]) || !/^(when|whenever|at) /.test(gs[0])) continue;
  const head = gs[0].split(',')[0].replace(/\d+/g, 'N');
  if (f && !f.test(head)) continue;
  (m.get(head) ?? m.set(head, []).get(head)!).push(`${d.name} :: ${gs[0]}`);
}
const arr = [...m.entries()].sort((a, b) => b[1].length - a[1].length);
if (f) for (const [, v] of arr) for (const x of v) console.log(x.slice(0, 230));
else for (const [k, v] of arr.slice(0, 120)) console.log(String(v.length).padStart(4), k);
