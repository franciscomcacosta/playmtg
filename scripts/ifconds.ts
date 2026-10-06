// Unparsed trigger lines whose head is known: show why (intervening-if) — npx tsx scripts/ifconds.ts
import { readFileSync } from 'node:fs';
import { parseCard, matchTriggerCond, parseCond } from '../src/engine/oracle';
import '../src/engine/ext/index';
const db = JSON.parse(readFileSync(new URL('../data/cards.json', import.meta.url), 'utf8'));
const skip = /draft|specialize|seek|conjure|perpetual|attraction|contraption|sticker|spellbook|\{tk\}|crank/;
const m = new Map<string, string[]>();
const other: string[] = [];
for (const d of db.cards) {
  let ps: any[];
  try { ps = d.faces?.length > 1 && d.layout !== 'meld' ? d.faces.map((x: any) => parseCard(d, x)) : [parseCard(d)]; } catch { continue; }
  for (const p of ps) for (const u of p.unparsed as string[]) {
    if (!/^(when|whenever|at) /.test(u) || skip.test(u)) continue;
    const i = u.indexOf(', ');
    const head = u.slice(0, i);
    if (!matchTriggerCond(head)) continue;
    const rest = u.slice(i + 2);
    const im = rest.match(/^if (.+?), /);
    if (im && !parseCond(im[1])) { const k = im[1].replace(/\d+/g, 'N'); (m.get(k) ?? m.set(k, []).get(k)!).push(`${d.name} :: ${u}`); }
    else other.push(`${d.name} :: ${u}`);
  }
}
const arr = [...m.entries()].sort((a, b) => b[1].length - a[1].length);
if (process.argv[2] === 'other') for (const x of other) console.log(x.slice(0, 220));
else for (const [k, v] of arr.slice(0, 100)) console.log(String(v.length).padStart(4), k);
console.error('other:', other.length);
