// Plugin: batch 11 — one-sentence effects.
import { EXT } from '../ext';
import { evalCond, sourcesWith } from '../rules';
import { automationLevel, looseFilter, parseCard, parseCond, parsePlayerSubject, parseSentence, parseSubject } from '../oracle';
import { SUBTYPES } from '../subtypes';

const N: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };

// "Put target card from your graveyard on top of your library."
EXT.rules.push([/^put (target (?:.*?)card from your graveyard) on (top|the bottom) of your library$/, (m, ctx) => {
  const what = parseSubject(m[1], ctx);
  return what ? [{ k: 'ext', name: 'moveTo', what, dest: m[2] === 'top' ? 'libraryTop' : 'libraryBottom' }] : null;
}]);
EXT.effects.moveTo = ({ s, item, e, api }) => {
  for (const c of api.subjCards(s, item, e.what)) if (s.cards[c]) api.moveCard(s, c, e.dest);
  return 'done';
};

// "You may tap or untap (another) target permanent."
EXT.rules.push([/^(?:you may )?tap or untap ((?:another )?target .+)$/, (m, ctx) => {
  const what = parseSubject(m[1], ctx);
  return what ? [{ k: 'ext', name: 'tapOrUntap2', what }] : null;
}]);
EXT.effects.tapOrUntap2 = ({ s, item, e, r, you, api }) => {
  const cs = api.subjCards(s, item, e.what).filter((c: string) => s.cards[c]?.zone === 'battlefield');
  if (!cs.length) return 'done';
  if (!r.sub) {
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'yesno', title: `${item.label}: tap or untap ${api.nm(s, cs[0])}?`, options: [{ id: 'tap', label: 'Tap' }, { id: 'untap', label: 'Untap' }, { id: 'none', label: 'Neither' }], data: { ctx: 'resolve' } });
    return 'wait';
  }
  for (const c of cs) { if (r.sub.answered === 'tap') s.cards[c].tapped = true; else if (r.sub.answered === 'untap') s.cards[c].tapped = false; }
  return 'done';
};

// "Untap all creatures that attacked this turn."
EXT.rules.push([/^untap all creatures (?:you control )?that attacked this turn$/, (m) => [{ k: 'ext', name: 'untapAttacked', mine: /you control/.test(m[0]) }]]);
EXT.effects.untapAttacked = ({ s, e, you }) => {
  const ad = (s as any).attackDeclared;
  if (!ad || ad.turn !== s.turn) return 'done';
  for (const c of ad.ids as string[]) if (s.cards[c]?.zone === 'battlefield' && (!e.mine || s.cards[c].controller === you)) s.cards[c].tapped = false;
  return 'done';
};

// "… equal to the sacrificed creature's power / toughness / mana value"
EXT.amountPhrases.push((ph) => {
  const m = ph.match(/^the sacrificed (?:creature|artifact|permanent)'s (power|toughness|mana value)$/);
  return m ? { sacStat: m[1] === 'mana value' ? 'cmc' : m[1] } : null;
});

// "Return a creature card at random from your graveyard to your hand."
EXT.rules.push([/^return (a|an|two) (.+?) cards? at random from your graveyard to your hand$/, (m) => {
  const f = looseFilter(m[2]);
  return f ? [{ k: 'ext', name: 'gyRandom', filter: { ...f, zone: undefined }, n: N[m[1]] }] : null;
}]);
EXT.effects.gyRandom = ({ s, e, you, api }) => {
  for (let k = 0; k < e.n; k++) {
    const cands = s.players[you].graveyard.filter((c: string) => api.matchesFilter(s, c, { ...e.filter, zone: 'graveyard' }, you));
    if (!cands.length) break;
    api.moveCard(s, cands[Math.floor(api.rand(s) * cands.length)], 'hand');
  }
  return 'done';
};

// "Destroy / Sacrifice / Exile it at the beginning of the next end step."
EXT.rules.push([/^(destroy|exile|sacrifice|return) (it|that creature|them|those creatures)(?: to its owner's hand)? at the beginning of the next end step$/, (m, ctx) => {
  const what = ctx.last ?? { t: 'self' };
  const eff = m[1] === 'destroy' ? { k: 'destroy', what } : m[1] === 'exile' ? { k: 'exile', what } : m[1] === 'sacrifice' ? { k: 'sacObj', what } : { k: 'bounce', what };
  return [{ k: 'delayed', at: 'nextEnd', effects: [eff] }];
}]);

// "Target creature an opponent controls doesn't untap during its controller's next untap step."
EXT.rules.push([/^(target .+?) (?:doesn't|don't) untap during (?:its|their) controllers?'s? next untap steps?$/, (m, ctx) => {
  const what = parseSubject(m[1], ctx);
  return what ? [{ k: 'skipUntap', what }] : null;
}]);

// "You may put a card from your hand on the bottom of your library."
EXT.rules.push([/^(?:you may )?put (a|two) cards? from your hand on the bottom of your library$/, (m) => [{ k: 'ext', name: 'handToBottom', n: N[m[1]], may: /^you may/.test(m[0]) }]]);
EXT.effects.handToBottom = ({ s, item, e, r, you, api }) => {
  const hand = s.players[you].hand;
  if (!hand.length) return 'done';
  if (!r.sub) {
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'chooseCards', title: `${item.label}: put ${e.n === 1 ? 'a card' : `${e.n} cards`} from your hand on the bottom of your library`, cards: [...hand], min: e.may ? 0 : Math.min(e.n, hand.length), max: Math.min(e.n, hand.length), data: { ctx: 'resolve' } });
    return 'wait';
  }
  for (const c of r.sub.answer ?? []) if (s.cards[c]?.zone === 'hand') api.moveCard(s, c, 'libraryBottom');
  return 'done';
};

