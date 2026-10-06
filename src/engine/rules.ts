/** Characteristic calculation (a simplified layer system) and filter matching. */
import { EXT } from './ext';
import type { CardDef, CardFace } from './cardTypes';
import type { CardObj, GameState, PlayerIdx, StackItem } from './types';
import { parseCard, type Amt, type Cond, type Filter, type ParsedCard, type StaticAb } from './oracle';
import { parseCost, manaValue } from './mana';

export interface Chars {
  name: string;
  typeLine: string;
  types: Set<string>;
  subtypes: Set<string>;
  supertypes: Set<string>;
  power: number;
  toughness: number;
  basePower: number;
  baseToughness: number;
  hasPT: boolean;
  loyalty: number;
  colors: string[];
  keywords: Set<string>;
  pc: ParsedCard;
  manaCost: string;
  cmc: number;
  oracle: string;
  image?: string;
  cantBlock: boolean;
  cantAttack: boolean;
  unblockable: boolean;
  noUntap: boolean;
}

export const opp = (p: PlayerIdx): PlayerIdx => (p === 0 ? 1 : 0);

const TL_CACHE = new Map<string, { supers: string[]; types: string[]; subs: string[] }>();
/** Callers mutate the returned sets, so each call gets fresh sets built from a cached parse. */
export function parseTypeLine(tl: string) {
  let hit = TL_CACHE.get(tl);
  if (!hit) { const r = parseTypeLineRaw(tl); hit = { supers: [...r.supers], types: [...r.types], subs: [...r.subs] }; TL_CACHE.set(tl, hit); }
  return { supers: new Set(hit.supers), types: new Set(hit.types), subs: new Set(hit.subs) };
}
function parseTypeLineRaw(tl: string) {
  const [left, right] = tl.split(/\s+[—-]\s+/);
  const supers = new Set<string>();
  const types = new Set<string>();
  for (const w of (left ?? '').toLowerCase().split(/\s+/).filter(Boolean)) {
    if (['legendary', 'basic', 'snow', 'world', 'ongoing', 'elite', 'host'].includes(w)) supers.add(w);
    else if (w !== 'token') types.add(w === 'tribal' ? 'kindred' : w);
  }
  const subs = new Set<string>((right ?? '').toLowerCase().split(/\s+/).filter(Boolean));
  return { supers, types, subs };
}

/** The definition a card object currently uses (its own, or the one it is copying). */
export function effectiveDef(state: GameState, card: CardObj): CardDef {
  return state.defs[card.copyOf?.defId ?? card.defId] ?? state.defs[card.defId];
}

/** The face currently relevant for a card object. */
export function currentFace(state: GameState, card: CardObj): CardFace {
  const def = effectiveDef(state, card);
  if (!def) return { name: '?', manaCost: '', typeLine: '', oracle: '' };
  const faceIdx = card.copyOf?.face ?? card.face;
  if (def.faces && def.faces.length > 1) {
    const multi = ['transform', 'modal_dfc', 'meld', 'reversible_card', 'battle', 'flip'].includes(def.layout);
    const onStackHalf = (card.zone === 'stack' && ['split', 'adventure', 'prepare', 'omen'].includes(def.layout)) || (card.zone === 'battlefield' && def.layout === 'split' && /\bRoom\b/.test(def.typeLine));
    const castAsCreature = card.zone !== 'stack' && ['adventure', 'prepare', 'omen'].includes(def.layout);
    if (multi || onStackHalf) {
      const f = def.faces[Math.min(faceIdx, def.faces.length - 1)];
      return { ...f, image: f.image ?? def.image, colors: f.colors ?? def.colors };
    }
    if (castAsCreature) {
      const f = def.faces[0];
      return { ...f, image: def.image, colors: f.colors ?? def.colors };
    }
  }
  return {
    name: def.name,
    manaCost: def.manaCost,
    typeLine: def.typeLine,
    oracle: def.layout === 'adventure' && def.faces ? def.faces[0].oracle : def.oracle,
    power: def.power,
    toughness: def.toughness,
    loyalty: def.loyalty,
    defense: def.defense,
    colors: def.colors,
    image: def.image,
  };
}

