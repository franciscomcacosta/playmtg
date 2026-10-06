// Plugin: "… can't be activated" (Stony Silence, Cursed Totem, Pithing-Needle-free locks, Grand Abolisher).
//  "Activated abilities of artifacts / creatures can't be activated (unless they're mana abilities)."
//  "Your opponents can't activate abilities of artifacts, creatures, or enchantments (during your turn)."
//  "During your turn, your opponents can't cast spells or activate abilities of artifacts, creatures, or enchantments."
import { EXT } from '../ext';
import { sourcesWith } from '../rules';

const TYPES = (ph: string) => ph.replace(/,? (?:and|or) /g, ', ').split(', ').map((w) => w.trim().replace(/s$/, '')).filter(Boolean);
const OK = new Set(['artifact', 'creature', 'enchantment', 'land', 'planeswalker']);

EXT.lines.push((line, pc) => {
  let m = line.match(/^activated abilities of (.+?)( your opponents control)? can't be activated( unless they're mana abilities)?$/);
  if (m) {
    const ts = TYPES(m[1].replace(/^(?:all )/, ''));
    if (!ts.every((t) => OK.has(t))) return false;
    pc.actLock = { types: ts, who: m[2] ? 'opp' : 'all', manaOk: !!m[3] };
    return true;
  }
  m = line.match(/^(during your turn, )?your opponents can't (cast spells or )?activate abilities of (.+?)( during your turn)?$/);
  if (m) {
    const ts = TYPES(m[3]);
    if (!ts.every((t) => OK.has(t))) return false;
    pc.actLock = { types: ts, who: 'opp', yourTurn: !!(m[1] || m[4]) };
    if (m[2]) pc.castLock = { who: 'opp', f: {}, duringYourTurn: !!(m[1] || m[4]) };
    return true;
  }
  return false;
});
EXT.hooks.canActivate.push((s, p, iid, a, api) => {
  const srcs = sourcesWith(s, 'actLock');
  if (!srcs.length) return undefined;
  const ch = api.chars(s, iid);
  for (const b of srcs) {
    if (s.cards[b]?.zone !== 'battlefield') continue;
    const l = (api.chars(s, b).pc as any).actLock;
    if (!l) continue;
    const owner = s.cards[b].controller;
    if (l.who === 'opp' && p === owner) continue;
    if (l.yourTurn && s.active !== owner) continue;
    if (l.manaOk && a.isMana) continue;
    if (a.special === 'loyalty' && !l.types.includes('planeswalker')) continue;
    if (l.types.some((t: string) => ch.types.has(t))) return false;
  }
  return undefined;
});

// "Nonbasic lands are Mountains." (Blood Moon, Magus of the Moon) / "Lands you don't control are Islands" style
const LAND_COLOR: Record<string, string> = { plains: 'W', island: 'U', swamp: 'B', mountain: 'R', forest: 'G' };
EXT.lines.push((line, pc) => {
  const m = line.match(/^(nonbasic lands|all lands|lands your opponents control|nonbasic lands your opponents control) are (plains|islands|swamps|mountains|forests)$/);
  if (!m) return false;
  const type = m[2].replace(/s$/, '').replace(/^plain$/, 'plains');
  const filter: any = { types: ['land'] };
  if (/nonbasic/.test(m[1])) filter.notTypes = ['basic'];
  if (/opponents/.test(m[1])) filter.controller = 'opp';
  pc.landTypeAll = { filter, type, color: LAND_COLOR[type] };
  return true;
});

// Untap restrictions: Back to Basics, Winter Orb, Static Orb, Stasis.
const NW: Record<string, number> = { one: 1, two: 2, three: 3, four: 4 };
EXT.lines.push((line, pc) => {
  let m = line.match(/^(nonbasic lands|artifacts|creatures|lands|permanents) don't untap during their controllers' untap steps$/);
  if (m) {
    const f: any = { types: [m[1].replace(/^nonbasic /, '').replace(/s$/, '')] };
    if (/nonbasic/.test(m[1])) f.notTypes = ['basic'];
    if (f.types[0] === 'permanent') f.types = ['permanent'];
    pc.untapLock = { filter: f };
    return true;
  }
  m = line.match(/^(as long as ~ is untapped, )?players can't untap more than (one|two|three|\d+) (lands?|permanents?|artifacts?|creatures?) during their untap steps$/);
  if (m) { pc.untapLimit = { n: NW[m[2]] ?? +m[2], type: m[3].replace(/s$/, ''), whileUntapped: !!m[1] }; return true; }
  if (/^players skip their untap steps$/.test(line)) { pc.skipUntap = true; return true; }
  return false;
});
EXT.hooks.untap.push((s, iid, api) => {
  const c = s.cards[iid];
  const ch = api.chars(s, iid);
  for (const b of s.battlefield) {
    const pc = api.chars(s, b).pc as any;
    if (pc.skipUntap) return false;
    if (pc.untapLock && api.matchesFilter(s, iid, { ...pc.untapLock.filter, zone: 'battlefield' }, s.cards[b].controller, b)) return false;
    const l = pc.untapLimit;
    if (l && !(l.whileUntapped && s.cards[b].tapped)) {
      if (l.type !== 'permanent' && !ch.types.has(l.type)) continue;
      const k = ((s as any).untapCount ??= { turn: -1, n: {} });
      if (k.turn !== s.turn) { k.turn = s.turn; k.n = {}; }
      const key = `${b}:${c.controller}`;
      if ((k.n[key] ?? 0) >= l.n) return false;
      k.n[key] = (k.n[key] ?? 0) + 1;
    }
  }
  return undefined;
});
// "Each land is a Swamp in addition to its other land types." (Urborg, Yavimaya)
EXT.lines.push((line, pc) => {
  const m = line.match(/^(each land|lands you control|nonbasic lands) (?:is|are) (?:a |an )?(plains|island|swamp|mountain|forest)s? in addition to (?:its|their) other land types$/);
  if (!m) return false;
  const filter: any = { types: ['land'] };
  if (/you control/.test(m[1])) filter.controller = 'you';
  if (/nonbasic/.test(m[1])) filter.notTypes = ['basic'];
  pc.landTypeAll = { filter, type: m[2], color: LAND_COLOR[m[2]], add: true };
  return true;
});
