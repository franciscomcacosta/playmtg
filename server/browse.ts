// Card browsing for the Deck Builder (filters, sort, paging), name resolution with suggestions for imports, and a
// server-side fetcher for public decklists on the deck sites the import dialog supports.
import type { CardDb } from './cards';
import { norm } from './cards';
import type { CardDef } from '../src/engine/cardTypes';
import { cardAutomation } from '../src/engine/oracle';
import { canBeCommander } from '../src/engine/ext/commander';

const COLOR_RANK = (c: CardDef) => (/\bLand\b/.test(c.typeLine) ? 7 : !c.colors.length ? 6 : c.colors.length > 1 ? 5 : 'WUBRG'.indexOf(c.colors[0]));
const RAR = ['common', 'uncommon', 'rare', 'mythic'];
const PLAYABLE = /\b(Creature|Instant|Sorcery|Enchantment|Artifact|Planeswalker|Land|Battle|Kindred|Tribal)\b/;

export function cardSummary(c: CardDef) {
  let auto: string = 'manual';
  try {
    auto = cardAutomation(c);
  } catch {}
  return {
    name: c.name, manaCost: c.manaCost, cmc: c.cmc, typeLine: c.typeLine, colors: c.colors, colorIdentity: c.colorIdentity, rarity: (c as any).rarity ?? 'common',
    image: c.image ?? null, art: (c as any).art ?? null, oracle: c.oracle, power: c.power, toughness: c.toughness, legendary: canBeCommander(c),
    basic: /\bBasic\b/.test(c.typeLine), land: /\bLand\b/.test(c.typeLine), legal: (c as any).legal ?? [], auto,
    faces: c.faces?.map((f: any) => ({ name: f.name, image: f.image ?? null, manaCost: f.manaCost })) ?? undefined,
  };
}

export interface BrowseOpts { q?: string; colors?: string[]; mode?: 'any' | 'only'; mv?: number[]; types?: string[]; rarity?: string[]; names?: string[]; sort?: string; offset?: number; limit?: number; format?: string }
export function browse(db: CardDb, o: BrowseOpts) {
  const q = norm(o.q ?? '');
  const cols = (o.colors ?? []).map((c) => c.toUpperCase());
  const wantC = cols.includes('C');
  const realCols = cols.filter((c) => c !== 'C');
  const names = o.names?.length ? new Set(o.names.map(norm)) : null;
  const types = (o.types ?? []).map((t) => t.toLowerCase());
  const legalIn = o.format === 'commander' ? 'commander' : null;
  const out = db.cards.filter((c) => {
    if (c.name.startsWith('A-') || /\bToken\b/.test(c.typeLine)) return false;
    if (!PLAYABLE.test(c.typeLine)) return false; // art series, theme cards, schemes, planes…
    if (names && !names.has(norm(c.name))) return false;
    if (q && !norm(c.name).includes(q) && !norm(c.typeLine).includes(q)) return false;
    if (legalIn && !((c as any).legal ?? []).includes(legalIn)) return false;
    if (cols.length) {
      const cc = c.colors ?? [];
      if (o.mode === 'only') {
        if (!cc.length ? !wantC : !cc.every((x) => realCols.includes(x))) return false;
      } else if (!cc.length ? !wantC : !cc.some((x) => realCols.includes(x))) return false;
    }
    if (o.mv?.length) {
      if (/\bLand\b/.test(c.typeLine)) return false;
      if (!o.mv.some((m) => (m >= 7 ? c.cmc >= 7 : c.cmc === m))) return false;
    }
    if (types.length && !types.some((t) => c.typeLine.toLowerCase().includes(t))) return false;
    if (o.rarity?.length && !o.rarity.includes((c as any).rarity)) return false;
    return true;
  });
  const sort = o.sort ?? 'mv';
  out.sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name);
    if (sort === 'color') return COLOR_RANK(a) - COLOR_RANK(b) || a.cmc - b.cmc || a.name.localeCompare(b.name);
    if (sort === 'rarity') return RAR.indexOf((b as any).rarity) - RAR.indexOf((a as any).rarity) || a.name.localeCompare(b.name);
    const la = /\bLand\b/.test(a.typeLine) ? 1 : 0, lb = /\bLand\b/.test(b.typeLine) ? 1 : 0;
    return la - lb || a.cmc - b.cmc || COLOR_RANK(a) - COLOR_RANK(b) || a.name.localeCompare(b.name);
  });
  const offset = Math.max(0, o.offset ?? 0), limit = Math.min(Math.max(1, o.limit ?? 120), 300);
  return { total: out.length, cards: out.slice(offset, offset + limit).map(cardSummary) };
}

