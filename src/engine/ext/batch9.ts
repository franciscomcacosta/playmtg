// Plugin: batch 9 — "choose …, then sacrifice the rest".
//  - "Each player chooses three permanents they control, then sacrifices the rest." (Razia's Purification)
//  - "That player chooses up to two creatures they control, then sacrifices the rest." (Archfiend of Depravity)
//  - "Each player chooses a creature or planeswalker they control, then sacrifices the rest." (Single Combat)
//  - "Each player chooses from among the permanents they control an artifact, a creature, an enchantment, and a land,
//     then sacrifices the rest." (Cataclysm)  /  "… an artifact, a creature, … from among the nonland permanents they control …"
//  - "Each player chooses from the lands they control a land of each basic land type, then sacrifices the rest." (Global Ruin)
//  Choices are made in turn order (APNAP), then everything not chosen is sacrificed at the same time.
import { EXT } from '../ext';
import { looseFilter, num, parseCond, parsePlayerSubject, parseSentence, parseSubject, spec } from '../oracle';
import { SUBTYPES } from '../subtypes';

const strip = (f: any) => { const g = { ...f }; delete g.zone; delete g.owner; return g; };
const single = (w: string) => w.replace(/ies$/, 'y').replace(/s$/, '');
const slotsOf = (list: string) => list.split(/,? and |, /).map((x) => x.replace(/^(?:a|an) /, '').trim());

const R1: [RegExp, (m: RegExpMatchArray, ctx: any) => any[] | null] = [/^(each player|that player|each opponent|target player|target opponent) chooses (up to )?(\w+) (.+?) they control, then sacrifices the rest$/, (m, ctx) => {
  const who = parsePlayerSubject(m[1], ctx);
  const n = m[3] === 'a' || m[3] === 'an' ? 1 : num(m[3]);
  const ph = m[4].split(' or ').map(single).join(' or ');
  const f = looseFilter(ph);
  if (!who || typeof n !== 'number' || !f) return null;
  return [{ k: 'ext', name: 'keepRest', who, count: n, upTo: !!m[2], pool: strip(f) }];
}];
const R2: [RegExp, (m: RegExpMatchArray, ctx: any) => any[] | null] = [/^each player chooses (?:from (?:among )?the (permanents|nonland permanents|lands) they control (.+?)|(.+?) from among the (permanents|nonland permanents) they control), then sacrifices the rest$/, (m) => {
  const poolW = m[1] ?? m[4];
  const list = m[2] ?? m[3];
  const pool = looseFilter(single(poolW));
  if (!pool) return null;
  let slots: any[];
  if (list === 'a land of each basic land type') slots = ['plains', 'island', 'swamp', 'mountain', 'forest'].map((t) => ({ subtypes: [t] }));
  else {
    slots = slotsOf(list).map((x) => looseFilter(x));
    if (slots.some((x) => !x)) return null;
    slots = slots.map(strip);
  }
  return [{ k: 'ext', name: 'keepRest', who: { t: 'eachPlayer' }, slots, pool: strip(pool) }];
}];
const R3: [RegExp, (m: RegExpMatchArray, ctx: any) => any[] | null] = [/^(each player|each opponent|target opponent|target player) chooses a permanent they control of each permanent type,? and sacrifices the rest$/, (m, ctx) => {
  const who = parsePlayerSubject(m[1], ctx);
  return who ? [{ k: 'ext', name: 'keepRest', who, slots: ['artifact', 'battle', 'creature', 'enchantment', 'land', 'planeswalker'].map((x) => ({ types: [x] })), pool: { types: ['permanent'] } }] : null;
}];
EXT.rules.push(R1, R2, R3);
// the sentence splitter cuts ", then sacrifices the rest" off; join it back
EXT.seqs.unshift((sents, i, ctx, ab) => {
  if (!/^(?:then )?sacrifices? the rest$/.test(sents[i + 1] ?? '')) return null;
  const text = `${sents[i]}, then sacrifices the rest`;
  for (const [re, fn] of [R1, R2]) {
    const m = text.match(re);
    const out = m && fn(m, ctx);
    if (out) { ab.effects.push(...out); return 1; }
  }
  return null;
});

