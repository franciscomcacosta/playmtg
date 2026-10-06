// Plugin: Auras that turn the enchanted permanent into something else (layers 4–7b, CR 613), applied while attached:
//  "Enchanted creature loses all abilities and is a blue Frog creature with base power and toughness 1/1." (Frogify, Kenrith's Transformation)
//  "Enchanted creature is a Treefolk with base power and toughness 0/4 and loses all abilities." (Lignify)
//  "Enchanted permanent is a colorless Forest land." (Song of the Dryads — 305.7: it loses its abilities, taps for {G})
//  "Enchanted permanent is a colorless land with "{T}: Add {C}" and loses all other card types and abilities." (Imprisoned in the Moon)
//  "Enchanted creature is an Insect artifact creature with base power and toughness 0/1 and has indestructible, and it loses all other abilities, …" (Darksteel Mutation)
// Stored as pc.attachBecome (a mod); rules.ts applies it to whatever the Aura is attached to.
import { EXT } from '../ext';
import { automationLevel, parseCard } from '../oracle';
import { SUBTYPES } from '../subtypes';

const COLW: Record<string, string> = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };
const CARD_TYPES = new Set(['artifact', 'creature', 'enchantment', 'land', 'planeswalker', 'battle']);
const LAND_COLOR: Record<string, string> = { plains: 'W', island: 'U', swamp: 'B', mountain: 'R', forest: 'G' };
const KWS = new Set(['flying', 'first strike', 'double strike', 'deathtouch', 'hexproof', 'indestructible', 'lifelink', 'menace', 'reach', 'trample', 'vigilance', 'haste', 'defender']);

export function parseBecome(body0: string): any | null {
  let b = body0;
  let lose = false, setAll = false, addl = false;
  const cut = (re: RegExp, f: () => void) => { if (re.test(b)) { b = b.replace(re, ''); f(); } };
  cut(/^loses all abilities and /, () => (lose = true));
  cut(/,? and (?:it )?loses all other abilities, card types, and creature types$/, () => { lose = true; setAll = true; });
  cut(/,? and (?:it )?loses all other card types and abilities$/, () => { lose = true; setAll = true; });
  cut(/,? and (?:it )?loses all (?:other )?abilities$/, () => (lose = true));
  cut(/,? and (?:it )?loses all other card types$/, () => (setAll = true));
  let addCol = false;
  cut(/ in addition to its other colors and types$/, () => { addl = true; addCol = true; });
  cut(/ in addition to its other colors$/, () => { addCol = true; });
  cut(/ in addition to its other (?:creature )?types$/, () => (addl = true));
  let grant: string | undefined;
  const g = b.match(/^(.*?) with "(.+?),?"$/);
  if (g) { b = g[1]; grant = g[2].replace(/'/g, '"'); }
  let kws: string[] = [];
  const h = b.match(/^(.*?),? and has ([a-z ,]+)$/);
  if (h) {
    kws = h[2].split(/,? and |, /).map((x) => x.trim());
    if (!kws.every((k) => KWS.has(k))) return null;
    b = h[1];
  }
  const m = b.match(/^is (?:an? )?(.+?)(?: with base power and toughness (\d+)\/(\d+))?$/);
  if (!m) return null;
  const words = m[1].replace(/ and /g, ' ').split(' ');
  const colors: string[] = [];
  let colorless = false;
  const types: string[] = [];
  const subs: string[] = [];
  for (const w of words) {
    if (w in COLW) colors.push(COLW[w]);
    else if (w === 'colorless') colorless = true;
    else if (CARD_TYPES.has(w)) types.push(w);
    else if (SUBTYPES.has(w)) subs.push(w);
    else return null;
  }
  if (!types.length && !subs.length && !colors.length && !colorless) return null;
  const mod: any = {};
  if (addCol && colors.length) mod.addColors = colors;
  else if (colors.length || colorless) mod.colors = colors;
  if (types.length) { if (addl) mod.addTypes = types; else mod.setTypes = types; }
  else if (setAll) return null;
  const basic = subs.find((x) => x in LAND_COLOR);
  if (basic && types.includes('land')) { mod.setLandType = basic; mod.landColor = LAND_COLOR[basic]; }
  else if (subs.length) { if (addl) mod.addSubtypes = subs; else mod.setSubtypes = subs; }
  if (lose) mod.loseAbilities = true;
  if (m[2]) mod.setPT = [+m[2], +m[3]];
  if (kws.length) mod.keywords = kws;
  if (grant) {
    const probe: any = parseCard({ id: `become-probe:${grant}`, name: 'Granted', manaCost: '', cmc: 0, typeLine: 'Artifact', oracle: grant, colors: [], colorIdentity: [], keywords: [], layout: 'normal' } as any);
    if (automationLevel(probe) !== 'full') return null;
    mod.grantText = grant;
  }
  return mod;
}

EXT.lines.push((line, pc) => {
  const m = line.match(/^(?:enchanted|equipped) (?:creature|permanent|land|artifact) (.+)$/);
  if (!m || !/^(?:is |loses all abilities and is an? )/.test(m[1])) return false;
  const mod = parseBecome(m[1]);
  if (!mod) return false;
  pc.attachBecome = mod;
  return true;
});
