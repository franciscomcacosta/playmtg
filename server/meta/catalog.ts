// Everything the economy is made of: cosmetics, the daily shop, bundles, gold tiers, quests, login calendar,
// season track, daily-win rewards and ranks. Pure data + deterministic helpers (no I/O).

export type Cur = 'gold' | 'embers' | 'free';
export type ItemType = 'sleeve' | 'mat' | 'back' | 'avatar';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'mythic';
export interface Item {
  id: string;
  type: ItemType;
  name: string;
  art?: string; // card name whose art is used
  rarity: Rarity;
  price?: { cur: Cur; amt: number }; // shop price (if it can appear in the daily shop)
  source?: string; // where exclusives come from
  style?: { edge?: string; rim?: string; pattern?: string; gem?: string; halo?: string };
}

const E = (a: string, b: string, c: string) => `linear-gradient(160deg,${a},${b} 55%,${c})`;
const BACK = (rim: string, p1: string, p2: string, angle: number, gem: [string, string, string], halo: string) => ({
  rim,
  pattern: `repeating-linear-gradient(${angle}deg,${p1} 0 7px,${p2} 7px 14px)`,
  gem: `radial-gradient(circle,${gem[0]},${gem[1]} 55%,${gem[2]})`,
  halo,
});

export const ITEMS: Item[] = [
  // ---- sleeves
  { id: 's-glorybringer', type: 'sleeve', name: 'Glorybringer', art: 'Glorybringer', rarity: 'mythic', price: { cur: 'embers', amt: 450 }, style: { edge: E('#ffb070', '#b8401a', '#5a1a08') } },
  { id: 's-brainstorm', type: 'sleeve', name: 'Brainstorm', art: 'Brainstorm', rarity: 'uncommon', price: { cur: 'gold', amt: 400 }, style: { edge: E('#a8d8ff', '#2a64a8', '#0e2a4a') } },
  { id: 's-llanowar', type: 'sleeve', name: 'Llanowar Elves', art: 'Llanowar Elves', rarity: 'common', price: { cur: 'embers', amt: 150 }, style: { edge: E('#b8f0a0', '#2e7a3a', '#0c2a12') } },
  { id: 's-thoughtseize', type: 'sleeve', name: 'Thoughtseize', art: 'Thoughtseize', rarity: 'rare', price: { cur: 'gold', amt: 600 }, style: { edge: E('#d8c0e8', '#5a3a70', '#1c0e26') } },
  { id: 's-serra', type: 'sleeve', name: 'Serra Angel', art: 'Serra Angel', rarity: 'uncommon', price: { cur: 'embers', amt: 300 }, style: { edge: E('#fff4d0', '#c9a050', '#5a4018') } },
  { id: 's-bolt', type: 'sleeve', name: 'Lightning Bolt', art: 'Lightning Bolt', rarity: 'rare', price: { cur: 'embers', amt: 400 }, style: { edge: E('#ffd0a0', '#d0401a', '#4a0e04') } },
  { id: 's-counterspell', type: 'sleeve', name: 'Counterspell', art: 'Counterspell', rarity: 'common', price: { cur: 'free', amt: 0 }, style: { edge: E('#c0e0ff', '#3a70b0', '#0a1e3a') } },
  { id: 's-atraxa', type: 'sleeve', name: 'Atraxa', art: "Atraxa, Praetors' Voice", rarity: 'mythic', price: { cur: 'gold', amt: 900 }, style: { edge: E('#fff0c0', '#8ac0a0', '#2a3a40') } },
  { id: 's-rift-violet', type: 'sleeve', name: 'Rift Violet', art: 'Ulamog, the Infinite Gyre', rarity: 'mythic', source: 'Aeon Rift Collection', style: { edge: E('#d8b8ff', '#5a2aa0', '#1a0c30') } },
  { id: 's-hoarding', type: 'sleeve', name: 'Hoarding Dragon', art: 'Hoarding Dragon', rarity: 'mythic', source: 'Chest of gold', style: { edge: E('#fff0b0', '#c08a20', '#4a2a06') } },
  { id: 's-brainstorm-season', type: 'sleeve', name: 'Brainstorm Ember', art: 'Brainstorm', rarity: 'rare', source: 'Season of Embers', style: { edge: E('#ffd8b0', '#c2491a', '#3a0e04') } },
  // ---- playmats
  { id: 'm-spirit-dragon', type: 'mat', name: 'Spirit Dragon', art: 'Ugin, the Spirit Dragon', rarity: 'mythic', price: { cur: 'embers', amt: 900 } },
  { id: 'm-shivan', type: 'mat', name: 'Shivan Dragon', art: 'Shivan Dragon', rarity: 'rare', price: { cur: 'gold', amt: 700 } },
  { id: 'm-old-growth', type: 'mat', name: 'Old Growth', art: 'Craterhoof Behemoth', rarity: 'rare', price: { cur: 'embers', amt: 650 } },
  { id: 'm-tidal', type: 'mat', name: 'Tidal Reach', art: 'Ancestral Recall', rarity: 'uncommon', price: { cur: 'gold', amt: 500 } },
  { id: 'm-aeons', type: 'mat', name: 'Aeons Torn', art: 'Emrakul, the Aeons Torn', rarity: 'mythic', source: 'Aeon Rift Collection' },
  { id: 'm-revel', type: 'mat', name: 'Revel in Riches', art: 'Revel in Riches', rarity: 'mythic', source: "Dragon's Hoard" },
  { id: 'm-ugin-season', type: 'mat', name: 'Ugin Ascendant', art: 'Ugin, the Spirit Dragon', rarity: 'mythic', source: 'Season of Embers' },
  // ---- card backs
  { id: 'b-ember', type: 'back', name: 'Ember Lattice', rarity: 'rare', price: { cur: 'gold', amt: 650 }, style: BACK('#1a0a04', '#3a1408', '#4a1a0a', 45, ['#ffd08a', '#e0622a', '#4a1406'], 'rgba(224,98,42,.6)') },
  { id: 'b-tide', type: 'back', name: 'Tidewater', rarity: 'common', price: { cur: 'free', amt: 0 }, style: BACK('#06121c', '#0c2233', '#10304a', 135, ['#c8ecff', '#3a8fd0', '#0a2236'], 'rgba(58,143,208,.6)') },
  { id: 'b-moss', type: 'back', name: 'Mossweave', rarity: 'uncommon', price: { cur: 'embers', amt: 300 }, style: BACK('#06140a', '#10301a', '#163e22', 60, ['#d0ffc8', '#3ab05a', '#0a2a12'], 'rgba(58,176,90,.55)') },
  { id: 'b-night', type: 'back', name: 'Nightglass', rarity: 'rare', price: { cur: 'embers', amt: 500 }, style: BACK('#0a0610', '#1e1430', '#2a1c40', 30, ['#e8d8ff', '#8a5af0', '#1a0c30'], 'rgba(138,90,240,.6)') },
  { id: 'b-eldritch', type: 'back', name: 'Eldritch Weave', rarity: 'mythic', source: 'Aeon Rift Collection', style: BACK('#0e0620', '#1e0e3a', '#2a1450', 60, ['#f0e0ff', '#9a5af0', '#1e0e3a'], 'rgba(154,90,240,.6)') },
  { id: 'b-gilded', type: 'back', name: 'Gilded Weave', rarity: 'mythic', source: 'Strongbox of gold', style: BACK('#1a1004', '#3a2808', '#5a3e10', 45, ['#fff4cc', '#f0c35a', '#5a3a08'], 'rgba(240,195,90,.6)') },
  // ---- avatars
  { id: 'a-jace', type: 'avatar', name: 'Jace', art: 'Jace, the Mind Sculptor', rarity: 'common', source: 'Starter' },
  { id: 'a-sheoldred', type: 'avatar', name: 'Sheoldred', art: 'Sheoldred, the Apocalypse', rarity: 'rare', price: { cur: 'embers', amt: 300 } },
  { id: 'a-chandra', type: 'avatar', name: 'Chandra', art: 'Chandra, Torch of Defiance', rarity: 'rare', price: { cur: 'gold', amt: 350 } },
  { id: 'a-liliana', type: 'avatar', name: 'Liliana', art: 'Liliana of the Veil', rarity: 'rare', price: { cur: 'embers', amt: 350 } },
  { id: 'a-teferi', type: 'avatar', name: 'Teferi', art: 'Teferi, Hero of Dominaria', rarity: 'uncommon', price: { cur: 'embers', amt: 200 } },
  { id: 'a-garruk', type: 'avatar', name: 'Garruk', art: 'Garruk Wildspeaker', rarity: 'common', price: { cur: 'free', amt: 0 } },
  { id: 'a-nissa', type: 'avatar', name: 'Nissa', art: 'Nissa, Who Shakes the World', rarity: 'uncommon', price: { cur: 'gold', amt: 250 } },
  { id: 'a-ajani', type: 'avatar', name: 'Ajani', art: 'Ajani Goldmane', rarity: 'common', price: { cur: 'embers', amt: 120 } },
  { id: 'a-sheoldred-season', type: 'avatar', name: 'Sheoldred Ascendant', art: 'Sheoldred, the Apocalypse', rarity: 'mythic', source: 'Season of Embers' },
];
export const ITEM = new Map(ITEMS.map((i) => [i.id, i]));
export const DEFAULT_OWNED = ['a-jace'];
export const DEFAULT_EQUIPPED: Partial<Record<ItemType, string>> = { avatar: 'a-jace' };

