// Plugin: temporary characteristic changes written as a list of clauses (613 layers via a single mod):
//  "Until end of turn, ~ becomes a 3/3 red Goblin creature with haste and "Whenever …"." (creature lands, vehicles)
//  "Until end of turn, target creature gets +2/+2, gains flying, and becomes a Horror enchantment creature in addition to its other types."
//  "Until end of turn, ~ becomes a Dragon with base power and toughness 4/4, flying, and haste."
//  "Until end of turn, target creature has base power and toughness 4/4, gains all creature types, and gains flying."
//  "Until end of turn, ~ loses defender and gains flying." / "… becomes a 5/5 Human Soldier creature with indestructible that's still a planeswalker."
import { EXT } from '../ext';
import { automationLevel, parseCard, parseSubject } from '../oracle';
import { SUBTYPES } from '../subtypes';

const COLW: Record<string, string> = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };
const TYPES = new Set(['artifact', 'creature', 'enchantment', 'land', 'planeswalker']);
const KWS = new Set(['flying', 'first strike', 'double strike', 'deathtouch', 'hexproof', 'indestructible', 'lifelink', 'menace', 'reach', 'trample', 'vigilance', 'haste', 'shroud', 'wither', 'infect', 'defender', 'fear', 'intimidate', 'horsemanship', 'shadow', 'flanking', 'prowess', 'toxic 1', 'toxic 2', 'annihilator 2', 'changeling']);
const probeFull = (text: string) => automationLevel(parseCard({ id: `grant-probe:${text}`, name: 'Granted', manaCost: '', cmc: 0, typeLine: 'Creature', oracle: text, colors: [], colorIdentity: [], keywords: [], layout: 'normal' } as any) as any) === 'full';
const unq = (q: string) => q.replace(/'/g, '"').replace(/(\w)"(\w)/g, "$1'$2");