EXT.effects.keepRest = ({ s, item, e, r, you, api }) => {
  if (!r.sub) {
    let ps: number[] = api.subjPlayers(s, item, e.who);
    ps = [...ps].sort((a, b) => ((a - s.active + 2) % 2) - ((b - s.active + 2) % 2)); // APNAP
    r.sub = { ps, pi: 0, slot: 0, keep: {} as Record<number, string[]> };
  }
  const st = r.sub;
  const mine = (p: number) => s.battlefield.filter((b: string) => s.cards[b].controller === p && api.matchesFilter(s, b, e.pool, p, item.source));
  if (st.answer !== undefined) {
    const p = st.ps[st.pi];
    (st.keep[p] ??= []).push(...(st.answer as string[]));
    st.answer = undefined;
    if (e.slots) st.slot++;
    else { st.pi++; st.slot = 0; }
    if (e.slots && st.slot >= e.slots.length) { st.pi++; st.slot = 0; }
  }
  while (st.pi < st.ps.length) {
    const p = st.ps[st.pi];
    const kept: string[] = st.keep[p] ?? [];
    if (e.slots) {
      while (st.slot < e.slots.length) {
        const cands = mine(p).filter((b: string) => api.matchesFilter(s, b, e.slots[st.slot], p, item.source));
        if (cands.length) {
          // a card already kept that also fits this slot can cover it
          const label = e.slots[st.slot].subtypes?.[0] ?? e.slots[st.slot].types?.[0] ?? 'card';
          api.pushPrompt(s, { id: api.uid(s, 'p'), player: p, kind: 'chooseCards', title: `${item.label}: choose ${/^[aeiou]/.test(label) ? 'an' : 'a'} ${label} to keep`, cards: cands, min: 1, max: 1, data: { ctx: 'resolve' } });
          return 'wait';
        }
        st.slot++;
      }
      st.pi++; st.slot = 0;
      continue;
    }
    const cands = mine(p);
    const k = Math.min(e.count, cands.length);
    if (cands.length > k || e.upTo) {
      api.pushPrompt(s, { id: api.uid(s, 'p'), player: p, kind: 'chooseCards', title: `${item.label}: choose ${e.upTo ? 'up to ' : ''}${k} to keep (the rest are sacrificed)`, cards: cands, min: e.upTo ? 0 : k, max: k, data: { ctx: 'resolve' } });
      return 'wait';
    }
    (st.keep[p] ??= []).push(...cands);
    st.pi++;
  }
  // sacrifice everything else at once
  const doomed: string[] = [];
  for (const p of st.ps) for (const b of mine(p)) if (!(st.keep[p] ?? []).includes(b)) doomed.push(b);
  for (const b of doomed) if (s.cards[b]?.zone === 'battlefield') api.moveCard(s, b, 'graveyard', { cause: 'sacrifice' });
  if (doomed.length) api.log(s, `${doomed.length} permanent${doomed.length > 1 ? 's are' : ' is'} sacrificed.`, you);
  return 'done';
};

// "Until end of turn, target creature gets +1/+0 and gains indestructible." → the same with the duration at the end
EXT.rules.push([/^until end of turn, (.+)$/, (m, ctx) => {
  if (/\buntil end of turn\b|\bthis turn\b/.test(m[1])) return null;
  const n = ctx.specs.length;
  const out = parseSentence(`${m[1]} until end of turn`, ctx);
  if (!out || out.some((e: any) => e.k === 'manual')) { ctx.specs.length = n; return null; }
  return out;
}]);

