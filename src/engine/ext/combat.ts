// Plugin: combat restrictions and combat-related statics.
import { EXT } from '../ext';
import { sourcesWith } from '../rules';
import { parseKeywordList, parseCond, parseSubject } from '../oracle';

const flag = (pc: any) => ((pc.combatFlags ??= {}) as Record<string, any>);
const flags = (s: any, iid: string, api: any) => (api.chars(s, iid).pc.combatFlags ?? {}) as Record<string, any>;
const N: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
const num = (w: string) => (/^\d+$/.test(w) ? +w : N[w] ?? 1);

EXT.lines.push((line, pc) => {
  let m: RegExpMatchArray | null;
  if (/^~ can block only creatures with flying$/.test(line)) { flag(pc).blockOnlyFlyers = true; return true; }
  if ((m = line.match(/^~ can't be blocked by creatures with power (\d+) or (less|greater)$/))) { flag(pc)[m[2] === 'less' ? 'noBlockPowerMax' : 'noBlockPowerMin'] = +m[1]; return true; }
  if (/^creatures with power less than ~'s power can't block it$/.test(line)) { flag(pc).noBlockWeaker = true; return true; }
  if ((m = line.match(/^~ can't be blocked by more than (\w+) creatures?$/))) { flag(pc).maxBlockedBy = num(m[1]); return true; }
  if ((m = line.match(/^~ can block (an additional|any number of) creatures?(?: each combat)?$/))) { flag(pc).maxBlocks = m[1] === 'an additional' ? 2 : 99; return true; }
  if ((m = line.match(/^~ can't attack unless defending player controls an? (island|swamp|mountain|forest|plains|[a-z]+)$/))) { flag(pc).attackNeeds = m[1]; return true; }
  if (/^~ can't block creatures with flying$/.test(line)) { flag(pc).noBlockFlyers = true; return true; }
  if ((m = line.match(/^~ can't be blocked except by (creatures with flying|two or more creatures|artifact creatures|walls)$/))) { flag(pc).blockExcept = m[1]; return true; }
  // "during your turn, ~ has first strike" / "as long as it's your turn, ~ has …" / "during your turn, ~ gets +1/+0"
  if ((m = line.match(/^(?:during your turn|as long as it's your turn), ~ (has|gets) (.+)$/))) {
    if (m[1] === 'has') {
      const kw = parseKeywordList(m[2]);
      if (!kw) return false;
      pc.statics.push({ kind: 'selfPump', p: 0, t: 0, kw, cond: { k: 'yourTurn' } });
      return true;
    }
    const g = m[2].match(/^([+-]\d+)\/([+-]\d+)(?: and has (.+))?$/);
    if (!g) return false;
    const kw = g[3] ? parseKeywordList(g[3]) : [];
    if (!kw) return false;
    pc.statics.push({ kind: 'selfPump', p: +g[1], t: +g[2], kw, cond: { k: 'yourTurn' } });
    return true;
  }
  if ((m = line.match(/^(?:during turns other than yours|as long as it's not your turn), ~ has (.+)$/))) {
    const kw = parseKeywordList(m[1]);
    if (!kw) return false;
    pc.statics.push({ kind: 'selfPump', p: 0, t: 0, kw, cond: { k: 'yourTurn', not: true } });
    return true;
  }
  void parseCond;
  return false;
});

EXT.hooks.canBlock.push((s, blocker, attacker, api) => {
  const b = flags(s, blocker, api);
  const a = flags(s, attacker, api);
  const ac = api.chars(s, attacker);
  const bc = api.chars(s, blocker);
  if (b.blockOnlyFlyers && !ac.keywords.has('flying')) return false;
  if (b.noBlockFlyers && ac.keywords.has('flying')) return false;
  if (a.noBlockPowerMax != null && bc.power <= a.noBlockPowerMax) return false;
  if (a.noBlockPowerMin != null && bc.power >= a.noBlockPowerMin) return false;
  if (a.noBlockWeaker && bc.power < ac.power) return false;
  if (a.blockExcept === 'creatures with flying' && !bc.keywords.has('flying')) return false;
  if (a.blockExcept === 'artifact creatures' && !bc.types.has('artifact')) return false;
  if (a.blockExcept === 'walls' && !bc.subtypes.has('wall')) return false;
  return undefined;
});
EXT.hooks.validateBlocks.push((s, list, api) => {
  for (const a of s.combat?.attackers ?? []) {
    const f = flags(s, a.iid, api);
    const n = list.filter((b) => b.attacker === a.iid).length;
    if (f.maxBlockedBy != null && n > f.maxBlockedBy) return `${api.nm(s, a.iid)} can't be blocked by more than ${f.maxBlockedBy} creature${f.maxBlockedBy > 1 ? 's' : ''}`;
    if (f.blockExcept === 'two or more creatures' && n === 1) return `${api.nm(s, a.iid)} can't be blocked except by two or more creatures`;
  }
  return null;
});
EXT.hooks.maxBlocks.push((s, blocker, api) => flags(s, blocker, api).maxBlocks);
EXT.hooks.canAttack.push((s, iid, api) => {
  const need = flags(s, iid, api).attackNeeds;
  if (!need) return undefined;
  const def = api.opp(s.active);
  return s.battlefield.some((b) => s.cards[b].controller === def && api.chars(s, b).subtypes.has(need)) ? undefined : false;
});

// "~ doesn't untap during your next untap step" / "those creatures don't untap during their controller's next untap step"
EXT.rules.push([/^(~|it|that creature|that permanent|those creatures|they|target creature|each of them) (?:doesn't|don't) untap during (?:your|its controller's|their controllers?'s?) next untap steps?$/, (m, ctx) => {
  const what = m[1] === '~' ? { t: 'self' } : ['target creature'].includes(m[1]) ? parseSubject(m[1], ctx) : ctx.last ?? null;
  return what ? [{ k: 'skipUntap', what }] : null;
}]);
// "attacking creatures (you control) get +N/+N until end of turn"
EXT.rules.push([/^(attacking|blocking) creatures(?: you control)? get ([+-]\d+)\/([+-]\d+)(?: and gain (.+?))? until end of turn$/, (m) => {
  const kw = m[4] ? parseKeywordList(m[4]) : [];
  if (!kw) return null;
  const filter: any = { types: ['creature'], [m[1]]: true };
  if (/you control/.test(m[0])) filter.controller = 'you';
  return [{ k: 'pump', what: { t: 'all', filter }, p: +m[2], t: +m[3], kw, eot: true }];
}]);

// ------------------------------------------------------------------------------------------
// Round 2
// ------------------------------------------------------------------------------------------
EXT.rules.push([/^(~|target creature|it) can attack this turn as though it didn't have defender$/, (m, ctx) => {
  const what = m[1] === '~' ? { t: 'self' } : m[1] === 'it' ? ctx.last : parseSubject(m[1], ctx);
  return what ? [{ k: 'pump', what, p: 0, t: 0, kw: ['attacks as though no defender'], eot: true }] : null;
}]);
EXT.lines.push((line, pc) => {
  let m: RegExpMatchArray | null;
  if (/^~ must be blocked if able$/.test(line)) { flag(pc).mustBeBlocked = true; return true; }
  if ((m = line.match(/^when you control no (islands|swamps|mountains|forests|plains|artifacts|creatures|other creatures), sacrifice ~$/))) { flag(pc).sacIfNo = m[1].replace(/s$/, ''); return true; }
  if (/^cast ~ only during the declare attackers step and only if you've been attacked this step$/.test(line)) { pc.onlyWhenAttacked = true; return true; }
  if (/^cast ~ only during combat$/.test(line)) { pc.onlyDuringCombat = true; return true; }
  if (/^cast ~ only before (?:the combat damage step|blockers are declared)$/.test(line)) { pc.onlyBeforeBlocks = true; return true; }
  return false;
});
EXT.hooks.validateBlocks.push((s, list, api) => {
  for (const a of s.combat?.attackers ?? []) {
    if (!flags(s, a.iid, api).mustBeBlocked) continue;
    if (list.some((b) => b.attacker === a.iid)) continue;
    const def = api.opp(s.active);
    const able = s.battlefield.some((b) => s.cards[b].controller === def && api.canBlock(s, b, a.iid) && !list.some((x) => x.blocker === b));
    if (able) return `${api.nm(s, a.iid)} must be blocked if able`;
  }
  return null;
});
EXT.hooks.sba.push((s, api) => {
  let changed = false;
  for (const b of [...sourcesWith(s, 'combatFlags')]) {
    const need = flags(s, b, api).sacIfNo;
    if (!need) continue;
    const ctrl = s.cards[b].controller;
    const other = need === 'other creature';
    const has = s.battlefield.some((x) => s.cards[x].controller === ctrl && (!other || x !== b) && (api.chars(s, x).subtypes.has(need) || api.chars(s, x).types.has(other ? 'creature' : need)));
    if (!has) {
      api.log(s, `${api.nm(s, b)} is sacrificed (you control no ${need}s).`, ctrl);
      api.moveCard(s, b, 'graveyard', { cause: 'sacrifice' });
      changed = true;
    }
  }
  return changed;
});
EXT.hooks.castBlock.push((s, p, iid, _alt, api) => {
  const pc = api.parsedFor(s, s.cards[iid]) as any;
  if (pc.onlyWhenAttacked && !(s.step === 'declareAttackers' && s.active !== p && (s.combat?.attackers ?? []).some((a: any) => a.target.kind === 'player' && a.target.idx === p))) return 'Cast only during the declare attackers step when you are being attacked';
  if (pc.onlyDuringCombat && !['beginCombat', 'declareAttackers', 'declareBlockers', 'firstStrikeDamage', 'combatDamage', 'endCombat'].includes(s.step)) return 'Cast only during combat';
  if (pc.onlyBeforeBlocks && !['beginCombat', 'declareAttackers'].includes(s.step)) return 'Cast only before blockers are declared';
  return null;
});
