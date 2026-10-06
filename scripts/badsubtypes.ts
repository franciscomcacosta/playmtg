// Find parsed cards whose filters contain "subtypes" that no real card has (parser garbage).
import { readFileSync } from 'node:fs';
import { parseCard, automationLevel } from '../src/engine/oracle';
const db = JSON.parse(readFileSync(new URL('../data/cards.json', import.meta.url), 'utf8'));
const known = new Set<string>();
for (const c of db.cards) for (const tl of String(c.typeLine).split(' // ')) { const i = tl.indexOf('—'); if (i >= 0) for (const w of tl.slice(i + 1).trim().toLowerCase().split(/\s+/)) known.add(w); }
for (const w of ['plains', 'island', 'swamp', 'mountain', 'forest', 'aura', 'equipment', 'vehicle', 'saga', 'gate', 'desert', 'food', 'clue', 'treasure']) known.add(w);
const bad = new Map<string, number>(); let cards = 0, fullBad = 0; const sample: string[] = [];
const walk = (o: any, out: Set<string>) => { if (!o || typeof o !== 'object') return; if (Array.isArray(o.subtypes)) for (const x of o.subtypes) if (typeof x === 'string' && !known.has(x)) out.add(x); for (const v of Object.values(o)) walk(v, out); };
for (const d of db.cards) {
  if (d.faces?.length > 1) continue;
  let p: any; try { p = parseCard(d); } catch { continue; }
  const out = new Set<string>(); walk({ s: p.spell, t: p.triggers, a: p.activated, st: p.statics, r: p.replacements }, out);
  if (!out.size) continue;
  cards++; const full = automationLevel(p) === 'full'; if (full) { fullBad++; if (sample.length < 25) sample.push(`${d.name}: ${[...out].join(' ')}`); }
  for (const w of out) bad.set(w, (bad.get(w) ?? 0) + 1);
}
console.log({ knownSubtypes: known.size, cardsWithUnknownSubtypes: cards, ofWhichFull: fullBad });
console.log([...bad.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([w, n]) => `${n} ${w}`).join(', '));
console.log(sample.join('\n'));
