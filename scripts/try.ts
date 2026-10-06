// Parse ad-hoc oracle text: npx tsx scripts/try.ts "text" ["text" …]
import { parseCard, automationLevel } from '../src/engine/oracle';
let i = 0;
for (const t of process.argv.slice(2)) {
  const p: any = parseCard({ id: 't' + i++, name: 'Probe', manaCost: '{1}', cmc: 1, typeLine: process.env.TL ?? 'Sorcery', oracle: t, colors: [], colorIdentity: [], keywords: [], layout: 'normal' } as any);
  const gaps = [...p.unparsed, ...(p.spell?.manual ?? []), ...p.triggers.flatMap((t: any) => t.ability.manual), ...p.activated.flatMap((a: any) => a.ability?.manual ?? [])];
  console.log(automationLevel(p).padEnd(7), JSON.stringify(p.spell?.effects ?? []).slice(0, 220), gaps.length ? '\n   GAP: ' + gaps.join(' | ') : '');
}
