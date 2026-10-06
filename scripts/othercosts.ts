import { readFileSync } from 'node:fs';
import { parseCard } from '../src/engine/oracle';
const db = JSON.parse(readFileSync(new URL('../data/cards.json', import.meta.url), 'utf8'));
const m = new Map<string, number>();
for (const d of db.cards) { try { const p: any = parseCard(d); for (const a of p.activated) if (a.cost?.other) { const k = String(a.cost.other).replace(/\{[^}]+\}/g, '{C}').replace(/\b\d+\b/g, 'N'); m.set(k, (m.get(k) ?? 0) + 1); } } catch {} }
console.log([...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 50).map(([k, v]) => `${String(v).padStart(4)} ${k}`).join('\n'));
