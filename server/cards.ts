import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { CardDef } from '../src/engine/cardTypes';

export interface CardDb {
  cards: CardDef[];
  byId: Map<string, CardDef>;
  byName: Map<string, CardDef>;
  tokens: CardDef[];
  built?: string;
}

export const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

export function loadCardDb(): CardDb {
  const file = path.resolve('data/cards.json');
  if (!existsSync(file)) {
    console.warn('\n[manaforge] data/cards.json not found. Run `npm run cards` first. Starting with an empty card pool.\n');
    return { cards: [], byId: new Map(), byName: new Map(), tokens: [] };
  }
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const db: CardDb = { cards: raw.cards, tokens: raw.tokens ?? [], byId: new Map(), byName: new Map(), built: raw.built };
  // Pass 1: full names win. Pass 2: individual face names (split / DFC / adventure) fill gaps.
  for (const c of db.cards) {
    db.byId.set(c.id, c);
    for (const k of [c.name, c.name.replace(' // ', ' / '), c.name.replace(' // ', '/')]) {
      const n = norm(k);
      // prefer "real" cards over digital re-balanced (A-) versions
      if (!db.byName.has(n) || db.byName.get(n)!.name.startsWith('A-')) db.byName.set(n, c);
    }
  }
  for (const c of db.cards) {
    if (!c.faces) continue;
    for (const f of c.faces) {
      const n = norm(f.name);
      if (!db.byName.has(n)) db.byName.set(n, c);
    }
  }
  console.log(`[manaforge] Loaded ${db.cards.length} cards and ${db.tokens.length} tokens (built ${db.built ?? 'unknown'}).`);
  return db;
}

export function findToken(db: CardDb, name: string, power?: string, toughness?: string, colors?: string[]): CardDef | undefined {
  const n = norm(name);
  const cands = db.tokens.filter((t) => norm(t.name) === n);
  if (!cands.length) return undefined;
  const exact = cands.find(
    (t) => (power == null || t.power === power) && (toughness == null || t.toughness === toughness) && (!colors || [...(t.colors ?? [])].sort().join('') === [...colors].sort().join('')),
  );
  return exact ?? cands.find((t) => (power == null || t.power === power) && (toughness == null || t.toughness === toughness)) ?? cands[0];
}

export interface DeckParse {
  main: { count: number; card: CardDef }[];
  side: { count: number; card: CardDef }[];
  commander: CardDef[];
  unknown: string[];
  total: number;
}

/** Parses Arena / MTGO / plain decklists: "4 Lightning Bolt", "4x Bolt (M10) 146", "SB: 1 Duress", section headers. */
export function parseDeckText(db: CardDb, text: string): DeckParse {
  const out: DeckParse = { main: [], side: [], commander: [], unknown: [], total: 0 };
  let section: 'main' | 'side' | 'commander' = 'main';
  let sawCards = false;
  for (let line of text.split(/\r?\n/)) {
    line = line.trim();
    if (!line) {
      if (section === 'commander') { section = 'main'; continue; }
      if (sawCards && section === 'main' && out.side.length === 0) section = 'side';
      continue;
    }
    if (/^(deck|main|maindeck|mainboard|about|name .*)$/i.test(line)) { section = 'main'; continue; }
    if (/^(sideboard|side|maybeboard|considering)$/i.test(line)) { section = 'side'; continue; }
    if (/^commanders?$/i.test(line)) { section = 'commander'; continue; }
    if (/^companion$/i.test(line)) { section = 'side'; continue; }
    if (line.startsWith('//') || line.startsWith('#')) continue;
    let sec = section;
    if (/^sb:\s*/i.test(line)) { sec = 'side'; line = line.replace(/^sb:\s*/i, ''); }
    const m = line.match(/^(\d+)\s*x?\s+(.+?)(?:\s+\([A-Za-z0-9_]+\)(?:\s+[\w\-★]+)?)?(?:\s+\*[A-Z]\*)?$/i);
    const count = m ? parseInt(m[1], 10) : 1;
    const name = (m ? m[2] : line).replace(/\s+\*F\*$/, '').trim();
    const card = db.byName.get(norm(name)) ?? db.byName.get(norm(name.split(' // ')[0])) ?? db.byName.get(norm(name.replace(/ \/\/\/ /g, ' // ')));
    if (!card) {
      out.unknown.push(name);
      continue;
    }
    if (sec === 'commander') {
      out.commander.push(card);
      continue;
    }
    sawCards = true;
    const list = sec === 'main' ? out.main : out.side;
    const ex = list.find((x) => x.card.id === card.id);
    if (ex) ex.count += count;
    else list.push({ count, card });
  }
  // If everything landed in "side" because of a leading blank line, treat as main
  if (!out.main.length && out.side.length) {
    out.main = out.side;
    out.side = [];
  }
  out.total = out.main.reduce((a, x) => a + x.count, 0);
  return out;
}

