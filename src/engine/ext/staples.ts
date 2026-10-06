// Plugin: format staples that need their own handling.
//  Narset, Parter of Veils / Notion Thief (draw limits) · Teferi's Protection · Windfall · Intuition · Gamble ·
//  Worldly Tutor wording · Fellwar Stone / Chrome Mox mana · Ad Nauseam · Thassa's Oracle · Mox Diamond
import { EXT } from '../ext';
import { sourcesWith } from '../rules';
import { looseFilter, parseAbility, parseAmtPhrase, parseCountPhrase, parseSentence, parseSubject } from '../oracle';

// ---- draw limits ----
const drawn = (s: any) => { const d = (s.drawsTT ??= { turn: -1, n: [0, 0], step: [0, 0] }); if (d.turn !== s.turn) { d.turn = s.turn; d.n = [0, 0]; d.step = [0, 0]; } return d; };
EXT.lines.push((line, pc) => {
  if (/^each opponent can't draw more than one card each turn$/.test(line)) { pc.drawLimitOpp = 1; return true; }
  if (/^if an opponent would draw a card except the first one they draw in each of their draw steps, instead that player skips that draw and you draw a card$/.test(line)) { pc.notionThief = true; return true; }
  return false;
});
EXT.hooks.draw.push((s, p, api) => {
  const d = drawn(s);
  const inDrawStep = s.step === 'draw' && s.active === p;
  for (const b of [...new Set([...sourcesWith(s, 'drawLimitOpp'), ...sourcesWith(s, 'notionThief')])]) {
    const ctrl = s.cards[b].controller;
    if (ctrl === p) continue;
    const pc = api.chars(s, b).pc as any;
    if (pc.drawLimitOpp && d.n[p] >= pc.drawLimitOpp) return 'skip';
    if (pc.notionThief && !(inDrawStep && d.step[p] === 0) && !(s as any).notionBusy) {
      (s as any).notionBusy = true;
      api.log(s, `${api.nm(s, b)}: ${api.pname(s, p)} skips that draw; ${api.pname(s, ctrl)} draws instead.`, ctrl);
      api.drawCards(s, ctrl, 1);
      (s as any).notionBusy = false;
      return 'skip';
    }
  }
  d.n[p]++;
  if (inDrawStep) d.step[p]++;
  return undefined;
});

// ---- Teferi's Protection ----
EXT.rules.push([/^until your next turn, your life total can't change and you gain protection from everything$/, () => [{ k: 'ext', name: 'tefProt' }]]);
EXT.rules.push([/^all permanents you control phase out$/, () => [{ k: 'ext', name: 'phaseAllMine' }]]);
EXT.effects.tefProt = ({ s, you }) => {
  (s.players[you] as any).protUntil = s.turn + (s.active === you ? 2 : 1);
  return 'done';
};
EXT.effects.phaseAllMine = ({ s, you, api }) => {
  for (const b of s.battlefield) if (s.cards[b].controller === you && !s.cards[b].phasedOut) { s.cards[b].phasedOut = true; (s.cards[b] as any).phaseInTurnOf = you; }
  api.log(s, `${api.pname(s, you)}'s permanents phase out.`, you);
  return 'done';
};
const prot = (s: any, p: number) => (s.players[p].protUntil ?? 0) > s.turn;
EXT.hooks.lifeLoss.push((s, p, n) => (prot(s, p) ? 0 : n));
EXT.hooks.lifeGain.push((s, p, n) => (prot(s, p) ? 0 : n));
EXT.hooks.damage.push((s, _src, to, n) => (to.kind === 'player' && prot(s, to.idx) ? 0 : n));

// ---- Windfall ----
EXT.rules.push([/^each player discards their hand, then draws cards equal to the greatest number of cards a player discarded this way$/, () => [{ k: 'ext', name: 'windfall' }]]);
EXT.seqs.unshift((sents, i, _ctx, ab) => {
  if (sents[i] !== 'each player discards their hand' || !/^(?:then )?(?:each player )?draws? cards equal to the greatest number of cards a player discarded this way$/.test(sents[i + 1] ?? '')) return null;
  ab.effects.push({ k: 'ext', name: 'windfall' });
  return 1;
});
EXT.effects.windfall = ({ s, api }) => {
  let most = 0;
  for (const pl of s.players) {
    const h = [...pl.hand];
    most = Math.max(most, h.length);
    for (const c of h) api.moveCard(s, c, 'graveyard', { cause: 'discard' });
  }
  for (const pl of s.players) api.drawCards(s, pl.idx, most);
  return 'done';
};

// ---- Intuition ----
EXT.seqs.unshift((sents, i, _ctx, ab) => {
  const a = sents[i].match(/^search your library for (three|two) (?:(.+?) )?cards and reveal them$/);
  if (!a || !/^(?:target opponent|an opponent) chooses one$/.test(sents[i + 1] ?? '') || !/^put that card into your hand and the rest into your graveyard$/.test(sents[i + 2] ?? '')) return null;
  let filter: any = {};
  if (a[2]) { const f = looseFilter(a[2]); if (!f) return null; filter = { ...f }; delete filter.zone; }
  ab.effects.push({ k: 'ext', name: 'intuition', n: a[1] === 'three' ? 3 : 2, filter });
  return /^then shuffle$/.test(sents[i + 3] ?? '') ? 3 : 2;
});
EXT.effects.intuition = ({ s, item, e, r, you, api }) => {
  const lib: string[] = api.P(s, you).library;
  if (!r.sub) {
    const cands = lib.filter((c) => !Object.keys(e.filter).length || api.matchesFilter(s, c, { ...e.filter, zone: 'library' }, you));
    r.sub = { stage: 'find' };
    if (!cands.length) { api.shuffleArr(s, lib); return 'done'; }
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'chooseCards', title: `${item.label}: find up to ${e.n} cards`, cards: cands, min: Math.min(e.n, cands.length), max: Math.min(e.n, cands.length), data: { ctx: 'resolve' } });
    return 'wait';
  }
  if (r.sub.stage === 'find') {
    const found: string[] = r.sub.answer ?? [];
    api.log(s, `${api.pname(s, you)} reveals ${found.map((c) => api.nm(s, c)).join(', ')}.`, you);
    if (!found.length) { api.shuffleArr(s, lib); return 'done'; }
    r.sub = { stage: 'opp', found };
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: 1 - you, kind: 'chooseCards', title: `${item.label}: choose the card ${api.pname(s, you)} puts into their hand`, cards: found, min: 1, max: 1, data: { ctx: 'resolve' } });
    return 'wait';
  }
  const pick = (r.sub.answer ?? [])[0] ?? r.sub.found[0];
  for (const c of r.sub.found as string[]) if (s.cards[c]?.zone === 'library') api.moveCard(s, c, c === pick ? 'hand' : 'graveyard');
  api.shuffleArr(s, lib);
  return 'done';
};

