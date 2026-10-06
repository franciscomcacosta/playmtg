// List keyword strings produced by the parser, rarest first (spot nonsense keywords).
import { readFileSync } from 'node:fs';
import { parseCard } from '../src/engine/oracle';
const db = JSON.parse(readFileSync(new URL('../data/cards.json', import.meta.url), 'utf8'));
const seen = new Map<string, string[]>();
const walk = (o: any, name: string) => {
  if (!o || typeof o !== 'object') return;
  for (const key of ['kw', 'keywords']) if (Array.isArray(o[key])) for (const k of o[key]) if (typeof k === 'string') { const l = seen.get(k) ?? []; if (l.length < 2) l.push(name); seen.set(k, l); }
  for (const v of Object.values(o)) walk(v, name);
};
for (const d of db.cards) { try { const p: any = parseCard(d); walk({ s: p.spell, t: p.triggers, a: p.activated, st: p.statics, k: p.keywords }, d.name); } catch {} }
for (const [k, l] of [...seen.entries()].sort((a, b) => a[1].length - b[1].length || a[0].localeCompare(b[0]))) if (l.length < 2 || k.length > 18) console.log(k.padEnd(40).slice(0, 60), l.join(' | '));
