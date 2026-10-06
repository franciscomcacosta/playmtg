// The realtime hub: one WebSocket per browser tab. Handles sign-in, the account API (shop, quests, login calendar,
// decks), friends and presence, notifications, challenges, matchmaking, spectating, Draft Night and the original
// room protocol (create / join / rejoin / action …).
import { STARTERS } from '../../src/client/decks';
import { WebSocket } from 'ws';
import type { CardDb } from '../cards';
import { norm } from '../cards';
import { Accounts, Err, type Fx, type Profile, type GameResult } from './accounts';
import { ITEM, ITEMS, TYPE_DESC, BUNDLES, TIERS, dailyStock, featuredBundle, nextReset, rankHint, DRAFT, type ItemType } from './catalog';
import { uuid, type DeckRow, type NoteRow, type Store } from './store';
import { Rooms, send, type Cosmetics, type Format, type Room, type Seat } from '../rooms';
import { aiDeckFor, aiPoolReady } from './aidecks';
import { dispatch } from '../../src/engine/engine';
import type { Action, GameState, PlayerIdx } from '../../src/engine/types';
import type { Drafts } from '../draft';

export interface AuthUser { id: string; name: string }
export interface Auth {
  kind: 'supabase' | 'dev';
  verify(msg: any): Promise<AuthUser | null>;
}

interface Sess {
  ws: WebSocket;
  id: number;
  user: AuthUser | null;
  activity: string;
  lastInput: number;
  room: Room | null;
  seat: number;
  watching: Room | null;
}
interface QEntry { sess: Sess; mode: string; format: Format; deckText: string; deckName: string; face?: string; since: number; ranked: boolean; rankScore: number }

export const MODES: Record<string, { name: string; format: Format | 'any'; ranked?: boolean; draft?: boolean; botAfter?: number }> = {
  quick: { name: 'Quick Match', format: 'any', botAfter: 20000 },
  standard: { name: 'Standard', format: 'constructed', botAfter: 25000 },
  cmd: { name: 'Commander 1v1', format: 'commander', botAfter: 25000 },
  rcmd: { name: 'Ranked Commander', format: 'commander', ranked: true },
  draft: { name: 'Draft Night', format: 'constructed', draft: true },
};

const RANK_SCORE = (r: any) => (['bronze', 'silver', 'gold', 'platinum', 'mythic'].indexOf(r.tier) * 100 + (4 - r.division) * 20 + r.pips * 5 + (r.mythic ?? 0) / 10);

export class Hub {
  db: CardDb;
  rooms: Rooms;
  acc: Accounts;
  store: Store;
  auth: Auth;
  drafts!: Drafts;
  sessions = new Set<Sess>();
  byUser = new Map<string, Set<Sess>>();
  queue: QEntry[] = [];
  waits: Record<string, number[]> = {};
  lastSeen = new Map<string, number>();
  private seq = 1;
  private presenceSig = new Map<string, string>();

  constructor(db: CardDb, rooms: Rooms, acc: Accounts, store: Store, auth: Auth) {
    this.db = db;
    this.rooms = rooms;
    this.acc = acc;
    this.store = store;
    this.auth = auth;
    acc.onChange = (id, fx) => this.pushMe(id, fx);
    rooms.onGameOver = (room, game) => this.gameOver(room, game);
    setInterval(() => this.tickQueue(), 1000).unref?.();
    setInterval(() => this.tickPresence(), 4000).unref?.();
  }

  // ------------------------------------------------------------------------------------ helpers
  art(card?: string | null): string | null {
    if (!card) return null;
    const c = this.db.byName.get(norm(card));
    return (c as any)?.art ?? c?.image ?? null;
  }
  image(card?: string | null): string | null {
    if (!card) return null;
    return this.db.byName.get(norm(card))?.image ?? null;
  }
  itemView(id: string) {
    const it = ITEM.get(id);
    if (!it) return null;
    return { ...it, artUrl: this.art(it.art), desc: TYPE_DESC[it.type] };
  }
  cosmeticsOf(p: Profile | null): Cosmetics | undefined {
    if (!p) return undefined;
    const e = p.data.equipped;
    const v = (t: ItemType) => (e[t] ? this.itemView(e[t]!) : undefined);
    return { sleeve: v('sleeve'), back: v('back'), mat: v('mat'), avatar: v('avatar') };
  }
  toUser(id: string, msg: any) {
    for (const s of this.byUser.get(id) ?? []) send(s.ws, msg);
  }
  online(id: string) {
    return (this.byUser.get(id)?.size ?? 0) > 0;
  }
  async pushMe(id: string, fx: Fx[] = []) {
    const p = this.acc.cache.get(id);
    if (!p) return;
    this.toUser(id, { t: 'me', me: this.acc.snapshot(p), fx });
  }