// "Move a +1/+1 counter from ~ onto target creature."
EXT.rules.push([/^move (a|an|one|two|all) ([+-]\d\/[+-]\d|\w+) counters? from ~ onto (.+)$/, (m, ctx) => {
  const to = parseSubject(m[3], ctx);
  return to ? [{ k: 'ext', name: 'moveCounters', to, counter: m[2], n: m[1] === 'all' ? 99 : N[m[1]] }] : null;
}]);
EXT.effects.moveCounters = ({ s, item, e, api }) => {
  const src: any = s.cards[item.source];
  const have = src?.counters?.[e.counter] ?? 0;
  const to = api.subjCards(s, item, e.to)[0];
  const n = Math.min(have, e.n);
  if (!to || n <= 0 || s.cards[to]?.zone !== 'battlefield') return 'done';
  src.counters[e.counter] = have - n;
  api.addCounters(s, to, e.counter, n);
  return 'done';
};

// "(You may) shuffle up to three target cards from your graveyard into your library."
EXT.rules.push([/^(?:you may )?shuffle (up to (?:one|two|three|four|five) target (?:.*?)cards? from your graveyard) into your library$/, (m, ctx) => {
  const what = parseSubject(m[1].replace(/ from your graveyard$/, ' from your graveyard'), ctx);
  return what ? [{ k: 'ext', name: 'gyShuffleIn', what }] : null;
}]);
EXT.effects.gyShuffleIn = ({ s, item, e, you, api }) => {
  for (const c of api.subjCards(s, item, e.what)) if (s.cards[c]?.zone === 'graveyard') api.moveCard(s, c, 'library');
  api.shuffleArr(s, s.players[you].library);
  return 'done';
};

// "Each opponent discards a card and loses 2 life." — one subject, two verbs
EXT.rules.push([/^(each opponent|each player|target opponent|target player|that player|defending player) ([a-z]+s\b.+?) and ([a-z]+s\b.+)$/, (m, ctx) => {
  if (/^(?:gets|gains|has|have)\b/.test(m[2])) return null;
  const k0 = ctx.specs.length;
  const a = parseSentence(`${m[1]} ${m[2]}`, ctx);
  if (!a || a.some((e: any) => e.k === 'manual')) { ctx.specs.length = k0; return null; }
  const sub = /^target/.test(m[1]) ? 'that player' : m[1];
  if (/^target/.test(m[1])) ctx.lastPlayer = ((a as any[]).find((e: any) => e.who)?.who) ?? ctx.lastPlayer;
  const b = parseSentence(`${sub} ${m[3]}`, ctx);
  if (!b || b.some((e: any) => e.k === 'manual')) { ctx.specs.length = k0; return null; }
  return [...a, ...b];
}]);

// "Creatures your opponents control attack this turn if able." / "Creatures target player controls attack this turn if able."
EXT.rules.push([/^(creatures your opponents control|creatures target (?:player|opponent) controls|all creatures) attack this turn if able$/, (m, ctx) => {
  const what = parseSubject(m[1], ctx);
  return what ? [{ k: 'ext', name: 'mustAttackGroup', what }] : null;
}]);
EXT.effects.mustAttackGroup = ({ s, item, e, api }) => {
  const turn = s.active === item.controller ? s.turn + 1 : s.turn;
  for (const c of api.subjCards(s, item, e.what)) if (s.cards[c]?.zone === 'battlefield') (s.cards[c] as any).mustAttackTurn = turn;
  return 'done';
};

// "Each creature you control can block an additional creature each combat."
EXT.lines.push((line, pc) => {
  const m = line.match(/^(each creature you control|~|creatures you control) can block (an additional|any number of) creatures? each combat$/);
  if (!m || m[1] === '~') return false;
  pc.groupExtraBlock = m[2] === 'an additional' ? 2 : 99;
  return true;
});
EXT.hooks.maxBlocks.push((s, blocker, api) => {
  const me = s.cards[blocker].controller;
  let n: number | undefined;
  for (const b of s.battlefield) if (s.cards[b].controller === me) { const g = (api.chars(s, b).pc as any).groupExtraBlock; if (g) n = Math.max(n ?? 1, g); }
  return n;
});

// "Islands / Forests don't untap during their controllers' untap steps."
EXT.lines.push((line, pc) => {
  const m = line.match(/^(plains|islands|swamps|mountains|forests|lands|creatures|artifacts|nonbasic lands) don't untap during their controllers' untap steps$/);
  if (!m) return false;
  const f = looseFilter(m[1].replace(/s$/, ''));
  if (!f) return false;
  pc.groupNoUntap = { ...f, zone: undefined };
  return true;
});
EXT.hooks.untap.push((s, iid, api) => {
  for (const b of s.battlefield) {
    const f = (api.chars(s, b).pc as any).groupNoUntap;
    if (f && api.matchesFilter(s, iid, { ...f, zone: 'battlefield' }, s.cards[b].controller, b)) return false;
  }
  return undefined;
});

