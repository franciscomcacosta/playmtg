// Plugin: another batch of short shapes.
//  - "At the beginning of the next end step, return that creature to its owner's hand." / "… sacrifice it."
//  - "Attacking creatures (you control) gain first strike / get +1/+0 until end of turn."
//  - "You may cast spells this turn as though they had flash."
//  - "~ becomes colorless until end of turn."
//  - "~ deals 2 damage to any target and 1 damage to any other target."
//  - "~ can't be blocked by artifact creatures." / "… by creatures with flying" etc.
//  - "Draw an additional card." (e.g. "At the beginning of your draw step, draw an additional card.")
//  - "As an additional cost to cast ~, exile two cards from your graveyard." (handled in costs.ts parser below)
//  - "You may exile two cards from your graveyard. (If you do, …)"
import { EXT } from '../ext';
import { parseSubject, spec, looseFilter } from '../oracle';

const W: Record<string, number> = { a: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };
const nw = (w: string) => (/^\d+$/.test(w) ? +w : W[w]);

// ---- end-step return / sacrifice (reuses endBounce from oneliners3 for the bounce) ----
EXT.rules.push([/^at the beginning of the next end step, (return (?:it|that creature|that card|those creatures|them) to (?:its|their) owner's hand|sacrifice (?:it|that creature|the creature|them|those creatures|those tokens|the token|~))$/, (m, ctx) => [{ k: 'ext', name: m[1].startsWith('return') ? 'endBounce' : 'endSac', what: /~$/.test(m[1]) ? { t: 'self' } : ctx.last ?? { t: 'self' } }]]);
EXT.rules.push([/^sacrifice (it|that creature|the creature|them|those creatures|those tokens|the token|~) at the beginning of the next end step$/, (m, ctx) => [{ k: 'ext', name: 'endSac', what: m[1] === '~' ? { t: 'self' } : ctx.last ?? { t: 'self' } }]]);
EXT.effects.endSac = ({ s, item, e, api }) => {
  for (const c of api.subjCards(s, item, e.what)) if (s.cards[c]) (s.cards[c] as any).endSac = { ts: s.cards[c].ts };
  return 'done';
};
EXT.hooks.step.push((s, step, api) => {
  if (step !== 'end') return;
  for (const b of [...s.battlefield]) {
    const c = s.cards[b] as any;
    if (!c.endSac) continue;
    const same = c.endSac.ts === c.ts;
    c.endSac = undefined;
    if (!same) continue;
    api.log(s, `${api.nm(s, b)} is sacrificed at the end step.`, c.controller);
    api.moveCard(s, b, 'graveyard', { cause: 'sacrifice' });
  }
});

// ---- attacking creatures gain / get ----
const KW = '(first strike|double strike|trample|lifelink|deathtouch|vigilance|menace|flying)';
EXT.rules.push([new RegExp(`^attacking creatures(?: you control)? (?:gain ${KW}|get ([+-]\\d+)\\/([+-]\\d+)(?: and gain ${KW})?) until end of turn$`), (m) => {
  const kw = [m[1], m[4]].filter(Boolean) as string[];
  return [{ k: 'ext', name: 'attackersMod', you: /you control/.test(m[0]), kw, p: m[2] ? +m[2] : 0, t: m[3] ? +m[3] : 0 }];
}]);
EXT.effects.attackersMod = ({ s, item, e, you }) => {
  for (const a of s.combat?.attackers ?? []) {
    const c = s.cards[a.iid];
    if (!c || c.zone !== 'battlefield' || (e.you && c.controller !== you)) continue;
    c.mods.push({ power: e.p, toughness: e.t, keywords: e.kw, until: 'eot', source: item.source, ts: s.ts++ });
  }
  return 'done';
};

// ---- flash for the turn ----
EXT.rules.push([/^(?:you may )?cast (?:spells|creature spells|sorcery spells) this turn as though they had flash$/, (m) => [{ k: 'ext', name: 'flashTurn', creaturesOnly: /creature/.test(m[0]), sorceryOnly: /sorcery/.test(m[0]) }]]);
EXT.effects.flashTurn = ({ s, e, you, api }) => { (api.P(s, you) as any).flashTurn = { turn: s.turn, creaturesOnly: e.creaturesOnly, sorceryOnly: e.sorceryOnly }; return 'done'; };
EXT.hooks.flash.push((s, iid, api) => {
  const c = s.cards[iid];
  const ft = c && (api.P(s, c.owner) as any).flashTurn;
  if (!ft || ft.turn !== s.turn) return false;
  const tl = s.defs[c.defId].typeLine.toLowerCase();
  if (ft.creaturesOnly && !/\bcreature\b/.test(tl)) return false;
  if (ft.sorceryOnly && !/\bsorcery\b/.test(tl)) return false;
  return true;
});

// ---- becomes colorless ----
EXT.rules.push([/^(~|target creature|it|that creature) becomes colorless until end of turn$/, (m, ctx) => {
  const what = parseSubject(m[1], ctx);
  return what ? [{ k: 'ext', name: 'tempMod', what, mod: { colors: [] } }] : null;
}]);

// ---- two targets, two amounts ----
EXT.rules.push([/^(~) deals (\d+) damage to any target and (\d+) damage to any other target$/, (m, ctx) => {
  const any = { types: ['creature', 'planeswalker', 'battle'] } as any;
  ctx.specs.push(spec(any, 1, false, 'any target', 'any'));
  const a = ctx.specs.length - 1;
  ctx.specs.push(spec(any, 1, false, 'any other target', 'any'));
  const b = ctx.specs.length - 1;
  return [{ k: 'damage', n: +m[2], to: [{ t: 'target', spec: a }], from: { t: 'self' } }, { k: 'damage', n: +m[3], to: [{ t: 'target', spec: b }], from: { t: 'self' } }];
}]);

// ---- can't be blocked by X ----
EXT.lines.push((line, pc) => {
  const m = line.match(/^~ can't be blocked by (.+?)$/);
  if (!m || /except|more than|power|toughness|this turn/.test(m[1])) return false;
  const f = looseFilter(m[1].replace(/s$/, '').replace(/ creatures?$/, ' creature'));
  if (!f) return false;
  (pc.notBlockableBy ??= []).push({ ...f, zone: 'battlefield' });
  return true;
});
EXT.hooks.canBlock.push((s, blocker, attacker, api) => {
  for (const f of (api.chars(s, attacker).pc as any).notBlockableBy ?? []) if (api.matchesFilter(s, blocker, f, s.cards[attacker].controller, attacker)) return false;
  return undefined;
});

// ---- draw an additional card ----
EXT.rules.push([/^(?:you )?draw an additional card$/, () => [{ k: 'draw', n: 1, who: { t: 'you' } }]]);

// ---- exile N cards from your graveyard (optional action) ----
EXT.rules.push([/^exile (two|three|four|five|six|seven|\d+) cards from your graveyard$/, (m) => [{ k: 'ext', name: 'exileNFromGy', n: nw(m[1]) }]]);
EXT.effects.exileNFromGy = ({ s, item, e, r, you, api }) => {
  const g: string[] = api.P(s, you).graveyard;
  if (g.length < e.n) { (item as any).didLast = false; return 'done'; }
  if (!r.sub) {
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'chooseCards', title: `Exile ${e.n} cards from your graveyard`, cards: [...g], min: e.n, max: e.n, data: { ctx: 'resolve' } });
    return 'wait';
  }
  for (const c of r.sub.answer ?? []) if (s.cards[c]?.zone === 'graveyard') api.moveCard(s, c, 'exile');
  return 'done';
};