export const TYPE_DESC: Record<ItemType, string> = {
  sleeve: 'Card sleeves. Shown on every card in your library and hand.',
  mat: 'Playmat. Replaces your half of the battlefield.',
  back: 'Card back. What your opponent sees on your library and hand.',
  avatar: 'Avatar. Shown next to your life total.',
};

// ---- time helpers (every reset happens at 00:00 UTC)
export const dayKey = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
export const nextReset = (t = Date.now()) => {
  const d = new Date(t);
  d.setUTCHours(24, 0, 0, 0);
  return d.getTime();
};
export const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};
export const rng = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** Today's 6-slot stock: the same for everyone, rotating at 00:00 UTC. Two sleeves, a mat, a back, an avatar, one more. */
export function dailyStock(day = dayKey()): string[] {
  const r = rng(hash('stock:' + day));
  const pool = ITEMS.filter((i) => i.price);
  const out: string[] = [];
  for (const t of ['sleeve', 'sleeve', 'mat', 'back', 'avatar', null] as (ItemType | null)[]) {
    const c = pool.filter((i) => (!t || i.type === t) && !out.includes(i.id));
    const id = c[Math.floor(r() * c.length)]?.id;
    if (id) out.push(id);
  }
  return out;
}

export interface Bundle { id: string; name: string; items: string[]; cur: 'gold' | 'embers'; price: number; separately: number; hero: string; heroCards: string[] }
export const BUNDLES: Bundle[] = [
  { id: 'aeon-rift', name: 'Aeon Rift Collection', items: ['m-aeons', 's-rift-violet', 'b-eldritch'], cur: 'embers', price: 1800, separately: 2400, hero: 'Emrakul, the Aeons Torn', heroCards: ['Emrakul, the Aeons Torn', 'Ulamog, the Infinite Gyre'] },
];
/** The featured bundle rotates every Monday 00:00 UTC. */
export function featuredBundle(t = Date.now()): { bundle: Bundle; endsAt: number } {
  const d = new Date(t);
  const daysToMon = (8 - d.getUTCDay()) % 7 || 7;
  const end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + daysToMon);
  const week = Math.floor(end / (7 * 864e5));
  return { bundle: BUNDLES[week % BUNDLES.length], endsAt: end };
}

