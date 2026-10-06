// Oracle coverage report.
//   npx tsx scripts/coverage.ts               totals + the most common unreadable lines
//   npx tsx scripts/coverage.ts --sole        lines that are the ONLY gap on a card (fixing them completes the card)
//   npx tsx scripts/coverage.ts --grep "regex" sample cards whose unreadable lines match
import { readFileSync } from 'node:fs';
import { parseCard, automationLevel } from '../src/engine/oracle';
const db = JSON.parse(readFileSync(new URL('../data/cards.json', import.meta.url), 'utf8'));
const args = process.argv.slice(2);
const N = +(args[args.indexOf('-n') + 1] || 60) || 60;
const norm = (u: string) => u.toLowerCase().replace(/\{[^}]+\}/g, '{C}').replace(/\b\d+\b/g, 'N').replace(/\b(one|two|three|four|five|six|seven|x)\b/g, 'N').slice(0, 90);
const gaps = (p: any): string[] => [...p.unparsed, ...(p.spell?.manual ?? []), ...p.triggers.flatMap((t: any) => t.ability.manual), ...p.activated.flatMap((a: any) => a.ability?.manual ?? [])];
const lvl: Record<string, number> = { full: 0, partial: 0, manual: 0 };
const all = new Map<string, number>();
const sole = new Map<string, number>();
const stems = new Map<string, number>();
const g = args.includes('--grep') ? new RegExp(args[args.indexOf('--grep') + 1]) : null;
const hits: string[] = [];
let errors = 0;
for (const d of db.cards) {
  let p: any;
  try {
    // multi-face cards are parsed one face at a time, as the engine does
    if (d.faces?.length > 1 && d.layout !== 'meld') {
      const ps = d.faces.map((f: any) => parseCard(d, f));
      p = { ...ps[0], unparsed: ps.flatMap((x: any) => x.unparsed), triggers: ps.flatMap((x: any) => x.triggers), activated: ps.flatMap((x: any) => x.activated), spell: { manual: ps.flatMap((x: any) => x.spell?.manual ?? []), effects: ps.flatMap((x: any) => x.spell?.effects ?? []) }, statics: ps.flatMap((x: any) => x.statics), keywords: ps.flatMap((x: any) => x.keywords) };
    } else p = parseCard(d);
  } catch (e) { errors++; if (errors < 5) console.error(d.name, e); continue; }
  lvl[automationLevel(p)]++;
  const gs = gaps(p);
  const set = new Set(gs.map(norm));
  for (const k of set) all.set(k, (all.get(k) ?? 0) + 1);
  if (set.size === 1) { const k = [...set][0]; sole.set(k, (sole.get(k) ?? 0) + 1); }
  if (args.includes('--stem')) { const K = +args[args.indexOf('--stem') + 1] || 3; for (const k of new Set([...set].map((x) => x.replace(/^(?:when|whenever|at|if|as long as)[^,]*, /, '').split(' ').slice(0, K).join(' ')))) stems.set(k, (stems.get(k) ?? 0) + 1); }
  if (args.includes('--head')) { const K = +args[args.indexOf('--head') + 1] || 6; for (const k of new Set([...set].filter((x) => /^(?:when|whenever|at|if|as long as)[^,]*, /.test(x)).map((x) => x.split(',')[0].split(' ').slice(0, K).join(' ')))) stems.set(k, (stems.get(k) ?? 0) + 1); }
  if (g && hits.length < N) { const h = gs.find((x) => g.test(x)); if (h) hits.push(`${d.name} :: ${h}`); }
}
console.log({ ...lvl, total: db.cards.length, parseErrors: errors });
if (g) console.log(hits.join('\n'));
else {
  const m = args.includes('--sole') ? sole : (args.includes('--stem') || args.includes('--head')) ? stems : all;
  console.log([...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, N).map((x) => `${String(x[1]).padStart(5)}  ${x[0]}`).join('\n'));
}
