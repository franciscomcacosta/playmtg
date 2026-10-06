// Plugin: damage and draw replacement effects (CR 614/615).
//  - "If damage would be dealt to ~, put that many +1/+1 (-1/-1) counters on it instead." (Phytohydra, Lichenthrope)
//  - "If damage would be dealt to ~ (while it has a +1/+1 counter on it), prevent that damage and remove that many
//     +1/+1 counters from it." (Protean Hydra, Magma Pummeler, Oathsworn Knight, Polukranos)
//  - "If damage would be dealt to ~, prevent that damage. Put a -1/-1 counter on it for each 1 damage prevented this way." (Phyrexian Hydra)
//  - "If a source would deal damage to <who>, it deals double that damage to … instead." (Fiendish Duo, Goldnight Castigator)
//  - "If a source would deal damage to <who>, prevent N of that damage." (Shield of the Realm, Daunting Defender)
//  - "If you would draw a card while your library has no cards in it, you win the game instead." (Laboratory Maniac)
//  - "If you would draw a card except the first one you draw in each of your draw steps, draw two cards instead."
import { EXT } from '../ext';
import { sourcesWith } from '../rules';
import { parseCond, parseFilter } from '../oracle';

EXT.lines.push((line, pc) => {
  let m = line.match(/^if damage would be dealt to ~( while it has a \+1\/\+1 counter on it)?, (?:put that many (\+1\/\+1|-1\/-1) counters on (?:it|~) instead|prevent that damage and remove that many \+1\/\+1 counters from (?:it|~)|(prevent that damage and remove a \+1\/\+1 counter from (?:it|~))|prevent that damage\. put (?:a|an) (-1\/-1|\+1\/\+1) counter on (?:it|~) for each 1 damage prevented this way)$/);
  if (!m) return false;
  pc.selfDmgRepl = m[2] ? { add: m[2] } : m[4] ? { add: m[4] } : m[3] ? { remove: '+1/+1', one: true } : { remove: '+1/+1' };
  if (m[1]) pc.selfDmgRepl.whileCounter = '+1/+1';
  return true;
});

const WHO = "you or an? [a-z ]+? you control|another [a-z ]+? you control|you|an opponent|~|this creature|equipped creature|enchanted creature|a creature you control|you or a creature you control|an opponent or a permanent an opponent controls|you or a permanent you control|a planeswalker you control|another creature you control|an? [a-z ]+? creature you control|an? [a-z ]+? you control";
EXT.lines.push((line, pc) => {
  let m = line.match(new RegExp(`^if a source (you control |an opponent controls )?would deal damage to (${WHO}), (?:it|that source) deals double that damage(?: to [a-z~' ]+?)? instead$`));
  if (m) { const w = who(m[2]); if (!w) return false; (pc.dmgMods ??= []).push({ who: w, double: true, src: m[1]?.trim() }); return true; }
  m = line.match(new RegExp(`^(?:as long as (.+?), )?if (a source|an? (?:white|blue|black|red|green|artifact) source|a creature|an artifact|a (?:white|blue|black|red|green) creature)( you control| an opponent controls)? would deal (combat )?damage to (${WHO}), prevent (\\d+|all but 1|half that damage, rounded (?:up|down))(?: of that damage)?$`));
  if (m) {
    const w = who(m[5]);
    if (!w) return false;
    let srcF: any = null;
    if (m[2] !== 'a source') {
      const ph = m[2].replace(/^an? /, '').replace(/ source$/, '');
      const CW: any = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };
      srcF = CW[ph] ? { colors: [CW[ph]] } : parseFilter(ph);
      if (!srcF) return false;
    }
    const cond = m[1] ? parseCond(m[1]) : null;
    if (m[1] && !cond) return false;
    (pc.dmgMods ??= []).push({ who: w, prevent: m[6] === 'all but 1' ? 'allBut1' : /^half/.test(m[6]) ? (m[6].endsWith('up') ? 'halfUp' : 'halfDown') : +m[6], srcF, src: m[3]?.trim(), combat: !!m[4], cond });
    return true;
  }
  return false;
});
function who(t: string): any | null {
  const fixed: Record<string, any> = {
    you: { you: true }, 'an opponent': { opp: true }, '~': { self: true }, 'this creature': { self: true }, 'equipped creature': { attached: true }, 'enchanted creature': { attached: true },
    'a creature you control': { mine: { types: ['creature'] } }, 'you or a creature you control': { you: true, mine: { types: ['creature'] } },
    'an opponent or a permanent an opponent controls': { opp: true, theirs: {} }, 'you or a permanent you control': { you: true, mine: {} },
    'a planeswalker you control': { mine: { types: ['planeswalker'] } }, 'another creature you control': { mine: { types: ['creature'], other: true } },
  };
  if (fixed[t]) return fixed[t];
  let mm = t.match(/^you or an? (.+?) you control$/);
  if (mm) { const f = parseFilter(mm[1]); if (f) return { you: true, mine: f }; }
  mm = t.match(/^another (.+?) you control$/);
  if (mm) { const f = parseFilter(mm[1]); if (f) return { mine: { ...f, other: true } }; }
  const m = t.match(/^an? (.+?) you control$/);
  if (m) { const f = parseFilter(m[1].replace(/^another /, '')); if (f) return { mine: { ...f, ...(/^another /.test(m[1]) ? { other: true } : {}) } }; }
  return null;
}
const srcOk = (s: any, api: any, b: string, md: any, source: string, combat: boolean): boolean => {
  if (md.combat && !combat) return false;
  if (md.noncombat && combat) return false;
  const me = s.cards[b].controller;
  if (md.src === 'you control' && s.cards[source]?.controller !== me) return false;
  if (md.src === 'an opponent controls' && s.cards[source]?.controller === me) return false;
  if (md.srcF && !(s.cards[source] && api.matchesFilter(s, source, { ...md.srcF, zone: s.cards[source].zone }, me))) return false;
  if (md.cond && !api.evalCond(s, md.cond, me, b)) return false;
  return true;
};
const matches = (s: any, api: any, src: string, w: any, to: any): boolean => {
  const me = s.cards[src].controller;
  if (to.kind === 'player') return (w.you && to.idx === me) || (w.opp && to.idx !== me);
  if (to.kind !== 'card' || !s.cards[to.iid]) return false;
  const c = s.cards[to.iid];
  if (w.self && to.iid === src) return true;
  if (w.attached && s.cards[src].attachedTo === to.iid) return true;
  if (w.mine && c.controller === me && api.matchesFilter(s, to.iid, { ...w.mine, zone: 'battlefield' }, me, src)) return true;
  if (w.theirs && c.controller !== me) return true;
  return false;
};