export interface SearchOpts {
  q: string;
  limit?: number;
  offset?: number;
}

/**
 * Card search with a small Scryfall-like syntax:
 *  plain words -> name contains; t:creature; o:"draw a card"; c:rg (colors include); id:wu (identity within);
 *  cmc<=3 / mv=2; pow>=4; r:mythic; f:standard (legal in format); is:token
 */
export function searchCards(db: CardDb, opts: SearchOpts): { total: number; cards: CardDef[] } {
  const tokens = opts.q.match(/(-?\w+(?:[:<>=!]+)(?:"[^"]*"|\S+))|"[^"]*"|\S+/g) ?? [];
  const preds: ((c: CardDef) => boolean)[] = [];
  let pool = db.cards;
  for (let raw of tokens) {
    const neg = raw.startsWith('-');
    if (neg) raw = raw.slice(1);
    const m = raw.match(/^(\w+)([:<>=!]+)(.+)$/);
    let pred: ((c: CardDef) => boolean) | null = null;
    if (m) {
      const [, key, op, v0] = m;
      const v = norm(v0.replace(/^"|"$/g, ''));
      const numCmp = (x: number | undefined) => {
        if (x == null || Number.isNaN(x)) return false;
        const n = parseFloat(v);
        switch (op) {
          case ':': case '=': return x === n;
          case '<': return x < n;
          case '<=': return x <= n;
          case '>': return x > n;
          case '>=': return x >= n;
          case '!=': return x !== n;
        }
        return false;
      };
      switch (key.toLowerCase()) {
        case 't': case 'type': pred = (c) => norm(c.typeLine).includes(v); break;
        case 'o': case 'oracle': pred = (c) => norm(c.oracle).includes(v); break;
        case 'c': case 'color': {
          const cols = v.toUpperCase().split('');
          if (v === 'c' || v === 'colorless') pred = (c) => c.colors.length === 0;
          else if (v === 'm' || v === 'multicolor') pred = (c) => c.colors.length > 1;
          else pred = (c) => cols.every((x) => c.colors.includes(x) || (c.faces ?? []).some((f) => f.colors?.includes(x)));
          break;
        }
        case 'id': case 'ci': case 'identity': {
          const cols = v.toUpperCase().split('');
          pred = (c) => c.colorIdentity.every((x) => cols.includes(x));
          break;
        }
        case 'cmc': case 'mv': pred = (c) => numCmp(c.cmc); break;
        case 'pow': case 'power': pred = (c) => numCmp(c.power ? parseFloat(c.power) : undefined); break;
        case 'tou': case 'toughness': pred = (c) => numCmp(c.toughness ? parseFloat(c.toughness) : undefined); break;
        case 'r': case 'rarity': pred = (c) => (c.rarity ?? '').startsWith(v); break;
        case 'f': case 'format': case 'legal': pred = (c) => (c.legal ?? []).includes(v); break;
        case 's': case 'set': case 'e': pred = (c) => c.set === v; break;
        case 'kw': case 'keyword': pred = (c) => c.keywords.some((k) => norm(k) === v); break;
        case 'is':
          if (v === 'token') pool = db.tokens;
          else if (v === 'dfc') pred = (c) => !!c.faces && ['transform', 'modal_dfc'].includes(c.layout);
          else if (v === 'split') pred = (c) => c.layout === 'split';
          break;
        default: pred = (c) => norm(c.name).includes(norm(raw));
      }
    } else {
      const v = norm(raw.replace(/^"|"$/g, ''));
      if (v) pred = (c) => norm(c.name).includes(v);
    }
    if (pred) preds.push(neg ? (c) => !pred!(c) : pred);
  }
  const res = preds.length ? pool.filter((c) => preds.every((p) => p(c))) : pool;
  // exact / prefix matches first
  const qn = norm(opts.q);
  const ranked = [...res].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  function rank(c: CardDef) {
    const n = norm(c.name);
    return n === qn ? 0 : n.startsWith(qn) ? 1 : 2;
  }
  const off = opts.offset ?? 0;
  return { total: ranked.length, cards: ranked.slice(off, off + (opts.limit ?? 60)) };
}
