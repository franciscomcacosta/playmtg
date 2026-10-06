// Plugin: "The next time … would deal damage … this turn, …" one-shot shields (Circle of Protection, Rune of
// Protection, Dark Sphere, Pilgrim of Justice, Awe Strike, Mercenaries, Beacon of Destiny, Opal-Eye, Reflect Damage,
// Kithkin Armor, General's Regalia, Aegis of Honor …).
import { EXT } from '../ext';
import { looseFilter, parseAmtPhrase, parseCond, parseKeywordList, parsePlayerSubject, parseSentence, parseSubject, spec } from '../oracle';
import { spellF } from './events2';
import { matchesFilter, sourcesWith } from '../rules';
import { addGeneric, reduceGeneric } from './costs';

const srcFilter = (x: string): any | null => {
  x = x.trim();
  if (!x) return {};
  const CW: any = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };
  const ws = x.split(' or ');
  if (ws.every((w) => CW[w])) return { colors: ws.map((w) => CW[w]) };
  return looseFilter(x);
};
const WHO = /^(?:an? ((?:[\w-]+(?: or [\w-]+)? )?)source of your choice|an? (artifact source|creature|instant or sorcery spell) of your choice|(an instant or sorcery spell)|(target creature|that creature|~|it|enchanted creature))$/;
let nd = 0;
EXT.seqs.push((sents, i, ctx, ab) => {
  const m = sents[i].match(/^the next time (.+?) would deal (combat )?damage(?: to (you|you and\/or creatures you control|~|target creature|enchanted creature|target creature you control|an opponent))? this turn, (.+)$/);
  if (!m) return null;
  const w = m[1].match(WHO);
  if (!w) return null;
  const k0 = ctx.specs.length;
  const fail = () => { ctx.specs.length = k0; return null; };
  const who: any = {};
  if (w[1] !== undefined) { const f = srcFilter(w[1].replace(/ $/, '')); if (!f) return fail(); who.choose = f; }
  else if (w[2]) { const f = srcFilter(w[2].replace(/ source$/, '')); if (!f) return fail(); who.choose = { ...f, zone: undefined }; }
  else if (w[3]) who.filter = { types: ['instant', 'sorcery'] };
  else { const sj = w[4] === '~' ? { t: 'self' } : parseSubject(w[4], ctx); if (!sj) return fail(); who.subj = sj; }
  let to: any = null;
  if (m[3] === 'you') to = { you: true };
  else if (m[3] === 'an opponent') to = { opp: true };
  else if (m[3] === 'you and/or creatures you control') to = { youMine: true };
  else if (m[3] === '~') to = { subj: { t: 'self' } };
  else if (m[3]) { const sj = parseSubject(m[3], ctx); if (!sj) return fail(); to = { subj: sj }; }
  const r = m[4];
  let res: any = null;
  let rm: RegExpMatchArray | null;
  if (r === 'prevent that damage') res = { prevent: 'all' };
  else if (r === 'prevent half that damage, rounded down') res = { prevent: 'halfDown' };
  else if (r === 'prevent all but 1 of that damage') res = { prevent: 'allBut1' };
  else if (r === 'that damage is dealt to ~ instead' || r === "that damage is dealt to ~ instead") res = { redirect: { t: 'self' } };
  else if (r === "that damage is dealt to that source's controller instead" || r === "that spell deals that damage to its controller instead") res = { reflect: true };
  else if (r === 'that source deals that damage to you instead' || r === 'it deals that damage to you instead') res = { toYou: true };
  else if ((rm = r.match(/^(?:that damage is dealt to|it deals that damage to) (target creature you control|target creature|any target) instead$/))) { const sj = parseSubject(rm[1], ctx); if (!sj) return fail(); res = { redirect: sj }; }
  if (!res) return fail();
  let n = 1;
  if (res.prevent && /^you gain life equal to the damage prevented this way$/.test(sents[i + 1] ?? '')) { res.gain = true; n = 2; }
  ab.effects.push({ k: 'ext', name: 'nextDmg', id: `nd${++nd}`, who, to, res, combat: !!m[2] } as any);
  return n;
});

EXT.effects.nextDmg = ({ s, item, e, r, you, api }) => {
  const rec: any = { turn: s.turn, you, from: item.source, combat: e.combat, res: { ...e.res } };
  if (e.who.choose) {
    const pool = [...s.battlefield, ...s.stack.filter((x: any) => x.kind === 'spell').map((x: any) => x.source)]
      .filter((c: string, k: number, a: string[]) => a.indexOf(c) === k && api.matchesFilter(s, c, { ...e.who.choose, zone: s.cards[c].zone }, you));
    if (!pool.length) return 'done';
    if (!r.sub) {
      r.sub = {};
      api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'chooseCards', title: `${item.label}: choose a source`, cards: pool, min: 1, max: 1, data: { ctx: 'resolve' } });
      return 'wait';
    }
    const pick = ((r.sub.answer ?? []) as string[]).find((c) => pool.includes(c));
    if (!pick) return 'done';
    rec.src = pick;
  } else if (e.who.subj) {
    const c = api.subjCards(s, item, e.who.subj)[0];
    if (!c) return 'done';
    rec.src = c;
  } else rec.filter = e.who.filter;
  if (e.to?.you) rec.to = `p${you}`;
  else if (e.to?.opp) rec.to = `p${1 - you}`;
  else if (e.to?.youMine) rec.toMine = true;
  else if (e.to?.selfYou) rec.toAny = [`p${you}`, item.source];
  else if (e.to?.subj) { const c = api.subjCards(s, item, e.to.subj)[0]; if (!c) return 'done'; rec.to = c; }
  if (e.res.redirect) {
    const t = e.res.redirect.spec !== undefined ? (item.targets[e.res.redirect.spec] ?? [])[0] : null;
    if (t?.kind === 'player') rec.res.redirect = `p${t.idx}`;
    else { const c = api.subjCards(s, item, e.res.redirect)[0]; if (!c) return 'done'; rec.res.redirect = c; }
  }
  ((s as any).nextDmg ??= []).push(rec);
  return 'done';
};