// ---- Gamble ----
EXT.rules.push([/^search your library for a card, put that card into your hand, discard a card at random(?:, then shuffle)?$/, () => [{ k: 'ext', name: 'search2', filter: {}, n: 1, upTo: false, dest: 'hand' }, { k: 'ext', name: 'discardRandom', n: 1 }]]);
EXT.rules.push([/^discard (a|two) cards? at random$/, (m) => [{ k: 'ext', name: 'discardRandom', n: m[1] === 'two' ? 2 : 1 }]]);
EXT.effects.discardRandom = ({ s, e, you, api }) => {
  for (let k = 0; k < e.n; k++) {
    const h = s.players[you].hand;
    if (!h.length) break;
    const c = h[Math.floor(api.rand(s) * h.length)];
    api.log(s, `${api.pname(s, you)} discards ${api.nm(s, c)} at random.`, you);
    api.moveCard(s, c, 'graveyard', { cause: 'discard' });
  }
  return 'done';
};

// ---- Worldly Tutor wording: "…, reveal it, then shuffle and put the card on top" ----
EXT.rules.push([/^search your library for (?:a|an) (.+?) card, reveal it, then shuffle and put the card on top$/, (m, ctx) => parseSentence(`search your library for a ${m[1]} card, reveal it, then shuffle and put that card on top`, ctx)]);
EXT.seqs.unshift((sents, i, ctx, ab) => {
  const a = sents[i].match(/^search your library for (?:a|an) (.+?) card, reveal it$/);
  if (!a || !/^(?:then )?shuffle and put the card on top(?: of your library)?$/.test(sents[i + 1] ?? '')) return null;
  const out = parseSentence(`search your library for a ${a[1]} card, reveal it, then shuffle and put that card on top`, ctx);
  if (!out || out.some((e: any) => e.k === 'manual')) return null;
  ab.effects.push(...out);
  return 1;
});

