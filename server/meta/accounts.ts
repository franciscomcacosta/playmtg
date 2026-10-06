// Player accounts: wallet (with an append-only ledger), cosmetics, season XP, login calendar, quests, daily wins,
// ranked progress and the draft collection. Every rule lives here and runs on the server only.
import type { LedgerRow, Store } from './store';
import {
  AI_REWARD_GAMES_PER_DAY, DAILY_WINS, DEFAULT_EQUIPPED, DEFAULT_OWNED, EMBERS, ITEM, LOGIN, MIN_TURNS_FOR_REWARDS, QUESTS, RANK0,
  SEASON, TIERS, XP, dailyStock, dayKey, featuredBundle, rankAfter, rankName, rollQuest, seasonReward,
  type ItemType, type QuestTpl, type Rank, type Reward,
} from './catalog';

export interface Quest { id: string; tpl: string; prog: number; claimed: boolean }
export interface ProfileData {
  v: 1;
  gold: number;
  embers: number;
  xp: number; // season XP (1000 per level)
  season: string;
  seasonGranted: number; // highest level whose reward was granted
  owned: Record<string, number>;
  equipped: Partial<Record<ItemType, string>>;
  rank: Rank;
  login: { count: number; last: string | null };
  quests: { day: string; list: Quest[]; swapped: boolean };
  daily: { day: string; wins: number; aiGames: number; firstWin: boolean };
  draft: { day: string | null; paid: boolean };
  collection: Record<string, number>; // draft picks (card name -> copies)
  stats: { games: number; wins: number };
  activity?: string;
}
export interface Profile { id: string; name: string; data: ProfileData }

export const START_GOLD = 500;
export const START_EMBERS = 300;

export function freshData(): ProfileData {
  return {
    v: 1,
    gold: START_GOLD,
    embers: START_EMBERS,
    xp: 0,
    season: SEASON.name,
    seasonGranted: 1,
    owned: Object.fromEntries(DEFAULT_OWNED.map((i) => [i, Date.now()])),
    equipped: { ...DEFAULT_EQUIPPED },
    rank: { ...RANK0 },
    login: { count: 0, last: null },
    quests: { day: '', list: [], swapped: false },
    daily: { day: '', wins: 0, aiGames: 0, firstWin: false },
    draft: { day: null, paid: false },
    collection: {},
    stats: { games: 0, wins: 0 },
  };
}

export const levelOf = (xp: number) => 1 + Math.floor(xp / SEASON.xpPerLevel);
const fmt = (n: number) => n.toLocaleString('en-US');
export function rewardText(r: Reward): string {
  if ('item' in r) {
    const it = ITEM.get(r.item);
    return it ? `${it.name} ${it.type === 'back' ? 'card back' : it.type === 'mat' ? 'playmat' : it.type}` : r.item;
  }
  return r.cur === 'xp' ? `${fmt(r.amt)} XP` : `${fmt(r.amt)} ${r.cur}`;
}

export type Fx = { kind: 'gold' | 'embers' | 'xp'; amt: number } | { kind: 'toast'; text: string } | { kind: 'item'; id: string } | { kind: 'level'; level: number; reward: string };
export class Err extends Error {}

/** Per-user serialisation so two requests never interleave on one profile. */
class Locks {
  m = new Map<string, Promise<any>>();
  run<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.m.get(id) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.m.set(id, next.catch(() => undefined));
    return next;
  }
}

export class Accounts {
  store: Store;
  cache = new Map<string, Profile>();
  locks = new Locks();
  onChange: (id: string, fx: Fx[]) => void = () => {};
  constructor(store: Store) {
    this.store = store;
  }