let busy = false;
EXT.hooks.damage.push((s, source, to, n, combat, api) => {
  const list: any[] | undefined = (s as any).nextDmg;
  if (!list?.length || n <= 0 || busy) return n;
  const key = to.kind === 'player' ? `p${to.idx}` : to.kind === 'card' ? to.iid : '';
  for (let k = 0; k < list.length; k++) {
    const rec = list[k];
    if (rec.turn !== s.turn) { list.splice(k--, 1); continue; }
    if (rec.res.redirectN || rec.res.destroyIt) continue;
    if (rec.combat && !combat) continue;
    if (rec.to && rec.to !== key) continue;
    if (rec.toAny && !rec.toAny.includes(key)) continue;
    if (rec.toMine && key !== `p${rec.you}` && !(to.kind === 'card' && s.cards[to.iid]?.controller === rec.you && api.chars(s, to.iid).types.has('creature'))) continue;
    if (rec.src && rec.src !== source) continue;
    if (rec.filter && !api.matchesFilter(s, source, { ...rec.filter, zone: s.cards[source]?.zone }, rec.you)) continue;
    if (!rec.res.keep) list.splice(k, 1);
    const res = rec.res;
    if (res.prevent) {
      const out = res.prevent === 'all' ? 0 : res.prevent === 'halfDown' ? n - Math.floor(n / 2) : Math.min(n, 1);
      api.log(s, `${api.nm(s, rec.from)} prevents ${n - out} damage.`);
      if (res.gain && n - out > 0) api.gainLife(s, rec.you, n - out);
      return out;
    }
    busy = true;
    try {
      if (res.redirect && s.cards[res.redirect]?.zone === 'battlefield') { api.log(s, `${api.nm(s, rec.from)}: damage is dealt to ${api.nm(s, res.redirect)} instead.`); api.dealDamage(s, source, { kind: 'card', iid: res.redirect }, n, combat); return 0; }
      if (res.toYou) { api.dealDamage(s, source, { kind: 'player', idx: rec.you }, n, combat); return 0; }
      if (res.redirect && /^p\d$/.test(res.redirect)) { api.dealDamage(s, source, { kind: 'player', idx: +res.redirect.slice(1) }, n, combat); return 0; }
      if (res.reflect) { const c = s.cards[source]?.controller; if (c !== undefined) { api.dealDamage(s, source, { kind: 'player', idx: c }, n, combat); return 0; } }
    } finally { busy = false; }
    return n;
  }
  return n;
});
EXT.hooks.step.push((s) => { if ((s as any).nextDmg?.length) (s as any).nextDmg = (s as any).nextDmg.filter((x: any) => x.turn === s.turn); });

// "The next time damage would be dealt to ~ this turn, that damage is dealt to any target instead." (Mirrorwood Treefolk)
// "The next time damage would be dealt to target creature this turn, destroy that creature instead." (Kill-Suit Cultist)
EXT.seqs.push((sents, i, ctx, ab) => {
  const m = sents[i].match(/^the next time damage would be dealt to (~|target creature|~ and\/or you) this turn, (.+)$/);
  if (!m) return null;
  const k0 = ctx.specs.length;
  const fail = () => { ctx.specs.length = k0; return null; };
  const to = m[1] === '~' ? { subj: { t: 'self' } } : m[1] === '~ and/or you' ? { selfYou: true } : { subj: parseSubject(m[1], ctx) };
  if (to.subj === null) return fail();
  let res: any = null;
  let rm: RegExpMatchArray | null;
  if ((rm = m[2].match(/^that damage is dealt to (any target|target creature) instead$/))) { const sj = parseSubject(rm[1], ctx); if (!sj) return fail(); res = { redirect: sj }; }
  else if (m[2] === 'destroy that creature instead') res = { destroyIt: true };
  if (!res) return fail();
  ab.effects.push({ k: 'ext', name: 'nextDmg', who: {}, to, res, combat: false } as any);
  return 1;
});
EXT.hooks.damage.push((s, source, to, n, _c, api) => {
  const list: any[] | undefined = (s as any).nextDmg;
  if (!list?.length || n <= 0 || to.kind !== 'card') return n;
  const k = list.findIndex((r: any) => r.turn === s.turn && r.res.destroyIt && r.to === to.iid);
  if (k < 0) return n;
  list.splice(k, 1);
  api.destroy(s, to.iid);
  return 0;
});

// "The next time you would draw a card this turn, <effect> instead." (Words of Worship / War / Waste / Wilding / Wind)
EXT.rules.push([/^the next time you would draw a card this turn, (.+) instead$/, (m, ctx) => {
  const sub = { ...ctx, specs: [] as any[] } as any;
  const eff = parseSentence(m[1], sub);
  if (!eff || eff.some((e: any) => e.k === 'manual')) return null;
  return [{ k: 'ext', name: 'nextDraw', effects: eff, specs: sub.specs }];
}]);
EXT.effects.nextDraw = ({ s, item, e, you }) => {
  ((s as any).nextDraw ??= []).push({ turn: s.turn, p: you, source: item.source, label: item.label, effects: e.effects, specs: e.specs });
  return 'done';
};
EXT.hooks.draw.push((s, p, api) => {
  const list: any[] | undefined = (s as any).nextDraw;
  if (!list?.length) return undefined;
  const k = list.findIndex((r: any) => r.turn === s.turn && r.p === p);
  if (k < 0) return undefined;
  const r = list.splice(k, 1)[0];
  api.log(s, `${r.label}: replaces a draw.`, p);
  s.pendingTriggers.push({ id: api.uid(s, 's'), kind: 'trigger', controller: p, source: r.source, label: r.label, text: 'Instead of drawing …', effects: JSON.parse(JSON.stringify(r.effects)), specs: r.specs, targets: [] } as any);
  return 'skip';
});

// "You may have ~ deal 3 damage to any target." / "… fight another target creature" / "… become a 3/3 … until end of turn"
const CONJ: Record<string, string> = { deal: 'deals', fight: 'fights', become: 'becomes', gain: 'gains', get: 'gets', lose: 'loses', return: 'returns' };
EXT.rules.push([/^have (~|it|that creature|target creature) (deal|fight|become|gain|get|lose) (.+)$/, (m, ctx) => {
  const k0 = ctx.specs.length;
  const inner = parseSentence(`${m[1]} ${CONJ[m[2]]} ${m[3]}`, ctx);
  if (!inner || inner.some((e: any) => e.k === 'manual')) { ctx.specs.length = k0; return null; }
  return inner;
}]);

// "if you control at least five other Mountains" → "five or more other Mountains"
EXT.expand.push((line) => {
  if (!/\b(?:controls?|have|has) at least (?:one|two|three|four|five|six|seven|eight|nine|ten|\d+) (?!life\b)/.test(line)) return null;
  return [line.replace(/\b(controls?|have|has) at least (one|two|three|four|five|six|seven|eight|nine|ten|\d+) (?!life\b)/g, '$1 $2 or more ')];
});

