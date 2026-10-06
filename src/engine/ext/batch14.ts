// Plugin batch 14. Temporary triggered abilities ("until end of turn, whenever X, Y").
import { EXT } from '../ext';
import { parseAddCost } from './costs';
import { baseChars, chars, evalAmt, evalCond, gateOk, matchesFilter, sourcesWith } from '../rules';
import { automationLevel, parseSubject, spec, looseFilter, matchTriggerCond, parseAmtPhrase, parseCard, parseCond, parseCountPhrase, parseFilter, parseKeywordList, parsePlayerSubject, parseSentence, singular } from '../oracle';
import { SUBTYPES } from '../subtypes';

const probeFull = (text: string) => {
  const pc: any = parseCard({ id: 'tmp-probe', name: 'Probe', manaCost: '', cmc: 0, typeLine: 'Emblem', oracle: text, colors: [], colorIdentity: [], keywords: [], layout: 'normal' } as any);
  return automationLevel(pc) === 'full';
};

// 603.7: "Until end of turn, whenever X, Y." — a delayed-style trigger lasting the turn. Self references (~) ride on the
// source permanent as a granted ability; others live on a temporary command-zone object removed at cleanup.
EXT.rules.push([/^until end of turn, (whenever .+?), (.+)$/, (m, ctx) => {
  if (/\bthis way\b|\bperpetually\b|\btarget\b/.test(m[1])) return null;
  let text = `${m[1]}, ${m[2]}`;
  if (/^whenever it\b/.test(text)) { if (ctx?.last?.t !== 'self') return null; text = text.replace(/\bit\b/g, '~'); }
  if (/\bperpetually\b/.test(text)) return null;
  if (!probeFull(text.replace(/~/g, 'Probe'))) return null;
  return [{ k: 'ext', name: 'tempTrig', text }];
}]);
let n = 0;
EXT.effects.tempTrig = ({ s, item, e, you, api }) => {
  const text: string = e.text;
  const cap = text.replace(/^(\w)/, (x: string) => x.toUpperCase());
  if (/~/.test(text)) {
    const src = item.source;
    if (!src || !s.battlefield.includes(src)) return 'done';
    (s.cards[src] as any).mods.push({ grantText: cap, until: 'eot', ts: s.ts++ });
    return 'done';
  }
  const id = `tempTrig:${text.length}:${text.slice(0, 60)}`;
  const srcName = api.nm(s, item.source) ?? 'Effect';
  if (!s.defs[id]) s.defs[id] = { id, name: `${srcName} effect`, manaCost: '', cmc: 0, typeLine: 'Emblem', oracle: cap, colors: [], colorIdentity: [], keywords: [], layout: 'emblem' } as any;
  const iid = `${api.uid(s, 't')}${n++}`;
  s.cards[iid] = { ...api.newCardObj(iid, id, you, 'command'), emblem: true, tempEot: true } as any;
  ((api.P(s, you) as any).command ??= []).push(iid);
  return 'done';
};
EXT.hooks.step.push((s, step) => {
  if (step !== 'cleanup') return;
  for (const pl of s.players as any[]) if (pl.command?.length) pl.command = pl.command.filter((i: string) => !(s.cards[i] as any)?.tempEot);
});

// "Put a +1/+1 counter and a trample counter on target creature." / "put a +1/+1 counter, a reach counter, and a deathtouch
// counter on …" — several counter kinds on one object: the first put picks the object, the rest follow "it".
const CNT = '(?:a|an|one|two|three|four|five|x|\\d+) \\S+ counters?';
EXT.rules.push([new RegExp(`^put (${CNT}(?:, ${CNT})*,? and ${CNT}) on (.+)$`), (m, ctx) => {
  const kinds = m[1].split(/,? and |, /);
  const first = parseSentence(`put ${kinds[0]} on ${m[2]}`, ctx);
  if (!first) return null;
  const out: any[] = [...first];
  for (const k of kinds.slice(1)) {
    const r = parseSentence(`put ${k} on it`, ctx);
    if (!r) return null;
    out.push(...r);
  }
  return out;
}]);
// "put a +1/+1 counter on each creature you control and a loyalty counter on each other planeswalker you control"
EXT.rules.push([new RegExp(`^put (${CNT} on .+?) and (${CNT} on .+)$`), (m, ctx) => {
  const a = parseSentence(`put ${m[1]}`, ctx);
  if (!a) return null;
  const b = parseSentence(`put ${m[2].replace(/ on ~$/, ' on ~')}`, ctx);
  if (!b) return null;
  return [...a, ...b];
}]);

