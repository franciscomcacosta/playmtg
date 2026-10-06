// Trigger heads the parser doesn't know (from every card's unparsed lines): npx tsx scripts/heads.ts [regex]
import { readFileSync } from 'node:fs';
import { parseCard, matchTriggerCond } from '../src/engine/oracle';
import '../src/engine/ext/index';
const db = JSON.parse(readFileSync(new URL('../data/cards.json', import.meta.url), 'utf8'));
const skip = /draft|specialize|seek|conjure|perpetual|attraction|contraption|sticker|spellbook|\{tk\}|crank|open an/;
const m = new Map<string, string[]>();
const f = process.argv[2] ? new RegExp(process.argv[2]) : null;
for (const d of db.cards) {
  let ps: any[];
  try { ps = d.faces?.length > 1 && d.layout !== 'meld' ? d.faces.map((x: any) => parseCard(d, x)) : [parseCard(d)]; } catch { continue; }
  for (const p of ps) for (const u of p.unparsed as string[]) {
    if (!/^(when|whenever|at) /.test(u) || skip.test(u)) continue;
    const head = u.split(',')[0];
    if (matchTriggerCond(head)) continue;
    const k = head.replace(/\d+/g, 'N');
    if (f && !f.test(k)) continue;
    (m.get(k) ?? m.set(k, []).get(k)!).push(`${d.name} :: ${u}`);
  }
}
const arr = [...m.entries()].sort((a, b) => b[1].length - a[1].length);
if (f) for (const [, v] of arr) for (const x of v) console.log(x.slice(0, 230));
else for (const [k, v] of arr.slice(0, 120)) console.log(String(v.length).padStart(4), k);