// "At the beginning of your upkeep and whenever you cast a black spell, put a charge counter on ~." → two triggers
EXT.expand.push((line) => {
  const m = line.match(/^(at the beginning of [^,]+?) and (whenever [^,]+), (.+)$/);
  return m ? [`${m[1]}, ${m[3]}`, `${m[2]}, ${m[3]}`] : null;
});
// Two-player: "if a player has more life than each opponent, the player with the most life gains control of ~"
EXT.expand.push((line) => {
  const m = line.match(/^(.+?), if a player (has more life|has more cards in hand|controls more (\w+)) than each opponent, the player (?:with|who has|who controls) the most (?:life|cards in hand|\w+) gains control of ~$/);
  if (!m) return null;
  return [`${m[1]}, if an opponent ${m[2]} than you, an opponent gains control of ~`];
});

// Tribute N: an opponent may put N +1/+1 counters on it as it enters. Approximated on the card's own ETB trigger:
// "When ~ enters, if tribute wasn't paid, X" asks the opponent first, then checks.
EXT.expand.push((line) => {
  const m = line.match(/^when ~ enters, if tribute wasn't paid, (.+)$/);
  return m ? [`when ~ enters, an opponent may pay tribute. if tribute wasn't paid, ${m[1]}`] : null;
});
EXT.rules.push([/^an opponent may pay tribute$/, () => [{ k: 'ext', name: 'tribute' }]]);
EXT.conds.push((t) => (t === "tribute wasn't paid" ? { k: 'ext', name: 'tributeNo' } : null));
EXT.condEval.tributeNo = (s, _c, _you, self) => !(self && (s.cards[self] as any)?.tributePaid);
EXT.effects.tribute = ({ s, item, r, you, api }) => {
  const c: any = s.cards[item.source];
  if (!c || c.zone !== 'battlefield' || c.tributeAsked) return 'done';
  const n = (api.parsedFor(s, c).kwArgs as any)?.tribute ?? 1;
  const opp = 1 - you;
  if (!r.sub) {
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: opp, kind: 'yesno', title: `Tribute ${n}: put ${n} +1/+1 counter${n > 1 ? 's' : ''} on ${api.nm(s, item.source)}? (otherwise its ability happens)`, options: [{ id: 'yes', label: 'Pay tribute' }, { id: 'no', label: 'Decline' }], data: { ctx: 'resolve' } });
    return 'wait';
  }
  c.tributeAsked = true;
  if (r.sub.answered === 'yes') { c.tributePaid = true; api.addCounters(s, item.source, '+1/+1', n); api.log(s, `${api.pname(s, opp)} pays tribute.`, opp); }
  else api.log(s, `${api.pname(s, opp)} declines the tribute.`, opp);
  return 'done';
};

// "When ~ enters untapped, …"
EXT.expand.push((line) => {
  const m = line.match(/^when ~ enters untapped, (.+)$/);
  return m ? [`when ~ enters, if it's untapped, ${m[1]}`] : null;
});
EXT.amountPhrases.push((ph) => (/^(?:each )?mana from a treasure spent to cast (?:it|~)$/.test(ph) ? { ext: 'treasureSpentN' } : null));
EXT.amounts.treasureSpentN = (s, _a, _you, self) => (self && (s.cards[self] as any)?.treasureSpent) || 0;
// "Prevent all combat damage that would be dealt this turn if {W} was spent to cast ~." (trailing mana-spent condition)
EXT.rules.push([/^(.+) if ((?:\{[wubrg]\}|at least \w+ \w+ mana) was spent to cast (?:~|it|this spell))$/, (m, ctx) => {
  const cond = parseCond(m[2]);
  if (!cond) return null;
  const k0 = ctx.specs.length;
  const inner = parseSentence(m[1], ctx);
  if (!inner || inner.some((e: any) => e.k === 'manual')) { ctx.specs.length = k0; return null; }
  return [{ k: 'if', cond, effects: inner } as any];
}]);

// "If at least three white mana was spent to cast ~, ~ enters with a +1/+1 counter on it." / "If you control a Forest, …"
EXT.lines.push((line, pc) => {
  const m = line.match(/^if (.+?), (?:~|it) enters with (a|an|one|two|three|four|five) (\S+|\+1\/\+1) counters? on it$/);
  if (!m) return false;
  const cond = parseCond(m[1]);
  if (!cond) return false;
  const n = ({ a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 } as any)[m[2]];
  (pc.entersCounters ??= []).push({ counter: m[3], n, cond } as any);
  return true;
});

// "Whenever you cast an instant or sorcery spell from your hand / from your graveyard / during your turn, …"
EXT.triggers.push((cond) => {
  const m = cond.match(/^whenever (you|an opponent) casts? (an? .+? spell|a spell)(?: with mana value (\d+) or greater)? (from your (hand|graveyard|library)|from exile|from anywhere other than your hand|during your turn|during an opponent's turn|during each opponent's turn)$/);
  if (!m) return null;
  const f = m[2] === 'a spell' ? { types: ['spell'] } : spellF(m[2]);
  if (!f) return null;
  if (m[3]) (f as any).cmcMin = +m[3];
  const w = m[4];
  const c: any = w.startsWith('from anywhere') ? { notZone: 'hand' } : w.startsWith('from') ? { zone: m[5] ?? 'exile' } : { turn: w === 'during your turn' ? 'mine' : 'opp' };
  const TO = { t: 'triggerObj' };
  if (m[1] === 'you') return [{ event: 'castSpell', filter: f, last: TO, cond: { k: 'ext', name: 'castWhere', ...c } }];
  return [{ event: 'anyCast', filter: f, data: { who: 'opp' }, last: TO, lastPlayer: { t: 'triggerPlayer' }, cond: { k: 'ext', name: 'castWhere', opp: true, ...c } }];
});
EXT.condEval.castWhere = (s, c, you, _self, ctx) => {
  const o = (ctx as any)?.triggerObj ?? (ctx as any)?.item?.triggerObj;
  if (c.opp) { const tp = (ctx as any)?.triggerPlayer ?? (ctx as any)?.item?.triggerPlayer; if (tp !== undefined && tp === you) return false; }
  if (c.turn) return c.turn === 'mine' ? s.active === you : s.active !== you;
  const from = o ? (s.cards[o] as any)?.castFrom : undefined;
  if (from === undefined) return true;
  return c.notZone ? from !== c.notZone : from === c.zone;
};