export interface Tier { id: number; roman: string; name: string; base: number; bonus: number; eur: number; extras: string[]; stacks: number[] }
export const TIERS: Tier[] = [
  { id: 1, roman: 'I', name: 'Pouch', base: 500, bonus: 0, eur: 4.99, extras: [], stacks: [4] },
  { id: 2, roman: 'II', name: 'Purse', base: 1000, bonus: 100, eur: 9.99, extras: [], stacks: [5, 3] },
  { id: 3, roman: 'III', name: 'Coffer', base: 2000, bonus: 300, eur: 19.99, extras: [], stacks: [7, 5, 3] },
  { id: 4, roman: 'IV', name: 'Strongbox', base: 3500, bonus: 700, eur: 34.99, extras: ['b-gilded'], stacks: [6, 9, 7, 4] },
  { id: 5, roman: 'V', name: 'Chest', base: 5000, bonus: 1250, eur: 49.99, extras: ['b-gilded', 's-hoarding'], stacks: [5, 9, 12, 8, 4] },
  { id: 6, roman: 'VI', name: "Dragon's Hoard", base: 10000, bonus: 3500, eur: 99.99, extras: ['b-gilded', 's-hoarding', 'm-revel'], stacks: [4, 8, 12, 15, 11, 7, 3] },
];

