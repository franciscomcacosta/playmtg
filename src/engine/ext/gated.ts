// Plugin: "As long as <condition>, ~ gets +1/+1, is black, has trample, and has "<ability>"." (threshold, hellbent,
// delirium-style conditional self statics). The quoted abilities are gated on the condition (they only exist while it
// holds); everything else becomes one conditional selfPump.
import { EXT } from '../ext';
import { parseCard, parseCond, parseKeywordList } from '../oracle';
import { SUBTYPES } from '../subtypes';

const COLW: Record<string, string> = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };
let busy = false;
EXT.lines.push((line, pc) => {
  if (busy) return false;
  const m = line.match(/^as long as (.+?), (?:~|it) (.+)$/) ?? line.replace(/^(as long as .+?), it's /, '$1, ~ is ').match(/^as long as (.+?), ~ (.+)$/);
  if (!m) return false;
  const cond = parseCond(m[1]);
  if (!cond || (cond as any).k === 'manual') return false;
  // protect quoted text, then split the clause list
  const quotes: string[] = [];
  const body = m[2].replace(/"([^"]+)"/g, (_q, t) => `§${quotes.push(t) - 1}§`);
  const parts = body.split(/, and |, | and /).map((x) => x.trim());
  if (!parts.length) return false;
  const st: any = { kind: 'selfPump', p: 0, t: 0, kw: [] as string[], cond };
  const grants: string[] = [];
  let verb = '';
  for (let p of parts) {
    const v = p.match(/^(gets|is|has|attacks|can't|can) /);
    if (v) verb = v[1]; else if (verb === 'has' || verb === 'is') p = `${verb} ${p}`; else return false;
    let k: RegExpMatchArray | null;
    if ((k = p.match(/^gets ([+-]\d+)\/([+-]\d+)$/))) { st.p += +k[1]; st.t += +k[2]; continue; }
    if ((k = p.match(/^is (white|blue|black|red|green)$/))) { (st.colors ??= []).push(COLW[k[1]]); continue; }
    if (p === 'is all creature types') { st.kw.push('changeling'); continue; }
    if ((k = p.match(/^is an? ([a-z ]+?)(?: in addition to its other types)?$/)) && k[1].split(' ').every((w) => SUBTYPES.has(w) || ['artifact', 'creature', 'land', 'enchantment'].includes(w))) {
      for (const w of k[1].split(' ')) (['artifact', 'creature', 'land', 'enchantment'].includes(w) ? (st.addTypes ??= []) : (st.addSubtypes ??= [])).push(w);
      continue;
    }
    if (p === 'attacks each combat if able') { st.mustAttack = true; continue; }
    if (p === "can't be blocked") { st.unblockable = true; continue; }
    if (p === "can't block") { st.cantBlock = true; continue; }
    if (p === "can attack as though it didn't have defender") { st.noDefender = true; continue; }
    if ((k = p.match(/^has §(\d+)§$/))) { grants.push(quotes[+k[1]]); continue; }
    if ((k = p.match(/^has (.+)$/))) { const kws = parseKeywordList(k[1]); if (!kws) return false; st.kw.push(...kws); continue; }
    return false;
  }
  // plain "gets +N/+N and has flying" stays with the core parser
  if (!grants.length && !st.colors && !st.noDefender && !st.mustAttack && !st.unblockable && !st.cantBlock && !st.addTypes && !st.addSubtypes && !st.kw.includes('changeling')) return false;
  // parse the granted abilities as a separate card; give up if any of them isn't automated
  const extra: any[] = [];
  for (const g of grants) {
    busy = true;
    let o: any;
    try { o = parseCard({ id: `gated:${g}`, name: 'gated', manaCost: '', cmc: 0, typeLine: 'Creature', oracle: g, colors: [], colorIdentity: [], keywords: [], layout: 'normal' } as any); } finally { busy = false; }
    if (o.unparsed?.length) return false;
    const bad = (a: any) => JSON.stringify(a).includes('"k":"manual"');
    if ([...o.triggers, ...o.activated, ...o.statics, ...(o.replacements ?? [])].some(bad)) return false;
    extra.push(o);
  }
  if (st.p || st.t || st.kw.length || st.colors || st.mustAttack || st.unblockable || st.cantBlock || st.noDefender || st.addTypes || st.addSubtypes) pc.statics.push(st);
  for (const o of extra) {
    for (const t of o.triggers) pc.triggers.push({ ...t, gate: cond } as any);
    for (const a of o.activated) pc.activated.push({ ...a, gate: cond } as any);
    for (const x of o.statics) pc.statics.push({ ...x, gate: cond } as any);
    for (const r of o.replacements ?? []) pc.replacements.push({ ...r, gate: cond } as any);
    for (const kw of o.keywords) st.kw.push(kw);
    if (o.keywords.length && !pc.statics.includes(st)) pc.statics.push(st);
  }
  if (extra.length) (pc as any).gated = true;
  return true;
});

// Generic fallback: "As long as <condition>, <any line that parses on its own>." — the line's abilities exist only while
// the condition holds (gated). Used only when the line as a whole doesn't parse.
const fake = (oracle: string): any => {
  busy = true;
  try { return parseCard({ id: `gate2:${oracle}`, name: 'gated', manaCost: '', cmc: 0, typeLine: 'Creature', oracle, colors: [], colorIdentity: [], keywords: [], layout: 'normal' } as any); } finally { busy = false; }
};
const BASE_KEYS = new Set(['keywords', 'triggers', 'activated', 'statics', 'unparsed', 'kwArgs', 'replacements', 'spell']);
const clean = (o: any) => !o.unparsed?.length && ![...o.triggers, ...o.activated, ...o.statics, ...(o.replacements ?? [])].some((a: any) => JSON.stringify(a).includes('"k":"manual"'));
EXT.lines.push((line, pc) => {
  if (busy) return false;
  const m = line.match(/^as long as (.+?), (.+)$/);
  if (!m) return false;
  const cond = parseCond(m[1]);
  if (!cond) return false;
  if (clean(fake(line))) return false; // someone else handles the whole line
  let body = m[2];
  // "it's a land" / "it has …" → about ~
  body = body.replace(/^it's /, '~ is ').replace(/^it (has|gets|can't|can) /, '~ $1 ');
  const o = fake(body);
  if (!clean(o)) return false;
  const extraKeys = Object.keys(o).filter((k) => !BASE_KEYS.has(k) && o[k] != null && !(Array.isArray(o[k]) && !o[k].length));
  if (extraKeys.length) return false;
  if (!o.triggers.length && !o.activated.length && !o.statics.length && !(o.replacements ?? []).length && !o.keywords.length) return false;
  for (const t of o.triggers) pc.triggers.push({ ...t, gate: cond } as any);
  for (const a of o.activated) pc.activated.push({ ...a, gate: cond } as any);
  for (const x of o.statics) pc.statics.push({ ...x, gate: cond } as any);
  for (const r of o.replacements ?? []) pc.replacements.push({ ...r, gate: cond } as any);
  if (o.keywords.length) pc.statics.push({ kind: 'selfPump', p: 0, t: 0, kw: [...o.keywords], cond } as any);
  (pc as any).gated = true;
  return true;
});