  async load(id: string, nameHint?: string): Promise<Profile> {
    const hit = this.cache.get(id);
    if (hit) return hit;
    const row = await this.store.getProfile(id);
    let p: Profile;
    if (row) p = { id, name: row.name, data: { ...freshData(), ...row.data } };
    else {
      p = { id, name: await this.uniqueName(nameHint || 'Planeswalker'), data: freshData() };
      await this.store.saveProfile({ id, name: p.name, data: p.data });
      await this.store.ledger([
        { user_id: id, currency: 'gold', delta: START_GOLD, balance: START_GOLD, reason: 'welcome' },
        { user_id: id, currency: 'embers', delta: START_EMBERS, balance: START_EMBERS, reason: 'welcome' },
      ]);
    }
    this.refreshDaily(p);
    this.cache.set(id, p);
    return p;
  }
  async uniqueName(base: string): Promise<string> {
    const clean = base.replace(/[^\p{L}\p{N} _'.-]/gu, '').trim().slice(0, 24) || 'Planeswalker';
    let n = clean;
    for (let i = 2; (await this.store.getProfileByName(n)) && i < 999; i++) n = `${clean.slice(0, 20)} ${i}`;
    return n;
  }

  /** Run a mutation on a profile, persist it and notify the client. */
  async mutate<T>(id: string, fn: (p: Profile, fx: Fx[], led: LedgerRow[]) => T | Promise<T>): Promise<T> {
    return this.locks.run(id, async () => {
      const p = await this.load(id);
      const fx: Fx[] = [];
      const led: LedgerRow[] = [];
      const before = JSON.stringify(p.data);
      let out: T;
      try {
        this.refreshDaily(p);
        out = await fn(p, fx, led);
      } catch (e) {
        p.data = JSON.parse(before); // roll back a half-applied change
        throw e;
      }
      await this.store.saveProfile({ id, name: p.name, data: p.data });
      if (led.length) await this.store.ledger(led);
      this.onChange(id, fx);
      return out;
    });
  }

  // ---------------------------------------------------------------------------------------- wallet
  credit(p: Profile, fx: Fx[], led: LedgerRow[], cur: 'gold' | 'embers', amt: number, reason: string, ref?: string) {
    if (amt <= 0) return;
    p.data[cur] += amt;
    led.push({ user_id: p.id, currency: cur, delta: amt, balance: p.data[cur], reason, ref: ref ?? null });
    fx.push({ kind: cur, amt });
  }
  debit(p: Profile, led: LedgerRow[], cur: 'gold' | 'embers', amt: number, reason: string, ref?: string) {
    if (amt <= 0) return;
    if (p.data[cur] < amt) throw new Err(`You need ${fmt(amt - p.data[cur])} more ${cur}.`);
    p.data[cur] -= amt;
    led.push({ user_id: p.id, currency: cur, delta: -amt, balance: p.data[cur], reason, ref: ref ?? null });
  }
  grantItem(p: Profile, fx: Fx[], id: string) {
    if (!ITEM.has(id) || p.data.owned[id]) return false;
    p.data.owned[id] = Date.now();
    fx.push({ kind: 'item', id });
    return true;
  }
  grant(p: Profile, fx: Fx[], led: LedgerRow[], r: Reward, reason: string) {
    if ('item' in r) {
      if (!this.grantItem(p, fx, r.item)) this.credit(p, fx, led, 'embers', 100, `${reason}:duplicate`, r.item); // already owned: 100 embers instead
    } else if (r.cur === 'xp') this.addXp(p, fx, led, r.amt);
    else this.credit(p, fx, led, r.cur, r.amt, reason);
  }
  addXp(p: Profile, fx: Fx[], led: LedgerRow[], amt: number) {
    if (amt <= 0) return;
    p.data.xp += amt;
    fx.push({ kind: 'xp', amt });
    const lv = levelOf(p.data.xp);
    while (p.data.seasonGranted < lv) {
      p.data.seasonGranted++;
      const r = seasonReward(p.data.seasonGranted);
      this.grant(p, fx, led, r, `season:${p.data.seasonGranted}`);
      fx.push({ kind: 'level', level: p.data.seasonGranted, reward: rewardText(r) });
    }
  }

  // ---------------------------------------------------------------------------------------- daily state
  refreshDaily(p: Profile) {
    const d = p.data;
    const today = dayKey();
    if (d.season !== SEASON.name) {
      // new season: XP track and rank reset, everything else stays
      d.season = SEASON.name;
      d.xp = 0;
      d.seasonGranted = 1;
      d.rank = { ...RANK0 };
    }
    if (d.daily.day !== today) d.daily = { day: today, wins: 0, aiGames: 0, firstWin: false };
    if (d.quests.day !== today) {
      const keep = d.quests.list.filter((q) => !q.claimed);
      while (keep.length < 3) {
        const t = rollQuest(`${p.id}:${today}:${keep.length}`, keep.map((q) => q.tpl));
        keep.push({ id: `${today}-${keep.length}-${t.tpl}`, tpl: t.tpl, prog: 0, claimed: false });
      }
      d.quests = { day: today, list: keep.slice(0, 3), swapped: false };
    }
    if (d.draft.day !== today) d.draft = { day: today, paid: false };
  }

  // ---------------------------------------------------------------------------------------- shop
  buyItem(id: string, itemId: string) {
    return this.mutate(id, (p, fx, led) => {
      const it = ITEM.get(itemId);
      if (!it) throw new Err('That item does not exist.');
      if (p.data.owned[itemId]) throw new Err('You already own that.');
      if (!dailyStock().includes(itemId) || !it.price) throw new Err('That item is not in the shop today.');
      if (it.price.cur !== 'free') this.debit(p, led, it.price.cur, it.price.amt, 'shop', itemId);
      this.grantItem(p, fx, itemId);
      fx.push({ kind: 'toast', text: `${it.name} added to your collection` });
      return true;
    });
  }
  buyBundle(id: string, bundleId: string) {
    return this.mutate(id, (p, fx, led) => {
      const { bundle } = featuredBundle();
      if (bundle.id !== bundleId) throw new Err('That bundle has left the shop.');
      if (bundle.items.every((i) => p.data.owned[i])) throw new Err('You already own everything in this bundle.');
      this.debit(p, led, bundle.cur, bundle.price, 'bundle', bundle.id);
      for (const i of bundle.items) this.grantItem(p, fx, i);
      fx.push({ kind: 'toast', text: `${bundle.name} unlocked` });
      return true;
    });
  }
  equip(id: string, itemId: string) {
    return this.mutate(id, (p) => {
      const it = ITEM.get(itemId);
      if (!it) throw new Err('That item does not exist.');
      if (!p.data.owned[itemId]) throw new Err('You do not own that yet.');
      p.data.equipped[it.type] = itemId;
      return true;
    });
  }
  unequip(id: string, type: ItemType) {
    return this.mutate(id, (p) => {
      if (type === 'avatar') throw new Err('You always need an avatar.');
      if (!['sleeve', 'mat', 'back'].includes(type)) throw new Err('Unknown item type.');
      delete p.data.equipped[type];
      return true;
    });
  }
  /** Treasury. Payments are in free dev mode: the order is recorded and gold is credited without a charge. */
  treasury(id: string, tierId: number) {
    return this.mutate(id, (p, fx, led) => {
      const t = TIERS.find((x) => x.id === tierId);
      if (!t) throw new Err('Unknown tier.');
      const ref = `dev-order-${Date.now()}`;
      this.credit(p, fx, led, 'gold', t.base + t.bonus, `treasury:${t.name}`, ref);
      for (const e of t.extras) this.grantItem(p, fx, e);
      return { gold: t.base + t.bonus, ref };
    });
  }

  // ---------------------------------------------------------------------------------------- login calendar
  /** One claim per UTC day. Missing a day pauses the week; it never resets. */
  claimLogin(id: string) {
    return this.mutate(id, (p, fx, led) => {
      const today = dayKey();
      if (p.data.login.last === today) throw new Err('Come back tomorrow for the next reward.');
      const idx = p.data.login.count % 7;
      const r = LOGIN[idx];
      this.grant(p, fx, led, r, `login:${idx + 1}`);
      p.data.login = { count: p.data.login.count + 1, last: today };
      return { day: idx + 1, reward: rewardText(r) };
    });
  }

  // ---------------------------------------------------------------------------------------- quests
  claimQuest(id: string, questId: string) {
    return this.mutate(id, (p, fx, led) => {
      const q = p.data.quests.list.find((x) => x.id === questId);
      if (!q) throw new Err('That quest is gone.');
      const t = QUESTS.find((x) => x.tpl === q.tpl)!;
      if (q.claimed) throw new Err('Already claimed.');
      if (q.prog < t.goal) throw new Err('Not finished yet.');
      q.claimed = true;
      this.credit(p, fx, led, 'gold', t.gold, 'quest', q.tpl);
      this.addXp(p, fx, led, XP.quest);
      fx.push({ kind: 'toast', text: `+${fmt(t.gold)} gold · +${XP.quest} XP` });
      return true;
    });
  }
  rerollQuest(id: string, questId: string) {
    return this.mutate(id, (p) => {
      const q = p.data.quests.list.find((x) => x.id === questId);
      if (!q || q.claimed) throw new Err('That quest cannot be swapped.');
      if (p.data.quests.swapped) throw new Err('You already swapped a quest today.');
      const t = QUESTS.find((x) => x.tpl === q.tpl)!;
      if (q.prog >= t.goal) throw new Err('That quest is finished. Claim it instead.');
      const n = rollQuest(`${p.id}:${dayKey()}:swap`, p.data.quests.list.map((x) => x.tpl));
      Object.assign(q, { id: `${dayKey()}-swap-${n.tpl}`, tpl: n.tpl, prog: 0 });
      p.data.quests.swapped = true;
      return true;
    });
  }

  // ---------------------------------------------------------------------------------------- matches
  /** Pay out a finished game for one seat. */
  recordGame(id: string, g: GameResult) {
    return this.mutate(id, (p, fx, led) => {
      const d = p.data;
      const out: string[] = [];
      d.stats.games++;
      if (g.won) d.stats.wins++;
      // quests progress in every game (even short ones), so quests feel responsive
      for (const q of d.quests.list) {
        if (q.claimed) continue;
        const t = QUESTS.find((x) => x.tpl === q.tpl) as QuestTpl;
        const before = q.prog;
        if (t.kind === 'cast') q.prog += g.casts.filter((c) => c.some((col) => t.colors!.includes(col))).length;
        else if (t.kind === 'land') q.prog += g.lands;
        else if (t.kind === 'attack') q.prog += g.attacks;
        else if (t.kind === 'finish' && g.turns >= MIN_TURNS_FOR_REWARDS) q.prog += 1;
        else if (t.kind === 'win' && g.won && (!t.format || t.format === g.format) && g.turns >= MIN_TURNS_FOR_REWARDS) q.prog += 1;
        q.prog = Math.min(q.prog, t.goal);
        if (before < t.goal && q.prog >= t.goal) fx.push({ kind: 'toast', text: `Quest complete: ${t.title}` });
      }
      if (g.ranked && g.turns >= 2) {
        const before = rankName(d.rank);
        d.rank = rankAfter(d.rank, g.won);
        const after = rankName(d.rank);
        if (after !== before) fx.push({ kind: 'toast', text: `Rank: ${after}` });
      }
      const short = g.turns < MIN_TURNS_FOR_REWARDS;
      const capped = g.vsAI && d.daily.aiGames >= AI_REWARD_GAMES_PER_DAY;
      if (g.vsAI && !short) d.daily.aiGames++;
      if (short || capped) return { paid: false, reason: short ? 'too short' : 'daily AI limit' };
      this.credit(p, fx, led, 'embers', g.won ? EMBERS.win : EMBERS.finish, g.won ? 'win' : 'finish', g.matchId);
      this.addXp(p, fx, led, g.won ? XP.win : XP.finish);
      if (g.won) {
        if (!d.daily.firstWin) {
          d.daily.firstWin = true;
          this.credit(p, fx, led, 'embers', EMBERS.firstWin, 'first-win', g.matchId);
          out.push(`first win +${EMBERS.firstWin} embers`);
        }
        if (d.daily.wins < DAILY_WINS.length) {
          const r = DAILY_WINS[d.daily.wins];
          d.daily.wins++;
          this.credit(p, fx, led, r.cur, r.amt, `daily-win:${d.daily.wins}`, g.matchId);
        }
      }
      return { paid: true, notes: out };
    });
  }

  rename(id: string, name: string) {
    return this.mutate(id, async (p) => {
      const n = name.replace(/[^\p{L}\p{N} _'.-]/gu, '').trim().slice(0, 24);
      if (n.length < 2) throw new Err('Names need at least 2 characters.');
      const other = await this.store.getProfileByName(n);
      if (other && other.id !== p.id) throw new Err('That name is taken.');
      p.name = n;
      return n;
    });
  }

  /** What the client sees about its own account. */
  snapshot(p: Profile) {
    const d = p.data;
    const lv = levelOf(d.xp);
    return {
      id: p.id,
      name: p.name,
      gold: d.gold,
      embers: d.embers,
      xp: d.xp % SEASON.xpPerLevel,
      xpPerLevel: SEASON.xpPerLevel,
      level: lv,
      season: { name: SEASON.name, end: SEASON.end, track: [0, 1, 2, 3, 4].map((k) => ({ level: lv + k, reward: rewardText(seasonReward(lv + k)), owned: lv + k <= d.seasonGranted && k === 0 })) },
      owned: Object.keys(d.owned),
      equipped: d.equipped,
      rank: { ...d.rank, name: rankName(d.rank) },
      login: { count: d.login.count, claimedToday: d.login.last === dayKey(), track: LOGIN.map(rewardText) },
      quests: d.quests.list.map((q) => {
        const t = QUESTS.find((x) => x.tpl === q.tpl)!;
        return { id: q.id, title: t.title, goal: t.goal, prog: q.prog, gold: t.gold, claimed: q.claimed };
      }),
      questSwapUsed: d.quests.swapped,
      dailyWins: d.daily.wins,
      dailyWinRewards: DAILY_WINS,
      draftPaid: d.draft.paid,
      collectionSize: Object.values(d.collection).reduce((a, b) => a + b, 0),
      stats: d.stats,
    };
  }
}

export interface GameResult {
  matchId: string;
  won: boolean;
  format: 'constructed' | 'commander' | 'draft';
  vsAI: boolean;
  ranked: boolean;
  turns: number;
  casts: string[][]; // colors of each spell this player cast
  lands: number;
  attacks: number;
}