// "Creatures can't attack this turn." (Orim's Chant kicked)
EXT.rules.push([/^creatures can't attack this turn$/, () => [{ k: 'ext', name: 'noAttacksTurn' }]]);
EXT.effects.noAttacksTurn = ({ s }) => { (s as any).noAttackTurn = s.turn; return 'done'; };
EXT.hooks.canAttack.push((s) => ((s as any).noAttackTurn === s.turn ? false : undefined));

// ---- Ad Nauseam ----
EXT.seqs.unshift((sents, i, _ctx, ab) => {
  if (!/^reveal the top card of your library and put that card into your hand$/.test(sents[i]) || !/^you lose life equal to its mana value$/.test(sents[i + 1] ?? '') || !/^you may repeat this process any number of times$/.test(sents[i + 2] ?? '')) return null;
  ab.effects.push({ k: 'ext', name: 'adNauseam' });
  return 2;
});
EXT.effects.adNauseam = ({ s, r, you, api }) => {
  if (r.sub && r.sub.answered !== 'yes') return 'done';
  const top = api.P(s, you).library[0];
  if (!top) return 'done';
  const mv = s.defs[s.cards[top].defId].cmc ?? 0;
  api.log(s, `${api.pname(s, you)} reveals ${api.nm(s, top)} and loses ${mv} life.`, you);
  api.moveCard(s, top, 'hand');
  api.loseLife(s, you, mv);
  if (!api.P(s, you).library.length || s.players[you].life <= 0) return 'done';
  r.sub = {};
  api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'yesno', title: `Ad Nauseam: reveal another? (life ${s.players[you].life})`, options: [{ id: 'yes', label: 'Again' }, { id: 'no', label: 'Stop' }], data: { ctx: 'resolve' } });
  return 'wait';
};

// ---- Thassa's Oracle ----
EXT.seqs.unshift((sents, i, _ctx, ab) => {
  if (!/^look at the top x cards of your library, where x is your devotion to blue$/.test(sents[i])) return null;
  if (!/^put up to one of them on top of your library and the rest on the bottom of your library in a random order$/.test(sents[i + 1] ?? '')) return null;
  if (!/^if x is greater than or equal to the number of cards in your library, you win the game$/.test(sents[i + 2] ?? '')) return null;
  ab.effects.push({ k: 'ext', name: 'thassa' });
  return 2;
});
EXT.effects.thassa = ({ s, r, you, api }) => {
  const lib: string[] = api.P(s, you).library;
  const x = api.amount(s, { controller: you, source: undefined } as any, { ext: 'devotion', colors: ['U'] });
  if (!r.sub) {
    r.sub = { x, top: lib.slice(0, x) };
    if (r.sub.top.length) {
      api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'chooseCards', title: `Thassa's Oracle (X=${x}): keep up to one on top`, cards: r.sub.top, min: 0, max: 1, data: { ctx: 'resolve' } });
      return 'wait';
    }
  }
  const keep = (r.sub.answer ?? [])[0];
  const rest = (r.sub.top as string[]).filter((c) => c !== keep && s.cards[c]?.zone === 'library');
  api.shuffleArr(s, rest);
  for (const c of rest) api.moveCard(s, c, 'libraryBottom');
  if (keep && s.cards[keep]?.zone === 'library') { lib.splice(lib.indexOf(keep), 1); lib.unshift(keep); }
  if (r.sub.x >= lib.length) {
    api.log(s, `${api.pname(s, you)} wins the game (Thassa's Oracle).`, you);
    for (const pl of s.players) if (pl.idx !== you) pl.lost = true; // state-based actions end the game
  }
  return 'done';
};

