/**
 * Downloads Scryfall's "Oracle Cards" bulk file (one object per unique card, English)
 * and writes a compact database to data/cards.json that the server loads at startup.
 *
 *   npm run cards            -> download latest bulk file
 *   npm run cards -- file.gz -> use an already-downloaded .jsonl.gz / .json file
 *
 * Card data and images © Wizards of the Coast, provided by Scryfall (https://scryfall.com).
 */
import { createReadStream, createWriteStream, existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import type { CardDef, CardFace } from '../src/engine/cardTypes';

const DATA_DIR = path.resolve('data');
const UA = { 'User-Agent': 'ManaforgeTable/0.1 (fan-made tabletop)', Accept: 'application/json' };

// Layouts that are not real, deck-buildable game cards.
const EXCLUDED_LAYOUTS = new Set(['art_series', 'vanguard', 'scheme', 'planar', 'emblem']);
const TOKEN_LAYOUTS = new Set(['token', 'double_faced_token']);

async function download(): Promise<string> {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  console.log('Fetching Scryfall bulk-data index…');
  const idx = await fetch('https://api.scryfall.com/bulk-data', { headers: UA }).then((r) => r.json());
  const entry = idx.data.find((d: any) => d.type === 'oracle_cards');
  if (!entry) throw new Error('oracle_cards bulk entry not found');
  const url: string = entry.jsonl_download_uri ?? entry.download_uri;
  const file = path.join(DATA_DIR, url.endsWith('.gz') ? 'oracle.jsonl.gz' : 'oracle.json');
  console.log(`Downloading ${url}`);
  const res = await fetch(url, { headers: UA });
  if (!res.ok || !res.body) throw new Error(`Download failed: ${res.status}`);
  await pipeline(Readable.fromWeb(res.body as any), createWriteStream(file));
  console.log(`Saved ${(statSync(file).size / 1e6).toFixed(1)} MB to ${file}`);
  return file;
}

async function* readCards(file: string): AsyncGenerator<any> {
  if (file.endsWith('.json')) {
    // Legacy array format: load it whole.
    const { readFileSync } = await import('node:fs');
    for (const c of JSON.parse(readFileSync(file, 'utf8'))) yield c;
    return;
  }
  let stream: NodeJS.ReadableStream = createReadStream(file);
  if (file.endsWith('.gz')) stream = stream.pipe(createGunzip());
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    const t = line.trim().replace(/,$/, '');
    if (!t || t === '[' || t === ']') continue;
    yield JSON.parse(t);
  }
}

function img(c: any, size = 'normal'): string | undefined {
  return c?.image_uris?.[size];
}

function compact(c: any): CardDef {
  const faces: CardFace[] | undefined = c.card_faces?.map((f: any) => ({
    name: f.name,
    manaCost: f.mana_cost ?? '',
    typeLine: f.type_line ?? '',
    oracle: f.oracle_text ?? '',
    power: f.power,
    toughness: f.toughness,
    loyalty: f.loyalty,
    defense: f.defense,
    colors: f.colors,
    image: img(f),
  }));
  const legal = Object.entries(c.legalities ?? {})
    .filter(([, v]) => v === 'legal' || v === 'restricted')
    .map(([k]) => k);
  const def: CardDef = {
    id: c.oracle_id ?? c.card_faces?.[0]?.oracle_id ?? c.id,
    name: c.name,
    manaCost: c.mana_cost ?? faces?.[0]?.manaCost ?? '',
    cmc: c.cmc ?? 0,
    typeLine: c.type_line ?? faces?.map((f) => f.typeLine).join(' // ') ?? '',
    oracle: c.oracle_text ?? faces?.map((f) => f.oracle).join('\n//\n') ?? '',
    power: c.power ?? faces?.[0]?.power,
    toughness: c.toughness ?? faces?.[0]?.toughness,
    loyalty: c.loyalty ?? faces?.[0]?.loyalty,
    defense: c.defense ?? faces?.[0]?.defense,
    colors: c.colors ?? faces?.[0]?.colors ?? [],
    colorIdentity: c.color_identity ?? [],
    keywords: c.keywords ?? [],
    layout: c.layout,
    produced: c.produced_mana,
    faces,
    image: img(c) ?? faces?.[0]?.image,
    art: img(c, 'art_crop') ?? c.card_faces?.[0]?.image_uris?.art_crop,
    set: c.set,
    rarity: c.rarity,
    legal,
  };
  if (TOKEN_LAYOUTS.has(c.layout) || c.type_line?.startsWith('Token')) def.token = true;
  // Strip undefined keys to keep the file small.
  for (const k of Object.keys(def) as (keyof CardDef)[]) if (def[k] === undefined) delete def[k];
  return def;
}

async function main() {
  const arg = process.argv[2];
  const file = arg ?? (await download());
  const cards: CardDef[] = [];
  const tokens: CardDef[] = [];
  let skipped = 0;
  for await (const c of readCards(file)) {
    if (c.lang && c.lang !== 'en') { skipped++; continue; }
    if (EXCLUDED_LAYOUTS.has(c.layout)) { skipped++; continue; }
    const def = compact(c);
    (def.token ? tokens : cards).push(def);
  }
  cards.sort((a, b) => a.name.localeCompare(b.name));
  writeFileSync(path.join(DATA_DIR, 'cards.json'), JSON.stringify({ built: new Date().toISOString(), cards, tokens }));
  console.log(`Wrote ${cards.length} cards and ${tokens.length} tokens (skipped ${skipped}) to data/cards.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