// "Its controller sacrifices it at the beginning of the next end step."
EXT.rules.push([/^(?:its|that creature's) controller sacrifices it at the beginning of the next end step$/, (_m, ctx) => [{ k: 'delayed', at: 'nextEnd', effects: [{ k: 'sacObj', what: ctx.last ?? { t: 'self' } }] }]]);

// "Equipped/Enchanted creature doesn't untap during its controller's untap step." / "… gets +1/+1 and loses flying."
EXT.lines.push((line, pc) => {
  let m = line.match(/^(equipped|enchanted) creature doesn't untap during its controller's untap step$/);
  if (m) { pc.statics.push({ kind: 'attachPump', attach: m[1], p: 0, t: 0, kw: [], noUntap: true } as any); return true; }
  m = line.match(/^(equipped|enchanted) creature gets ([+-]\d+)\/([+-]\d+) and loses (flying|defender|trample|first strike|haste|reach|vigilance)$/);
  if (m) { pc.statics.push({ kind: 'attachPump', attach: m[1], p: +m[2], t: +m[3], kw: [], loseKw: [m[4]] } as any); return true; }
  return false;
});

// "Create a Food token or a Treasure token."
EXT.rules.push([/^create (?:a|an) (food|treasure|clue|blood|map|gold) token or (?:a|an) (food|treasure|clue|blood|map|gold) token$/, (m) => [{ k: 'ext', name: 'tokenChoice', a: m[1], b: m[2] }]]);
EXT.effects.tokenChoice = ({ s, item, e, r, you, api }) => {
  if (!r.sub) {
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'yesno', title: `${item.label}: create which token?`, options: [{ id: e.a, label: e.a }, { id: e.b, label: e.b }], data: { ctx: 'resolve' } });
    return 'wait';
  }
  const pick = r.sub.answered === e.b ? e.b : e.a;
  const eff = parseSentence(`create a ${pick} token`, { specs: [], selfName: '~' } as any)?.[0];
  if (eff) return api.execEffect(s, item, eff, { ...r, sub: null });
  return 'done';
};

// "Untap up to two lands you control." / "Untap up to one target creature."
EXT.rules.push([/^untap up to (one|two|three|four|five) (lands|creatures|permanents|artifacts) you control$/, (m) => {
  const f = looseFilter(m[2].replace(/s$/, ''));
  return f ? [{ k: 'ext', name: 'untapUpToMine', n: N[m[1]], filter: { ...f, zone: undefined } }] : null;
}]);
EXT.effects.untapUpToMine = ({ s, item, e, r, you, api }) => {
  const cands = s.battlefield.filter((b: string) => s.cards[b].controller === you && s.cards[b].tapped && api.matchesFilter(s, b, { ...e.filter, zone: 'battlefield' }, you));
  if (!cands.length) return 'done';
  if (!r.sub) {
    if (cands.length <= e.n) { for (const c of cands) s.cards[c].tapped = false; return 'done'; }
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'chooseCards', title: `${item.label}: untap up to ${e.n}`, cards: cands, min: 0, max: e.n, data: { ctx: 'resolve' } });
    return 'wait';
  }
  for (const c of r.sub.answer ?? []) if (s.cards[c]) s.cards[c].tapped = false;
  return 'done';
};

// "… until your next turn" / "Until your next turn, …": run the effect as an "until end of turn" one, then extend every
// continuous effect it created until its controller's next turn begins (the mods are dropped in that untap step)
EXT.rules.push([/^(?:until your next turn, (.+)|(.+) until your next turn)$/, (m, ctx) => {
  const body = m[1] ?? m[2];
  if (/until your next turn|until end of turn/.test(body)) return null;
  const k0 = ctx.specs.length;
  const inner = parseSentence(m[1] ? `until end of turn, ${body}` : `${body} until end of turn`, ctx) ?? parseSentence(`${body} this turn`, ctx) ?? parseSentence(body, ctx);
  if (!inner || inner.some((e: any) => e.k === 'manual')) { ctx.specs.length = k0; return null; }
  return [{ k: 'ext', name: 'untilNextStart' }, ...inner, { k: 'ext', name: 'untilNextEnd' }];
}]);
const PRE = new WeakMap<object, Set<object>>();
EXT.effects.untilNextStart = ({ s, item }) => {
  const seen = new Set<object>();
  for (const b of s.battlefield) for (const m of s.cards[b].mods) seen.add(m);
  PRE.set(item, seen);
  return 'done';
};
EXT.effects.untilNextEnd = ({ s, item, you }) => {
  const seen = PRE.get(item);
  if (!seen) return 'done';
  for (const b of s.battlefield) for (const m of s.cards[b].mods as any[]) if (!seen.has(m) && m.until === 'eot') { m.until = 'permanent'; m.untilNext = you; }
  return 'done';
};
EXT.hooks.step.push((s, step) => {
  if (step !== 'untap') return;
  for (const b of s.battlefield) {
    const c = s.cards[b];
    if (c.mods.some((m: any) => m.untilNext === s.active)) c.mods = c.mods.filter((m: any) => m.untilNext !== s.active);
  }
});

// "That creature doesn't untap during its controller's untap step" as a temporary effect (then extended by a duration)
EXT.rules.push([/^(that creature|it|those creatures|that permanent|target .+?) (?:doesn't|don't) untap during (?:its|their) controllers?'s? untap steps?(?: this turn)?$/, (m, ctx) => {
  const what = /^target/.test(m[1]) ? parseSubject(m[1], ctx) : ctx.last;
  return what ? [{ k: 'ext', name: 'tempMod', what, mod: { noUntap: true } }] : null;
}]);
// "X for as long as you control ~": the continuous effects X creates end when you lose control of ~ (611.2b)
EXT.rules.push([/^(.+) for as long as you control ~$/, (m, ctx) => {
  const body = m[1];
  if (/^(?:gain control|you may play|you may cast)/.test(body)) return null;
  const k0 = ctx.specs.length;
  const inner = parseSentence(`${body} until end of turn`, ctx) ?? parseSentence(`${body} this turn`, ctx) ?? parseSentence(body, ctx);
  if (!inner || inner.some((e: any) => e.k === 'manual')) { ctx.specs.length = k0; return null; }
  return [{ k: 'ext', name: 'untilNextStart' }, ...inner, { k: 'ext', name: 'whileCtrlEnd' }];
}]);
EXT.effects.whileCtrlEnd = ({ s, item }) => {
  const seen = PRE.get(item);
  if (!seen) return 'done';
  const src = s.cards[item.source];
  const gone = !src || src.zone !== 'battlefield';
  for (const b of s.battlefield) {
    const c = s.cards[b];
    // ~ already gone: the effect lasts no time at all
    if (gone) { c.mods = c.mods.filter((m: any) => seen.has(m) || m.until !== 'eot'); continue; }
    for (const m of c.mods as any[]) if (!seen.has(m) && m.until === 'eot') { m.until = 'whileSourceControlled'; m.source = item.source; }
  }
  return 'done';
};