  // ------------------------------------------------------------------------------------ connection
  connection(ws: WebSocket) {
    const s: Sess = { ws, id: this.seq++, user: null, activity: 'lobby', lastInput: Date.now(), room: null, seat: -1, watching: null };
    this.sessions.add(s);
    ws.on('message', async (raw) => {
      let msg: any;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return send(ws, { t: 'error', message: 'Bad message' });
      }
      s.lastInput = Date.now();
      try {
        await this.handle(s, msg);
      } catch (e: any) {
        if (e instanceof Err) send(ws, { t: 'error', message: e.message, rid: msg.rid });
        else {
          console.error('[hub]', msg?.t, e);
          send(ws, { t: 'error', message: `Server error: ${e.message}`, rid: msg.rid });
        }
      }
    });
    ws.on('close', () => {
      this.sessions.delete(s);
      this.leaveQueue(s);
      if (s.user) {
        const set = this.byUser.get(s.user.id);
        set?.delete(s);
        if (!set?.size) {
          this.byUser.delete(s.user.id);
          this.lastSeen.set(s.user.id, Date.now());
        }
      }
      if (s.watching) s.watching.spectators.delete(ws);
      const r = s.room;
      if (r && s.seat >= 0) {
        const seat = r.seats[s.seat];
        seat?.sockets.delete(ws);
        if (r.game && seat && !seat.sockets.size) r.game.players[s.seat].connected = false;
        this.rooms.broadcast(r);
      }
      this.drafts?.disconnect(s);
    });
  }

  ok(s: Sess, msg: any, extra: any = {}) {
    send(s.ws, { t: 'ok', rid: msg.rid, ...extra });
  }
  need(s: Sess): AuthUser {
    if (!s.user) throw new Err('Sign in first.');
    return s.user;
  }

  async handle(s: Sess, msg: any) {
    switch (msg.t) {
      // ---------------------------------------------------------------- session
      case 'hello': {
        const u = await this.auth.verify(msg);
        if (s.user && (!u || u.id !== s.user.id)) this.signOut(s);
        if (!u) {
          send(s.ws, { t: 'guest', auth: this.auth.kind, rid: msg.rid });
          break;
        }
        s.user = u;
        if (!this.byUser.has(u.id)) this.byUser.set(u.id, new Set());
        this.byUser.get(u.id)!.add(s);
        const p = await this.acc.load(u.id, u.name);
        await this.seedStarters(u.id);
        send(s.ws, { t: 'me', me: this.acc.snapshot(p), fx: [], rid: msg.rid });
        await this.sendNotes(u.id);
        await this.sendFriends(u.id);
        await this.sendDecks(s);
        this.seedCommander(u.id).catch(() => {});
        const seat = this.rooms.findUser(u.id);
        if (seat) send(s.ws, { t: 'inGame', code: seat.room.code, token: seat.room.seats[seat.seat]!.token, mode: seat.room.mode });
        this.drafts.hello(s, u.id);
        break;
      }
      case 'signout':
        this.signOut(s);
        send(s.ws, { t: 'guest', auth: this.auth.kind });
        break;
      case 'activity':
        s.activity = String(msg.a ?? 'lobby').slice(0, 40);
        break;
      case 'ping':
        send(s.ws, { t: 'pong' });
        break;

      // ---------------------------------------------------------------- account
      case 'me.rename': {
        const u = this.need(s);
        const name = await this.acc.rename(u.id, String(msg.name ?? ''));
        u.name = name;
        this.ok(s, msg, { name });
        await this.pushMe(u.id);
        break;
      }
      case 'shop.buy':
        await this.acc.buyItem(this.need(s).id, String(msg.item));
        this.ok(s, msg);
        break;
      case 'shop.bundle':
        await this.acc.buyBundle(this.need(s).id, String(msg.id));
        this.ok(s, msg);
        break;
      case 'shop.equip':
        await this.acc.equip(this.need(s).id, String(msg.item));
        this.ok(s, msg);
        break;
      case 'shop.unequip':
        await this.acc.unequip(this.need(s).id, msg.type as ItemType);
        this.ok(s, msg);
        break;
      case 'treasury.buy': {
        const r = await this.acc.treasury(this.need(s).id, +msg.tier);
        this.ok(s, msg, r);
        break;
      }
      case 'login.claim': {
        const r = await this.acc.claimLogin(this.need(s).id);
        this.ok(s, msg, r);
        break;
      }
      case 'quest.claim': {
        const u = this.need(s);
        await this.acc.claimQuest(u.id, String(msg.id));
        // the matching "quest complete" notification is done with
        for (const n of await this.store.notes(u.id)) if (n.kind === 'quest' && n.data?.questId === msg.id) await this.store.deleteNote(u.id, n.id);
        await this.sendNotes(u.id);
        this.ok(s, msg);
        break;
      }
      case 'quest.reroll':
        await this.acc.rerollQuest(this.need(s).id, String(msg.id));
        this.ok(s, msg);
        break;

      // ---------------------------------------------------------------- decks
      case 'decks.list':
        await this.sendDecks(s);
        if (msg.rid != null) this.ok(s, msg);
        break;
      case 'decks.save': {
        const u = this.need(s);
        const d = msg.deck ?? {};
        const id = typeof d.id === 'string' && /^[0-9a-f-]{36}$/.test(d.id) ? d.id : uuid();
        const existing = (await this.store.listDecks(u.id)).find((x) => x.id === id);
        if (!existing && (await this.store.listDecks(u.id)).length >= 200) throw new Err('You have 200 decks. Delete one first.');
        const row: DeckRow = { id, owner: u.id, name: String(d.name ?? 'Untitled deck').slice(0, 60), format: d.format === 'commander' ? 'commander' : 'standard', data: this.cleanDeck(d), updated_at: new Date().toISOString() };
        await this.store.saveDeck(row);
        this.ok(s, msg, { id });
        await this.sendDecks(s, true);
        break;
      }
      case 'decks.delete': {
        const u = this.need(s);
        await this.store.deleteDeck(u.id, String(msg.id));
        this.ok(s, msg);
        await this.sendDecks(s, true);
        break;
      }

      // ---------------------------------------------------------------- friends & notifications
      case 'friends.add': {
        const u = this.need(s);
        const other = await this.store.getProfileByName(String(msg.name ?? ''));
        if (!other) throw new Err('No player with that name.');
        if (other.id === u.id) throw new Err('That is you.');
        const rows = await this.store.friends(u.id);
        const ex = rows.find((f) => f.a === other.id || f.b === other.id);
        if (ex?.status === 'accepted') throw new Err(`${other.name} is already your friend.`);
        if (ex && ex.a === other.id) {
          // they asked first: accept
          await this.store.setFriend({ a: other.id, b: u.id, status: 'accepted' });
        } else {
          await this.store.setFriend({ a: u.id, b: other.id, status: 'pending' });
          await this.note(other.id, 'friend', { from: u.id, fromName: u.name });
        }
        await this.sendFriends(u.id);
        await this.sendFriends(other.id);
        this.ok(s, msg, { name: other.name });
        break;
      }
      case 'friends.accept':
      case 'friends.decline': {
        const u = this.need(s);
        const from = String(msg.id);
        const rows = await this.store.friends(u.id);
        const ex = rows.find((f) => f.a === from && f.b === u.id && f.status === 'pending');
        if (!ex) throw new Err('That request is gone.');
        if (msg.t === 'friends.accept') await this.store.setFriend({ a: from, b: u.id, status: 'accepted' });
        else await this.store.deleteFriend(from, u.id);
        for (const n of await this.store.notes(u.id)) if (n.kind === 'friend' && n.data?.from === from) await this.store.deleteNote(u.id, n.id);
        await this.sendNotes(u.id);
        await this.sendFriends(u.id);
        await this.sendFriends(from);
        this.ok(s, msg);
        break;
      }
      case 'friends.remove': {
        const u = this.need(s);
        await this.store.deleteFriend(u.id, String(msg.id));
        await this.sendFriends(u.id);
        await this.sendFriends(String(msg.id));
        this.ok(s, msg);
        break;
      }
      case 'notes.seen': {
        const u = this.need(s);
        for (const n of await this.store.notes(u.id)) if (!n.seen) await this.store.updateNote({ ...n, seen: true });
        await this.sendNotes(u.id);
        break;
      }
      case 'notes.dismiss': {
        const u = this.need(s);
        const n = (await this.store.notes(u.id)).find((x) => x.id === msg.id);
        if (n?.kind === 'friend') return this.handle(s, { t: 'friends.decline', id: n.data.from, rid: msg.rid });
        if (n?.kind === 'challenge') this.toUser(n.data.from, { t: 'toast', text: `${u.name} declined your challenge` });
        await this.store.deleteNote(u.id, String(msg.id));
        await this.sendNotes(u.id);
        this.ok(s, msg);
        break;
      }

      // ---------------------------------------------------------------- challenges
      case 'challenge.send': {
        const u = this.need(s);
        const to = String(msg.to);
        const fr = (await this.store.friends(u.id)).find((f) => (f.a === to || f.b === to) && f.status === 'accepted');
        if (!fr) throw new Err('You can only challenge friends.');
        if (!this.online(to)) throw new Err('They are offline.');
        const deck = await this.deckText(s, msg);
        const mode = MODES[msg.mode] && !MODES[msg.mode].ranked && !MODES[msg.mode].draft ? msg.mode : 'cmd';
        const chk = this.rooms.checkDeck(deck.text, mode);
        if (!chk.ok) throw new Err(chk.why!);
        const p = await this.acc.load(u.id);
        await this.note(to, 'challenge', { from: u.id, fromName: u.name, mode, modeName: MODES[mode].name, deckText: deck.text, deckName: deck.name, art: this.art(ITEM.get(p.data.equipped.avatar ?? '')?.art) });
        this.ok(s, msg);
        break;
      }
      case 'challenge.accept': {
        const u = this.need(s);
        const n = (await this.store.notes(u.id)).find((x) => x.id === msg.id && x.kind === 'challenge');
        if (!n) throw new Err('That challenge is gone.');
        await this.store.deleteNote(u.id, n.id);
        await this.sendNotes(u.id);
        const from = n.data.from as string;
        const fromSess = [...(this.byUser.get(from) ?? [])][0];
        if (!fromSess) throw new Err('They went offline.');
        const deck = await this.deckText(s, { ...msg, mode: n.data.mode });
        const chk = this.rooms.checkDeck(deck.text, n.data.mode);
        if (!chk.ok) throw new Err(`Your deck: ${chk.why}`);
        const chk2 = this.rooms.checkDeck(n.data.deckText, n.data.mode);
        await this.makeMatch(n.data.mode, [
          { sess: fromSess, deck: chk2.deck, deckName: n.data.deckName },
          { sess: s, deck: chk.deck, deckName: deck.name },
        ], chk.format, 'Challenge accepted');
        this.ok(s, msg);
        break;
      }

      // ---------------------------------------------------------------- matchmaking
      case 'queue.join': {
        const mode = String(msg.mode);
        const m = MODES[mode];
        if (!m) throw new Err('Unknown game mode.');
        if (m.draft) return this.drafts.join(s, msg);
        if (m.ranked && !s.user) throw new Err('Sign in to play ranked.');
        if (s.room?.game && !s.room.game.over) throw new Err('Finish or leave your current game first.');
        this.leaveQueue(s);
        const deck = await this.deckText(s, msg);
        const chk = this.rooms.checkDeck(deck.text, mode);
        if (!chk.ok) throw new Err(chk.why!);
        let rankScore = 0;
        if (m.ranked && s.user) rankScore = RANK_SCORE((await this.acc.load(s.user.id)).data.rank);
        this.queue.push({ sess: s, mode, format: chk.format, deckText: deck.text, deckName: deck.name, face: deck.face, since: Date.now(), ranked: !!m.ranked, rankScore });
        send(s.ws, { t: 'queue', state: { mode, since: Date.now(), ranked: !!m.ranked }, rid: msg.rid });
        break;
      }
      case 'queue.leave':
        this.leaveQueue(s);
        this.drafts.leaveQueue(s);
        send(s.ws, { t: 'queue', state: null, rid: msg.rid });
        break;

      // ---------------------------------------------------------------- spectating
      case 'spectate': {
        const u = this.need(s);
        const target = String(msg.user);
        const fr = (await this.store.friends(u.id)).find((f) => (f.a === target || f.b === target) && f.status === 'accepted');
        if (!fr) throw new Err('You can only watch friends.');
        const where = this.rooms.findUser(target);
        if (!where) throw new Err('They are not in a game right now.');
        if (s.watching) s.watching.spectators.delete(s.ws);
        s.watching = where.room;
        where.room.spectators.add(s.ws);
        this.ok(s, msg);
        this.rooms.broadcast(where.room);
        break;
      }
      case 'spectate.leave':
        if (s.watching) s.watching.spectators.delete(s.ws);
        s.watching = null;
        send(s.ws, { t: 'left' });
        break;

      // ---------------------------------------------------------------- draft night
      default:
        if (typeof msg.t === 'string' && msg.t.startsWith('draft.')) {
          await this.drafts.handle(s, msg);
          if (msg.rid != null) this.ok(s, msg);
          return;
        }
        return this.legacy(s, msg);
    }
  }

  signOut(s: Sess) {
    if (!s.user) return;
    const set = this.byUser.get(s.user.id);
    set?.delete(s);
    if (!set?.size) this.byUser.delete(s.user.id);
    s.user = null;
  }

  // ------------------------------------------------------------------------------------ decks
  /** New accounts start with the three starter decks (once; deleting them later is fine). */
  async seedStarters(userId: string) {
    const p = this.acc.cache.get(userId);
    if (!p || (p.data as any).seeded) return;
    const have = await this.store.listDecks(userId);
    if (!have.length) {
      for (const st of STARTERS) {
        const main: Record<string, number> = {};
        for (const line of st.text.split(/\r?\n/)) {
          const m = line.trim().match(/^(\d+)\s+(.+)$/);
          if (m) main[m[2]] = (main[m[2]] ?? 0) + +m[1];
        }
        await this.store.saveDeck({ id: uuid(), owner: userId, name: st.name.replace(/^Starter — /, ''), format: 'standard', data: { main, side: {}, commander: null, link: null }, updated_at: new Date().toISOString() });
      }
    }
    await this.acc.mutate(userId, (pp) => {
      (pp.data as any).seeded = true;
    });
  }
  /** One ready Commander deck per account, so Commander and Ranked can be played straight away. Built from the AI
   *  deck pool once it has warmed up (never blocks a sign-in). */
  async seedCommander(userId: string, tries = 0) {
    const p = this.acc.cache.get(userId);
    if (!p || (p.data as any).seededCmd) return;
    if (!aiPoolReady()) {
      // the pool is still warming up (first minute after start): try again shortly
      if (tries < 12) setTimeout(() => this.seedCommander(userId, tries + 1).catch(() => {}), 10000).unref?.();
      return;
    }
    await this.acc.mutate(userId, (pp) => {
      (pp.data as any).seededCmd = true;
    });
    if ((await this.store.listDecks(userId)).some((d) => d.format === 'commander')) return;
    {
      try {
        const ai = aiDeckFor(this.db, 'commander', (t, f) => this.rooms.buildDeck(t, f));
        const main: Record<string, number> = {};
        let commander: string | null = null, sec = '';
        for (const line of ai.text.split(/\r?\n/)) {
          const l = line.trim();
          if (/^(Commander|Deck)$/.test(l)) sec = l;
          const m = l.match(/^(\d+)\s+(.+)$/);
          if (!m) continue;
          if (sec === 'Commander') commander = m[2];
          else main[m[2]] = (main[m[2]] ?? 0) + +m[1];
        }
        if (commander) await this.store.saveDeck({ id: uuid(), owner: userId, name: `${commander.split(',')[0]} Starter`, format: 'commander', data: { main, side: {}, commander, link: null }, updated_at: new Date().toISOString() });
      } catch (e) {
        console.error('[decks] commander starter', e);
      }
    }
    for (const ss of this.byUser.get(userId) ?? []) await this.sendDecks(ss);
  }
  cleanDeck(d: any) {
    const clean = (m: any) => Object.fromEntries(Object.entries(m ?? {}).filter(([k, v]) => typeof k === 'string' && k.length < 160 && Number.isInteger(v) && (v as number) > 0 && (v as number) <= 250).slice(0, 400));
    return {
      main: clean(d.main), side: clean(d.side), commander: typeof d.commander === 'string' ? d.commander.slice(0, 160) : null,
      link: d.link && typeof d.link.url === 'string' ? { site: String(d.link.site ?? '').slice(0, 40), url: d.link.url.slice(0, 400), text: String(d.link.text ?? '').slice(0, 20000) } : null,
    };
  }
  deckToText(row: { format: string; data: any }): string {
    const lines: string[] = [];
    if (row.data.commander) lines.push('Commander', `1 ${row.data.commander}`, '');
    lines.push('Deck');
    for (const [n, q] of Object.entries(row.data.main ?? {})) lines.push(`${q} ${n}`);
    if (row.format !== 'commander' && Object.keys(row.data.side ?? {}).length) {
      lines.push('', 'Sideboard');
      for (const [n, q] of Object.entries(row.data.side ?? {})) lines.push(`${q} ${n}`);
    }
    return lines.join('\n');
  }
  deckSummary(row: DeckRow) {
    const main = row.data.main ?? {};
    const count = Object.values(main).reduce((a: number, b: any) => a + b, 0) + (row.data.commander ? 1 : 0);
    const cols = new Set<string>();
    let face = row.data.commander as string | null;
    let best = -1;
    for (const n of Object.keys(main)) {
      const c = this.db.byName.get(norm(n));
      if (!c) continue;
      for (const x of c.colorIdentity ?? []) cols.add(x);
      if (!row.data.commander && !/\bLand\b/.test(c.typeLine) && c.cmc > best) { best = c.cmc; face = c.name; }
    }
    if (row.data.commander) for (const x of this.db.byName.get(norm(row.data.commander))?.colorIdentity ?? []) cols.add(x);
    const mode = row.format === 'commander' ? 'cmd' : 'standard';
    const chk = this.rooms.checkDeck(this.deckToText(row), mode);
    return { id: row.id, name: row.name, format: row.format, face, faceArt: this.art(face), colors: 'WUBRG'.split('').filter((c) => cols.has(c)), cards: count, valid: chk.ok, why: chk.why ?? null, updated: row.updated_at, data: row.data };
  }
  async sendDecks(s: Sess, all = false) {
    if (!s.user) return;
    const rows = await this.store.listDecks(s.user.id);
    const list = rows.map((r) => this.deckSummary(r));
    if (all) this.toUser(s.user.id, { t: 'decks', list });
    else send(s.ws, { t: 'decks', list });
  }
  /** The deck a request refers to: an account deck by id, or (for guests / starters) the list text itself. */
  async deckText(s: Sess, msg: any): Promise<{ text: string; name: string; face?: string }> {
    if (msg.deckId && s.user) {
      const row = (await this.store.listDecks(s.user.id)).find((d) => d.id === msg.deckId);
      if (row) return { text: this.deckToText(row), name: row.name, face: this.deckSummary(row).face ?? undefined };
    }
    if (typeof msg.deckText === 'string' && msg.deckText.trim()) return { text: msg.deckText.slice(0, 20000), name: String(msg.deckName ?? 'Deck').slice(0, 60), face: msg.face };
    throw new Err('Pick a deck first.');
  }

  // ------------------------------------------------------------------------------------ notifications & friends
  async note(userId: string, kind: string, data: any) {
    const n: NoteRow = { id: uuid(), user_id: userId, kind, data, seen: false, created_at: new Date().toISOString() };
    await this.store.addNote(n);
    await this.sendNotes(userId);
  }
  async sendNotes(userId: string) {
    if (!this.online(userId)) return;
    const list = (await this.store.notes(userId)).slice(0, 30);
    this.toUser(userId, { t: 'notes', list });
  }
  presence(id: string): { st: 'game' | 'online' | 'away' | 'off'; txt: string; code?: string } {
    const g = this.rooms.findUser(id);
    if (g) {
      const mode = g.room.mode ? MODES[g.room.mode]?.name ?? 'a game' : 'a game';
      return { st: 'game', txt: `In ${mode} · turn ${Math.max(1, g.room.game?.turn ?? 1)}`, code: g.room.code };
    }
    const ss = [...(this.byUser.get(id) ?? [])];
    if (ss.length) {
      const last = Math.max(...ss.map((x) => x.lastInput));
      const idle = Date.now() - last;
      if (idle > 5 * 60000) return { st: 'away', txt: `Away · ${Math.round(idle / 60000)} min` };
      const a = ss.sort((x, y) => y.lastInput - x.lastInput)[0].activity;
      const txt = a === 'decks' ? 'Building a deck' : a === 'shop' ? 'In the shop' : a === 'draft' ? 'Drafting' : 'In the lobby';
      return { st: 'online', txt };
    }
    const seen = this.lastSeen.get(id);
    if (!seen) return { st: 'off', txt: 'Offline' };
    const m = Math.round((Date.now() - seen) / 60000);
    return { st: 'off', txt: `Last seen ${m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} days`} ago` };
  }
  async friendList(userId: string) {
    const rows = await this.store.friends(userId);
    const out: any[] = [];
    for (const f of rows) {
      const other = f.a === userId ? f.b : f.a;
      const p = this.acc.cache.get(other) ?? (await this.store.getProfile(other));
      if (!p) continue;
      const data: any = (p as any).data ?? {};
      const avatar = ITEM.get(data.equipped?.avatar ?? 'a-jace');
      out.push({ id: other, name: p.name, art: this.art(avatar?.art), ...(f.status === 'accepted' ? this.presence(other) : { st: 'off', txt: f.a === userId ? 'Request sent' : 'Wants to be friends' }), pending: f.status === 'pending' ? (f.a === userId ? 'out' : 'in') : undefined });
    }
    const ord = { game: 0, online: 1, away: 2, off: 3 } as any;
    return out.sort((a, b) => ord[a.st] - ord[b.st] || a.name.localeCompare(b.name));
  }
  async sendFriends(userId: string) {
    if (!this.online(userId)) return;
    const list = await this.friendList(userId);
    this.presenceSig.set(userId, JSON.stringify(list.map((f) => [f.id, f.st, f.txt])));
    this.toUser(userId, { t: 'friends', list });
  }
  async tickPresence() {
    for (const id of this.byUser.keys()) {
      const list = await this.friendList(id).catch(() => null);
      if (!list) continue;
      const sig = JSON.stringify(list.map((f) => [f.id, f.st, f.txt]));
      if (this.presenceSig.get(id) !== sig) {
        this.presenceSig.set(id, sig);
        this.toUser(id, { t: 'friends', list });
      }
    }
  }

  // ------------------------------------------------------------------------------------ matchmaking
  leaveQueue(s: Sess) {
    this.queue = this.queue.filter((q) => q.sess !== s);
  }
  stats() {
    const out: Record<string, { online: number; wait: number; queued: number }> = {};
    for (const k of Object.keys(MODES)) {
      const inGame = [...this.rooms.rooms.values()].filter((r) => r.mode === k && r.game && !r.game.over).reduce((n, r) => n + r.seats.filter((x) => x && !x.bot).length, 0);
      const queued = this.queue.filter((q) => q.mode === k).length;
      const w = this.waits[k] ?? [];
      out[k] = { online: inGame + queued, queued, wait: w.length ? Math.round(w.reduce((a, b) => a + b, 0) / w.length / 1000) : MODES[k].botAfter ? Math.round(MODES[k].botAfter! / 2000) : 30 };
    }
    out.draft.online += this.drafts?.seated() ?? 0;
    return out;
  }
  tickQueue() {
    const now = Date.now();
    const taken = new Set<QEntry>();
    for (const a of this.queue) {
      if (taken.has(a)) continue;
      const waited = now - a.since;
      const b = this.queue.find((x) => x !== a && !taken.has(x) && x.mode === a.mode && x.format === a.format && (!a.sess.user || !x.sess.user || x.sess.user.id !== a.sess.user.id) &&
        (!a.ranked || Math.abs(x.rankScore - a.rankScore) <= 40 + waited / 1000 * 4));
      if (b) {
        taken.add(a).add(b);
        this.record(a.mode, waited);
        this.makeMatch(a.mode, [
          { sess: a.sess, deck: this.rooms.checkDeck(a.deckText, a.mode).deck, deckName: a.deckName },
          { sess: b.sess, deck: this.rooms.checkDeck(b.deckText, b.mode).deck, deckName: b.deckName },
        ], a.format).catch((e) => console.error('[mm]', e));
        continue;
      }
      const m = MODES[a.mode];
      if (m.botAfter && waited >= m.botAfter) {
        taken.add(a);
        this.record(a.mode, waited);
        this.makeMatch(a.mode, [{ sess: a.sess, deck: this.rooms.checkDeck(a.deckText, a.mode).deck, deckName: a.deckName }, null], a.format).catch((e) => console.error('[mm]', e));
      }
    }
    if (taken.size) this.queue = this.queue.filter((q) => !taken.has(q));
  }
  record(mode: string, ms: number) {
    const w = (this.waits[mode] ??= []);
    w.push(ms);
    if (w.length > 20) w.shift();
  }
  async seatFor(sess: Sess, deck: ReturnType<Rooms['buildDeck']>, deckName: string, mode: string): Promise<Omit<Seat, 'token' | 'sockets'>> {
    const p = sess.user ? await this.acc.load(sess.user.id) : null;
    const name = p?.name ?? 'Guest';
    let sub = deckName;
    if (p) sub = MODES[mode]?.ranked ? `${this.acc.snapshot(p).rank.name} · ${MODES[mode].name}` : `Level ${this.acc.snapshot(p).level}`;
    return { name, deck: deck.cards, deckText: '', commanders: deck.commanders, userId: sess.user?.id, cosmetics: this.cosmeticsOf(p), sub };
  }
  /** Create a room for two queued players (or a player and the AI) and tell both. */
  async makeMatch(mode: string, players: ({ sess: Sess; deck: ReturnType<Rooms['buildDeck']>; deckName: string } | null)[], format: Format, kicker?: string) {
    const seats: Omit<Seat, 'token' | 'sockets'>[] = [];
    for (const pl of players) {
      if (pl) seats.push(await this.seatFor(pl.sess, pl.deck, pl.deckName, mode));
      else {
        const ai = aiDeckFor(this.db, format, (t, f) => this.rooms.buildDeck(t, f));
        seats.push({ name: ai.name, deck: ai.deck.cards, deckText: ai.text, commanders: ai.deck.commanders, bot: true, sub: ai.sub, cosmetics: { avatar: this.itemView(ai.avatar) ?? undefined } });
      }
    }
    // random seat order (who goes first is decided by the engine)
    const room = this.rooms.create({ format, mode, ranked: !!MODES[mode]?.ranked && players.every(Boolean), seats, start: true });
    room.seats.forEach((seat, i) => {
      const pl = players[i];
      if (!pl || !seat) return;
      const opps = room.seats.filter((x, j) => x && j !== i).map((x) => ({ name: x!.name, sub: x!.sub, art: x!.cosmetics?.avatar?.artUrl ?? null, bot: !!x!.bot }));
      const me = room.seats[i]!;
      send(pl.sess.ws, {
        t: 'found', code: room.code, seat: i, token: me.token, mode, kicker: kicker ?? MODES[mode]?.name ?? 'Match',
        you: { name: me.name, sub: `${pl.deckName} · ${pl.deck.cards.length + pl.deck.commanders.length} cards`, art: me.cosmetics?.avatar?.artUrl ?? null },
        opps,
      });
      send(pl.sess.ws, { t: 'queue', state: null });
    });
    return room;
  }

  // ------------------------------------------------------------------------------------ results
  async gameOver(room: Room, game: GameState) {
    const st = (game as any).mfStats ?? { casts: [[], []], lands: [0, 0], attacks: [0, 0] };
    const vsAI = room.seats.some((x) => x?.bot);
    await this.store.addMatch({ id: uuid(), mode: room.mode ?? 'private', players: room.seats.map((x) => (x ? { name: x.name, user: x.userId ?? null, bot: !!x.bot } : null)), winner: game.winner ?? null, turns: game.turn }).catch(() => {});
    for (let i = 0; i < room.seats.length; i++) {
      const seat = room.seats[i];
      if (!seat?.userId) continue;
      const before = (await this.acc.load(seat.userId)).data.quests.list.map((q) => ({ ...q }));
      const res: GameResult = {
        matchId: `${room.code}:${game.id}:${game.turn}`, won: game.winner === i, format: room.draft ? 'draft' : room.format ?? 'constructed', vsAI,
        ranked: !!room.ranked && !vsAI, turns: game.turn, casts: st.casts[i] ?? [], lands: st.lands[i] ?? 0, attacks: st.attacks[i] ?? 0,
      };
      await this.acc.recordGame(seat.userId, res).catch((e) => console.error('[rewards]', e));
      const after = (await this.acc.load(seat.userId)).data.quests.list;
      for (const q of after) {
        const b = before.find((x) => x.id === q.id);
        const snap = this.acc.snapshot(this.acc.cache.get(seat.userId)!);
        const qq = snap.quests.find((x) => x.id === q.id)!;
        if (b && b.prog < qq.goal && q.prog >= qq.goal) await this.note(seat.userId, 'quest', { questId: q.id, title: qq.title, gold: qq.gold });
      }
    }
    if (room.draft) this.drafts.roundOver(room, game);
  }

  // ------------------------------------------------------------------------------------ original room protocol
  attach(s: Sess, r: Room, idx: number) {
    if (s.room && s.room !== r && s.seat >= 0) s.room.seats[s.seat]?.sockets.delete(s.ws);
    s.room = r;
    s.seat = idx;
    const seat = r.seats[idx]!;
    seat.sockets.add(s.ws);
    if (r.game) r.game.players[idx].connected = true;
    send(s.ws, { t: 'joined', code: r.code, seat: idx, token: seat.token, mode: r.mode ?? null });
    r.lastActive = Date.now();
    this.rooms.broadcast(r);
  }
  async legacy(s: Sess, msg: any) {
    const fail = (m: string) => send(s.ws, { t: 'error', message: m });
    const fmt = (m: any): Format => (m?.format === 'commander' ? 'commander' : 'constructed');
    const me = s.user ? await this.acc.load(s.user.id) : null;
    const baseSeat = (name: string) => ({ name: (me?.name ?? (name || 'Player')).slice(0, 24), userId: s.user?.id, cosmetics: this.cosmeticsOf(me), sub: me ? `Level ${this.acc.snapshot(me).level}` : undefined });
    switch (msg.t) {
      case 'create':
      case 'createAI': {
        const format = fmt(msg);
        const deck = this.rooms.buildDeck(String(msg.deck ?? ''), format);
        if (!deck.cards.length) return fail('Your deck is empty — add cards in the deck builder first.');
        if (format === 'commander' && !deck.commanders.length) return fail('Commander: your deck needs a legendary creature as commander (add a "Commander" heading above it).');
        let opp: Omit<Seat, 'token' | 'sockets'> | null = null;
        if (msg.t === 'createAI') {
          const text = String(msg.aiDeck ?? '');
          const ai = text.trim() ? { deck: this.rooms.buildDeck(text, format), name: String(msg.aiName || 'PlayMTG AI'), text, sub: 'AI' } : aiDeckFor(this.db, format, (t, f) => this.rooms.buildDeck(t, f));
          if (!ai.deck.cards.length) return fail('The AI deck is empty.');
          opp = { name: ai.name.slice(0, 24), deck: ai.deck.cards, deckText: ai.text, bot: true, commanders: ai.deck.commanders, sub: 'AI' };
        }
        const r = this.rooms.create({ format, mode: msg.t === 'createAI' ? 'ai' : 'private', seats: [{ ...baseSeat(String(msg.name ?? '')), deck: deck.cards, deckText: msg.deck, commanders: deck.commanders }, opp], start: msg.t === 'createAI' });
        for (const w of deck.warnings.slice(0, 3)) fail(`Deck check: ${w}`);
        this.attach(s, r, 0);
        if (deck.unknown.length) fail(`Unknown cards skipped: ${deck.unknown.slice(0, 8).join(', ')}`);
        break;
      }
      case 'join': {
        const r = this.rooms.rooms.get(String(msg.code ?? '').toUpperCase().trim());
        if (!r) return fail('Room not found');
        const free = r.seats.findIndex((x) => !x);
        if (free < 0) return fail('Room is full');
        const deck = this.rooms.buildDeck(String(msg.deck ?? ''), r.format ?? 'constructed');
        if (!deck.cards.length) return fail('Your deck is empty — add cards in the deck builder first.');
        if (r.format === 'commander' && !deck.commanders.length) return fail('This is a Commander room: your deck needs a commander.');
        r.seats[free] = { ...baseSeat(String(msg.name ?? '')), deck: deck.cards, deckText: msg.deck, sockets: new Set(), commanders: deck.commanders, token: this.rooms.token() };
        this.attach(s, r, free);
        if (deck.unknown.length) fail(`Unknown cards skipped: ${deck.unknown.slice(0, 8).join(', ')}`);
        if (r.seats.every(Boolean) && !r.game) {
          this.rooms.start(r);
          this.rooms.broadcast(r);
        }
        break;
      }
      case 'rejoin': {
        const r = this.rooms.rooms.get(String(msg.code ?? '').toUpperCase());
        if (!r) return fail('Room not found');
        const idx = r.seats.findIndex((x) => x?.token === msg.token);
        if (idx < 0) return fail('Seat not found');
        this.attach(s, r, idx);
        break;
      }
      case 'action': {
        const r = s.room;
        if (!r || s.seat < 0) return fail('Not in a room');
        if (!r.game) return fail('Game has not started');
        const err = dispatch(r.game, s.seat as PlayerIdx, msg.action as Action);
        r.lastActive = Date.now();
        if (err) fail(err);
        this.rooms.broadcast(r);
        break;
      }
      case 'deck': {
        const r = s.room;
        if (!r || s.seat < 0) return fail('Not in a room');
        const deck = this.rooms.buildDeck(String(msg.deck ?? ''));
        if (!deck.cards.length) return fail('Deck is empty');
        r.seats[s.seat]!.deck = deck.cards;
        r.seats[s.seat]!.deckText = msg.deck;
        this.rooms.broadcast(r);
        break;
      }
      case 'rematch': {
        const r = s.room;
        if (!r || s.seat < 0 || !r.game?.over) return fail('Rematch is available once the game is over');
        if (r.draft) return fail('Draft rounds have no rematch — your next round starts from the draft screen.');
        if (r.ranked) return fail('Ranked games have no rematch. Queue again from the lobby.');
        r.rematchVotes.add(s.seat);
        if (r.rematchVotes.size === 2) this.rooms.start(r);
        else r.game.log.push({ t: Date.now(), text: `${r.seats[s.seat]!.name} wants a rematch.`, kind: 'info' } as any);
        this.rooms.broadcast(r);
        break;
      }
      case 'leave': {
        const r = s.room;
        if (r && s.seat >= 0) {
          r.seats[s.seat]?.sockets.delete(s.ws);
          if (r.seats.some((x) => x?.bot) && !r.draft) {
            if (r.game && !r.game.over) dispatch(r.game, s.seat as PlayerIdx, { type: 'concede' } as Action);
            this.rooms.broadcast(r);
            clearTimeout(r.botTimer);
            this.rooms.rooms.delete(r.code);
          } else {
            if (!r.game) r.seats[s.seat] = null;
            else if (!r.game.over) dispatch(r.game, s.seat as PlayerIdx, { type: 'concede' } as Action);
            this.rooms.broadcast(r);
          }
        }
        s.room = null;
        s.seat = -1;
        send(s.ws, { t: 'left' });
        break;
      }
      default:
        fail(`Unknown message ${msg.t}`);
    }
  }
}

/** Public catalog for the shop pages (no sign-in needed). */
export function catalog(hub: Hub) {
  const { bundle, endsAt } = featuredBundle();
  return {
    items: ITEMS.map((i) => hub.itemView(i.id)),
    stock: dailyStock(),
    restock: nextReset(),
    bundle: { ...bundle, endsAt, heroArt: hub.art(bundle.hero), heroCards: bundle.heroCards.map((c) => ({ name: c, image: hub.image(c) })), itemViews: bundle.items.map((i) => hub.itemView(i)) },
    bundles: BUNDLES.map((b) => b.id),
    tiers: TIERS.map((t) => ({ ...t, extraViews: t.extras.map((e) => hub.itemView(e)) })),
    draft: DRAFT,
    rankHint,
  };
}
