// Plugin: the long tail — many small keywords, effect sentences and statics.
import { EXT } from '../ext';
import { sourcesWith } from '../rules';
import { parseSubject, parsePlayerSubject, parseSentence, parseCountPhrase, parseKeywordList, parseCostText, mkAct, parseFilter } from '../oracle';
import type { GameState, PlayerIdx } from '../types';

const W: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };
const n0 = (w: string) => (/^\d+$/.test(w) ? +w : W[w] ?? 1);
const C = (x: string) => x.toUpperCase();
const ab = (text: string, effects: any[], specs: any[] = []) => ({ text, effects, specs, manual: [] });
const subj = (w: string, ctx: any) => (w === '~' ? { t: 'self' } : ['it', 'that creature'].includes(w) ? ctx.last ?? { t: 'self' } : parseSubject(w, ctx));
const COST = '(\\{[^}]+\\}(?:\\{[^}]+\\})*)';

// ------------------------------------------------------------------------------------------
// counter unless pays {X} / {1} for each …
// ------------------------------------------------------------------------------------------
EXT.rules.push([/^counter (target .+?) unless its controller pays \{x\}$/, (m, ctx) => { const w = parseSubject(m[1], ctx); return w ? [{ k: 'counterSpell', what: w, unlessPay: 'X' }] : null; }]);
EXT.rules.push([/^counter (target .+?) unless its controller pays \{(\d+)\} for each (.+)$/, (m, ctx) => {
  const w = parseSubject(m[1], ctx);
  const a = parseCountPhrase(m[3]);
  return w && a ? [{ k: 'counterSpell', what: w, unlessPay: typeof a === 'object' ? { ...a, mult: +m[2] } : a }] : null;
}]);

// ------------------------------------------------------------------------------------------
// "X gets +N/+N until end of turn and can't be blocked this turn" — two effects in one sentence
// ------------------------------------------------------------------------------------------
EXT.rules.push([/^(.+?) ((?:gets [+-]\d+\/[+-]\d+(?: and gains [a-z ,]+?)?|gains [a-z ,]+?) until end of turn) and can't be blocked this turn$/, (m, ctx) => {
  const a = parseSentence(`${m[1]} ${m[2]}`, ctx);
  const b = parseSentence(`${/^target /.test(m[1]) ? 'it' : m[1]} can't be blocked this turn`, ctx);
  return a && b ? [...a, ...b] : null;
}]);