// "Target creature becomes a blue Shark with base power and toughness 4/4 (until end of turn)."
// "Target creature loses all abilities and has base power and toughness 1/1 until end of turn."
// "… loses all abilities and becomes a blue Frog with base power and toughness 1/1"
const COLORW: Record<string, string> = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };
EXT.rules.push([/^(.+?) (loses all abilities and )?(?:becomes an? ([a-z ]+?) with|has) base power and toughness (\d+)\/(\d+)( until end of turn)?$/, (m, ctx) => {
  if (!m[2] && !m[3]) return null;
  const n = ctx.specs.length;
  const what = parseSubject(m[1], ctx);
  if (!what) { ctx.specs.length = n; return null; }
  const eot = !!m[6];
  const out: any[] = [];
  if (m[2]) out.push({ k: 'loseAbilities', what, eot });
  if (m[3]) {
    const words = m[3].split(' ');
    const colors = words.filter((w) => w in COLORW).map((w) => COLORW[w]);
    const subs = words.filter((w) => !(w in COLORW) && w !== 'creature');
    if (subs.some((w) => !SUBTYPES.has(w))) { ctx.specs.length = n; return null; }
    out.push({ k: 'ext', name: 'becomeKind', what, colors, subtypes: subs, eot });
  }
  out.push({ k: 'setPT', what, p: +m[4], t: +m[5], eot });
  return out;
}]);
EXT.effects.becomeKind = ({ s, item, e, api }) => {
  for (const c of api.subjCards(s, item, e.what)) {
    if (s.cards[c]?.zone !== 'battlefield') continue;
    s.cards[c].mods.push({ until: e.eot ? 'eot' : 'permanent', ts: s.ts++, ...(e.colors.length ? { colors: e.colors } : {}), setSubtypes: e.subtypes } as any);
  }
  return 'done';
};

// "~ deals 3 damage divided as you choose among one, two, or three target attacking or blocking creatures / creatures with flying …"
EXT.rules.push([/^(~|it) deals (\d+|x) damage divided as you choose among (one, two, or three|one or two|any number of) target (.+)$/, (m, ctx) => {
  let ph = m[4].replace(/ and\/or /g, ' or ').replace(/creatures/g, 'creature').replace(/planeswalkers/g, 'planeswalker');
  let aob = false;
  if (/^attacking or blocking /.test(ph)) { aob = true; ph = ph.replace(/^attacking or blocking /, ''); }
  const f0 = looseFilter(ph);
  if (!f0) return null;
  const f: any = strip(f0);
  if (aob) f.attackingOrBlocking = true;
  const max = m[3] === 'one or two' ? 2 : m[3] === 'one, two, or three' ? 3 : 20;
  ctx.specs.push({ ...spec(f, max, false, 'targets (divide damage)', null), divided: true });
  return [{ k: 'damage', n: m[2] === 'x' ? 'X' : +m[2], to: [{ t: 'target', spec: ctx.specs.length - 1 }], from: { t: 'self' } }];
}]);

// "~ deals 3 damage to any target. ~ deals 5 damage instead if a creature died this turn."
// "Put two +1/+1 counters on that creature. Put three +1/+1 counters on that creature instead if …"
// The condition is checked once; then either the replacement or the original happens.
let flagN = 0;
EXT.seqs.push((sents, i, ctx, ab) => {
  let m = sents[i + 1]?.match(/^(.+?) instead if (.+)$/);
  if (!m) { const k = sents[i + 1]?.match(/^if (.+?), instead (.+)$/) ?? sents[i + 1]?.match(/^if (.+?), (.+) instead$/); if (k) m = [k[0], k[2], k[1]] as any; }
  if (!m) return null;
  const cond = parseCond(m[2]);
  if (!cond) return null;
  const n0 = ctx.specs.length;
  const base = parseSentence(sents[i], ctx);
  if (!base || base.some((e: any) => e.k === 'manual')) { ctx.specs.length = n0; return null; }
  const n1 = ctx.specs.length;
  // "~ deals 5 damage instead" — same recipients as the first sentence
  const dm = m[1].match(/^(?:~|it) deals (\d+|x) damage$/);
  const alt = dm ? (base.length === 1 && base[0].k === 'damage' ? [{ ...base[0], n: dm[1] === 'x' ? 'X' : +dm[1] }] : null) : parseSentence(m[1], ctx);
  if (!alt || alt.some((e: any) => e.k === 'manual')) { ctx.specs.length = n0; return null; }
  if (ctx.specs.length !== n1) {
    // the kicked version has its own targets ("If this spell was kicked, instead destroy target creature"):
    // only the matching set is chosen as the spell is cast
    const key = cond.k === 'ext' && cond.name === 'kickedAny' ? 'kicked' : cond.k === 'ext' && cond.name === 'castFlag' && cond.flag === 'giftPromised' ? 'gift' : null;
    if (!key) { ctx.specs.length = n0; return null; }
    for (let k = n0; k < n1; k++) ctx.specs[k] = { ...ctx.specs[k], castIf: { [key]: false } } as any;
    for (let k = n1; k < ctx.specs.length; k++) ctx.specs[k] = { ...ctx.specs[k], castIf: { [key]: true } } as any;
  }
  const id = `i${++flagN}`;
  ab.effects.push({ k: 'ext', name: 'setFlag', id, cond });
  ab.effects.push({ k: 'if', cond: { k: 'itemFlag', id }, effects: alt });
  ab.effects.push({ k: 'if', cond: { k: 'itemFlag', id, not: true }, effects: base });
  return 1;
});
EXT.effects.setFlag = ({ s, item, e, you, api }) => {
  ((item as any).flags ??= {})[e.id] = api.evalCond(s, e.cond, you, item.source, { x: (item as any).x });
  return 'done';
};