// "Target creature gets +2/+2 for as long as ~ remains tapped." (Tawnos's Wand-style)
EXT.rules.push([/^(.+) for as long as ~ remains tapped$/, (m, ctx) => {
  const k0 = ctx.specs.length;
  const inner = parseSentence(`${m[1]} until end of turn`, ctx) ?? parseSentence(`${m[1]} this turn`, ctx) ?? parseSentence(m[1], ctx);
  if (!inner || inner.some((e: any) => e.k === 'manual')) { ctx.specs.length = k0; return null; }
  return [{ k: 'ext', name: 'untilNextStart' }, ...inner, { k: 'ext', name: 'whileTappedEnd' }];
}]);
EXT.effects.whileTappedEnd = ({ s, item }) => {
  const seen = PRE.get(item);
  if (!seen) return 'done';
  const src = s.cards[item.source];
  const ok = src?.zone === 'battlefield' && src.tapped;
  for (const b of s.battlefield) {
    const c = s.cards[b];
    if (!ok) { c.mods = c.mods.filter((m: any) => seen.has(m) || m.until !== 'eot'); continue; }
    for (const m of c.mods as any[]) if (!seen.has(m) && m.until === 'eot') { m.until = 'permanent'; m.whileTapped = item.source; }
  }
  return 'done';
};
const dropWhileTapped = (s: any, src: string) => { for (const b of s.battlefield) { const c = s.cards[b]; if (c.mods.some((m: any) => m.whileTapped === src)) c.mods = c.mods.filter((m: any) => m.whileTapped !== src); } };
EXT.hooks.event.push((s, name, d) => { if ((name === 'untapped' || name === 'untapScan') && d?.iid) dropWhileTapped(s, d.iid); });
EXT.hooks.afterMove.push((s, iid, from) => { if (from === 'battlefield') dropWhileTapped(s, iid); });

// "When you next cast an instant or sorcery spell this turn, copy that spell (twice / X times). You may choose new
// targets for the copy." (Doublecast, Galvanic Iteration, Ral) — a delayed trigger watching your next matching spell
EXT.seqs.push((sents, i, ctx, ab) => {
  const m = sents[i].match(/^when you next cast (?:a|an) (.+?) spell(?: with mana value (\d+) or less)? this turn, (.+)$/);
  if (!m) return null;
  const f = looseFilter(m[1]);
  if (!f) return null;
  const filter = { ...f, zone: undefined, ...(m[2] ? { cmcMax: +m[2] } : {}) };
  const body = m[3];
  let used = 0;
  let effs: any[] | null = null;
  const cp = body.match(/^copy (?:that spell|it)( twice| x times)?(?: and you may choose new targets for the cop(?:y|ies))?$/);
  if (cp) {
    effs = [{ k: 'copySpell', what: { t: 'triggerObj' }, n: cp[1] === ' twice' ? 2 : cp[1] === ' x times' ? 'X' : 1 }];
    if (/^you may choose new targets for the cop(?:y|ies)$/.test(sents[i + 1] ?? '')) used = 1;
  } else {
    const save = ctx.last;
    ctx.last = { t: 'triggerObj' } as any;
    const k0 = ctx.specs.length;
    effs = parseSentence(body.replace(/\bthat (?:spell|creature)\b/g, 'it'), ctx);
    ctx.last = save;
    if (!effs || effs.some((e: any) => e.k === 'manual') || ctx.specs.length !== k0) { ctx.specs.length = k0; return null; }
  }
  ab.effects.push({ k: 'ext', name: 'nextCast', filter, effects: effs } as any);
  return used;
});
EXT.effects.nextCast = ({ s, item, e, you }) => {
  ((s.players[you] as any).nextCast ??= []).push({ turn: s.turn, filter: e.filter, effects: e.effects, source: item.source, label: item.label, x: item.x ?? 0 });
  return 'done';
};
EXT.hooks.event.push((s, name, d, api) => {
  if (name !== 'cast' || d.item.kind !== 'spell') return;
  const p = d.item.controller;
  const list: any[] = (s.players[p] as any).nextCast ?? [];
  if (!list.length) return;
  const keep: any[] = [];
  for (const w of list) {
    if (w.turn !== s.turn) continue;
    if (!api.matchesFilter(s, d.item.source, { ...w.filter, zone: 'stack' }, p)) { keep.push(w); continue; }
    s.pendingTriggers.push({ id: api.uid(s, 's'), kind: 'trigger', controller: p, source: w.source, label: w.label, text: 'When you next cast …', effects: JSON.parse(JSON.stringify(w.effects)), targets: [], triggerObj: d.item.source, x: w.x } as any);
  }
  (s.players[p] as any).nextCast = keep;
});

