export interface SavedDeck {
  id: string;
  name: string;
  text: string;
  updated: number;
}

const KEY = 'manaforge.decks.v1';

// Starter lists (card names only; card data is loaded from the local Scryfall database).
export const STARTERS: SavedDeck[] = [
  {
    id: 'starter-red',
    name: 'Starter — Red Aggro',
    updated: 0,
    text: `Deck
22 Mountain
4 Goblin Guide
4 Monastery Swiftspear
4 Raging Goblin
4 Lightning Bolt
4 Shock
4 Lava Spike
4 Searing Spear
4 Valley Dasher
4 Keldon Raider
2 Fireblast`,
  },
  {
    id: 'starter-green',
    name: 'Starter — Green Stompy',
    updated: 0,
    text: `Deck
22 Forest
4 Llanowar Elves
4 Elvish Mystic
4 Grizzly Bears
4 Kalonian Tusker
4 Leatherback Baloth
4 Garruk's Companion
4 Giant Growth
4 Rancor
3 Craw Wurm
3 Colossal Dreadmaw`,
  },
  {
    id: 'starter-uw',
    name: 'Starter — Azorius Skies',
    updated: 0,
    text: `Deck
11 Plains
11 Island
4 Suntail Hawk
4 Wind Drake
4 Serra Angel
4 Healer's Hawk
4 Counterspell
4 Pacifism
4 Divination
4 Swords to Plowshares
2 Opt
2 Air Elemental
2 Glorious Anthem`,
  },
];

export function loadDecks(): SavedDeck[] {
  try {
    const raw = localStorage.getItem(KEY);
    const mine: SavedDeck[] = raw ? JSON.parse(raw) : [];
    return [...mine, ...STARTERS.filter((s) => !mine.some((m) => m.id === s.id))];
  } catch {
    return [...STARTERS];
  }
}

export function saveDeck(d: SavedDeck) {
  try {
    const raw = localStorage.getItem(KEY);
    const mine: SavedDeck[] = raw ? JSON.parse(raw) : [];
    const i = mine.findIndex((x) => x.id === d.id);
    if (i >= 0) mine[i] = d;
    else mine.unshift(d);
    localStorage.setItem(KEY, JSON.stringify(mine));
  } catch {
    /* storage unavailable */
  }
}

export function deleteDeck(id: string) {
  try {
    const raw = localStorage.getItem(KEY);
    const mine: SavedDeck[] = raw ? JSON.parse(raw) : [];
    localStorage.setItem(KEY, JSON.stringify(mine.filter((m) => m.id !== id)));
  } catch {
    /* ignore */
  }
}

export function pref(key: string, fallback = ''): string {
  try {
    return localStorage.getItem(`manaforge.${key}`) ?? fallback;
  } catch {
    return fallback;
  }
}
export function setPref(key: string, v: string) {
  try {
    localStorage.setItem(`manaforge.${key}`, v);
  } catch {
    /* ignore */
  }
}