// "Any number of target creatures each get +1/+1 …" / "Two target creatures each gain …": drop the "each"
EXT.rules.push([/^(.+? target .+?) each (gets?|gains?|deals?|gain|get) (.+)$/, (m, ctx) => {
  const n = ctx.specs.length;
  const out = parseSentence(`${m[1]} ${m[2]} ${m[3]}`, ctx);
  if (!out || out.some((e: any) => e.k === 'manual')) { ctx.specs.length = n; return null; }
  return out;
}]);

// "If the gift was promised, ~ also deals 3 damage to that creature's controller." — "also" adds nothing to the meaning
EXT.rules.push([/^(.+?) also (.+)$/, (m, ctx) => {
  const n = ctx.specs.length;
  const out = parseSentence(`${m[1]} ${m[2]}`, ctx);
  if (!out || out.some((e: any) => e.k === 'manual')) { ctx.specs.length = n; return null; }
  return out;
}]);

// "~ deals damage to that player equal to …" → "~ deals damage equal to … to that player"
EXT.rules.push([/^(~|it|that creature) deals damage to (.+?) equal to (.+)$/, (m, ctx) => {
  const n = ctx.specs.length;
  const out = parseSentence(`${m[1]} deals damage equal to ${m[3]} to ${m[2]}`, ctx);
  if (!out || out.some((e: any) => e.k === 'manual')) { ctx.specs.length = n; return null; }
  return out;
}]);

// "~ gets +1/+1 until end of turn and deals 1 damage to you." / "… and can attack this turn as though it didn't have defender."
EXT.rules.push([/^(~|it|target creature(?: you control)?) gets ([+-]\d+|[+-]x)\/([+-]\d+|[+-]x) until end of turn and (deals .+|can attack this turn as though it didn't have defender|gains .+ until end of turn)$/, (m, ctx) => {
  const n = ctx.specs.length;
  const a = parseSentence(`${m[1]} gets ${m[2]}/${m[3]} until end of turn`, ctx);
  const subj = m[1] === '~' ? '~' : 'it';
  const b = a ? parseSentence(`${subj} ${m[4]}`, ctx) : null;
  if (!a || !b || [...a, ...b].some((e: any) => e.k === 'manual')) { ctx.specs.length = n; return null; }
  return [...a, ...b];
}]);
// "~ gets +1/-1 or -1/+1 until end of turn."
EXT.rules.push([/^(~|target creature|it) gets ([+-]\d+)\/([+-]\d+) or ([+-]\d+)\/([+-]\d+) until end of turn$/, (m, ctx) => {
  const what = m[1] === '~' ? { t: 'self' } : parseSubject(m[1], ctx);
  return what ? [{ k: 'ext', name: 'pumpChoice', what, a: [+m[2], +m[3]], b: [+m[4], +m[5]] }] : null;
}]);
EXT.effects.pumpChoice = ({ s, item, e, r, you, api }) => {
  if (!r.sub) {
    r.sub = {};
    const f = (x: number[]) => `${x[0] >= 0 ? '+' : ''}${x[0]}/${x[1] >= 0 ? '+' : ''}${x[1]}`;
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'yesno', title: `${item.label}: choose`, options: [{ id: 'yes', label: f(e.a) }, { id: 'no', label: f(e.b) }], data: { ctx: 'resolve' } });
    return 'wait';
  }
  const [p, t] = r.sub.answered === 'no' ? e.b : e.a;
  for (const c of api.subjCards(s, item, e.what)) if (s.cards[c]?.zone === 'battlefield') s.cards[c].mods.push({ power: p, toughness: t, until: 'eot', ts: s.ts++ } as any);
  return 'done';
};
// counting phrases: "for each oil counter on it", "for each experience counter you have", "for each poison counter your opponents have"
EXT.amountPhrases.push((ph) => {
  let m = ph.match(/^([+-]\d\/[+-]\d|[a-z]+) counters? on (?:it|~)$/);
  if (m) return { ext: 'selfCounters', counter: m[1] };
  m = ph.match(/^([a-z]+) counters? (you|your opponents|each opponent) (?:have|has)$/);
  if (m) return { ext: 'playerCounters', counter: m[1], who: m[2] === 'you' ? 'you' : 'opp' };
  return null;
});
EXT.amounts.playerCounters = (s, a, you) => {
  const ps = a.who === 'you' ? [s.players[you]] : s.players.filter((p) => p.idx !== you);
  return ps.reduce((t, p: any) => t + (a.counter === 'poison' ? p.poison ?? 0 : p.counters?.[a.counter] ?? 0), 0);
};

