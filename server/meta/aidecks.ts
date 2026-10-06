// Decks for the AI opponent: hand-made constructed lists, and generated Commander decks built around a random
// legendary creature (singleton, inside its color identity, fully automated cards only).
import type { CardDb } from '../cards';
import type { CardDef } from '../../src/engine/cardTypes';
import { cardAutomation, parseCard } from '../../src/engine/oracle';

const CONSTRUCTED: { name: string; text: string; avatar: string }[] = [
  { name: 'Red Aggro', avatar: 'a-chandra', text: 'Deck\n22 Mountain\n4 Goblin Guide\n4 Monastery Swiftspear\n4 Raging Goblin\n4 Lightning Bolt\n4 Shock\n4 Lava Spike\n4 Searing Spear\n4 Valley Dasher\n4 Keldon Raider\n2 Fireblast' },
  { name: 'Green Stompy', avatar: 'a-garruk', text: "Deck\n22 Forest\n4 Llanowar Elves\n4 Elvish Mystic\n4 Grizzly Bears\n4 Kalonian Tusker\n4 Leatherback Baloth\n4 Garruk's Companion\n4 Giant Growth\n4 Rancor\n3 Craw Wurm\n3 Colossal Dreadmaw" },
  { name: 'Azorius Skies', avatar: 'a-teferi', text: "Deck\n11 Plains\n11 Island\n4 Suntail Hawk\n4 Wind Drake\n4 Serra Angel\n4 Healer's Hawk\n4 Counterspell\n4 Pacifism\n4 Divination\n4 Swords to Plowshares\n2 Opt\n2 Air Elemental\n2 Glorious Anthem" },
  { name: 'Mono-Black Control', avatar: 'a-liliana', text: 'Deck\n24 Swamp\n4 Duress\n4 Doom Blade\n4 Sign in Blood\n4 Vampire Nighthawk\n4 Gray Merchant of Asphodel\n4 Murder\n4 Dread Shade\n4 Gifted Aetherborn\n2 Sheoldred, the Apocalypse\n2 Crypt Ghast' },
];
const NAMES = ['Vexis', 'Orrin', 'Sable', 'Wren', 'Mordain', 'Ilsa', 'Corvin', 'Tamsin'];
const BASIC: Record<string, string> = { W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain', G: 'Forest' };

let pool: { commanders: CardDef[]; cards: CardDef[] } | null = null;
/** True once the Commander pool is built (building it on demand takes many seconds). */
export const aiPoolReady = () => !!pool;
function commanderPool(db: CardDb) {
  if (pool) return pool;
  const ok = (c: CardDef) => (c as any).legal?.includes?.('commander') && !c.name.startsWith('A-') && !/\bBasic\b/.test(c.typeLine);
  const auto = (c: CardDef) => {
    try {
      return cardAutomation(c) === 'full';
    } catch {
      return false;
    }
  };
  const commanders = db.cards.filter((c) => ok(c) && /Legendary.*Creature/.test(c.typeLine) && c.cmc >= 2 && c.cmc <= 6 && (c.colorIdentity?.length ?? 0) >= 1 && (c.colorIdentity?.length ?? 0) <= 2 && auto(c));
  const cards = db.cards.filter((c) => ok(c) && !/\bLand\b/.test(c.typeLine) && c.cmc <= 7 && /Creature|Instant|Sorcery|Artifact|Enchantment/.test(c.typeLine) && !/Legendary.*Creature/.test(c.typeLine) && auto(c));
  pool = { commanders, cards };
  return pool;
}
/** Warm the Commander pool in the background, a few hundred cards at a time, so the server stays responsive. */
export function warmAiDecks(db: CardDb) {
  setTimeout(async () => {
    const t = Date.now();
    for (let i = 0; i < db.cards.length && !pool; i += 250) {
      for (const c of db.cards.slice(i, i + 250)) {
        try {
          cardAutomation(c); // fills the parse cache
        } catch {}
      }
      await new Promise((r) => setImmediate(r));
    }
    commanderPool(db);
    console.log(`[ai] Commander deck pool ready in ${Date.now() - t}ms (${pool!.commanders.length} commanders, ${pool!.cards.length} cards)`);
  }, 1500);
}

function commanderDeckText(db: CardDb): { text: string; commander: string } {
  const { commanders, cards } = commanderPool(db);
  const cmd = commanders[Math.floor(Math.random() * commanders.length)];
  const ident = new Set(cmd.colorIdentity ?? []);
  const fits = cards.filter((c) => (c.colorIdentity ?? []).every((x) => ident.has(x)));
  // creature-heavy curve: about 34 creatures, 28 other spells
  const shuffled = [...fits].sort(() => Math.random() - 0.5);
  const creatures = shuffled.filter((c) => /Creature/.test(c.typeLine)).slice(0, 34);
  const spells = shuffled.filter((c) => !/Creature/.test(c.typeLine) && c.cmc >= 1).slice(0, 62 - creatures.length);
  const chosen = [...creatures, ...spells];
  const lands = 99 - chosen.length;
  const cols = [...ident];
  const lines = ['Commander', `1 ${cmd.name}`, '', 'Deck', ...chosen.map((c) => `1 ${c.name}`)];
  cols.forEach((c, i) => lines.push(`${Math.floor(lands / cols.length) + (i < lands % cols.length ? 1 : 0)} ${BASIC[c]}`));
  void parseCard;
  return { text: lines.join('\n'), commander: cmd.name };
}

export function aiDeckFor<D extends { cards: CardDef[]; commanders: CardDef[] }>(db: CardDb, format: 'constructed' | 'commander', build: (text: string, format: 'constructed' | 'commander') => D) {
  const name = NAMES[Math.floor(Math.random() * NAMES.length)];
  if (format === 'commander') {
    const { text, commander } = commanderDeckText(db);
    return { name, text, deck: build(text, 'commander'), sub: `AI · ${commander}`, avatar: 'a-liliana' };
  }
  const pick = CONSTRUCTED[Math.floor(Math.random() * CONSTRUCTED.length)];
  return { name, text: pick.text, deck: build(pick.text, 'constructed'), sub: `AI · ${pick.name}`, avatar: pick.avatar };
}