// ------------------------------------------------------------------------------------------
// small effects
// ------------------------------------------------------------------------------------------
EXT.rules.push([/^(?:you may )?play an additional land this turn$/, () => [{ k: 'ext', name: 'extraLand' }]]);
EXT.effects.extraLand = ({ s, you }) => {
  const pl = s.players[you] as any;
  pl.extraLands = pl.extraLands?.turn === s.turn ? { turn: s.turn, n: pl.extraLands.n + 1 } : { turn: s.turn, n: 1 };
  return 'done';
};
EXT.rules.push([/^(?:you|that player|target player|target opponent) skips? (?:your|their) next turn$/, (m, ctx) => [{ k: 'ext', name: 'skipTurn', who: /^you/.test(m[0]) ? { t: 'you' } : parsePlayerSubject(m[0].split(' skip')[0], ctx) }]]);
EXT.effects.skipTurn = ({ s, item, e, api }) => {
  for (const p of api.subjPlayers(s, item, e.who)) (s.players[p] as any).skipTurns = ((s.players[p] as any).skipTurns ?? 0) + 1;
  return 'done';
};
EXT.rules.push([/^(its controller|that player|their controller|each opponent|defending player) mills (\w+) cards?$/, (m, ctx) => {
  const who = m[1] === 'its controller' || m[1] === 'their controller' ? (ctx.last ? { t: 'controllerOf', of: ctx.last } : null) : m[1] === 'defending player' ? { t: 'defending' } : parsePlayerSubject(m[1], ctx);
  return who ? [{ k: 'mill', who, n: m[2] === 'x' ? 'X' : n0(m[2]) }] : null;
}]);
EXT.rules.push([/^put target card from your graveyard on the bottom of your library$/, (_m, ctx) => {
  ctx.specs.push({ filter: { types: ['card'], zone: 'graveyard', owner: 'you' }, players: null, count: 1, upTo: false, label: 'target card in your graveyard' });
  return [{ k: 'ext', name: 'toBottom', what: { t: 'target', spec: ctx.specs.length - 1 } }];
}]);
EXT.effects.toBottom = ({ s, item, e, api }) => { for (const c of api.subjCards(s, item, e.what)) api.moveCard(s, c, 'libraryBottom'); return 'done'; };
EXT.rules.push([/^remove (a|an|one|two|three|\w+) ([+-]\d\/[+-]\d|[a-z]+) counters? from (~|it|target creature|target permanent)$/, (m, ctx) => {
  const what = subj(m[3], ctx);
  return what ? [{ k: 'ext', name: 'removeCounters', what, counter: m[2], n: n0(m[1]) }] : null;
}]);
EXT.effects.removeCounters = ({ s, item, e, api }) => {
  for (const c of api.subjCards(s, item, e.what)) {
    const card = s.cards[c];
    card.counters[e.counter] = Math.max(0, (card.counters[e.counter] ?? 0) - e.n);
    api.ev(s, { k: 'counter', iid: c, counter: e.counter, n: -e.n, total: card.counters[e.counter] });
  }
  return 'done';
};
EXT.rules.push([/^have (~|it) deal (\w+) damage to (.+)$/, (m, ctx) => parseSentence(`${m[1]} deals ${m[2]} damage to ${m[3]}`, ctx)]);
EXT.rules.push([/^put (\w+) cards? from your hand on top of your library(?: in any order)?$/, (m) => [{ k: 'ext', name: 'handToTop', n: n0(m[1]) }]]);
EXT.effects.handToTop = ({ s, e, r, you, api }) => {
  const hand = api.P(s, you).hand as string[];
  if (!r.sub) {
    const n = Math.min(e.n, hand.length);
    if (!n) return 'done';
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'chooseCards', title: `Put ${n} card${n > 1 ? 's' : ''} from your hand on top of your library`, cards: [...hand], min: n, max: n, data: { ctx: 'resolve' } });
    return 'wait';
  }
  for (const c of [...((r.sub.answer ?? []) as string[])].reverse()) api.moveCard(s, c, 'libraryTop');
  return 'done';
};
EXT.rules.push([/^until end of turn, you don't lose this mana as steps and phases end$/, () => [{ k: 'ext', name: 'keepMana' }]]);
EXT.rules.push([/^you don't lose this mana as steps and phases end this turn$/, () => [{ k: 'ext', name: 'keepMana' }]]);
EXT.effects.keepMana = ({ s, you }) => { (s.players[you] as any).keepManaTurn = s.turn; return 'done'; };
EXT.rules.push([/^creatures without flying can't block this turn$/, () => [{ k: 'ext', name: 'noGroundBlock' }]]);
EXT.effects.noGroundBlock = ({ s }) => { (s as any).noGroundBlockTurn = s.turn; return 'done'; };
EXT.hooks.canBlock.push((s, blocker, _a, api) => ((s as any).noGroundBlockTurn === s.turn && !api.chars(s, blocker).keywords.has('flying') ? false : undefined));
EXT.rules.push([/^(target creature|it|that creature) deals damage to itself equal to its power$/, (m, ctx) => {
  const w = subj(m[1], ctx);
  return w ? [{ k: 'ext', name: 'selfDamage', what: w }] : null;
}]);
EXT.effects.selfDamage = ({ s, item, e, api }) => {
  for (const c of api.subjCards(s, item, e.what)) if (s.cards[c]?.zone === 'battlefield') api.dealDamage(s, c, { kind: 'card', iid: c }, Math.max(0, api.chars(s, c).power), false);
  return 'done';
};
EXT.rules.push([/^(~|it|that creature) becomes an? (artifact creature|creature) until end of turn$/, (m, ctx) => {
  const w = subj(m[1], ctx);
  return w ? [{ k: 'ext', name: 'becomeCreature', what: w }] : null;
}]);
EXT.effects.becomeCreature = ({ s, item, e, api }) => {
  for (const c of api.subjCards(s, item, e.what)) s.cards[c].mods.push({ addTypes: ['creature'], until: e.perm ? 'permanent' : 'eot', source: item.source, ts: s.ts++ } as any);
  return 'done';
};
EXT.rules.push([/^look at (target player's|target opponent's|an opponent's|each opponent's) hand$/, (m, ctx) => {
  const who = m[1].startsWith('target') ? parsePlayerSubject(m[1].replace(/'s$/, ''), ctx) : { t: 'eachOpp' };
  return who ? [{ k: 'revealHand', who }] : null;
}]);
EXT.rules.push([/^exile ~ with (\w+) time counters? on it$/, (m) => [{ k: 'ext', name: 'selfSuspend', n: n0(m[1]) }]]);
EXT.effects.selfSuspend = ({ s, item, e, api }) => {
  const c = s.cards[item.source] as any;
  if (!c) return 'done';
  api.moveCard(s, item.source, 'exile');
  c.suspended = true;
  c.counters = { ...(c.counters ?? {}), time: e.n };
  api.log(s, `${api.nm(s, item.source)} is exiled with ${e.n} time counters.`, item.controller);
  return 'done';
};
EXT.rules.push([/^return ~ from your graveyard to the battlefield(?: tapped)? with a finality counter on it$/, (m) => [{ k: 'ext', name: 'returnFinality', tapped: /tapped/.test(m[0]) }]]);
EXT.effects.returnFinality = ({ s, item, e, api }) => {
  const c = s.cards[item.source];
  if (!c || c.zone !== 'graveyard') return 'done';
  api.moveCard(s, item.source, 'battlefield', { controller: c.owner, tapped: e.tapped });
  api.addCounters(s, item.source, 'finality', 1);
  return 'done';
};
EXT.rules.push([/^detain (target .+)$/, (m, ctx) => { const w = parseSubject(m[1], ctx); return w ? [{ k: 'ext', name: 'detain', what: w }] : null; }]);
EXT.effects.detain = ({ s, item, e, you, api }) => {
  for (const c of api.subjCards(s, item, e.what)) (s.cards[c] as any).detained = { by: you, turn: s.turn };
  return 'done';
};
const detained = (s: GameState, iid: string) => {
  const d = (s.cards[iid] as any)?.detained;
  if (!d) return false;
  // until your next turn: over once the detaining player starts a later turn
  return !(s.turn > d.turn && s.active === d.by);
};
EXT.hooks.canAttack.push((s, iid) => (detained(s, iid) ? false : undefined));
EXT.hooks.canBlock.push((s, b) => (detained(s, b) ? false : undefined));
EXT.rules.push([/^(?:you may )?tap or untap target (artifact, creature, or land|permanent|creature|land|artifact)$/, (m, ctx) => {
  const f = m[1] === 'artifact, creature, or land' ? { types: ['artifact', 'creature', 'land'] } : { types: [m[1]] };
  ctx.specs.push({ filter: f, players: null, count: 1, upTo: true, label: `target ${m[1]}` });
  return [{ k: 'ext', name: 'tapToggle', what: { t: 'target', spec: ctx.specs.length - 1 } }];
}]);
EXT.effects.tapToggle = ({ s, item, e, api }) => {
  for (const c of api.subjCards(s, item, e.what)) {
    const was = s.cards[c].tapped;
    s.cards[c].tapped = !was;
    if (was) api.emit(s, 'untapped', { iid: c });
  }
  return 'done';
};
// tap-lock: "it doesn't untap during its controller's untap step for as long as ~ remains tapped"
EXT.rules.push([/^(?:it|that creature|that permanent) doesn't untap during its controller's untap step for as long as ~ remains tapped$/, (_m, ctx) => [{ k: 'ext', name: 'tapLock', what: ctx.last ?? { t: 'target', spec: 0 } }]]);
EXT.effects.tapLock = ({ s, item, e, api }) => {
  for (const c of api.subjCards(s, item, e.what)) (s.cards[c] as any).tapLockBy = item.source;
  return 'done';
};
EXT.hooks.untap.push((s, iid) => {
  const by = (s.cards[iid] as any)?.tapLockBy;
  if (!by) return undefined;
  if (s.cards[by]?.zone === 'battlefield' && s.cards[by].tapped) return false;
  (s.cards[iid] as any).tapLockBy = undefined;
  return undefined;
});

// "target creature blocks ~ this turn if able" / provoke
EXT.rules.push([/^(target creature(?: defending player controls| an opponent controls)?) blocks ~ this turn if able$/, (m, ctx) => {
  const w = parseSubject(m[1], ctx);
  return w ? [{ k: 'ext', name: 'forceBlock', what: w }] : null;
}]);
EXT.effects.forceBlock = ({ s, item, e, api }) => {
  for (const c of api.subjCards(s, item, e.what)) (s.cards[c] as any).mustBlock = { attacker: item.source, turn: s.turn };
  return 'done';
};
EXT.lines.push((line, pc) => {
  if (line !== 'provoke') return false;
  pc.triggers.push({ event: 'attacks', text: line, ability: ab('provoke', [{ k: 'untap', what: { t: 'target', spec: 0 } }, { k: 'ext', name: 'forceBlock', what: { t: 'target', spec: 0 } }], [{ filter: { types: ['creature'], controller: 'opp' }, players: null, count: 1, upTo: true, label: 'target creature defending player controls (provoke)' }]) });
  return true;
});
EXT.hooks.validateBlocks.push((s, list, api) => {
  for (const b of s.battlefield) {
    const mb = (s.cards[b] as any).mustBlock;
    if (!mb || mb.turn !== s.turn || s.cards[b].tapped) continue;
    if (!s.combat?.attackers.some((a) => a.iid === mb.attacker)) continue;
    if (!api.canBlock(s, b, mb.attacker)) continue;
    if (!list.some((x) => x.blocker === b && x.attacker === mb.attacker)) return `${api.nm(s, b)} must block ${api.nm(s, mb.attacker)} if able`;
  }
  return null;
});

// "after this main phase, there is an additional combat phase followed by an additional main phase"
EXT.rules.push([/^after this (?:main )?phase, there is an additional combat phase(?: followed by an additional main phase)?$/, () => [{ k: 'ext', name: 'extraCombat' }]]);
EXT.rules.push([/^there is an additional combat phase after this phase$|^untap all creatures you control\. after this phase, there is an additional combat phase$/, () => [{ k: 'ext', name: 'extraCombat' }]]);
EXT.effects.extraCombat = ({ s, api }) => {
  const x = ((s as any).extraCombats ??= { turn: s.turn, n: 0 });
  if (x.turn !== s.turn) { x.turn = s.turn; x.n = 0; }
  x.n++;
  api.log(s, 'There will be an additional combat phase.', s.active, 'turn');
  return 'done';
};

// ------------------------------------------------------------------------------------------
// statics / lines
// ------------------------------------------------------------------------------------------
EXT.lines.push((line, pc) => {
  let m: RegExpMatchArray | null;
  if ((m = line.match(/^~ has (.+) as long as it's (attacking|blocking)$/)) || (m = line.match(/^as long as ~ is (attacking|blocking), it has (.+)$/))) {
    const kwText = m[0].startsWith('as long') ? m[2] : m[1];
    const state = m[0].startsWith('as long') ? m[1] : m[2];
    const kw = parseKeywordList(kwText);
    if (!kw) return false;
    pc.statics.push({ kind: 'selfPump', p: 0, t: 0, kw, cond: { k: 'ext', name: 'selfCombat', state } });
    return true;
  }
  if ((m = line.match(/^~ gets ([+-]\d+)\/([+-]\d+) as long as it's (attacking|blocking)$/))) {
    pc.statics.push({ kind: 'selfPump', p: +m[1], t: +m[2], kw: [], cond: { k: 'ext', name: 'selfCombat', state: m[3] } });
    return true;
  }
  if (/^if damage would be dealt to ~, prevent that damage\. remove a \+1\/\+1 counter from ~$/.test(line)) { pc.phantom = true; return true; }
  if ((m = line.match(/^each player can't cast more than (\w+) spells? each turn$/))) { pc.spellLimit = n0(m[1]); return true; }
  if (/^a deck can have any number of cards named ~$/.test(line)) return true;
  if ((m = line.match(/^scavenge (\{[^}]+\}(?:\{[^}]+\})*)$/))) {
    pc.activated.push(mkAct(`Scavenge ${C(m[1])}`, { ...parseCostText(m[1]), exileSelf: true }, ab('put +1/+1 counters equal to its power on target creature', [{ k: 'counters', what: { t: 'target', spec: 0 }, counter: '+1/+1', n: { power: { t: 'self' } } }], [{ filter: { types: ['creature'] }, players: null, count: 1, upTo: false, label: 'target creature' }]), { zone: 'graveyard', sorcery: true }));
    return true;
  }
  if ((m = line.match(/^reinforce (\d+|x)—(\{[^}]+\}(?:\{[^}]+\})*)$/))) {
    pc.activated.push(mkAct(`Reinforce ${m[1]} — ${C(m[2])}`, { ...parseCostText(m[2]), discardSelf: true }, ab('put +1/+1 counters on target creature', [{ k: 'counters', what: { t: 'target', spec: 0 }, counter: '+1/+1', n: m[1] === 'x' ? 'X' : +m[1] }], [{ filter: { types: ['creature'] }, players: null, count: 1, upTo: false, label: 'target creature' }]), { zone: 'hand' }));
    return true;
  }
  if ((m = line.match(new RegExp(`^(replicate|squad|miracle|emerge|freerunning|mayhem|sneak) ${COST}$`)))) { pc[m[1]] = C(m[2]); return true; }
  if ((m = line.match(/^you may cast ~ as though it had flash if you pay (\{[^}]+\}) more to cast it$/))) { pc.flashPay = C(m[1]); return true; }
  if (line === 'increment') { pc.increment = true; return true; }
  return false;
});
EXT.condEval.selfCombat = (s, c, _you, self) => {
  const a = s.combat?.attackers ?? [];
  return c.state === 'attacking' ? a.some((x) => x.iid === self) : a.some((x) => x.blockedBy.includes(self!));
};
EXT.hooks.damage.push((s, _src, to, n, _combat, api) => {
  if (to.kind !== 'card' || n <= 0 || !s.cards[to.iid] || s.cards[to.iid].zone !== 'battlefield') return n;
  if (!(api.chars(s, to.iid).pc as any).phantom) return n;
  const c = s.cards[to.iid];
  if ((c.counters['+1/+1'] ?? 0) > 0) c.counters['+1/+1']--;
  api.log(s, `The damage to ${api.nm(s, to.iid)} is prevented; it loses a +1/+1 counter.`, c.controller);
  return 0;
});
EXT.hooks.castBlock.push((s, p, _iid, _alt, api) => {
  for (const b of sourcesWith(s, 'spellLimit')) {
    const lim = (api.chars(s, b).pc as any).spellLimit;
    if (lim && ((s.players[p] as any).spellsCastThisTurn ?? 0) >= lim) return `Each player can't cast more than ${lim} spell${lim > 1 ? 's' : ''} each turn`;
  }
  return null;
});

// ------------------------------------------------------------------------------------------
// increment: whenever you cast a spell, if the mana spent is greater than this creature's power or toughness, +1/+1 counter
// ------------------------------------------------------------------------------------------
EXT.hooks.event.push((s, name, d, api) => {
  if (name !== 'cast') return;
  const spent = (d.item as any).manaSpent ?? 0;
  for (const b of sourcesWith(s, 'increment')) {
    if (s.cards[b].controller !== d.item.controller || !(api.chars(s, b).pc as any).increment) continue;
    const ch = api.chars(s, b);
    if (spent > ch.power || spent > ch.toughness) api.queueTrigger(s, b, d.item.controller, { event: 'castSpell', text: 'Increment', ability: ab('put a +1/+1 counter on ~', [{ k: 'counters', what: { t: 'self' }, counter: '+1/+1', n: 1 }]) }, {});
  }
});
EXT.conds.push((t) => {
  let m: RegExpMatchArray | null;
  if ((m = t.match(/^at least (\w+) mana was spent to cast (?:it|~)$/))) return { k: 'ext', name: 'spent', min: n0(m[1]) };
  if (/^no mana was spent to cast (?:it|~)$/.test(t)) return { k: 'ext', name: 'spent', max: 0 };
  return null;
});
EXT.condEval.spent = (s, c, _you, self) => {
  const n = (self && (s.cards[self] as any)?.manaSpent) ?? 0;
  return (c.min == null || n >= c.min) && (c.max == null || n <= c.max);
};

// ------------------------------------------------------------------------------------------
// optional ways to cast: replicate, squad, flash for more, emerge, freerunning, sneak, mayhem, miracle
// ------------------------------------------------------------------------------------------
const def = (s: GameState, iid: string) => s.defs[s.cards[iid].defId];
const pcOf = (s: GameState, iid: string, api: any) => api.parsedFor(s, s.cards[iid]) as any;
const sorc = (s: GameState, p: PlayerIdx) => s.active === p && (s.step === 'main1' || s.step === 'main2') && !s.stack.length;
const addGeneric = (cost: string, extra: string, times: number) => cost + extra.repeat(times);
EXT.hooks.castOptions.push((s, p, iid, api) => {
  const c = s.cards[iid];
  if (!c || c.zone !== 'hand' || c.owner !== p) return [];
  const f = pcOf(s, iid, api);
  const base = def(s, iid).manaCost;
  const inst = /\binstant\b/i.test(def(s, iid).typeLine) || f.keywords?.includes('flash');
  const t = s.priority === p && !s.prompt && (inst || sorc(s, p));
  const out: any[] = [];
  const opt = (label: string, alt: string, cost: string, ok = true) => out.push({ label: `${label} ${cost}`.trim(), action: { type: 'cast', iid, alt: `ext:${alt}` }, ok: ok && api.canAfford(s, p, cost) && !EXT.hooks.castBlock.some((h) => !!h(s, p, iid, `ext:${alt}`, api)) });
  const name = def(s, iid).name;
  if (f.replicate) for (let k = 1; k <= 3; k++) opt(`Cast ${name} replicated ×${k}`, `replicate${k}`, addGeneric(base, f.replicate, k), t);
  if (f.squad) for (let k = 1; k <= 3; k++) opt(`Cast ${name} with squad ×${k}`, `squad${k}`, addGeneric(base, f.squad, k), t);
  if (f.flashPay) opt(`Cast ${name} with flash (+${f.flashPay})`, 'flashpay', base + f.flashPay, s.priority === p && !s.prompt);
  if (f.emerge) opt(`Emerge ${name}`, 'emerge', f.emerge, t && s.battlefield.some((b) => s.cards[b].controller === p && api.chars(s, b).types.has('creature')));
  if (f.freerunning) opt(`Freerunning ${name}`, 'freerunning', f.freerunning, t && !!(s as any).freerunOk?.[p] && (s as any).freerunOk.turn === s.turn);
  if (f.sneak) opt(`Sneak ${name}`, 'sneak', f.sneak, s.priority === p && !s.prompt && sneakWindow(s, p));
  return out;
});
for (let k = 1; k <= 3; k++) {
  EXT.alts[`replicate${k}`] = { label: `replicate ×${k}`, begin: (s, _p, iid, pc) => addGeneric(def(s, iid).manaCost, pc.replicate ?? '', k), afterPush: (s, item, api) => { for (let i = 0; i < k; i++) api.queueTrigger(s, item.source, item.controller, { event: 'castSpell', text: 'Replicate — copy the spell', ability: ab('copy it', [{ k: 'copySpell', what: { t: 'triggerObj' }, n: 1 }]) }, { triggerObj: item.source }); } };
  EXT.alts[`squad${k}`] = { label: `squad ×${k}`, begin: (s, _p, iid, pc) => addGeneric(def(s, iid).manaCost, pc.squad ?? '', k), afterPush: (s, item) => { (s.cards[item.source] as any).squadN = k; } };
}
EXT.alts.flashpay = { label: 'flash', instant: true, begin: (s, _p, iid, pc) => def(s, iid).manaCost + (pc.flashPay ?? '') };
EXT.alts.freerunning = { label: 'freerunning', begin: (s, _p, iid, pc) => pc.freerunning ?? '!No freerunning cost' };
EXT.alts.emerge = { label: 'emerge', begin: (s, _p, iid, pc) => pc.emerge ?? '!No emerge cost' };
EXT.alts.sneak = { label: 'sneak', instant: true, begin: (s, _p, iid, pc) => pc.sneak ?? '!No sneak cost', afterPush: (s, item) => { (s.cards[item.source] as any).sneakCast = true; } };
EXT.alts.mayhem = { label: 'mayhem', begin: (s, _p, iid, pc) => pc.mayhem ?? '!No mayhem cost' };
EXT.alts.miracle = { label: 'miracle', instant: true, begin: (s, _p, iid, pc) => pc.miracle ?? '!No miracle cost' };
function sneakWindow(s: GameState, p: PlayerIdx) {
  return s.active === p && !!s.combat?.blocksDeclared && s.combat.attackers.some((a) => !a.blocked && s.cards[a.iid]?.controller === p) && ['declareBlockers'].includes(s.step);
}
EXT.hooks.castCosts.push((s, pc, api) => {
  if (pc.kind !== 'spell') return false;
  const ask = (key: string, list: string[], title: string) => {
    if (pc[key]) return false;
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: pc.player, kind: 'chooseCards', title: `${pc.label}: ${title}`, cards: list, min: 1, max: 1, canCancel: true, data: { ctx: 'cast', cost: key } });
    return true;
  };
  if (pc.alt === 'ext:emerge') {
    if (ask('extEmerge', s.battlefield.filter((b) => s.cards[b].controller === pc.player && api.chars(s, b).types.has('creature')), 'sacrifice a creature (emerge)')) return true;
    if (!pc.emergeReduced) {
      pc.emergeReduced = true;
      const mv = s.defs[s.cards[pc.extEmerge[0]].defId].cmc ?? 0;
      const g = +(pc.manaCost.match(/\{(\d+)\}/)?.[1] ?? 0);
      pc.manaCost = (Math.max(0, g - mv) ? `{${Math.max(0, g - mv)}}` : '') + pc.manaCost.replace(/\{\d+\}/g, '');
    }
  }
  if (pc.alt === 'ext:sneak') return ask('extSneak', (s.combat?.attackers ?? []).filter((a) => !a.blocked && s.cards[a.iid]?.controller === pc.player).map((a) => a.iid), 'return an unblocked attacker to your hand (sneak)');
  return false;
});
EXT.hooks.castPay.push((s, pc, api) => {
  for (const x of pc.extEmerge ?? []) api.moveCard(s, x, 'graveyard', { cause: 'sacrifice' });
  for (const x of pc.extSneak ?? []) { api.moveCard(s, x, 'hand'); if (s.combat) s.combat.attackers = s.combat.attackers.filter((a) => a.iid !== x); }
});
EXT.hooks.afterMove.push((s, iid, from, to, opts, api) => {
  const c = s.cards[iid] as any;
  if (!c) return;
  if (to === 'graveyard' && from === 'hand' && opts?.cause === 'discard') c.discardedTurn = s.turn;
  if (to !== 'battlefield') return;
  if (c.squadN) {
    const n = c.squadN;
    c.squadN = 0;
    const it: any = { id: api.uid(s, 's'), kind: 'trigger', controller: c.controller, source: iid, label: `${api.nm(s, iid)} — squad`, text: `Create ${n} token copies.`, effects: [{ k: 'ext', name: 'squadTokens', n }], targets: [] };
    it.preTargeted = true;
    s.pendingTriggers.push(it);
  }
  if (c.sneakCast) {
    c.sneakCast = false;
    c.tapped = true;
    if (s.combat && s.active === c.controller) s.combat.attackers.push({ iid, target: { kind: 'player', idx: api.opp(c.controller) }, blockedBy: [], blocked: false });
  }
});
EXT.effects.squadTokens = ({ s, item, e, you, api }) => { for (let i = 0; i < e.n; i++) if (s.cards[item.source]) api.copyToken(s, you, item.source, {}); return 'done'; };
// freerunning: an Assassin or commander you control dealt combat damage to a player this turn
EXT.hooks.event.push((s, name, d, api) => {
  if (name !== 'dealt' || !d.combat || d.to.kind !== 'player') return;
  const c = s.cards[d.source] as any;
  if (!c) return;
  if (!(c.isCommander || api.chars(s, d.source).subtypes.has('assassin'))) return;
  const f = ((s as any).freerunOk ??= { turn: s.turn });
  if (f.turn !== s.turn) { (s as any).freerunOk = { turn: s.turn }; }
  (s as any).freerunOk[c.controller] = true;
});
// mayhem: cast from your graveyard the turn you discarded it
EXT.hooks.zoneCast.push((s, p, card, pcFront) => (card.zone === 'graveyard' && card.owner === p && pcFront.mayhem && card.discardedTurn === s.turn ? 'ext:mayhem' : null));
// miracle: the first card you draw each turn may be cast for its miracle cost
EXT.hooks.event.push((s, name, d, api) => {
  if (name !== 'draw') return;
  const k = ((s as any).firstDraw ??= {});
  if (k.turn !== s.turn) { k.turn = s.turn; k[0] = 0; k[1] = 0; }
  k[d.p]++;
  if (k[d.p] !== 1 || !s.cards[d.iid]) return;
  const pc = pcOf(s, d.iid, api);
  if (!pc.miracle) return;
  const it: any = { id: api.uid(s, 's'), kind: 'trigger', controller: d.p, source: d.iid, label: `${api.nm(s, d.iid)} — miracle`, text: `You may cast it for ${pc.miracle}.`, effects: [{ k: 'ext', name: 'miracleCast', iid: d.iid }], targets: [] };
  it.preTargeted = true;
  s.pendingTriggers.push(it);
  api.ev(s, { k: 'reveal', iid: d.iid, p: d.p, name: api.nm(s, d.iid), image: api.cardImageOf(s, d.iid) });
});
EXT.effects.miracleCast = ({ s, e, r, you, api }) => {
  const c = s.cards[e.iid];
  if (!c || c.zone !== 'hand') return 'done';
  const cost = pcOf(s, e.iid, api).miracle;
  if (!r.sub) {
    if (!api.canAfford(s, you, cost)) return 'done';
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'yesno', title: `Miracle: cast ${api.nm(s, e.iid)} for ${cost}?`, options: [{ id: 'yes', label: `Cast for ${cost}` }, { id: 'no', label: 'Keep it' }], cards: [e.iid], data: { ctx: 'resolve' } });
    return 'wait';
  }
  if (r.sub.answered === 'yes') {
    s.priority = you;
    const err = api.beginCast(s, you, e.iid, 0, 'ext:miracle');
    if (err) api.log(s, `Couldn't cast ${api.nm(s, e.iid)}: ${err}`, you, 'warn');
  }
  return 'done';
};
void parseFilter;
