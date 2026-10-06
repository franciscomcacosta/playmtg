// Plugin: Auras and Equipment that grant an ability: 'Enchanted creature has "{T}: This creature deals 1 damage to any target."'
// The text is stored on the Aura; rules.ts adds it to whatever the Aura/Equipment is attached to.
import { EXT } from '../ext';
import { automationLevel, looseFilter, parseCard, parseCountPhrase } from '../oracle';

EXT.lines.push((line, pc) => {
  const m = line.match(/^(?:enchanted|equipped) (?:creature|land|permanent|artifact) (?:gets ([+-]\d+)\/([+-]\d+) and )?has "(.+?)"?\.?$/);
  if (!m) return false;
  const text = m[3].replace(/(^|\s)'|'(?=\s|$|[.,:])/g, (q: string) => q.replace("'", '"'));
  const probe: any = parseCard({ id: `grant-probe:${text}`, name: 'Granted', manaCost: '', cmc: 0, typeLine: 'Creature', oracle: text, colors: [], colorIdentity: [], keywords: [], layout: 'normal' } as any);
  if (automationLevel(probe) !== 'full') return false;
  (pc.attachGrants ??= []).push(text);
  if (m[1]) pc.statics.push({ kind: 'attachPump', p: +m[1], t: +m[2], kw: [] } as any);
  return true;
});

// "Equipped creature gets +1/+0 for each artifact you control." (Cranial Plating) / "Enchanted creature gets +1/+1 for each …"
EXT.lines.push((line, pc) => {
  const m = line.match(/^(?:equipped|enchanted) creature gets ([+-]\d+)\/([+-]\d+) for each (.+)$/);
  if (!m) return false;
  const a: any = parseCountPhrase(m[3]);
  if (!a || typeof a !== 'object') return false;
  const per = (k: number) => (k === 0 ? 0 : { ...a, mult: k * (a.mult ?? 1) });
  pc.statics.push({ kind: 'attachPump', p: per(+m[1]), t: per(+m[2]), kw: [] } as any);
  return true;
});

// "Creatures you control have "…"" / "All Sliver creatures have "…"" / "Lands you control have "{T}: Add one mana of any color.""
const SIMPLE = new Set(['types', 'subtypes', 'controller', 'other', 'allTypes', 'notTypes', 'supertypes', 'colors', 'token', 'zone', 'subAny']);
EXT.lines.push((line, pc) => {
  const m = line.match(/^(?:all )?(other )?(.+?) (you control )?(?:have|has) "(.+?)"?\.?$/);
  if (!m || /^(?:enchanted|equipped) /.test(m[2]) || /\b(?:as long as|if|each of those|paired)\b/.test(m[2])) return false;
  const ph = m[2].replace(/^each /, '').replace(/ and /g, ' or ');
  const single = ph.split(' or ').map((w) => w.replace(/ies$/, 'y').replace(/s$/, '')).join(' or ');
  const f0: any = looseFilter(single) ?? looseFilter(ph);
  if (!f0 || Object.keys(f0).some((k) => !SIMPLE.has(k))) return false;
  const filter = { ...f0, ...(m[3] ? { controller: 'you' } : {}), ...(m[1] ? { other: true } : {}) };
  delete filter.zone;
  const text = m[4].replace(/(^|\s)'|'(?=\s|$|[.,:])/g, (q: string) => q.replace("'", '"'));
  const probe: any = parseCard({ id: `grant-probe:${text}`, name: 'Granted', manaCost: '', cmc: 0, typeLine: 'Creature', oracle: text, colors: [], colorIdentity: [], keywords: [], layout: 'normal' } as any);
  if (automationLevel(probe) !== 'full') return false;
  (pc.groupGrants ??= []).push({ filter, text });
  return true;
});

// "Equipped creature gets +2/+2 and has protection from red and from blue." (the Swords)
EXT.lines.push((line, pc) => {
  const m = line.match(/^(?:equipped|enchanted) creature gets ([+-]\d+)\/([+-]\d+) and has protection from (\w+) and from (\w+)$/);
  if (!m) return false;
  pc.statics.push({ kind: 'attachPump', p: +m[1], t: +m[2], kw: [`protection from ${m[3]}`, `protection from ${m[4]}`] } as any);
  return true;
});
