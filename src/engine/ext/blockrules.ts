// Plugin: who may block what (509.1b-c), beyond the core's evasion keywords.
//  Static:  "~ can't be blocked except by black creatures / creatures with flying or reach / Walls and/or creatures with flying"
//           "~ can't be blocked as long as it's attacking alone / as long as defending player controls an artifact / if <cond>"
//           "~ can't be blocked by creatures with greater power" / "… by tokens"
//  Effects: "<creature> can't be blocked this turn except by …" / "… can't be blocked by creatures with power 2 or less this turn"
//           "~ can't be blocked this combat"
import { EXT } from '../ext';
import { looseFilter, parseCond, parseSubject } from '../oracle';

const KW = ['flying', 'reach', 'haste', 'defender', 'horsemanship', 'shadow', 'first strike', 'vigilance', 'trample', 'menace', 'deathtouch', 'lifelink'];
/** "black creatures", "creatures with flying or reach", "walls and/or creatures with flying", "tokens" → list of filters (any-of) */
function blockerFilters(ph: string): any[] | null {
  ph = ph.replace(/ and\/or /g, ' or ');
  const kwOr = ph.match(/^creatures with ([a-z ]+?) or ([a-z ]+)$/);
  if (kwOr && KW.includes(kwOr[1]) && KW.includes(kwOr[2])) return [{ types: ['creature'], keyword: kwOr[1] }, { types: ['creature'], keyword: kwOr[2] }];
  const kw = ph.match(/^creatures with ([a-z ]+)$/);
  if (kw && KW.includes(kw[1])) return [{ types: ['creature'], keyword: kw[1] }];
  if (ph === 'tokens' || ph === 'creature tokens') return [{ token: true }];
  const out: any[] = [];
  for (const part of ph.split(/ or (?=[a-z]+ ?(?:creatures|s\b))|, /)) {
    const p = part.trim().replace(/^creatures with /, 'creature with ').replace(/creatures$/, 'creature').replace(/s$/, '');
    const kw1 = p.match(/^creature with ([a-z ]+)$/);
    if (kw1 && KW.includes(kw1[1])) { out.push({ types: ['creature'], keyword: kw1[1] }); continue; }
    const f = looseFilter(p);
    if (!f) return null;
    const g: any = { ...f };
    delete g.zone;
    out.push(g);
  }
  return out.length ? out : null;
}

EXT.lines.push((line, pc) => {
  let m: RegExpMatchArray | null;
  if ((m = line.match(/^~ can't be blocked except by (.+)$/)) && !/\b(two|three|four|more)\b/.test(m[1])) {
    const fs = blockerFilters(m[1]);
    if (!fs) return false;
    (pc.blockOnly ??= []).push(fs);
    return true;
  }
  if ((m = line.match(/^~ can't be blocked (?:as long as|if) (.+)$/))) {
    if (m[1] === "it's attacking alone") { pc.unblockableAlone = true; return true; }
    const dm = m[1].match(/^defending player controls (.+)$/);
    if (dm) {
      const f = looseFilter(dm[1].replace(/^(?:a|an) /, ''));
      if (!f) return false;
      pc.unblockableIfDefender = { ...f, zone: 'battlefield' };
      return true;
    }
    const cond = parseCond(m[1].replace(/\bits power\b/, "~'s power"));
    if (!cond) return false;
    pc.unblockableIf = cond;
    return true;
  }
  if (/^~ can't be blocked by creatures with greater power$/.test(line)) { pc.noBlockGreaterPower = true; return true; }
  if ((m = line.match(/^~ can't be blocked by (tokens|creature tokens)$/))) { (pc.blockNot ??= []).push([{ token: true }]); return true; }
  return false;
});

// one-shot: "<subject> can't be blocked this turn except by …" / "… by creatures with power N or less this turn" / "this combat"
EXT.rules.push([/^(.+?) can't be blocked (?:this turn |this combat )?(except by|by) (.+?)(?: this turn| this combat)?$/, (m, ctx) => {
  const n = ctx.specs.length;
  const what = m[1] === '~' ? { t: 'self' } : parseSubject(m[1], ctx);
  if (!what) { ctx.specs.length = n; return null; }
  let rule: any;
  const pw = m[3].match(/^creatures with power (\d+) or (less|greater)$/);
  if (pw) rule = { not: [{ types: ['creature'], [pw[2] === 'less' ? 'powerMax' : 'powerMin']: +pw[1] }] };
  else {
    const fs = blockerFilters(m[3]);
    if (!fs) { ctx.specs.length = n; return null; }
    rule = m[2] === 'except by' ? { only: fs } : { not: fs };
  }
  if (!/this turn|this combat/.test(m[0])) { ctx.specs.length = n; return null; }
  return [{ k: 'ext', name: 'blockRule', what, rule }];
}]);
EXT.rules.push([/^(~|it|that creature|target creature(?: you control)?) can't be blocked this combat$/, (m, ctx) => {
  const what = m[1] === '~' ? { t: 'self' } : parseSubject(m[1], ctx);
  return what ? [{ k: 'ext', name: 'blockRule', what, rule: { all: true } }] : null;
}]);
EXT.effects.blockRule = ({ s, item, e, api }) => {
  for (const c of api.subjCards(s, item, e.what)) if (s.cards[c]?.zone === 'battlefield') (((s.cards[c] as any).blockRules ??= []) as any[]).push({ ...e.rule, turn: s.turn, ctrl: item.controller });
  return 'done';
};

const any = (s: any, b: string, fs: any[], ctrl: number, src: string, api: any) => fs.some((f) => api.matchesFilter(s, b, { ...f, zone: 'battlefield' }, ctrl, src));
EXT.hooks.canBlock.push((s, blocker, attacker, api) => {
  const ac = api.chars(s, attacker);
  const pc: any = ac.pc;
  const ctrl = s.cards[attacker].controller;
  for (const fs of pc.blockOnly ?? []) if (!any(s, blocker, fs, ctrl, attacker, api)) return false;
  for (const fs of pc.blockNot ?? []) if (any(s, blocker, fs, ctrl, attacker, api)) return false;
  if (pc.unblockableAlone && (s.combat?.attackers.length ?? 0) === 1) return false;
  if (pc.unblockableIfDefender && s.battlefield.some((b) => s.cards[b].controller === s.cards[blocker].controller && api.matchesFilter(s, b, pc.unblockableIfDefender, ctrl, attacker))) return false;
  if (pc.unblockableIf && api.evalCond(s, pc.unblockableIf, ctrl, attacker)) return false;
  if (pc.noBlockGreaterPower && api.chars(s, blocker).power > ac.power) return false;
  for (const r of ((s.cards[attacker] as any).blockRules ?? []) as any[]) {
    if (r.turn !== s.turn) continue;
    if (r.all) return false;
    if (r.only && !any(s, blocker, r.only, r.ctrl, attacker, api)) return false;
    if (r.not && any(s, blocker, r.not, r.ctrl, attacker, api)) return false;
  }
  return undefined;
});
