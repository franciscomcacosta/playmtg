// Plugin: batch 10.
//  - Ravenous (enters with X +1/+1 counters; draw a card if X is 5 or more)
//  - "if X is N or more" (the X paid for this permanent / spell)
//  - "~ assigns no combat damage this turn" / "it assigns no combat damage this turn"
import { EXT } from '../ext';
import { SUBTYPES } from '../subtypes';
import { automationLevel, looseFilter, parseAbility, parseCard, parseCountPhrase, parseFilter, parsePlayerSubject, parseSentence, parseSubject, singular } from '../oracle';

EXT.expand.push((line) => line === 'ravenous' ? ['~ enters with x +1/+1 counters on it', 'when ~ enters, if x is 5 or more, draw a card'] : null);

EXT.conds.push((t) => {
  const m = t.match(/^x is (\d+) or (more|greater|less)$/);
  return m ? { k: 'ext', name: 'xAtLeast', n: +m[1], less: m[2] === 'less' } : null;
});
EXT.condEval.xAtLeast = (s, c, _you, self, ctx) => {
  const x = (ctx?.item?.x ?? (self ? (s.cards as any)[self]?.xPaid : undefined)) ?? 0;
  return c.less ? x <= c.n : x >= c.n;
};

EXT.rules.push([/^(~|it|that creature|target creature) assigns no combat damage this turn$/, (m, ctx) => {
  const who = m[1] === '~' ? { t: 'self' } : parseSubject(m[1], ctx);
  if (!who) return null;
  return [{ k: 'ext', name: 'noCombatDmg', who }];
}]);
EXT.effects.noCombatDmg = ({ s, item, e, api }) => {
  for (const iid of api.subjCards(s, item, e.who)) ((s.cards as any)[iid] ??= {}).noCombatDmgTurn = s.turn;
  return 'done';
};
EXT.hooks.damage.push((s, source, _to, n, combat) => combat && (s.cards as any)[source]?.noCombatDmgTurn === s.turn ? 0 : n);

// "~ can't block creatures with power 2 or greater / 2 or less" (Brassclaw Orcs, Cyclops Tyrant)
EXT.lines.push((line, pc) => {
  const m = line.match(/^~ can't block creatures with power (\d+) or (greater|less)$/);
  if (!m) return false;
  pc.blockPowLimit = { n: +m[1], greater: m[2] === 'greater' };
  return true;
});
EXT.hooks.canBlock.push((s, blocker, attacker, api) => {
  const l = (api.chars(s, blocker).pc as any)?.blockPowLimit;
  if (!l) return undefined;
  const p = api.chars(s, attacker).power;
  return (l.greater ? p >= l.n : p <= l.n) ? false : undefined;
});

// "You and target opponent each draw a card / three cards."
EXT.rules.push([/^you and (target opponent|target player|that player) each draw (a|an|one|two|three|four|\d+) cards?$/, (m, ctx) => {
  const who = parsePlayerSubject(m[1], ctx);
  const n = ({ a: 1, an: 1, one: 1, two: 2, three: 3, four: 4 } as any)[m[2]] ?? +m[2];
  return who ? [{ k: 'draw', n, who: { t: 'you' } }, { k: 'draw', n, who }] : null;
}]);

// "Its owner shuffles it into their library." (after "choose target …")
EXT.rules.push([/^its owner shuffles it into (?:their|his or her) library$/, (_m, ctx) => ctx.last ? [{ k: 'ext', name: 'shuffleIn', what: ctx.last }] : null]);

// "It's an enchantment. (It's not a creature.)" — the Enduring cycle, after returning it
EXT.rules.push([/^it's an? (enchantment|artifact)(?: \(it's not a creature\))?$/, (m, ctx) => ctx.last ? [{ k: 'ext', name: 'notCreatureNow', what: ctx.last, type: m[1] }] : null]);
EXT.effects.notCreatureNow = ({ s, item, e, api }) => {
  for (const c of api.subjCards(s, item, e.what)) if (s.cards[c]?.zone === 'battlefield') s.cards[c].mods.push({ until: 'permanent', ts: s.ts++, addTypes: [e.type], removeTypes: ['creature'] } as any);
  return 'done';
};

// "Lands you control don't untap during your next untap step." (Hazoret's Undying Fury, the Last Words)
EXT.rules.push([/^lands you control don't untap during your next untap step$/, () => [{ k: 'ext', name: 'landsNoUntap' }]]);
EXT.effects.landsNoUntap = ({ s, you }) => { ((s.players[you] as any).landsNoUntap = s.turn); return 'done'; };
EXT.hooks.untap.push((s, iid, api) => {
  const c = s.cards[iid];
  const f = (s.players[c.controller] as any).landsNoUntap;
  if (f === undefined || s.turn <= f || s.active !== c.controller) return undefined;
  return api.chars(s, iid).types.has('land') ? false : undefined;
});
EXT.hooks.step.push((s, step) => {
  const pl: any = s.players[s.active];
  if (step === 'upkeep' && pl.landsNoUntap !== undefined && s.turn > pl.landsNoUntap) pl.landsNoUntap = undefined;
});

// "Sacrifice ~ unless you discard a card." (Masticore, Great Desert Hellion)
let un = 0;
EXT.rules.unshift([/^(.+?) unless you discard (a|an|one|two) (card|creature card|land card)$/, (m, ctx) => {
  const k0 = ctx.specs.length;
  const inner = parseSentence(m[1], ctx);
  if (!inner || inner.some((e: any) => e.k === 'manual')) { ctx.specs.length = k0; return null; }
  const id = `ud${++un}`;
  const n = ({ a: 1, an: 1, one: 1, two: 2 } as any)[m[2]];
  const types = m[3] === 'card' ? [] : [m[3].split(' ')[0]];
  return [{ k: 'ext', name: 'unlessDiscard', id, n, types }, { k: 'if', cond: { k: 'itemFlag', id, not: true }, effects: inner }];
}]);
EXT.effects.unlessDiscard = ({ s, item, e, r, you, api }) => {
  const flags = ((item as any).flags ??= {});
  const hand = s.players[you].hand.filter((h: string) => !e.types.length || e.types.some((t: string) => api.chars(s, h).types.has(t)));
  if (hand.length < e.n) { flags[e.id] = false; return 'done'; }
  if (!r.sub) {
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'chooseCards', title: `${item.label}: discard ${e.n === 1 ? 'a card' : `${e.n} cards`}? (otherwise the rest happens)`, cards: hand, min: 0, max: e.n, data: { ctx: 'resolve' } });
    return 'wait';
  }
  const pick = ((r.sub.answer ?? []) as string[]).filter((c) => hand.includes(c));
  if (pick.length === e.n) { for (const c of pick) api.moveCard(s, c, 'graveyard', { cause: 'discard' }); flags[e.id] = true; }
  else flags[e.id] = false;
  return 'done';
};