function ptNum(s?: string): number {
  if (!s) return 0;
  const m = s.match(/-?\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

const levelCache = new WeakMap<ParsedCard, Map<number, ParsedCard>>();
/** Class enchantments: only the abilities of the levels reached so far exist. */
function atLevel(pc: ParsedCard, lv: number): ParsedCard {
  let m = levelCache.get(pc);
  if (!m) levelCache.set(pc, (m = new Map()));
  let out = m.get(lv);
  if (!out) {
    out = {
      ...pc,
      triggers: pc.triggers.filter((t) => !t.level || t.level <= lv),
      statics: pc.statics.filter((t) => !t.level || t.level <= lv),
      replacements: pc.replacements.filter((t: any) => !t.level || t.level <= lv),
    };
    m.set(lv, out);
  }
  return out;
}

/** Gated abilities ("max speed — …") only exist while their condition holds. Activated ones are checked on activation. */
const GATE_BUSY = new Set<string>();
export function gateOk(state: GameState, card: CardObj, gate: any): boolean {
  if (gate?.k !== 'ext' && gate?.k) {
    // a core condition ("as long as there are seven or more cards in your graveyard, ~ has …"); re-entry while this
    // card's own characteristics are being computed counts as "off"
    if (GATE_BUSY.has(card.iid)) return false;
    GATE_BUSY.add(card.iid);
    try { return evalCond(state, gate, card.controller, card.iid); } finally { GATE_BUSY.delete(card.iid); }
  }
  const f = gate?.k === 'ext' ? EXT.condEval[gate.name] : null;
  if (!f) return true;
  if (GATE_BUSY.has(card.iid)) return false;
  GATE_BUSY.add(card.iid);
  try { return !!f(state, gate, card.controller, card.iid); } finally { GATE_BUSY.delete(card.iid); }
}
function gateFilter(state: GameState, card: CardObj, pc: ParsedCard): ParsedCard {
  const ok = (x: any) => !x.gate || gateOk(state, card, x.gate);
  return { ...pc, triggers: pc.triggers.filter(ok), statics: pc.statics.filter(ok), replacements: pc.replacements.filter(ok) };
}

export const EMPTY_PC: ParsedCard = { keywords: [], triggers: [], activated: [], statics: [], unparsed: [], kwArgs: {}, replacements: [] };

export function parsedFor(state: GameState, card: CardObj): ParsedCard {
  const def = effectiveDef(state, card);
  const face = currentFace(state, card);
  return mergeMutated(state, card, parseCard(def, face));
}

/** The creature this one is validly paired with (soulbond, 702.95), if any. */
export function pairedWith(state: GameState, a: string): string | null {
  const c = state.cards[a] as any;
  const b = c?.pairedWith;
  if (!b) return null;
  const d = state.cards[b] as any;
  if (c.zone !== 'battlefield' || d?.zone !== 'battlefield' || d.pairedWith !== a || d.controller !== c.controller) return null;
  return b;
}

const GRANT_CACHE = new WeakMap<GameState, { key: string; list: { iid: string; attach: string[]; group: any[]; landType?: any }[] }>();
/** Permanents whose text grants abilities to others (cached until the battlefield changes). */
function grantSources(state: GameState) {
  const key = `${(state as any).bfVer ?? 0}:${state.battlefield.length}:${state.battlefield[state.battlefield.length - 1] ?? ''}`;
  const hit = GRANT_CACHE.get(state);
  if (hit && hit.key === key) return hit.list;
  const list: { iid: string; attach: string[]; group: any[]; landType?: any }[] = [];
  for (const b of state.battlefield) {
    const g = state.cards[b];
    if (!g) continue;
    const gpc = parseCard(effectiveDef(state, g), currentFace(state, g)) as any;
    if (gpc.attachGrants?.length || gpc.attachGrantsIf?.length || gpc.groupGrants?.length || gpc.landTypeAll || gpc.uncounterFor || gpc.pairGrants?.length || gpc.attachBecome) list.push({ become: gpc.attachBecome, iid: b, attach: gpc.attachGrants ?? [], attachIf: gpc.attachGrantsIf ?? [], group: gpc.groupGrants ?? [], landType: gpc.landTypeAll, uncounter: gpc.uncounterFor, pair: gpc.pairGrants } as any);
  }
  GRANT_CACHE.set(state, { key, list });
  return list;
}

/** Does a permanent match a simple filter by its printed type line, colors and controller (no layer effects)? */
function printedMatch(state: GameState, card: CardObj, f: any, src: CardObj): boolean {
  const d = effectiveDef(state, card);
  const tl = (currentFace(state, card)?.typeLine ?? d.typeLine).toLowerCase();
  const [left, right = ''] = tl.split(' — ');
  const types = left.split(' ');
  const subs = right.split(' ');
  if (f.other && card.iid === src.iid) return false;
  if (f.controller === 'you' && card.controller !== src.controller) return false;
  if (f.commander && !(card as any).isCommander) return false;
  if (f.owner === 'you' && card.owner !== src.controller) return false;
  if ((f.controller === 'opp' || f.controller === 'notYou') && card.controller === src.controller) return false;
  if (f.types?.length && !f.types.some((x: string) => x === 'permanent' || types.includes(x))) return false;
  if (f.allTypes?.length && !f.allTypes.every((x: string) => types.includes(x))) return false;
  if (f.notTypes?.some((x: string) => types.includes(x))) return false;
  if (f.subtypes?.length && !f.subtypes.some((x: string) => subs.includes(x))) return false;
  if (f.supertypes?.some((x: string) => !types.includes(x))) return false;
  if (f.colors?.length && !f.colors.some((c: string) => (d.colors ?? []).includes(c as any))) return false;
  if (f.token && !(card as any).token) return false;
  if (f.hasCounter) { const cs = Object.entries(card.counters ?? {}).filter(([, v]) => (v as number) > 0).map(([k]) => k); if (f.hasCounter === 'any' ? !cs.length : f.hasCounter === 'none' ? cs.length : !cs.includes(f.hasCounter)) return false; }
  return true;
}

/** A mutated permanent has the abilities of every card in it (rule 725.2). */
function mergeMutated(state: GameState, card: CardObj, pc0: ParsedCard): ParsedCard {
  let pc = pc0;
  // "Creature spells you control can't be countered." (Rhythm of the Wild, Allosaurus Shepherd)
  if (card.zone === 'stack' && !pc.cantBeCountered) for (const src of grantSources(state)) {
    const g = state.cards[src.iid];
    const u = (src as any).uncounter;
    if (g && u && card.controller === g.controller && printedMatch(state, card, u, g)) { pc = { ...pc, cantBeCountered: true }; break; }
  }
  const under = (card as any).mutatedDefs as string[] | undefined;
  let granted = (card as any).granted as string[] | undefined;
  // "Enchanted creature has "…"" / "Equipped creature has "…"" / "Creatures you control have "…"": granted by other permanents
  if (card.zone === 'battlefield') {
    for (const src of grantSources(state)) {
      const g = state.cards[src.iid];
      if (!g) continue;
      if (src.attach.length && g.attachedTo === card.iid) granted = [...(granted ?? []), ...src.attach];
      for (const x of ((src as any).attachIf ?? []) as { filter: any; text: string }[]) if (g.attachedTo === card.iid && printedMatch(state, card, x.filter, g)) granted = [...(granted ?? []), x.text];
      // matched on printed characteristics (a full characteristics check here would recurse into this function)
      for (const gr of src.group) if (printedMatch(state, card, gr.filter, g)) granted = [...(granted ?? []), gr.text];
      // soulbond: "as long as ~ is paired with another creature, both creatures have …"
      const pg = (src as any).pair as string[] | undefined;
      if (pg?.length && (src.iid === card.iid ? pairedWith(state, card.iid) : pairedWith(state, src.iid) === card.iid)) granted = [...(granted ?? []), ...pg];
    }
  }
  const rooms = (card as any).unlocked as boolean[] | undefined;
  const extraFaces = rooms ? rooms.map((u, i) => (u && i !== (card.face ?? 0) ? i : -1)).filter((i) => i >= 0) : [];
  if ((!under?.length && !granted?.length && !extraFaces.length) || card.zone !== 'battlefield') return pc;
  const out: ParsedCard = { ...pc, keywords: [...pc.keywords], triggers: [...pc.triggers], activated: [...pc.activated], statics: [...pc.statics] };
  // an unlocked Room door that isn't the face the card was cast as (709.5)
  for (const i of extraFaces) {
    const d = state.defs[card.defId];
    const o = parseCard(d, d.faces![i]);
    out.triggers.push(...o.triggers);
    out.statics.push(...o.statics);
    out.activated.push(...o.activated.filter((a: any) => a.extSpecial !== 'unlock'));
    for (const k of o.keywords) if (!out.keywords.includes(k)) out.keywords.push(k);
  }
  for (const g of granted ?? []) {
    // abilities granted by text, e.g. a token that 'has "sacrifice ~: add {c}."'
    const o = parseCard({ id: `granted:${g}`, name: 'granted', manaCost: '', cmc: 0, typeLine: 'Creature', oracle: g, colors: [], colorIdentity: [], keywords: [], layout: 'normal' } as any);
    out.activated.push(...o.activated);
    out.triggers.push(...o.triggers);
    out.statics.push(...o.statics);
    out.replacements = [...(out.replacements ?? []), ...(o.replacements ?? [])];
    if ((o as any).ward && !((out as any).ward >= (o as any).ward)) (out as any).ward = (o as any).ward;
    for (const k of o.keywords) if (!out.keywords.includes(k)) out.keywords.push(k);
    // plugin flags of the granted text (block restrictions, attack requirements …)
    for (const k of Object.keys(o)) {
      if (GRANT_BASE.has(k)) continue;
      const v = (o as any)[k];
      if (v == null || v === false || (Array.isArray(v) && !v.length)) continue;
      const cur = (out as any)[k];
      (out as any)[k] = Array.isArray(v) && Array.isArray(cur) ? [...cur, ...v] : cur ?? v;
    }
  }
  for (const d of under ?? []) {
    const def = state.defs[d];
    if (!def) continue;
    const o = parseCard(def);
    for (const k of o.keywords) if (!out.keywords.includes(k)) out.keywords.push(k);
    out.triggers.push(...o.triggers);
    out.activated.push(...o.activated);
    out.statics.push(...o.statics);
  }
  return out;
}

/** Cheap precheck: can this permanent have any static ability at all? (skips the full characteristics pass for vanilla tokens) */
function mayHaveStatics(state: GameState, o: CardObj): boolean {
  if (o.faceDown) return false;
  const a = o as any;
  if (a.granted?.length || a.mutatedDefs?.length || a.unlocked) return true;
  const pc = parseCard(effectiveDef(state, o), currentFace(state, o)) as any;
  if (pc.statics.length || pc.classLevels) return true;
  const gs = grantSources(state) as any;
  if (gs.grantStatic === undefined) {
    gs.grantStatic = gs.some((src: any) => [...src.attach, ...(src.attachIf ?? []).map((x: any) => x.text), ...src.group.map((x: any) => x.text), ...(src.pair ?? [])].some((t: string) =>
      parseCard({ id: `granted:${t}`, name: 'granted', manaCost: '', cmc: 0, typeLine: 'Creature', oracle: t, colors: [], colorIdentity: [], keywords: [], layout: 'normal' } as any).statics.length > 0));
  }
  return gs.grantStatic;
}

const GRANT_BASE = new Set(['keywords', 'triggers', 'activated', 'statics', 'replacements', 'unparsed', 'spell', 'ward', 'kwArgs', 'name']);
export function baseChars(state: GameState, iid: string): Chars {
  const card = state.cards[iid];
  const def: CardDef = effectiveDef(state, card);
  if (card.faceDown && (card.zone === 'battlefield' || card.zone === 'stack')) {
    const ward = card.morph?.kind === 'disguise' || card.morph?.kind === 'cloak';
    return {
      name: 'Face-down creature', typeLine: 'Creature', types: new Set(['creature']), subtypes: new Set(), supertypes: new Set(),
      power: 2, toughness: 2, basePower: 2, baseToughness: 2, hasPT: true, loyalty: 0, colors: [], keywords: new Set(ward ? ['ward'] : []),
      pc: ward ? { ...EMPTY_PC, keywords: ['ward'], ward: 2 } : EMPTY_PC, manaCost: '', cmc: 0, oracle: '',
      cantBlock: false, cantAttack: false, unblockable: false, noUntap: false,
    };
  }
  const face = currentFace(state, card);
  let pc = mergeMutated(state, card, parseCard(def, face));
  if (pc.classLevels) pc = atLevel(pc, card.classLevel ?? 1);
  if ((pc as any).gated) pc = gateFilter(state, card, pc);
  const { supers, types, subs } = parseTypeLine(face.typeLine);
  const cp = card.copyOf;
  if (cp?.addSubtypes) cp.addSubtypes.forEach((x) => subs.add(x));
  const bp = ptNum(cp?.pt?.[0] ?? face.power);
  const bt = ptNum(cp?.pt?.[1] ?? face.toughness);
  return {
    name: face.name,
    typeLine: face.typeLine,
    types,
    subtypes: subs,
    supertypes: supers,
    power: bp,
    toughness: bt,
    basePower: bp,
    baseToughness: bt,
    hasPT: face.power != null || !!cp?.pt,
    loyalty: card.counters.loyalty ?? ptNum(face.loyalty),
    colors: cp?.colors ?? face.colors ?? def.colors ?? [],
    keywords: new Set(pc.keywords),
    pc,
    manaCost: cp?.noManaCost ? '' : face.manaCost,
    cmc: cp?.noManaCost ? 0 : face.manaCost ? manaValue(parseCost(face.manaCost)) : def.cmc,
    oracle: face.oracle,
    image: face.image ?? def.image,
    cantBlock: !!pc.cantBlock,
    cantAttack: !!pc.cantAttack,
    unblockable: !!pc.unblockable,
    noUntap: !!pc.noUntap,
  };
}

/**
 * Characteristics after continuous effects, in layer order (rule 613):
 * 1 copy (baseChars) → 2 control (card.controller) → 4 types → 5 colors → 6 abilities → 7a CDA → 7b set P/T → 7c modifications & counters.
 */
export function chars(state: GameState, iid: string): Chars {
  const card = state.cards[iid];
  const c = baseChars(state, iid);
  if (card.zone !== 'battlefield') return c;
  const mods = [...card.mods].sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
  // "Nonbasic lands are Mountains." (Blood Moon): a type-changing static, applied with the type-changing mods (613.1d)
  if (card.zone === 'battlefield') for (const src of grantSources(state)) {
    const g = state.cards[src.iid];
    if (g && (src as any).become && g.attachedTo === iid) mods.push({ ...(src as any).become, until: 'permanent', ts: (g as any).ts ?? -1 } as any);
    if (g && src.landType && printedMatch(state, card, src.landType.filter, g)) mods.unshift((src.landType.add ? { addLandType: src.landType.type, landColor: src.landType.color, until: 'permanent', ts: -1 } : { setLandType: src.landType.type, landColor: src.landType.color, until: 'permanent', ts: -1 }) as any);
  }
  const pc = c.pc;

  // Layer 4: types (incl. bestow / reconfigure)
  if (card.bestowed && card.attachedTo) {
    c.types.delete('creature');
    c.subtypes.add('aura');
  }
  if (pc.reconfigure && card.attachedTo) c.types.delete('creature');
  mods.sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
  for (const m of mods) {
    const st = (m as any).setTypes as string[] | undefined; // "is an artifact creature": replaces its card types (205.1a)
    if (st) { c.types = new Set(st); }
    m.addTypes?.forEach((t) => c.types.add(t));
    m.removeTypes?.forEach((t) => c.types.delete(t));
    m.addSubtypes?.forEach((t) => c.subtypes.add(t));
    const ss = (m as any).setSubtypes as string[] | undefined; // "becomes a Frog": replaces its creature types
    if (ss) c.subtypes = new Set([...[...c.subtypes].filter((x) => ['plains', 'island', 'swamp', 'mountain', 'forest', 'equipment', 'vehicle', 'aura'].includes(x)), ...ss]);
    // "Each land is a Swamp in addition to its other land types." (Urborg): the type and its mana ability
    const alt = (m as any).addLandType as string | undefined;
    if (alt && c.types.has('land') && !c.subtypes.has(alt)) {
      c.subtypes.add(alt);
      const col = (m as any).landColor;
      c.pc = { ...c.pc, activated: [...c.pc.activated, { label: `{T}: Add {${col}}`, cost: { mana: '', tap: true, untap: false, sacSelf: false }, ability: { text: '', effects: [], specs: [], manual: [] }, isMana: true, produces: [[col]], manaAmount: 1, sorcery: false, once: false, zone: 'battlefield' } as any] };
    }
    const lt = (m as any).setLandType as string | undefined;
    if (lt && c.types.has('land')) {
      // 305.7: the land loses its old land types and rules-text abilities and gains the new type's mana ability
      for (const x of ['plains', 'island', 'swamp', 'mountain', 'forest']) c.subtypes.delete(x);
      c.subtypes.add(lt);
      if (!c.types.has('creature')) for (const x of [...c.subtypes]) if (!['plains', 'island', 'swamp', 'mountain', 'forest'].includes(x)) c.subtypes.delete(x);
      c.keywords = new Set();
      const col = (m as any).landColor;
      c.pc = { ...EMPTY_PC, activated: [{ label: `{T}: Add {${col}}`, cost: { mana: '', tap: true, untap: false, sacSelf: false }, ability: { text: '', effects: [], specs: [], manual: [] }, isMana: true, produces: [[col]], manaAmount: 1, sorcery: false, once: false, zone: 'battlefield' } as any] };
    }
  }
  for (const st of c.pc.statics as any[]) { st.selfAddTypes?.forEach((t: string) => c.types.add(t)); st.selfAddSubtypes?.forEach((t: string) => c.subtypes.add(t)); }
  // Theros gods: "As long as your devotion to white is less than five, ~ isn't a creature."
  for (const st of c.pc.statics as any[]) if (st.notCreatureBelow && evalAmt(state, st.notCreatureBelow.amt, card.controller, card.iid) < st.notCreatureBelow.n) c.types.delete('creature');
  // Layer 5: colors
  for (const m of mods) if (m.colors) c.colors = m.colors;
  for (const m of mods) for (const x of ((m as any).addColors ?? []) as any[]) if (!c.colors.includes(x)) c.colors = [...c.colors, x];
  // Layer 6: abilities
  if (mods.some((m) => m.loseAbilities)) {
    c.keywords = new Set();
    c.pc = EMPTY_PC;
    c.cantBlock = c.cantAttack = c.unblockable = c.noUntap = false;
  }
  for (const m of mods) {
    const gt = (m as any).grantText as string | undefined; // "is a land with "{T}: Add {C}""
    if (gt) {
      const o = parseCard({ id: `granted:${gt}`, name: 'granted', manaCost: '', cmc: 0, typeLine: 'Artifact', oracle: gt, colors: [], colorIdentity: [], keywords: [], layout: 'normal' } as any);
      c.pc = { ...c.pc, activated: [...c.pc.activated, ...o.activated], triggers: [...c.pc.triggers, ...o.triggers], statics: [...c.pc.statics, ...o.statics], ...((o as any).ward && !((c.pc as any).ward >= (o as any).ward) ? { ward: (o as any).ward } : {}) } as any;
      for (const k of o.keywords) c.keywords.add(k);
    }
    m.keywords?.forEach((k) => c.keywords.add(k));
    (m as any).removeKeywords?.forEach((k: string) => c.keywords.delete(k));
    if (m.cantBlock) c.cantBlock = true;
    if ((m as any).cantAttack) c.cantAttack = true;
    if ((m as any).noUntap) c.noUntap = true;
  }
  // Layer 7a: characteristic-defining P/T
  for (const st of c.pc.statics) {
    if (st.kind !== 'setPT') continue;
    if (st.setP != null) c.power = evalAmt(state, st.setP, card.controller, iid);
    if (st.setT != null) c.toughness = evalAmt(state, st.setT, card.controller, iid);
  }
  // Layer 7b: set base P/T
  for (const m of mods) {
    if (m.setPT) {
      c.power = m.setPT[0];
      c.toughness = m.setPT[1];
      c.hasPT = true;
    }
  }
  if (c.types.has('creature')) c.hasPT = true;
  // Layer 7c: modifications
  for (const m of mods) {
    if (m.power) c.power += m.power;
    if (m.toughness) c.toughness += m.toughness;
    if ((m as any).dmgByToughness) (c as any).dmgByToughness = true;
    if ((m as any).setP != null) c.power += (m as any).setP - c.basePower;
    if ((m as any).setT != null) c.toughness += (m as any).setT - c.baseToughness;
  }
  const em = state.players.flatMap((p) => ((p as any).command ?? []).filter((i: string) => (state.cards[i] as any)?.emblem));
  for (const oid of em.length ? [...state.battlefield, ...em] : state.battlefield) {
    const o = state.cards[oid];
    if (!o || o.phasedOut) continue;
    if (oid !== iid && !mayHaveStatics(state, o)) continue;
    const opc = oid === iid ? c.pc : baseChars(state, oid).pc;
    for (const st of opc.statics) applyStatic(state, st, o, card, c);
  }
  const plus = card.counters['+1/+1'] ?? 0;
  const minus = card.counters['-1/-1'] ?? 0;
  c.power += plus - minus;
  c.toughness += plus - minus;
  for (const [k, v] of Object.entries(card.counters)) {
    if (v > 0 && ['flying', 'first strike', 'double strike', 'deathtouch', 'hexproof', 'indestructible', 'lifelink', 'menace', 'reach', 'trample', 'vigilance', 'haste'].includes(k)) c.keywords.add(k);
    const pm = k.match(/^([+-]\d+)\/([+-]\d+)$/);
    if (pm && k !== '+1/+1' && k !== '-1/-1') {
      c.power += parseInt(pm[1], 10) * v;
      c.toughness += parseInt(pm[2], 10) * v;
    }
  }
  // Layer 7d: switch power and toughness
  if (mods.filter((m) => (m as any).switchPT).length % 2 === 1) [c.power, c.toughness] = [c.toughness, c.power];
  if (c.types.has('planeswalker')) c.loyalty = card.counters.loyalty ?? 0;
  return c;
}

function applyStatic(state: GameState, st: StaticAb, source: CardObj, target: CardObj, c: Chars) {
  if (st.kind === 'setPT') return;
  if (st.cond && !evalCond(state, st.cond, source.controller, source.iid)) return;
  const P = () => evalAmt(state, st.p, source.controller, source.iid);
  const T = () => evalAmt(state, st.t, source.controller, source.iid);
  if (st.kind === 'attachPump') {
    if (source.attachedTo !== target.iid) return;
    if ((st as any).protChosen && (source as any).chosenColor) c.keywords.add(`protection from ${({ W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green' } as any)[(source as any).chosenColor]}`);
    // "as long as enchanted permanent is a creature …": checked on characteristics computed so far (types/colors layers)
    const ac = (st as any).attachCond;
    if (ac) {
      let ok = true;
      if (ac.types?.length && !ac.types.some((t: string) => c.types.has(t))) ok = false;
      if (ac.subtypes?.length && !ac.subtypes.some((t: string) => c.subtypes.has(t) || (c.keywords.has('changeling') && c.types.has('creature')))) ok = false;
      if (ac.colors?.length && !ac.colors.some((x: string) => c.colors.includes(x as any))) ok = false;
      if (ac.supertypes?.length && !ac.supertypes.every((t: string) => c.supertypes.has(t))) ok = false;
      if (ac.keyword && !c.keywords.has(ac.keyword)) ok = false;
      if (ac.attacking && !state.combat?.attackers.some((a) => a.iid === target.iid)) ok = false;
      if (ac.tapped && !target.tapped) ok = false;
      if (ac.not ? ok : !ok) return;
    }
    c.power += P();
    c.toughness += T();
    st.kw.forEach((k) => c.keywords.add(k));
    (st as any).loseKw?.forEach((k: string) => c.keywords.delete(k));
    if (st.cantAttack) c.cantAttack = true;
    if (st.cantBlock) c.cantBlock = true;
    if (st.noUntap) c.noUntap = true;
    if ((st as any).mustAttack) (c as any).mustAttackSt = true; // "… and attacks each combat if able"
    if ((st as any).unblockable) c.unblockable = true; // "… and can't be blocked"
    return;
  }
  if (st.kind === 'selfPump') {
    if (source.iid !== target.iid) return;
    c.power += P();
    c.toughness += T();
    st.kw.forEach((k) => c.keywords.add(k));
    if ((st as any).cantBlock) c.cantBlock = true;
    if ((st as any).colors) c.colors = [...(st as any).colors];
    if ((st as any).mustAttack) (c as any).mustAttackSt = true;
    if ((st as any).unblockable) c.unblockable = true;
    if ((st as any).noDefender) c.keywords.delete('defender');
    for (const t of (st as any).addTypes ?? []) c.types.add(t);
    for (const t of (st as any).addSubtypes ?? []) c.subtypes.add(t);
    return;
  }
  if (st.kind === 'anthem' && st.filter) {
    if (!matchesFilter(state, target.iid, st.filter, source.controller, source.iid, true)) return;
    c.power += P();
    c.toughness += T();
    st.kw.forEach((k) => c.keywords.add(k));
    for (const t of (st as any).addTypes ?? []) c.types.add(t);
    for (const t of (st as any).addSubtypes ?? []) c.subtypes.add(t);
  }
}

// ---------------------------------------------------------------------------------------------
// Amounts & conditions (shared by statics and the engine)
// ---------------------------------------------------------------------------------------------

export interface EvalCtx {
  item?: any;
  subjectIds?: (s: any) => string[];
  x?: number;
  lkiCounters?: Record<string, number>;
  subjectCards?: (s: any) => string[];
}

const AMT_BUSY = new Set<string>();
/** Evaluate an amount. Uses base characteristics for counts so statics never recurse. */
export function evalAmt(state: GameState, a: Amt, you: PlayerIdx, self?: string, ctx: EvalCtx = {}): number {
  if (typeof a === 'number') return a;
  if (a === 'X') return ctx.x ?? 0;
  // plugin amounts ({ ext: 'devotion', … }). Guarded: a characteristic-defining amount (Matca Rioters: P/T = domain)
  // must never re-enter itself while its own characteristics are being computed.
  if (typeof a === 'object' && a && typeof (a as any).ext === 'string') {
    const fn = EXT.amounts[(a as any).ext];
    const key = `${(a as any).ext}:${self ?? ''}`;
    if (!fn || AMT_BUSY.has(key)) return 0;
    AMT_BUSY.add(key);
    try { return fn(state, a, you, self, ctx) * ((a as any).mult ?? 1) + ((a as any).add ?? 0); } finally { AMT_BUSY.delete(key); }
  }
  // "2 plus the number of …": a constant on top of any amount
  if (typeof a === 'object' && a && (a as any).add != null) {
    const { add, ...rest } = a as any;
    return evalAmt(state, rest as Amt, you, self, ctx) + add;
  }
  const mult = (a as any).mult ?? 1;
  if ('count' in a) {
    const f = a.count;
    let n = 0;
    if (f.zone === 'graveyard') {
      for (const p of state.players) for (const g of p.graveyard) if (matchesFilter(state, g, f, you, self, true)) n++;
    } else for (const b of state.battlefield) if (matchesFilter(state, b, { ...f, zone: 'battlefield' }, you, self, true)) n++;
    return n * mult;
  }
  if ('zone' in a) {
    const pl = state.players[a.who === 'you' ? you : opp(you)];
    return (a.zone === 'hand' ? pl.hand.length : a.zone === 'graveyard' ? pl.graveyard.length : pl.library.length) * mult;
  }
  if ('opponents' in a) return 1 * mult;
  if ('lki' in a) return (ctx.lkiCounters?.[a.lki] ?? 0) * mult;
  if ('maxPower' in a) {
    let best = 0;
    for (const b of state.battlefield) if (matchesFilter(state, b, a.maxPower, you, self, true)) best = Math.max(best, baseChars(state, b).power + (state.cards[b].counters['+1/+1'] ?? 0));
    return best * mult;
  }
  const subjFirst = (sub: any): string | undefined => (ctx.subjectIds ? ctx.subjectIds(sub)[0] : ctx.subjectCards ? ctx.subjectCards(sub)[0] : sub?.t === 'self' ? self : undefined);
  // Last-known information (608.2h): a card that left the battlefield uses its power as it last existed there.
  const pt = (c: string | undefined, key: 'power' | 'toughness') => {
    if (!c) return 0;
    const snap = (state as any).lkiCache?.[c];
    const card = state.cards[c];
    if (card?.zone === 'battlefield') return chars(state, c)[key];
    if (snap) return snap[key];
    return card ? baseChars(state, c)[key] : 0;
  };
  if ('power' in a) return Math.max(0, pt(subjFirst(a.power), 'power')) * mult;
  if ('toughness' in a) return Math.max(0, pt(subjFirst(a.toughness), 'toughness')) * mult;
  if ('cmc' in a) {
    const c = subjFirst(a.cmc);
    return c && state.cards[c] ? baseChars(state, c).cmc * mult : 0;
  }
  return 0;
}

const CTRL_STABLE = new Set(['types', 'subtypes', 'supertypes', 'colors', 'controller', 'zone', 'other', 'subAny', 'allTypes', 'notTypes', 'notColors', 'multicolored', 'colorless', 'token', 'nontoken']);
function condMemo(state: any, key: string, fn: () => number): number {
  const v = `${state.bfVer ?? 0}:${state.ts ?? 0}:${state.turn}:${state.battlefield.length}:${state.battlefield[state.battlefield.length - 1] ?? ""}`;
  let m = state.__cm;
  if (!m || m.v !== v) { m = { v, map: new Map() }; Object.defineProperty(state, '__cm', { value: m, enumerable: false, writable: true, configurable: true }); }
  const hit = m.map.get(key);
  if (hit !== undefined) return hit;
  const r = fn();
  m.map.set(key, r);
  return r;
}
export function evalCond(state: GameState, cond: Cond, you: PlayerIdx, self?: string, ctx: EvalCtx = {}): boolean {
  const card = self ? state.cards[self] : undefined;
  switch (cond.k) {
    case 'and':
      return cond.conds.every((c) => evalCond(state, c, you, self, ctx));
    case 'control': {
      // memoised per battlefield/modification version for characteristic-only filters (Wild Nacatl is checked constantly)
      const f: any = cond.filter;
      const stable = !Object.keys(f).some((k) => !CTRL_STABLE.has(k));
      const count = () => state.battlefield.filter((b) => matchesFilter(state, b, cond.filter, you, self, true)).length;
      const n = stable ? condMemo(state, `ctl:${you}:${f.other ? self : ''}:${JSON.stringify(f)}`, count) : count();
      return cond.max ? n <= cond.n : n >= cond.n;
    }
    case 'yourTurn':
      return cond.not ? state.active !== you : state.active === you;
    case 'zoneCount': {
      const pl = state.players[cond.who === 'opp' ? opp(you) : you];
      const list = cond.zone === 'hand' ? pl.hand : pl.graveyard;
      const n = cond.filter ? list.filter((g) => matchesFilter(state, g, cond.filter!, you, self, true)).length : list.length;
      return cond.max ? n <= cond.n : n >= cond.n;
    }
    case 'life': {
      const l = state.players[cond.who === 'you' ? you : opp(you)].life;
      return cond.max ? l <= cond.n : l >= cond.n;
    }
    case 'self': {
      if (!card) return false;
      const att = !!state.combat?.attackers.some((a) => a.iid === self);
      const blk = !!state.combat?.attackers.some((a) => a.blockedBy.includes(self!));
      switch (cond.state as string) {
        case 'equipped': return state.battlefield.some((b) => state.cards[b].attachedTo === self && baseChars(state, b).subtypes.has('equipment'));
        case 'enchanted': return state.battlefield.some((b) => state.cards[b].attachedTo === self && baseChars(state, b).subtypes.has('aura'));
        case 'attacking': return att;
        case 'blocking': return blk;
        case 'attackingOrBlocking': return att || blk;
        case 'tapped': return card.tapped;
        case 'untapped': return !card.tapped;
        case 'renowned': return !!(card as any).renowned;
        case 'monstrous': return !!(card as any).monstrous;
        case 'modified': return Object.values(card.counters).some((n) => (n ?? 0) > 0) || state.battlefield.some((b) => state.cards[b].attachedTo === self && (baseChars(state, b).subtypes.has('equipment') || (baseChars(state, b).subtypes.has('aura') && state.cards[b].controller === card.controller)));
      }
      return false;
    }
    case 'noSpellsLastTurn':
      return state.lastTurnSpells === 0 && state.turn > 1;
    case 'twoSpellsLastTurn':
      return state.lastTurnActiveSpells >= 2;
    case 'day':
      return state.dayNight === 'day';
    case 'night':
      return state.dayNight === 'night';
    case 'noCounter':
      return !((ctx.lkiCounters ?? card?.counters ?? {})[cond.counter] > 0);
    case 'notRenowned':
      return !card?.renowned;
    case 'oppDamaged':
      return state.players[opp(you)].damagedThisTurn;
    case 'defendingMostLife':
      return state.players[opp(you)].life >= state.players[you].life;
    case 'ext':
      return EXT.condEval[(cond as any).name]?.(state, cond, you, self, ctx) ?? false;
    case 'completedDungeon':
      return ((state.players[you] as any).dungeonsCompleted ?? 0) > 0;
    case 'kicked':
      return !!card?.kicked;
    default:
      return true; // evolve / trainingPartner are checked by the engine with trigger context
  }
}

export function isCreature(state: GameState, iid: string) {
  return chars(state, iid).types.has('creature');
}

/** Check if a card object matches a filter from the perspective of `you`. */
export function matchesFilter(state: GameState, iid: string, f: Filter, you: PlayerIdx, selfIid?: string, useBase = false): boolean {
  const card = state.cards[iid];
  if (!card) return false;
  // "a Mount creature card or a Plains card": a union of filters
  const anyOf = (f as any).anyOf as Filter[] | undefined;
  if (anyOf) {
    const { anyOf: _x, ...restF } = f as any;
    return anyOf.some((g) => matchesFilter(state, iid, { ...restF, ...g, zone: g.zone ?? f.zone }, you, selfIid, useBase));
  }
  const zone = f.zone ?? 'battlefield';
  if (zone !== card.zone) return false;
  if (f.other && iid === selfIid) return false;
  const hc = (f as any).hasCounter as string | undefined;
  if (hc) {
    const vals = Object.values(card.counters ?? {}).filter((v) => (v as number) > 0);
    if (hc === 'any' ? !vals.length : hc === 'none' ? vals.length > 0 : !((card.counters?.[hc] ?? 0) > 0)) return false;
  }
  if ((f as any).name) {
    const want = (f as any).name === '~' ? (selfIid ? state.defs[state.cards[selfIid]?.defId]?.name : '') : (f as any).name;
    if ((state.defs[card.defId]?.name ?? '').toLowerCase() !== String(want).toLowerCase()) return false;
  }
  const c = useBase ? baseChars(state, iid) : chars(state, iid);
  if (f.types && f.types.length) {
    const ok = f.types.some((t) => {
      if (t === 'permanent') return ['creature', 'artifact', 'enchantment', 'land', 'planeswalker', 'battle'].some((x) => c.types.has(x));
      if (t === 'spell' || t === 'card') return true;
      return c.types.has(t);
    });
    if (!ok) return false;
  }
  if ((f as any).allTypes && !(f as any).allTypes.every((t: string) => c.types.has(t))) return false;
  if (f.notTypes) {
    for (const t of f.notTypes) {
      if (t === 'basic' && c.supertypes.has('basic')) return false;
      if (c.types.has(t) || c.subtypes.has(t)) return false;
      if (t === 'token' && card.token) return false;
    }
  }
  if ((f as any).dealtTurn || (f as any).dealtYouTurn) {
    const t = (state as any).tl14;
    if (!t || t.turn !== state.turn) return false;
    if ((f as any).dealtTurn && !t.dealers?.[iid]) return false;
    if ((f as any).dealtYouTurn && !t.dealtTo?.[you]?.[iid]) return false;
  }
  if ((f as any).ptOr) { const q = (f as any).ptOr; const ok = q.ge ? c.power >= q.n || c.toughness >= q.n : c.power <= q.n || c.toughness <= q.n; if (!ok) return false; }
  if ((f as any).notEnchanted && state.battlefield.some((o) => state.cards[o].attachedTo === iid && baseChars(state, o).subtypes.has('aura'))) return false;
  if ((f as any).colored && !c.colors.length) return false;
  if ((f as any).blockedState) {
    const at = state.combat?.attackers.find((a) => a.iid === iid);
    if (!at) return false;
    const blocked = at.blocked || at.blockedBy.length > 0;
    if ((f as any).blockedState === 'blocked' ? !blocked : blocked) return false;
  }
  if ((f as any).dynMax) {
    const d = (f as any).dynMax;
    const v = d.amt === 'X' ? ((state as any).__curX ?? Infinity) : evalAmt(state, d.amt, you, selfIid);
    const have = d.stat === 'cmc' ? manaValue(parseCost(c.manaCost ?? '')) : (c as any)[d.stat];
    if (have > v) return false;
    if (d.eq && d.amt === 'X' && Number.isFinite(v) && have !== v) return false;
    if (d.eq && d.amt !== 'X' && have !== v) return false;
  }
  if (f.subtypes && f.subtypes.length) {
    const changeling = c.keywords.has('changeling');
    const hit = (s: string) => c.subtypes.has(s) || (changeling && c.types.has('creature')) || c.types.has(s);
    const ok = (f as any).subAny ? f.subtypes.some(hit) : f.subtypes.every(hit);
    if (!ok) return false;
  }
  if (f.supertypes && !f.supertypes.every((s) => c.supertypes.has(s))) return false;
  if (f.controller) {
    const ctrl = card.zone === 'battlefield' || card.zone === 'stack' ? card.controller : card.owner;
    if (f.controller === 'you' && ctrl !== you) return false;
    if ((f.controller === 'opp' || f.controller === 'notYou') && ctrl === you) return false;
  }
  if (f.owner && f.owner !== 'any') {
    if (f.owner === 'you' && card.owner !== you) return false;
    if (f.owner === 'opp' && card.owner === you) return false;
  }
  if (f.tapped && !card.tapped) return false;
  if ((f as any).attachedToSelf && (!selfIid || card.attachedTo !== selfIid)) return false;
  if ((f as any).historic) {
    const tl = (state.defs[card.defId]?.typeLine ?? '').toLowerCase();
    if (!/\bartifact\b|\blegendary\b|\bsaga\b/.test(tl)) return false;
  }
  if ((f as any).dealtThisTurn) {
    const t = (state as any).evTurn;
    if (!(t && t.turn === state.turn && t.dmgBy?.[iid]?.length)) return false;
  }
  if (f.untapped && card.tapped) return false;
  if (f.attacking && !state.combat?.attackers.some((a) => a.iid === iid)) return false;
  if (f.blocking && !state.combat?.attackers.some((a) => a.blockedBy.includes(iid))) return false;
  if ((f as any).faceDown && !card.faceDown) return false;
  if ((f as any).rel) {
    const rel = (f as any).rel as string;
    const A = state.combat?.attackers ?? [];
    if (rel === 'blockingSelf' && !A.some((a) => a.iid === selfIid && a.blockedBy.includes(iid))) return false;
    if (rel === 'blockedBySelf' && !A.some((a) => a.iid === iid && !!selfIid && a.blockedBy.includes(selfIid))) return false;
    if (rel === 'combatWithSelf' && !A.some((a) => (a.iid === selfIid && a.blockedBy.includes(iid)) || (a.iid === iid && !!selfIid && a.blockedBy.includes(selfIid)))) return false;
    if (rel === 'enteredThisTurn' && (card as any).enteredTurn !== state.turn) return false;
    if (rel === 'equipped' && !state.battlefield.some((o) => state.cards[o].attachedTo === iid && baseChars(state, o).subtypes.has('equipment'))) return false;
    if (rel === 'enchanted' && !state.battlefield.some((o) => state.cards[o].attachedTo === iid && baseChars(state, o).subtypes.has('aura'))) return false;
    if (rel === 'modified' && !(Object.values(card.counters).some((v: any) => v > 0) || state.battlefield.some((o) => state.cards[o].attachedTo === iid && state.cards[o].controller === card.controller))) return false;
  }
  if ((f as any).attackingOrBlocking && !state.combat?.attackers.some((a) => a.iid === iid || a.blockedBy.includes(iid))) return false;
  if ((f as any).ptSumMax != null) { const ch = useBase ? baseChars(state, iid) : chars(state, iid); if (ch.power + ch.toughness > (f as any).ptSumMax) return false; }
  if (f.keyword && !c.keywords.has(f.keyword)) return false;
  if (f.noKeyword && c.keywords.has(f.noKeyword)) return false;
  if (f.powerMax != null && c.power > f.powerMax) return false;
  if (f.powerMin != null && c.power < f.powerMin) return false;
  if (f.toughnessMax != null && c.toughness > f.toughnessMax) return false;
  if (f.toughnessMin != null && c.toughness < f.toughnessMin) return false;
  if (f.cmcMax != null && c.cmc > f.cmcMax) return false;
  if (f.cmcMin != null && c.cmc < f.cmcMin) return false;
  if (f.colors && !f.colors.some((col) => c.colors.includes(col))) return false;
  if (f.notColors && f.notColors.some((col) => c.colors.includes(col))) return false;
  if (f.colorless && c.colors.length) return false;
  if (f.multicolored && c.colors.length < 2) return false;
  if ((f as any).monocolored && c.colors.length !== 1) return false;
  if ((f as any).inCombat && !state.combat?.attackers.some((a) => a.iid === iid || a.blockedBy.includes(iid))) return false;
  if (f.token && !card.token) return false;
  if ((f as any).commander && !(card as any).isCommander) return false;
  if ((f as any).hasX && !/\{X\}/.test(state.defs[card.defId]?.manaCost ?? '')) return false;
  if ((f as any).textHas && !new RegExp(`(^|\\n|, |\\()${(f as any).textHas}\\b`, 'i').test(state.defs[card.defId]?.oracle ?? '')) return false;
  if ((f as any).nColors != null && c.colors.length !== (f as any).nColors) return false;
  if ((f as any).dfc && !(state.defs[card.defId]?.faces && ['transform', 'modal_dfc', 'meld', 'double_faced_token', 'reversible_card'].includes(state.defs[card.defId].layout))) return false;
  if (f.nontoken && card.token) return false;
  if (f.chosenType || f.chosenColor) {
    const src = selfIid ? (state.cards[selfIid] as any) : undefined;
    if (f.chosenType && !(src?.chosenType && (c.subtypes.has(src.chosenType) || (c.keywords.has('changeling') && c.types.has('creature'))))) return false;
    if (f.chosenColor && !(src?.chosenColor && c.colors.includes(src.chosenColor))) return false;
  }
  return true;
}

export function stackItemMatches(state: GameState, item: StackItem, f: Filter, you: PlayerIdx, self?: string): boolean {
  if (item.kind !== 'spell') return false;
  const card = state.cards[item.source];
  if (!card) return false;
  const tf = (f as any).targetsF as { player?: 'you' | 'any'; card?: any; self?: boolean }[] | undefined;
  if (tf) {
    const ts = (item.targets ?? []).flat();
    const hit = ts.some((t: any) => tf.some((k) => (t.kind === 'player' && k.player && (k.player === 'any' || t.idx === you))
      || (t.kind === 'card' && ((k.self && t.iid === self) || (k.card && state.cards[t.iid] && matchesFilter(state, t.iid, { ...k.card, zone: state.cards[t.iid].zone }, you, self))))));
    if (!hit) return false;
    const { targetsF: _x, ...rest } = f as any;
    return matchesFilter(state, item.source, { ...rest, zone: 'stack' }, you, self);
  }
  return matchesFilter(state, item.source, { ...f, zone: 'stack' }, you, self);
}

export function hasKeyword(state: GameState, iid: string, kw: string) {
  return chars(state, iid).keywords.has(kw);
}

/** 702.16: does a permanent with these characteristics have protection from this source? */
export function protectedFrom(state: GameState, c: Chars, source: string | undefined): boolean {
  if (!source || !state.cards[source]) return false;
  let sc: Chars | null = null;
  const src = () => (sc ??= chars(state, source));
  const COL: Record<string, string> = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };
  const TYPES: Record<string, string> = { creatures: 'creature', artifacts: 'artifact', enchantments: 'enchantment', instants: 'instant', sorceries: 'sorcery', planeswalkers: 'planeswalker', lands: 'land' };
  for (const k of c.keywords) {
    if (!k.startsWith('protection from ')) continue;
    for (const q0 of k.slice(16).split(/,? and from |, from /)) {
      const q = q0.trim();
      if (q === 'everything') return true;
      const pm = q.match(/^player (\d)$/); // "protection from the chosen player": sources that player controls (702.16)
      if (pm) { if (state.cards[source].controller === +pm[1]) return true; continue; }
      if (COL[q]) { if (src().colors.includes(COL[q] as any)) return true; continue; }
      if (q === 'all colors' || q === 'each color') { if (src().colors.length) return true; continue; }
      if (q === 'multicolored') { if (src().colors.length > 1) return true; continue; }
      if (q === 'monocolored') { if (src().colors.length === 1) return true; continue; }
      if (q === 'colorless') { if (!src().colors.length) return true; continue; }
      if (TYPES[q]) { if (src().types.has(TYPES[q] as any)) return true; continue; }
      if (/^non/.test(q) && TYPES[q.slice(3)]) { if (!src().types.has(TYPES[q.slice(3)] as any)) return true; continue; }
      // creature types: "protection from Dogs", "from Wizards"
      const IRR: Record<string, string> = { oxen: 'ox', elves: 'elf', dwarves: 'dwarf', wolves: 'wolf', mice: 'mouse', fungi: 'fungus' };
      const cands = [q, IRR[q], q.replace(/s$/, ''), q.replace(/es$/, ''), q.replace(/ies$/, 'y')].filter(Boolean) as string[];
      if (cands.some((x) => src().subtypes.has(x))) return true;
    }
  }
  return false;
}

export function protectionColors(c: Chars): string[] {
  const out: string[] = [];
  for (const k of c.keywords) {
    const m = k.match(/^protection from (white|blue|black|red|green|everything)$/);
    if (m) {
      if (m[1] === 'everything') out.push('W', 'U', 'B', 'R', 'G', 'C');
      else out.push({ white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' }[m[1]]!);
    }
  }
  return out;
}

const PROP_CACHE = new WeakMap<GameState, Map<string, { key: string; ids: string[] }>>();
/** Battlefield permanents whose printed (parsed) text has `prop` set — cached until the battlefield changes.
 *  For hot rule hooks: scan only these instead of computing every permanent's characteristics. */
export function sourcesWith(state: GameState, prop: string): string[] {
  const key = `${(state as any).bfVer ?? 0}:${state.battlefield.length}:${state.battlefield[state.battlefield.length - 1] ?? ''}`;
  let m = PROP_CACHE.get(state);
  if (!m) { m = new Map(); PROP_CACHE.set(state, m); }
  const hit = m.get(prop);
  if (hit && hit.key === key) return hit.ids;
  const ids = state.battlefield.filter((b) => { const g = state.cards[b]; return !!g && (parsedFor(state, g) as any)[prop] != null; });
  m.set(prop, { key, ids });
  return ids;
}