// "As long as equipped creature is legendary, it has trample and haste." / "… is a Human or an Angel, it has vigilance" /
// "as long as enchanted creature is red, it loses all abilities" — the body is parsed as a plain attach line, then every
// attach static it produced is gated on the attached object's characteristics.
const attachCondOf = (t: string): any => {
  let not = false;
  let m = t.match(/^(?:is|isn't|is not) (.+)$/);
  let f: any = null;
  if (m) {
    not = /^isn/.test(t);
    const w = m[1].replace(/\b(?:a|an) /g, '');
    if (w === 'attacking') f = { attacking: true };
    else if (w === 'tapped') f = { tapped: true };
    else {
      f = looseFilter(w) ?? looseFilter(`${w} permanent`);
      if (!f) return null;
      f = { ...f, zone: undefined };
      if (f.types?.length === 1 && f.types[0] === 'permanent') delete f.types;
      const extra = Object.keys(f).filter((k) => f[k] !== undefined && !['types', 'subtypes', 'colors', 'supertypes', 'subAny'].includes(k));
      if (extra.length) return null;
    }
  } else if ((m = t.match(/^(has|doesn't have) (\S+(?: strike)?)$/))) { f = { keyword: m[2] }; not = m[1] !== 'has'; }
  else return null;
  return not ? { ...f, not: true } : f;
};
EXT.lines.push((line, pc) => {
  const m = line.match(/^as long as (enchanted|equipped) (creature|permanent|land|artifact) (is .+?|isn't .+?|has \S+(?: strike)?|doesn't have \S+), it (.+)$/);
  if (!m) return false;
  const ac = attachCondOf(m[3]);
  if (!ac) return false;
  const body = m[4].replace(/^gets an additional /, 'gets ');
  const probe: any = parseCard({ id: `ac14:${m[1]}:${body}`, name: 'Probe', manaCost: '', cmc: 0, typeLine: m[1] === 'equipped' ? 'Artifact — Equipment' : 'Enchantment — Aura', oracle: `${m[1] === 'enchanted' ? `Enchant ${m[2]}` : 'Equip {1}'}\n${m[1]} creature ${body}`, colors: [], colorIdentity: [], keywords: [], layout: 'normal' } as any);
  if (probe.unparsed.length || probe.attachBecome || probe.triggers.length) return false;
  const pumps = probe.statics.filter((s: any) => s.kind === 'attachPump');
  if (pumps.length !== probe.statics.length) return false;
  const grants: string[] = probe.attachGrants ?? [];
  if (!pumps.length && !grants.length) return false;
  if (grants.length && (ac.not || ac.attacking || ac.tapped || ac.keyword)) return false;
  for (const st of pumps) pc.statics.push({ ...st, attach: m[1], attachCond: ac });
  for (const g of grants) (pc as any).attachGrantsIf = [...((pc as any).attachGrantsIf ?? []), { filter: ac, text: g }];
  return true;
});

// "Until end of turn, target creature gets +1/+1 for each creature you control and gains trample." / "until end of turn,
// target creature gets +3/+3, up to one other target creature gets +2/+2, and …": the duration moved to the end, and a
// list of subject clauses split into separate sentences.
const SUBJ14 = '(?:up to one )?(?:another|other|target|each|all|~|creatures|equipped|enchanted|it)\\b';
EXT.rules.push([/^until end of turn, (.+)$/, (m, ctx) => {
  const rest = m[1];
  if (/^whenever |^if |^you may /.test(rest)) return null;
  const whole = parseSentence(`${rest} until end of turn`, ctx);
  if (whole && !whole.some((e: any) => e.k === 'manual')) return whole;
  const parts = rest.split(new RegExp(`,? and (?=${SUBJ14})|, (?=${SUBJ14})`));
  if (parts.length < 2) return null;
  const out: any[] = [];
  for (const p of parts) {
    const r = parseSentence(`${p} until end of turn`, ctx);
    if (!r || r.some((e: any) => e.k === 'manual')) return null;
    out.push(...r);
  }
  return out;
}]);

// "~ deals 2 damage to target creature, 3 damage to another target creature, and 4 damage to a third target creature" /
// "~ deals 1 damage to any target, 2 damage to another target, and 3 damage to a third target"
const DMG = '(?:\\d+|x) damage to ';
EXT.rules.push([new RegExp(`^(~|it|that creature) deals (${DMG}.+?(?:,? and |, )${DMG}.+)$`), (m, ctx) => {
  const parts = m[2].split(new RegExp(`,? and (?=${DMG})|, (?=${DMG})`));
  if (parts.length < 2) return null;
  const out: any[] = [];
  for (const p of parts) {
    const q = p.replace(/ to a (?:second|third|fourth) target\b/, ' to another target');
    const r = parseSentence(`${m[1]} deals ${q}`, ctx);
    if (!r || r.some((e: any) => e.k === 'manual')) return null;
    out.push(...r);
  }
  return out;
}]);

// "~ deals 2 damage to target creature and each other creature that shares a color with it" / "… with the same name as
// that creature" (Cleansing Beam, Homing Lightning). The group is fixed on resolution from the target's characteristics.
EXT.rules.push([/^(~|it) deals (\d+|x) damage to (target .+?) and each other creature (that shares a color with it|with the same name as (?:that creature|it))$/, (m, ctx) => {
  const r = parseSentence(`${m[1]} deals ${m[2]} damage to ${m[3]}`, ctx);
  if (!r || r.length !== 1 || (r[0] as any).k !== 'damage') return null;
  const d: any = r[0];
  return [{ k: 'ext', name: 'dmgShare', n: d.n, what: d.to[0], from: d.from, mode: /color/.test(m[4]) ? 'color' : 'name' }];
}]);
EXT.effects.dmgShare = ({ s, item, e, you, api }) => {
  const [t] = api.subjCards(s, item, e.what) as string[];
  if (!t) return 'done';
  const n = api.amount(s, item, e.n);
  const tc = api.chars(s, t);
  const group = s.battlefield.filter((b: string) => b !== t && api.chars(s, b).types.has('creature') && (e.mode === 'color' ? api.chars(s, b).colors.some((c: string) => tc.colors.includes(c)) : api.nm(s, b) === api.nm(s, t)));
  const [src] = (api.subjCards(s, item, e.from) as string[]);
  for (const c of [t, ...group]) api.dealDamage(s, src ?? item.source, { kind: 'card', iid: c }, n, false);
  return 'done';
};

// "~ deals 1 damage to the player or planeswalker it's attacking" (Hellrider, Raid Bombardment)
EXT.rules.push([/^(~|it|that creature) deals (\d+|x) damage to the player or planeswalker (it's|that creature is|~ is|they're) attacking$/, (m, ctx) => {
  const from = m[1] === '~' ? { t: 'self' } : ctx.last;
  const att = m[3] === '~ is' ? { t: 'self' } : ctx.last ?? { t: 'self' };
  if (!from) return null;
  return [{ k: 'ext', name: 'dmgAttacked', n: /^\d+$/.test(m[2]) ? +m[2] : 'X', from, att }];
}]);
EXT.effects.dmgAttacked = ({ s, item, e, api }) => {
  const n = typeof e.n === 'number' ? e.n : api.amount(s, item, e.n);
  const [a] = api.subjCards(s, item, e.att) as string[];
  const [src] = api.subjCards(s, item, e.from) as string[];
  const at = s.combat?.attackers.find((x: any) => x.iid === a);
  if (at) api.dealDamage(s, src ?? item.source, at.target, n, false);
  return 'done';
};

// "Create a 1/1 green Elf Druid creature token named Llanowar Elves (with …)." — the token's name is its own.
EXT.rules.push([/^(create (?:a|an|one|two|three|x|\d+) .+? tokens?) named (.+?)((?: with | that's | and | for each ).+)?$/, (m, ctx) => {
  if (/"/.test(m[2])) return null;
  const r = parseSentence(`${m[1]}${m[3] ?? ''}`, ctx);
  if (!r) return null;
  const tok: any = r.find((e: any) => e.k === 'token' && e.token);
  if (!tok || r.some((e: any) => e.k === 'manual')) return null;
  tok.token = { ...tok.token, name: m[2].replace(/(^|\s|-)([a-z])/g, (_x: string, a: string, b: string) => a + b.toUpperCase()) };
  return r;
}]);

// "You may cast that card for as long as it remains exiled, and mana of any type can be spent to cast that spell."
// (Hostage Taker, Dire Fleet Daredevil, Abstruse Appropriation, Shadow of the Enemy)
const ANYT = '(?:,? and (?:mana of any type can be spent to cast (?:it|that spell|them|those spells)|you may spend (?:colorless )?mana as though it were mana of any (?:type|color) to cast (?:it|that spell|them|those spells)))';
const RE_MP = new RegExp(`^(?:then )?you may (?:play|cast) (that card|it|them|those cards|the exiled card|cards exiled this way|spells from among (?:them|those cards))( this turn| from exile this turn| for as long as (?:it remains|they remain) exiled| until the end of your next turn| until your next end step| for as long as you control ~)?(${ANYT})?$`);
EXT.seqs.push((sents, i, ctx, ab) => {
  const m = sents[i].match(RE_MP);
  if (!m || (!m[2] && !m[3])) return null;
  ab.effects.push({ k: 'mayPlay', what: ctx.last ?? { t: 'exiledTop' }, until: /long/.test(m[2] ?? '') ? 'forever' : /next/.test(m[2] ?? '') ? 'nextTurn' : 'eot', ...(m[3] ? { anyType: true } : {}) } as any);
  return 1;
});
EXT.hooks.costMod.push((s, p, iid, cost) => {
  const c: any = s.cards[iid];
  if (!cost || !c?.mayPlay?.anyType || c.mayPlay.player !== p || !['exile', 'graveyard'].includes(c.zone)) return cost;
  let n = 0;
  const rest = cost.replace(/\{([WUBRGC])\}/gi, () => { n++; return ''; });
  if (!n) return cost;
  const g = +(rest.match(/\{(\d+)\}/)?.[1] ?? 0);
  return `{${g + n}}` + rest.replace(/\{\d+\}/g, '');
});
// "You may cast target instant or sorcery card from your graveyard this turn." (Jace, Vryn's Prodigy; Zul Ashur)
EXT.seqs.push((sents, i, ctx, ab) => {
  const m = sents[i].match(/^you may cast (target .+? card) from (your|a|that player's|an opponent's) graveyard this turn$/);
  if (!m) return null;
  const k0 = ctx.specs.length;
  const sub = parseSentence(`return ${m[1]} from ${m[2]} graveyard to your hand`, ctx);
  const ret: any = sub?.[0];
  const what = ret?.what ?? ret?.target;
  if (!what || what.t !== 'target') { ctx.specs.length = k0; return null; }
  ab.effects.push({ k: 'mayPlay', what, until: 'eot' } as any);
  return 1;
});

// "When a spell or ability an opponent controls causes you to discard ~, …" (Obstinate Baloth, Wilt-Leaf Liege)
EXT.triggers.push((cond) => (/^when(?:ever)? a spell or ability an opponent controls causes you to discard ~$/.test(cond) ? [{ event: 'oppDiscardSelf' }] : null));
EXT.hooks.afterMove.push((s, iid, from, to, opts, api) => {
  if (to !== 'graveyard' || from !== 'hand' || opts?.cause !== 'discard') return;
  const c = s.cards[iid];
  const it: any = s.resolving?.item;
  if (!c || !it || it.controller === c.owner) return;
  for (const t of (api.parsedFor(s, c).triggers as any[])) if (t.event === 'oppDiscardSelf') api.queueTrigger(s, iid, c.owner, t, {});
});
EXT.lines.push((line, pc) => {
  const m = line.match(/^if a spell or ability an opponent controls causes you to discard ~, put it onto the battlefield( with (a|two|three) \+1\/\+1 counters? on it)? instead of putting it into your graveyard$/);
  if (!m) return false;
  (pc as any).oppDiscardBf = { n: m[1] ? ({ a: 1, two: 2, three: 3 } as any)[m[2]] : 0 };
  return true;
});
EXT.hooks.afterMove.push((s, iid, _from, to, _opts, api) => {
  const c: any = s.cards[iid];
  if (to !== 'battlefield' || c?.oppDiscardEntered !== s.turn) return;
  c.oppDiscardEntered = undefined;
  const n = (api.parsedFor(s, c) as any).oppDiscardBf?.n ?? 0;
  if (n) api.addCounters(s, iid, '+1/+1', n);
});

// Haunt (702.55): "When this creature dies / this spell card is put into a graveyard after resolving, exile it haunting
// target creature." Abilities "when the creature ~ haunts dies" then trigger from exile.
EXT.lines.push((line, pc) => { if (line !== 'haunt') return false; (pc as any).haunt = true; return true; });
EXT.rules.push([/^exile (?:it|~) haunting target creature$/, (_m, ctx) => {
  ctx.specs.push({ filter: { types: ['creature'] }, count: 1, upTo: false, label: 'target creature (haunt)', players: null });
  return [{ k: 'ext', name: 'hauntExile', spec: ctx.specs.length - 1 }];
}]);
EXT.effects.hauntExile = ({ s, item, e, api }) => {
  const t = (item.targets[e.spec] ?? []).find((x: any) => x.kind === 'card') as any;
  const c: any = s.cards[item.source];
  if (!t || !c || c.zone !== 'graveyard' || !s.battlefield.includes(t.iid)) return 'done';
  api.moveCard(s, item.source, 'exile');
  c.haunting = t.iid;
  api.log(s, `${api.nm(s, item.source)} haunts ${api.nm(s, t.iid)}.`, c.owner);
  return 'done';
};
let hauntTrig: any = null;
const hauntT = () => (hauntTrig ??= (parseCard({ id: 'haunt-probe', name: 'Haunter', manaCost: '', cmc: 0, typeLine: 'Creature', oracle: 'When ~ dies, exile it haunting target creature.', colors: [], colorIdentity: [], keywords: [], layout: 'normal' } as any) as any).triggers[0]);
EXT.post.push((pc, info) => {
  if ((pc as any).haunt && /creature/i.test(info.tl) && hauntT()) pc.triggers.push(hauntT());
});
EXT.triggers.push((cond) => {
  if (/^when(?:ever)? the creature (?:~|it) haunts dies$/.test(cond)) return [{ event: 'hauntedDies' }];
  const m = cond.match(/^when(?:ever)? ~ (enters|deals damage to a player|is put into a graveyard from the battlefield|dies) or the creature it haunts dies$/);
  if (m) { const a = matchTriggerCond(`when ~ ${m[1]}`); if (a) return [...a, { event: 'hauntedDies' }]; }
  return null;
});
EXT.hooks.afterMove.push((s, iid, from, to, _opts, api) => {
  const c: any = s.cards[iid];
  if (!c) return;
  // a haunt spell card put into its owner's graveyard after resolving
  if (from === 'stack' && to === 'graveyard' && (api.parsedFor(s, c) as any).haunt && api.parsedFor(s, c).spell && hauntT()) api.queueTrigger(s, iid, c.owner, hauntT(), {});
  if (from !== 'battlefield' || to !== 'graveyard') return;
  for (const p of s.players as any[]) for (const x of p.exile) {
    const h: any = s.cards[x];
    if (h?.haunting !== iid) continue;
    for (const t of (api.parsedFor(s, h).triggers as any[])) if (t.event === 'hauntedDies') api.queueTrigger(s, x, h.owner, t, {});
  }
});
EXT.triggers.push((cond) => (/^whenever a time counter is removed from ~ while it's exiled$/.test(cond) ? [{ event: 'timeOffExiled' }] : null));

// "You may put a land card from your hand or graveyard onto the battlefield tapped." / "… a red creature card or an artifact
// creature card from your hand …" / "… with mana value x or less from your hand onto the battlefield, where x is ~'s power" /
// "… an Aura card from your hand onto the battlefield attached to ~"
const W14: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };
const cardFilter14 = (ph: string): any => {
  const groups = ph.replace(/ cards?\b/g, '').split(/,? or (?:an? )?|, (?:an? )?/).map((g) => g.replace(/^(?:an?|and\/or) /, '').trim());
  const fs = groups.map((g) => looseFilter(g) ?? looseFilter(`${g} permanent`));
  if (fs.some((f) => !f)) return null;
  const clean = (f: any) => { const g = { ...f }; delete g.zone; delete g.owner; if (g.types?.length === 1 && g.types[0] === 'permanent' && /permanent/.test(ph) === false) delete g.types; return g; };
  return fs.length === 1 ? clean(fs[0]) : { anyOf: fs.map(clean) };
};
EXT.rules.push([/^(?:you may )?put (a|an|one|two|up to (?:one|two|three)|any number of) (.+?) from (your hand|your graveyard|your hand or graveyard|your hand or your graveyard|your graveyard or hand|a graveyard) onto the battlefield( tapped)?( under your control)?( tapped)?( and attacking)?( attached to (?:~|it))?(?:, where x is (.+))?$/, (m, ctx) => {
  let ph = m[2];
  let mvMax: any = undefined;
  let mm: RegExpMatchArray | null;
  if ((mm = ph.match(/ with mana value (x|\d+) or less$/))) {
    if (mm[1] === 'x') { mvMax = m[9] ? parseAmtPhrase(m[9], ctx) : 'X'; if (mvMax == null) return null; } else mvMax = +mm[1];
    ph = ph.slice(0, -mm[0].length);
  } else if ((mm = ph.match(/ with mana value less than or equal to (.+)$/))) {
    mvMax = parseAmtPhrase(mm[1], ctx);
    if (mvMax == null) return null;
    ph = ph.slice(0, -mm[0].length);
  } else if (m[9]) return null;
  const f = cardFilter14(ph);
  if (!f) return null;
  const zones = m[3] === 'a graveyard' ? ['anyGy'] : [/hand/.test(m[3]) ? 'hand' : '', /graveyard/.test(m[3]) ? 'graveyard' : ''].filter(Boolean);
  const upTo = m[1].match(/^up to (\w+)$/);
  const max = m[1] === 'any number of' ? 99 : upTo ? W14[upTo[1]] : W14[m[1]] ?? 1;
  ctx.last = { t: 'lastToken' };
  return [{ k: 'ext', name: 'putFromZones', filter: f, zones, max, mvMax, tapped: !!(m[4] || m[6] || m[7]), attacking: !!m[7], attach: !!m[8] }];
}]);
EXT.effects.putFromZones = ({ s, item, e, r, you, api }) => {
  const pl = api.P(s, you);
  const pool: string[] = e.zones.includes('anyGy') ? (s.players as any[]).flatMap((p) => p.graveyard) : [...(e.zones.includes('hand') ? pl.hand : []), ...(e.zones.includes('graveyard') ? pl.graveyard : [])];
  const mv = e.mvMax == null ? null : typeof e.mvMax === 'number' ? e.mvMax : api.amount(s, item, e.mvMax);
  const cands = pool.filter((c) => api.matchesFilter(s, c, { ...e.filter, zone: s.cards[c].zone }, you, item.source) && (mv == null || (s.defs[s.cards[c].defId].cmc ?? 0) <= mv) && !/\bInstant\b|\bSorcery\b/.test(s.defs[s.cards[c].defId].typeLine));
  if (!cands.length) { (item as any).didLast = false; return 'done'; }
  if (!r.sub) {
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'chooseCards', title: `${item.label}: put ${e.max > 1 ? 'cards' : 'a card'} onto the battlefield`, cards: cands, min: 0, max: Math.min(e.max, cands.length), data: { ctx: 'resolve' } });
    return 'wait';
  }
  const picked: string[] = (r.sub.answer ?? []).filter((c: string) => cands.includes(c));
  (item as any).didLast = picked.length > 0;
  for (const c of picked) {
    api.moveCard(s, c, 'battlefield', { controller: you, tapped: e.tapped });
    const card: any = s.cards[c];
    if (card?.zone !== 'battlefield') continue;
    if (e.attach && s.battlefield.includes(item.source)) card.attachedTo = item.source;
    if (e.attacking && s.combat) {
      const tgt = s.combat.attackers.find((a: any) => a.iid === item.source)?.target ?? { kind: 'player', idx: 1 - you };
      s.combat.attackers.push({ iid: c, target: tgt, blockedBy: [], blocked: false } as any);
    }
  }
  (item as any).lastTokens = picked.filter((c) => s.cards[c]?.zone === 'battlefield');
  return 'done';
};

// "~ deals damage to that player equal to the number of Swamps they control" (Karma, Cold Snap, Primal Order): counted
// for the referenced player (trigger player, else the targeted player, else the opponent).
EXT.amountPhrases.unshift((ph) => {
  const m = ph.match(/^(?:the number of )?(.+?) (?:they|that player|the player|target player|target opponent) controls?$/);
  if (!m) return null;
  const f = looseFilter(m[1]);
  if (!f) return null;
  const g: any = { ...f, zone: 'battlefield' };
  delete g.controller;
  return { ext: 'cntOf', filter: g };
});
const refPlayer = (s: any, you: number, ctx: any): number => {
  const it = ctx?.item;
  if (it?.triggerPlayer != null) return it.triggerPlayer;
  for (const ts of it?.targets ?? []) for (const t of ts ?? []) if (t?.kind === 'player') return t.idx;
  return 1 - you;
};
EXT.amounts.cntOf = (s, a: any, you, self, ctx) => {
  const p = refPlayer(s, you, ctx);
  return s.battlefield.filter((b) => s.cards[b].controller === p && matchesFilter(s, b, a.filter, you, self, true)).length;
};

// Anthem variants the core line parser misses: "Creatures you control get +0/+1 for each Gate you control and have
// vigilance." / "Creatures you control that are enchanted get +1/+1 and have first strike." / "Creatures you control get
// +X/+X, where X is …"
const groupFilter14 = (ph: string): any => {
  let rel: string | undefined;
  const m = ph.match(/^(.+?) (?:that are|that's) (enchanted|equipped)$/);
  if (m) { ph = m[1]; rel = m[2]; }
  const f: any = parseFilter(ph);
  if (!f) return null;
  if (rel) f.rel = rel;
  return { ...f, zone: 'battlefield' };
};
EXT.lines.push((line, pc) => {
  const m = line.match(/^(other )?(.+?) get ([+-](?:\d+|x))\/([+-](?:\d+|x))(?: for each (.+?))?(?:,? and (?:have|gain) (.+?))?(?:, where x is (.+))?$/);
  if (!m || /^~|^enchanted |^equipped /.test(m[2])) return false;
  const f = groupFilter14(m[2]);
  if (!f) return false;
  if (m[1]) f.other = true;
  const kws = m[6] ? parseKeywordList(m[6]) : [];
  if (!kws) return false;
  const per = m[5] ? parseCountPhrase(m[5]) : null;
  if (m[5] && !per) return false;
  const xAmt = m[7] ? parseAmtPhrase(m[7], { specs: [], selfName: '~', last: { t: 'self' } } as any) : null;
  if (m[7] && xAmt == null) return false;
  const v = (s: string): any => {
    if (/x$/.test(s)) { if (!xAmt) return null; return s[0] === '-' ? { ...(xAmt as any), mult: -((xAmt as any).mult ?? 1) } : xAmt; }
    const n = +s;
    return per ? (n === 0 ? 0 : { ...(per as any), mult: ((per as any).mult ?? 1) * n }) : n;
  };
  const p = v(m[3]); const t = v(m[4]);
  if (p === null || t === null) return false;
  if (typeof p === 'object' && typeof xAmt === 'number') return false;
  pc.statics.push({ kind: 'anthem', filter: f, p, t, kw: kws } as any);
  return true;
});

// "Enchanted creature gets +2/+2, has vigilance, and can't attack you …" — a list of attach clauses split into lines,
// each checked to parse on its own.
const attachLineOk = (kind: string, line: string) => {
  const pc: any = parseCard({ id: `al14:${line}`, name: 'Probe', manaCost: '', cmc: 0, typeLine: kind === 'equipped' ? 'Artifact — Equipment' : 'Enchantment — Aura', oracle: `${kind === 'equipped' ? 'Equip {1}' : 'Enchant creature'}\n${line}`, colors: [], colorIdentity: [], keywords: [], layout: 'normal' } as any);
  return pc.unparsed.length === 0 && automationLevel(pc) === 'full';
};
let expBusy14 = false;
const AVERB = "(?:gets?|has|have|can't|can|is|assigns|must|attacks|loses)\\b";
EXT.expand.push((line) => {
  const m = line.match(/^(enchanted|equipped) creature (.+)$/);
  if (!m || /"/.test(m[2])) return null;
  const parts = m[2].split(new RegExp(`,? and (?=${AVERB})|, (?=${AVERB})`)).flatMap((p) => {
    // "has flying and ward {1}" → "has flying" + "has ward {1}"
    const w = p.match(/^has (.+?),? and (ward \{\d+\}|toxic \d+|afflict \d+|annihilator \d+)$/);
    return w ? [`has ${w[1]}`, `has ${w[2]}`] : [p];
  });
  if (parts.length < 2) return null;
  if (expBusy14) return null;
  expBusy14 = true;
  try { if (attachLineOk(m[1], line)) return null; } finally { expBusy14 = false; }
  const lines = parts.map((p) => `${m[1]} creature ${p}`);
  // keep "gets +X/+Y and has KW" pairs that already parse together
  if (!lines.every((l) => attachLineOk(m[1], l))) return null;
  return lines;
});
// "Enchanted creature gets -X/-X, where X is the number of creature cards in your graveyard."
EXT.lines.push((line, pc) => {
  const m = line.match(/^(enchanted|equipped) creature gets ([+-])x\/([+-])(x|0), where x is (.+)$/);
  if (!m) return false;
  const a: any = parseAmtPhrase(m[5], { specs: [], selfName: '~', last: { t: 'self' } } as any);
  if (a == null) return false;
  const sg = (sign: string): any => (typeof a === 'number' ? (sign === '-' ? -a : a) : sign === '-' ? { ...a, mult: -((a.mult ?? 1)) } : a);
  pc.statics.push({ kind: 'attachPump', attach: m[1], p: sg(m[2]), t: m[4] === '0' ? 0 : sg(m[3]), kw: [] } as any);
  return true;
});

// Vows: "Enchanted creature … can't attack you or planeswalkers you control."
EXT.lines.push((line, pc) => {
  if (!/^(enchanted|equipped) creature can't attack you(?: or planeswalkers you control| or a planeswalker you control)?$/.test(line)) return false;
  (pc as any).attachNoAttackYou = true;
  return true;
});
EXT.hooks.canAttack.push((s, iid, api) => {
  for (const g of sourcesWith(s, 'attachNoAttackYou')) if (s.cards[g].attachedTo === iid && s.cards[g].controller !== s.cards[iid].controller) return false;
  return undefined;
});

// "Enchanted creature has base power and toughness 1/1." (an attachBecome with only a base P/T)
EXT.lines.push((line, pc) => {
  const m = line.match(/^(?:enchanted|equipped) creature has base power and toughness (\d+)\/(\d+)$/);
  if (!m) return false;
  (pc as any).attachBecome = { ...((pc as any).attachBecome ?? {}), setPT: [+m[1], +m[2]] };
  return true;
});

// Fallback: "Enchanted creature can't be blocked except by creatures with flying." — any clause that works as the host's
// own static ("~ can't be blocked except by …") is granted to it (attachGrants). Clauses about "you" are excluded since
// the granted text would read "you" as the host's controller.
EXT.lines.push((line, pc) => {
  const m = line.match(/^(?:enchanted|equipped) creature (can't|can|has|must|attacks|blocks|assigns|doesn't|is) (.+)$/);
  if (!m || /"|\byou\b|\byour\b|\bits controller\b|\benchanted\b|\bequipped\b/.test(m[2])) return false;
  if (m[1] === 'has' && parseKeywordList(m[2])) return false;
  const text = `~ ${m[1]} ${m[2]}`;
  const probe: any = parseCard({ id: `ag14:${text}`, name: 'Probe', manaCost: '', cmc: 0, typeLine: 'Creature — Probe', oracle: text, colors: [], colorIdentity: [], keywords: [], layout: 'normal' } as any);
  if (probe.unparsed.length || automationLevel(probe) !== 'full') return false;
  if (!probe.statics.length && !probe.keywords.length && !Object.keys(probe).some((k) => !['statics', 'triggers', 'activated', 'unparsed', 'keywords', 'spell', 'replacements', 'kwArgs'].includes(k) && probe[k] != null && probe[k] !== false && !(Array.isArray(probe[k]) && !probe[k].length))) return false;
  (pc as any).attachGrants = [...((pc as any).attachGrants ?? []), text];
  return true;
});

// Board conditions: "as long as any player controls a black permanent" / "no opponent controls a creature" / "you control
// another Merfolk or an Island" / "there are no cards in your graveyard" / "it isn't attacking or blocking" /
// "an opponent owns a card in exile"
const fil14 = (ph: string): any => cardFilter14(ph.replace(/^(?:an?|another) /, ''));
EXT.conds.push((t) => {
  let m: RegExpMatchArray | null;
  if ((m = t.match(/^(any player|a player|an opponent|no opponent|no player|you) controls? (another |an? |two or more |three or more )?(.+)$/)) && !/\bthat\b|\bwith\b.*\bcounters?\b/.test(m[3])) {
    if (m[1] === 'you' && !/another|two|three/.test(m[2] ?? '') && !/ or /.test(m[3])) return null;
    const f = fil14(m[3]);
    if (!f) return null;
    const n = /two/.test(m[2] ?? '') ? 2 : /three/.test(m[2] ?? '') ? 3 : 1;
    return { k: 'ext', name: 'ctrl14', who: m[1], f, n, other: /another/.test(m[2] ?? '') };
  }
  if (/^there are no cards in your graveyard$/.test(t) || /^your graveyard is empty$/.test(t)) return { k: 'ext', name: 'gyEmpty14' };
  if (/^(?:it|~) (?:isn't|is not) attacking or blocking$/.test(t)) return { k: 'ext', name: 'notInCombat14' };
  if (/^an opponent owns a card in exile$/.test(t)) return { k: 'ext', name: 'oppExile14' };
  return null;
});
const BUSY14 = Symbol('busy');
const memo14 = (s: any, key: string, fn: () => any) => {
  const v = `${s.bfVer ?? 0}:${s.ts ?? 0}:${s.turn}:${s.battlefield.length}:${s.battlefield[s.battlefield.length - 1] ?? ""}`;
  let m = s.__m14;
  if (!m || m.v !== v) { m = { v, map: new Map() }; Object.defineProperty(s, '__m14', { value: m, enumerable: false, writable: true, configurable: true }); }
  if (m.map.has(key)) { const v = m.map.get(key); return v === BUSY14 ? false : v; }
  m.map.set(key, BUSY14);
  let r: any;
  try { r = fn(); } catch (e) { m.map.delete(key); throw e; }
  m.map.set(key, r);
  return r;
};
EXT.condEval.ctrl14 = (s, c: any, you, self) => memo14(s, `c14:${JSON.stringify(c)}:${you}:${c.other ? self : ''}`, () => ctrl14Raw(s, c, you, self));
const ctrl14Raw = (s: any, c: any, you: any, self?: string) => {
  const who = c.who as string;
  const okP = (p: number) => (who === 'you' ? p === you : who === 'an opponent' || who === 'no opponent' ? p !== you : true);
  const k = s.battlefield.filter((b: string) => okP(s.cards[b].controller) && !(c.other && b === self) && matchesFilter(s, b, { ...c.f, zone: 'battlefield' }, you, self, true)).length;
  return /^no /.test(who) ? k === 0 : k >= c.n;
};
EXT.condEval.gyEmpty14 = (s, _c, you) => s.players[you].graveyard.length === 0;
EXT.condEval.notInCombat14 = (s, _c, _y, self) => !s.combat || !s.combat.attackers.some((a) => a.iid === self || a.blockedBy.includes(self!));
EXT.condEval.oppExile14 = (s, _c, you) => (s.players as any[]).some((p, i) => i !== you && p.exile.length > 0);

// Trap conditions: "if exactly one creature is attacking" / "if four or more creatures are attacking" / "if a white
// creature is attacking" / "if an opponent had two or more creatures enter the battlefield under their control this turn"
const NUM14: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };
const TL14 = (s: any) => { if (s.tl14?.turn !== s.turn) s.tl14 = { turn: s.turn, entered: [[], []], died: [], }; return s.tl14; };
EXT.hooks.afterMove.push((s, iid, _from, to, _o, api) => {
  if (to !== 'battlefield' || !s.cards[iid]) return;
  const b = api.baseChars(s, iid);
  TL14(s).entered[s.cards[iid].controller].push({ iid, types: [...b.types], subtypes: [...b.subtypes], colors: [...b.colors], token: !!(s.cards[iid] as any).token });
});
const snapMatch = (x: any, f: any): boolean => {
  if (f.anyOf) return f.anyOf.some((g: any) => snapMatch(x, g));
  if (f.types?.length && !f.types.some((t: string) => t === 'permanent' || x.types.includes(t))) return false;
  if (f.subtypes?.length && !f.subtypes.some((t: string) => x.subtypes.includes(t))) return false;
  if (f.colors?.length && !f.colors.some((c: string) => x.colors.includes(c))) return false;
  if (f.token && !x.token) return false;
  return true;
};
EXT.conds.push((t) => {
  let m: RegExpMatchArray | null;
  if ((m = t.match(/^(exactly one|exactly two|a|an|one or more|two or more|three or more|four or more|five or more) (.+?) (?:is|are) attacking$/))) {
    const f = cardFilter14(m[2].replace(/s$/, ''));
    if (!f) return null;
    const exact = /^exactly/.test(m[1]);
    const n = exact ? NUM14[m[1].split(' ')[1]] : NUM14[m[1].split(' ')[0]];
    return { k: 'ext', name: 'attackingN14', f, n, exact };
  }
  if ((m = t.match(/^(an opponent|you) had (a|an|one or more|two or more|three or more) (.+?) enter the battlefield under (?:their|your) control this turn$/))) {
    const f = cardFilter14(m[3].replace(/s$/, ''));
    if (!f) return null;
    return { k: 'ext', name: 'enteredN14', f, n: NUM14[m[2].split(' ')[0]], opp: m[1] !== 'you' };
  }
  return null;
});
EXT.condEval.attackingN14 = (s, c: any, you) => {
  const k = (s.combat?.attackers ?? []).filter((a) => matchesFilter(s, a.iid, { ...c.f, zone: 'battlefield' }, you, undefined, true)).length;
  return c.exact ? k === c.n : k >= c.n;
};
EXT.condEval.enteredN14 = (s, c: any, you) => TL14(s).entered[c.opp ? 1 - you : you].filter((x: any) => snapMatch(x, c.f)).length >= c.n;

// "~ becomes a copy of (another) target creature (until end of turn)(, except it has this ability)" (Cryptoplasm,
// Renegade Doppelganger, Protean Thaumaturge)
EXT.rules.push([/^(~|it) becomes? a copy of ((?:another |up to one (?:other )?)?target (?:[a-z]+, )*(?:[a-z]+ or )?(?:nonlegendary )?(?:creature|permanent|artifact|land|enchantment)(?: you control| an opponent controls| on the battlefield)?|that creature)(?: until end of turn)?(, except (?:its name is ~ and )?it has (?:this ability|[a-z ,]+?))?(?: until end of turn)?$/, (m, ctx) => {
  const k0 = ctx.specs.length;
  const sub = m[2] === 'that creature' ? ctx.last : (() => { const r = parseSentence(`destroy ${m[2]}`, ctx); return (r?.[0] as any)?.what ?? (r?.[0] as any)?.target; })();
  if (!sub) { ctx.specs.length = k0; return null; }
  if (m[2] !== 'that creature' && /another|other/.test(m[2])) { const sp: any = ctx.specs[ctx.specs.length - 1]; if (sp) sp.filter = { ...sp.filter, other: true }; }
  let kws: string[] = [];
  const ex = m[3]?.match(/it has (.+)$/)?.[1];
  if (ex && ex !== 'this ability') { const k = parseKeywordList(ex); if (!k) { ctx.specs.length = k0; return null; } kws = k; }
  return [{ k: 'ext', name: 'becomeCopy', what: sub, eot: /until end of turn/.test(m[0]), keep: ex === 'this ability', kws }];
}]);
EXT.effects.becomeCopy = ({ s, item, e, you, api }) => {
  const self: any = s.cards[item.source];
  const [t] = api.subjCards(s, item, e.what) as string[];
  if (!self || self.zone !== 'battlefield' || !t || t === item.source || !s.cards[t]) return 'done';
  const src: any = s.cards[t];
  const prev = { copyOf: self.copyOf, granted: self.granted };
  self.copyOf = src.copyOf ? { ...src.copyOf } : { defId: src.defId, face: src.face };
  if (e.keep) {
    const own = (s.defs[self.defId].oracle ?? '').split('\n').filter((l: string) => /except it has this ability/i.test(l));
    self.granted = [...(self.granted ?? []), ...own];
  }
  if (e.kws?.length) self.mods.push({ keywords: e.kws, until: e.eot ? 'eot' : 'permanent', ts: s.ts++ });
  if (e.eot) self.copyRevert = { turn: s.turn, ...prev };
  api.log(s, `${s.defs[self.defId].name} becomes a copy of ${api.nm(s, t)}.`, you);
  return 'done';
};
EXT.hooks.step.push((s, step) => {
  if (step !== 'cleanup') return;
  for (const b of s.battlefield) { const c: any = s.cards[b]; if (c.copyRevert) { c.copyOf = c.copyRevert.copyOf; c.granted = c.copyRevert.granted; c.copyRevert = undefined; } }
});

// Searches with computed numbers: "search your library for up to X basic land cards, where X is …, put them onto the
// battlefield tapped" / "… for a card with mana value less than or equal to the number of lands you control, …" /
// "… a creature card with mana value equal to the number of verse counters on ~, …"
let srchBusy = false;
EXT.rules.push([/^search your library for (.+)$/, (m, ctx) => {
  if (srchBusy) return null;
  let s0 = m[0];
  let nAmt: any = null, mvAmt: any = null;
  let mm = s0.match(/^search your library for up to x (.+?), where x is (.+?), (put .+)$/);
  if (mm) { nAmt = parseAmtPhrase(mm[2], ctx); if (nAmt == null) return null; s0 = `search your library for up to five ${mm[1]}, ${mm[3]}`; }
  mm = s0.match(/^(search your library for .+? card) with mana value (less than or equal to|equal to) (.+?)(, (?:and )?reveal it,? .+|,? (?:and )?put .+)$/);
  if (mm) { const a = parseAmtPhrase(mm[3], ctx); if (a == null) return null; mvAmt = { a, eq: mm[2] === 'equal to' }; s0 = `${mm[1]}${mm[4]}`; }
  if (!nAmt && !mvAmt) return null;
  srchBusy = true;
  let r: any[] | null;
  try { r = parseSentence(s0, ctx); } finally { srchBusy = false; }
  const e: any = r?.find((x: any) => x.k === 'ext' && x.name === 'search2');
  if (!r || !e || r.some((x: any) => x.k === 'manual')) return null;
  if (nAmt) e.nAmt = nAmt;
  if (mvAmt) e.mvAmt = mvAmt;
  return r;
}]);

// Amounts: "for each color of mana spent to cast it" / "for each mana spent to cast it" / "for each other spell cast this
// turn" / "for each creature that died under your control this turn" / "for each +1/+1 counter among other creatures you
// control" / "for each nontoken creature put into your graveyard from the battlefield this turn"
EXT.hooks.afterMove.push((s, iid, from, to, _o, api) => {
  if (from !== 'battlefield' || to !== 'graveyard' || !s.cards[iid]) return;
  const b = api.baseChars(s, iid);
  if (!b.types.has('creature')) return;
  TL14(s).died.push({ name: s.defs[s.cards[iid].defId]?.name, ctrl: (s.cards[iid] as any).lastController ?? s.cards[iid].controller, owner: s.cards[iid].owner, token: !!(s.cards[iid] as any).token, subtypes: [...b.subtypes], colors: [...b.colors] });
});
EXT.amountPhrases.push((ph) => {
  let m: RegExpMatchArray | null;
  if (/^(?:the number of )?colors? of mana spent to cast (?:it|~|this spell)$/.test(ph)) return { ext: 'colorsSpent14' };
  if (/^(?:the )?mana spent to cast (?:it|~|this spell)$/.test(ph)) return { ext: 'manaSpent' };
  if (/^other spells? cast this turn$/.test(ph)) return { ext: 'otherSpells14' };
  if ((m = ph.match(/^(?:the number of )?(nontoken )?(creatures?|[a-z]+) (?:that died under your control|you controlled that died|put into your graveyard from the battlefield) this turn$/))) {
    const sub = /^creatures?$/.test(m[2]) ? null : m[2].replace(/s$/, '');
    return { ext: 'died14', nontoken: !!m[1], sub, gy: /graveyard/.test(ph) };
  }
  if ((m = ph.match(/^(?:the number of )?(nontoken )?creatures? that died this turn$/))) return { ext: 'died14', nontoken: !!m[1], any: true };
  if ((m = ph.match(/^(?:the number of )?([+-]1\/[+-]1|[a-z]+) counters? (?:among|on) (other )?(.+?) you control$/))) {
    const f = looseFilter(m[3].replace(/s$/, ''));
    if (!f) return null;
    return { ext: 'ctrSum14', counter: m[1], other: !!m[2], f: { ...f, zone: 'battlefield', controller: 'you' } };
  }
  return null;
});
EXT.amounts.colorsSpent14 = (s, _a, _y, self) => Object.entries(((self && (s.cards[self] as any)?.colorCounts) ?? {}) as Record<string, number>).filter(([k, v]) => k !== 'C' && v > 0).length;
EXT.amounts.otherSpells14 = (s) => Math.max(0, (s.players as any[]).reduce((n, p) => n + (p.spellsCastThisTurn ?? 0), 0) - 1);
EXT.amounts.died14 = (s, a: any, you) => TL14(s).died.filter((d: any) => (a.any || (a.gy ? d.owner === you : d.ctrl === you)) && (!a.nontoken || !d.token) && (!a.sub || d.subtypes.includes(a.sub))).length;
EXT.amounts.ctrSum14 = (s, a: any, you, self) => s.battlefield.filter((b) => !(a.other && b === self) && matchesFilter(s, b, a.f, you, self, true)).reduce((n, b) => n + (s.cards[b].counters[a.counter] ?? 0), 0);

// "Each creature you control that's a Wolf or a Werewolf gets +1/+1 and has trample." / "Each creature you control with a
// counter on it has ward {1}." — the singular group form rewritten to the plural one the parsers know.
let eachBusy = false;
EXT.expand.push((line) => {
  const m = line.match(/^each (other )?creature you control(?: that's (an? .+?(?: or an? .+?)?)| (with .+?(?: on it)?|named ~))? (gets|has|is|can't|can|gains|enters|assigns|attacks) (.+)$/);
  if (!m || eachBusy) return null;
  const verb: Record<string, string> = { gets: 'get', has: 'have', is: 'are', "can't": "can't", can: 'can', gains: 'gain', enters: 'enter', assigns: 'assign', attacks: 'attack' };
  let subj = 'creatures you control';
  if (m[2]) subj = `${m[2].replace(/\ban? /g, '')} creatures you control`;
  if (m[3]) subj = `creatures you control ${m[3].replace(/ on it$/, ' on them')}`;
  const rest = m[5].replace(/\bon it\b/g, 'on them').replace(/\bits\b/g, 'their').replace(/(,? and |, )(has|gets|gains|is)\b/g, (_x: string, a: string, v: string) => a + ({ has: 'have', gets: 'get', gains: 'gain', is: 'are' } as any)[v]);
  const out = `${m[1] ?? ''}${subj} ${verb[m[4]]} ${rest}`;
  eachBusy = true;
  try {
    const pc: any = parseCard({ id: `each14:${out}`, name: 'Probe', manaCost: '', cmc: 0, typeLine: 'Enchantment', oracle: out, colors: [], colorIdentity: [], keywords: [], layout: 'normal' } as any);
    return pc.unparsed.length === 0 && automationLevel(pc) === 'full' ? [out] : null;
  } finally { eachBusy = false; }
});
// "Creatures you control with a counter on them have ward {1}." — keyword anthems the core misses
EXT.lines.push((line, pc) => {
  const m = line.match(/^(other )?(.+?) (?:have|has) (.+)$/);
  if (!m || /"/.test(m[3]) || /^~|^enchanted |^equipped |^you\b|^each /.test(m[2])) return false;
  const kws = parseKeywordList(m[3]);
  const ward = !kws && /^ward \{\d+\}$/.test(m[3]);
  if (!kws && !ward) return false;
  const f = groupFilter14(m[2]);
  if (!f || !(f.controller || f.types || f.subtypes)) return false;
  if (m[1]) f.other = true;
  if (ward) { const g: any = { ...f }; delete g.zone; (pc as any).groupGrants = [...((pc as any).groupGrants ?? []), { filter: g, text: m[3].replace(/^w/, 'W') }]; return true; }
  pc.statics.push({ kind: 'anthem', filter: f, p: 0, t: 0, kw: kws } as any);
  return true;
});

// "Each opponent loses 1 life for each creature you control." (the core "for each" scaling skips sentences that start
// with "each")
EXT.rules.push([/^(each opponent|each player|each other player) (loses|gains|draws|mills|discards) (.+?) for each (.+)$/, (m, ctx) => {
  const per: any = parseCountPhrase(m[4]);
  if (!per || typeof per !== 'object') return null;
  const inner = parseSentence(`${m[1]} ${m[2]} ${m[3]}`, ctx);
  if (!inner || inner.length !== 1 || typeof (inner[0] as any).n !== 'number') return null;
  const e: any = inner[0];
  e.n = { ...per, mult: (per.mult ?? 1) * e.n };
  return inner;
}]);
// "If an opponent would gain life, that player loses that much life instead." (Tainted Remedy, Rain of Gore-ish)
EXT.lines.push((line, pc) => {
  if (!/^if an opponent would gain life, that player loses that much life instead$/.test(line)) return false;
  (pc as any).oppGainToLoss = true;
  return true;
});
EXT.hooks.lifeGain.push((s, p, n, api) => {
  if (n <= 0) return n;
  if (!sourcesWith(s, 'oppGainToLoss').some((b) => s.cards[b].controller !== p)) return n;
  api.loseLife(s, p, n);
  return 0;
});
// "Until your next end step, you may play that card." (≈ the impulse "until the end of your next turn")
EXT.seqs.push((sents, i, ctx, ab) => {
  const m = sents[i].match(/^until your next end step, you may (?:play|cast) (that card|it|them|those cards|one of those cards)$/);
  if (!m) return null;
  ab.effects.push({ k: 'mayPlay', what: ctx.last ?? { t: 'exiledTop' }, until: 'nextTurn' } as any);
  return 1;
});

// "Whenever ~ crews a Vehicle, …" / "Whenever ~ becomes crewed (for the first time each turn), …" / "whenever ~ saddles a Mount"
EXT.triggers.push((cond) => {
  if (/^whenever ~ crews a vehicle$/.test(cond)) return [{ event: 'selfCrews', last: { t: 'triggerObj' } }];
  if (/^whenever ~ saddles a mount$/.test(cond)) return [{ event: 'selfSaddles', last: { t: 'triggerObj' } }];
  if (/^whenever ~ crews a vehicle or saddles a mount$|^whenever ~ saddles a mount or crews a vehicle$/.test(cond)) return [{ event: 'selfCrews', last: { t: 'triggerObj' } }, { event: 'selfSaddles', last: { t: 'triggerObj' } }];
  const m = cond.match(/^whenever ~ becomes (crewed|saddled)( for the first time each turn)?$/);
  if (m) return [{ event: m[1] === 'crewed' ? 'selfCrewed' : 'selfSaddled', ...(m[2] ? { data: { once: true } } : {}) }];
  return null;
});
EXT.hooks.event.push((s, name, d, api) => {
  if (name !== 'crewed') return;
  const ev = d.saddle ? 'selfSaddles' : 'selfCrews';
  for (const c of d.crew as string[]) {
    const o = s.cards[c];
    if (!o) continue;
    for (const t of api.chars(s, c).pc.triggers as any[]) if (t.event === ev) api.queueTrigger(s, c, o.controller, t, { triggerObj: d.vehicle });
  }
  const v: any = s.cards[d.vehicle];
  if (!v) return;
  const ev2 = d.saddle ? 'selfSaddled' : 'selfCrewed';
  const first = v.crewedTurn !== s.turn;
  v.crewedTurn = s.turn;
  for (const t of api.chars(s, d.vehicle).pc.triggers as any[]) if (t.event === ev2 && (!t.data?.once || first)) api.queueTrigger(s, d.vehicle, v.controller, t, {});
});

// "For each land you control, create a Treasure token." / "For each creature card in your graveyard, create a 2/2 …"
EXT.rules.push([/^for each (.+?), (create .+|you create .+|draw a card|you draw a card|you gain \d+ life|put a .+? counter on .+)$/, (m, ctx) => {
  const per: any = /^opponent$/.test(m[1]) ? 1 : parseCountPhrase(m[1]);
  if (per == null) return null;
  const inner = parseSentence(m[2].replace(/^you (create|draw|gain)/, '$1'), ctx);
  if (!inner || inner.length !== 1 || typeof (inner[0] as any).n !== 'number') return null;
  const e: any = inner[0];
  e.n = typeof per === 'number' ? per * e.n : { ...per, mult: (per.mult ?? 1) * e.n };
  return inner;
}]);

// "Then if it has three or more +1/+1 counters on it, sacrifice ~." (Ordeals) / "then if that creature's power is 0 or
// less, destroy it" / "then if you have more life than an opponent, …" / "your life total is less than or equal to half
// your starting life total" / "there are three or more basic land types among lands you control"
const ref14 = (s: any, ref: any, item: any, self?: string): string | undefined => {
  if (!ref) return undefined;
  if (ref.t === 'self') return self;
  if (ref.t === 'triggerObj') return item?.triggerObj;
  if (ref.t === 'target') { const t = (item?.targets?.[ref.spec] ?? []).find((x: any) => x.kind === 'card'); return t?.iid; }
  if (ref.t === 'lastToken') return item?.lastTokens?.[0];
  if (ref.t === 'enchanted' || ref.t === 'equipped' || ref.t === 'attached') return self ? s.cards[self]?.attachedTo : undefined;
  return undefined;
};
EXT.seqs.push((sents, i, ctx, ab) => {
  const m = sents[i].match(/^(?:then )?if (it|that creature|~) has (a|an|one|two|three|four|five|six|seven|eight|ten|\d+)(?: or more)? ([+-]1\/[+-]1|[a-z]+) counters? on it, (.+)$/);
  if (!m) return null;
  const ref = m[1] === '~' ? { t: 'self' } : ctx.last ?? { t: 'self' };
  const inner = parseSentence(m[4], ctx);
  if (!inner || inner.some((e: any) => e.k === 'manual')) return null;
  const n = NUM14[m[2]] ?? ({ six: 6, seven: 7, eight: 8, ten: 10 } as any)[m[2]] ?? +m[2];
  ab.effects.push({ k: 'if', cond: { k: 'ext', name: 'refCtr14', ref, n, counter: m[3] }, effects: inner } as any);
  return 1;
});
EXT.condEval.refCtr14 = (s, c: any, _y, self, ctx: any) => { const o = ref14(s, c.ref, ctx?.item, self); return !!o && (s.cards[o]?.counters[c.counter] ?? 0) >= c.n; };
EXT.rules.push([/^(?:then )?if (that creature|it)'s (power|toughness) is (\d+) or (less|greater), (.+)$/, (m, ctx) => {
  const ref = ctx.last;
  if (!ref) return null;
  const inner = parseSentence(m[5], ctx);
  if (!inner || inner.some((e: any) => e.k === 'manual')) return null;
  return [{ k: 'if', cond: { k: 'ext', name: 'refStat14', ref, stat: m[2], n: +m[3], less: m[4] === 'less' }, effects: inner } as any];
}]);
EXT.condEval.refStat14 = (s, c: any, _y, self, ctx: any) => {
  const o = ref14(s, c.ref, ctx?.item, self);
  if (!o || s.cards[o]?.zone !== 'battlefield') return false;
  const v = (chars14(s, o) as any)[c.stat];
  return c.less ? v <= c.n : v >= c.n;
};
const chars14 = (s: any, o: string) => chars(s, o);
EXT.conds.push((t) => {
  if (/^you have more life than an opponent$/.test(t)) return { k: 'ext', name: 'moreLife14' };
  if (/^your life total is less than or equal to half your starting life total$/.test(t)) return { k: 'ext', name: 'halfLife14' };
  const m = t.match(/^there are (two|three|four|five) or more basic land types among lands you control$/);
  if (m) return { k: 'ext', name: 'basicTypes14', n: NUM14[m[1]] };
  return null;
});
EXT.condEval.moreLife14 = (s, _c, you) => s.players.some((p, i) => i !== you && s.players[you].life > p.life);
EXT.condEval.halfLife14 = (s, _c, you) => s.players[you].life <= Math.floor(((s as any).startingLife ?? 20) / 2);
EXT.condEval.basicTypes14 = (s, c: any, you) => {
  const set = new Set<string>();
  for (const b of s.battlefield) if (s.cards[b].controller === you) for (const x of ['plains', 'island', 'swamp', 'mountain', 'forest']) if (chars(s, b).subtypes.has(x)) set.add(x);
  return set.size >= c.n;
};

// "Prevent all damage that would be dealt this turn to up to two target creatures." (duration before the object)
EXT.rules.push([/^prevent all (combat |noncombat )?damage that would be dealt this turn (to|by) (.+)$/, (m, ctx) => parseSentence(`prevent all ${m[1] ?? ''}damage that would be dealt ${m[2]} ${m[3]} this turn`, ctx)]);

// "The next instant or sorcery spell you cast this turn has storm / cascade" / "… can't be countered" / "… costs {2} less
// to cast" / "… can be cast as though it had flash" — a pending modifier on the player, used by the first matching spell.
const NEXT_KW = new Set(['cascade', 'storm', 'flash']);
EXT.rules.push([/^the next (.*?)spell you cast this turn (has (.+)|can't be countered|costs \{(\d+)\} less to cast|can be cast as though it had flash)$/, (m) => {
  const ph = m[1].trim();
  let f: any = {};
  if (ph) { const g = spellFilter14(ph); if (!g) return null; f = g; }
  const mod: any = { filter: f };
  if (m[3]) { const ks = m[3].split(/ and /); if (!ks.every((k) => NEXT_KW.has(k))) return null; mod.kws = ks; }
  else if (/countered/.test(m[2])) mod.uncounter = true;
  else if (m[4]) mod.less = +m[4];
  else mod.flash = true;
  return [{ k: 'ext', name: 'nextSpellMod', mod }];
}]);
const spellFilter14 = (ph: string): any => {
  const g = looseFilter(ph.replace(/ spells?$/, '').trim());
  if (!g) return null;
  const f: any = { ...g };
  delete f.zone; delete f.controller;
  return f;
};
EXT.effects.nextSpellMod = ({ s, e, you }) => { const pl: any = s.players[you]; (pl.nextMods ??= []).push({ ...e.mod, turn: s.turn }); return 'done'; };
const nextMod = (s: any, p: number, iid: string, api: any, pred: (m: any) => boolean) => {
  const pl: any = s.players[p];
  return (pl.nextMods ?? []).find((m: any) => m.turn === s.turn && pred(m) && (!Object.keys(m.filter).length || api.matchesFilter(s, iid, { ...m.filter, zone: s.cards[iid].zone }, p)));
};
EXT.hooks.costMod.push((s, p, iid, cost, _alt, api) => {
  if (!cost || s.cards[iid]?.zone === 'battlefield') return cost;
  const m = nextMod(s, p, iid, api, (x) => !!x.less);
  if (!m) return cost;
  const g = cost.match(/\{(\d+)\}/);
  const k = g ? +g[1] : 0;
  const rest = cost.replace(/\{\d+\}/, '');
  return k - m.less > 0 ? `{${k - m.less}}${rest}` : rest;
});
EXT.hooks.flash.push((s, iid, api) => { const c = s.cards[iid]; const p = c?.owner === undefined ? 0 : (c.controller ?? c.owner); return !!c && !!nextMod(s, p, iid, api, (x) => !!x.flash); });
// "Spells you cast with mana value 6 or greater have cascade." / "Creature spells you cast can't be countered." (statics)
EXT.lines.push((line, pc) => {
  const m = line.match(/^(.*?)spells you cast(?: (with .+?|that .+?))? (have (cascade|storm)|can't be countered)$/);
  if (!m) return false;
  let f: any = {};
  const ph = `${m[1]}${m[2] ? `spell ${m[2]}` : ''}`.trim();
  if (ph) { const g = looseFilter(ph.replace(/ spells?$/, '').replace(/^spell /, 'card ')) ?? looseFilter(ph); if (!g) return false; f = { ...g }; delete f.zone; delete f.controller; if (f.types?.length === 1 && f.types[0] === 'card') delete f.types; }
  (pc as any).spellMod14 = [...((pc as any).spellMod14 ?? []), { filter: f, kws: m[4] ? [m[4]] : undefined, uncounter: !m[4] }];
  return true;
});
EXT.hooks.castPay.push((s, pc, api) => {
  if (pc.kind !== 'spell' || !s.cards[pc.iid]) return;
  const mods: any[] = [];
  for (const b of sourcesWith(s, 'spellMod14')) if (s.cards[b].controller === pc.player) mods.push(...((api.chars(s, b).pc as any).spellMod14 ?? []));
  if (!mods.length) return;
  const c: any = s.cards[pc.iid];
  for (const m of mods) {
    if (Object.keys(m.filter).length && !api.matchesFilter(s, pc.iid, { ...m.filter, zone: c.zone }, pc.player)) continue;
    if (m.uncounter) c.uncounterable = true;
    for (const k of m.kws ?? []) {
      if (k === 'cascade') s.pendingTriggers.push({ id: api.uid(s, 's'), kind: 'trigger', controller: pc.player, source: pc.iid, label: `${api.nm(s, pc.iid)} — cascade`, text: 'Cascade', effects: [{ k: 'cascade' }], targets: [] } as any);
      if (k === 'storm') { const tt: any = (s as any).castTT; const before = tt && tt.turn === s.turn ? tt.n : 0; if (before > 0) s.pendingTriggers.push({ id: api.uid(s, 's'), kind: 'trigger', controller: pc.player, source: pc.iid, label: `${api.nm(s, pc.iid)} — storm (${before})`, text: 'Storm', effects: [{ k: 'copySpell', what: { t: 'triggerObj' }, n: before }], targets: [], triggerObj: pc.iid } as any); }
    }
  }
});
EXT.hooks.castPay.push((s, pc, api) => {
  if (pc.kind !== 'spell' || !s.cards[pc.iid]) return;
  const pl: any = s.players[pc.player];
  if (!pl.nextMods?.length) return;
  const c: any = s.cards[pc.iid];
  const used: any[] = [];
  for (const m of pl.nextMods) {
    if (m.turn !== s.turn) { used.push(m); continue; }
    if (Object.keys(m.filter).length && !api.matchesFilter(s, pc.iid, { ...m.filter, zone: c.zone }, pc.player)) continue;
    for (const k of m.kws ?? []) {
      if (k === 'cascade') s.pendingTriggers.push({ id: api.uid(s, 's'), kind: 'trigger', controller: pc.player, source: pc.iid, label: `${api.nm(s, pc.iid)} — cascade`, text: 'Cascade', effects: [{ k: 'cascade' }], targets: [] } as any);
      if (k === 'storm') {
        const tt: any = (s as any).castTT;
        const before = tt && tt.turn === s.turn ? tt.n : 0;
        if (before > 0) s.pendingTriggers.push({ id: api.uid(s, 's'), kind: 'trigger', controller: pc.player, source: pc.iid, label: `${api.nm(s, pc.iid)} — storm (${before})`, text: 'Storm', effects: [{ k: 'copySpell', what: { t: 'triggerObj' }, n: before }], targets: [], triggerObj: pc.iid } as any);
      }
    }
    if (m.uncounter) c.uncounterable = true;
    used.push(m);
  }
  pl.nextMods = pl.nextMods.filter((m: any) => !used.includes(m));
});
EXT.hooks.afterMove.push((s, iid, from, to, o) => { if ((from === 'stack' || (o as any)?.resolved || (to !== 'stack' && from !== 'hand')) && s.cards[iid]) (s.cards[iid] as any).uncounterable = undefined; });

// "~ can't block black creatures." / "~ can't block creatures with power 3 or greater" / "~ can't block artifact creatures"
EXT.lines.push((line, pc) => {
  const m = line.match(/^~ can't block (.+?)$/);
  if (!m || /\bunless\b|\bif\b|\bthis\b|\balone\b|\bas long\b|~'s power/.test(m[1])) return false;
  const f = cardFilter14(m[1].replace(/creatures/g, 'creature'));
  if (!f) return false;
  (pc as any).cantBlockF = [...((pc as any).cantBlockF ?? []), f];
  return true;
});
EXT.hooks.canBlock.push((s, blocker, attacker, api) => {
  const fs = (api.chars(s, blocker).pc as any).cantBlockF as any[] | undefined;
  if (fs && fs.some((f) => api.matchesFilter(s, attacker, { ...f, zone: 'battlefield' }, s.cards[blocker].controller, blocker))) return false;
  return undefined;
});

// "~ can't block if you control an untapped land." (the "if" twin of "can't … unless …") and a few board conditions
EXT.lines.push((line, pc) => {
  const m = line.match(/^~ can't (attack|block|attack or block) if (.+)$/);
  if (!m) return false;
  const cond = parseCond(m[2]);
  if (!cond) return false;
  (pc as any).cantUnless = { what: m[1], cond: { k: 'ext', name: 'not14', c: cond } };
  return true;
});
EXT.condEval.not14 = (s, c: any, you, self, ctx) => !evalCond(s, c.c, you, self, ctx);
EXT.conds.push((t) => {
  let m: RegExpMatchArray | null;
  if ((m = t.match(/^(?:there is|there's) (an? .+?) on the battlefield$/)) || (m = t.match(/^(an? .+?) is on the battlefield$/))) {
    const f = fil14(m[1]);
    return f ? { k: 'ext', name: 'ctrl14', who: 'any player', f, n: 1, other: false } : null;
  }
  if (/^an opponent (?:has been|was) dealt damage this turn$/.test(t)) return { k: 'ext', name: 'oppDamaged14' };
  return null;
});
EXT.condEval.oppDamaged14 = (s, _c, you) => (s.players as any[]).some((p, i) => i !== you && p.damagedThisTurn);

// Self/board conditions for "~ has X as long as …": it attacked / entered this turn, it has N counters, it has a keyword,
// a [type] card is in your graveyard, an opponent is poisoned, you haven't cast a spell this turn, another [type] entered
// the battlefield under your control this turn.
EXT.hooks.event.push((s, name, d) => { if (name === 'attack') { const t = TL14(s); (t.attacked ??= []).push(...d.list.map((a: any) => a.iid)); } });
EXT.conds.push((t) => {
  let m: RegExpMatchArray | null;
  if (/^(?:it|~) attacked this turn$/.test(t)) return { k: 'ext', name: 'selfAttacked14' };
  if (/^(?:it|~) entered (?:the battlefield )?this turn$/.test(t)) return { k: 'ext', name: 'selfEntered14' };
  if ((m = t.match(/^(?:it|~) has (a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+) or more ([+-]1\/[+-]1|[a-z]+) counters? on it$/))) {
    const n = ({ a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 } as any)[m[1]] ?? +m[1];
    return { k: 'ext', name: 'selfCtr14', n, counter: m[2] };
  }
  if ((m = t.match(/^(?:it|~) has (two|three) or fewer ([+-]1\/[+-]1|[a-z]+) counters? on it$/))) return { k: 'ext', name: 'selfCtr14', n: NUM14[m[1]] + 1, counter: m[2], not: true };
  if ((m = t.match(/^(?:it|~) has (flying|defender|first strike|deathtouch|trample|haste|reach|vigilance|lifelink|menace)$/))) return { k: 'ext', name: 'selfKw14', kw: m[1] };
  if ((m = t.match(/^(?:an?|one or more) (.+?) cards? (?:is|are) in your graveyard$/))) { const f = cardFilter14(m[1]); return f ? { k: 'ext', name: 'gyHas14', f } : null; }
  if (/^an opponent is poisoned$/.test(t)) return { k: 'ext', name: 'oppPoisoned14' };
  if (/^you haven't cast a spell this turn$/.test(t)) return { k: 'ext', name: 'noCast14' };
  if ((m = t.match(/^another (.+?) entered the battlefield under your control this turn$/))) { const f = cardFilter14(m[1]); return f ? { k: 'ext', name: 'anotherEntered14', f } : null; }
  return null;
});
EXT.condEval.selfAttacked14 = (s, _c, _y, self) => !!self && (TL14(s).attacked ?? []).includes(self);
EXT.condEval.selfEntered14 = (s, _c, _y, self) => !!self && (s.cards[self] as any)?.enteredTurn === s.turn;
EXT.condEval.selfCtr14 = (s, c: any, _y, self) => { const v = (self ? s.cards[self]?.counters[c.counter] : 0) ?? 0; return c.not ? v < c.n : v >= c.n; };
EXT.condEval.selfKw14 = (s, c: any, _y, self) => !!self && baseChars(s, self).keywords.has(c.kw);
EXT.condEval.gyHas14 = (s, c: any, you, self) => s.players[you].graveyard.some((g) => matchesFilter(s, g, { ...c.f, zone: 'graveyard' }, you, self, true));
EXT.condEval.oppPoisoned14 = (s, _c, you) => (s.players as any[]).some((p, i) => i !== you && ((p.poison ?? p.counters?.poison ?? 0) > 0));
EXT.condEval.noCast14 = (s, _c, you) => ((s.players[you] as any).spellsCastThisTurn ?? 0) === 0;
EXT.condEval.anotherEntered14 = (s, c: any, you, self) => TL14(s).entered[you].some((x: any) => x.iid !== self && snapMatch(x, c.f));

// "Whenever you cast a spell that's both red and white, …" (the Shadowmoor hybrid Mimics)
const CW14: Record<string, string> = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };
EXT.triggers.push((cond) => {
  const m = cond.match(/^whenever you cast a spell that's both (white|blue|black|red|green) and (white|blue|black|red|green)$/);
  return m ? [{ event: 'castSpell', filter: { types: ['spell'] } as any, last: { t: 'triggerObj' } as any, cond: { k: 'ext', name: 'trigBoth14', cols: [CW14[m[1]], CW14[m[2]]] } as any }] : null;
});
EXT.condEval.trigBoth14 = (s, c: any, _y, _self, ctx: any) => { const o = ctx?.triggerObj ?? ctx?.item?.triggerObj; if (!o || !s.cards[o]) return false; const cols = chars(s, o).colors; return c.cols.every((x: string) => cols.includes(x as any)); };

// "~ has base power and toughness 4/2 until end of turn and gains first strike until end of turn." — one subject, two
// predicates: split at each " and <verb>" and parse both halves (the second refers back with "it").
let predBusy = false;
EXT.rules.push([/^(~|it|that creature|target creature(?: you control| an opponent controls| you don't control)?|enchanted creature|equipped creature) (.+ and (?:gains?|gets?|has|can't|can|must|attacks|loses?|becomes?|deals?) .+)$/, (m, ctx) => {
  if (predBusy) return null;
  const body = m[2];
  const re = / and (?=(?:gains?|gets?|has|can't|can|must|attacks|loses?|becomes?|deals?) )/g;
  let mm: RegExpExecArray | null;
  predBusy = true;
  try {
    while ((mm = re.exec(body))) {
      const a = body.slice(0, mm.index), b = body.slice(mm.index + 5);
      const k0 = ctx.specs.length, last0 = ctx.last;
      const r1 = parseSentence(`${m[1]} ${a}`, ctx);
      if (!r1 || r1.some((e: any) => e.k === 'manual')) { ctx.specs.length = k0; ctx.last = last0; continue; }
      const subj2 = m[1] === '~' ? '~' : 'it';
      const r2 = parseSentence(`${subj2} ${b.replace(/^(gain|get|lose|become|deal)s? /, (x: string) => x)}`, ctx);
      if (!r2 || r2.some((e: any) => e.k === 'manual')) { ctx.specs.length = k0; ctx.last = last0; continue; }
      return [...r1, ...r2];
    }
  } finally { predBusy = false; }
  return null;
}]);

// "Whenever a Forest is tapped for mana, its controller adds an additional {G}." (Vernal Bloom, Gauntlet of Might) /
// "Whenever a player taps an Island for mana, that player adds an additional {U}." (High Tide's static cousins)
EXT.lines.push((line, pc) => {
  const m = line.match(/^whenever (?:an? (.+?) is tapped for mana, its controller|a player taps an? (.+?) for mana, that player) adds an additional ((?:\{[wubrgc]\})+)$/);
  if (!m) return false;
  const ph = m[1] ?? m[2];
  const f: any = ph === 'land' ? { types: ['land'] } : looseFilter(ph);
  if (!f) return false;
  const g = { ...f }; delete g.zone;
  ((pc as any).manaTrig ??= []).push({ scope: 'any', filter: g, add: { fixed: (m[3].match(/[wubrgc]/g) ?? []).map((c) => c.toUpperCase()) } });
  return true;
});

// State triggers: "When you control no snow lands, sacrifice ~." / "When you control a Dwarf, sacrifice ~." / "When you
// control seven or more Thrulls, sacrifice ~." / "When no creatures are on the battlefield, sacrifice ~."
EXT.lines.push((line, pc) => {
  let m = line.match(/^when you control (no|an?|two or more|three or more|seven or more) (other )?(.+?), sacrifice ~$/);
  let st: any = null;
  if (m) {
    const f = cardFilter14(m[3].replace(/s$/, ''));
    if (!f) return false;
    const n = m[1] === 'no' ? 0 : /^an?$/.test(m[1]) ? 1 : ({ two: 2, three: 3, seven: 7 } as any)[m[1].split(' ')[0]];
    st = { f, n, none: m[1] === 'no', other: !!m[2], who: 'you' };
  } else if ((m = line.match(/^when no (.+?) are on the battlefield, sacrifice ~$/))) {
    const f = cardFilter14(m[1].replace(/s$/, ''));
    if (!f) return false;
    st = { f, n: 0, none: true, who: 'any' };
  }
  if (!st) return false;
  (pc as any).stateSac = st;
  return true;
});
EXT.hooks.sba.push((s, api) => {
  let did = false;
  for (const b of sourcesWith(s, 'stateSac')) {
    const st = (api.chars(s, b).pc as any).stateSac;
    const me = s.cards[b].controller;
    const k = s.battlefield.filter((x) => (st.who === 'any' || s.cards[x].controller === me) && !(st.other && x === b) && api.matchesFilter(s, x, { ...st.f, zone: 'battlefield' }, me, b)).length;
    if (st.none ? k === 0 : k >= st.n) { api.log(s, `${api.nm(s, b)} is sacrificed.`, me); api.moveCard(s, b, 'graveyard', { cause: 'sacrifice' }); did = true; }
  }
  return did;
});

// "~ becomes an artifact creature." / "~ becomes a 7/7 Beast creature in addition to its other types." — no duration:
// the same change as the "until end of turn" form, but permanent.
let becBusy = false;
EXT.rules.push([/^(~|it|that creature|target (?:land|artifact|creature|permanent)(?: you control)?) becomes (.+)$/, (m, ctx) => {
  if (becBusy || /until|this turn|for as long|copy of|prepared|the chosen color|that color|monstrous|renowned|saddled|plotted|the monarch/.test(m[2])) return null;
  becBusy = true;
  let r: any[] | null;
  try { r = parseSentence(`${m[1]} becomes ${m[2]} until end of turn`, ctx); } finally { becBusy = false; }
  if (!r || r.length !== 1 || !['tempChars', 'becomeCreature'].includes((r[0] as any).name)) return null;
  (r[0] as any).perm = true;
  return r;
}]);

// "that creature gets an additional +2/+2 …" / "that creature also gains trample …": the same effect without the adverb
EXT.rules.push([/^(.+?) (also (?:gets?|gains?|has|deals?)|(?:gets?|deals?) an additional) (.+)$/, (m, ctx) => {
  const verb = m[2].replace(/^also /, '').replace(/ an additional$/, '');
  return parseSentence(`${m[1]} ${verb} ${m[3]}`, ctx);
}]);

// "Whenever a creature with flying attacks, …" (Gravity Well) / "whenever a creature attacks one of your opponents or a
// planeswalker an opponent controls, …" (Gahiji) / "whenever a creature you control that's enchanted or equipped attacks"
EXT.triggers.push((cond) => {
  const m = cond.match(/^whenever (?:a|an|another) (.+?) attacks( one of your opponents(?: or a planeswalker an opponent controls)?| you| a player alone)?$/);
  if (!m || / you control attacks$/.test(cond.replace(m[2] ?? '', ''))) return null;
  let ph = m[1];
  let rel: string | undefined;
  const r = ph.match(/^(.+?) that's (enchanted or equipped|enchanted|equipped)$/);
  if (r) { ph = r[1]; rel = r[2]; }
  const f: any = parseFilter(ph);
  if (!f) return null;
  const where = m[2] ? (/opponents/.test(m[2]) ? 'opp' : / you$/.test(m[2]) ? 'you' : 'alone') : null;
  return [{ event: 'anyAttacksF', filter: f, last: { t: 'triggerObj' } as any, data: { where, rel, other: /^whenever another/.test(cond) } }];
});
EXT.hooks.event.push((s, name, d, api) => {
  if (name !== 'attack') return;
  const list = d.list as { iid: string; target: any }[];
  for (const oid of api.observers(s)) {
    const o = s.cards[oid];
    if (!o) continue;
    for (const t of api.chars(s, oid).pc.triggers as any[]) {
      if (t.event !== 'anyAttacksF') continue;
      for (const a of list) {
        if (t.data?.other && a.iid === oid) continue;
        if (!api.matchesFilter(s, a.iid, { ...t.filter, zone: 'battlefield' }, o.controller, oid)) continue;
        const w = t.data?.where;
        const tgtCtrl = a.target?.kind === 'player' ? a.target.idx : s.cards[a.target?.iid]?.controller;
        if (w === 'opp' && tgtCtrl === o.controller) continue;
        if (w === 'you' && tgtCtrl !== o.controller) continue;
        if (w === 'alone' && (list.length !== 1 || a.target?.kind !== 'player')) continue;
        const rel = t.data?.rel;
        if (rel) {
          const att = s.battlefield.filter((x) => s.cards[x].attachedTo === a.iid).map((x) => chars(s, x).subtypes);
          const enc = att.some((st) => st.has('aura')), eq = att.some((st) => st.has('equipment'));
          if (rel === 'enchanted' ? !enc : rel === 'equipped' ? !eq : !(enc || eq)) continue;
        }
        api.queueTrigger(s, oid, o.controller, t, { triggerObj: a.iid, triggerPlayer: d.p });
      }
    }
  }
});
// "Whenever a Minotaur attacks this turn, …" (a spell's one-turn trigger) — the same as "until end of turn, whenever …"
EXT.rules.push([/^(whenever .+? (?:attacks|blocks|dies|enters)) this turn, (.+)$/, (m, ctx) => parseSentence(`until end of turn, ${m[1]}, ${m[2]}`, ctx)]);

// "Each player returns all creature cards from their graveyard to their hand." / "… all black and all red creature cards …
// to the battlefield" / "… all cards named ~ from their graveyard to the battlefield"
EXT.rules.push([/^each player returns all (.+?) from their graveyard to (their hand|the battlefield)$/, (m) => {
  let ph = m[1];
  let f: any;
  if (/^cards named ~$/.test(ph)) f = { sameName: true };
  else {
    ph = ph.replace(/ cards?$/, '').replace(/\ball /g, '').replace(/ and /g, ' or ');
    f = cardFilter14(ph);
    if (!f) return null;
  }
  return [{ k: 'ext', name: 'gyReturnAll14', f, dest: m[2] === 'their hand' ? 'hand' : 'battlefield' }];
}]);
EXT.effects.gyReturnAll14 = ({ s, item, e, api }) => {
  const srcName = api.nm(s, item.source);
  for (let p = 0; p < s.players.length; p++) {
    for (const g of [...s.players[p].graveyard]) {
      const ok = e.f.sameName ? api.nm(s, g) === srcName : api.matchesFilter(s, g, { ...e.f, zone: 'graveyard' }, p);
      if (ok) api.moveCard(s, g, e.dest, e.dest === 'battlefield' ? { controller: s.cards[g].owner } : {});
    }
  }
  return 'done';
};

// "~ gets +X/+0, where X is the greatest power among creature cards in your graveyard." (a static self pump by an amount)
EXT.lines.push((line, pc) => {
  const m = line.match(/^~ gets ([+-])x\/([+-])(x|0), where x is (.+)$/);
  if (!m) return false;
  const a: any = parseAmtPhrase(m[4], { specs: [], selfName: '~', last: { t: 'self' } } as any);
  if (a == null || typeof a === 'number') return false;
  const sg = (sign: string) => (sign === '-' ? { ...a, mult: -((a.mult ?? 1)) } : a);
  pc.statics.push({ kind: 'selfPump', p: sg(m[1]), t: m[3] === '0' ? 0 : sg(m[2]), kw: [] } as any);
  return true;
});
// "for each other creature on the battlefield with flying" / "for each other creature on the battlefield named ~"
EXT.amountPhrases.push((ph) => {
  const m = ph.match(/^(?:the number of )?(other )?(.+?) on the battlefield( with .+| named ~)?$/);
  if (!m) return null;
  if (/ named ~$/.test(m[3] ?? '')) { const f = looseFilter(m[2].replace(/s$/, '')); return f ? { ext: 'bfCount14', f: { ...f, zone: 'battlefield' }, other: !!m[1], sameName: true } : null; }
  const f = looseFilter(`${m[2].split(' ').map((w) => singular(w)).join(' ')}${m[3] ?? ''}`);
  return f ? { ext: 'bfCount14', f: { ...f, zone: 'battlefield' }, other: !!m[1] } : null;
});
EXT.amounts.bfCount14 = (s, a: any, you, self) => s.battlefield.filter((b) => !(a.other && b === self) && matchesFilter(s, b, a.f, you, self, true) && (!a.sameName || (self && s.cards[b].defId === s.cards[self]?.defId) || (self && s.defs[s.cards[b].defId]?.name === s.defs[s.cards[self].defId]?.name))).length;
// "Whenever ~ blocks or becomes blocked by one or more black creatures" / "whenever ~ blocks one or more black creatures"
EXT.triggers.push((cond) => {
  const m = cond.match(/^whenever ~ (blocks or becomes blocked by|blocks|becomes blocked by) one or more (.+?)$/);
  if (!m) return null;
  const ph = m[2].replace(/ and\/or /g, ' or ').replace(/creatures/, 'creature').replace(/s$/, '');
  return matchTriggerCond(`whenever ~ ${m[1]} a ${ph}`);
});

// "Draw a card if you have no cards in hand." / "… if a creature died this turn" — a trailing condition about the game
// (conditions about "it"/"that creature" are left alone: they refer to an object, not to ~)
let trailBusy = false;
EXT.rules.push([/^(.+?) if (.+)$/, (m, ctx) => {
  if (trailBusy) return null;
  const s0 = m[0];
  const idxs: number[] = [];
  for (let i = s0.indexOf(' if '); i >= 0; i = s0.indexOf(' if ', i + 1)) idxs.push(i);
  for (const i of idxs) {
    const a = s0.slice(0, i), c = s0.slice(i + 4);
    if (/^(?:it|its|it's|that|they|their|able|possible|any)\b/.test(c) || /^you (?:do|don't|did|didn't)(?: so)?$/.test(c) || /\binstead$|as though$/.test(a)) continue;
    const cond = parseCond(c);
    if (!cond) continue;
    const k0 = ctx.specs.length, last0 = ctx.last;
    trailBusy = true;
    let inner: any[] | null;
    try { inner = parseSentence(a, ctx); } finally { trailBusy = false; }
    if (!inner || inner.some((e: any) => e.k === 'manual')) { ctx.specs.length = k0; ctx.last = last0; continue; }
    return [{ k: 'if', cond, effects: inner } as any];
  }
  return null;
}]);

// "if you've cast another blue spell this turn" / "you control a creature with the greatest power among creatures on the
// battlefield (or tied)"
EXT.hooks.castPay.push((s, pc, api) => {
  if (pc.kind !== 'spell' || !s.cards[pc.iid]) return;
  const t = TL14(s);
  ((t.casts ??= [[], []])[pc.player] as any[]).push({ iid: pc.iid, colors: [...api.chars(s, pc.iid).colors], types: [...api.chars(s, pc.iid).types] });
});
EXT.conds.push((t) => {
  let m: RegExpMatchArray | null;
  if ((m = t.match(/^you've cast another (white|blue|black|red|green|creature|instant|sorcery|artifact|enchantment|noncreature) spell this turn$/))) return { k: 'ext', name: 'castAnother14', w: m[1] };
  if (/^you control (?:a|the) creature with the greatest (power|toughness) among creatures on the battlefield(?: or (?:is )?tied for the greatest (?:power|toughness))?$/.test(t)) return { k: 'ext', name: 'greatestMine14', stat: /toughness/.test(t) ? 'toughness' : 'power' };
  return null;
});
EXT.condEval.castAnother14 = (s, c: any, you, self) => {
  const list = ((TL14(s).casts ?? [[], []])[you] ?? []) as any[];
  const ok = (x: any) => (CW14[c.w] ? x.colors.includes(CW14[c.w]) : c.w === 'noncreature' ? !x.types.includes('creature') : x.types.includes(c.w));
  return list.filter((x) => x.iid !== self && ok(x)).length >= 1;
};
EXT.condEval.greatestMine14 = (s, c: any, you) => {
  const cs = s.battlefield.filter((b) => chars(s, b).types.has('creature'));
  if (!cs.length) return false;
  const best = Math.max(...cs.map((b) => (chars(s, b) as any)[c.stat]));
  return cs.some((b) => s.cards[b].controller === you && (chars(s, b) as any)[c.stat] === best);
};

// "You gain 3 life and get {E}{E}{E}." / "you gain 1 life and draw a card" — an implied "you" after "and"
EXT.rules.push([/^you (.+?) and (get|draw|scry|surveil|mill|create|gain|lose|put|return|exile|discard|sacrifice|investigate|proliferate) (.+)$/, (m, ctx) => {
  const a = parseSentence(`you ${m[1]}`, ctx);
  if (!a || a.some((e: any) => e.k === 'manual')) return null;
  const b = parseSentence(`${['get', 'gain', 'lose', 'draw', 'mill', 'discard', 'sacrifice'].includes(m[2]) ? 'you ' : ''}${m[2]} ${m[3]}`, ctx) ?? parseSentence(`${m[2]} ${m[3]}`, ctx);
  if (!b || b.some((e: any) => e.k === 'manual')) return null;
  return [...a, ...b];
}]);
// "Whenever you cast a black spell or a Swamp you control enters, …" (the Magus staffs) — two heads joined by "or"
EXT.triggers.push((cond) => {
  const m = cond.match(/^whenever (you cast an? .+? spell) or (an? .+? (?:you control )?enters)$/);
  if (!m) return null;
  const a = matchTriggerCond(`whenever ${m[1]}`), b = matchTriggerCond(`whenever ${m[2]}`);
  return a && b ? [...a, ...b] : null;
});

// Sieges and other "As ~ enters, choose X or Y. • X — … • Y — …": the chosen mode's abilities apply (gated on the choice,
// which is made by an enters trigger).
EXT.lines.push((line, pc) => {
  const m = line.match(/^as ~ enters, choose ([a-z']+) or ([a-z']+)\.?\n• \1 — ([^\n]+)\n• \2 — ([^\n]+)$/);
  if (!m) return false;
  const parts: any[] = [];
  for (const [mode, text] of [[m[1], m[3]], [m[2], m[4]]]) {
    const probe: any = parseCard({ id: `siege:${text}`, name: 'Probe', manaCost: '', cmc: 0, typeLine: 'Enchantment', oracle: text, colors: [], colorIdentity: [], keywords: [], layout: 'normal' } as any);
    if (probe.unparsed.length || automationLevel(probe) !== 'full') return false;
    const extra = Object.keys(probe).filter((k) => !['keywords', 'triggers', 'activated', 'statics', 'unparsed', 'kwArgs', 'replacements', 'spell'].includes(k) && probe[k] != null && !(Array.isArray(probe[k]) && !probe[k].length));
    if (extra.length || probe.keywords.length) return false;
    parts.push({ mode, probe });
  }
  for (const { mode, probe } of parts) {
    const gate = { k: 'ext', name: 'siegeMode14', mode };
    for (const t of probe.triggers) pc.triggers.push({ ...t, gate } as any);
    for (const a of probe.activated) pc.activated.push({ ...a, gate } as any);
    for (const x of probe.statics) pc.statics.push({ ...x, gate } as any);
    for (const r of probe.replacements ?? []) pc.replacements.push({ ...r, gate } as any);
  }
  (pc as any).gated = true;
  pc.triggers.push({ event: 'etb', text: `As ~ enters, choose ${m[1]} or ${m[2]}.`, ability: { text: `choose ${m[1]} or ${m[2]}`, effects: [{ k: 'ext', name: 'siegeChoose14', modes: [m[1], m[2]] }], specs: [], manual: [] } } as any);
  return true;
});
EXT.condEval.siegeMode14 = (s, c: any, _y, self) => !!self && (s.cards[self] as any)?.siegeMode === c.mode;
EXT.effects.siegeChoose14 = ({ s, item, e, r, you, api }) => {
  const c: any = s.cards[item.source];
  if (!c) return 'done';
  if (!r.sub) {
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'yesno', title: `${api.nm(s, item.source)}: choose`, options: [{ id: 'yes', label: e.modes[0] }, { id: 'no', label: e.modes[1] }], data: { ctx: 'resolve' } });
    return 'wait';
  }
  c.siegeMode = r.sub.answered === 'no' ? e.modes[1] : e.modes[0];
  api.log(s, `${api.nm(s, item.source)}: ${c.siegeMode} chosen.`, you);
  return 'done';
};

// "You may return ~ from your graveyard to the battlefield attached to that creature." (the Dragon auras)
EXT.rules.push([/^return ~ from your graveyard to the battlefield attached to (that creature|it)$/, (_m, ctx) => [{ k: 'ext', name: 'returnAttach14', to: ctx.last ?? { t: 'triggerObj' } }]]);
EXT.effects.returnAttach14 = ({ s, item, e, you, api }) => {
  const c: any = s.cards[item.source];
  const [host] = api.subjCards(s, item, e.to) as string[];
  if (!c || c.zone !== 'graveyard' || !host || s.cards[host]?.zone !== 'battlefield') return 'done';
  api.moveCard(s, item.source, 'battlefield', { controller: you });
  if (s.cards[item.source]?.zone === 'battlefield') s.cards[item.source].attachedTo = host;
  return 'done';
};
// Mark triggers that work from the graveyard ("return ~ from your graveyard …"); the engine watches those cards there.
EXT.post.push((pc) => {
  const gyT = pc.triggers.filter((t: any) => / ~ from your graveyard\b/.test(t.ability?.text ?? t.text ?? '') && !['dies', 'ltb', 'selfDiscarded', 'selfMilled'].includes(t.event) && !(t.cond?.name === 'inZone'));
  if (!gyT.length) return;
  for (const t of pc.triggers as any[]) t.fromGy = gyT.includes(t);
  (pc as any).gyTrig = true;
});
// "Whenever a Minotaur attacks this turn, it gets +2/+0 until end of turn." (a spell line) → a one-turn trigger
EXT.expand.push((line) => {
  const m = line.match(/^whenever (.+?) this turn, (.+)$/);
  if (!m || /first time|each turn|\bif\b/.test(m[1])) return null;
  if (matchTriggerCond(`whenever ${m[1]} this turn`) || !matchTriggerCond(`whenever ${m[1]}`)) return null;
  return [`until end of turn, whenever ${m[1]}, ${m[2]}`];
});

// Performance: board-count conditions are re-checked inside every characteristics computation; memoise them per
// battlefield version when their filters only look at characteristics.
const STABLE14 = new Set(['types', 'subtypes', 'supertypes', 'colors', 'controller', 'zone', 'other', 'subAny', 'allTypes', 'notTypes', 'notColors', 'multicolored', 'colorless', 'token', 'nontoken', 'keyword']);
const stableF = (f: any): boolean => !!f && Object.keys(f).every((k) => STABLE14.has(k) || (k === 'anyOf' && f.anyOf.every(stableF)));
for (const name of ['oppControls', 'controlAny', 'bfCount']) {
  const prev = EXT.condEval[name];
  if (!prev) continue;
  EXT.condEval[name] = (s, c: any, you, self, ctx) => {
    const fs = c.filter ? [c.filter] : c.fs ?? [];
    if (!fs.every(stableF)) return prev(s, c, you, self, ctx);
    return memo14(s, `${name}:${JSON.stringify(c)}:${you}:${fs.some((f: any) => f.other) ? self : ''}`, () => prev(s, c, you, self, ctx));
  };
}

// "You may cast ~ from your graveyard by discarding a card in addition to paying its other costs." (Dragon Man, Helbrute)
EXT.lines.push((line, pc) => {
  const m = line.match(/^you may cast ~ from your graveyard by (.+?) in addition to paying its other costs$/);
  if (!m) return false;
  const txt = m[1].replace(/\bdiscarding\b/g, 'discard').replace(/\bpaying\b/g, 'pay').replace(/\bexiling\b/g, 'exile').replace(/\bsacrificing\b/g, 'sacrifice').replace(/\btapping\b/g, 'tap').replace(/\breturning\b/g, 'return');
  const a = parseAddCost(txt);
  if (!a) return false;
  (pc as any).castSelfFrom = { zones: ['graveyard'], cond: null };
  (pc as any).selfFromCost = a;
  return true;
});

// "You may cast a spell from your hand with mana value less than or equal to that damage without paying its mana cost."
EXT.rules.push([/^(?:you may )?cast (?:a|an) (.+?) (?:spell )?from your hand with mana value less than or equal to (.+?) without paying its mana cost$/, (m, ctx) => {
  const ph = m[1].replace(/ spell$/, '');
  const f = ph === 'spell' || ph === '' ? {} : looseFilter(ph);
  const max = parseAmtPhrase(m[2], ctx);
  if (!f || max == null) return null;
  const g: any = { ...f }; delete g.zone;
  return [{ k: 'ext', name: 'castFree', filter: g, max }];
}]);
EXT.amountPhrases.push((ph) => (/^(?:that damage|that much damage|the amount of damage dealt|that much)$/.test(ph) ? ({ trigAmount: true } as any) : null));

// Amounts: "the number of cards in their hand minus 4" (Black Vise) / "3 minus the number of cards in their hand" (The Rack)
// / "the number of cards in that player's hand"
EXT.amountPhrases.unshift((ph) => {
  let m: RegExpMatchArray | null;
  if (/^(?:the number of )?cards in (?:their|that player's|his or her) hand$/.test(ph)) return { ext: 'refHand14' };
  if ((m = ph.match(/^(\d+) minus (.+)$/))) { const a = parseCountPhrase(m[2]); return a != null ? { ext: 'minus14', k: +m[1], a, rev: true } : null; }
  if ((m = ph.match(/^(.+) minus (\d+)$/))) { const a = parseCountPhrase(m[1]); return a != null ? { ext: 'minus14', k: +m[2], a } : null; }
  return null;
});
EXT.amounts.refHand14 = (s, _a, you, _self, ctx) => s.players[refPlayer(s, you, ctx)]?.hand.length ?? 0;
EXT.amounts.minus14 = (s, a: any, you, self, ctx) => Math.max(0, a.rev ? a.k - evalAmt(s, a.a, you, self, ctx) : evalAmt(s, a.a, you, self, ctx) - a.k);
// "At the beginning of the chosen player's upkeep, …" (The Rack, Black Vise: the opponent chosen as it entered)
EXT.triggers.push((cond) => (/^at the beginning of the chosen player's upkeep$/.test(cond) ? [{ event: 'eachUpkeep', lastPlayer: { t: 'triggerPlayer' } as any, cond: { k: 'ext', name: 'chosenActive14' } as any }] : null));
EXT.condEval.chosenActive14 = (s, _c, you, self) => { const ch = self ? (s.cards[self] as any)?.chosenOpponent ?? (s.cards[self] as any)?.chosenPlayer : undefined; return s.active === (ch ?? 1 - you); };

// "~ deals X damage to each of up to two targets." / "… to each of up to six targets" (any targets)
const NW14: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
EXT.rules.push([/^(~|it) deals (\d+|x) damage to each of (up to )?(one|two|three|four|five|six|seven|eight|nine|ten|\d+) targets$/, (m, ctx) => {
  const n = /^\d+$/.test(m[4]) ? +m[4] : NW14[m[4]];
  if (!n) return null;
  ctx.specs.push({ filter: { types: ['creature', 'planeswalker', 'battle'] }, count: n, upTo: !!m[3], label: `${m[3] ? 'up to ' : ''}${n} targets`, players: 'any' } as any);
  return [{ k: 'damage', n: m[2] === 'x' ? 'X' : +m[2], to: [{ t: 'target', spec: ctx.specs.length - 1 }], from: m[1] === '~' ? { t: 'self' } : ctx.last ?? { t: 'self' } }];
}]);

// "Creatures you control are Slivers in addition to their other creature types." / "… are artifacts in addition to their
// other types" (the "the same is true for …" tail of some cards is left to the card)
EXT.lines.push((line, pc) => {
  const m = line.match(/^(other )?(creatures you control|creature tokens you control|[a-z ]+ you control) (?:are|is) (?:an? )?([a-z ]+?) in addition to their other (?:creature )?types$/);
  if (!m) return false;
  const f = groupFilter14(m[2]);
  if (!f) return false;
  if (m[1]) f.other = true;
  const types: string[] = [], subs: string[] = [];
  for (const w0 of m[3].split(' ')) {
    const w = singular(w0);
    if (['artifact', 'enchantment', 'creature', 'land'].includes(w)) types.push(w);
    else if (SUBTYPES.has(w)) subs.push(w);
    else return false;
  }
  pc.statics.push({ kind: 'anthem', filter: f, p: 0, t: 0, kw: [], addTypes: types, addSubtypes: subs } as any);
  return true;
});
// "Creatures you control of the chosen type get +1/+1." → "Creatures of the chosen type you control …"
EXT.expand.push((line) => {
  const m = line.match(/^(.*?)\b(other )?(creatures|permanents) you control of the chosen type (.+)$/);
  return m ? [`${m[1]}${m[2] ?? ''}${m[3]} of the chosen type you control ${m[4]}`] : null;
});

// "Exile the top card of target opponent's library." / "… of that player's library" / "… of each player's library"
EXT.rules.push([/^exile the top (card|two cards|three cards|x cards) of (target player's|target opponent's|that player's|each player's|each opponent's|defending player's) library$/, (m, ctx) => {
  const ph = m[2].replace(/'s$/, '');
  const who = ph === 'that player' ? ctx.lastPlayer ?? { t: 'triggerPlayer' } : ph === 'each player' ? { t: 'eachPlayer' } : ph === 'each opponent' ? { t: 'eachOpp' } : ph === 'defending player' ? { t: 'defending' } : parsePlayerSubject(ph, ctx);
  if (!who) return null;
  ctx.last = { t: 'exiledTop' };
  const n = m[1] === 'card' ? 1 : m[1].startsWith('two') ? 2 : m[1].startsWith('three') ? 3 : 'X';
  return [{ k: 'exileTop', n, who } as any];
}]);

// Chancellors: "You may reveal ~ from your opening hand. If you do, at the beginning of the first upkeep, …" (revealed
// automatically; the effect happens at the game's first upkeep)
EXT.lines.push((line, pc) => {
  const m = line.match(/^you may reveal ~ from your opening hand\. if you do, (?:at the beginning of the first upkeep, (.+)|(.+) at the beginning of your first upkeep)$/);
  if (!m) return false;
  const text = m[1] ?? m[2];
  const probe: any = parseCard({ id: `chanc:${text}`, name: 'Probe', manaCost: '', cmc: 0, typeLine: 'Sorcery', oracle: text, colors: [], colorIdentity: [], keywords: [], layout: 'normal' } as any);
  if (!probe.spell || probe.spell.manual.length || probe.spell.specs.length || automationLevel(probe) !== 'full') return false;
  (pc as any).chancellor = { text, effects: probe.spell.effects };
  return true;
});
EXT.hooks.step.push((s, step, api) => {
  if ((s as any).chancellorsDone || step !== 'upkeep') return;
  (s as any).chancellorsDone = true;
  for (const pl of s.players) for (const h of [...pl.hand]) {
    const ch = (api.parsedFor(s, s.cards[h]) as any).chancellor;
    if (!ch) continue;
    api.log(s, `${pl.name} reveals ${api.nm(s, h)} from their opening hand.`, pl.idx);
    s.pendingTriggers.push({ id: api.uid(s, 's'), kind: 'trigger', controller: pl.idx, source: h, label: api.nm(s, h), text: ch.text, effects: api.clone(ch.effects), targets: [] } as any);
  }
});

// State triggers (603.8): "When you have 10 or less life, …" / "When an opponent controls a creature with power 4 or
// greater, …" — trigger once when the state becomes true, again only after it stops being true.
EXT.conds.push((t) => (/^a player has no cards in hand$/.test(t) ? { k: 'ext', name: 'anyEmptyHand14' } : null));
EXT.condEval.anyEmptyHand14 = (s) => s.players.some((p) => p.hand.length === 0);
EXT.triggers.push((cond) => {
  const m = cond.match(/^when (you have .+ life|an opponent has .+ life|a player has no cards in hand|(?:you|an opponent) controls? .+)$/);
  if (!m) return null;
  const c = parseCond(m[1]);
  return c ? [{ event: 'state14', data: { c } }] : null;
});
EXT.post.push((pc) => { if (pc.triggers.some((t: any) => t.event === 'state14')) (pc as any).state14 = true; });
EXT.hooks.sba.push((s, api) => {
  let did = false;
  for (const b of sourcesWith(s, 'state14')) {
    const o: any = s.cards[b];
    const ts = (api.chars(s, b).pc.triggers as any[]).filter((t) => t.event === 'state14');
    if (!ts.length) continue;
    o.stateOn ??= {};
    ts.forEach((t, i) => {
      const on = api.evalCond(s, t.data.c, o.controller, b);
      if (on && !o.stateOn[i]) { o.stateOn[i] = true; api.queueTrigger(s, b, o.controller, t, {}); did = true; }
      else if (!on && o.stateOn[i]) o.stateOn[i] = false;
    });
  }
  return did;
});

// Exhaust (702.177): "Exhaust — cost: effect" can be activated only once. "Whenever you activate an exhaust ability, …"
EXT.post.push((pc, info) => {
  const raw = (info.face?.oracle ?? info.def?.oracle ?? '') as string;
  if (!/exhaust —/i.test(raw)) return;
  for (const l of raw.split('\n')) {
    const m = l.match(/^exhaust — (.+?):/i);
    if (!m) continue;
    const cost = m[1].toLowerCase().replace(/\bthis (?:creature|vehicle|artifact|permanent)\b/g, '~');
    const a: any = pc.activated.find((x: any) => !x.exhaust && (x.label ?? '').toLowerCase().startsWith(cost.slice(0, Math.min(cost.length, 12))));
    if (a) a.exhaust = true;
  }
});
EXT.hooks.canActivate.push((s, _p, iid, a) => (a?.exhaust && ((s.cards[iid] as any)?.exhausted ?? []).includes(a.label) ? false : undefined));
EXT.triggers.push((cond) => (/^whenever you activate an exhaust ability$/.test(cond) ? [{ event: 'exhaustAct14' }] : null));
EXT.hooks.event.push((s, name, d, api) => {
  if (name !== 'activate' || !d.a?.exhaust) return;
  const c: any = s.cards[d.iid];
  if (c) (c.exhausted ??= []).push(d.a.label);
  for (const oid of api.observers(s)) {
    const o = s.cards[oid];
    if (o?.controller !== d.p) continue;
    for (const t of api.chars(s, oid).pc.triggers as any[]) if (t.event === 'exhaustAct14') api.queueTrigger(s, oid, o.controller, t, { triggerObj: d.iid });
  }
});
EXT.hooks.afterMove.push((s, iid, from) => { if (from === 'battlefield' && (s.cards[iid] as any)?.exhausted) (s.cards[iid] as any).exhausted = undefined; });
// "Whenever X for the first time each turn, Y." → "Whenever X, Y. This ability triggers only once each turn."
EXT.expand.push((line) => {
  const m = line.match(/^(whenever .+?) for the first time each turn, (.+)$/);
  if (!m || /this ability triggers only once/.test(line)) return null;
  return [`${m[1]}, ${m[2].replace(/\.$/, '')}. this ability triggers only once each turn`];
});
// "Whenever a player casts a spell from a graveyard, …" / "whenever an opponent casts a spell from anywhere other than their hand"
EXT.triggers.push((cond) => {
  const m = cond.match(/^whenever (a player|an opponent) casts (?:a|an) (.+?)(?: spell)? from (a graveyard|their graveyard|exile|anywhere other than their hand)$/);
  if (!m) return null;
  const f: any = m[2] === 'spell' ? { types: ['spell'] } : looseFilter(m[2].replace(/ spell$/, ''));
  if (!f) return null;
  const g = { ...f }; delete g.zone;
  const c: any = /anywhere/.test(m[3]) ? { notZone: 'hand' } : { zone: /exile/.test(m[3]) ? 'exile' : 'graveyard' };
  return [{ event: 'anyCast', filter: g, ...(m[1] === 'an opponent' ? { data: { who: 'opp' } } : {}), last: { t: 'triggerObj' }, lastPlayer: { t: 'triggerPlayer' }, cond: { k: 'ext', name: 'castWhere', ...(m[1] === 'an opponent' ? { opp: true } : {}), ...c } } as any];
});

// "Exile ~ from your graveyard." / "Exile a card from your hand." / "Exile two creature cards from your graveyard." /
// "Exile a creature card from a graveyard." (chosen on resolution; "if you do" follows whether it happened)
EXT.rules.push([/^exile ~ from your graveyard$/, () => [{ k: 'ext', name: 'exileSelfGy14' }]]);
EXT.effects.exileSelfGy14 = ({ s, item, api }) => {
  const ok = s.cards[item.source]?.zone === 'graveyard';
  if (ok) api.moveCard(s, item.source, 'exile');
  (item as any).didLast = ok;
  return 'done';
};
EXT.rules.push([/^exile (a|an|one|two|three|four|five|eight) (.*?)cards? (other than ~ )?from (your hand|your graveyard|a graveyard)$/, (m) => {
  const n = ({ a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, eight: 8 } as any)[m[1]];
  const ph = m[2].trim();
  let f: any = {};
  if (ph) { f = looseFilter(ph); if (!f) return null; f = { ...f }; delete f.zone; delete f.owner; }
  return [{ k: 'ext', name: 'exileChosen14', n, f, zone: /hand/.test(m[4]) ? 'hand' : 'graveyard', any: m[4] === 'a graveyard', notSelf: !!m[3] }];
}]);
EXT.effects.exileChosen14 = ({ s, item, e, r, you, api }) => {
  const pool: string[] = e.any ? (s.players as any[]).flatMap((p) => p[e.zone]) : (api.P(s, you) as any)[e.zone];
  const cands = pool.filter((c) => !(e.notSelf && c === item.source) && (!Object.keys(e.f).length || api.matchesFilter(s, c, { ...e.f, zone: e.zone }, you, item.source)));
  if (cands.length < e.n) { (item as any).didLast = false; return 'done'; }
  if (!r.sub) {
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'chooseCards', title: `${item.label}: exile ${e.n}`, cards: cands, min: e.n, max: e.n, data: { ctx: 'resolve' } });
    return 'wait';
  }
  const picked: string[] = (r.sub.answer ?? []).filter((c: string) => cands.includes(c));
  for (const c of picked) api.moveCard(s, c, 'exile');
  (item as any).exiledHere = [...((item as any).exiledHere ?? []), ...picked];
  (item as any).didLast = picked.length >= e.n;
  return 'done';
};

// "Target creature you control gains your choice of flying, vigilance, or lifelink until end of turn."
EXT.rules.push([/^(.+?) gains? your choice of (.+?) until end of turn$/, (m, ctx) => {
  const kws = m[2].split(/,? or |, /).map((x) => x.trim());
  if (kws.length < 2 || !parseKeywordList(kws.join(', '))) return null;
  const r = parseSentence(`${m[1]} gains ${kws[0]} until end of turn`, ctx);
  if (!r || r.length !== 1 || (r[0] as any).k !== 'pump') return null;
  return [{ k: 'ext', name: 'kwChoice14', what: (r[0] as any).what, kws }];
}]);
EXT.effects.kwChoice14 = ({ s, item, e, r, you, api }) => {
  const ts = api.subjCards(s, item, e.what) as string[];
  if (!ts.length) return 'done';
  if (!r.sub) {
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'mode', title: `${item.label}: choose an ability`, options: e.kws.map((k: string) => ({ id: k, label: k })), min: 1, max: 1, data: { ctx: 'resolve' } } as any);
    return 'wait';
  }
  const pick = Array.isArray(r.sub.answer) ? r.sub.answer[0] : r.sub.answer ?? e.kws[0];
  for (const c of ts) if (s.cards[c]?.zone === 'battlefield') s.cards[c].mods.push({ keywords: [pick], until: 'eot', ts: s.ts++ } as any);
  return 'done';
};

// "Enchanted creature has vigilance as long as you control a black or green permanent." (Runemarks) — the attach static
// gated on a game condition
EXT.lines.push((line, pc) => {
  const m = line.match(/^((?:enchanted|equipped) creature (?:has|gets) .+?) as long as (.+)$/);
  if (!m || /\bit\b|\bits\b/.test(m[2])) return false;
  const cond = parseCond(m[2]);
  if (!cond) return false;
  const kind = /^equipped/.test(m[1]) ? 'equipped' : 'enchanted';
  const probe: any = parseCard({ id: `ag2:${m[1]}`, name: 'Probe', manaCost: '', cmc: 0, typeLine: kind === 'equipped' ? 'Artifact — Equipment' : 'Enchantment — Aura', oracle: `${kind === 'equipped' ? 'Equip {1}' : 'Enchant creature'}\n${m[1]}`, colors: [], colorIdentity: [], keywords: [], layout: 'normal' } as any);
  if (probe.unparsed.length || probe.attachGrants?.length || probe.attachBecome || probe.triggers.length) return false;
  const sts = probe.statics.filter((x: any) => x.kind === 'attachPump');
  if (!sts.length || sts.length !== probe.statics.length) return false;
  for (const st of sts) pc.statics.push({ ...st, gate: cond } as any);
  (pc as any).gated = true;
  return true;
});

// "You may play two additional lands on each of your turns." / "You may play up to three additional lands this turn."
EXT.lines.push((line, pc) => {
  const m = line.match(/^you may play (two|three|four) additional lands on each of your turns$/);
  if (!m) return false;
  pc.additionalLand = (pc.additionalLand ?? 0) + NUM14[m[1]];
  return true;
});
EXT.rules.push([/^(?:you may )?play (?:up to )?(two|three|four) additional lands this turn$/, (m) => Array.from({ length: NUM14[m[1]] }, () => ({ k: 'ext', name: 'extraLand' }))]);
// "… to the battlefield with two additional +1/+1 counters on it" — "additional" is just the counters it enters with
EXT.rules.push([/^(return .+? to the battlefield(?: tapped)?) with (an|one|two|three) additional (.+? counters? on it)$/, (m, ctx) => parseSentence(`${m[1]} with ${m[2] === 'an' || m[2] === 'one' ? 'a' : m[2]} ${m[3]}`, ctx)]);

// "target creature that dealt damage this turn" / "… that dealt damage to you this turn"
EXT.hooks.event.push((s, name, d) => {
  if (name !== 'dealt' || !d.source) return;
  const t = TL14(s);
  (t.dealers ??= {})[d.source] = true;
  if (d.to?.kind === 'player') ((t.dealtTo ??= [{}, {}])[d.to.idx] ??= {})[d.source] = true;
});

// "Whenever a Beast becomes blocked, it gets +1/+1 until end of turn for each creature blocking it."
EXT.triggers.push((cond) => {
  const m = cond.match(/^whenever (?:a|an) (.+?) becomes blocked$/);
  if (!m || /^creature you control$/.test(m[1]) && false) return null;
  let ph = m[1];
  let rel: string | undefined;
  const r = ph.match(/^(.+?) that's (enchanted|equipped)$/);
  if (r) { ph = r[1]; rel = r[2]; }
  const f: any = parseFilter(ph);
  if (!f) return null;
  if (rel) f.rel = rel;
  return [{ event: 'anyBlocked14', filter: f, last: { t: 'triggerObj' } as any }];
});
EXT.hooks.event.push((s, name, d, api) => {
  if (name !== 'blocks') return;
  const atts = [...new Set((d.list as any[]).map((b) => b.attacker))];
  for (const oid of api.observers(s)) {
    const o = s.cards[oid];
    if (!o) continue;
    for (const t of api.chars(s, oid).pc.triggers as any[]) {
      if (t.event !== 'anyBlocked14') continue;
      for (const a of atts) if (s.cards[a] && api.matchesFilter(s, a, { ...t.filter, zone: 'battlefield' }, o.controller, oid)) api.queueTrigger(s, oid, o.controller, t, { triggerObj: a });
    }
  }
});
EXT.amountPhrases.push((ph) => (/^(?:the number of )?creatures? blocking (?:it|~)$/.test(ph) ? { ext: 'blockersOf14' } : /^(?:the number of )?creatures? (?:it's|~ is) blocking$/.test(ph) ? { ext: 'blockingN14' } : null));
EXT.amounts.blockersOf14 = (s, _a, _y, self, ctx: any) => { const o = ctx?.item?.triggerObj ?? self; return s.combat?.attackers.find((a) => a.iid === o)?.blockedBy.length ?? 0; };
EXT.amounts.blockingN14 = (s, _a, _y, self, ctx: any) => { const o = ctx?.item?.triggerObj ?? self; return (s.combat?.attackers ?? []).filter((a) => a.blockedBy.includes(o!)).length; };

// "the life you've lost this turn" / "the total life lost by all players this turn" / "the amount of life you gained this turn"
EXT.hooks.event.push((s, name, d) => {
  if (name === 'lifeLost') { const t = TL14(s); (t.lost ??= [0, 0])[d.p] += d.n; }
  if (name === 'lifeGained') { const t = TL14(s); (t.gained ??= [0, 0])[d.p] += d.n; }
});
EXT.amountPhrases.push((ph) => {
  if (/^(?:the (?:amount of )?life )?you've lost this turn$|^the life you've lost this turn$|^the amount of life you've lost this turn$/.test(ph)) return { ext: 'lostTurn14', who: 'you' };
  if (/^the total (?:amount of )?life lost by all players this turn$/.test(ph)) return { ext: 'lostTurn14', who: 'all' };
  if (/^the (?:total )?(?:amount of )?life your opponents have lost this turn$|^the total life lost by your opponents this turn$/.test(ph)) return { ext: 'lostTurn14', who: 'opp' };
  return null;
});
EXT.amounts.lostTurn14 = (s, a: any, you) => { const l = TL14(s).lost ?? [0, 0]; return a.who === 'you' ? l[you] : a.who === 'opp' ? l[1 - you] : l[0] + l[1]; };

// "if a creature card was exiled this way" / "if an artifact is destroyed this way" / "if ~ was cast from exile" /
// "if ~ is in a graveyard"
EXT.conds.push((t) => {
  let m: RegExpMatchArray | null;
  if ((m = t.match(/^(?:an?|one or more|at least one) (.+?) (?:cards? )?(?:was|were|is|are) exiled this way$/))) { const f = cardFilter14(m[1].replace(/ cards?$/, '')); return f ? { k: 'ext', name: 'exiledWay14', f } : null; }
  if ((m = t.match(/^(?:an?|one or more) (.+?) (?:was|were|is|are) destroyed this way$/))) { const f = cardFilter14(m[1]); return f ? { k: 'ext', name: 'destroyedWay14', f } : null; }
  if (/^~ was cast from exile$/.test(t)) return { k: 'ext', name: 'castFromZone14', zone: 'exile' };
  if (/^~ was cast from (?:a|your) graveyard$/.test(t)) return { k: 'ext', name: 'castFromZone14', zone: 'graveyard' };
  if (/^~ is in (?:a|your) graveyard$/.test(t)) return { k: 'ext', name: 'selfInGy14' };
  return null;
});
EXT.condEval.exiledWay14 = (s, c: any, you, self, ctx: any) => {
  const it = ctx?.item;
  const list: string[] = [...(it?.exiledHere ?? []), ...(it?.exiledTop ?? [])];
  return list.some((x) => s.cards[x] && matchesFilter(s, x, { ...c.f, zone: s.cards[x].zone }, you, self, true));
};
EXT.condEval.destroyedWay14 = (s, c: any, you, self, ctx: any) => {
  const list: string[] = ctx?.item?.destroyedList ?? [];
  return list.some((x) => s.cards[x] && matchesFilter(s, x, { ...c.f, zone: s.cards[x].zone }, you, self, true));
};
EXT.condEval.castFromZone14 = (s, c: any, _y, self) => !!self && (s.cards[self] as any)?.castFrom === c.zone;
EXT.condEval.selfInGy14 = (s, _c, _y, self) => !!self && s.cards[self]?.zone === 'graveyard';

// "If a spell cast this way would be put into a graveyard, exile it instead." — attaches to the preceding permission
EXT.seqs.push((sents, i, _ctx, ab) => {
  if (!/^if (?:a|an instant or sorcery|that) (?:spell|card) (?:cast|you cast) (?:from your graveyard )?this way would be put into (?:a|your|its owner's) graveyard, exile it instead$|^if you cast (?:it|~) this way and it would be put into your graveyard, exile it instead$/.test(sents[i])) return null;
  const prev: any = [...ab.effects].reverse().find((e: any) => e.k === 'mayPlay' || (e.k === 'ext' && /cast|Free|Play/i.test(e.name)) || (e.k === 'may' && e.effects?.some((x: any) => x.k === 'mayPlay' || (x.k === 'ext' && /cast|Free|Play/i.test(x.name)))));
  if (!prev) return null;
  const tgt = prev.k === 'may' ? prev.effects.find((x: any) => x.k === 'mayPlay' || x.k === 'ext') : prev;
  tgt.exileAfter = true;
  return 1;
});
EXT.hooks.castPay.push((s, pc) => {
  const c: any = s.cards[pc.iid];
  if (!c) return;
  if (c.mayPlay?.exileAfter || (s as any).__curEff?.exileAfter) c.exileAfterCast = true;
});
EXT.hooks.afterMove.push((s, iid, from, to, _o, api) => {
  const c: any = s.cards[iid];
  if (!c?.exileAfterCast || from !== 'stack') return;
  c.exileAfterCast = undefined;
  if (to === 'graveyard') api.moveCard(s, iid, 'exile');
});
// "the number of creatures named ~ on the battlefield" / "cards in your opponents' graveyards" / "… the chosen player controls"
EXT.amountPhrases.unshift((ph) => {
  let m: RegExpMatchArray | null;
  if ((m = ph.match(/^(?:the number of )?(.+?) named ~ on the battlefield$/))) { const f = looseFilter(singular(m[1])); return f ? { ext: 'bfCount14', f: { ...f, zone: 'battlefield' }, sameName: true } : null; }
  if ((m = ph.match(/^(?:the number of )?(?:(.+?) )?cards? in (?:your opponents'|an opponent's|all opponents') graveyards?$/))) {
    let f: any = {};
    if (m[1]) { f = looseFilter(m[1]); if (!f) return null; f = { ...f }; delete f.zone; }
    return { ext: 'oppGyCount14', f };
  }
  if ((m = ph.match(/^(?:the number of )?(.+?) the chosen player controls$/))) { const f = looseFilter(m[1].split(' ').map((w) => singular(w)).join(' ')); return f ? { ext: 'chosenCtrl14', f: { ...f, zone: 'battlefield' } } : null; }
  if (/^(?:the number of )?cards in the chosen player's hand$/.test(ph)) return { ext: 'chosenHand14' };
  return null;
});
const chosenP14 = (s: any, you: number, self?: string) => { const c: any = self ? s.cards[self] : null; return c?.chosenOpponent ?? c?.chosenPlayer ?? 1 - you; };
EXT.amounts.oppGyCount14 = (s, a: any, you, self) => (s.players as any[]).filter((_p, i) => i !== you).flatMap((p) => p.graveyard).filter((g: string) => !Object.keys(a.f).length || matchesFilter(s, g, { ...a.f, zone: 'graveyard' }, you, self, true)).length;
EXT.amounts.chosenCtrl14 = (s, a: any, you, self) => { const p = chosenP14(s, you, self); return s.battlefield.filter((b) => s.cards[b].controller === p && matchesFilter(s, b, a.f, you, self, true)).length; };
EXT.amounts.chosenHand14 = (s, _a, you, self) => s.players[chosenP14(s, you, self)]?.hand.length ?? 0;

// "Reveal any number of green cards in your hand. You gain 2 life for each card revealed this way." (Scents, Seers)
EXT.rules.push([/^reveal any number of (.+?) cards? (?:in|from) your hand$/, (m) => {
  const f: any = m[1] === '' ? {} : looseFilter(m[1]);
  if (!f) return null;
  const g = { ...f }; delete g.zone; delete g.owner;
  return [{ k: 'ext', name: 'revealAny14', f: g }];
}]);
EXT.rules.push([/^reveal any number of cards in your hand$/, () => [{ k: 'ext', name: 'revealAny14', f: {} }]]);
EXT.effects.revealAny14 = ({ s, item, e, r, you, api }) => {
  const cands = api.P(s, you).hand.filter((h: string) => h !== item.source && (!Object.keys(e.f).length || api.matchesFilter(s, h, { ...e.f, zone: 'hand' }, you)));
  if (!r.sub) {
    if (!cands.length) { (item as any).revealedN = 0; return 'done'; }
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'chooseCards', title: `${item.label}: reveal any number`, cards: cands, min: 0, max: cands.length, data: { ctx: 'resolve' } });
    return 'wait';
  }
  const picked: string[] = (r.sub.answer ?? []).filter((c: string) => cands.includes(c));
  if (picked.length) api.log(s, `${api.pname(s, you)} reveals ${picked.map((c) => api.nm(s, c)).join(', ')}.`, you);
  (item as any).revealedN = picked.length;
  (s as any).lastRevealed = picked;
  return 'done';
};
EXT.amountPhrases.push((ph) => (/^(?:the number of )?cards? revealed this way$/.test(ph) ? { ext: 'revealedN14' } : null));
EXT.amounts.revealedN14 = (_s, _a, _y, _self, ctx: any) => ctx?.item?.revealedN ?? ctx?.item?.revealedCount ?? 0;
// "For as long as that card remains exiled, you may cast it." / "… its owner may play it" (Soul Partition)
EXT.rules.push([/^for as long as (?:that card|it) remains exiled, (you|its owner) may (play|cast) (?:it|that card)$/, (m, ctx) => [{ k: 'ext', name: 'mayPlayLong14', what: ctx.last ?? { t: 'exiledTop' }, owner: m[1] === 'its owner' }]]);
EXT.effects.mayPlayLong14 = ({ s, item, e, you, api }) => {
  for (const c of api.subjCards(s, item, e.what) as string[]) if (s.cards[c]?.zone === 'exile') s.cards[c].mayPlay = { player: e.owner ? s.cards[c].owner : you, untilTurn: 1e9 } as any;
  return 'done';
};

// "You may put it into its owner's library third from the top." (God-Eternals, Gandalf)
EXT.rules.push([/^put (it|~|that card) into its owner's library (second|third|fourth|fifth) from the top$/, (m, ctx) => [{ k: 'ext', name: 'libPos14', what: m[1] === '~' ? { t: 'self' } : ctx.last ?? { t: 'self' }, pos: ({ second: 2, third: 3, fourth: 4, fifth: 5 } as any)[m[2]] }]]);
EXT.effects.libPos14 = ({ s, item, e, api }) => {
  for (const c of api.subjCards(s, item, e.what) as string[]) {
    const card = s.cards[c];
    if (!card || card.zone === 'library') continue;
    api.moveCard(s, c, 'library');
    const lib = s.players[card.owner].library;
    const i = lib.indexOf(c);
    if (i >= 0) { lib.splice(i, 1); lib.splice(Math.min(e.pos - 1, lib.length), 0, c); }
  }
  return 'done';
};

// "Return that creature to your hand at the beginning of the next end step." (after putting / creating it)
EXT.rules.push([/^return (?:that creature|that card|it|those creatures|them) to (?:your|its owner's|their owners') hands? at the beginning of the next end step$/, (_m, ctx) => (ctx.last?.t === 'lastToken' || ctx.last?.t === 'exiledTop' ? [{ k: 'delayed', at: 'nextEnd', effects: [{ k: 'ext', name: 'bounceRefs14' }] } as any] : null)]);
EXT.effects.bounceRefs14 = ({ s, item, api }) => {
  for (const c of ((item as any).lastTokens ?? []) as string[]) if (s.cards[c]?.zone === 'battlefield') api.moveCard(s, c, 'hand');
  return 'done';
};
// "Double the power of each other creature you control until end of turn." / "… of target creature …"
EXT.rules.push([/^double the power(?: and toughness)? of (.+?) until end of turn$/, (m, ctx) => {
  const r = parseSentence(`${m[1]} gets +1/+0 until end of turn`, ctx);
  if (!r || r.length !== 1 || (r[0] as any).k !== 'pump') return null;
  return [{ k: 'ext', name: 'doublePT14', what: (r[0] as any).what, both: /toughness/.test(m[0]) }];
}]);
EXT.effects.doublePT14 = ({ s, item, e, api }) => {
  for (const c of api.subjCards(s, item, e.what) as string[]) {
    if (s.cards[c]?.zone !== 'battlefield') continue;
    const ch = api.chars(s, c);
    s.cards[c].mods.push({ power: Math.max(0, ch.power), toughness: e.both ? Math.max(0, ch.toughness) : 0, until: 'eot', ts: s.ts++ } as any);
  }
  return 'done';
};
// "Sacrifice any number of other permanents" (then "draw that many cards")
EXT.rules.push([/^sacrifice any number of (other )?(.+?)$/, (m) => {
  const ph = m[2].replace(/ you control$/, '');
  const f: any = /^permanents?$/.test(ph) ? {} : looseFilter(ph.split(' ').map((w) => singular(w)).join(' '));
  if (!f) return null;
  const g = { ...f }; delete g.zone; delete g.controller;
  return [{ k: 'ext', name: 'sacAny14', f: g, other: !!m[1] }];
}]);
EXT.effects.sacAny14 = ({ s, item, e, r, you, api }) => {
  const cands = s.battlefield.filter((b) => s.cards[b].controller === you && !(e.other && b === item.source) && (!Object.keys(e.f).length || api.matchesFilter(s, b, { ...e.f, zone: 'battlefield' }, you, item.source)));
  if (!r.sub) {
    if (!cands.length) { (item as any).lastCount = 0; return 'done'; }
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'chooseCards', title: `${item.label}: sacrifice any number`, cards: cands, min: 0, max: cands.length, data: { ctx: 'resolve' } });
    return 'wait';
  }
  const picked: string[] = (r.sub.answer ?? []).filter((c: string) => cands.includes(c));
  for (const c of picked) api.moveCard(s, c, 'graveyard', { cause: 'sacrifice' });
  (item as any).lastCount = picked.length;
  (item as any).didLast = picked.length > 0;
  (s as any).lastSacrificed = picked;
  return 'done';
};

// "You may cast that card without paying its mana cost." referring to a card found / exiled / returned earlier
EXT.rules.push([/^(?:you may )?cast (that card|it|the exiled card|that spell) without paying its mana cost$/, (_m, ctx) => {
  if (!ctx.last || ctx.last.t === 'exiledTop' || ctx.last.t === 'self') return null;
  return [{ k: 'ext', name: 'castRefFree14', what: ctx.last }];
}]);
EXT.effects.castRefFree14 = ({ s, item, e, r, you, api }) => {
  const [c] = (api.subjCards(s, item, e.what) as string[]).filter((x) => s.cards[x] && ['exile', 'graveyard', 'hand', 'library'].includes(s.cards[x].zone));
  if (!c) return 'done';
  if (/\bLand\b/.test(s.defs[s.cards[c].defId].typeLine.split(' // ')[0])) return 'done';
  if (!r.sub) {
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'yesno', title: `Cast ${api.nm(s, c)} without paying its mana cost?`, options: [{ id: 'yes', label: 'Cast it' }, { id: 'no', label: "Don't" }], cards: [c], data: { ctx: 'resolve' } });
    return 'wait';
  }
  if (r.sub.answered === 'yes') {
    (s as any).castInResolution = true;
    let err: any;
    try { err = api.beginCast(s, you, c, 0, 'free'); } finally { (s as any).castInResolution = false; }
    if (err) api.log(s, `Couldn't cast ${api.nm(s, c)}: ${err}`, you, 'warn');
  }
  return 'done';
};
// "You may cast ~ for as long as it remains exiled." (after ~ exiles itself)
EXT.rules.push([/^(?:you may )?cast ~ for as long as it remains exiled$/, () => [{ k: 'ext', name: 'mayPlayLong14', what: { t: 'self' }, owner: false }]]);

// "If ~ was kicked, it enters with two +1/+1 counters on it and with first strike." (Invasion kicker creatures)
EXT.lines.push((line, pc) => {
  const m = line.match(/^if ~ was kicked, it enters with (a|an|one|two|three|four|five) ([+-]1\/[+-]1|[a-z]+) counters? (?:and (?:a|an) ([a-z]+) counter )?on it and with (.+)$/);
  if (!m) return false;
  const n = ({ a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 } as any)[m[1]];
  const grant = m[4];
  const q = grant.match(/^"(.+)"$/);
  const kws = q ? null : parseKeywordList(grant);
  if (!q && !kws) return false;
  (pc.entersCounters ??= []).push({ counter: m[2], n, kickedOnly: true } as any);
  if (m[3]) (pc.entersCounters ??= []).push({ counter: m[3], n: 1, kickedOnly: true } as any);
  (pc as any).kickGrant = q ? { text: q[1].replace(/'/g, '"') } : { kws };
  return true;
});
EXT.hooks.afterMove.push((s, iid, _from, to, _o, api) => {
  if (to !== 'battlefield') return;
  const c: any = s.cards[iid];
  if (!c?.kicked) return;
  const g = (api.parsedFor(s, c) as any).kickGrant;
  if (!g) return;
  c.mods.push(g.kws ? { keywords: g.kws, until: 'permanent', ts: s.ts++ } : { grantText: g.text, until: 'permanent', ts: s.ts++ });
});

// "You may sacrifice an artifact or discard a card. If you do, …" (either action) / "sacrifice another creature or enchantment"
EXT.rules.push([/^sacrifice another (.+?)$/, (m) => {
  const f = cardFilter14(m[1].replace(/ you control$/, ''));
  if (!f) return null;
  return [{ k: 'ext', name: 'eitherAct14', opts: [{ sac: { ...f, other: true } }] }];
}]);
EXT.rules.push([/^(sacrifice (?:a|an) .+?|discard (?:a|an) .+?|pay \d+ life) or (sacrifice (?:a|an) .+?|discard (?:a|an) .+?|pay \d+ life|pay (?:\{[^}]+\})+)$/, (m) => {
  const one = (t: string): any => {
    let mm: RegExpMatchArray | null;
    if ((mm = t.match(/^sacrifice (?:a|an) (.+)$/))) { const f = cardFilter14(mm[1].replace(/ you control$/, '')); return f ? { sac: f, text: t } : null; }
    if ((mm = t.match(/^discard (?:a|an) (.+)$/))) { const ph = mm[1].replace(/ ?cards?$/, ''); const f = ph ? cardFilter14(ph) : {}; return f ? { discard: f, text: t } : null; }
    if ((mm = t.match(/^pay (\d+) life$/))) return { life: +mm[1], text: t };
    if ((mm = t.match(/^pay ((?:\{[^}]+\})+)$/))) return { mana: mm[1].toUpperCase(), text: t };
    return null;
  };
  const a = one(m[1]), b = one(m[2]);
  return a && b ? [{ k: 'ext', name: 'eitherAct14', opts: [a, b] }] : null;
}]);
EXT.effects.eitherAct14 = ({ s, item, e, r, you, api }) => {
  const pool = (o: any): string[] | boolean => {
    if (o.sac) return s.battlefield.filter((b) => s.cards[b].controller === you && !(o.sac.other && b === item.source) && api.matchesFilter(s, b, { ...o.sac, zone: 'battlefield' }, you, item.source));
    if (o.discard) return api.P(s, you).hand.filter((h: string) => !Object.keys(o.discard).length || api.matchesFilter(s, h, { ...o.discard, zone: 'hand' }, you));
    if (o.life) return s.players[you].life >= o.life;
    if (o.mana) return api.canAfford(s, you, o.mana);
    return false;
  };
  const ok = (x: any) => (Array.isArray(x) ? x.length > 0 : !!x);
  r.sub ??= {};
  if (r.sub.pick === undefined) {
    const avail = e.opts.map((o: any, i: number) => (ok(pool(o)) ? i : -1)).filter((i: number) => i >= 0);
    if (!avail.length) { (item as any).didLast = false; return 'done'; }
    if (avail.length === 1) r.sub.pick = avail[0];
    else if (r.sub.asked === undefined) {
      r.sub.asked = true;
      api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'yesno', title: `${item.label}: choose`, options: [{ id: 'yes', label: e.opts[0].text }, { id: 'no', label: e.opts[1].text }], data: { ctx: 'resolve' } });
      return 'wait';
    } else r.sub.pick = r.sub.answered === 'no' ? 1 : 0;
  }
  const o = e.opts[r.sub.pick];
  const p = pool(o);
  if (Array.isArray(p)) {
    if (r.sub.cards === undefined) {
      if (p.length === 1) r.sub.cards = p;
      else {
        r.sub.cards = null;
        api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'chooseCards', title: `${item.label}: ${o.sac ? 'sacrifice' : 'discard'} one`, cards: p, min: 1, max: 1, data: { ctx: 'resolve' } });
        return 'wait';
      }
    }
    const pick: string[] = r.sub.cards ?? r.sub.answer ?? [];
    for (const c of pick) api.moveCard(s, c, 'graveyard', { cause: o.sac ? 'sacrifice' : 'discard' });
    if (o.sac) (s as any).lastSacrificed = pick;
    (item as any).didLast = pick.length > 0;
    return 'done';
  }
  if (o.life) api.loseLife(s, you, o.life);
  if (o.mana) { if (!api.payMana(s, you, o.mana, 0)) { (item as any).didLast = false; return 'done'; } }
  (item as any).didLast = true;
  return 'done';
};

// "you draw a card for each creature card put into their graveyard this way" / "… for each land card milled this way"
EXT.amountPhrases.push((ph) => {
  const m = ph.match(/^(?:the number of )?(.*?)cards? (?:put into (?:their|your|a|that player's) graveyards? this way|milled this way)$/);
  if (!m) return null;
  const w = m[1].trim();
  let f: any = {};
  if (w && w !== 'nonland ' && w) { f = looseFilter(w) ?? {}; if (!Object.keys(f).length && w) { if (w === 'nonland') f = { notTypes: ['land'] }; else return null; } f = { ...f }; delete f.zone; delete f.owner; }
  return { ext: 'milledN14', f };
});
EXT.amounts.milledN14 = (s, a: any, you, self, ctx: any) => ((ctx?.item?.milled ?? []) as string[]).filter((c) => s.cards[c] && (!Object.keys(a.f).length || matchesFilter(s, c, { ...a.f, zone: s.cards[c].zone }, you, self, true))).length;

// Compound heads built from known ones: "whenever X enters or dies", "when(ever) enchanted creature attacks or blocks",
// "whenever enchanted creature blocks or becomes blocked", "whenever ~ deal combat damage" (team-up names)
EXT.triggers.push((cond) => {
  let m: RegExpMatchArray | null;
  if ((m = cond.match(/^(when(?:ever)?) (.+?) (enters|dies|attacks|blocks|becomes blocked) or (enters|dies|attacks|blocks|becomes blocked)$/))) {
    const a = matchTriggerCond(`${m[1]} ${m[2]} ${m[3]}`), b = matchTriggerCond(`${m[1]} ${m[2]} ${m[4]}`);
    if (a && b) return [...a, ...b];
  }
  if ((m = cond.match(/^(when(?:ever)?) ~ deal (.+)$/))) return matchTriggerCond(`${m[1]} ~ deals ${m[2]}`);
  if ((m = cond.match(/^(when(?:ever)?) (.+?) attacks and isn't blocked$/)) && /^(?:enchanted|equipped) creature$/.test(m[2])) {
    return [{ event: 'attachCombat', data: { what: 'unblocked' }, last: { t: m[2].split(' ')[0] } } as any];
  }
  return null;
});

// Curses: "Whenever a creature attacks enchanted player, …" / "Whenever a creature deals combat damage to enchanted player, …"
EXT.triggers.push((cond) => {
  if (/^whenever a creature attacks enchanted player(?: or a planeswalker they control)?$/.test(cond)) return [{ event: 'curseAtk14', last: { t: 'triggerObj' } as any, lastPlayer: { t: 'triggerPlayer' } as any }];
  if (/^whenever a creature deals combat damage to enchanted player$/.test(cond)) return [{ event: 'curseDmg14', last: { t: 'triggerObj' } as any, lastPlayer: { t: 'triggerPlayer' } as any }];
  return null;
});
EXT.post.push((pc) => { if (pc.triggers.some((t: any) => t.event === 'curseAtk14' || t.event === 'curseDmg14')) (pc as any).curse14 = true; });
EXT.hooks.event.push((s, name, d, api) => {
  if (name !== 'attack' && name !== 'dealt') return;
  if (name === 'dealt' && (!d.combat || d.to?.kind !== 'player')) return;
  for (const oid of sourcesWith(s, 'curse14')) {
    const o: any = s.cards[oid];
    if (o?.attachedPlayer === undefined) continue;
    for (const t of api.chars(s, oid).pc.triggers as any[]) {
      if (name === 'attack' && t.event === 'curseAtk14') for (const a of d.list) { if (a.target?.kind === 'player' && a.target.idx === o.attachedPlayer) api.queueTrigger(s, oid, o.controller, t, { triggerObj: a.iid, triggerPlayer: o.attachedPlayer }); }
      if (name === 'dealt' && t.event === 'curseDmg14' && d.to.idx === o.attachedPlayer && s.cards[d.source]) api.queueTrigger(s, oid, o.controller, t, { triggerObj: d.source, triggerPlayer: o.attachedPlayer });
    }
  }
});

// "Whenever X during your turn, …" / "Whenever X during an opponent's turn, …": the base trigger, gated on whose turn it is.
EXT.triggers.push((cond) => {
  const m = cond.match(/^(whenever .+?) during (your turn|each of your turns|an opponent's turn|each opponent's turn)$/);
  if (!m) return null;
  const evs = matchTriggerCond(m[1]);
  if (!evs?.length) return null;
  const tc: any = { k: 'ext', name: 'yourTurn2', ...(/opponent/.test(m[2]) ? { not: true } : {}) };
  if (evs.some((e: any) => e.cond && ['evolve', 'trainingPartner'].includes(e.cond.k))) return null;
  return evs.map((e: any) => ({ ...e, cond: e.cond ? { k: 'and', conds: [e.cond, tc] } : tc }));
});

// "Whenever a creature is exiled from the battlefield / put into exile from the battlefield", "whenever another nonland
// permanent you control is returned to its owner's hand", "whenever an artifact you control leaves the battlefield".
EXT.triggers.push((cond) => {
  const m = cond.match(/^whenever (a|an|another) (.+?) (?:(you control|an opponent controls|your opponents control) )?(is exiled from the battlefield|is put into exile from the battlefield|are put into exile from the battlefield|is returned to (?:its owner's|your) hand(?: from the battlefield)?|are returned to (?:their owners'|your) hand(?: from the battlefield)?|leaves? the battlefield)$/);
  if (!m) return null;
  const f: any = looseFilter(singular(m[2]));
  if (!f) return null;
  const to = /exile/.test(m[4]) ? 'exile' : /hand/.test(m[4]) ? 'hand' : 'any';
  if (to === 'any' && f.types?.length === 1 && f.types[0] === 'creature' && m[3] === 'you control') return null; // core ctrlLeaves
  const ctl = m[3] === 'you control' ? 'you' : m[3] ? 'opp' : undefined;
  return [{ event: 'leaveTo14', filter: f, data: { to, ctl, other: /another|other/.test(m[1]) }, last: { t: 'triggerObj' }, lastPlayer: { t: 'triggerPlayer' } } as any];
});
const lki14 = (s: any, d: any, f: any) => {
  const tl = (s.defs[d.card.defId]?.typeLine ?? '').toLowerCase().split(' // ')[0];
  const types: string[] = f.types ?? [];
  if (types.length && !types.some((x) => x === 'permanent' || x === 'card' || tl.includes(x) || (x === 'creature' && d.wasCreature))) return false;
  if (f.subtypes?.length && !(f.subAny ? f.subtypes.some((x: string) => tl.includes(x)) : f.subtypes.every((x: string) => tl.includes(x)))) return false;
  if (f.notTypes?.some((x: string) => tl.includes(x))) return false;
  if (f.token && !d.card.token) return false;
  if (f.nontoken && d.card.token) return false;
  if (f.supertypes?.some((x: string) => !tl.includes(x))) return false;
  if (f.colors?.length && !f.colors.some((c: string) => (s.defs[d.card.defId]?.colors ?? []).includes(c))) return false;
  const known = new Set(['types', 'subtypes', 'subAny', 'notTypes', 'token', 'nontoken', 'supertypes', 'colors', 'other', 'controller', 'zone']);
  return Object.keys(f).every((k) => known.has(k) || f[k] == null);
};
EXT.hooks.event.push((s, name, d, api) => {
  if (name !== 'leave' || !d.card) return;
  for (const oid of api.observers(s)) {
    const o = s.cards[oid];
    if (!o) continue;
    for (const t of api.chars(s, oid).pc.triggers as any[]) {
      if (t.event !== 'leaveTo14') continue;
      const dt = t.data;
      if (dt.to !== 'any' && d.to !== dt.to) continue;
      if (dt.other && oid === d.iid) continue;
      if (dt.ctl === 'you' && d.controller !== o.controller) continue;
      if (dt.ctl === 'opp' && d.controller === o.controller) continue;
      if (t.filter?.controller === 'you' && d.controller !== o.controller) continue;
      if ((t.filter?.controller === 'opp' || t.filter?.controller === 'notYou') && d.controller === o.controller) continue;
      if (!lki14(s, d, t.filter ?? {})) continue;
      api.queueTrigger(s, oid, o.controller, t, { triggerObj: d.iid, triggerPlayer: d.controller });
    }
  }
});

// "~ deals 2 damage to that player unless they control two or more basic lands." / "… unless they have exactly three or
// exactly four cards in hand" — a condition about that player, not a choice.
EXT.seqs.push((sents, i, ctx, ab) => {
  const m = sents[i].match(/^(.+?) unless (?:they|that player|the player) (.+)$/);
  if (!m || /\b(?:pay|pays|sacrifices?|discards?|puts?|exiles?|returns?|taps?|reveals?)\b/.test(m[2])) return null;
  const rest = m[2].replace(/^(controls|has|is|was|were)\b/, (x) => ({ controls: 'control', has: 'have', is: 'are', was: 'were', were: 'were' } as any)[x]).replace(/\b(their|they)\b/g, (x) => (x === 'their' ? 'your' : 'you'));
  const cond = parseCond(`you ${rest}`);
  if (!cond) return null;
  const k0 = ctx.specs.length;
  const head = parseSentence(m[1], ctx);
  const e: any = head?.length === 1 ? head[0] : null;
  const who = e?.k === 'damage' ? e.to?.[0] : e?.who;
  if (!e || !who || !['triggerPlayer', 'target', 'activePlayer'].includes(who.t)) { ctx.specs.length = k0; return null; }
  ab.effects.push({ k: 'if', cond: { k: 'ext', name: 'asPlayer14', who, cond, not: true }, effects: head });
  return 1;
});
EXT.condEval.asPlayer14 = (s, c: any, you, self, ctx: any) => {
  const item = ctx?.item;
  const ps: number[] = item ? (c.who.t === 'target' ? (item.targets?.[c.who.spec] ?? []).map((t: any) => (t.kind === 'player' ? t.idx : s.cards[t.iid]?.controller)) : c.who.t === 'triggerPlayer' ? [item.triggerPlayer] : [s.active]) : [];
  const p = ps[0] ?? you;
  const v = evalCond(s, c.cond, p as any, self, ctx);
  return c.not ? !v : v;
};

// "As ~ enters, choose a player." (True-Name Nemesis, Stuffy Doll, Saskia, Sewer Nemesis)
EXT.lines.push((line, pc) => {
  if (/^~ has protection from the chosen player$/.test(line)) { pc.protChosenPlayer = true; return true; }
  if (!/^as ~ enters, choose a player$/.test(line)) return false;
  pc.triggers.push({ event: 'etb', text: 'As ~ enters, choose a player.', ability: { text: 'choose a player', effects: [{ k: 'ext', name: 'choosePlayer14' }], specs: [], manual: [] } } as any);
  return true;
});
EXT.effects.choosePlayer14 = ({ s, item, r, you, api }) => {
  const c: any = s.cards[item.source];
  if (!c) return 'done';
  if (!r.sub) {
    r.sub = {};
    const o = api.opp(you);
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'yesno', title: `${api.nm(s, item.source)}: choose a player`, options: [{ id: 'yes', label: api.pname(s, o) }, { id: 'no', label: api.pname(s, you) }], data: { ctx: 'resolve' } });
    return 'wait';
  }
  c.chosenPlayer = r.sub.answered === 'no' ? you : api.opp(you);
  if ((api.parsedFor(s, c) as any).protChosenPlayer && c.zone === 'battlefield') c.mods.push({ keywords: [`protection from player ${c.chosenPlayer}`], until: 'permanent', source: item.source, ts: s.ts++ });
  api.log(s, `${api.nm(s, item.source)}: ${api.pname(s, c.chosenPlayer)} chosen.`, you);
  return 'done';
};
// "It deals that much damage to the chosen player." (Stuffy Doll, Saskia)
EXT.rules.push([/^(it|~) deals that much damage to the chosen player$/, (m, ctx) => [{ k: 'ext', name: 'dmgChosen14', from: m[1] === '~' ? 'self' : ctx?.last?.t === 'self' ? 'self' : 'triggerObj' }]]);
EXT.effects.dmgChosen14 = ({ s, item, e, you, api }) => {
  const n = (item as any).evAmount ?? 0;
  const src = e.from === 'self' ? item.source : (item as any).triggerObj ?? item.source;
  if (n > 0 && src) api.dealDamage(s, src, { kind: 'player', idx: chosenP14(s, you, item.source) }, n, false);
  return 'done';
};
// "the number of cards in the chosen player's graveyard"; "Whenever the chosen player casts a spell"
EXT.amountPhrases.unshift((ph) => (/^(?:the number of )?cards in the chosen player's graveyard$/.test(ph) ? { ext: 'chosenGy14' } : null));
EXT.amounts.chosenGy14 = (s, _a, you, self) => s.players[chosenP14(s, you, self)]?.graveyard.length ?? 0;
EXT.triggers.push((cond) => (/^whenever the chosen player casts a spell$/.test(cond) ? [{ event: 'anyCast', filter: { types: ['spell'] }, lastPlayer: { t: 'triggerPlayer' }, last: { t: 'triggerObj' }, cond: { k: 'ext', name: 'chosenCaster14' } } as any] : null));
EXT.condEval.chosenCaster14 = (s, _c, you, self, ctx: any) => ctx?.triggerPlayer === chosenP14(s, you, self);

// "Until end of turn, you may play cards exiled this way / cast spells from among those exiled cards [without paying their
// mana costs] [, and mana of any type can be spent …]" — the duration in front.
EXT.seqs.push((sents, i, ctx, ab) => {
  const m = sents[i].match(new RegExp(`^(?:until end of turn|this turn|until the end of your next turn), you may (play|cast) (that card|it|them|those cards|the exiled cards?|cards exiled this way|cards you own exiled this way|spells from among (?:them|those cards|those exiled cards|the exiled cards|cards exiled this way)|those exiled cards|cards exiled with ~|cards you own exiled with ~|spells from among cards exiled with ~)( without paying (?:its|their) mana costs?)?(${ANYT})?$`));
  if (!m) return null;
  const linked = /with ~/.test(m[2]);
  const what = linked ? { t: 'linkedExiled' } : ctx.last ?? { t: 'exiledTop' };
  const castOnly = m[1] === 'cast';
  ab.effects.push({ k: 'mayPlay', what, until: /next/.test(sents[i]) ? 'nextTurn' : 'eot', ...(m[3] ? { free: true } : {}), ...(m[4] ? { anyType: true } : {}), ...(castOnly ? { castOnly: true } : {}) } as any);
  return 1;
});
// "Until end of turn, you may play lands and cast spells from your graveyard." (Yawgmoth's Will without the exile part, …)
EXT.rules.push([/^(?:until end of turn|this turn), you may (play lands and cast spells|cast spells) from your graveyard$|^you may (play lands and cast spells|cast spells) from your graveyard this turn$/, (m) => [{ k: 'ext', name: 'gyPlayTurn14', lands: /lands/.test(m[1] ?? m[2]) }]]);
EXT.effects.gyPlayTurn14 = ({ s, e, you, api }) => {
  const pl: any = api.P(s, you);
  if (e.lands) pl.gyPlayTurn = s.turn;
  pl.gyCastTurn = s.turn;
  return 'done';
};
EXT.hooks.zoneCast.push((s, p, card) => {
  if (card.zone !== 'graveyard' || card.owner !== p || (s.players[p] as any).gyCastTurn !== s.turn) return null;
  if (/\bLand\b/.test(s.defs[card.defId].typeLine.split(' // ')[0]) && !/(Instant|Sorcery|Creature)/.test(s.defs[card.defId].typeLine)) return null;
  return 'mayPlay';
});

// more face-up heads; "whenever you collect evidence"
EXT.triggers.push((cond) => {
  if (/^whenever (?:you turn a permanent face up|a face-down permanent you control is turned face up|~ or another permanent you control is turned face up)$/.test(cond)) return [{ event: 'faceUpX', data: { mine: true }, last: { t: 'triggerObj' } } as any];
  if (/^whenever you collect evidence$/.test(cond)) return [{ event: 'evidence14' } as any];
  return null;
});
EXT.hooks.event.push((s, name, d, api) => {
  if (name !== 'collectEvidence') return;
  for (const oid of api.observers(s)) {
    const o = s.cards[oid];
    if (o?.controller !== d.p) continue;
    for (const t of api.chars(s, oid).pc.triggers as any[]) if (t.event === 'evidence14') api.queueTrigger(s, oid, o.controller, t, {});
  }
});
// "Whenever a creature you control is dealt damage, …" / "whenever another creature you control is dealt damage"
EXT.triggers.push((cond) => {
  const m = cond.match(/^whenever (a|another) (.+?) (you control|an opponent controls) is dealt damage$/);
  if (!m) return null;
  const f: any = looseFilter(m[2]);
  if (!f) return null;
  return [{ event: 'dealtX14', filter: { ...f, zone: 'battlefield', controller: m[3] === 'you control' ? 'you' : 'opp', ...(m[1] === 'another' ? { other: true } : {}) }, last: { t: 'triggerObj' }, lastPlayer: { t: 'triggerPlayer' } } as any];
});
EXT.hooks.event.push((s, name, d, api) => {
  if (name !== 'dealt' || d.to?.kind !== 'card') return;
  const iid = d.to.iid;
  if (!s.cards[iid]) return;
  for (const oid of api.observers(s)) {
    const o = s.cards[oid];
    if (!o) continue;
    for (const t of api.chars(s, oid).pc.triggers as any[]) if (t.event === 'dealtX14' && api.matchesFilter(s, iid, t.filter, o.controller, oid)) api.queueTrigger(s, oid, o.controller, t, { triggerObj: iid, amount: d.n, triggerPlayer: s.cards[iid].controller });
  }
});
// "Whenever a Dragon you control becomes the target of a spell or ability an opponent controls" /
// "Whenever you and/or at least one permanent you control becomes the target of …"
EXT.triggers.push((cond) => {
  const m = cond.match(/^whenever (you and\/or at least one|you or a|a|another) (.+?) (you control )?becomes the target of a spell or ability( an opponent controls)?$/);
  if (!m || (m[1] === 'a' && /^(creature|permanent)$/.test(m[2]) && !m[3])) return null;
  if (/^(enchanted|equipped)/.test(m[2])) return null;
  const f: any = looseFilter(m[2]);
  if (!f) return null;
  return [{ event: 'targetedX', filter: { ...f, zone: 'battlefield', ...(m[3] ? { controller: 'you' } : {}), ...(m[1] === 'another' ? { other: true } : {}) }, data: { who: 'filter', opp: !!m[4], you: /^you/.test(m[1]) }, last: { t: 'triggerObj' }, lastPlayer: { t: 'triggerPlayer' } } as any];
});
// "Whenever a player taps an Island / a nonbasic land for mana, ~ deals 1 damage to that player." (Scald, Burning Earth)
EXT.lines.push((line, pc) => {
  const m = line.match(/^whenever a player taps an? (.+?) for mana, ~ deals (\d+) damage to that player$/);
  if (!m || m[1] === 'land') return false;
  const f: any = looseFilter(m[1]);
  if (!f) return false;
  (pc.manaTrig ??= []).push({ scope: 'any', filter: { ...f, zone: undefined }, dmg: +m[2] });
  return true;
});

// "If a red card is discarded this way, …" / "If the discarded card wasn't a land card, …" / "if an artifact card was
// discarded this way" — the cards the resolving spell or ability made someone discard.
// (item.discardedHere is tracked in batch13)
EXT.conds.push((t) => {
  let m = t.match(/^(?:a|an) (.+?) (?:card )?(?:is|was) discarded this way$/);
  if (m) { const f: any = looseFilter(m[1]); return f ? { k: 'ext', name: 'discHere14', f: { ...f, zone: 'graveyard' } } : null; }
  m = t.match(/^the discarded card (was|wasn't|is|isn't) (?:a|an) (.+?)(?: card)?$/);
  if (m) { const f: any = looseFilter(m[2]); return f ? { k: 'ext', name: 'discHere14', f: { ...f, zone: 'graveyard' }, not: /n't/.test(m[1]), all: true } : null; }
  if (/^(?:a|any) cards? (?:is|was|were) discarded this way$|^you discarded a card this way$/.test(t)) return { k: 'ext', name: 'discHere14', f: null };
  return null;
});
EXT.condEval.discHere14 = (s, c: any, you, self, ctx: any) => {
  const list: string[] = ctx?.item?.discardedHere ?? (s.resolving?.item as any)?.discardedHere ?? [];
  if (!c.f) return list.length > 0;
  if (c.all) { if (!list.length) return false; const v = matchesFilter(s, list[0], c.f, you, self, true); return c.not ? !v : v; }
  return list.some((x) => matchesFilter(s, x, c.f, you, self, true));
};

// "Search your library for up to two Forest cards and reveal them. Put one of them onto the battlefield tapped and the
// other into your hand, then shuffle." — the destination in the next sentence.
EXT.seqs.push((sents, i, ctx, ab) => {
  const m = sents[i].match(/^(?:then )?(search your library for .+?)(?:,? and reveal (?:it|them|that card|those cards))?$/);
  if (!m || /\b(put|exile|reveal|cast)\b/.test(m[1].replace(/^search your library for /, ''))) return null;
  const nx = sents[i + 1];
  const pm = nx?.match(/^(put (?:it|them|that card|those cards|one of them|one of those cards|one)\b.*)$/);
  if (!pm) return null;
  const k0 = ctx.specs.length;
  const joined = `${m[1]}, reveal ${/up to|cards/.test(m[1]) ? 'those cards' : 'it'}, ${pm[1].replace(/^put (?:one of them|one of those cards)\b/, 'put one').replace(/^put (?:that card|those cards|them)\b/, (x: string) => (/up to|cards/.test(m[1]) ? 'put them' : 'put it'))}`;
  const r = parseSentence(joined, ctx);
  if (!r?.length || r.some((e: any) => e.k === 'manual')) { ctx.specs.length = k0; return null; }
  ab.effects.push(...r);
  return 2;
});
// "…, put it into your hand, shuffle, then discard a card at random." — the bare "shuffle" step
EXT.expand.push((line) => (/(into your hand|onto the battlefield(?: tapped)?), shuffle(?:,|$)/.test(line) && !/then shuffle/.test(line) ? [line.replace(/(into your hand|onto the battlefield(?: tapped)?), shuffle(,|$)/, '$1, then shuffle$2')] : null));

// Amount wrappers: "half X, rounded down", "three times X", "the power of the sacrificed creature", "the total power of
// the sacrificed creatures"
const inner14 = (s: any, a: any, you: any, self: any, ctx: any): number => {
  const item = ctx?.item;
  if (a?.sacStat) {
    const sid = ((s.cards[item?.source] as any)?.sacForCost ?? s.lastSacrificed ?? [])[0];
    return sid && s.cards[sid] ? Math.max(0, a.sacStat === 'cmc' ? chars(s, sid).cmc ?? 0 : (chars(s, sid) as any)[a.sacStat] ?? 0) : 0;
  }
  if (a?.trigAmount) return (item?.evAmount ?? 0) * (a.mult ?? 1);
  if (a?.lastCount) return (item?.lastCount ?? 1) * (a.mult ?? 1);
  return evalAmt(s, a, you, self, ctx);
};
EXT.amountPhrases.push((ph: string) => {
  const ctx: any = { specs: [] };
  let m: RegExpMatchArray | null;
  if ((m = ph.match(/^half (.+?),? rounded (down|up)$/))) { const a = parseAmtPhrase(m[1], ctx); return a != null ? { ext: 'half14', a, up: m[2] === 'up' } : null; }
  if ((m = ph.match(/^(three|four) times (.+)$/))) { const a = parseAmtPhrase(m[2], ctx); return a != null ? { ext: 'mult14', a, k: m[1] === 'three' ? 3 : 4 } : null; }
  if ((m = ph.match(/^the (power|toughness|mana value) of (the|that) ([a-z -]+?)$/)) && !/ of /.test(m[3])) return parseAmtPhrase(`${m[2]} ${m[3]}'s ${m[1]}`, ctx);
  if ((m = ph.match(/^the total (power|toughness|mana value) of the sacrificed (?:creatures|permanents|artifacts)$/))) return { ext: 'sacTotal14', stat: m[1] === 'mana value' ? 'cmc' : m[1] };
  return null;
});
EXT.amounts.half14 = (s, a: any, you, self, ctx) => { const v = inner14(s, a.a, you, self, ctx) / 2; return a.up ? Math.ceil(v) : Math.floor(v); };
EXT.amounts.mult14 = (s, a: any, you, self, ctx) => inner14(s, a.a, you, self, ctx) * a.k;
EXT.amounts.sacTotal14 = (s, a: any, _you, _self, ctx: any) => {
  const ids: string[] = (s.cards[ctx?.item?.source] as any)?.sacForCost ?? (s as any).lastSacrificed ?? [];
  return ids.filter((x) => s.cards[x]).reduce((t, x) => t + Math.max(0, a.stat === 'cmc' ? chars(s, x).cmc ?? 0 : (chars(s, x) as any)[a.stat] ?? 0), 0);
};

// "there are five or more mana values among cards in your graveyard" / "there are exactly three tide counters on ~" /
// "there are fewer than eight cards in your graveyard" / "there are three or more cards exiled with ~"
const linked14 = (s: any, self?: string): string[] => { const c: any = self ? s.cards[self] : null; return [...(c?.linked ?? []), ...(c?.remembered ?? [])].filter((x: string) => s.cards[x]?.zone === 'exile'); };
EXT.amountPhrases.push((ph: string) => {
  let m: RegExpMatchArray | null;
  if ((m = ph.match(/^the number of (?:different )?mana values among (?:cards|nonland cards|permanents) (in your graveyard|you control|exiled with ~)$/))) return { ext: 'distinct14', key: 'cmc', where: m[1] };
  if ((m = ph.match(/^the number of card types among cards exiled with ~$/))) return { ext: 'distinct14', key: 'types', where: 'exiled with ~' };
  if (/^the number of cards exiled with ~$/.test(ph)) return { ext: 'linkedN14' };
  if ((m = ph.match(/^the number of counters among (.+)$/))) { const f: any = looseFilter(m[1].split(' ').map((w) => singular(w)).join(' ')); return f ? { ext: 'allCtr14', f: { ...f, zone: 'battlefield' } } : null; }
  return null;
});
EXT.amounts.linkedN14 = (s, _a, _you, self) => linked14(s, self).length;
EXT.amounts.allCtr14 = (s, a: any, you, self) => s.battlefield.filter((b) => matchesFilter(s, b, a.f, you, self, true)).reduce((n, b) => n + Object.values(s.cards[b].counters).reduce((x: number, v: any) => x + Math.max(0, v as number), 0), 0);
EXT.amounts.distinct14 = (s, a: any, you, self) => {
  const ids: string[] = a.where === 'in your graveyard' ? s.players[you].graveyard : a.where === 'you control' ? s.battlefield.filter((b) => s.cards[b].controller === you) : linked14(s, self);
  const out = new Set<string>();
  for (const x of ids) {
    const d = s.defs[s.cards[x].defId];
    if (a.key === 'cmc') out.add(String(baseChars(s, x).cmc ?? 0));
    else for (const t of (d.typeLine.split(' — ')[0].toLowerCase().split(/\s+/))) if (['artifact', 'battle', 'creature', 'enchantment', 'instant', 'kindred', 'land', 'planeswalker', 'sorcery', 'tribal'].includes(t)) out.add(t);
  }
  return out.size;
};
const NUM_W: Record<string, number> = { no: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twenty: 20, thirty: 30 };
EXT.conds.push((t) => {
  let m: RegExpMatchArray | null;
  if (/^it's (?:nighttime|night)$/.test(t)) return { k: 'ext', name: 'night14' };
  if (/^it's (?:daytime|day)$/.test(t)) return { k: 'ext', name: 'night14', not: true };
  if ((m = t.match(/^there (?:are|is) (exactly |fewer than |more than )?(\w+)( or more| or fewer)? (.+)$/))) {
    const n = NUM_W[m[2]] ?? (/^\d+$/.test(m[2]) ? +m[2] : null);
    if (n == null || m[2] === 'no' && (m[1] || m[3])) return null;
    const a = parseAmtPhrase(`the number of ${m[4]}`, { specs: [] } as any) ?? parseAmtPhrase(`the number of ${m[4].replace(/^(\S+ )?(counter|card|creature|permanent)\b/, (_x: string, a: string, b: string) => `${a ?? ''}${b}s`)}`, { specs: [] } as any);
    if (a == null) return null;
    const op = m[1] === 'exactly ' ? 'eq' : m[1] === 'fewer than ' ? 'lt' : m[1] === 'more than ' ? 'gt' : m[3] === ' or more' ? 'ge' : m[3] === ' or fewer' ? 'le' : m[2] === 'no' ? 'eq' : 'eq';
    if (!m[1] && !m[3] && m[2] !== 'no') return null;
    return { k: 'ext', name: 'cmpAmt14', a, op, n };
  }
  if (/^an opponent was dealt (?:noncombat )?damage this turn$/.test(t)) return { k: 'ext', name: 'oppDealt14', noncombat: /noncombat/.test(t) };
  if (/^an opponent's life total is less than half their starting life total$/.test(t)) return { k: 'ext', name: 'oppHalfLife14' };
  if ((m = t.match(/^a creature has an? ([+-]\d\/[+-]\d|[a-z]+) counter on it$/))) return { k: 'ext', name: 'anyCtr14', ctr: m[1] };
  if (/^an opponent has cast a spell this turn$/.test(t)) return { k: 'ext', name: 'oppCast14' };
  return null;
});
EXT.condEval.night14 = (s, c: any) => (c.not ? s.dayNight === 'day' : s.dayNight === 'night');
EXT.condEval.cmpAmt14 = (s, c: any, you, self, ctx) => {
  const v = inner14(s, c.a, you, self, ctx);
  return c.op === 'eq' ? v === c.n : c.op === 'lt' ? v < c.n : c.op === 'gt' ? v > c.n : c.op === 'ge' ? v >= c.n : v <= c.n;
};
EXT.hooks.event.push((s, name, d) => {
  if (name !== 'dealt' || d.to?.kind !== 'player') return;
  const t = TL14(s);
  ((t.dmgTo14 ??= {})[d.to.idx] ??= { any: 0, nc: 0 });
  t.dmgTo14[d.to.idx].any += d.n;
  if (!d.combat) t.dmgTo14[d.to.idx].nc += d.n;
});
EXT.condEval.oppDealt14 = (s, c: any, you) => { const t = TL14(s).dmgTo14 ?? {}; return Object.entries(t).some(([p, v]: any) => +p !== you && (c.noncombat ? v.nc : v.any) > 0); };
EXT.condEval.oppHalfLife14 = (s, _c, you) => s.players.some((p: any, i: number) => i !== you && p.life * 2 < ((s as any).startingLife ?? ((s as any).format === 'commander' ? 40 : 20)));
EXT.condEval.anyCtr14 = (s, c: any) => s.battlefield.some((b) => (s.cards[b].counters[c.ctr] ?? 0) > 0 && chars(s, b).types.has('creature'));
EXT.condEval.oppCast14 = (s, _c, you) => ((TL14(s).casts ?? []) as any[][]).some((l, i) => i !== you && (l?.length ?? 0) > 0);

// Fallback: "As long as <condition>, <static ability>." — the ability, gated on the condition (604.2). Used only when the
// line isn't otherwise understood; abilities that become statics/replacements/triggers/activated abilities are gated
// directly, "can't attack/block" and prevention statics through their own gate checks.
let alBusy14 = false;
const GATEABLE14 = new Set(['preventStatics', 'cantAttack', 'cantBlock']);
EXT.lines.push((line, pc, info) => {
  const m = line.match(/^as long as (.+?), ((?:~|it|enchanted|equipped|you|creatures|other|each|prevent|all|spells|lands|artifacts|enchantments|permanents) .+)$/);
  if (!m || alBusy14 || /\botherwise\b|\bthe same is true\b/.test(line)) return false;
  const cond = parseCond(m[1]);
  if (!cond) return false;
  alBusy14 = true;
  try {
    const nm = 'Probe';
    const whole: any = parseCard({ id: `alw14:${info.tl}:${line}`, name: nm, manaCost: '', cmc: 0, typeLine: info.tl || 'Creature', oracle: line.replace(/~/g, nm), colors: [], colorIdentity: [], keywords: [], layout: 'normal' } as any);
    if (!whole.unparsed.length && automationLevel(whole) === 'full') return false;
    const rest = m[2].replace(/^it\b/, '~');
    const probe: any = parseCard({ id: `al14:${info.tl}:${rest}`, name: nm, manaCost: '', cmc: 0, typeLine: info.tl || 'Creature', oracle: rest.replace(/~/g, nm), colors: [], colorIdentity: [], keywords: [], layout: 'normal' } as any);
    if (probe.unparsed.length || automationLevel(probe) !== 'full' || probe.keywords.length) return false;
    const extra = Object.keys(probe).filter((k) => !['keywords', 'triggers', 'activated', 'statics', 'unparsed', 'kwArgs', 'replacements', 'spell'].includes(k) && probe[k] != null && probe[k] !== false && !(Array.isArray(probe[k]) && !probe[k].length) && !(typeof probe[k] === 'object' && !Array.isArray(probe[k]) && !Object.keys(probe[k]).length));
    if (extra.some((k) => !GATEABLE14.has(k))) return false;
    if (!extra.length && !probe.statics.length && !probe.replacements?.length && !probe.triggers.length && !probe.activated.length) return false;
    for (const t of probe.triggers) pc.triggers.push({ ...t, gate: cond } as any);
    for (const a of probe.activated) pc.activated.push({ ...a, gate: cond } as any);
    for (const x of probe.statics) pc.statics.push({ ...x, gate: cond } as any);
    for (const r of probe.replacements ?? []) (pc.replacements ??= []).push({ ...r, gate: cond } as any);
    for (const x of probe.preventStatics ?? []) (pc.preventStatics ??= []).push({ ...x, gate14: cond });
    if (probe.cantAttack) (pc.gatedFlags14 ??= []).push({ gate: cond, cantAttack: true });
    if (probe.cantBlock) (pc.gatedFlags14 ??= []).push({ gate: cond, cantBlock: true });
    if (probe.statics.length || probe.triggers.length || probe.activated.length || probe.replacements?.length) pc.gated = true;
    return true;
  } finally { alBusy14 = false; }
});
EXT.hooks.canAttack.push((s, iid, api) => {
  const g = (api.chars(s, iid).pc as any).gatedFlags14 as any[] | undefined;
  if (!g) return undefined;
  return g.some((x) => x.cantAttack && gateOk(s, s.cards[iid], x.gate)) ? false : undefined;
});
EXT.hooks.canBlock.push((s, b, _a, api) => {
  const g = (api.chars(s, b).pc as any).gatedFlags14 as any[] | undefined;
  if (!g) return undefined;
  return g.some((x) => x.cantBlock && gateOk(s, s.cards[b], x.gate)) ? false : undefined;
});

// "You may cast spells from your hand without paying their mana costs." (Omniscience) / "You may cast Dragon spells without
// paying their mana costs." (Dracogenesis)
EXT.lines.push((line, pc) => {
  const m = line.match(/^you may cast (.*?) ?spells( from your hand)? without paying their mana costs$/);
  if (!m) return false;
  let f: any = {};
  if (m[1]) { const g: any = looseFilter(m[1]) ?? looseFilter(`${m[1]} spell`); if (!g) return false; f = { ...g }; delete f.zone; if (f.types?.length === 1 && f.types[0] === 'spell') delete f.types; }
  pc.freeCastFor14 = f;
  return true;
});
EXT.hooks.costMod.push((s, p, iid, cost, alt, api) => {
  if (!cost) return cost;
  const c = s.cards[iid];
  if (!c || c.zone !== 'hand' || (alt && alt !== 'normal')) return cost;
  const ok = sourcesWith(s, 'freeCastFor14').some((b) => {
    if (s.cards[b].controller !== p) return false;
    const f = (api.chars(s, b).pc as any).freeCastFor14;
    return !!f && (!Object.keys(f).length || api.matchesFilter(s, iid, { ...f, zone: 'hand' }, p));
  });
  return ok ? '' : cost;
});

// "a creature not named ~ died this turn" / "a non-Zombie creature died this turn" / "a Goblin died this turn"
EXT.conds.push((t) => {
  const m = t.match(/^(?:a|an|another) (non-?([a-z]+) )?(?:([a-z]+) )?creature( not named ~)? died this turn$/) ?? t.match(/^(?:a|an) ([a-z]+)()() died this turn$/);
  if (!m) return null;
  if (!m[1] && !m[3] && !m[4]) return null;
  if (m[2] && !SUBTYPES.has(m[2])) return null;
  if (m[3] && !SUBTYPES.has(m[3]) && m[3] !== 'nontoken') return null;
  return { k: 'ext', name: 'diedSome14', notSub: m[2] ?? undefined, sub: m[3] || undefined, notSelfName: !!m[4] };
});
EXT.condEval.diedSome14 = (s, c: any, _you, self) => {
  const nm = self ? s.defs[s.cards[self].defId]?.name : undefined;
  return TL14(s).died.some((d: any) => (!c.notSub || !d.subtypes.includes(c.notSub)) && (!c.sub || (c.sub === 'nontoken' ? !d.token : d.subtypes.includes(c.sub))) && (!c.notSelfName || d.name !== nm));
};
// "You may cast this card from your graveyard if <condition>. [If you do, it enters with a +1/+1 counter on it.]"
EXT.lines.push((line, pc) => {
  const m = line.match(/^you may cast ~ from your graveyard if (.+?)(?:\. if you do, ~ enters with an? (\+1\/\+1) counter on it)?$/);
  if (!m) return false;
  const cond = parseCond(m[1]);
  if (!cond) return false;
  pc.castSelfFromGyIf14 = { cond, ctr: m[2] };
  return true;
});
EXT.hooks.zoneCast.push((s, p, card, _pcf, api) => {
  if (card.zone !== 'graveyard' || card.owner !== p) return null;
  const g = (api.parsedFor(s, card) as any).castSelfFromGyIf14;
  if (!g || !evalCond(s, g.cond, p, card.iid)) return null;
  return 'ext:gyselfIf14';
});
EXT.alts.gyselfIf14 = { label: 'from graveyard', begin: (s, _p, iid) => s.defs[s.cards[iid].defId].manaCost || '', afterPush: (s, item) => { const c: any = s.cards[item.source]; const g = c ? (parseCard(s.defs[c.defId]) as any).castSelfFromGyIf14 : null; if (g?.ctr) c.gyEnterCtr14 = g.ctr; } } as any;
EXT.hooks.afterMove.push((s, iid, from, to, o, api) => {
  const c: any = s.cards[iid];
  if (!c?.gyEnterCtr14) return;
  if (to === 'battlefield' && (from === 'stack' || (o as any)?.resolved)) api.addCounters(s, iid, c.gyEnterCtr14, 1);
  if (to !== 'stack') c.gyEnterCtr14 = undefined;
});
// "Create a 1/1 black Snail creature token if you don't control a Snail." (the core reads "if you don't" as a choice)
EXT.seqs.push((sents, i, ctx, ab) => {
  const m = sents[i].match(/^(.+?) if you don't control (.+)$/);
  if (!m || /^you may\b/.test(m[1])) return null;
  const cond = parseCond(`you don't control ${m[2]}`);
  if (!cond) return null;
  const k0 = ctx.specs.length;
  const inner = parseSentence(m[1], ctx);
  if (!inner?.length || inner.some((e: any) => e.k === 'manual')) { ctx.specs.length = k0; return null; }
  ab.effects.push({ k: 'if', cond, effects: inner });
  return 1;
});
// "for each time it was kicked" (multikicker) / "for each counter on it"
EXT.amountPhrases.push((ph: string) => {
  if (/^(?:the number of times|times?) (?:it|~) was kicked$/.test(ph)) return { ext: 'kickCount14' };
  if (/^(?:the number of )?counters? on (?:it|~)$/.test(ph)) return { ext: 'selfCtrAll14' };
  return null;
});
EXT.amounts.kickCount14 = (s, _a, _you, self) => { const c: any = self ? s.cards[self] : null; return c?.kickCount ?? (c?.kicked ? 1 : 0); };
EXT.amounts.selfCtrAll14 = (s, _a, _you, self) => { const c: any = self ? s.cards[self] : null; return c ? Object.values(c.counters ?? {}).reduce((n: number, v: any) => n + Math.max(0, v as number), 0) : 0; };

// "Creatures you control [with defender] can attack as though they didn't have defender." (High Alert, Ghalta) /
// "… can attack this turn as though …" (Wakestone Gargoyle) / "Creatures you control [with …] can't be blocked [except by …]."
EXT.lines.push((line, pc) => {
  let m = line.match(/^((?:other )?creatures you control(?: with [a-z0-9+\/ -]+?)?) can attack as though they didn't have defender$/);
  if (m) {
    const f: any = parseFilter(m[1]);
    if (!f) return false;
    pc.statics.push({ kind: 'anthem', filter: { ...f, zone: 'battlefield' }, p: 0, t: 0, kw: ['attacks as though no defender'] } as any);
    return true;
  }
  m = line.match(/^((?:other )?(?:[a-z]+ )?creatures you control(?: (?:with|that) .+?)?) can't be blocked(?: except by (.+))?$/);
  if (m) {
    const f: any = parseFilter(m[1]);
    if (!f) return false;
    let ex: any = null;
    if (m[2]) { ex = parseFilter(m[2]); if (!ex) return false; ex = { ...ex, zone: 'battlefield' }; delete ex.controller; }
    (pc.groupUnblock14 ??= []).push({ filter: { ...f, zone: 'battlefield' }, except: ex });
    return true;
  }
  return false;
});
EXT.rules.push([/^((?:other )?creatures you control(?: with [a-z0-9+\/ -]+?)?) can attack this turn as though they didn't have defender$/, (m) => {
  const f: any = parseFilter(m[1]);
  if (!f) return null;
  const g: any = { ...f }; delete g.zone;
  return [{ k: 'pump', what: { t: 'all', filter: g }, p: 0, t: 0, kw: ['attacks as though no defender'], eot: true, neg: false } as any];
}]);
EXT.hooks.canBlock.push((s, blocker, attacker, api) => {
  const a = s.cards[attacker];
  if (!a) return undefined;
  for (const b of sourcesWith(s, 'groupUnblock14')) {
    const src = s.cards[b];
    if (!src || src.controller !== a.controller) continue;
    for (const g of ((api.chars(s, b).pc as any).groupUnblock14 ?? []) as any[]) {
      if (!api.matchesFilter(s, attacker, g.filter, src.controller, b)) continue;
      if (g.except && api.matchesFilter(s, blocker, g.except, src.controller, b)) continue;
      return false;
    }
  }
  return undefined;
});

// "You may pay {W}{U}{B}{R}{G} rather than pay the mana cost for spells you cast." (Fist of Suns, Jodah) /
// "You may pay {0} rather than pay the mana cost for Zombie creature spells you cast." (Rooftop Storm)
EXT.lines.push((line, pc) => {
  const m = line.match(/^you may pay ((?:\{[^}]+\})+) rather than pay the mana cost for (.*?) ?spells you cast$/);
  if (!m) return false;
  let f: any = {};
  if (m[2]) { const g: any = looseFilter(m[2]) ?? looseFilter(`${m[2]} spell`); if (!g) return false; f = { ...g }; delete f.zone; if (f.types?.length === 1 && f.types[0] === 'spell') delete f.types; }
  (pc.altCostFor14 ??= []).push({ cost: m[1].toUpperCase(), filter: f });
  return true;
});
const altFor14 = (s: any, p: number, iid: string, api: any): string | null => {
  for (const b of sourcesWith(s, 'altCostFor14')) {
    if (s.cards[b].controller !== p) continue;
    for (const a of ((api.chars(s, b).pc as any).altCostFor14 ?? []) as any[]) if (!Object.keys(a.filter).length || api.matchesFilter(s, iid, { ...a.filter, zone: s.cards[iid].zone }, p)) return a.cost;
  }
  return null;
};
EXT.hooks.castOptions.push((s, p, iid, api) => {
  const c = s.cards[iid];
  if (!c || c.zone !== 'hand' || c.owner !== p) return [];
  const cost = altFor14(s, p, iid, api);
  if (cost == null) return [];
  const d = s.defs[c.defId];
  if (/\bLand\b/.test(d.typeLine.split(' // ')[0])) return [];
  const pc = api.parsedFor(s, c) as any;
  const inst = /\binstant\b/i.test(d.typeLine) || pc.keywords.includes('flash') || EXT.hooks.flash.some((h) => h(s, iid, api));
  const t = s.priority === p && !s.prompt && (inst || (s.active === p && (s.step === 'main1' || s.step === 'main2') && !s.stack.length));
  return [{ label: `Cast ${d.name} for ${cost}`, action: { type: 'cast', iid, alt: 'ext:altCost14' } as any, ok: t && api.canAfford(s, p, cost) }];
});
EXT.alts.altCost14 = { label: 'alternative cost', begin: (s, p, iid, _pcf, api) => { const c = altFor14(s, p, iid, api); return c == null ? '!No alternative cost available' : c; } } as any;

// "~'s base power and toughness become 4/2 until end of turn." (Mirkwood Meditator)
EXT.rules.push([/^(?:until end of turn, )?(~|it|that creature|target creature(?: you control)?|enchanted creature|equipped creature)'s base power and toughness (?:become|becomes|are|each become) (\d+)\/(\d+)(?: until end of turn)?$/, (m, ctx) => {
  if (!/until end of turn/.test(m[0])) return null;
  const what = m[1] === '~' ? { t: 'self' } : m[1] === 'it' || m[1] === 'that creature' ? ctx.last ?? { t: 'self' } : parseSubject(m[1], ctx);
  return what ? [{ k: 'ext', name: 'tempChars', what, mod: { setPT: [+m[2], +m[3]] } }] : null;
}]);
// "Target creature blocks it this turn if able." (it = ~)
EXT.rules.push([/^(target creature(?: [a-z ]+)?|that creature) blocks (it|~) this turn if able$/, (m, ctx) => {
  // only rewrites "it" → "~"; a sentence already using "~" that nothing else parses must not recurse forever
  if (m[2] !== 'it' || (ctx.last && ctx.last.t !== 'self')) return null;
  return parseSentence(`${m[1]} blocks ~ this turn if able`, ctx);
}]);
// "Two target players exchange life totals." / "You and target player exchange life totals."
EXT.rules.push([/^(two target players|you and target (?:player|opponent)|target player and you) exchange life totals$/, (m, ctx) => {
  const two = /^two/.test(m[1]);
  ctx.specs.push(spec({ types: [] }, two ? 2 : 1, false, two ? 'two target players' : 'target player', /opponent/.test(m[1]) ? 'opp' : 'any'));
  return [{ k: 'ext', name: 'swapLife14', spec: ctx.specs.length - 1, two }];
}]);
EXT.effects.swapLife14 = ({ s, item, e, you, api }) => {
  const ps = ((item.targets[e.spec] ?? []) as any[]).filter((t) => t.kind === 'player').map((t) => t.idx);
  const [a, b] = e.two ? ps : [you, ps[0]];
  if (a == null || b == null || a === b) return 'done';
  const la = s.players[a].life, lb = s.players[b].life;
  // 119.5: each player gains or loses the difference
  if (lb > la) api.gainLife(s, a, lb - la); else if (la > lb) api.loseLife(s, a, la - lb);
  if (la > lb) api.gainLife(s, b, la - lb); else if (lb > la) api.loseLife(s, b, lb - la);
  api.log(s, `${api.pname(s, a)} and ${api.pname(s, b)} exchange life totals.`, you);
  return 'done';
};
// "You may have ~ deal 1 damage to …" / "… have two target players exchange life totals" / "have target player lose life
// equal to …" — "have X <verb>" is X <verb>s
const S3 = (v: string) => (/(s|sh|ch|x)$/.test(v) ? `${v}es` : /[^aeiou]y$/.test(v) ? `${v.slice(0, -1)}ies` : v === 'have' ? 'has' : `${v}s`);
EXT.rules.push([/^have (.+?) (exchange|lose|mill|shuffle|create|deal|fight|become|gain|draw|discard|sacrifice|return|put|exile|get|search|reveal|untap|tap) (.+)$/, (m, ctx) => {
  const k0 = ctx.specs.length;
  for (const text of [`${m[1]} ${S3(m[2])} ${m[3]}`, `${m[1]} ${m[2]} ${m[3]}`]) {
    const r = parseSentence(text, ctx);
    if (r?.length && !r.some((e: any) => e.k === 'manual')) return r;
    ctx.specs.length = k0;
  }
  return null;
}]);

// "the total toughness of other creatures you control" / "the total mana value of instant and sorcery cards in your
// graveyard" / "the number of creatures sacrificed this way" / "the greatest number of creatures a player controls"
EXT.amountPhrases.push((ph: string) => {
  let m: RegExpMatchArray | null;
  if ((m = ph.match(/^the total (power|toughness|mana value) of (.+)$/)) && !/sacrificed|this way|those|exiled with/.test(m[2])) {
    const stat = m[1] === 'mana value' ? 'cmc' : m[1];
    const gy = m[2].match(/^(.*?)cards? in your graveyard$/);
    if (gy) {
      const ph2 = gy[1].trim().replace(/ and\/or /g, ' or ').replace(/ and /g, ' or ');
      const f: any = ph2 ? looseFilter(ph2) : {};
      if (!f) return null;
      const g = { ...f }; delete g.zone;
      return { ext: 'total14', stat, f: { ...g, zone: 'graveyard', owner: 'you' }, gy: true };
    }
    const f: any = parseFilter(m[2].split(' ').map((w) => singular(w)).join(' '));
    if (!f) return null;
    return { ext: 'total14', stat, f: { ...f, zone: 'battlefield' } };
  }
  if (/^(?:the number of )?(?:creatures?|permanents?|artifacts?) sacrificed this way$/.test(ph)) return { ext: 'sacCount14' };
  if ((m = ph.match(/^the greatest number of (.+?) (?:a player|any player|an opponent|one of your opponents) controls$/))) {
    const f: any = parseFilter(m[1].split(' ').map((w) => singular(w)).join(' '));
    return f ? { ext: 'maxPer14', f: { ...f, zone: 'battlefield' }, opp: /opponent/.test(ph) } : null;
  }
  return null;
});
EXT.amounts.total14 = (s, a: any, you, self) => {
  const ids: string[] = a.gy ? s.players[you].graveyard : s.battlefield;
  return ids.filter((x) => matchesFilter(s, x, a.f, you, self, true)).reduce((t, x) => { const ch = a.gy ? baseChars(s, x) : chars(s, x); return t + Math.max(0, a.stat === 'cmc' ? ch.cmc ?? 0 : (ch as any)[a.stat] ?? 0); }, 0);
};
EXT.amounts.sacCount14 = (s, _a, _you, _self, ctx: any) => ((s.cards[ctx?.item?.source] as any)?.sacForCost ?? (s as any).lastSacrificed ?? []).length;
EXT.amounts.maxPer14 = (s, a: any, you, self) => Math.max(0, ...s.players.map((_p: any, i: number) => (a.opp && i === you ? 0 : s.battlefield.filter((b) => s.cards[b].controller === i && matchesFilter(s, b, { ...a.f, controller: undefined }, you, self, true)).length)));
// "Return it to the battlefield [tapped] under its owner's control with a flying counter / two stun counters on it."
EXT.rules.push([/^return (.+?) to the battlefield( tapped)?(?: under (its owner's|your|their owners') control)?( tapped)? with (a|an|one|two|three|four|five|\d+) ([+-]\d\/[+-]\d|[a-z]+) counters? on (?:it|them)$/, (m, ctx) => {
  const what = parseSubject(m[1], ctx);
  if (!what) return null;
  const n = /^\d+$/.test(m[5]) ? +m[5] : ({ a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 } as any)[m[5]];
  return [{ k: 'reanimate', what, dest: 'battlefield', tapped: !!(m[2] || m[4]), ...(m[3] && m[3] !== 'your' ? { owner: true } : {}), counters: { [m[6]]: n } } as any];
}]);

// "At the beginning of combat this turn, …" (Intervention of Keranos) / "At the beginning of each combat this turn, …"
EXT.rules.push([/^at the beginning of (each )?combat this turn, (.+)$/, (m, ctx) => {
  const inner = parseSentence(m[2], ctx);
  if (!inner?.length || inner.some((e: any) => e.k === 'manual')) return null;
  return [{ k: 'delayed', at: m[1] ? 'eachCombat14' : 'combat14', effects: inner } as any];
}]);
EXT.hooks.step.push((s, step) => {
  if (step === 'end' || step === 'cleanup') { s.delayed = (s.delayed as any[]).filter((d) => d.at !== 'combat14' && d.at !== 'eachCombat14') as any; return; }
  if (step !== 'beginCombat') return;
  const due = (s.delayed as any[]).filter((d) => (d.at === 'combat14' || d.at === 'eachCombat14') && (d.turn14 ??= s.turn) === s.turn);
  s.delayed = (s.delayed as any[]).filter((d) => !(d.at === 'combat14' && due.includes(d)) && !(d.at === 'eachCombat14' && d.turn14 !== s.turn)) as any;
  for (const d of due) {
    const it: any = { id: `dc14${s.ts++}`, kind: 'trigger', controller: d.controller, source: d.source, label: d.label, text: 'Delayed trigger', effects: JSON.parse(JSON.stringify(d.effects)), targets: d.targets };
    it.exiledHere = d.refs; it.lastTokens = d.refs; it.preTargeted = true;
    s.pendingTriggers.push(it);
  }
});
// "At the beginning of the end step / upkeep of enchanted creature's controller, …" (Aggression, Lingering Death)
EXT.triggers.push((cond) => {
  const m = cond.match(/^at the beginning of the (end step|upkeep) of enchanted (creature|permanent)'s controller$/);
  if (!m) return null;
  return [{ event: m[1] === 'upkeep' ? 'eachUpkeep' : 'eachEndStep', last: { t: 'enchanted' }, lastPlayer: { t: 'controllerOf', of: { t: 'enchanted' } }, cond: { k: 'ext', name: 'enchCtrlActive14' } } as any];
});
EXT.condEval.enchCtrlActive14 = (s, _c, _you, self) => { const a = self ? (s.cards[self] as any)?.attachedTo : null; return !!a && s.cards[a]?.controller === s.active; };
// "Destroy that creature if it didn't attack this turn." / "… unless that creature attacked this turn" — about the
// referenced object (enchanted creature, trigger object), not ~
EXT.seqs.push((sents, i, ctx, ab) => {
  const m = sents[i].match(/^(.+?) (if (?:it|that creature) (?:didn't|did not) attack this turn|unless that creature attacked this turn|if (?:it|that creature) attacked this turn)$/);
  if (!m || !ctx.last || ctx.last.t === 'self') return null;
  const ref = ctx.last;
  const k0 = ctx.specs.length;
  const inner = parseSentence(m[1], ctx);
  if (!inner?.length || inner.some((e: any) => e.k === 'manual')) { ctx.specs.length = k0; return null; }
  ab.effects.push({ k: 'if', cond: { k: 'ext', name: 'refAttacked14', ref, not: !/^if (?:it|that creature) attacked/.test(m[2]) }, effects: inner });
  return 1;
});
EXT.condEval.refAttacked14 = (s, c: any, _you, self, ctx: any) => {
  const id = ref14(s, c.ref, ctx?.item, self);
  const v = !!id && (TL14(s).attacked ?? []).includes(id);
  return c.not ? !v : v;
};
EXT.rules.push([/^that player sacrifices (that creature|it|that permanent)$/, (_m, ctx) => (ctx.last ? [{ k: 'sacObj', what: ctx.last } as any] : null)]);