// "That creature's controller gains life equal to its power." (Solitude, Swords to Plowshares wording variants)
EXT.rules.push([/^(that creature's|its) controller gains life equal to its (power|toughness)$/, (m, ctx) => (ctx.last ? [{ k: 'gain', n: { [m[2]]: ctx.last }, who: { t: 'controllerOf', of: ctx.last } }] : null)]);

// Characteristic-defining P/T: "~'s power is equal to X and its toughness is equal to that number plus 1" (Tarmogoyf, Lhurgoyf)
EXT.lines.push((line, pc) => {
  let m = line.match(/^~'s power is equal to (.+?) and its toughness is equal to that number plus (\d+|one)$/);
  if (m) {
    const a: any = parseCountPhrase(m[1]);
    if (!a || typeof a !== 'object') return false;
    pc.statics.push({ kind: 'setPT', p: 0, t: 0, kw: [], setP: a, setT: { ...a, add: (a.add ?? 0) + (m[2] === 'one' ? 1 : +m[2]) } });
    return true;
  }
  // "~ gets -X/-X, where X is your life total." (Death's Shadow) / "~ gets +X/+X, where X is …"
  m = line.match(/^~ gets ([+-])x\/([+-])x, where x is (.+)$/);
  if (m) {
    const a: any = parseAmtPhrase(m[3], { specs: [], selfName: '~', last: { t: 'self' } } as any);
    if (!a || typeof a !== 'object') return false;
    const sp = (sign: string) => ({ ...a, mult: (a.mult ?? 1) * (sign === '-' ? -1 : 1) });
    pc.statics.push({ kind: 'selfPump', p: sp(m[1]), t: sp(m[2]), kw: [] } as any);
    return true;
  }
  return false;
});
EXT.amountPhrases.push((ph) => {
  if (/^(?:the number of )?card types among cards in all graveyards$/.test(ph)) return { ext: 'gyTypes', all: true };
  return null;
});

// "Target instant or sorcery card in your graveyard gains flashback until end of turn. The flashback cost is equal to its
//  mana cost." (Snapcaster Mage) / "Each instant and sorcery card in your graveyard gains flashback until end of turn." (Past in Flames)
EXT.rules.push([/^(.+?) gains? flashback(?: ((?:\{[^}]+\})+))? until end of turn$/, (m, ctx) => {
  const n = ctx.specs.length;
  const what = parseSubject(m[1], ctx);
  if (!what) { ctx.specs.length = n; return null; }
  return [{ k: 'ext', name: 'grantFlashback', what, cost: m[2]?.toUpperCase() }];
}]);
EXT.rules.push([/^the flashback cost is equal to its mana cost$/, () => []]);
EXT.effects.grantFlashback = ({ s, item, e, api }) => {
  for (const c of api.subjCards(s, item, e.what)) if (s.cards[c]?.zone === 'graveyard') (s.cards[c] as any).tempFlashback = { turn: s.turn, cost: e.cost };
  return 'done';
};

// Mana Drain: "Counter target spell. At the beginning of your next main phase, add an amount of {C} equal to that spell's mana value."
EXT.seqs.unshift((sents, i, ctx, ab) => {
  if (sents[i] !== 'counter target spell' || !/^at the beginning of your next main phase, add an amount of \{c\} equal to that spell's mana value$/.test(sents[i + 1] ?? '')) return null;
  const out = parseSentence(sents[i], ctx);
  if (!out) return null;
  ab.effects.push({ k: 'ext', name: 'noteTargetMv', spec: 0 }, ...out, { k: 'ext', name: 'delayedColorless' });
  return 1;
});
EXT.effects.noteTargetMv = ({ s, item, e }) => {
  const t: any = (item.targets[e.spec] ?? [])[0];
  const it = t?.kind === 'stack' ? s.stack.find((x: any) => x.id === t.id) : null;
  (item as any).notedMv = it ? s.defs[s.cards[it.source]?.defId]?.cmc ?? 0 : 0;
  return 'done';
};
EXT.effects.delayedColorless = ({ s, item, you }) => {
  const n = (item as any).notedMv ?? 0;
  if (n > 0) ((s as any).delayedMana ??= []).push({ p: you, n, after: s.turn, done: false });
  return 'done';
};
EXT.hooks.step.push((s, step, api) => {
  if (step !== 'main1' && step !== 'main2') return;
  for (const d of ((s as any).delayedMana ?? []) as any[]) {
    if (d.done || d.p !== s.active || (s.turn === d.after && step === 'main1')) continue;
    if (s.turn === d.after && step === 'main2' && (s as any).delayedMana) { /* cast in main 1 → "next main phase" is main 2 */ }
    d.done = true;
    api.P(s, d.p).pool.C += d.n;
    api.log(s, `${api.pname(s, d.p)} adds ${d.n} colorless mana.`, d.p);
  }
  (s as any).delayedMana = ((s as any).delayedMana ?? []).filter((d: any) => !d.done);
});

// Chalice of the Void / Eidolon of the Great Revel
EXT.lines.push((line, pc) => {
  let m = line.match(/^whenever a player casts a spell with mana value equal to the number of (\w+) counters on ~, counter that spell$/);
  if (m) {
    pc.triggers.push({ event: 'anyCast', text: line, ability: { text: line, effects: [{ k: 'ext', name: 'chalice', counter: m[1] }], specs: [], manual: [] } });
    return true;
  }
  m = line.match(/^whenever a player casts a spell with mana value (\d+) or (less|greater), (.+)$/);
  if (m) {
    const ab = parseAbility(`${m[3].replace(/\bthat player\b/g, 'that player')}.`, { lastPlayer: { t: 'triggerPlayer' } } as any);
    if (ab.manual.length) return false;
    pc.triggers.push({ event: 'anyCast', text: line, filter: { types: ['spell'], zone: 'stack', [m[2] === 'less' ? 'cmcMax' : 'cmcMin']: +m[1] }, ability: ab });
    return true;
  }
  return false;
});
EXT.effects.chalice = ({ s, item, e, api }) => {
  const src = (item as any).triggerObj;
  const it = s.stack.find((x: any) => x.kind === 'spell' && x.source === src);
  const c = s.cards[item.source];
  if (!it || !c) return 'done';
  if ((s.defs[s.cards[src].defId].cmc ?? 0) !== (c.counters[e.counter] ?? 0)) return 'done';
  if (api.chars(s, src).pc.cantBeCountered) return 'done';
  api.counterItem(s, it);
  return 'done';
};

// Trinisphere: "As long as ~ is untapped, each spell that would cost less than three mana to cast costs three mana to cast."
EXT.lines.push((line, pc) => {
  if (!/^as long as ~ is untapped, each spell that would cost less than three mana to cast costs three mana to cast$/.test(line)) return false;
  pc.costFloor = 3;
  return true;
});
EXT.hooks.costMod.push((s, _p, _iid, cost, _alt, api) => {
  const floor = Math.max(0, ...sourcesWith(s, 'costFloor').filter((b) => !s.cards[b].tapped).map((b) => (api.chars(s, b).pc as any).costFloor ?? 0));
  if (!floor) return cost;
  const total = (cost.match(/\{[^}]+\}/g) ?? []).reduce((t, sym) => t + (/^\{\d+\}$/.test(sym) ? +sym.slice(1, -1) : /X/i.test(sym) ? 0 : 1), 0);
  if (total >= floor) return cost;
  const g = +(cost.match(/\{(\d+)\}/)?.[1] ?? 0) + (floor - total);
  return `{${g}}` + cost.replace(/\{\d+\}/g, '');
});

// Amulet of Vigor: "Whenever a permanent you control enters tapped, untap it."
EXT.lines.push((line, pc) => {
  if (!/^whenever a permanent you control enters tapped, untap it$/.test(line)) return false;
  pc.amuletUntap = true;
  return true;
});
EXT.hooks.afterMove.push((s, iid, _from, to, _o, api) => {
  if (to !== 'battlefield' || !s.cards[iid]?.tapped) return;
  const ctrl = s.cards[iid].controller;
  for (const b of sourcesWith(s, 'amuletUntap')) {
    if (s.cards[b].controller !== ctrl || !(api.chars(s, b).pc as any).amuletUntap) continue;
    s.pendingTriggers.push({ id: api.uid(s, 's'), kind: 'trigger', controller: ctrl, source: b, label: `${api.nm(s, b)} — untap`, text: 'Untap it.', effects: [{ k: 'ext', name: 'untapObj', iid }], targets: [] } as any);
  }
});
EXT.effects.untapObj = ({ s, e }) => { if (s.cards[e.iid]?.zone === 'battlefield') s.cards[e.iid].tapped = false; return 'done'; };

// Price of Progress: "~ deals damage to each player equal to twice the number of nonbasic lands that player controls."
EXT.rules.push([/^~ deals damage to each player equal to (twice )?the number of (.+?) that player controls$/, (m) => {
  const f = looseFilter(m[2].replace(/s$/, ''));
  if (!f) return null;
  const g: any = { ...f };
  delete g.zone;
  return [{ k: 'ext', name: 'dmgPerPlayerCount', filter: g, mult: m[1] ? 2 : 1 }];
}]);
EXT.effects.dmgPerPlayerCount = ({ s, item, e, api }) => {
  for (const pl of s.players) {
    const n = s.battlefield.filter((b) => s.cards[b].controller === pl.idx && api.matchesFilter(s, b, { ...e.filter, zone: 'battlefield' }, pl.idx)).length * e.mult;
    if (n > 0) api.dealDamage(s, item.source, { kind: 'player', idx: pl.idx }, n, false);
  }
  return 'done';
};

// Uro / Kroxa: "When ~ enters, sacrifice it unless it escaped."
EXT.rules.push([/^sacrifice (?:it|~) unless it escaped$/, () => [{ k: 'ext', name: 'sacUnlessEscaped' }]]);
EXT.effects.sacUnlessEscaped = ({ s, item, api }) => {
  const c = s.cards[item.source];
  if (c?.zone === 'battlefield' && !c.escaped) api.moveCard(s, item.source, 'graveyard', { cause: 'sacrifice' });
  return 'done';
};

// Kroxa: "Each opponent discards a card, then each opponent who didn't discard a nonland card this way loses 3 life."
EXT.seqs.unshift((sents, i, _ctx, ab) => {
  if (sents[i] !== 'each opponent discards a card') return null;
  const m = (sents[i + 1] ?? '').match(/^(?:then )?each opponent who didn't discard a nonland card this way loses (\d+) life$/);
  if (!m) return null;
  ab.effects.push({ k: 'ext', name: 'discardOrLose', n: +m[1] });
  return 1;
});
EXT.effects.discardOrLose = ({ s, item, e, r, you, api }) => {
  const opp = 1 - you;
  const hand = s.players[opp].hand;
  if (!r.sub) {
    if (!hand.length) { api.loseLife(s, opp, e.n); return 'done'; }
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: opp, kind: 'chooseCards', title: `${item.label}: discard a card (a land means you also lose ${e.n} life)`, cards: [...hand], min: 1, max: 1, data: { ctx: 'resolve' } });
    return 'wait';
  }
  const c = (r.sub.answer ?? [])[0];
  let nonland = false;
  if (c && s.cards[c]?.zone === 'hand') {
    nonland = !/\bLand\b/.test(s.defs[s.cards[c].defId].typeLine.split(' // ')[0]);
    api.moveCard(s, c, 'graveyard', { cause: 'discard' });
  }
  if (!nonland) api.loseLife(s, opp, e.n);
  return 'done';
};

// Show and Tell: "Each player may put an artifact, creature, enchantment, or land card from their hand onto the battlefield."
EXT.rules.push([/^each player may put (?:a|an) (.+?) card from their hand onto the battlefield$/, (m) => {
  const types = m[1].replace(/,? or /g, ', ').split(', ').map((x) => x.trim());
  if (!types.every((t) => ['artifact', 'creature', 'enchantment', 'land', 'planeswalker', 'battle', 'permanent'].includes(t))) return null;
  return [{ k: 'ext', name: 'eachPutFromHand', types }];
}]);
EXT.effects.eachPutFromHand = ({ s, item, e, r, you, api }) => {
  const order = [you, 1 - you];
  r.sub ??= { i: 0, picks: {} as Record<number, string> };
  if (r.sub.answer !== undefined) { const c = r.sub.answer[0]; if (c) r.sub.picks[order[r.sub.i]] = c; r.sub.answer = undefined; r.sub.i++; }
  while (r.sub.i < order.length) {
    const p = order[r.sub.i];
    const cands = s.players[p].hand.filter((h) => { const tl = s.defs[s.cards[h].defId].typeLine.split(' // ')[0].toLowerCase(); return e.types.some((t: string) => (t === 'permanent' ? /artifact|creature|enchantment|land|planeswalker|battle/.test(tl) : tl.includes(t))); });
    if (cands.length) {
      api.pushPrompt(s, { id: api.uid(s, 'p'), player: p, kind: 'chooseCards', title: `${item.label}: you may put a card onto the battlefield`, cards: cands, min: 0, max: 1, data: { ctx: 'resolve' } });
      return 'wait';
    }
    r.sub.i++;
  }
  // all at the same time
  for (const [p, c] of Object.entries(r.sub.picks)) if (s.cards[c as string]?.zone === 'hand') api.moveCard(s, c as string, 'battlefield', { controller: +p });
  return 'done';
};

// Living End
EXT.seqs.unshift((sents, i, _ctx, ab) => {
  if (sents[i] !== 'each player exiles all creature cards from their graveyard') return null;
  if (!/^(?:then )?(?:each player )?sacrifices all creatures they control$/.test(sents[i + 1] ?? '')) return null;
  if (!/^(?:then )?(?:each player )?puts all cards they exiled this way onto the battlefield$/.test(sents[i + 2] ?? '')) return null;
  ab.effects.push({ k: 'ext', name: 'livingEnd' });
  return 2;
});
EXT.effects.livingEnd = ({ s, api }) => {
  const ex: Record<number, string[]> = {};
  for (const pl of s.players) {
    ex[pl.idx] = pl.graveyard.filter((g) => /\bCreature\b/.test(s.defs[s.cards[g].defId].typeLine.split(' // ')[0]));
    for (const c of ex[pl.idx]) api.moveCard(s, c, 'exile');
  }
  for (const b of [...s.battlefield]) if (s.cards[b] && api.chars(s, b).types.has('creature')) api.moveCard(s, b, 'graveyard', { cause: 'sacrifice' });
  for (const pl of s.players) for (const c of ex[pl.idx]) if (s.cards[c]?.zone === 'exile') api.moveCard(s, c, 'battlefield', { controller: pl.idx });
  return 'done';
};

// Aether Vial: "You may put a creature card with mana value equal to the number of charge counters on ~ from your hand onto the battlefield."
EXT.rules.push([/^(?:you may )?put a (.+?) card with mana value equal to the number of (\w+) counters on ~ from your hand onto the battlefield$/, (m) => {
  const f = looseFilter(m[1]);
  if (!f) return null;
  const g: any = { ...f };
  delete g.zone;
  return [{ k: 'ext', name: 'vialPut', filter: g, counter: m[2] }];
}]);
EXT.effects.vialPut = ({ s, item, e, r, you, api }) => {
  const n = s.cards[item.source]?.counters?.[e.counter] ?? 0;
  const cands = s.players[you].hand.filter((h) => (s.defs[s.cards[h].defId].cmc ?? 0) === n && api.matchesFilter(s, h, { ...e.filter, zone: 'hand' }, you));
  if (!r.sub) {
    if (!cands.length) return 'done';
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'chooseCards', title: `${item.label}: put a card with mana value ${n} onto the battlefield`, cards: cands, min: 0, max: 1, data: { ctx: 'resolve' } });
    return 'wait';
  }
  const c = (r.sub.answer ?? [])[0];
  if (c && s.cards[c]?.zone === 'hand') api.moveCard(s, c, 'battlefield', { controller: you });
  return 'done';
};