// "Any opponent may have it deal 4 damage to them. If a player does, sacrifice this creature." (Vexing Devil)
// "At the beginning of each combat, any opponent may sacrifice a creature. If a player does, tap ~ …" (Desecration Demon)
// "When you cast this spell, any player may pay 5 life. If a player does, counter ~." (Dash Hopes)
let omN = 0;
const ACTION = (t: string): any | null => {
  let m: RegExpMatchArray | null;
  if ((m = t.match(/^pay (\d+) life$/))) return { life: +m[1] };
  if (/^pay half their life, rounded up$/.test(t)) return { halfLife: true };
  if ((m = t.match(/^pay ((?:\{[^}]+\})+)$/))) return { mana: m[1].toUpperCase() };
  if ((m = t.match(/^sacrifice (a|an|two) (.+?)(?: of their choice)?$/))) { const f = looseFilter(m[2].replace(/s$/, '')); return f ? { sac: { n: m[1] === 'two' ? 2 : 1, filter: { ...f, zone: undefined } } } : null; }
  if ((m = t.match(/^discard (a card|two cards|three cards)$/))) return { discard: m[1] === 'a card' ? 1 : m[1].startsWith('two') ? 2 : 3 };
  if (/^discard a card at random$/.test(t)) return { discardRandom: true };
  if ((m = t.match(/^exile (a card|two cards|three cards) from their graveyard$/))) return { exileGy: m[1] === 'a card' ? 1 : m[1].startsWith('two') ? 2 : 3 };
  if ((m = t.match(/^have (?:it|~) deal (\d+) damage to them$/))) return { takeDmg: +m[1] };
  // self-cost forms ("… unless you …")
  const N: any = { a: 1, an: 1, one: 1, another: 1, two: 2, three: 3, four: 4, five: 5 };
  if ((m = t.match(/^sacrifice (a|an|one|two|three|four|five|another) (.+?)$/)) && !/ of their choice$/.test(t)) { const f = looseFilter(m[2]); return f ? { sac: { n: N[m[1]], filter: { ...f, zone: undefined, ...(m[1] === 'another' ? { other: true } : {}) } } } : null; }
  if ((m = t.match(/^return (a|an|one|two|three|another) (.+?) to (?:its|their) owners?'s? hand$/))) { const f = looseFilter(m[2]); return f ? { bounce: { n: N[m[1]], filter: { ...f, zone: undefined, ...(m[1] === 'another' ? { other: true } : {}) } } } : null; }
  if ((m = t.match(/^tap (an|a|two) untapped (.+?)$/))) { const f = looseFilter(`untapped ${m[2]}`); return f ? { tapP: { n: N[m[1]], filter: { ...f, zone: undefined } } } : null; }
  if ((m = t.match(/^return (a|an) (.+?) card from your graveyard to your hand$/))) { const f = looseFilter(m[2]); return f ? { gyHand: { n: 1, filter: { ...f, zone: undefined } } } : null; }
  if ((m = t.match(/^discard (a|an) (.+?) card$/))) { const f = looseFilter(m[2]); return f ? { discardF: { n: 1, filter: { ...f, zone: undefined } } } : null; }
  if (/^exile a card from your graveyard$/.test(t)) return { exileGy: 1 };
  return null;
};
EXT.seqs.push((sents, i, ctx, ab) => {
  const m = sents[i].match(/^(?:then )?(any player|any opponent|each opponent|that player|they|target opponent) may (.+)$/);
  const n = (sents[i + 1] ?? '').match(/^if (?:a|the) player does, (.+)$/);
  if (!m || !n) return null;
  const act = ACTION(m[2]);
  if (!act) return null;
  const k0 = ctx.specs.length;
  let who: any = m[1] === 'any player' ? { any: true } : m[1] === 'that player' || m[1] === 'they' ? (ctx.lastPlayer ? { subj: ctx.lastPlayer } : null) : m[1] === 'target opponent' ? { subj: parseSubject('target opponent', ctx) } : { opp: true };
  if (!who || (who.subj === null)) { ctx.specs.length = k0; return null; }
  const save = ctx.lastPlayer;
  ctx.lastPlayer = { t: 'triggerPlayer' } as any;
  const body = parseSentence(n[1].replace(/\bthey\b/g, 'that player'), ctx);
  ctx.lastPlayer = save;
  if (!body || body.some((e: any) => e.k === 'manual')) { ctx.specs.length = k0; return null; }
  const id = `om${++omN}`;
  ab.effects.push({ k: 'ext', name: 'otherMay', who, act, id, text: m[2] } as any, { k: 'if', cond: { k: 'itemFlag', id }, effects: body } as any);
  return 1;
});
const canDo = (s: any, p: number, a: any, src: string, api: any): string[] | boolean => {
  const pl = s.players[p];
  if (a.life) return pl.life >= a.life;
  if (a.halfLife) return true;
  if (a.mana) return api.canAfford(s, p, a.mana);
  if (a.sac) { const c = s.battlefield.filter((b: string) => s.cards[b].controller === p && api.matchesFilter(s, b, { ...a.sac.filter, zone: 'battlefield' }, p, src)); return c.length >= a.sac.n ? c : false; }
  if (a.discard) return pl.hand.length >= a.discard ? [...pl.hand] : false;
  if (a.discardRandom) return pl.hand.length > 0;
  if (a.exileGy) return pl.graveyard.length >= a.exileGy ? [...pl.graveyard] : false;
  if (a.takeDmg) return true;
  const pickOf = (o: any, list: string[]) => { const c = list.filter((b: string) => api.matchesFilter(s, b, { ...o.filter, zone: s.cards[b].zone }, p, src)); return c.length >= o.n ? c : false; };
  if (a.bounce) return pickOf(a.bounce, s.battlefield);
  if (a.tapP) return pickOf(a.tapP, s.battlefield.filter((b: string) => s.cards[b].controller === p && !s.cards[b].tapped));
  if (a.gyHand) return pickOf(a.gyHand, pl.graveyard);
  if (a.discardF) return pickOf(a.discardF, pl.hand);
  return false;
};
EXT.effects.otherMay = ({ s, item, e, r, you, api }) => {
  const flags = ((item as any).flags ??= {});
  r.sub ??= { k: 0 };
  const ps: number[] = e.who.self ? [you] : e.who.any ? [you, 1 - you] : e.who.opp ? [1 - you] : api.subjPlayers(s, item, e.who.subj);
  while (r.sub.k < ps.length) {
    const p = ps[r.sub.k];
    const ok = canDo(s, p, e.act, item.source, api);
    if (!ok) { r.sub = { k: r.sub.k + 1 }; continue; }
    if (r.sub.stage === undefined) {
      r.sub.stage = 'ask';
      api.pushPrompt(s, { id: api.uid(s, 'p'), player: p, kind: 'yesno', title: `${item.label}: ${e.text}?`, options: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }], data: { ctx: 'resolve' } });
      return 'wait';
    }
    if (r.sub.stage === 'ask') {
      if (r.sub.answered !== 'yes') { r.sub = { k: r.sub.k + 1 }; continue; }
      const pick = Array.isArray(ok) ? ok : null;
      const need = e.act.sac?.n ?? e.act.bounce?.n ?? e.act.tapP?.n ?? e.act.gyHand?.n ?? e.act.discardF?.n ?? e.act.discard ?? e.act.exileGy ?? 0;
      if (pick && pick.length > need) {
        r.sub.stage = 'pick';
        api.pushPrompt(s, { id: api.uid(s, 'p'), player: p, kind: 'chooseCards', title: `${item.label}: choose ${need}`, cards: pick, min: need, max: need, data: { ctx: 'resolve' } });
        return 'wait';
      }
      r.sub.answer = pick ?? [];
    }
    const chosen: string[] = r.sub.answer ?? [];
    const a = e.act;
    if (a.life) api.loseLife(s, p, a.life);
    else if (a.halfLife) api.loseLife(s, p, Math.ceil(s.players[p].life / 2));
    else if (a.mana) { if (api.payMana(s, p, a.mana, 0)) { r.sub = { k: r.sub.k + 1 }; continue; } }
    else if (a.sac) for (const c of chosen) api.moveCard(s, c, 'graveyard', { cause: 'sacrifice' });
    else if (a.discard) for (const c of chosen) api.moveCard(s, c, 'graveyard', { cause: 'discard' });
    else if (a.exileGy) for (const c of chosen) api.moveCard(s, c, 'exile');
    else if (a.discardRandom) { const h = s.players[p].hand; if (h.length) api.moveCard(s, h[Math.floor(api.rand(s) * h.length)], 'graveyard', { cause: 'discard' }); }
    else if (a.takeDmg) api.dealDamage(s, item.source, { kind: 'player', idx: p }, a.takeDmg, false);
    else if (a.bounce) for (const c of chosen) api.moveCard(s, c, 'hand');
    else if (a.tapP) for (const c of chosen) { s.cards[c].tapped = true; api.emit?.(s, 'tapped', { iid: c }); }
    else if (a.gyHand) for (const c of chosen) api.moveCard(s, c, 'hand');
    else if (a.discardF) for (const c of chosen) api.moveCard(s, c, 'graveyard', { cause: 'discard' });
    api.log(s, `${api.pname(s, p)} chooses to ${e.text}.`, p);
    flags[e.id] = true;
    (item as any).triggerPlayer = p;
    return 'done';
  }
  return 'done';
};