// "Target creature can't attack this turn."
EXT.rules.push([/^(target creature(?: an opponent controls)?|that creature|it|~) can't attack this turn$/, (m, ctx) => {
  const what = m[1] === '~' ? { t: 'self' } : parseSubject(m[1], ctx);
  return what ? [{ k: 'ext', name: 'tempMod', what, mod: { cantAttack: true } }] : null;
}]);

// "Target creature becomes blue until end of turn." / "… becomes black and red until end of turn"
const COLW: Record<string, string> = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };
EXT.rules.push([/^(.+?) becomes? ((?:white|blue|black|red|green)(?:(?:,| and|, and) (?:white|blue|black|red|green))*) until end of turn$/, (m, ctx) => {
  const k0 = ctx.specs.length;
  const what = m[1] === '~' ? { t: 'self' } : parseSubject(m[1], ctx);
  if (!what) { ctx.specs.length = k0; return null; }
  const colors = m[2].split(/,? and |, /).map((w) => COLW[w.trim()]).filter(Boolean);
  return [{ k: 'ext', name: 'tempMod', what, mod: { colors } }];
}]);

// "Double ~'s power until end of turn." / "Double target creature's power until end of turn." / "… power and toughness"
EXT.rules.push([/^double (~|target creature|that creature|it)'s? (power|power and toughness) until end of turn$/, (m, ctx) => {
  const what = m[1] === '~' ? { t: 'self' } : parseSubject(m[1].replace(/^it$/, 'it'), ctx);
  return what ? [{ k: 'ext', name: 'doublePT', what, both: m[2] !== 'power' }] : null;
}]);
EXT.effects.doublePT = ({ s, item, e, api }) => {
  for (const c of api.subjCards(s, item, e.what)) {
    if (s.cards[c]?.zone !== 'battlefield') continue;
    const ch = api.chars(s, c);
    s.cards[c].mods.push({ power: Math.max(0, ch.power), toughness: e.both ? Math.max(0, ch.toughness) : 0, until: 'eot', ts: s.ts++ } as any);
  }
  return 'done';
};

// "Counter target spell, activated ability, or triggered ability." (Disallow, Tale's End-likes)
EXT.rules.push([/^counter target spell, activated ability, or triggered ability$/, (_m, ctx) => {
  ctx.specs.push({ filter: { zone: 'stack', stackKinds: ['spell', 'ability', 'trigger'] }, count: 1, upTo: false, label: 'target spell, activated ability, or triggered ability', players: null });
  return [{ k: 'counterSpell', what: { t: 'target', spec: ctx.specs.length - 1 } }];
}]);

// "Target player takes an extra turn after this one."
EXT.rules.push([/^(target player|target opponent|that player) takes an extra turn after this one$/, (m, ctx) => {
  const who = parsePlayerSubject(m[1], ctx);
  return who ? [{ k: 'ext', name: 'extraTurnFor', who }] : null;
}]);
EXT.effects.extraTurnFor = ({ s, item, e, api }) => {
  for (const p of api.subjPlayers(s, item, e.who)) { ((s as any).extraTurns ??= []).push(p); api.log(s, `${api.pname(s, p)} will take an extra turn.`, p); }
  return 'done';
};

// "Each player gains control of all creatures/permanents they own."
EXT.rules.push([/^each player gains control of all (creatures|permanents|artifacts) they own$/, (m) => [{ k: 'ext', name: 'ownersControl', type: m[1].replace(/s$/, '') }]]);
EXT.effects.ownersControl = ({ s, e, api }) => {
  for (const b of s.battlefield) {
    const c: any = s.cards[b];
    if (c.controller === c.owner || (e.type !== 'permanent' && !api.chars(s, b).types.has(e.type))) continue;
    c.mods = c.mods.filter((m: any) => m.setController === undefined);
    c.controller = c.owner;
    c.sick = true;
  }
  return 'done';
};

// "Put target creature into its owner's library second/third from the top."
EXT.rules.push([/^put (target (?:creature|nonland permanent|permanent|artifact|enchantment)) into its owner's library (second|third) from the top$/, (m, ctx) => {
  const what = parseSubject(m[1], ctx);
  return what ? [{ k: 'ext', name: 'intoLibraryAt', what, pos: m[2] === 'second' ? 1 : 2 }] : null;
}]);
EXT.effects.intoLibraryAt = ({ s, item, e, api }) => {
  for (const c of api.subjCards(s, item, e.what)) {
    const card: any = s.cards[c];
    if (!card || card.zone !== 'battlefield') continue;
    api.moveCard(s, c, 'libraryTop');
    const lib = s.players[card.owner].library;
    const i = lib.indexOf(c);
    if (i >= 0 && !card.token) { lib.splice(i, 1); lib.splice(Math.min(e.pos, lib.length), 0, c); }
  }
  return 'done';
};

