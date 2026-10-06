// The Assets page from the Claude Design file: a live gallery of the animated components (coins, embers, XP, card
// frames, foils, rank crests, booster opening) used across Manaforge. The counters here are a sandbox, not your wallet.
import React from 'react';
import { AssetsView, AssetsView_CSS } from './AssetsView';
import { fmt } from './dc';

const ART = (n: string) => 'https://api.scryfall.com/cards/named?exact=' + encodeURIComponent(n).replace(/'/g, '%27') + '&format=image&version=art_crop';
const IMG = (n: string) => 'https://api.scryfall.com/cards/named?exact=' + encodeURIComponent(n).replace(/'/g, '%27') + '&format=image&version=normal';
const FRAMES = [['white', 'White', 'Serra Angel'], ['blue', 'Blue', 'Brainstorm'], ['black', 'Black', 'Thoughtseize'], ['red', 'Red', 'Lightning Bolt'], ['green', 'Green', 'Llanowar Elves'], ['gold', 'Multicolor', "Atraxa, Praetors' Voice"], ['grey', 'Artifact', 'Sol Ring'], ['ember', 'Event', 'Glorybringer']];
const POOL: Record<string, string[]> = {
  common: ['Llanowar Elves', 'Giant Growth', 'Lightning Bolt', 'Brainstorm', 'Dark Ritual', 'Swords to Plowshares', 'Counterspell', 'Shock', 'Opt', 'Duress'],
  uncommon: ['Serra Angel', 'Snapcaster Mage', 'Bonecrusher Giant', 'Thoughtseize', 'Mana Leak'],
  rare: ['Shivan Dragon', 'Glorybringer', 'Teferi, Hero of Dominaria'],
  mythic: ["Atraxa, Praetors' Voice", 'Sheoldred, the Apocalypse', 'Ugin, the Spirit Dragon'],
};
const pick = (a: string[], n: number) => [...a].sort(() => Math.random() - 0.5).slice(0, n);
const makePack = () =>
  JSON.stringify([
    ...pick(POOL.common, 4).map((n) => ({ img: IMG(n), rarity: 'common' })),
    ...pick(POOL.uncommon, 2).map((n) => ({ img: IMG(n), rarity: 'uncommon' })),
    Math.random() < 0.3 ? { img: IMG(pick(POOL.mythic, 1)[0]), rarity: 'mythic' } : { img: IMG(pick(POOL.rare, 1)[0]), rarity: 'rare' },
  ]);

export class Assets extends React.Component<{}, any> {
  state: any = { gold: 2450, embers: 2100, xp: 640, pack: makePack() };
  rootRef = React.createRef<HTMLDivElement>();
  boosterRef = React.createRef<any>();
  q(s: string) {
    return this.rootRef.current?.querySelector(s) ?? null;
  }
  fly(kind: string, key: string, amt: number, count: number) {
    const MF = (window as any).MF;
    if (!MF) return this.setState((s: any) => ({ [key]: s[key] + amt }));
    MF.fly(kind, this.q(`[data-src="${kind}"]`), this.q(`[data-tgt="${kind}"]`), { count, onDone: () => this.setState((s: any) => ({ [key]: s[key] + amt })) });
  }
  render() {
    const s = this.state;
    const v = {
      rootRef: this.rootRef, boosterRef: this.boosterRef, packCards: s.pack,
      revealPack: () => this.boosterRef.current?.revealAll?.(),
      newPack: () => this.setState({ pack: makePack() }, () => this.boosterRef.current?.reset?.()),
      goldTxt: fmt(s.gold), embersTxt: fmt(s.embers), xpTxt: fmt(s.xp) + ' XP',
      flyGold: () => this.fly('gold', 'gold', 250, 10),
      flyEmbers: () => this.fly('embers', 'embers', 100, 7),
      flyXp: () => this.fly('xp', 'xp', 300, 6),
      frames: FRAMES.map(([id, name, a]) => ({ id, name, art: ART(a) })),
      foils: [
        { color: 'gold', name: 'Sheoldred', art: ART('Sheoldred, the Apocalypse'), tone: 'rare', ring: 'rgba(240,169,59,.5)', label: 'Foil · rare' },
        { color: 'ember', name: 'Ugin', art: ART('Ugin, the Spirit Dragon'), tone: 'mythic', ring: 'rgba(255,176,112,.7)', label: 'Foil · mythic' },
      ],
      ranks: ([['bronze', 3, 'BRONZE', '#d09060'], ['silver', 2, 'SILVER', '#c8d0dc'], ['gold', 2, 'GOLD', '#f7dc9a'], ['platinum', 1, 'PLATINUM', '#9ae0c0'], ['mythic', 0, 'MYTHIC', '#ffb070']] as const).map(([tier, div, name, c]) => ({ tier, div, name, c })),
      packArt: ART('Brainstorm'), packArt1: ART('Brainstorm'), packArt2: ART('Shivan Dragon'),
    };
    return (
      <>
        <style>{AssetsView_CSS}</style>
        <AssetsView v={v} />
      </>
    );
  }
}
