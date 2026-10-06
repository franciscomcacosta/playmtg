/**
 * Manaforge server: card database API, accounts/economy, matchmaking, Draft Night and authoritative game rooms.
 *   dev:  npm run dev            (server on :8787, Vite client on :5173 proxies /api and /ws)
 *   prod: npm run build && npm start   (serves dist/ and the API on PORT, default 8787)
 *
 * Environment (.env next to package.json, all optional):
 *   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY  → accounts in Supabase (otherwise data/meta.json)
 *   PORT                                                        → default 8787
 *   ALLOW_ORIGIN                                                → CORS origin for the website (default *)
 */
import http from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { loadCardDb, parseDeckText, searchCards, findToken, norm } from './cards';
import { setEngineHooks } from '../src/engine/engine';
import { cardAutomation } from '../src/engine/oracle';
import type { CardDef } from '../src/engine/cardTypes';
import { Rooms } from './rooms';
import { Accounts } from './meta/accounts';
import { FileStore, SupabaseStore, type Store } from './meta/store';
import { Hub, MODES, catalog, type Auth } from './meta/hub';
import { devAuth, supabaseAuth } from './meta/auth';
import { warmAiDecks } from './meta/aidecks';
import { Drafts } from './draft';
import { browse, fetchDeck, resolve } from './browse';

// --- .env (tiny loader, no dependency)
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const PORT = +(process.env.PORT ?? 8787);
// one origin, a comma-separated list (e.g. https://playmtg.online,https://www.playmtg.online), or *
const ORIGINS = (process.env.ALLOW_ORIGIN ?? '*').split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean);
const allowOrigin = (o: string) => (ORIGINS.includes('*') ? '*' : ORIGINS.includes(o) ? o : ORIGINS[0]);
const db = loadCardDb();
setEngineHooks({ findToken: (n, p, t, c) => findToken(db, n, p, t, c), findCard: (name) => db.byName.get(norm(name)) });

async function makeStore(): Promise<{ store: Store; auth: Auth }> {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    console.log(`[manaforge] Accounts: Supabase (${new URL(url).host})`);
    return { store: new SupabaseStore(sb), auth: supabaseAuth(sb) };
  }
  const fs = new FileStore();
  console.log(`[manaforge] Accounts: local file ${fs.file} (set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to use Supabase)`);
  return { store: fs, auth: devAuth(fs) };
}

const { store, auth } = await makeStore();
const rooms = new Rooms(db);
const accounts = new Accounts(store);
const hub = new Hub(db, rooms, accounts, store, auth);
const drafts = new Drafts(db, rooms, accounts);
drafts.hub = hub;
hub.drafts = drafts;
warmAiDecks(db);
drafts.warm();

// ------------------------------------------------------------------------------------------
// HTTP
// ------------------------------------------------------------------------------------------
const DIST = path.resolve('dist');
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2', '.webp': 'image/webp', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
};
function json(res: http.ServerResponse, code: number, body: any) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': allowOrigin(String(res.req?.headers.origin ?? '')), 'Access-Control-Allow-Headers': 'content-type', Vary: 'Origin' });
  res.end(JSON.stringify(body));
}
function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 2e6) reject(new Error('too large'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
function slim(c: CardDef) {
  return { ...c, legal: undefined, auto: cardAutomation(c) };
}
const list = (v: string | null) => (v ? v.split(',').filter(Boolean) : []);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  try {
    if (req.method === 'OPTIONS') return json(res, 204, {});
    if (url.pathname === '/api/status') return json(res, 200, { cards: db.cards.length, tokens: db.tokens.length, built: db.built, rooms: rooms.rooms.size });
    if (url.pathname === '/api/config')
      return json(res, 200, { auth: auth.kind, supabaseUrl: auth.kind === 'supabase' ? process.env.SUPABASE_URL : null, supabaseAnonKey: auth.kind === 'supabase' ? process.env.SUPABASE_ANON_KEY ?? null : null });
    if (url.pathname === '/api/catalog') return json(res, 200, catalog(hub));
    if (url.pathname === '/api/modes') return json(res, 200, { modes: MODES, stats: hub.stats() });
    if (url.pathname === '/api/cards/search') {
      const q = url.searchParams.get('q') ?? '';
      const r = searchCards(db, { q, limit: Math.min(+(url.searchParams.get('limit') ?? 60), 200), offset: +(url.searchParams.get('offset') ?? 0) });
      return json(res, 200, { total: r.total, cards: r.cards.map(slim) });
    }
    if (url.pathname === '/api/cards/browse') {
      const sp = url.searchParams;
      return json(res, 200, browse(db, {
        q: sp.get('q') ?? '', colors: list(sp.get('colors')), mode: sp.get('mode') === 'only' ? 'only' : 'any', mv: list(sp.get('mv')).map(Number), types: list(sp.get('types')),
        rarity: list(sp.get('rarity')), names: sp.get('names') ? JSON.parse(sp.get('names')!) : undefined, sort: sp.get('sort') ?? 'mv', offset: +(sp.get('offset') ?? 0), limit: +(sp.get('limit') ?? 120), format: sp.get('format') ?? undefined,
      }));
    }
    if (url.pathname === '/api/cards/resolve' && req.method === 'POST') {
      const { names } = JSON.parse(await readBody(req));
      return json(res, 200, { results: resolve(db, Array.isArray(names) ? names : []) });
    }
    if (url.pathname === '/api/cards/named') {
      const r = searchCards(db, { q: `"${url.searchParams.get('name') ?? ''}"`, limit: 1 });
      return r.cards[0] ? json(res, 200, slim(r.cards[0])) : json(res, 404, { error: 'not found' });
    }
    if (url.pathname === '/api/decks/parse' && req.method === 'POST') {
      const { text } = JSON.parse(await readBody(req));
      const p = parseDeckText(db, String(text ?? ''));
      return json(res, 200, { main: p.main.map((x) => ({ count: x.count, card: slim(x.card) })), side: p.side.map((x) => ({ count: x.count, card: slim(x.card) })), unknown: p.unknown, total: p.total });
    }
    if (url.pathname === '/api/decks/fetch' && req.method === 'POST') {
      const { url: link } = JSON.parse(await readBody(req));
      try {
        return json(res, 200, await fetchDeck(String(link ?? '')));
      } catch (e: any) {
        return json(res, 400, { error: e.message });
      }
    }
    if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'unknown endpoint' });

    // static files (production, or when the website is served from this PC)
    if (existsSync(DIST)) {
      let file = path.join(DIST, decodeURIComponent(url.pathname));
      if (!file.startsWith(DIST)) return json(res, 403, { error: 'forbidden' });
      if (!existsSync(file) || statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': file.endsWith('.html') ? 'no-cache' : 'public, max-age=31536000' });
      return res.end(readFileSync(file));
    }
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('PlayMTG server running. In development open the Vite client at http://localhost:5173');
  } catch (e: any) {
    json(res, 500, { error: e.message });
  }
});

const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws) => hub.connection(ws));

server.on('error', (e: any) => {
  if (e.code === 'EADDRINUSE') {
    console.log(`\n[playmtg] The game server is already running in another window (port ${PORT} is taken).`);
    console.log('[playmtg] Use that window, or close it and start this one again.\n');
    process.exit(1);
  }
  throw e;
});
wss.on('error', () => {});
server.listen(PORT, () => console.log(`[manaforge] Listening on http://localhost:${PORT}`));
process.on('SIGINT', () => {
  (store as any).flushNow?.();
  process.exit(0);
});
