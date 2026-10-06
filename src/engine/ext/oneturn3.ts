// Plugin: one-turn combat restrictions and keyword loss.
//  - "Target creature loses flying until end of turn." / "… gets -1/-0 and loses flying until end of turn."
//  - "Target creature can't attack or block this turn."
//  - "Target creature blocks this turn if able."
//  - "If that creature or planeswalker would die this turn, exile it instead." (→ the dieExile effect in triggers.ts)
//  - "~ can't be blocked except by three or more creatures."
import { EXT } from '../ext';
import { parseSentence, parseSubject } from '../oracle';

const W: Record<string, number> = { two: 2, three: 3, four: 4, five: 5 };
const KW = '(flying|first strike|double strike|deathtouch|lifelink|trample|vigilance|haste|reach|menace|hexproof|indestructible|defender)';

EXT.rules.push([new RegExp(`^(.+?) loses ${KW} until end of turn$`), (m, ctx) => {
  const what = parseSubject(m[1], ctx);
  return what ? [{ k: 'ext', name: 'tempMod', what, mod: { removeKeywords: [m[2]] } }] : null;
}]);
EXT.rules.push([new RegExp(`^(.+?) gets ([+-]\\d+\\/[+-]\\d+) and loses ${KW} until end of turn$`), (m, ctx) => {
  const base = parseSentence(`${m[1]} gets ${m[2]} until end of turn`, ctx);
  const pump = base?.find((e: any) => e.k === 'pump') as any;
  if (!base || !pump) return null;
  return [...base, { k: 'ext', name: 'tempMod', what: pump.what, mod: { removeKeywords: [m[3]] } }];
}]);
EXT.rules.push([/^(target creature|target creature an opponent controls|that creature|it) can't attack or block this turn$/, (m, ctx) => {
  const what = parseSubject(m[1], ctx);
  return what ? [{ k: 'ext', name: 'tempMod', what, mod: { cantAttack: true, cantBlock: true } }] : null;
}]);
EXT.effects.tempMod = ({ s, item, e, api }) => {
  for (const c of api.subjCards(s, item, e.what)) if (s.cards[c]?.zone === 'battlefield') s.cards[c].mods.push({ ...e.mod, until: 'eot', source: item.source, ts: s.ts++ });
  return 'done';
};

// ---- blocks this turn if able (any attacker) ----
EXT.rules.push([/^(target creature(?: an opponent controls| defending player controls)?|that creature|it) blocks this turn if able$/, (m, ctx) => {
  const what = parseSubject(m[1], ctx);
  return what ? [{ k: 'ext', name: 'mustBlockAny', what }] : null;
}]);
EXT.effects.mustBlockAny = ({ s, item, e, api }) => {
  for (const c of api.subjCards(s, item, e.what)) if (s.cards[c]) (s.cards[c] as any).mustBlockAny = s.turn;
  return 'done';
};
EXT.hooks.validateBlocks.push((s, list, api) => {
  const attackers = (s.combat?.attackers ?? []).map((a) => a.iid);
  for (const b of s.battlefield) {
    const c = s.cards[b] as any;
    if (c.mustBlockAny !== s.turn || c.tapped || list.some((x) => x.blocker === b)) continue;
    if (attackers.some((a) => api.canBlock(s, b, a))) return `${api.nm(s, b)} blocks this turn if able`;
  }
  // "can't be blocked except by N or more creatures"
  for (const a of attackers) {
    const min = (api.chars(s, a).pc as any).minBlockers;
    const n = list.filter((x) => x.attacker === a).length;
    if (min && n > 0 && n < min) return `${api.nm(s, a)} can't be blocked except by ${min} or more creatures`;
  }
  return null;
});

EXT.rules.push([/^if that creature or planeswalker would die this turn, exile it instead$/, (_m, ctx) => [{ k: 'ext', name: 'dieExile', what: ctx.last ?? { t: 'target', spec: 0 } }]]);

EXT.lines.push((line, pc) => {
  const m = line.match(/^~ can't be blocked except by (three|four|five|\d+) or more creatures$/);
  if (!m) return false;
  pc.minBlockers = /^\d+$/.test(m[1]) ? +m[1] : W[m[1]];
  return true;
});
