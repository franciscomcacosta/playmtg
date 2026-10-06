// Persistence for accounts, decks, social graph and notifications.
//  - SupabaseStore: used when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set (production). The game server is the
//    only writer (service role); the browser only signs in with Supabase Auth and reads its own rows.
//  - FileStore: a JSON file under data/ for local development and tests (no setup needed).
// The server keeps hot profiles in memory and writes through, so every rule is enforced in one place.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export interface ProfileRow { id: string; name: string; data: any; created_at?: string }
export interface DeckRow { id: string; owner: string; name: string; format: string; data: any; updated_at: string }
export interface LedgerRow { user_id: string; currency: string; delta: number; balance: number; reason: string; ref?: string | null; created_at?: string }
export interface FriendRow { a: string; b: string; status: 'pending' | 'accepted'; created_at?: string } // a = requester
export interface NoteRow { id: string; user_id: string; kind: string; data: any; seen: boolean; created_at: string }
export interface MatchRow { id: string; mode: string; players: any; winner: number | null; turns: number; created_at?: string }

export interface Store {
  kind: 'supabase' | 'file';
  getProfile(id: string): Promise<ProfileRow | null>;
  getProfileByName(name: string): Promise<ProfileRow | null>;
  saveProfile(p: ProfileRow): Promise<void>;
  ledger(rows: LedgerRow[]): Promise<void>;
  listDecks(owner: string): Promise<DeckRow[]>;
  saveDeck(d: DeckRow): Promise<void>;
  deleteDeck(owner: string, id: string): Promise<void>;
  friends(id: string): Promise<FriendRow[]>;
  setFriend(f: FriendRow): Promise<void>;
  deleteFriend(a: string, b: string): Promise<void>;
  notes(id: string): Promise<NoteRow[]>;
  addNote(n: NoteRow): Promise<void>;
  updateNote(n: NoteRow): Promise<void>;
  deleteNote(userId: string, id: string): Promise<void>;
  addMatch(m: MatchRow): Promise<void>;
}

// ------------------------------------------------------------------------------------------
interface FileData {
  profiles: Record<string, ProfileRow>;
  decks: Record<string, DeckRow>;
  ledger: LedgerRow[];
  friends: FriendRow[];
  notes: Record<string, NoteRow>;
  matches: MatchRow[];
  devTokens: Record<string, string>; // dev sign-in: token -> profile id
}

export class FileStore implements Store {
  kind = 'file' as const;
  file: string;
  d: FileData;
  timer: ReturnType<typeof setTimeout> | null = null;
  constructor(file = path.resolve(process.env.MANAFORGE_STORE ?? 'data/meta.json')) {
    this.file = file;
    const empty: FileData = { profiles: {}, decks: {}, ledger: [], friends: [], notes: {}, matches: [], devTokens: {} };
    try {
      this.d = existsSync(file) ? { ...empty, ...JSON.parse(readFileSync(file, 'utf8')) } : empty;
    } catch {
      this.d = empty;
    }
  }
  flush() {
    if (this.timer) return;
    this.timer = setTimeout(() => this.flushNow(), 250);
  }
  flushNow() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    try {
      mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      writeFileSync(tmp, JSON.stringify(this.d));
      renameSync(tmp, this.file);
    } catch (e) {
      console.error('[store] write failed', e);
    }
  }
  async getProfile(id: string) { return this.d.profiles[id] ?? null; }
  async getProfileByName(name: string) {
    const n = name.trim().toLowerCase();
    return Object.values(this.d.profiles).find((p) => p.name.toLowerCase() === n) ?? null;
  }
  async saveProfile(p: ProfileRow) { this.d.profiles[p.id] = JSON.parse(JSON.stringify(p)); this.flush(); }
  async ledger(rows: LedgerRow[]) {
    for (const r of rows) this.d.ledger.push({ ...r, created_at: new Date().toISOString() });
    if (this.d.ledger.length > 20000) this.d.ledger.splice(0, this.d.ledger.length - 20000);
    this.flush();
  }
  async listDecks(owner: string) { return Object.values(this.d.decks).filter((d) => d.owner === owner).sort((a, b) => b.updated_at.localeCompare(a.updated_at)); }
  async saveDeck(d: DeckRow) { this.d.decks[d.id] = JSON.parse(JSON.stringify(d)); this.flush(); }
  async deleteDeck(owner: string, id: string) { if (this.d.decks[id]?.owner === owner) delete this.d.decks[id]; this.flush(); }
  async friends(id: string) { return this.d.friends.filter((f) => f.a === id || f.b === id); }
  async setFriend(f: FriendRow) {
    this.d.friends = this.d.friends.filter((x) => !((x.a === f.a && x.b === f.b) || (x.a === f.b && x.b === f.a)));
    this.d.friends.push({ ...f, created_at: f.created_at ?? new Date().toISOString() });
    this.flush();
  }
  async deleteFriend(a: string, b: string) { this.d.friends = this.d.friends.filter((x) => !((x.a === a && x.b === b) || (x.a === b && x.b === a))); this.flush(); }
  async notes(id: string) { return Object.values(this.d.notes).filter((n) => n.user_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at)); }
  async addNote(n: NoteRow) { this.d.notes[n.id] = n; this.flush(); }
  async updateNote(n: NoteRow) { this.d.notes[n.id] = n; this.flush(); }
  async deleteNote(userId: string, id: string) { if (this.d.notes[id]?.user_id === userId) delete this.d.notes[id]; this.flush(); }
  async addMatch(m: MatchRow) { this.d.matches.push({ ...m, created_at: new Date().toISOString() }); if (this.d.matches.length > 5000) this.d.matches.shift(); this.flush(); }
}