// "Counter ~." (a spell's own "when you cast" trigger countering it: Dash Hopes, Brain Gorgers)
EXT.rules.push([/^counter ~$/, () => [{ k: 'ext', name: 'counterSelf' }]]);
EXT.effects.counterSelf = ({ s, item, api }) => {
  const it = s.stack.find((x: any) => x.kind === 'spell' && x.source === item.source);
  if (it) api.counterItem(s, it);
  return 'done';
};

// "As long as ~ is equipped, it gets +2/+0 and has menace." — "it" is ~
EXT.expand.push((line) => {
  const m = line.match(/^(as long as (?:~|it) [^,]+), it ((?:gets|has|can't|can|is) .+)$/);
  return m ? [`${m[1]}, ~ ${m[2]}`] : null;
});

// "Exile up to one target instant or sorcery card from your graveyard and copy it. You may cast the copy (without
// paying its mana cost)." (Demilich, Narset Enlightened Exile, Nashi)
EXT.seqs.push((sents, i, ctx, ab) => {
  const m = sents[i].match(/^exile ((?:up to one )?target .+? from (?:your|a) graveyard)(?: and copy it)?$/);
  if (!m) return null;
  let j = i + 1;
  if (!/and copy it$/.test(sents[i])) { if (sents[j] !== 'copy it') return null; j++; }
  const c = (sents[j] ?? '').match(/^you may cast the copy( without paying its mana cost)?$/);
  if (!c) return null;
  const k0 = ctx.specs.length;
  const what = parseSubject(m[1], ctx);
  if (!what) { ctx.specs.length = k0; return null; }
  ab.effects.push({ k: 'exile', what } as any, { k: 'ext', name: 'castCopyOf', what, free: !!c[1] } as any);
  return j - i;
});
EXT.effects.castCopyOf = ({ s, item, e, r, you, api }) => {
  const orig = api.subjCards(s, item, e.what)[0];
  if (!orig || !s.cards[orig]) return 'done';
  if (!r.sub) {
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'yesno', title: `Cast a copy of ${api.nm(s, orig)}${e.free ? ' without paying its mana cost' : ''}?`, options: [{ id: 'yes', label: 'Cast the copy' }, { id: 'no', label: "Don't" }], cards: [orig], data: { ctx: 'resolve' } });
    return 'wait';
  }
  if (r.sub.answered !== 'yes') return 'done';
  const iid = api.uid(s, 'c');
  s.cards[iid] = { ...api.newCardObj(iid, s.cards[orig].defId, you, 'exile'), cardCopy: true, mayPlay: { player: you, untilTurn: s.turn } } as any;
  api.P(s, you).exile.push(iid);
  (s as any).castInResolution = true;
  let err: string | null;
  try { err = api.beginCast(s, you, iid, 0, e.free ? 'free' : 'mayPlay'); } finally { (s as any).castInResolution = false; }
  if (err) { api.log(s, `Couldn't cast the copy: ${err}`, you, 'warn'); api.removeFromZone(s, iid); delete s.cards[iid]; }
  return 'done';
};

// "Equipped creature gets +2/+2, has reach, and is a Bard in addition to its other types." / "… gets +2/+2 and can't
// block" / "… gets +2/+0 and has vigilance and "At the beginning of your upkeep, draw a card."" — a list of clauses
const KWS = new Set(['flying', 'first strike', 'double strike', 'deathtouch', 'hexproof', 'indestructible', 'lifelink', 'menace', 'reach', 'trample', 'vigilance', 'haste', 'shroud', 'wither', 'infect', 'defender', 'fear', 'intimidate', 'horsemanship', 'shadow', 'flanking', 'prowess']);
EXT.lines.push((line, pc) => {
  const m = line.match(/^(equipped|enchanted) creature (.+)$/);
  if (!m) return false;
  // split on commas / "and" outside quotes
  const parts: string[] = [];
  let cur = '', q = false;
  const toks = m[2].split(/("[^"]*")/);
  for (const t of toks) { if (t.startsWith('"')) { cur += t; continue; } const segs = t.split(/,? and |, /); cur += segs[0]; for (let k = 1; k < segs.length; k++) { parts.push(cur); cur = segs[k]; } }
  parts.push(cur);
  void q;
  if (parts.length < 2) return false;
  const st: any = { kind: 'attachPump', attach: m[1], p: 0, t: 0, kw: [] };
  const grants: string[] = [];
  let become: any = null;
  let lastVerb = '';
  for (let p of parts.map((x) => x.trim())) {
    let mm: RegExpMatchArray | null;
    if (!/^(gets|has|is|can't|must)\b/.test(p) && lastVerb) p = `${lastVerb} ${p}`;
    if ((mm = p.match(/^gets ([+-]\d+)\/([+-]\d+)$/))) { st.p += +mm[1]; st.t += +mm[2]; lastVerb = 'gets'; continue; }
    if ((mm = p.match(/^has "(.+?)"?$/))) { const g = mm[1].replace(/'/g, '"').replace(/(\w)"(\w)/g, "$1'$2"); if (!probeFull(g)) return false; grants.push(g); lastVerb = 'has'; continue; }
    if ((mm = p.match(/^has (.+)$/)) && KWS.has(mm[1])) { st.kw.push(mm[1]); lastVerb = 'has'; continue; }
    if ((mm = p.match(/^has protection from (white|blue|black|red|green|creatures|artifacts|instants)$/))) { st.kw.push(`protection from ${mm[1]}`); lastVerb = 'has'; continue; }
    if (/^can't block$/.test(p)) { st.cantBlock = true; lastVerb = ''; continue; }
    if (/^can't attack$/.test(p)) { st.cantAttack = true; lastVerb = ''; continue; }
    if (/^can't attack or block$/.test(p)) { st.cantAttack = true; st.cantBlock = true; lastVerb = ''; continue; }
    if (/^can't be blocked$/.test(p)) { st.unblockable = true; lastVerb = ''; continue; }
    if ((mm = p.match(/^is an? ([a-z ]+?) in addition to its other (?:colors and )?types$/))) {
      const subs = mm[1].split(' ').filter((w) => !['white', 'blue', 'black', 'red', 'green'].includes(w));
      if (!subs.every((w) => SUBTYPES.has(w))) return false;
      become = { addSubtypes: subs };
      lastVerb = '';
      continue;
    }
    return false;
  }
  pc.statics.push(st);
  if (grants.length) (pc.attachGrants ??= []).push(...grants);
  if (become) {
    if (pc.attachBecome) return false;
    pc.attachBecome = become;
  }
  return true;
});
const probeFull = (text: string) => automationLevel(parseCard({ id: `grant-probe:${text}`, name: 'Granted', manaCost: '', cmc: 0, typeLine: 'Creature', oracle: text, colors: [], colorIdentity: [], keywords: [], layout: 'normal' } as any) as any) === 'full';

// "Other creatures you control have ward {2}." / "Creatures you control have trample and ward {1}." (granted through groupGrants)
EXT.lines.push((line, pc) => {
  const m = line.match(/^(other )?(creatures|artifact creatures|[a-z]+ creatures|legendary creatures) you control have ((?:[a-z ]+, )?(?:[a-z ]+ and )?ward \{\d+\})$/);
  if (!m) return false;
  const f = looseFilter(m[2].replace(/s$/, '').replace(/creatures$/, 'creature'));
  if (!f) return false;
  const texts = m[3].split(/,? and |, /).map((x) => x.trim());
  if (!texts.every((x) => KWS.has(x) || /^ward \{\d+\}$/.test(x))) return false;
  const filter = { ...f, controller: 'you', ...(m[1] ? { other: true } : {}) };
  delete (filter as any).zone;
  (pc.groupGrants ??= []).push(...texts.map((text) => ({ filter, text: text[0].toUpperCase() + text.slice(1) })));
  return true;
});

// "Creatures you control can't attack." / "Each creature your opponents control blocks this turn if able."
EXT.lines.push((line, pc) => {
  if (/^creatures you control can't attack$/.test(line)) { pc.groupCantAttack = true; return true; }
  return false;
});
EXT.hooks.canAttack.push((s, iid, api) => {
  const me = s.cards[iid].controller;
  for (const b of sourcesWith(s, 'groupCantAttack')) if (s.cards[b]?.controller === me) return false;
  void api;
  return undefined;
});
EXT.rules.push([/^each creature your opponents control blocks this turn if able$/, () => [{ k: 'ext', name: 'oppMustBlock' }]]);
EXT.effects.oppMustBlock = ({ s, you }) => {
  for (const b of s.battlefield) if (s.cards[b].controller !== you) (s.cards[b] as any).mustBlockAny = s.turn;
  return 'done';
};

// "Return ~ from your graveyard to the battlefield tapped and attacking (with a +1/+1 counter on it)."
EXT.rules.push([/^return ~ from your graveyard to the battlefield tapped and attacking(?: with (a|two) \+1\/\+1 counters? on it)?$/, (m) => [{ k: 'ext', name: 'selfAttackBack', n: m[1] ? (m[1] === 'a' ? 1 : 2) : 0 }]]);
EXT.effects.selfAttackBack = ({ s, item, e, you, api }) => {
  const c = s.cards[item.source];
  if (!c || c.zone !== 'graveyard') return 'done';
  api.moveCard(s, item.source, 'battlefield', { controller: you, tapped: true });
  if (e.n) api.addCounters(s, item.source, '+1/+1', e.n);
  if (s.combat && s.active === you) s.combat.attackers.push({ iid: item.source, target: { kind: 'player', idx: 1 - you }, blockedBy: [], blocked: false } as any);
  return 'done';
};
// "When you next cast an instant or sorcery spell this turn, copy it/that spell." as a single sentence (inside "if you do, …")
EXT.rules.push([/^when you next cast (?:a|an) (.+?) spell this turn, copy (?:it|that spell)$/, (m) => {
  const f = looseFilter(m[1]);
  return f ? [{ k: 'ext', name: 'nextCast', filter: { ...f, zone: undefined }, effects: [{ k: 'copySpell', what: { t: 'triggerObj' }, n: 1 }] }] : null;
}]);
// "Destroy target creature and target land."
EXT.rules.push([/^(destroy|exile|tap|untap) (target [a-z ]+?) and (target [a-z ]+)$/, (m, ctx) => {
  const k0 = ctx.specs.length;
  const a = parseSubject(m[2], ctx), b = a ? parseSubject(m[3], ctx) : null;
  if (!a || !b) { ctx.specs.length = k0; return null; }
  const k = m[1] === 'destroy' ? 'destroy' : m[1] === 'exile' ? 'exile' : m[1];
  return [{ k, what: a }, { k, what: b }] as any;
}]);

// "Sacrifice it unless you return an untapped Island you control to its owner's hand." (Karoo lands, Glint Hawk,
// Mold Demon, Command Bridge, Harvest Wurm, Rotting Giant …) — an otherMay for yourself, the rest when you don't.
let unY = 0;
EXT.rules.push([/^(.+?) unless you (.+)$/, (m, ctx) => {
  const act = ACTION(m[2]);
  if (!act || act.takeDmg || act.halfLife) return null;
  const k0 = ctx.specs.length;
  const inner = parseSentence(m[1], ctx);
  if (!inner || inner.some((e: any) => e.k === 'manual')) { ctx.specs.length = k0; return null; }
  const id = `uy${++unY}`;
  return [{ k: 'ext', name: 'otherMay', who: { self: true }, act, id, text: m[2] }, { k: 'if', cond: { k: 'itemFlag', id, not: true }, effects: inner }];
}]);
// "Sacrifice it unless {U} was spent to cast it."
EXT.rules.push([/^(.+?) unless (.+ was spent to cast (?:it|~|this spell))$/, (m, ctx) => {
  const cond = parseCond(m[2]);
  if (!cond || (cond as any).k === 'manual') return null;
  const k0 = ctx.specs.length;
  const inner = parseSentence(m[1], ctx);
  if (!inner || inner.some((e: any) => e.k === 'manual')) { ctx.specs.length = k0; return null; }
  return [{ k: 'if', cond: { k: 'ext', name: 'notC', cond }, effects: inner } as any];
}]);
EXT.condEval.notC = (s, c, you, self, ctx) => !evalCond(s, c.cond, you, self, ctx);

// "~ deals 2 damage to that player unless they sacrifice a creature." / "target player loses 3 life unless they pay {2}"
// (Mogis, Curse Artifact-style punishers): the named player may take the action; the effect happens if they don't.
let unT = 0;
const conj = (t: string) => t.replace(/\bpays\b/g, 'pay').replace(/\bsacrifices\b/g, 'sacrifice').replace(/\bdiscards\b/g, 'discard').replace(/\bexiles\b/g, 'exile');
EXT.rules.push([/^(.+?) unless (they|that player|he or she|its controller|that creature's controller|the player) (.+)$/, (m, ctx) => {
  let act = ACTION(conj(m[3]));
  let act2: any = null;
  if (!act) {
    const two = conj(m[3]).match(/^(.+?) or (sacrifice .+|discard .+|pay .+|exile .+)$/);
    if (!two) return null;
    act = ACTION(two[1]); act2 = ACTION(two[2]);
    if (!act || !act2 || act2.takeDmg) return null;
  }
  if (!act || act.takeDmg) return null;
  if (/^each opponent\b/.test(m[1])) {
    const k0 = ctx.specs.length;
    const inner = parseSentence(m[1], ctx);
    if (!inner || inner.some((e: any) => e.k === 'manual')) { ctx.specs.length = k0; return null; }
    const id = `ut${++unT}`, id2 = `ut${++unT}`;
    const parts = conj(m[3]).match(/^(.+?) or (sacrifice .+|discard .+|pay .+|exile .+)$/);
    if (act2) return [{ k: 'ext', name: 'otherMay', who: { opp: true }, act, id, text: parts![1] }, { k: 'if', cond: { k: 'itemFlag', id, not: true }, effects: [{ k: 'ext', name: 'otherMay', who: { opp: true }, act: act2, id: id2, text: parts![2] }, { k: 'if', cond: { k: 'itemFlag', id: id2, not: true }, effects: inner }] }];
    return [{ k: 'ext', name: 'otherMay', who: { opp: true }, act, id, text: m[3] }, { k: 'if', cond: { k: 'itemFlag', id, not: true }, effects: inner }];
  }
  const pm = m[1].match(/\b(that player|target player|target opponent|defending player|its controller|that creature's controller|enchanted player|the chosen player)\b/);
  const k0 = ctx.specs.length;
  const inner = parseSentence(m[1], ctx);
  if (!inner || inner.some((e: any) => e.k === 'manual')) { ctx.specs.length = k0; return null; }
  const subj = pm ? (pm[1] === 'target player' || pm[1] === 'target opponent' ? findTargetPlayer(inner) : parsePlayerSubject(pm[1], ctx)) : m[2] === 'its controller' || m[2] === "that creature's controller" ? parsePlayerSubject(m[2], ctx) : ctx.lastPlayer;
  if (!subj) { ctx.specs.length = k0; return null; }
  const id = `ut${++unT}`, id2 = `ut${++unT}`;
  if (act2) {
    const parts = conj(m[3]).match(/^(.+?) or (sacrifice .+|discard .+|pay .+|exile .+)$/)!;
    return [{ k: 'ext', name: 'otherMay', who: { subj }, act, id, text: parts[1] }, { k: 'if', cond: { k: 'itemFlag', id, not: true }, effects: [{ k: 'ext', name: 'otherMay', who: { subj }, act: act2, id: id2, text: parts[2] }, { k: 'if', cond: { k: 'itemFlag', id: id2, not: true }, effects: inner }] }];
  }
  return [{ k: 'ext', name: 'otherMay', who: { subj }, act, id, text: m[3] }, { k: 'if', cond: { k: 'itemFlag', id, not: true }, effects: inner }];
}]);
const findTargetPlayer = (effs: any[]): any => {
  for (const e of effs) for (const v of Object.values(e)) {
    const arr = Array.isArray(v) ? v : [v];
    for (const x of arr as any[]) if (x && typeof x === 'object' && x.t === 'target') return x;
  }
  return null;
};
