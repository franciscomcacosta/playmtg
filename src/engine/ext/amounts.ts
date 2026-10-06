// Plugin: amounts ("where X is …", "equal to …") the core count parser doesn't know.
// Each phrase becomes { ext: name, … }, evaluated by EXT.amounts[name] (see evalAmt in rules.ts).
import { EXT } from '../ext';
import { looseFilter, parseFilter } from '../oracle';
import { chars, baseChars, matchesFilter } from '../rules';
import { tt } from './conds';
import { partySize, gyTypeCount } from './delirium';
import type { GameState, PlayerIdx } from '../types';

const COL: Record<string, string> = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };
const mine = (s: GameState, p: PlayerIdx) => s.battlefield.filter((b) => s.cards[b].controller === p && !s.cards[b].phasedOut);

const P: [RegExp, (m: RegExpMatchArray) => any | null][] = [
  [/^the number of basic land types among lands you control$/, () => ({ ext: 'domain' })],
  [/^the (?:amount|total amount) of life you(?:'ve)? gained this turn$/, () => ({ ext: 'lifeGained' })],
  [/^your life total$/, () => ({ ext: 'lifeTotal' })],
  [/^players?$/, () => ({ ext: 'playerCount' })],
  [/^the number of colors among permanents you control$/, () => ({ ext: 'colorsAmong' })],
  [/^the number of ([+-]\d\/[+-]\d|[a-z]+) counters on (?:~|it|this creature|this artifact)$/, (m) => ({ ext: 'selfCounters', counter: m[1] })],
  [/^the number of counters on (?:~|it)$/, () => ({ ext: 'selfCounters', counter: '*' })],
  [/^your devotion to (white|blue|black|red|green)(?: and (white|blue|black|red|green))?$/, (m) => ({ ext: 'devotion', colors: [COL[m[1]], m[2] ? COL[m[2]] : null].filter(Boolean) })],
  [/^the greatest (mana value|power|toughness) among (.+?)(?: you control)?$/, (m) => {
    const f = looseFilter(m[2].replace(/s$/, '')) ?? parseFilter(m[2]);
    if (f && (f as any).zone === 'graveyard') return { ext: 'greatest', stat: m[1] === 'mana value' ? 'cmc' : m[1], filter: { ...f }, gy: true };
    return f ? { ext: 'greatest', stat: m[1] === 'mana value' ? 'cmc' : m[1], filter: { ...f, zone: 'battlefield', controller: /you control/.test(m[0]) || !/opponent/.test(m[2]) ? 'you' : f.controller } } : null;
  }],
  [/^the number of (?:creatures|nontoken creatures) that died this turn$/, () => ({ ext: 'diedThisTurn' })],
  [/^the number of cards in (?:their|that player's|target player's|target opponent's) hand$/, () => ({ ext: 'oppHand' })],
  [/^the (?:amount|total amount) of mana spent to cast (?:~|it|this spell)$/, () => ({ ext: 'manaSpent' })],
  [/^the number of colors of mana spent to cast (?:~|it|this spell)$/, () => ({ ext: 'colorsSpent' })],
  [/^the number of differently named lands you control$/, () => ({ ext: 'namedLands' })],
  [/^your speed$/, () => ({ ext: 'speed' })],
  [/^the number of (.+?) cards in (all graveyards|your graveyard|target player's graveyard|that player's graveyard)$/, (m) => {
    const f = looseFilter(m[1]);
    return f ? { ext: 'gyCount', filter: f, mine: m[2] === 'your graveyard' } : null;
  }],
];
P.push(
  [/^the number of creatures in your party$/, () => ({ ext: 'party' })],
  [/^the number of card types among cards in (your graveyard|all graveyards)$/, (m) => ({ ext: 'gyTypes', all: m[1] === 'all graveyards' })],
  [/^the number of cards you've drawn this turn$/, () => ({ ext: 'drawnThisTurn' })],
  [/^your starting life total$/, () => ({ ext: 'startingLife' })],
  // plain "Zombies you control" / "artifacts and enchantments you control"
  [/^(?:the number of )?(.+?) you control$/, (m) => { const f = looseFilter(m[1].replace(/s$/, '')) ?? looseFilter(m[1]); return f ? { count: { ...f, zone: 'battlefield', controller: 'you' } } : null; }],
);
EXT.amountPhrases.push((phrase) => {
  const p = phrase.replace(/^the number of the /, 'the number of ');
  // a pattern that matches but can't build an amount falls through to the next one
  for (const [re, fn] of P) { const m = p.match(re); if (m) { const r = fn(m); if (r) return r; } }
  return null;
});

EXT.amounts.domain = (s, _a, you) => {
  const t = new Set<string>();
  for (const b of mine(s, you)) for (const x of ['plains', 'island', 'swamp', 'mountain', 'forest']) if (baseChars(s, b).subtypes.has(x)) t.add(x);
  return t.size;
};
EXT.amounts.lifeGained = (s, _a, you) => s.players[you].lifeGainedThisTurn ?? 0;
EXT.amounts.lifeTotal = (s, _a, you) => Math.max(0, s.players[you].life);
EXT.amounts.colorsAmong = (s, _a, you) => new Set(mine(s, you).flatMap((b) => baseChars(s, b).colors)).size;
EXT.amounts.selfCounters = (s, a, _you, self, ctx) => {
  const c = self ? s.cards[self] : undefined;
  const counters = c?.zone === 'battlefield' ? c.counters : ctx?.lkiCounters ?? c?.counters ?? {};
  return a.counter === '*' ? Object.values(counters).reduce((n: number, v: any) => n + Math.max(0, v), 0) : counters[a.counter] ?? 0;
};
EXT.amounts.devotion = (s, a, you) => {
  let n = 0;
  for (const b of mine(s, you)) {
    const cost = (s.defs[s.cards[b].defId].manaCost ?? '').split(' // ')[0].toUpperCase();
    for (const sym of cost.match(/\{[^}]+\}/g) ?? []) if (a.colors.some((c: string) => sym.includes(c))) n++;
  }
  return n;
};
EXT.amounts.greatest = (s, a, you, self) => {
  let best = 0;
  if ((a as any).gy) {
    for (const p of s.players) for (const g of p.graveyard) {
      if (!matchesFilter(s, g, (a as any).filter, you, self, true)) continue;
      const d = s.defs[s.cards[g].defId];
      const v = (a as any).stat === 'cmc' ? d.cmc ?? 0 : parseInt(((a as any).stat === 'power' ? d.power : d.toughness) ?? '0', 10) || 0;
      best = Math.max(best, v);
    }
    return best;
  }
  for (const b of s.battlefield) {
    if (!matchesFilter(s, b, a.filter, you, self, true)) continue;
    const ch = chars(s, b);
    best = Math.max(best, a.stat === 'cmc' ? ch.cmc ?? 0 : (ch as any)[a.stat] ?? 0);
  }
  return best;
};
EXT.amounts.diedThisTurn = (s) => tt(s).died[0];
EXT.amounts.oppHand = (s, _a, you, _self, ctx) => s.players[ctx?.triggerPlayer ?? (1 - you)].hand.length;
EXT.amounts.manaSpent = (s, _a, _you, self) => (self && (s.cards[self] as any)?.manaSpent) || 0;
EXT.amounts.colorsSpent = (s, _a, _you, self) => (self && (s.cards[self] as any)?.colorsSpent?.length) || 0;
EXT.amounts.namedLands = (s, _a, you) => new Set(mine(s, you).filter((b) => baseChars(s, b).types.has('land')).map((b) => s.defs[s.cards[b].defId].name)).size;
EXT.amounts.speed = (s, _a, you) => (s.players[you] as any).speed ?? 0;
EXT.amounts.gyCount = (s, a, you, self) => {
  let n = 0;
  for (const p of a.mine ? [you] : [0, 1]) for (const g of s.players[p].graveyard) if (matchesFilter(s, g, { ...a.filter, zone: 'graveyard' }, you, self, true)) n++;
  return n;
};

EXT.amounts.party = (s, _a, you) => partySize(s, you);
EXT.amounts.gyTypes = (s, a, you) => (a.all ? allGyTypes(s) : gyTypeCount(s, you));
function allGyTypes(s: GameState): number {
  const seen = new Set<string>();
  for (const p of [0, 1] as PlayerIdx[]) for (const c of s.players[p].graveyard) {
    const tl = s.defs[s.cards[c].defId].typeLine.toLowerCase().split('—')[0];
    for (const t of ['artifact', 'battle', 'creature', 'enchantment', 'instant', 'kindred', 'land', 'planeswalker', 'sorcery']) if (new RegExp(`\\b${t}\\b`).test(tl)) seen.add(t);
  }
  return seen.size;
}
EXT.amounts.drawnThisTurn = (s, _a, you) => { const t = (s as any).evTurn; return t && t.turn === s.turn ? t.draws?.[you] ?? 0 : 0; };
EXT.amounts.startingLife = (s, _a, you) => (s.players[you] as any).startingLife ?? 20;

EXT.amounts.playerCount = (s) => s.players.filter((p: any) => !p.lost).length;