EXT.hooks.damage.push((s, source, to, n, _combat, api) => {
  if (n <= 0) return n;
  // doubling first, then prevention (the affected player orders replacement effects; prevention after is the smaller total)
  let out = n;
  const srcs = sourcesWith(s, 'dmgMods');
  for (const b of srcs) {
    const mods = (api.chars(s, b).pc as any).dmgMods as any[] | undefined;
    if (!mods) continue;
    for (const md of mods) {
      if (!md.double || !matches(s, api, b, md.who, to)) continue;
      if (md.src === 'you control' && s.cards[source]?.controller !== s.cards[b].controller) continue;
      if (md.src === 'an opponent controls' && s.cards[source]?.controller === s.cards[b].controller) continue;
      out *= 2;
    }
  }
  for (const b of srcs) {
    const mods = (api.chars(s, b).pc as any).dmgMods as any[] | undefined;
    if (!mods) continue;
    for (const md of mods) if (md.prevent && matches(s, api, b, md.who, to) && srcOk(s, api, b, md, source, _combat)) out = md.prevent === 'allBut1' ? Math.min(out, 1) : md.prevent === 'halfUp' ? Math.floor(out / 2) : md.prevent === 'halfDown' ? Math.ceil(out / 2) : Math.max(0, out - md.prevent);
  }
  // the creature's own replacement
  if (to.kind === 'card' && s.cards[to.iid]?.zone === 'battlefield' && out > 0) {
    const r = (api.chars(s, to.iid).pc as any).selfDmgRepl;
    if (r && (!r.whileCounter || (s.cards[to.iid].counters[r.whileCounter] ?? 0) > 0) && (!r.cond || api.evalCond(s, r.cond, s.cards[to.iid].controller, to.iid))) {
      if (r.add) api.addCounters(s, to.iid, r.add, out);
      else if (r.remove) (s.cards[to.iid].counters[r.remove] = Math.max(0, (s.cards[to.iid].counters[r.remove] ?? 0) - (r.one ? 1 : out)));
      api.log(s, `${api.nm(s, to.iid)}: damage replaced (${r.add ? `${out} ${r.add} counters` : `${out} counters removed`}).`);
      return 0;
    }
  }
  return out;
});

// ---- draws ----
EXT.lines.push((line, pc) => {
  if (/^if you would draw a card while your library has no cards in it, you win the game instead$/.test(line)) { pc.labManiac = true; return true; }
  if (/^if you would draw a card except the first one you draw in each of your draw steps, draw two cards instead$/.test(line)) { pc.drawTwoExtra = true; return true; }
  return false;
});
let inExtra = false;
EXT.hooks.draw.push((s, p, api) => {
  const mine = s.battlefield.filter((b: string) => s.cards[b].controller === p);
  if (!s.players[p].library.length && mine.some((b: string) => (api.chars(s, b).pc as any).labManiac)) {
    s.players[1 - p].lost = true;
    api.log(s, `${api.pname(s, p)} wins the game (drawing from an empty library).`, p);
    return 'skip';
  }
  if (inExtra) return undefined;
  const n = mine.filter((b: string) => (api.chars(s, b).pc as any).drawTwoExtra).length;
  if (!n) return undefined;
  const d = ((s as any).drawStepDraws ??= { turn: -1, n: 0 });
  if (d.turn !== s.turn) { d.turn = s.turn; d.n = 0; }
  const inDrawStep = s.step === 'draw' && s.active === p;
  if (inDrawStep) d.n++;
  if (inDrawStep && d.n === 1) return undefined;
  // each replacement: this draw becomes two draws (so n effects: 2^n)
  inExtra = true;
  try { api.drawCards(s, p, (1 << n) - 1); } finally { inExtra = false; }
  return undefined;
});