// ---- rewards for playing
export const EMBERS = { win: 40, finish: 15, firstWin: 100 };
export const XP = { win: 100, finish: 40, quest: 250 };
export const DAILY_WINS: { cur: 'gold' | 'embers'; amt: number }[] = [
  { cur: 'gold', amt: 250 },
  { cur: 'gold', amt: 250 },
  { cur: 'embers', amt: 100 },
  { cur: 'gold', amt: 250 },
  { cur: 'embers', amt: 150 },
];
/** Games against the AI pay out like any other game, but only this many per day (stops concede-farming). */
export const AI_REWARD_GAMES_PER_DAY = 10;
/** A game must reach this turn number before it pays out. */
export const MIN_TURNS_FOR_REWARDS = 4;

export type Reward = { cur: 'gold' | 'embers' | 'xp'; amt: number } | { item: string };
export const LOGIN: Reward[] = [
  { cur: 'gold', amt: 100 },
  { cur: 'embers', amt: 50 },
  { cur: 'gold', amt: 200 },
  { cur: 'xp', amt: 300 },
  { cur: 'gold', amt: 250 },
  { cur: 'embers', amt: 100 },
  { item: 's-glorybringer' },
];

export const SEASON = { name: 'Season of Embers', start: Date.UTC(2026, 8, 15), end: Date.UTC(2026, 10, 15), xpPerLevel: 1000 };
/** Reward for reaching a season level: set cosmetics at milestones, otherwise currency. */
export function seasonReward(level: number): Reward {
  const cos: Record<number, string> = { 5: 'b-moss', 10: 's-serra', 15: 'a-teferi', 20: 'b-night', 23: 'a-sheoldred-season', 25: 's-brainstorm-season', 27: 'm-ugin-season', 30: 'a-liliana' };
  if (cos[level]) return { item: cos[level] };
  if (level % 3 === 0) return { cur: 'gold', amt: 500 };
  if (level % 2 === 0) return { cur: 'embers', amt: 100 };
  return { cur: 'gold', amt: 150 };
}