// "You may have it deal damage equal to its power to target creature." → "it deals …" (the "may" is the core's)
const CONJ: Record<string, string> = { deal: 'deals', fight: 'fights', lose: 'loses', discard: 'discards', shuffle: 'shuffles', block: 'blocks', gain: 'gains', get: 'gets', draw: 'draws', mill: 'mills', sacrifice: 'sacrifices', create: 'creates', return: 'returns', search: 'searches', put: 'puts' };
EXT.rules.push([/^(?:you may )?have (.+?) (deal|fight|lose|discard|shuffle|block|gain|get|draw|mill|sacrifice|create) (.+)$/, (m, ctx) => {
  const n = ctx.specs.length;
  const out = parseSentence(`${m[1]} ${CONJ[m[2]]} ${m[3]}`, ctx);
  if (!out || out.some((e: any) => e.k === 'manual')) { ctx.specs.length = n; return null; }
  return out;
}]);

// "Mill three cards. You may put a land card from among them / the milled cards / the cards milled this way into your hand."
const PICK = /^(?:you may )?(?:put|return) (a|an|up to one|up to two|one) (.+?) cards? from among (them|the milled cards|the cards milled this way|cards milled this way) (into your hand|onto the battlefield(?: tapped)?)$/;
// "from among them" only right after a mill
EXT.seqs.push((sents, i, ctx, ab) => {
  if (!/^(?:you )?mills? (?:\w+) cards?$/.test(sents[i]) || !PICK.test(sents[i + 1] ?? '')) return null;
  const a = parseSentence(sents[i], ctx);
  const m = (sents[i + 1] ?? '').match(PICK)!;
  const b = pickRule(m);
  if (!a || !b) return null;
  const may = /^you may /.test(sents[i + 1]);
  ab.effects.push(...a, ...(may ? [{ k: 'may', effects: b, text: sents[i + 1] }] : b));
  return 1;
});
EXT.rules.push([PICK, (m) => (m[3] === 'them' ? null : pickRule(m))]);
function pickRule(m: RegExpMatchArray): any[] | null {
  m = [m[0], m[1], m[2], m[4]] as any;
  const f0 = m[2] === 'card' ? {} : looseFilter(m[2]);
  if (!f0) return null;
  const filter: any = { ...f0 };
  delete filter.zone;
  return [{ k: 'ext', name: 'pickMilled', filter, n: /two/.test(m[1]) ? 2 : 1, dest: m[3].startsWith('into') ? 'hand' : 'battlefield', tapped: /tapped/.test(m[3]) }];
}
EXT.effects.pickMilled = ({ s, item, e, r, you, api }) => {
  const cands = (((item as any).milled ?? []) as string[]).filter((c) => s.cards[c]?.zone === 'graveyard' && (!Object.keys(e.filter).length || api.matchesFilter(s, c, { ...e.filter, zone: 'graveyard' }, you, item.source)));
  if (!r.sub) {
    if (!cands.length) return 'done';
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'chooseCards', title: `${item.label}: choose ${e.n === 1 ? 'a card' : `up to ${e.n}`}`, cards: cands, min: 0, max: Math.min(e.n, cands.length), data: { ctx: 'resolve' } });
    return 'wait';
  }
  for (const c of r.sub.answer ?? []) if (s.cards[c]?.zone === 'graveyard') api.moveCard(s, c, e.dest, e.dest === 'battlefield' ? { controller: you, tapped: e.tapped } : {});
  return 'done';
};

