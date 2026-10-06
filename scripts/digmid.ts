// What sentence sits between "look at/reveal the top N" and "put the rest …" when the dig fails to parse?
import { readFileSync } from 'node:fs';
import { parseCard, normalizeText } from '../src/engine/oracle';
const db = JSON.parse(readFileSync(new URL('../data/cards.json', import.meta.url), 'utf8'));
const mids = new Map<string, number>();
for (const d of db.cards) {
  if (d.faces?.length > 1) continue;
  const p: any = parseCard(d);
  const gaps = [...p.unparsed, ...(p.spell?.manual ?? []), ...p.triggers.flatMap((t: any) => t.ability.manual), ...p.activated.flatMap((a: any) => a.ability?.manual ?? [])];
  const i = gaps.findIndex((g: string) => /^(look at|reveal) the top \w+ cards of your library$/.test(g));
  if (i < 0) continue;
  const mid = (gaps[i + 1] ?? '(end)').replace(/\b\d+\b/g, 'N').replace(/\b(one|two|three|four|five|six|seven|x)\b/g, 'N').slice(0, 110);
  mids.set(mid, (mids.get(mid) ?? 0) + 1);
}
console.log([...mids.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([m, n]) => `${String(n).padStart(3)}  ${m}`).join('\n'));