// ---- quests
export type QuestKind = 'cast' | 'land' | 'attack' | 'win' | 'finish';
export interface QuestTpl { tpl: string; title: string; kind: QuestKind; goal: number; gold: number; colors?: string[]; format?: string }
export const QUESTS: QuestTpl[] = [
  { tpl: 'cast-rg', title: 'Cast 20 red or green spells', kind: 'cast', goal: 20, gold: 500, colors: ['R', 'G'] },
  { tpl: 'cast-wu', title: 'Cast 20 white or blue spells', kind: 'cast', goal: 20, gold: 500, colors: ['W', 'U'] },
  { tpl: 'cast-br', title: 'Cast 20 black or red spells', kind: 'cast', goal: 20, gold: 500, colors: ['B', 'R'] },
  { tpl: 'cast-gw', title: 'Cast 20 green or white spells', kind: 'cast', goal: 20, gold: 500, colors: ['G', 'W'] },
  { tpl: 'cast-ub', title: 'Cast 20 blue or black spells', kind: 'cast', goal: 20, gold: 500, colors: ['U', 'B'] },
  { tpl: 'win-cmd', title: 'Win 2 games with a Commander deck', kind: 'win', goal: 2, gold: 750, format: 'commander' },
  { tpl: 'win-any', title: 'Win 3 games', kind: 'win', goal: 3, gold: 750 },
  { tpl: 'lands', title: 'Play 30 lands', kind: 'land', goal: 30, gold: 250 },
  { tpl: 'attack', title: 'Attack with 25 creatures', kind: 'attack', goal: 25, gold: 500 },
  { tpl: 'finish', title: 'Finish 4 games', kind: 'finish', goal: 4, gold: 500 },
];
export function rollQuest(seed: string, exclude: string[]): QuestTpl {
  const r = rng(hash(seed));
  const c = QUESTS.filter((q) => !exclude.includes(q.tpl));
  return c[Math.floor(r() * c.length)] ?? QUESTS[0];
}

// ---- ranks: Bronze → Mythic, divisions IV (4) … I (1), 4 pips per division
export const TIERS_RANK = ['bronze', 'silver', 'gold', 'platinum', 'mythic'] as const;
export type RankTier = (typeof TIERS_RANK)[number];
export interface Rank { tier: RankTier; division: number; pips: number; mythic?: number }
export const RANK0: Rank = { tier: 'bronze', division: 4, pips: 0 };
export const PIPS_PER_DIV = 4;
/** Win: +1 pip (+2 in Bronze). Bronze and Silver never lose progress; Gold and above lose a pip on a loss (and can drop a
 *  division, never a tier). Mythic is a points race: +10 a win, −8 a loss. */
export function rankAfter(r: Rank, won: boolean): Rank {
  const n: Rank = { ...r };
  if (n.tier === 'mythic') {
    n.mythic = Math.max(0, (n.mythic ?? 0) + (won ? 10 : -8));
    return n;
  }
  const ti = TIERS_RANK.indexOf(n.tier);
  if (won) {
    n.pips += n.tier === 'bronze' ? 2 : 1;
    while (n.pips >= PIPS_PER_DIV) {
      n.pips -= PIPS_PER_DIV;
      if (n.division > 1) n.division--;
      else {
        n.tier = TIERS_RANK[TIERS_RANK.indexOf(n.tier) + 1];
        n.division = 4;
        if (n.tier === 'mythic') {
          n.pips = 0;
          n.mythic = 0;
          break;
        }
      }
    }
  } else if (ti >= 2) {
    if (n.pips > 0) n.pips--;
    else if (n.division < 4) {
      n.division++;
      n.pips = PIPS_PER_DIV - 1;
    }
  }
  return n;
}
export const rankName = (r: Rank) => (r.tier === 'mythic' ? `Mythic ${r.mythic ?? 0}` : `${r.tier[0].toUpperCase()}${r.tier.slice(1)} ${['', 'I', 'II', 'III', 'IV'][r.division]}`);
/** "One win to Gold 1" style hint. */
export function rankHint(r: Rank): string {
  if (r.tier === 'mythic') return `${r.mythic ?? 0} mythic points`;
  const per = r.tier === 'bronze' ? 2 : 1;
  const wins = Math.ceil((PIPS_PER_DIV - r.pips) / per);
  const next = r.division > 1 ? { ...r, division: r.division - 1 } : { ...r, tier: TIERS_RANK[TIERS_RANK.indexOf(r.tier) + 1], division: 4 };
  return `${wins === 1 ? 'one win' : `${wins} wins`} to ${rankName(next as Rank)}`;
}

export const DRAFT = { entry: 750, seats: 4, packs: 3, packSize: 14, deckSize: 40, rounds: 3, prizeEmbers: [0, 300, 700, 1200] };