// "If damage would be dealt to ~[ while you're the monarch], prevent that damage and put that many +1/+1 counters on it."
EXT.lines.push((line, pc) => {
  const m = line.match(/^if damage would be dealt to ~(?: while (.+?))?, prevent that damage and put that many (\+1\/\+1|-1\/-1) counters on (?:it|~)$/);
  if (!m) return false;
  const cond = m[1] ? parseCond(m[1]) : null;
  if (m[1] && !cond) return false;
  (pc as any).selfDmgRepl = { add: m[2], ...(cond ? { cond } : {}) };
  return true;
});
// "If damage would be dealt to you, put that many delay counters on ~ instead." / "… prevent that damage and mill twice that many cards"
EXT.lines.push((line, pc) => {
  let m = line.match(/^if damage would be dealt to you, put that many (\w+) counters on ~ instead$/);
  if (m) { (pc as any).youDmgRepl = { counter: m[1] }; return true; }
  m = line.match(/^if damage would be dealt to you, prevent that damage and mill (twice )?that many cards$/);
  if (m) { (pc as any).youDmgRepl = { mill: m[1] ? 2 : 1 }; return true; }
  return false;
});
EXT.hooks.damage.push((s, _source, to, n, _combat, api) => {
  if (n <= 0 || to.kind !== 'player') return n;
  for (const b of sourcesWith(s, 'youDmgRepl')) {
    if (s.cards[b].controller !== to.idx) continue;
    const r = (api.chars(s, b).pc as any).youDmgRepl;
    if (!r) continue;
    if (r.counter) { api.addCounters(s, b, r.counter, n); api.log(s, `${api.nm(s, b)}: ${n} damage becomes ${r.counter} counters.`); }
    else if (r.mill) { const lib = s.players[to.idx].library; for (const c of lib.slice(0, n * r.mill)) api.moveCard(s, c, 'graveyard'); api.log(s, `${api.nm(s, b)}: damage prevented; ${api.pname(s, to.idx)} mills ${n * r.mill}.`); }
    return 0;
  }
  return n;
});