/** Split "a, b, and c" on commas/"and" outside quotes. */
function splitList(t0: string): string[] {
  const t = t0.replace(/power and toughness/g, 'power\u0004toughness').replace(/colors and types/g, 'colors\u0006types').replace(/(\b(?:white|blue|black|red|green)) and ((?:white|blue|black|red|green)\b)/g, '$1\u0005$2');
  const parts: string[] = [];
  let cur = '';
  for (const tok of t.split(/("[^"]*")/)) {
    if (tok.startsWith('"')) { cur += tok; continue; }
    const segs = tok.split(/,? and |, /);
    cur += segs[0];
    for (let k = 1; k < segs.length; k++) { parts.push(cur); cur = segs[k]; }
  }
  parts.push(cur);
  return parts.map((p) => p.replace(/\u0004/g, ' and ').replace(/\u0005/g, ' and ').replace(/\u0006/g, ' and ').trim()).filter(Boolean);
}
/** "flying, first strike, and "{T}: …"" → keywords + granted texts */
function abilityList(t: string, mod: any): boolean {
  for (const a of splitList(t)) {
    const q = a.match(/^"(.+?)\.?"$/);
    if (q) { const g = unq(q[1]); if (!probeFull(g)) return false; (mod.grants ??= []).push(g); continue; }
    if (KWS.has(a)) { (mod.keywords ??= []).push(a); continue; }
    if (/^ward \{\d+\}$/.test(a)) { (mod.grants ??= []).push(a); continue; }
    if (a === 'all creature types') { (mod.keywords ??= []).push('changeling'); continue; }
    return false;
  }
  return true;
}
export function becomes(t: string, mod: any): boolean {
  let m = t.match(/^an? (?:(legendary) )?(?:(\d+)\/(\d+) )?(.+?)(?: with (base power and toughness (\d+)\/(\d+)(?:,? and |, )?)?(.*?))?( that's still an? (?:land|planeswalker|artifact|enchantment)| in addition to its other (?:colors and )?types)?$/);
  if (!m) return false;
  const words = m[4].replace(/ and /g, ' ').split(' ');
  const colors: string[] = [], types: string[] = [], subs: string[] = [];
  for (const w of words) {
    if (w in COLW) colors.push(COLW[w]);
    else if (TYPES.has(w)) types.push(w);
    else if (SUBTYPES.has(w)) subs.push(w);
    else return false;
  }
  if (m[2]) mod.setPT = [+m[2], +m[3]];
  if (m[6]) mod.setPT = [+m[6], +m[7]];
  if (colors.length) mod.colors = colors;
  const keep = !!m[9];
  if (types.length) { if (keep) mod.addTypes = types; else mod.addTypes = types; } // a land / artifact / walker keeps its types (it "becomes" a creature)
  if (subs.length) { if (keep || types.length) mod.addSubtypes = subs; else mod.setSubtypes = subs; }
  if (m[8] && !abilityList(m[8], mod)) return false;
  return true;
}
export function clauses(t: string): any | null {
  const mod: any = {};
  // "becomes a 5/4 Dinosaur creature with trample and haste in addition to its other types" — one clause
  const bm = t.match(/^becomes? (an? [^,"]+? with [^,"]+?) in addition to its other types$/);
  if (bm && becomes(`${bm[1]} in addition to its other types`, mod)) return mod;
  let last = '';
  for (let p of splitList(t)) {
    if (!/^(gets|gains|gain|get|has|have|loses|lose|becomes|become|is|can't|assigns|assign)\b/.test(p) && last && last !== 'with') p = `${last} ${p}`;
    let m: RegExpMatchArray | null;
    if ((m = p.match(/^gets? ([+-]\d+)\/([+-]\d+)$/))) { mod.power = (mod.power ?? 0) + +m[1]; mod.toughness = (mod.toughness ?? 0) + +m[2]; last = 'gets'; continue; }
    if ((m = p.match(/^gains? (.+)$/))) { if (!abilityList(m[1], mod)) return null; last = 'gains'; continue; }
    if ((m = p.match(/^ha(?:s|ve) base power and toughness (\d+)\/(\d+)$/))) { mod.setPT = [+m[1], +m[2]]; last = ''; continue; }
    if ((m = p.match(/^ha(?:s|ve) base (power|toughness) (\d+)$/))) { (mod as any)[m[1] === 'power' ? 'setP' : 'setT'] = +m[2]; last = ''; continue; }
    if ((m = p.match(/^becomes? ((?:white|blue|black|red|green)(?: and (?:white|blue|black|red|green))*)$/))) { mod.colors = m[1].split(' and ').map((w) => COLW[w]); last = ''; continue; }
    if (/^assigns? combat damage equal to its toughness rather than its power$/.test(p)) { mod.dmgByToughness = true; last = ''; continue; }
    if ((m = p.match(/^loses? all abilities$/))) { mod.loseAbilities = true; last = ''; continue; }
    if ((m = p.match(/^loses? (.+)$/)) && KWS.has(m[1])) { (mod.removeKeywords ??= []).push(m[1]); last = 'loses'; continue; }
    if (/^become (\d+\/\d+ )?(?:[a-z]+ )*?creatures\b/.test(p)) p = p.replace(/^become (\d+\/\d+ )?((?:[a-z]+ )*?)creatures\b/, 'becomes a $1$2creature').replace(/ with /, ' with ');
    if ((m = p.match(/^becomes? (.+)$/))) { if (!becomes(m[1], mod)) return null; last = / with /.test(m[1]) ? 'with' : ''; continue; }
    if (last === 'with' && (KWS.has(p) || /^".+"$/.test(p))) { if (!abilityList(p, mod)) return null; continue; }
    if (/^can't block$/.test(p)) { mod.cantBlock = true; last = ''; continue; }
    if (/^can't attack or block$/.test(p)) { mod.cantBlock = true; mod.cantAttack = true; last = ''; continue; }
    return null;
  }
  return Object.keys(mod).length ? mod : null;
}
const SUBJ = /^(~|it|that creature|target .+?|up to (?:one|two|three) (?:other )?target .+?|each .+? you control|creatures you control|other creatures you control|all creatures|all lands(?: target player controls| you control)?|(?:forests|lands|plains|islands|swamps|mountains) you control|enchanted creature|equipped creature) ((?:gets?|gains?|ha(?:s|ve)|loses?|becomes?|assigns?) .+)$/;
EXT.rules.push([/^(?:until end of turn, (.+)|(.+) until end of turn)$/, (m, ctx) => {
  const body = (m[1] ?? m[2]).replace(/\.?"?,? it's still an? (?:land|artifact|planeswalker|enchantment)$/, (x) => (x.includes('"') ? '"' : '')).replace(/ that's still an? (land|artifact|planeswalker|enchantment)$/, '');
  const sm = body.replace(/^(.+?) each (become|get|gain|have)\b/, '$1 $2').match(SUBJ);
  if (!sm) return null;
  const mod = clauses(sm[2]);
  if (!mod) return null;
  // only take what the simpler rules can't: at least two kinds of change, a "becomes", or a granted text
  // plain pumps and keyword grants stay with the core rules (other rules build on their pump effect)
  if (Object.keys(mod).every((k) => ['power', 'toughness', 'keywords'].includes(k)) && !(mod.keywords ?? []).some((k: string) => /^(changeling|toxic|annihilator)/.test(k))) return null;
  const k0 = ctx.specs.length;
  const what = sm[1] === '~' ? { t: 'self' } : sm[1] === 'it' || sm[1] === 'that creature' ? ctx.last ?? { t: 'self' } : parseSubject(sm[1].replace(/^each (.+) you control$/, 'each $1 you control'), ctx);
  if (!what) { ctx.specs.length = k0; return null; }
  return [{ k: 'ext', name: 'tempChars', what, mod }];
}]);
EXT.effects.tempChars = ({ s, item, e, api }) => {
  for (const c of api.subjCards(s, item, e.what)) {
    if (s.cards[c]?.zone !== 'battlefield') continue;
    const { grants, ...rest } = e.mod;
    s.cards[c].mods.push({ ...rest, until: e.perm ? 'permanent' : 'eot', ts: s.ts++ } as any);
    for (const g of grants ?? []) s.cards[c].mods.push({ grantText: g, until: e.perm ? 'permanent' : 'eot', ts: s.ts++ } as any);
  }
  return 'done';
};