// Eminence: "if ~ is in the command zone or on the battlefield" (Edgar Markov, The Ur-Dragon, Arahbo)
EXT.conds.push((t) => (/^~ is in the command zone or on the battlefield$/.test(t) ? { k: 'ext', name: 'cmdOrBf' } : null));
EXT.condEval.cmdOrBf = (s, _c, _you, self) => !!self && ['command', 'battlefield'].includes(s.cards[self]?.zone as string);
EXT.post.push((pc) => { if (pc.triggers.some((t: any) => t.cond?.name === 'cmdOrBf')) pc.eminence = true; });

// Theros gods: "As long as your devotion to white (and black) is less than five, ~ isn't a creature."
const COLW: Record<string, string> = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };
const NUMW: Record<string, number> = { three: 3, four: 4, five: 5, six: 6, seven: 7 };
EXT.lines.push((line, pc) => {
  const m = line.match(/^as long as your devotion to (white|blue|black|red|green)(?: and (white|blue|black|red|green))? is less than (\w+), ~ isn't a creature$/);
  if (!m) return false;
  pc.statics.push({ kind: 'selfPump', p: 0, t: 0, kw: [], notCreatureBelow: { amt: { ext: 'devotion', colors: [COLW[m[1]], ...(m[2] ? [COLW[m[2]]] : [])] }, n: NUMW[m[3]] ?? +m[3] } } as any);
  return true;
});

// Underworld Breach: "Each nonland card in your graveyard has escape. The escape cost is equal to the card's mana cost plus
// exile three other cards from your graveyard."
EXT.lines.push((line, pc) => {
  if (!/^each nonland card in your graveyard has escape\. the escape cost is equal to the card's mana cost plus exile three other cards from your graveyard$/.test(line)) return false;
  pc.breach = 3;
  return true;
});
EXT.seqs.unshift((sents, i, _ctx, ab) => {
  if (sents[i] !== 'each nonland card in your graveyard has escape' || !/^the escape cost is equal to the card's mana cost plus exile three other cards from your graveyard$/.test(sents[i + 1] ?? '')) return null;
  ab.effects.push({ k: 'ext', name: 'noop' });
  return 1;
});
EXT.effects.noop = () => 'done';
const breachN = (s: any, p: number, api: any) => Math.max(0, ...sourcesWith(s, 'breach').filter((b: string) => s.cards[b].controller === p).map((b: string) => (api.chars(s, b).pc as any).breach ?? 0));
EXT.hooks.zoneCast.push((s, p, card, _pc, api) => {
  if (card.zone !== 'graveyard' || card.owner !== p || /\bLand\b/.test(s.defs[card.defId].typeLine.split(' // ')[0])) return null;
  const n = breachN(s, p, api);
  return n && s.players[p].graveyard.filter((g: string) => g !== card.iid).length >= n ? 'ext:breach' : null;
});
EXT.alts.breach = {
  begin: (s, _p, iid) => s.defs[s.cards[iid].defId].manaCost || '',
  costs: (s, pc, api) => {
    if (pc.extBreach) return false;
    const n = breachN(s, pc.player, api);
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: pc.player, kind: 'chooseCards', title: `${pc.label}: escape — exile ${n} other cards from your graveyard`, cards: s.players[pc.player].graveyard.filter((g: string) => g !== pc.iid), min: n, max: n, canCancel: true, data: { ctx: 'cast', cost: 'extBreach' } });
    return true;
  },
  pay: (s, pc, api) => { for (const x of pc.extBreach ?? []) if (s.cards[x]?.zone === 'graveyard') api.moveCard(s, x, 'exile'); },
};

// ---- The One Ring: "you gain protection from everything until your next turn" (damage prevented, can't be targeted) ----
EXT.rules.push([/^(?:until your next turn, you gain protection from everything|you gain protection from everything until your next turn)$/, () => [{ k: 'ext', name: 'protAll' }]]);
EXT.effects.protAll = ({ s, you }) => { (s.players[you] as any).protAllUntil = s.turn + (s.active === you ? 2 : 1); return 'done'; };
EXT.hooks.damage.push((s, _src, to, n) => (to.kind === 'player' && ((s.players[to.idx] as any).protAllUntil ?? 0) > s.turn ? 0 : n));
EXT.lines.push((line, pc) => {
  if (line === 'you have hexproof') { pc.playerHexproof = true; return true; }
  if (line === 'you have shroud') { pc.playerShroud = true; return true; }
  return false;
});
