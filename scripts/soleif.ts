// Sole gaps of the form "if <cond>, <effect>" where the condition doesn't parse: npx tsx scripts/soleif.ts
import { readFileSync } from 'node:fs';
import { parseCard, parseCond } from '../src/engine/oracle';
import '../src/engine/ext/index';
const db = JSON.parse(readFileSync(new URL('../data/cards.json', import.meta.url), 'utf8'));
const skip = /draft|specialize|seek|conjure|perpetual|attraction|contraption|sticker|spellbook|\{tk\}|crank/;
const gaps = (p: any): string[] => [...p.unparsed, ...(p.spell?.manual ?? []), ...p.triggers.flatMap((t: any) => t.ability.manual), ...p.activated.flatMap((a: any) => a.ability.manual)];
const m = new Map<string, string[]>();
for (const d of db.cards) {
  let ps: any[];
  try { ps = d.faces?.length > 1 && d.layout !== 'meld' ? d.faces.map((x: any) => parseCard(d, x)) : [parseCard(d)]; } catch { continue; }
  const gs = [...new Set(ps.flatMap(gaps))];
  if (gs.length !== 1 || skip.test(gs[0])) continue;
  const t = gs[0].replace(/^(?:when|whenever|at)[^,]*, /, '');
  const im = t.match(/^if (.+?), (.+)$/);
  if (!im || parseCond(im[1])) continue;
  const k = im[1].replace(/\d+/g, 'N');
  (m.get(k) ?? m.set(k, []).get(k)!).push(`${d.name} :: ${gs[0]}`);
}
const arr = [...m.entries()].sort((a, b) => b[1].length - a[1].length);
if (process.argv[2]) for (const x of m.get(process.argv[2]) ?? []) console.log(x.slice(0, 240));
else for (const [k, v] of arr.slice(0, 120)) console.log(String(v.length).padStart(4), k);