// ------------------------------------------------------------------------------------------
export class SupabaseStore implements Store {
  kind = 'supabase' as const;
  sb: any;
  constructor(sb: any) { this.sb = sb; }
  private async q<T>(p: PromiseLike<{ data: T; error: any }>): Promise<T> {
    const { data, error } = await p;
    if (error) throw new Error(`[supabase] ${error.message}`);
    return data;
  }
  async getProfile(id: string) { return (await this.q<ProfileRow[]>(this.sb.from('profiles').select('*').eq('id', id).limit(1)))[0] ?? null; }
  async getProfileByName(name: string) {
    const exact = name.trim().replace(/[\\%_]/g, (c) => '\\' + c); // ilike without wildcards = case-insensitive equality
    return (await this.q<ProfileRow[]>(this.sb.from('profiles').select('*').ilike('name', exact).limit(1)))[0] ?? null;
  }
  async saveProfile(p: ProfileRow) { await this.q(this.sb.from('profiles').upsert({ id: p.id, name: p.name, data: p.data, updated_at: new Date().toISOString() })); }
  async ledger(rows: LedgerRow[]) { if (rows.length) await this.q(this.sb.from('ledger').insert(rows)); }
  async listDecks(owner: string) { return this.q<DeckRow[]>(this.sb.from('decks').select('*').eq('owner', owner).order('updated_at', { ascending: false })); }
  async saveDeck(d: DeckRow) { await this.q(this.sb.from('decks').upsert(d)); }
  async deleteDeck(owner: string, id: string) { await this.q(this.sb.from('decks').delete().eq('owner', owner).eq('id', id)); }
  async friends(id: string) { return this.q<FriendRow[]>(this.sb.from('friendships').select('*').or(`a.eq.${id},b.eq.${id}`)); }
  async setFriend(f: FriendRow) {
    await this.deleteFriend(f.a, f.b);
    await this.q(this.sb.from('friendships').insert({ a: f.a, b: f.b, status: f.status }));
  }
  async deleteFriend(a: string, b: string) {
    await this.q(this.sb.from('friendships').delete().or(`and(a.eq.${a},b.eq.${b}),and(a.eq.${b},b.eq.${a})`));
  }
  async notes(id: string) { return this.q<NoteRow[]>(this.sb.from('notifications').select('*').eq('user_id', id).order('created_at', { ascending: false }).limit(50)); }
  async addNote(n: NoteRow) { await this.q(this.sb.from('notifications').insert(n)); }
  async updateNote(n: NoteRow) { await this.q(this.sb.from('notifications').update({ seen: n.seen, data: n.data }).eq('id', n.id)); }
  async deleteNote(userId: string, id: string) { await this.q(this.sb.from('notifications').delete().eq('user_id', userId).eq('id', id)); }
  async addMatch(m: MatchRow) { await this.q(this.sb.from('matches').insert(m)); }
}

export const uuid = () => randomUUID();
