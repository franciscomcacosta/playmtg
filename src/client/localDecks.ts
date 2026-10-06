// Decks for guests (kept in this browser) and the shared deck <-> text helpers. Signed-in players keep their decks on
// the server; on first sign-in, decks made as a guest are copied to the account.
import { request, toast, type DeckData, type DeckSummary } from './store';
import { STARTERS } from './decks';

const KEY = 'manaforge.decks.v2';
const OLD = 'manaforge.decks.v1';
export const NEED = { standard: 60, commander: 100 } as const;
export const BASICS = new Set(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes', 'Snow-Covered Plains', 'Snow-Covered Island', 'Snow-Covered Swamp', 'Snow-Covered Mountain', 'Snow-Covered Forest']);

export function parseText(text: string): { main: Record<string, number>; side: Record<string, number>; commander: string | null } {
  const main: Record<string, number> = {}, side: Record<string, number> = {};
  let commander: string | null = null;
  let sec: 'main' | 'side' | 'cmd' = 'main';
  for (const raw of text.split(/\r?\n/)) {
    const l = raw.trim();
    if (!l) continue;
    const h = l.replace(/^\/\/\s*/, '').toLowerCase();
    if (/^(commander|commanders)\b/.test(h) && !/^\d/.test(l)) { sec = 'cmd'; continue; }
    if (/^(deck|main|maindeck|mainboard)\b/.test(h) && !/^\d/.test(l)) { sec = 'main'; continue; }
    if (/^(sideboard|side|sb)\b/.test(h) && !/^\d/.test(l)) { sec = 'side'; continue; }
    const m = l.match(/^(\d+)\s*[xX]?\s+(.+)$/);
    if (!m) continue;
    const n = m[2].replace(/\s+\([A-Z0-9]+\)\s+\S+$/, '').trim();
    if (sec === 'cmd') commander = n;
    else {
      const t = sec === 'side' ? side : main;
      t[n] = (t[n] ?? 0) + +m[1];
    }
  }
  return { main, side, commander };
}
export function toText(d: DeckData, format: string): string {
  const lines: string[] = [];
  if (d.commander) lines.push('Commander', `1 ${d.commander}`, '');
  lines.push('Deck', ...Object.entries(d.main).map(([n, q]) => `${q} ${n}`));
  if (format !== 'commander' && Object.keys(d.side ?? {}).length) lines.push('', 'Sideboard', ...Object.entries(d.side).map(([n, q]) => `${q} ${n}`));
  return lines.join('\n');
}
export function count(d: DeckData) {
  return Object.values(d.main).reduce((a, b) => a + b, 0) + (d.commander ? 1 : 0);
}

export const ART = (n: string) => 'https://api.scryfall.com/cards/named?exact=' + encodeURIComponent(n).replace(/'/g, '%27') + '&format=image&version=art_crop';
const FACE: Record<string, { face: string; colors: string[] }> = {
  'starter-red': { face: 'Goblin Guide', colors: ['R'] },
  'starter-green': { face: 'Leatherback Baloth', colors: ['G'] },
  'starter-uw': { face: 'Serra Angel', colors: ['W', 'U'] },
};

function summarize(id: string, name: string, format: 'standard' | 'commander', data: DeckData, extra: Partial<DeckSummary> = {}): DeckSummary {
  const n = count(data);
  const need = NEED[format];
  const valid = format === 'commander' ? n === 100 && !!data.commander : n >= 60;
  const face = extra.face ?? data.commander ?? Object.keys(data.main).find((k) => !BASICS.has(k)) ?? null;
  return { id, name, format, face, faceArt: face ? ART(face) : null, colors: extra.colors ?? [], cards: n, valid, why: valid ? null : `${n} of ${need} cards`, updated: '', data, local: true, ...extra };
}

interface LocalDeck { id: string; name: string; format: 'standard' | 'commander'; data: DeckData; updated: number }
function readAll(): LocalDeck[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
    // migrate the old text decks
    const old = JSON.parse(localStorage.getItem(OLD) ?? '[]') as { id: string; name: string; text: string; updated: number }[];
    const conv = old.map((o) => {
      const p = parseText(o.text);
      return { id: o.id, name: o.name, format: (p.commander ? 'commander' : 'standard') as 'standard' | 'commander', data: { ...p, link: null }, updated: o.updated };
    });
    localStorage.setItem(KEY, JSON.stringify(conv));
    return conv;
  } catch {
    return [];
  }
}
export function localDecks(): DeckSummary[] {
  const mine = readAll().map((d) => summarize(d.id, d.name, d.format, d.data, { updated: new Date(d.updated).toISOString() }));
  const starters = STARTERS.map((s) => {
    const p = parseText(s.text);
    return summarize(s.id, s.name.replace(/^Starter — /, ''), 'standard', { ...p, link: null }, FACE[s.id] ?? {});
  });
  return [...mine, ...starters];
}
export function saveLocal(d: { id?: string; name: string; format: 'standard' | 'commander'; data: DeckData }): string {
  const all = readAll();
  const id = d.id && !d.id.startsWith('starter-') ? d.id : `local-${Date.now().toString(36)}`;
  const row = { id, name: d.name, format: d.format, data: d.data, updated: Date.now() };
  const i = all.findIndex((x) => x.id === id);
  if (i >= 0) all[i] = row;
  else all.unshift(row);
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {}
  return id;
}
export function deleteLocal(id: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify(readAll().filter((d) => d.id !== id)));
  } catch {}
}
export function customLocal(): LocalDeck[] {
  return readAll();
}
export function starterData(): { name: string; format: 'standard'; data: DeckData }[] {
  return STARTERS.map((s) => ({ name: s.name.replace(/^Starter — /, ''), format: 'standard', data: { ...parseText(s.text), link: null } }));
}

/** After signing in: copy decks made as a guest into the account, then forget the browser copies. */
let migrating = false;
export async function migrateToAccount() {
  if (migrating) return;
  const mine = readAll();
  if (!mine.length) return;
  migrating = true;
  let n = 0;
  try {
    for (const d of mine) {
      try {
        await request({ t: 'decks.save', deck: { name: d.name, format: d.format, ...d.data } }, true);
        deleteLocal(d.id);
        n++;
      } catch {
        break;
      }
    }
  } finally {
    migrating = false;
  }
  if (n) toast(`${n} deck${n === 1 ? '' : 's'} from this browser saved to your account`);
}