// "Choose target creature." / "Choose target creature you control and target creature an opponent controls."
// Later sentences say "that creature", "the creature you control", "the creature an opponent controls".
EXT.rules.push([/^choose (target .+?)(?: and ((?:another )?target .+))?$/, (m, ctx) => {
  const n = ctx.specs.length;
  const a = parseSubject(m[1], ctx);
  const b = m[2] ? parseSubject(m[2], ctx) : null;
  if (!a || (m[2] && !b)) { ctx.specs.length = n; return null; }
  const named: Record<string, any> = (ctx.named ??= {});
  for (const [ph, s] of [[m[1], a], [m[2], b]] as [string, any][]) {
    if (!ph || !s) continue;
    const rest = ph.replace(/^(?:another )?target /, '');
    named[`the ${rest}`] = s;
    if (/^player|^opponent/.test(rest)) named[`the ${rest.split(' ')[0]}`] = s;
  }
  ctx.last = a;
  if (b) ctx.pair = [a, b];
  if (/^target (?:player|opponent)$/.test(m[1])) ctx.lastPlayer = a;
  return [];
}]);
EXT.rules.push([/^(?:then )?those creatures fight each other$/, (_m, ctx) => (ctx.pair ? [{ k: 'fight', a: ctx.pair[0], b: ctx.pair[1] }] : null)]);
EXT.rules.push([/^(the creature (?:you control|an opponent controls|you don't control)) deals damage equal to its power to (.+)$/, (m, ctx) => {
  const from = parseSubject(m[1], ctx);
  const n = ctx.specs.length;
  const to = from ? parseSubject(m[2], ctx) : null;
  if (!from || !to) { ctx.specs.length = n; return null; }
  return [{ k: 'damage', n: { power: from }, to: [to], from }];
}]);

// "Creatures you control gain trample and get +X/+X until end of turn, where X is …" (Craterhoof) — swap the halves
EXT.rules.push([/^(.+?) (gains?) (.+?) and (gets?) ([+-][\dx]+\/[+-][\dx]+) until end of turn(, where x is .+)?$/, (m, ctx) => {
  const n = ctx.specs.length;
  const out = parseSentence(`${m[1]} ${m[4]} ${m[5]} and ${m[2]} ${m[3]} until end of turn${m[6] ?? ''}`, ctx);
  if (!out || out.some((e: any) => e.k === 'manual')) { ctx.specs.length = n; return null; }
  return out;
}]);

// "That player discards a card and you untap all lands you control." — two subjects joined by "and"
EXT.rules.push([/^((?:that player|target player|target opponent|each opponent|each player|you) .+?) and ((?:you|that player|each opponent|each player|its controller) .+)$/, (m, ctx) => {
  const n = ctx.specs.length;
  if (/^that player /.test(m[1]) && !ctx.lastPlayer) ctx.lastPlayer = { t: 'triggerPlayer' };
  const ok = (x: any[] | null) => !!x && !x.some((e: any) => e.k === 'manual');
  const a = parseSentence(m[1], ctx);
  let b = ok(a) ? parseSentence(m[2], ctx) : null;
  if (ok(a) && !ok(b) && /^you /.test(m[2])) b = parseSentence(m[2].replace(/^you /, ''), ctx);
  if (!ok(a) || !ok(b)) { ctx.specs.length = n; return null; }
  return [...a!, ...b!];
}]);
// "Choose any target." … "~ deals damage equal to … to that permanent or player."
EXT.rules.push([/^choose any target$/, (_m, ctx) => {
  const a = parseSubject('any target', ctx);
  if (!a) return null;
  const named: Record<string, any> = (ctx.named ??= {});
  named['that permanent or player'] = a; named['that creature or player'] = a; named['the target'] = a;
  return [];
}]);
