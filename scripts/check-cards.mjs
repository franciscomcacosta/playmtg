import { existsSync } from 'node:fs';
if (!existsSync(new URL('../data/cards.json', import.meta.url))) {
  console.log('\n[manaforge] Card database not built yet. Run `npm run cards` to download every English card from Scryfall.\n');
}
