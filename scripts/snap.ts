// Regression check: npx tsx scripts/snap.ts  — writes .snap-full.txt (names of fully automated cards) and lists
// cards that were full in the previous snapshot but aren't any more.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parseCard, automationLevel } from '../src/engine/oracle';
const db = JSON.parse(readFileSync(new URL('../data/cards.json', import.meta.url), 'utf8'));
const full: string[] = [];
for (const d of db.cards) {
  try {
    const ps = d.faces?.length > 1 && d.layout !== 'meld' ? d.faces.map((f: any) => parseCard(d, f)) : [parseCard(d)];
    if (ps.every((p: any) => automationLevel(p) === 'full')) full.push(d.name);
  } catch { /* counted elsewhere */ }
}
const f = new URL('../.snap-full.txt', import.meta.url);
if (existsSync(f)) {
  const prev = new Set(readFileSync(f, 'utf8').split('\n').filter(Boolean));
  const now = new Set(full);
  const lost = [...prev].filter((n) => !now.has(n));
  const won = full.filter((n) => !prev.has(n));
  console.log(`full ${full.length} (+${won.length} / -${lost.length})`);
  if (lost.length) console.log('LOST:', lost.slice(0, 40).join(' | '));
}
writeFileSync(f, full.join('\n'));