// "Target opponent puts a card from their hand on top of their library."
EXT.rules.push([/^(target opponent|target player|each opponent|that player) puts (a|two) cards? from (?:their|his or her) hand on top of (?:their|his or her) library$/, (m, ctx) => {
  const who = parsePlayerSubject(m[1], ctx);
  return who ? [{ k: 'ext', name: 'playerHandToTop', who, n: m[2] === 'two' ? 2 : 1 }] : null;
}]);
EXT.effects.playerHandToTop = ({ s, item, e, r, api }) => {
  const ps: number[] = api.subjPlayers(s, item, e.who);
  r.sub ??= { i: 0 };
  while (r.sub.i < ps.length) {
    const p = ps[r.sub.i];
    const hand = s.players[p].hand;
    if (!hand.length) { r.sub.i++; continue; }
    const n = Math.min(e.n, hand.length);
    if (!r.sub.asked) {
      r.sub.asked = true;
      api.pushPrompt(s, { id: api.uid(s, 'p'), player: p, kind: 'chooseCards', title: `${item.label}: put ${n === 1 ? 'a card' : `${n} cards`} from your hand on top of your library`, cards: [...hand], min: n, max: n, data: { ctx: 'resolve' } });
      return 'wait';
    }
    let pick = ((r.sub.answer ?? []) as string[]).filter((c) => hand.includes(c)).slice(0, n);
    if (pick.length < n) pick = [...pick, ...hand.filter((c) => !pick.includes(c))].slice(0, n);
    for (const c of pick) api.moveCard(s, c, 'libraryTop');
    r.sub = { i: r.sub.i + 1 };
  }
  return 'done';
};

