// Find parsed filters whose `types` contain words that aren't card types (silent mis-parses).
import { readFileSync } from 'node:fs';
import { parseCard } from '../src/engine/oracle';
const db = JSON.parse(readFileSync(new URL('../data/cards.json', import.meta.url), 'utf8'));
const OK = new Set(['creature', 'artifact', 'enchantment', 'land', 'planeswalker', 'instant', 'sorcery', 'battle', 'permanent', 'card', 'kindred', 'tribal', 'spell', 'token', 'legendary', 'basic', 'snow', 'nonland', 'historic']);
const bad = new Map<string, string[]>();
const walk = (o: any, name: string) => {
  if (!o || typeof o !== 'object') return;
  if (Array.isArray(o.types)) for (const t of o.types) if (typeof t === 'string' && !OK.has(t)) { const l = bad.get(t) ?? []; if (l.length < 2) l.push(name + " ~ " + JSON.stringify(o).slice(0, 160)); bad.set(t, l); }
  for (const v of Object.values(o)) walk(v, name);
};
for (const d of db.cards) { try { const p: any = parseCard(d); walk({ s: p.spell, t: p.triggers, a: p.activated, st: p.statics }, d.name); } catch {} }
for (const [t, l] of [...bad.entries()].sort()) console.log(t.padEnd(14), l.join(' | '));