function lev(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = cur[0];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
/** Exact (normalised) lookup for each name; unknown names get a suggestion (prefix, then closest spelling). */
export function resolve(db: CardDb, names: string[]) {
  const keys = [...db.byName.keys()];
  return names.slice(0, 400).map((raw) => {
    const n = norm(String(raw).split(' // ')[0]);
    const hit = db.byName.get(n);
    if (hit) return { name: raw, found: hit.name, card: cardSummary(hit) };
    let sug: string | null = null;
    if (n.length >= 4) {
      const pre = keys.find((k) => k.startsWith(n + ',') || k.startsWith(n + ' '));
      if (pre) sug = db.byName.get(pre)!.name;
    }
    if (!sug) {
      const max = Math.max(2, Math.floor(n.length * 0.2));
      let best = max + 1;
      for (const k of keys) {
        const d = lev(n, k, Math.min(best - 1, max));
        if (d < best) {
          best = d;
          sug = db.byName.get(k)!.name;
          if (d === 1) break;
        }
      }
    }
    return { name: raw, found: null, suggestion: sug };
  });
}

// ---------------------------------------------------------------------------------------- deck sites
const SITES = ['moxfield.com', 'archidekt.com', 'mtggoldfish.com', 'scryfall.com', 'aetherhub.com', 'tappedout.net', 'edhrec.com', 'deckstats.net', 'mtgtop8.com'];
async function get(url: string, json = false): Promise<any> {
  const r = await fetch(url, { headers: { 'User-Agent': 'PlayMTG/1.0 (+https://playmtg.online; deck import)', Accept: json ? 'application/json' : 'text/plain,text/html,*/*' }, signal: AbortSignal.timeout(12000) });
  if (r.status === 404 || r.status === 403 || r.status === 401) throw new Error('That deck is private or does not exist. The deck must be public.');
  if (!r.ok) throw new Error(`The site answered ${r.status}. Try again, or export the list there and use Paste list.`);
  return json ? r.json() : r.text();
}
export async function fetchDeck(raw: string): Promise<{ site: string; name: string; text: string }> {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new Error('That does not look like a link. Paste the full address of a public deck.');
  }
  const host = u.hostname.replace(/^www\./, '');
  const site = SITES.find((s) => host === s || host.endsWith('.' + s));
  if (!site) throw new Error(`PlayMTG can't read decks from ${host} yet. Export the list there and use Paste list instead.`);
  const seg = u.pathname.split('/').filter(Boolean);
  const lines = (arr: { q: number; n: string }[]) => arr.map((x) => `${x.q} ${x.n}`).join('\n');
  switch (site) {
    case 'moxfield.com': {
      const id = seg[seg.indexOf('decks') + 1];
      const d = await get(`https://api2.moxfield.com/v3/decks/all/${id}`, true);
      const board = (b: any) => Object.values(b?.cards ?? {}).map((c: any) => ({ q: c.quantity, n: c.card?.name }));
      const B = d.boards ?? {};
      const parts: string[] = [];
      if (Object.keys(B.commanders?.cards ?? {}).length) parts.push('Commander\n' + lines(board(B.commanders)));
      parts.push('Deck\n' + lines(board(B.mainboard)));
      if (Object.keys(B.sideboard?.cards ?? {}).length) parts.push('Sideboard\n' + lines(board(B.sideboard)));
      return { site: 'Moxfield', name: d.name ?? 'Moxfield deck', text: parts.join('\n\n') };
    }
    case 'archidekt.com': {
      const id = seg[seg.indexOf('decks') + 1];
      const d = await get(`https://archidekt.com/api/decks/${id}/`, true);
      const cmd: any[] = [], main: any[] = [], side: any[] = [];
      for (const c of d.cards ?? []) {
        const cats: string[] = c.categories ?? [];
        const e = { q: c.quantity, n: c.card?.oracleCard?.name ?? c.card?.name };
        if (cats.includes('Commander')) cmd.push(e);
        else if (cats.includes('Sideboard')) side.push(e);
        else if (!cats.includes('Maybeboard')) main.push(e);
      }
      return { site: 'Archidekt', name: d.name ?? 'Archidekt deck', text: [cmd.length ? 'Commander\n' + lines(cmd) : '', 'Deck\n' + lines(main), side.length ? 'Sideboard\n' + lines(side) : ''].filter(Boolean).join('\n\n') };
    }
    case 'mtggoldfish.com': {
      const id = seg[seg.indexOf('deck') + 1];
      const text = await get(`https://www.mtggoldfish.com/deck/download/${id}`);
      return { site: 'MTGGoldfish', name: 'MTGGoldfish deck', text };
    }
    case 'scryfall.com': {
      const id = seg[seg.length - 1];
      const text = await get(`https://api.scryfall.com/decks/${id}/export/text`);
      return { site: 'Scryfall', name: 'Scryfall deck', text };
    }
    case 'aetherhub.com': {
      const html = await get(u.toString());
      const m = html.match(/data-deckid="(\d+)"/) ?? html.match(/MtgoDeckExport\/(\d+)/);
      if (!m) throw new Error('Could not find that deck on AetherHub.');
      const text = await get(`https://aetherhub.com/Deck/MtgoDeckExport/${m[1]}`);
      return { site: 'AetherHub', name: 'AetherHub deck', text };
    }
    case 'tappedout.net': {
      u.searchParams.set('fmt', 'txt');
      const text = await get(u.toString());
      return { site: 'TappedOut', name: seg[seg.length - 1]?.replace(/-/g, ' ') ?? 'TappedOut deck', text };
    }
    case 'deckstats.net': {
      u.searchParams.set('export_txt', '1');
      const text = await get(u.toString());
      return { site: 'Deckstats', name: 'Deckstats deck', text };
    }
    case 'mtgtop8.com': {
      const d = u.searchParams.get('d');
      if (!d) throw new Error('Use the link of a single MTGTop8 deck (it has d=… in it).');
      const text = await get(`https://www.mtgtop8.com/mtgo?d=${d}`);
      return { site: 'MTGTop8', name: 'MTGTop8 deck', text };
    }
    case 'edhrec.com': {
      throw new Error("EDHREC pages are averages, not decklists. Open the deck on Moxfield or Archidekt and paste that link, or use Paste list.");
    }
  }
  throw new Error('Unsupported site.');
}