// "~ can't attack if defending player controls an untapped creature with power 3 or greater." (Orgg, Goblin Mutant)
EXT.lines.push((line, pc) => {
  const m = line.match(/^~ can't attack if defending player controls (an? .+)$/);
  if (!m) return false;
  const ph = m[1].replace(/^an? /, '');
  const untapped = /^untapped /.test(ph);
  const f = looseFilter(ph.replace(/^untapped /, ''));
  if (!f) return false;
  pc.cantAttackIfDef = { filter: { ...f, ...(untapped ? { untapped: true } : {}) } };
  return true;
});
EXT.hooks.canAttack.push((s, iid, api) => {
  const r = (api.chars(s, iid).pc as any)?.cantAttackIfDef;
  if (!r) return undefined;
  const me = s.cards[iid].controller;
  const opp = 1 - me;
  const hit = s.battlefield.some((b: string) => s.cards[b].controller === opp && (!r.filter.untapped || !s.cards[b].tapped) && api.matchesFilter(s, b, { ...r.filter, untapped: undefined, zone: 'battlefield' }, me, iid));
  return hit ? false : undefined;
});

// "If ~ would be put into a graveyard from anywhere, reveal ~ and shuffle it into its owner's library instead." (engine moveCard)
EXT.lines.push((line, pc) => {
  if (!/^if ~ would be put into a graveyard from anywhere, (?:reveal ~ and )?shuffle (?:it|~) into its owner's library instead$/.test(line)) return false;
  pc.gyShuffle = true;
  return true;
});

// "Untap ~ during each other player's untap step." (Bender's Waterskin, Ivorytusk Fortress-likes for itself)
EXT.lines.push((line, pc) => {
  if (!/^untap ~ during each (?:other player's|opponent's) untap step$/.test(line)) return false;
  pc.untapOthers = true;
  return true;
});
EXT.hooks.step.push((s, step, api) => {
  if (step !== 'untap') return;
  for (const b of s.battlefield) {
    const c: any = s.cards[b];
    if (c.tapped && c.controller !== s.active && (api.chars(s, b).pc as any).untapOthers) c.tapped = false;
  }
});

// "You lose the game." / "Target player loses the game."
EXT.rules.push([/^(you|target player|target opponent|that player|each opponent) loses? the game$/, (m, ctx) => {
  const who = m[1] === 'you' ? { t: 'you' } : parsePlayerSubject(m[1], ctx);
  return who ? [{ k: 'ext', name: 'loseGame', who }] : null;
}]);
EXT.effects.loseGame = ({ s, item, e, you, api }) => {
  const ps: number[] = e.who.t === 'you' ? [you] : api.subjPlayers(s, item, e.who);
  for (const p of ps) { (s.players[p] as any).lost = true; api.log(s, `${api.pname(s, p)} loses the game.`, p); }
  return 'done';
};

// "Whenever a player casts …, counter that spell." (Grandmother Goby, Dovescape, Vexing Bauble)
EXT.rules.push([/^counter that spell$/, (_m, ctx) => (ctx.inTrigger === false ? null : [{ k: 'ext', name: 'counterTriggerSpell' }])]);
EXT.effects.counterTriggerSpell = ({ s, item, api }) => {
  const src = (item as any).triggerObj;
  const it = s.stack.find((x: any) => x.kind === 'spell' && x.source === src);
  if (!it) return 'done';
  if (api.chars(s, it.source).pc.cantBeCountered) { api.log(s, `${it.label} can't be countered.`); return 'done'; }
  api.counterItem(s, it);
  return 'done';
};

// "End the turn." (Time Stop, Sundial of the Infinite): exile everything on the stack, then go to the cleanup step (723)
EXT.rules.push([/^end the turn$/, () => [{ k: 'ext', name: 'endTurn' }]]);
EXT.effects.endTurn = ({ s, item, api }) => {
  for (const it of [...s.stack]) {
    if (it.id === item.id) continue;
    s.stack.splice(s.stack.indexOf(it), 1);
    if (it.kind === 'spell' && s.cards[it.source]?.zone === 'stack') api.moveCard(s, it.source, 'exile');
  }
  s.pendingTriggers.length = 0;
  (s as any).endTurnExile = item.id;
  s.combat = null;
  (s as any).skipTo = 'cleanup';
  (s as any).needAdvance = true;
  api.log(s, 'The turn ends.', item.controller, 'turn');
  return 'done';
};
EXT.hooks.finish.push((s, item, _countered, api) => {
  if ((s as any).endTurnExile !== item.id) return false;
  (s as any).endTurnExile = undefined;
  if (item.kind === 'spell' && s.cards[item.source]?.zone === 'stack') { api.moveCard(s, item.source, 'exile'); return true; }
  return false;
});

// "Equipped creature gets +1/+1 and has ward {2}." (granted through attachGrants)
EXT.lines.push((line, pc) => {
  const m = line.match(/^(?:equipped|enchanted) creature (?:gets ([+-]\d+)\/([+-]\d+) and )?has ward \{(\d+)\}$/);
  if (!m) return false;
  (pc.attachGrants ??= []).push(`Ward {${m[3]}}`);
  if (m[1]) pc.statics.push({ kind: 'attachPump', p: +m[1], t: +m[2], kw: [] } as any);
  return true;
});

// "Choose an opponent." — in a two-player game, the opponent; later "that player" refers to them
EXT.rules.push([/^choose an opponent(?: at random)?$/, (_m, ctx) => { ctx.lastPlayer = { t: 'eachOpp' }; return []; }]);
EXT.rules.push([/^you (investigate|proliferate|explore|surveil \d+|scry \d+|connive|amass .+|manifest dread)$/, (m, ctx) => parseSentence(m[1], ctx)]);

// "When a Dragon you control enters, return ~ to its owner's hand." — "when" with an "a/an …" subject is the same
// trigger as "whenever" (603.2); graveyard-zone triggers ("return ~ from your graveyard") are left alone.
EXT.expand.push((line) => {
  const m = line.match(/^when (an? (?!spell)[a-z' -]+? (?:you control )?enters)(, .+)$/);
  if (!m || /from your graveyard|this turn|this way/.test(line) || /^when an? [a-z' -]*(?:opponent|player)/.test(line)) return null;
  return [`whenever ${m[1]}${m[2]}`];
});

// "You may cast ~ from your graveyard." (Skaab Ruinator, Hogaak, Gravecrawler-likes) — a normal cast from the graveyard
EXT.lines.push((line, pc) => {
  if (!/^you may cast ~ from your graveyard$/.test(line)) return false;
  pc.castSelfFromGy = true;
  return true;
});
EXT.hooks.zoneCast.push((s, p, card, _pcf, api) => {
  if (card.zone !== 'graveyard' || card.owner !== p || !(api.parsedFor(s, card) as any).castSelfFromGy) return null;
  return 'ext:gyself';
});
EXT.alts.gyself = { label: 'from graveyard', begin: (s, _p, iid) => s.defs[s.cards[iid].defId].manaCost || '' };

// "~'s owner shuffles it into their library."
EXT.rules.push([/^~'s owner shuffles (?:it|~) into (?:their|his or her) library$/, () => [{ k: 'ext', name: 'shuffleIn', what: { t: 'self' } }]]);

// "Return the top creature card of your graveyard to the battlefield." (Shallow Grave, Corpse Dance — the most recent one)
EXT.rules.push([/^return the top creature card of your graveyard to the battlefield$/, (_m, ctx) => { ctx.last = { t: 'lastToken' }; return [{ k: 'ext', name: 'topGyCreature' }]; }]);
EXT.effects.topGyCreature = ({ s, item, you, api }) => {
  const gy: string[] = s.players[you].graveyard;
  for (let k = gy.length - 1; k >= 0; k--) {
    if (api.chars(s, gy[k]).types.has('creature')) {
      const c = gy[k];
      api.moveCard(s, c, 'battlefield', { controller: you });
      (item as any).exiledTop = [c];
      (item as any).lastTokens = [c];
      break;
    }
  }
  return 'done';
};

// "~ is also a Cleric, Rogue, Warrior, and Wizard." (party helpers)
EXT.lines.push((line, pc) => {
  const m = line.match(/^~ is also an? (.+)$/);
  if (!m) return false;
  const subs = m[1].split(/,? and |, /).map((x) => x.trim());
  if (!subs.every((x) => SUBTYPES.has(x))) return false;
  pc.statics.push({ kind: 'selfTypes', selfAddSubtypes: subs } as any);
  return true;
});

// "When that creature dies this turn, X." — a delayed trigger watching the creature named earlier (603.7)
EXT.seqs.push((sents, i, ctx, ab) => {
  const m = sents[i].match(/^when (?:that creature|the chosen creature|it) dies this turn, (.+)$/);
  if (!m) return null;
  const what = ctx.last;
  if (!what || what.t === 'self') return null;
  const save = { last: ctx.last, lastPlayer: ctx.lastPlayer };
  const k0 = ctx.specs.length;
  ctx.last = { t: 'triggerObj' } as any;
  ctx.lastPlayer = { t: 'triggerPlayer' } as any;
  const body = m[1].replace(/\b(?:its|the creature's|that creature's) controller\b/g, 'that player').replace(/\bthat card\b/g, 'it');
  const effs = parseSentence(body, ctx);
  ctx.last = save.last; ctx.lastPlayer = save.lastPlayer;
  if (!effs || effs.some((e: any) => e.k === 'manual') || ctx.specs.length !== k0) { ctx.specs.length = k0; return null; }
  ab.effects.push({ k: 'ext', name: 'deathWatch', what, effects: effs } as any);
  return 0;
});
EXT.effects.deathWatch = ({ s, item, e, you, api }) => {
  for (const c of api.subjCards(s, item, e.what)) {
    if (s.cards[c]?.zone !== 'battlefield') continue;
    ((s.cards[c] as any).deathWatch ??= []).push({ turn: s.turn, controller: you, source: item.source, label: item.label, effects: e.effects });
  }
  return 'done';
};
EXT.hooks.event.push((s, name, d, api) => {
  if (name !== 'leave' || d.to !== 'graveyard' || !d.wasCreature) return;
  const c: any = s.cards[d.iid];
  const ws = (c?.deathWatch ?? []).filter((w: any) => w.turn === s.turn);
  if (c) c.deathWatch = undefined;
  for (const w of ws) {
    const it: any = { id: api.uid(s, 's'), kind: 'trigger', controller: w.controller, source: w.source, label: w.label, text: 'When that creature dies this turn', effects: JSON.parse(JSON.stringify(w.effects)), targets: [] };
    it.triggerObj = d.iid; it.triggerPlayer = d.controller; it.lastTokens = [d.iid]; it.preTargeted = false;
    s.pendingTriggers.push(it);
  }
});

// "At the beginning of your next upkeep / end step, X. (If you don't, Y.)" — Pacts, and other delayed triggers in effects
let pactN = 0;
EXT.seqs.push((sents, i, ctx, ab) => {
  const m = sents[i].match(/^at the beginning of (your|the) next (upkeep|end step), (.+)$/);
  if (!m) return null;
  const at = m[2] === 'upkeep' ? 'nextUpkeep' : 'nextEnd';
  let used = 0;
  let effs: any[] | null = null;
  const pay = m[3].match(/^pay ((?:\{[^}]+\})+)$/);
  const k0 = ctx.specs.length;
  if (pay) {
    const els = (sents[i + 1] ?? '').match(/^if you don't, (.+)$/);
    if (!els) return null;
    const inner = parseSentence(els[1], ctx);
    if (!inner || inner.some((e: any) => e.k === 'manual')) { ctx.specs.length = k0; return null; }
    const id = `pact${++pactN}`;
    effs = [{ k: 'ext', name: 'unlessPay', id, payer: { t: 'you' }, mana: pay[1].toUpperCase() }, { k: 'if', cond: { k: 'itemFlag', id, not: true }, effects: inner }];
    used = 1;
  } else {
    const save = ctx.last;
    if (ctx.last?.t === 'target' || ctx.last?.t === 'lastToken') ctx.last = { t: 'lastToken' } as any;
    effs = parseSentence(m[3].replace(/\b(that creature|those tokens|those creatures|that token)\b/g, 'it'), ctx);
    ctx.last = save;
    if (!effs || effs.some((e: any) => e.k === 'manual') || ctx.specs.length !== k0) { ctx.specs.length = k0; return null; }
  }
  ab.effects.push({ k: 'delayed', at, effects: effs, ...(m[1] === 'your' ? { yours: true } : {}) } as any);
  return used;
});
// On instants/sorceries those lines are part of the spell, not a triggered ability
EXT.lines.push((line, pc, info) => {
  if (!info.isSpell || !/^(?:at the beginning of (?:your|the) next (?:upkeep|end step)|when you next cast)[ ,]/.test(line)) return false;
  const ab = parseAbility(line);
  if (ab.manual.length || ab.specs.length) return false;
  (pc._spellExtra ??= []).push(ab);
  return true;
});
EXT.post.push((pc) => {
  if (!pc._spellExtra || !pc.spell) return;
  for (const ab of pc._spellExtra) { pc.spell.effects.push(...ab.effects); pc.spell.specs.push(...ab.specs); }
  delete pc._spellExtra;
});

// "As long as enchanted permanent is a creature, it gets +2/+2 and has reach." / "As long as enchanted creature is
// blue, it gets +1/+1 and has shroud." — an attachPump that applies only while the attached object matches
EXT.lines.push((line, pc) => {
  const m = line.match(/^as long as (enchanted|equipped) (?:permanent|creature) is (.+?), it (?:gets ([+-]\d+)\/([+-]\d+)(?:,? and )?)?(?:has (.+?))?(?:,? and (can't block|can't attack))?$/);
  if (!m || (!m[3] && !m[5] && !m[6])) return false;
  const cond = looseFilter(m[2].replace(/^an? /, '').replace(/ or /g, ' or '));
  if (!cond) return false;
  const kws = m[5] ? parseKwList(m[5]) : [];
  if (!kws) return false;
  pc.statics.push({ kind: 'attachPump', attach: m[1], p: m[3] ? +m[3] : 0, t: m[4] ? +m[4] : 0, kw: kws, attachCond: { ...cond, zone: undefined }, ...(m[6] === "can't block" ? { cantBlock: true } : m[6] === "can't attack" ? { cantAttack: true } : {}) } as any);
  return true;
});
const KW1 = new Set(['flying', 'first strike', 'double strike', 'deathtouch', 'hexproof', 'indestructible', 'lifelink', 'menace', 'reach', 'trample', 'vigilance', 'haste', 'shroud', 'wither', 'infect', 'defender', 'fear', 'intimidate']);
const parseKwList = (t: string): string[] | null => {
  const ks = t.split(/,? and |, /).map((x) => x.trim());
  return ks.every((k) => KW1.has(k)) ? ks : null;
};

// "Until end of turn, target creature gets +2/+0 and gains "When this creature dies, …"" / "It gains "…"" /
// "Creatures you control gain "{T}: …" until end of turn." — a granted ability carried by a mod (rules.ts layer 6)
const grantOk = (text: string) => automationLevel(parseCard({ id: `grant-probe:${text}`, name: 'Granted', manaCost: '', cmc: 0, typeLine: 'Creature', oracle: text, colors: [], colorIdentity: [], keywords: [], layout: 'normal' } as any) as any) === 'full';
EXT.rules.push([/^(until end of turn, )?(.+?) (?:gets? ([+-]\d+)\/([+-]\d+),? and )?gains? (?:([a-z ,]+?),? and )?"(.+?)"(?: until end of turn)?$/, (m, ctx) => {
  const eot = !!m[1] || / until end of turn$/.test(m[0]);
  const k0 = ctx.specs.length;
  const what = m[2] === '~' ? { t: 'self' } : parseSubject(m[2], ctx);
  if (!what) { ctx.specs.length = k0; return null; }
  const kws = m[5] ? parseKwList(m[5]) : [];
  if (!kws) { ctx.specs.length = k0; return null; }
  const text = m[6].replace(/'/g, '"').replace(/(\w)"(\w)/g, "$1'$2");
  if (!grantOk(text)) { ctx.specs.length = k0; return null; }
  return [{ k: 'ext', name: 'grantMod', what, text, eot, p: m[3] ? +m[3] : 0, t: m[4] ? +m[4] : 0, kw: kws }];
}]);
EXT.effects.grantMod = ({ s, item, e, api }) => {
  for (const c of api.subjCards(s, item, e.what)) {
    if (s.cards[c]?.zone !== 'battlefield') continue;
    s.cards[c].mods.push({ grantText: e.text, ...(e.p || e.t ? { power: e.p, toughness: e.t } : {}), ...(e.kw.length ? { keywords: e.kw } : {}), until: e.eot ? 'eot' : 'permanent', ts: s.ts++ } as any);
  }
  return 'done';
};

// "Return it to the battlefield (tapped) under its owner's control with a +1/+1 counter on it." (Feign Death, Undying Malice)
EXT.rules.push([/^return (it|~|that card|target creature card from your graveyard) to the battlefield( tapped)?(?: under (?:its owner's|your) control)? with (a|an|two|three|an additional) (\+1\/\+1|-1\/-1|shield|finality) counters? on it$/, (m, ctx) => {
  const k0 = ctx.specs.length;
  const what = m[1] === '~' ? { t: 'self' } : m[1] === 'it' || m[1] === 'that card' ? (ctx.last ?? { t: 'self' }) : parseSubject(m[1], ctx);
  if (!what) { ctx.specs.length = k0; return null; }
  const n = ({ a: 1, an: 1, 'an additional': 1, two: 2, three: 3 } as any)[m[3]];
  return [{ k: 'reanimate', what, dest: 'battlefield', tapped: !!m[2], owner: /owner/.test(m[0]) }, { k: 'counters', what, counter: m[4], n }];
}]);

// "~ deals 2 damage to itself." / "~ deals 2 damage to any target and 1 damage to itself / you."
EXT.rules.push([/^(?:~|it) deals (\d+|x) damage to itself$/, (m) => [{ k: 'damage', n: m[1] === 'x' ? 'X' : +m[1], to: [{ t: 'self' }], from: { t: 'self' } }]]);
EXT.rules.push([/^~ deals (\d+|x) damage to (.+?) and (\d+) damage to (itself|you|each opponent)$/, (m, ctx) => {
  const k0 = ctx.specs.length;
  const a = parseSentence(`~ deals ${m[1]} damage to ${m[2]}`, ctx);
  if (!a || a.some((e: any) => e.k === 'manual')) { ctx.specs.length = k0; return null; }
  const to = m[4] === 'itself' ? { t: 'self' } : m[4] === 'you' ? { t: 'you' } : { t: 'eachOpp' };
  return [...a, { k: 'damage', n: +m[3], to: [to], from: { t: 'self' } }];
}]);

// "This ability costs {1} less to activate for each legendary creature you control." (channel lands, …)
EXT.seqs.push((sents, i, _ctx, ab) => {
  const m = sents[i].match(/^this ability costs \{(\d+)\} less to activate for each (.+)$/);
  if (!m) return null;
  const amt = parseCountPhrase(m[2]);
  if (amt == null) return null;
  (ab as any).costLess = { n: +m[1], amt };
  return 0;
});
EXT.hooks.actCostMod.push((s, p, iid, a, cost, api) => {
  const cl = a.ability?.costLess;
  if (!cl || !cost) return cost;
  const less = cl.n * Math.max(0, api.evalAmt(s, cl.amt, p, iid));
  const g = +(cost.match(/\{(\d+)\}/)?.[1] ?? 0);
  const left = Math.max(0, g - less);
  return (left ? `{${left}}` : '') + cost.replace(/\{\d+\}/g, '');
});

// "Untap all permanents / creatures and lands / artifacts you control during each other player's untap step." (Seedborn Muse)
EXT.lines.push((line, pc) => {
  const m = line.match(/^untap all (.+?) you control during each (?:other player's|opponent's) untap step$/);
  if (!m) return false;
  const fs = m[1].split(/ and /).map((x) => (x === 'permanents' ? {} : looseFilter(x.replace(/s$/, ''))));
  if (fs.some((f) => !f)) return false;
  pc.untapOthersAll = fs;
  return true;
});
EXT.hooks.step.push((s, step, api) => {
  if (step !== 'untap') return;
  for (const src of s.battlefield) {
    const fs = (api.chars(s, src).pc as any).untapOthersAll as any[] | undefined;
    const me = s.cards[src].controller;
    if (!fs || me === s.active) continue;
    for (const b of s.battlefield) {
      const c: any = s.cards[b];
      if (c.controller !== me || !c.tapped) continue;
      if (fs.some((f) => !Object.keys(f).length || api.matchesFilter(s, b, { ...f, zone: 'battlefield' }, me, src))) c.tapped = false;
    }
  }
});

// "Return a creature or planeswalker card from your graveyard to your hand / the battlefield." (not targeted: chosen on resolution)
EXT.rules.push([/^return (a|an|up to one|up to two|two) (.+?) cards? from your graveyard to (your hand|the battlefield)( tapped)?$/, (m) => {
  const f = looseFilter(m[2]) ?? parseFilter(m[2] + ' card');
  if (!f) return null;
  const n = /two/.test(m[1]) ? 2 : 1;
  return [{ k: 'ext', name: 'gyReturn', filter: { ...f, zone: undefined }, n, upTo: /up to/.test(m[1]), dest: m[3] === 'your hand' ? 'hand' : 'battlefield', tapped: !!m[4] }];
}]);
EXT.effects.gyReturn = ({ s, item, e, r, you, api }) => {
  const cands = s.players[you].graveyard.filter((c: string) => c !== item.source && api.matchesFilter(s, c, { ...e.filter, zone: 'graveyard' }, you));
  if (!cands.length) return 'done';
  if (!r.sub) {
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'chooseCards', title: `${item.label}: return ${e.n === 1 ? 'a card' : `${e.upTo ? 'up to ' : ''}${e.n} cards`} from your graveyard`, cards: cands, min: e.upTo ? 0 : Math.min(e.n, cands.length), max: Math.min(e.n, cands.length), data: { ctx: 'resolve' } });
    return 'wait';
  }
  const got: string[] = [];
  for (const c of r.sub.answer ?? []) if (s.cards[c]?.zone === 'graveyard') { api.moveCard(s, c, e.dest, e.dest === 'battlefield' ? { controller: you, tapped: e.tapped } : {}); got.push(c); }
  (item as any).lastTokens = got;
  return 'done';
};

// "Its controller may draw up to two cards at the beginning of the next turn's upkeep. You draw a card at the beginning
// of the next turn's upkeep." (Arcane Denial)
EXT.rules.push([/^(you|its controller|that player|target player) (may )?draws? (a card|up to two cards|two cards|three cards) at the beginning of the next turn's upkeep$/, (m, ctx) => {
  const who = m[1] === 'you' ? { t: 'you' } : parsePlayerSubject(m[1], ctx);
  if (!who) return null;
  const n = /a card/.test(m[3]) ? 1 : /three/.test(m[3]) ? 3 : 2;
  return [{ k: 'ext', name: 'scheduleDraw', who, n, may: !!m[2] || /up to/.test(m[3]) }];
}]);
EXT.effects.scheduleDraw = ({ s, item, e, you, api }) => {
  const ps: number[] = e.who.t === 'you' ? [you] : api.subjPlayers(s, item, e.who);
  for (const p of ps) {
    const draw = { k: 'draw', n: e.n, who: { t: 'you' } };
    s.delayed.push({ at: 'nextUpkeep', controller: p, source: item.source, label: item.label, effects: [e.may ? { k: 'may', effects: [draw], text: `draw ${e.n === 1 ? 'a card' : `${e.n} cards`}` } : draw], targets: [], refs: [] } as any);
  }
  return 'done';
};

// "Whenever one or more other creatures you control … enter, X. This ability triggers only once each turn." — with the
// once-per-turn limit, the batch trigger behaves exactly like the per-creature one (603.2c)
EXT.expand.push((line) => {
  const m = line.match(/^whenever one or more (other )?(.+?) you control (?:with (.+?) )?enter, (.+\. this ability triggers only once each turn)$/);
  if (!m) return null;
  const one = m[2].split(' ').map((w) => singular(w)).join(' ');
  return [`whenever ${m[1] ? 'another' : /^[aeiou]/.test(one) ? 'an' : 'a'} ${one}${m[3] ? ` with ${m[3]}` : ''} you control enters, ${m[4]}`];
});

// Mox Diamond: "If ~ would enter, you may discard a land card instead. If you do, put ~ onto the battlefield. If you
// don't, put it into its owner's graveyard." — asked as it enters; it can't be used until the choice is made
EXT.lines.push((line, pc) => {
  const m = line.match(/^if ~ would enter, you may discard (?:a|an) (.+?) card instead\. if you do, put ~ onto the battlefield\. if you don't, put it into its owner's graveyard$/);
  if (!m) return false;
  const f = looseFilter(m[1]);
  if (!f) return false;
  pc.moxDiscard = { ...f, zone: undefined };
  return true;
});
EXT.hooks.afterMove.push((s, iid, _from, to, _opts, api) => {
  if (to !== 'battlefield') return;
  const c: any = s.cards[iid];
  const f = (api.parsedFor(s, c) as any)?.moxDiscard;
  if (!f) return;
  c.moxPending = true;
  const it: any = { id: api.uid(s, 's'), kind: 'trigger', controller: c.controller, source: iid, label: api.nm(s, iid), text: 'Discard a land card or put it into the graveyard', effects: [{ k: 'ext', name: 'moxDiamond', filter: f }], targets: [] };
  it.preTargeted = true;
  s.pendingTriggers.push(it);
});
EXT.hooks.canActivate.push((s, _p, iid) => ((s.cards[iid] as any)?.moxPending ? false : undefined));
EXT.effects.moxDiamond = ({ s, item, e, r, api }) => {
  const c: any = s.cards[item.source];
  if (!c || c.zone !== 'battlefield') return 'done';
  const p = c.controller;
  const lands = s.players[p].hand.filter((h: string) => api.matchesFilter(s, h, { ...e.filter, zone: 'hand' }, p));
  if (lands.length && !r.sub) {
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: p, kind: 'chooseCards', title: `${item.label}: discard a land card to keep it (or it goes to the graveyard)`, cards: lands, min: 0, max: 1, data: { ctx: 'resolve' } });
    return 'wait';
  }
  const pick = (r.sub?.answer ?? [])[0];
  c.moxPending = false;
  if (pick && lands.includes(pick)) api.moveCard(s, pick, 'graveyard', { cause: 'discard' });
  else { api.log(s, `${api.nm(s, item.source)} is put into the graveyard.`, p); api.moveCard(s, item.source, 'graveyard'); }
  return 'done';
};

// "Target opponent sacrifices a creature of their choice, discards a card, and loses 3 life." — one subject, a list of verbs
EXT.rules.push([/^(target opponent|each opponent|target player|each player|that player|you) ((?:[a-z]+s|draw|discard|lose|gain|sacrifice|mill|create) [^,]+?), ((?:[a-z]+s|draw|discard|lose|gain|sacrifice|mill|create) [^,]+?),? and ((?:[a-z]+s|draw|discard|lose|gain|sacrifice|mill|create) .+)$/, (m, ctx) => {
  const k0 = ctx.specs.length;
  const first = parseSentence(`${m[1]} ${m[2]}`, ctx);
  if (!first || first.some((e: any) => e.k === 'manual')) { ctx.specs.length = k0; return null; }
  const sub = /^target/.test(m[1]) ? 'that player' : m[1];
  if (/^target/.test(m[1])) ctx.lastPlayer = ((first as any[]).find((e: any) => e.who)?.who) ?? ctx.lastPlayer;
  const out = [...first];
  for (const c of [m[3], m[4]]) {
    const r = parseSentence(`${sub} ${c}`, ctx);
    if (!r || r.some((e: any) => e.k === 'manual')) { ctx.specs.length = k0; return null; }
    out.push(...r);
  }
  return out;
}]);

// Chaos Warp: "The owner of target permanent shuffles it into their library, then reveals the top card of their
// library. If it's a permanent card, they put it onto the battlefield."
EXT.seqs.push((sents, i, ctx, ab) => {
  const m = sents[i].match(/^the owner of (target .+?) shuffles it into their library$/);
  if (!m) return null;
  const k0 = ctx.specs.length;
  const what = parseSubject(m[1], ctx);
  if (!what) return null;
  ab.effects.push({ k: 'ext', name: 'shuffleIn', what } as any);
  if (/^(?:then )?reveals the top card of their library$/.test(sents[i + 1] ?? '') && /^if it's a permanent card, (?:they|that player) puts? it onto the battlefield$/.test(sents[i + 2] ?? '')) {
    ab.effects.push({ k: 'ext', name: 'chaosWarpReveal', what } as any);
    return 2;
  }
  if (ctx.specs.length !== k0 + 1) { ctx.specs.length = k0; ab.effects.pop(); return null; }
  return 0;
});
EXT.effects.chaosWarpReveal = ({ s, item, e, api }) => {
  const c = api.subjCards(s, item, e.what)[0];
  const owner = c ? s.cards[c].owner : null;
  if (owner == null) return 'done';
  const top = s.players[owner].library[0];
  if (!top) return 'done';
  api.log(s, `${api.pname(s, owner)} reveals ${api.nm(s, top)}.`, owner);
  if (/\b(Creature|Artifact|Enchantment|Land|Planeswalker|Battle)\b/.test(s.defs[s.cards[top].defId].typeLine.split(' // ')[0])) api.moveCard(s, top, 'battlefield', { controller: owner });
  return 'done';
};

// Animate Dead / Dance of the Dead: "When this Aura enters, if it's on the battlefield, it loses "enchant creature card
// in a graveyard" and gains "enchant creature put onto the battlefield with this Aura." Return/Put enchanted creature
// card (on)to the battlefield (tapped) under your control and attach this Aura to it. When this Aura leaves the
// battlefield, that creature's controller sacrifices it."
EXT.lines.push((line, pc) => {
  const m = line.match(/^when ~ enters, if it's on the battlefield, it loses "enchant creature card in a graveyard" and gains "enchant creature put onto the battlefield with ~\.?" (?:return|put) enchanted creature card (?:to|onto) the battlefield( tapped)? under your control and attach ~ to it\. when ~ leaves the battlefield, that creature's controller sacrifices it$/);
  if (!m) return false;
  pc.triggers.push({ event: 'etb', text: 'animate dead', ability: { text: 'return enchanted creature card', effects: [{ k: 'ext', name: 'animateDead', tapped: !!m[1] }], specs: [], manual: [] } } as any);
  pc.triggers.push({ event: 'ltb', text: 'animate dead leaves', ability: { text: 'sacrifice it', effects: [{ k: 'ext', name: 'animateDeadSac' }], specs: [], manual: [] } } as any);
  return true;
});
EXT.effects.animateDead = ({ s, item, e, you, api }) => {
  const aura: any = s.cards[item.source];
  if (!aura || aura.zone !== 'battlefield') return 'done';
  const t = aura.attachedTo;
  if (!t || s.cards[t]?.zone !== 'graveyard') { api.moveCard(s, item.source, 'graveyard'); return 'done'; }
  api.moveCard(s, t, 'battlefield', { controller: you, tapped: e.tapped });
  aura.attachedTo = t;
  aura.animated = t;
  return 'done';
};
EXT.effects.animateDeadSac = ({ s, item, api }) => {
  const t = (s.cards[item.source] as any)?.animated;
  if (t && s.cards[t]?.zone === 'battlefield') api.moveCard(s, t, 'graveyard', { cause: 'sacrifice' });
  return 'done';
};
