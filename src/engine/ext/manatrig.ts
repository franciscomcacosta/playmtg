// Plugin: triggered mana abilities (CR 605.1b) — they resolve immediately, while the mana ability that caused them does.
//  "Whenever enchanted land is tapped for mana, its controller adds an additional {G} / one mana of any color …" (Wild Growth, Utopia Sprawl)
//  "Whenever you tap a Swamp / Forest / creature / land for mana, add an additional {B} / one mana of any type that land produced." (Crypt Ghast, Mirari's Wake)
//  "Whenever a player taps a land for mana, that player adds one mana of any type that land produced." (Mana Flare, Heartbeat of Spring)
//  "Whenever a player taps a land for mana, ~ deals 1 damage to that player." (Manabarbs)
// "Any color" mana is added as the color the land produced (or green for colorless lands): there's no time to ask
// in the middle of paying a cost.
import { EXT } from '../ext';
import { sourcesWith } from '../rules';
import { looseFilter } from '../oracle';

const W: Record<string, number> = { one: 1, two: 2, three: 3 };
const mana = (t: string): any | null => {
  let m: RegExpMatchArray | null;
  if ((m = t.match(/^((?:\{[wubrgc]\})+)$/))) return { fixed: (m[1].match(/[wubrgc]/g) ?? []).map((c) => c.toUpperCase()) };
  if ((m = t.match(/^(one|two|three) mana of any (?:one )?color$/))) return { any: W[m[1]] };
  if ((m = t.match(/^(one|two|three) mana in any combination of colors$/))) return { any: W[m[1]] };
  if (/^one mana of any type that (?:land|permanent) produced$/.test(t)) return { mirror: 1 };
  if (/^one mana of the chosen color$/.test(t)) return { chosen: 1 };
  return null;
};
EXT.lines.push((line, pc) => {
  let m = line.match(/^whenever enchanted (?:land|forest|plains|island|swamp|mountain) is tapped for mana, its controller adds an additional (.+)$/);
  if (m) { const a = mana(m[1]); if (!a) return false; (pc.manaTrig ??= []).push({ scope: 'attached', add: a }); return true; }
  m = line.match(/^whenever you tap (?:a|an) (.+?) for mana, add (?:an additional )?(.+)$/);
  if (m) {
    const f = m[1] === 'land' ? { types: ['land'] } : looseFilter(m[1]);
    const a = mana(m[2].replace(/^an additional /, ''));
    if (!f || !a) return false;
    (pc.manaTrig ??= []).push({ scope: 'you', filter: { ...f, zone: undefined }, add: a });
    return true;
  }
  m = line.match(/^whenever a player taps a land for mana, (?:that player adds (.+?)|~ deals (\d+) damage to that player)$/);
  if (m) {
    if (m[1]) { const a = mana(m[1]); if (!a) return false; (pc.manaTrig ??= []).push({ scope: 'any', filter: { types: ['land'] }, add: a }); }
    else (pc.manaTrig ??= []).push({ scope: 'any', filter: { types: ['land'] }, dmg: +m[2] });
    return true;
  }
  return false;
});

EXT.hooks.manaTapped.push((s, p, iid, colors, api) => {
  const base = (colors.find((c) => c !== 'C') ?? 'G') as string;
  for (const b of sourcesWith(s, 'manaTrig')) {
    const src: any = s.cards[b];
    if (!src || src.phasedOut || src.zone !== 'battlefield') continue;
    const list = (api.chars(s, b).pc as any).manaTrig as any[] | undefined;
    if (!list) continue;
    for (const t of list) {
      if (t.scope === 'attached' && src.attachedTo !== iid) continue;
      if (t.scope === 'you' && src.controller !== p) continue;
      if (t.filter && !api.matchesFilter(s, iid, { ...t.filter, zone: 'battlefield' }, src.controller, b)) continue;
      if (t.dmg) { api.dealDamage(s, b, { kind: 'player', idx: p }, t.dmg, false); continue; }
      const pool = s.players[p].pool as any;
      const a = t.add;
      if (a.fixed) for (const c of a.fixed) pool[c] = (pool[c] ?? 0) + 1;
      else if (a.mirror) { const c = colors[0] ?? 'C'; pool[c] = (pool[c] ?? 0) + 1; }
      else if (a.chosen) { const c = src.chosenColor ?? base; pool[c] = (pool[c] ?? 0) + 1; }
      else if (a.any) pool[base] = (pool[base] ?? 0) + a.any;
    }
  }
});