// Reveal lands: "As ~ enters, you may reveal a Plains or Island card from your hand. If you don't, ~ enters tapped."
// (revealing is always right, so: enters tapped unless such a card is in hand)
EXT.lines.push((line, pc) => {
  const m = line.match(/^as ~ enters, you may reveal (?:a|an) (.+?) card from your hand\. (?:if you don't, ~ enters tapped|~ enters tapped unless you revealed (?:a|an) \w+ card this way or you control (?:a|an) (\w+))$/);
  if (!m) return false;
  const parts = m[1].split(' or ');
  const fs = parts.map((x) => looseFilter(x));
  if (fs.some((f) => !f)) return false;
  const filter = fs.length > 1 ? { anyOf: fs.map((f: any) => ({ ...f, zone: undefined })) } : { ...fs[0], zone: undefined };
  (pc as any).entersTappedIf = { k: 'ext', name: 'noRevealable', filter, ctrl: m[2] ? looseFilter(m[2]) : null };
  return true;
});
EXT.condEval.noRevealable = (s, c, you, self) => {
  if (s.players[you].hand.some((h: string) => h !== self && matchesFilter(s, h, { ...c.filter, zone: 'hand' }, you))) return false;
  if (c.ctrl && s.battlefield.some((b: string) => b !== self && s.cards[b].controller === you && matchesFilter(s, b, { ...c.ctrl, zone: 'battlefield' }, you))) return false;
  return true;
};

// "Enchanted creature gets +2/+2 and is goaded." / "Equipped creature gets +1/+1, has deathtouch, and is goaded."
// (two players: goaded = attacks each combat if able)
EXT.lines.push((line, pc) => {
  const m = line.match(/^(enchanted|equipped) creature (?:gets ([+-]\d+)\/([+-]\d+)(?:,| and)? )?(?:has ([a-z ,]+?),? and )?is goaded$/);
  if (!m) return false;
  const kw = m[4] ? parseKeywordList(m[4]) : [];
  if (!kw) return false;
  pc.statics.push({ kind: 'attachPump', attach: m[1], p: m[2] ? +m[2] : 0, t: m[3] ? +m[3] : 0, kw, mustAttack: true } as any);
  return true;
});

// Arrest / Faith's Fetters / Detention Vortex: "Enchanted creature/permanent can't attack or block, and its activated
// abilities can't be activated[ unless they're mana abilities]."
EXT.lines.push((line, pc) => {
  const m = line.match(/^enchanted (creature|permanent|artifact|planeswalker) (?:can't (attack or block|attack|block), and )?its activated abilities can't be activated( unless they're mana abilities)?$/);
  if (!m) return false;
  if (m[2]) pc.statics.push({ kind: 'attachPump', attach: 'enchanted', p: 0, t: 0, kw: [], cantAttack: m[2].includes('attack'), cantBlock: m[2].includes('block') });
  (pc as any).attachNoAct = { manaOk: !!m[3] };
  return true;
});
EXT.hooks.canActivate.push((s, _p, iid, a, api) => {
  const srcs = sourcesWith(s, 'attachNoAct');
  if (!srcs.length) return undefined;
  for (const b of srcs) {
    if (s.cards[b]?.attachedTo !== iid) continue;
    const r = (api.chars(s, b).pc as any).attachNoAct;
    if (!r || (r.manaOk && a.isMana)) continue;
    return false;
  }
  return undefined;
});

// "Add two mana of different colors." (approximated as two mana in any combination of colors)
EXT.rules.push([/^add (two|three) mana of different colors$/, (m) => [{ k: 'addMana', colors: 'any', n: m[1] === 'two' ? 2 : 3 } as any]]);

// "~ deals 4 damage to target creature. Excess damage is dealt to that creature's controller instead." (Flame Spill)
EXT.seqs.push((sents, i, _ctx, ab) => {
  if (!/^excess damage is dealt to that creature's controller instead$/.test(sents[i])) return null;
  const last: any = ab.effects[ab.effects.length - 1];
  if (!last || last.k !== 'damage' || last.to?.length !== 1 || last.to[0].t !== 'target') return null;
  ab.effects[ab.effects.length - 1] = { k: 'ext', name: 'dmgExcess', n: last.n, to: last.to[0], from: last.from } as any;
  return 1;
});
EXT.effects.dmgExcess = ({ s, item, e, api }) => {
  const n = api.amount(s, item, e.n);
  const t = api.subjCards(s, item, e.to)[0];
  const src = e.from?.t === 'self' || !e.from ? item.source : api.subjCards(s, item, e.from)[0] ?? item.source;
  if (!t || s.cards[t]?.zone !== 'battlefield' || n <= 0) return 'done';
  const ch = api.chars(s, t);
  const dt = s.cards[src] && api.chars(s, src).keywords.has('deathtouch');
  const lethal = Math.max(0, dt ? (s.cards[t].damage > 0 ? 0 : 1) : ch.toughness - (s.cards[t].damage ?? 0));
  const toC = Math.min(n, lethal);
  const ctrl = s.cards[t].controller;
  if (toC > 0) api.dealDamage(s, src, { kind: 'card', iid: t }, toC, false);
  if (n - toC > 0) api.dealDamage(s, src, { kind: 'player', idx: ctrl }, n - toC, false);
  return 'done';
};

// Processors: "You may put a card an opponent owns from exile into that player's graveyard. If you do, …"
EXT.rules.push([/^put a card an opponent owns from exile into that player's graveyard$/, () => [{ k: 'ext', name: 'ingestPut' }]]);
EXT.effects.ingestPut = ({ s, item, r, you, api }) => {
  const pool = (s.players[1 - you] as any).exile?.filter?.((c: string) => s.cards[c]?.owner === 1 - you) ?? Object.keys(s.cards).filter((c) => s.cards[c].zone === 'exile' && s.cards[c].owner === 1 - you);
  if (!pool.length) { (item as any).didLast = false; return 'done'; }
  if (!r.sub) {
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'chooseCards', title: `${item.label}: put a card an opponent owns from exile into their graveyard`, cards: pool, min: 1, max: 1, data: { ctx: 'resolve' } });
    return 'wait';
  }
  const pick = ((r.sub.answer ?? []) as string[]).find((c) => pool.includes(c));
  if (!pick) { (item as any).didLast = false; return 'done'; }
  api.moveCard(s, pick, 'graveyard');
  (item as any).didLast = true;
  return 'done';
};

// Risen Reef: "… If it's a land card, you may put it onto the battlefield tapped. If you don't put the card onto the
// battlefield, put it into your hand." → the dig's rest goes to hand
EXT.seqs.push((sents, i, _ctx, ab) => {
  if (!/^if you don't put the card onto the battlefield, put it into your hand$/.test(sents[i])) return null;
  const last: any = ab.effects[ab.effects.length - 1];
  if (!last || last.k !== 'dig' || last.spec?.pick?.dest !== 'battlefield') return null;
  last.spec.rest = 'hand';
  return 1;
});

// "The next 1 damage that would be dealt to ~ this turn is dealt to target creature you control instead." (en-Kor)
// "The next 3 damage that would be dealt to target creature you control this turn is dealt to another target creature instead."
EXT.rules.push([/^the next (\w+) damage that would be dealt to (~|target (?:white )?creature(?: you control)?) this turn is dealt to (~|target creature you control|another target creature|its owner) instead$/, (m, ctx) => {
  const n = m[1] === 'x' ? 'X' : ({ one: 1, two: 2, three: 3 } as any)[m[1]] ?? (/^\d+$/.test(m[1]) ? +m[1] : null);
  if (n == null) return null;
  const k0 = ctx.specs.length;
  const from = m[2] === '~' ? { t: 'self' } : parseSubject(m[2], ctx);
  const to = m[3] === '~' ? { t: 'self' } : m[3] === 'its owner' ? { owner: true } : parseSubject(m[3].replace(/^another /, ''), ctx);
  if (!from || !to) { ctx.specs.length = k0; return null; }
  return [{ k: 'ext', name: 'nextNRedirect', n, from, to }];
}]);
EXT.effects.nextNRedirect = ({ s, item, e, you, api }) => {
  const n = api.amount(s, item, e.n);
  const a = api.subjCards(s, item, e.from)[0];
  if (!a || n <= 0) return 'done';
  const b = e.to.owner ? `p${s.cards[a].owner}` : api.subjCards(s, item, e.to)[0];
  if (!b) return 'done';
  ((s as any).nextDmg ??= []).push({ turn: s.turn, you, from: item.source, to: a, left: n, res: { redirectN: b } });
  return 'done';
};
let busyN = false;
EXT.hooks.damage.push((s, source, to, n, combat, api) => {
  const list: any[] | undefined = (s as any).nextDmg;
  if (!list?.length || n <= 0 || busyN || to.kind !== 'card') return n;
  for (let k = 0; k < list.length && n > 0; k++) {
    const rec = list[k];
    if (!rec.res.redirectN || rec.turn !== s.turn || rec.to !== to.iid) continue;
    const moved = Math.min(rec.left, n);
    rec.left -= moved;
    n -= moved;
    if (rec.left <= 0) list.splice(k--, 1);
    const dest = rec.res.redirectN as string;
    busyN = true;
    try {
      if (/^p\d$/.test(dest)) api.dealDamage(s, source, { kind: 'player', idx: +dest.slice(1) }, moved, combat);
      else if (s.cards[dest]?.zone === 'battlefield') api.dealDamage(s, source, { kind: 'card', iid: dest }, moved, combat);
    } finally { busyN = false; }
  }
  return n;
});

// "Prevent the next 5 damage that would be dealt this turn to any number of targets, divided as you choose." (Remedy)
EXT.rules.push([/^prevent the next (\d+|x) damage that would be dealt this turn to any number of targets, divided as you choose$/, (m, ctx) => {
  ctx.specs.push({ ...spec({ types: ['creature', 'planeswalker', 'battle'] }, 20, false, 'targets (divide prevention)', 'any'), divided: true } as any);
  return [{ k: 'ext', name: 'preventDivided', n: m[1] === 'x' ? 'X' : +m[1], sp: ctx.specs.length - 1 }];
}]);
EXT.effects.preventDivided = ({ s, item, e, r, you, api }) => {
  const n = api.amount(s, item, e.n);
  const ts = item.targets[e.sp] ?? [];
  if (!ts.length || n <= 0) return 'done';
  let alloc: number[];
  if (ts.length === 1) alloc = [n];
  else {
    if (!r.sub?.answer) {
      r.sub = {};
      api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'divide', title: `Divide ${n} damage prevention among the targets`, targets: ts, min: n, max: n, data: { ctx: 'resolve' } });
      return 'wait';
    }
    alloc = r.sub.answer;
  }
  const shields = ((s as any).prevent ??= []) as { key: string; n: number }[];
  ts.forEach((t: any, i: number) => { const k = alloc[i] ?? 0; if (k > 0) shields.push({ key: t.kind === 'player' ? `p${t.idx}` : t.iid, n: k }); });
  return 'done';
};

// ---- small one-liners ----
// "that many": the triggering event's amount, else the last count
EXT.amounts.thatMany = (_s, _a, _you, _self, ctx: any) => ctx?.item?.evAmount ?? ctx?.item?.lastCount ?? 0;
EXT.rules.push([/^you get that many \{e\}$/, () => [{ k: 'energy', n: { ext: 'thatMany' } } as any]]);
// "One or two target creatures each get +2/+2 until end of turn." → up to two
EXT.rules.push([/^(one or two|one, two, or three) target (.+)$/, (m, ctx) => {
  if (/divided/.test(m[2])) return null;
  const k0 = ctx.specs.length;
  const r = parseSentence(`up to ${m[1] === 'one or two' ? 'two' : 'three'} target ${m[2]}`, ctx);
  if (!r || r.some((e: any) => e.k === 'manual')) { ctx.specs.length = k0; return null; }
  return r;
}]);
// "Target player exiles a card from their graveyard."
EXT.rules.push([/^(target player|target opponent|each opponent|each player) exiles (a|two|three) cards? from their graveyard$/, (m, ctx) => {
  const who = parsePlayerSubject(m[1], ctx);
  return who ? [{ k: 'ext', name: 'exileOwnGy', who, n: ({ a: 1, two: 2, three: 3 } as any)[m[2]] }] : null;
}]);
EXT.effects.exileOwnGy = ({ s, item, e, r, api }) => {
  const ps: number[] = api.subjPlayers(s, item, e.who);
  r.sub ??= { k: 0 };
  while (r.sub.k < ps.length) {
    const p = ps[r.sub.k];
    const gy = s.players[p].graveyard;
    if (!gy.length) { r.sub = { k: r.sub.k + 1 }; continue; }
    if (gy.length <= e.n) { for (const c of [...gy]) api.moveCard(s, c, 'exile'); r.sub = { k: r.sub.k + 1 }; continue; }
    if (!r.sub.asked) {
      r.sub.asked = true;
      api.pushPrompt(s, { id: api.uid(s, 'p'), player: p, kind: 'chooseCards', title: `${item.label}: exile ${e.n} card(s) from your graveyard`, cards: [...gy], min: e.n, max: e.n, data: { ctx: 'resolve' } });
      return 'wait';
    }
    const pick = ((r.sub.answer ?? []) as string[]).filter((c) => gy.includes(c)).slice(0, e.n);
    for (const c of pick.length ? pick : gy.slice(0, e.n)) api.moveCard(s, c, 'exile');
    r.sub = { k: r.sub.k + 1 };
  }
  return 'done';
};
// "Add an amount of {C} equal to the sacrificed creature's mana value."
EXT.rules.push([/^add an amount of \{([wubrgc])\} equal to (.+)$/, (m, ctx) => {
  const n = parseAmtPhrase(m[2], ctx);
  return n == null ? null : [{ k: 'ext', name: 'addManaAmt', color: m[1].toUpperCase(), n }];
}]);
EXT.effects.addManaAmt = ({ s, item, e, you, api }) => {
  const n = api.amount(s, item, e.n);
  if (n > 0) (s.players[you].pool as any)[e.color] += n;
  return 'done';
};
// "Enchanted creature gets -2/-2 and loses all abilities." / "Enchanted creature loses all abilities."
EXT.lines.push((line, pc) => {
  const m = line.match(/^enchanted creature (?:gets ([+-]\d+)\/([+-]\d+) and )?loses all abilities$/);
  if (!m) return false;
  if (m[1]) pc.statics.push({ kind: 'attachPump', attach: 'enchanted', p: +m[1], t: +m[2], kw: [] });
  (pc as any).attachBecome = { loseAbilities: true };
  return true;
});

// "Cast ~ only during the declare blockers step / during combat before|after blockers are declared / after combat /
// during your turn / if <condition>."
const COMBAT_STEPS = ['beginCombat', 'declareAttackers', 'declareBlockers', 'firstStrikeDamage', 'combatDamage', 'endCombat'];
EXT.lines.push((line, pc) => {
  const m = line.match(/^cast ~ only (during the declare blockers step|during the declare attackers step|during combat before blockers are declared|during combat after blockers are declared|during combat on an opponent's turn|after combat|during your turn|during an opponent's turn|if (.+))$/);
  if (!m) return false;
  if (m[2]) {
    let t = m[2];
    if (t === "you've cast another spell this turn") { (pc as any).castWindow = { otherSpell: true }; return true; }
    const c = parseCond(t);
    if (!c) return false;
    (pc as any).castWindow = { cond: c };
    return true;
  }
  (pc as any).castWindow = { w: m[1] };
  return true;
});
EXT.hooks.castBlock.push((s, p, iid, _alt, api) => {
  const w = (api.parsedFor(s, s.cards[iid]) as any).castWindow;
  if (!w) return null;
  const st = s.step as string;
  const ok = w.otherSpell ? ((s.players[p] as any).spellsCastThisTurn ?? 0) > 0
    : w.cond ? api.evalCond(s, w.cond, p, iid)
    : w.w === 'during the declare blockers step' ? st === 'declareBlockers'
    : w.w === 'during the declare attackers step' ? st === 'declareAttackers'
    : w.w === 'during combat before blockers are declared' ? ['beginCombat', 'declareAttackers'].includes(st)
    : w.w === 'during combat after blockers are declared' ? ['declareBlockers', 'firstStrikeDamage', 'combatDamage', 'endCombat'].includes(st)
    : w.w === "during combat on an opponent's turn" ? COMBAT_STEPS.includes(st) && s.active !== p
    : w.w === 'after combat' ? ['main2', 'end', 'cleanup'].includes(st)
    : w.w === 'during your turn' ? s.active === p
    : w.w === "during an opponent's turn" ? s.active !== p : true;
  return ok ? null : `Cast ${api.nm(s, iid)} only ${w.w ?? 'when its condition holds'}`;
});

// "Damage that would reduce your life total to less than 1 reduces it to 1 instead." (Worship, Ali from Cairo, Angel's Grace)
EXT.lines.push((line, pc) => {
  const m = line.match(/^(?:(?:as long as|if) (.+?), )?damage that would reduce your life total to less than (\d+) reduces it to \2 instead$/);
  if (!m) return false;
  const cond = m[1] ? parseCond(m[1]) : null;
  if (m[1] && !cond) return false;
  (pc as any).lifeFloor = { n: +m[2], cond };
  return true;
});
EXT.rules.push([/^until end of turn, damage that would reduce your life total to less than (\d+) reduces it to \1 instead$/, (m) => [{ k: 'ext', name: 'lifeFloorTurn', n: +m[1] }]]);
EXT.effects.lifeFloorTurn = ({ s, e, you }) => { (s.players[you] as any).lifeFloorTurn = { turn: s.turn, n: e.n }; return 'done'; };
EXT.hooks.damage.push((s, _source, to, n, _c, api) => {
  if (n <= 0 || to.kind !== 'player') return n;
  const pl: any = s.players[to.idx];
  let floor = pl.lifeFloorTurn?.turn === s.turn ? pl.lifeFloorTurn.n : -Infinity;
  for (const b of sourcesWith(s, 'lifeFloor')) {
    if (s.cards[b].controller !== to.idx) continue;
    const f = (api.chars(s, b).pc as any).lifeFloor;
    if (f && (!f.cond || api.evalCond(s, f.cond, to.idx, b))) floor = Math.max(floor, f.n);
  }
  if (floor === -Infinity || pl.life - n >= floor) return n;
  return Math.max(0, pl.life - floor);
});

// "You can't lose the game and your opponents can't win the game." (Platinum Angel) / "… this turn" (Angel's Grace)
// "Your opponents can't lose the game" / "Players can't lose the game or win the game" (Abyssal Persecutor, Platinum Persecutor)
EXT.lines.push((line, pc) => {
  const m = line.match(/^(?:as long as (.+?), )?(you can't lose the game(?: and (?:your )?opponents can't win the game)?|you can't win the game and your opponents can't lose the game|players can't lose the game or win the game)$/);
  if (!m) return false;
  const cond = m[1] ? parseCond(m[1]) : null;
  if (m[1] && !cond) return false;
  (pc as any).cantLose = { who: m[2].startsWith('you can\'t lose') ? 'you' : m[2].startsWith('players') ? 'all' : 'opp', cond };
  return true;
});
EXT.rules.push([/^(?:you can't lose the game this turn and your opponents can't win the game this turn|you can't lose the game this turn)$/, () => [{ k: 'ext', name: 'cantLoseTurn' }]]);
EXT.effects.cantLoseTurn = ({ s, you }) => { (s.players[you] as any).cantLoseTurn = s.turn; return 'done'; };
EXT.hooks.cantLose.push((s, p, api) => {
  if ((s.players[p] as any).cantLoseTurn === s.turn) return true;
  for (const b of sourcesWith(s, 'cantLose')) {
    const r = (api.chars(s, b).pc as any).cantLose;
    if (!r) continue;
    const ctrl = s.cards[b].controller;
    if (r.who === 'you' ? ctrl !== p : r.who === 'opp' ? ctrl === p : false) continue;
    if (r.cond && !api.evalCond(s, r.cond, ctrl, b)) continue;
    return true;
  }
  return false;
});

// "You gain 1 life for each creature destroyed this way." / "the number of creatures destroyed this way"
EXT.amountPhrases.push((ph) => (/^(?:the number of )?(?:creatures?|permanents?|lands?|artifacts?|nonland permanents?) destroyed this way$/.test(ph) ? { ext: /creature/.test(ph) ? 'destroyedCreatures' : 'destroyedN' } : null));
EXT.amounts.destroyedN = (_s, _a, _y, _self, ctx: any) => ctx?.item?.destroyedN ?? 0;
EXT.amounts.destroyedCreatures = (_s, _a, _y, _self, ctx: any) => ctx?.item?.destroyedCreatures ?? 0;
EXT.rules.push([/^you gain (\d+) life for each (creature|permanent|land|artifact) destroyed this way$/, (m) => [{ k: 'gain', n: { ext: m[2] === 'creature' ? 'destroyedCreatures' : 'destroyedN', mult: +m[1] }, who: { t: 'you' } } as any]]);

// "That creature is a black Zombie in addition to its other colors and types." (Rise from the Grave, Liliana)
EXT.rules.push([/^(that creature|it) is an? (white|blue|black|red|green) ([a-z]+) in addition to its other colors and types$/, (m, ctx) => {
  const what = ctx.last ?? parseSubject(m[1], ctx);
  if (!what) return null;
  const CW: any = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };
  return [{ k: 'ext', name: 'permAddColorType', what, color: CW[m[2]], sub: m[3] }];
}]);
EXT.effects.permAddColorType = ({ s, item, e, api }) => {
  for (const c of api.subjCards(s, item, e.what)) {
    if (s.cards[c]?.zone !== 'battlefield') continue;
    const cols = [...new Set([...api.chars(s, c).colors, e.color])];
    s.cards[c].mods.push({ colors: cols, addSubtypes: [e.sub], until: 'permanent', source: item.source, ts: s.ts++ } as any);
  }
  return 'done';
};

// "The first creature spell you cast each turn costs {2} less to cast." (Conduit of Ruin, Shadow in the Warp, Radagast)
EXT.lines.push((line, pc) => {
  const m = line.match(/^the first (creature|instant or sorcery|noncreature) spell you cast each turn costs \{(\d+)\} less to cast( and can be cast as though it had flash)?$/);
  if (!m) return false;
  (pc as any).firstCheaper = [...((pc as any).firstCheaper ?? []), { kind: m[1], n: +m[2], flash: !!m[3] }];
  return true;
});
const kindOk = (s: any, iid: string, k: string, api: any) => {
  const t = api.chars(s, iid).types;
  return k === 'creature' ? t.has('creature') : k === 'noncreature' ? !t.has('creature') : t.has('instant') || t.has('sorcery');
};
EXT.hooks.event.push((s, name, d, api) => {
  if (name !== 'cast' || d.item.kind !== 'spell') return;
  const pl: any = s.players[d.item.controller];
  const rec = (pl.castKinds ??= { turn: -1, creature: 0, noncreature: 0, 'instant or sorcery': 0 });
  if (rec.turn !== s.turn) { rec.turn = s.turn; rec.creature = 0; rec.noncreature = 0; rec['instant or sorcery'] = 0; }
  for (const k of ['creature', 'noncreature', 'instant or sorcery']) if (s.cards[d.item.source] && kindOk(s, d.item.source, k, api)) rec[k]++;
});
EXT.hooks.costMod.push((s, p, iid, cost, _alt, api) => {
  const srcs = sourcesWith(s, 'firstCheaper');
  if (!srcs.length) return cost;
  const rec: any = (s.players[p] as any).castKinds;
  let out = cost;
  for (const b of srcs) {
    if (s.cards[b].controller !== p) continue;
    for (const f of (api.chars(s, b).pc as any).firstCheaper ?? []) {
      if ((rec?.turn === s.turn ? rec[f.kind] : 0) > 0 || !kindOk(s, iid, f.kind, api)) continue;
      const g = (out || '').match(/\{(\d+)\}/);
      const gen = g ? +g[1] : 0;
      out = (out || '').replace(/\{\d+\}/, '') ;
      if (gen - f.n > 0) out = `{${gen - f.n}}` + out;
    }
  }
  return out;
});
EXT.hooks.flash.push((s, iid, api) => {
  const p = s.cards[iid]?.controller ?? s.cards[iid]?.owner;
  if (p === undefined) return false;
  const rec: any = (s.players[p] as any).castKinds;
  for (const b of sourcesWith(s, 'firstCheaper')) {
    if (s.cards[b].controller !== p) continue;
    for (const f of (api.chars(s, b).pc as any).firstCheaper ?? []) if (f.flash && !((rec?.turn === s.turn ? rec[f.kind] : 0) > 0) && kindOk(s, iid, f.kind, api)) return true;
  }
  return false;
});

// "If it doesn't have suspend, it gains suspend." (Delay, Jhoira, Suspend, Kang Prime …)
EXT.rules.push([/^if (?:it|that card) doesn't have suspend, it gains suspend$/, (_m, ctx) => [{ k: 'ext', name: 'gainSuspend', what: ctx.last ?? null }]]);
EXT.effects.gainSuspend = ({ s, item, e, api }) => {
  const list: string[] = e.what ? api.subjCards(s, item, e.what) : [];
  const ex: string[] = (item as any).exiledHere ?? [];
  for (const c of [...list, ...ex]) {
    const x: any = s.cards[c];
    if (x?.zone === 'exile' && (x.counters.time ?? 0) > 0) x.suspended = true;
  }
  return 'done';
};
// "Exile target nonland card from your graveyard with two time counters on it." / "Exile that card with three time counters on it."
EXT.rules.push([/^exile (.+?) with (a|one|two|three|four|five) time counters? on it$/, (m, ctx) => {
  const k0 = ctx.specs.length;
  const base = parseSentence(`exile ${m[1]}`, ctx);
  if (!base || base.some((e: any) => e.k === 'manual')) { ctx.specs.length = k0; return null; }
  return [...base, { k: 'ext', name: 'timeOnExiled', n: ({ a: 1, one: 1, two: 2, three: 3, four: 4, five: 5 } as any)[m[2]] }];
}]);
EXT.effects.timeOnExiled = ({ s, item, e }) => {
  for (const c of ((item as any).exiledHere ?? []) as string[]) if (s.cards[c]?.zone === 'exile') s.cards[c].counters.time = (s.cards[c].counters.time ?? 0) + e.n;
  return 'done';
};

// "Target player can't play lands this turn." / "Players can't play lands." / "You can't play lands."
EXT.rules.push([/^(target player|target opponent|each opponent|that player) can't play lands this turn$/, (m, ctx) => {
  const who = parsePlayerSubject(m[1], ctx);
  return who ? [{ k: 'ext', name: 'noLandsTurn', who }] : null;
}]);
EXT.effects.noLandsTurn = ({ s, item, e, api }) => { for (const p of api.subjPlayers(s, item, e.who)) (s.players[p] as any).noLandsTurn = s.turn; return 'done'; };
EXT.lines.push((line, pc) => {
  const m = line.match(/^(players|you|your opponents|each opponent) can't play lands(?: as long as (.+))?$/);
  if (!m) return false;
  const cond = m[2] ? parseCond(m[2]) : null;
  if (m[2] && !cond) return false;
  (pc as any).noLands = { who: m[1] === 'players' ? 'all' : m[1] === 'you' ? 'you' : 'opp', cond };
  return true;
});
EXT.hooks.cantPlayLand.push((s, p, api) => {
  for (const b of sourcesWith(s, 'noLands')) {
    const r = (api.chars(s, b).pc as any).noLands;
    const ctrl = s.cards[b].controller;
    if (r.who === 'you' ? ctrl !== p : r.who === 'opp' ? ctrl === p : false) continue;
    if (r.cond && !api.evalCond(s, r.cond, ctrl, b)) continue;
    return true;
  }
  return false;
});

// Cost changes decided while casting (run just before paying):
//  "This spell costs {2} less to cast if it's bargained." / "~ costs {2} less to cast if it targets an attacking creature."
//  "Spells your opponents cast that target ~ cost {2} more to cast." (Boreal Elemental, Elderwood Scion)
EXT.lines.push((line, pc) => {
  let m = line.match(/^(?:this spell|~) costs \{(\d+)\} less to cast if (it's bargained|it targets (?:an? |one or more )?(.+?))$/);
  if (m) {
    const f = m[3] ? looseFilter(m[3].replace(/^tapped creature$/, 'tapped creature')) : null;
    if (m[3] && !f) return false;
    (pc as any).lateLess = [...((pc as any).lateLess ?? []), { n: +m[1], bargain: !m[3], filter: f ? { ...f, zone: undefined } : null }];
    return true;
  }
  m = line.match(/^spells (your opponents|you) cast that target (~|a creature you control|a permanent you control|you or a permanent you control) cost \{(\d+)\} (more|less) to cast$/);
  if (m) { (pc as any).targetTax = [...((pc as any).targetTax ?? []), { what: m[2], n: +m[3], mine: m[1] === 'you', less: m[4] === 'less' }]; return true; }
  return false;
});
const tgtIds = (pc: any): any[] => (pc.targets ?? []).flat().filter(Boolean);
EXT.hooks.lateCost.push((s, pc, api) => {
  let cost: string = pc.manaCost ?? '';
  const c: any = s.cards[pc.iid];
  if (!c) return undefined;
  const own = (api.parsedFor(s, c) as any).lateLess as any[] | undefined;
  for (const l of own ?? []) {
    const ok = l.bargain ? (pc.extBargain ?? []).length > 0 : tgtIds(pc).some((t: any) => t.kind === 'card' && s.cards[t.iid]?.zone === 'battlefield' && api.matchesFilter(s, t.iid, { ...l.filter, zone: 'battlefield' }, pc.player, pc.iid));
    if (ok) cost = reduceGeneric(cost, l.n);
  }
  for (const b of sourcesWith(s, 'targetTax')) {
    const ctrl = s.cards[b].controller;
    for (const t of (api.chars(s, b).pc as any).targetTax ?? []) {
      if (t.mine !== (ctrl === pc.player)) continue;
      const hit = tgtIds(pc).some((x: any) => (x.kind === 'card' && (t.what === '~' ? x.iid === b : s.cards[x.iid]?.controller === ctrl && (t.what !== 'a creature you control' || api.chars(s, x.iid).types.has('creature')))) || (x.kind === 'player' && t.what.startsWith('you or') && x.idx === ctrl));
      if (hit) cost = t.less ? reduceGeneric(cost, t.n) : addGeneric(cost, t.n);
    }
  }
  return cost;
});
