// Plugin: more trigger events.
//  "whenever a player / an opponent / you sacrifice(s) a permanent / a creature"
//  "whenever a token you control / another permanent leaves the battlefield"
//  "whenever a creature blocks"
//  "whenever a land card / a card is put into your / an opponent's graveyard from anywhere"
//  "whenever you / an opponent play(s) a land"
//  "whenever you cast a kicked spell"
import { EXT } from '../ext';
import { parseFilter } from '../oracle';
import type { GameState, PlayerIdx } from '../types';

const TO = { t: 'triggerObj' } as const;
const TP = { t: 'triggerPlayer' } as const;
const sing = (p: string) => p.replace(/ies\b/g, 'y').replace(/(?<![su])s\b/g, '');
const WHO: Record<string, string> = { 'a player': 'any', 'an opponent': 'opp', you: 'you' };

EXT.triggers.push((cond) => {
  let m: RegExpMatchArray | null;
  if ((m = cond.match(/^whenever (a player|an opponent|you) sacrifices? (?:a|an|another) (.+)$/))) {
    const f = m[2] === 'permanent' ? {} : parseFilter(m[2]);
    return f ? [{ event: 'sacX', filter: f, data: { who: WHO[m[1]], other: /another/.test(cond) }, last: TO, lastPlayer: TP }] : null;
  }
  if ((m = cond.match(/^whenever (?:a|an|another) (.+?) (you control |an opponent controls )?leaves the battlefield$/))) {
    if (/~/.test(m[1])) return null;
    const f = m[1] === 'permanent' ? {} : m[1] === 'token' ? { token: true } : parseFilter(m[1]);
    return f ? [{ event: 'leaveX', filter: f, data: { ctrl: m[2] ? (m[2].startsWith('you') ? 'you' : 'opp') : undefined, other: /^whenever another/.test(cond) }, last: TO, lastPlayer: TP }] : null;
  }
  if (/^whenever a creature blocks$/.test(cond)) return [{ event: 'anyBlocks', last: TO }];
  if ((m = cond.match(/^whenever (?:a|an|one or more) (?:(.+?) )?cards? (?:is|are) put into (your|an opponent's|a|a player's) graveyard from anywhere$/))) {
    const f = m[1] ? parseFilter(sing(m[1])) : {};
    return f ? [{ event: 'gyAnywhere', filter: { ...f, zone: undefined }, data: { whose: m[2] === 'your' ? 'you' : m[2] === "an opponent's" ? 'opp' : 'any' }, last: TO, lastPlayer: TP }] : null;
  }
  if ((m = cond.match(/^whenever (you|an opponent|a player) plays? a land$/))) return [{ event: 'landPlay', data: { who: WHO[m[1]] }, last: TO, lastPlayer: TP }];
  if (/^whenever you cast a kicked spell$/.test(cond)) return [{ event: 'castKicked', last: TO }];
  return null;
});

function each(s: GameState, api: any, event: string, fn: (oid: string, t: any, ctrl: PlayerIdx) => void) {
  for (const oid of [...api.observers(s)]) {
    const o = s.cards[oid];
    if (!o) continue;
    for (const t of api.chars(s, oid).pc.triggers as any[]) if (t.event === event) fn(oid, t, o.controller);
  }
}
const whoOk = (w: string, ctrl: PlayerIdx, p: PlayerIdx) => w === 'any' || (w === 'you' ? p === ctrl : p !== ctrl);
// printed type line match for a card that just left the battlefield (its characteristics are gone)
const printed = (s: GameState, api: any, iid: string, f: any, ctrl: PlayerIdx, self: string) => {
  if (!f || !Object.keys(f).filter((k) => f[k] !== undefined && k !== 'zone').length) return true;
  return api.matchesFilter(s, iid, { ...f, zone: s.cards[iid]?.zone }, ctrl, self);
};

EXT.hooks.event.push((s, name, d, api) => {
  if (name === 'leave' && d.card) {
    const iid = d.iid as string;
    const p = d.controller as PlayerIdx;
    if (d.opts?.cause === 'sacrifice') each(s, api, 'sacX', (oid, t, ctrl) => { if (whoOk(t.data.who, ctrl, p) && !(t.data.other && oid === iid) && printed(s, api, iid, t.filter, ctrl, oid)) api.queueTrigger(s, oid, ctrl, t, { triggerObj: iid, triggerPlayer: p }); });
    each(s, api, 'leaveX', (oid, t, ctrl) => {
      if (oid === iid && t.data.other) return;
      if (t.data.ctrl && !whoOk(t.data.ctrl, ctrl, p)) return;
      if (t.filter?.token && !(d.card as any).token) return;
      if (printed(s, api, iid, { ...t.filter, token: undefined }, ctrl, oid)) api.queueTrigger(s, oid, ctrl, t, { triggerObj: iid, triggerPlayer: p });
    });
  }
  if (name === 'blocks') for (const b of d.list ?? []) each(s, api, 'anyBlocks', (oid, t, ctrl) => api.queueTrigger(s, oid, ctrl, t, { triggerObj: b.blocker }));
  if (name === 'landPlayed') each(s, api, 'landPlay', (oid, t, ctrl) => { if (whoOk(t.data.who, ctrl, d.p)) api.queueTrigger(s, oid, ctrl, t, { triggerObj: d.iid, triggerPlayer: d.p }); });
  if (name === 'cast' && (s.cards[d.item.source] as any)?.kicked && d.item.kind === 'spell') each(s, api, 'castKicked', (oid, t, ctrl) => { if (ctrl === d.item.controller) api.queueTrigger(s, oid, ctrl, t, { triggerObj: d.item.source }); });
});
EXT.hooks.afterMove.push((s, iid, _from, to, _opts, api) => {
  if (to !== 'graveyard' || s.cards[iid]?.zone !== 'graveyard') return;
  const owner = s.cards[iid].owner;
  each(s, api, 'gyAnywhere', (oid, t, ctrl) => {
    if (oid === iid) return;
    if (t.data.whose !== 'any' && !whoOk(t.data.whose, ctrl, owner)) return;
    if (printed(s, api, iid, t.filter, ctrl, oid)) api.queueTrigger(s, oid, ctrl, t, { triggerObj: iid, triggerPlayer: owner });
  });
});

// "Whenever enchanted creature / enchanted land / equipped creature becomes tapped" and
// "Whenever a creature an opponent controls becomes tapped"
EXT.triggers.push((cond) => {
  let m: RegExpMatchArray | null;
  if ((m = cond.match(/^whenever (enchanted|equipped) (creature|land|permanent|artifact) becomes tapped$/))) return [{ event: 'attachTapped', last: { t: m[1] } }];
  if ((m = cond.match(/^whenever (?:a|an|another) (.+?) (you control |an opponent controls )?becomes tapped$/))) {
    if (/~/.test(m[1])) return null;
    const f = parseFilter(m[1]);
    return f ? [{ event: 'anyTapped', filter: f, data: { ctrl: m[2] ? (m[2].startsWith('you') ? 'you' : 'opp') : undefined }, last: TO, lastPlayer: TP }] : null;
  }
  return null;
});
EXT.hooks.event.push((s, name, d, api) => {
  if (name !== 'tapped') return;
  for (const a of s.battlefield) {
    if (s.cards[a].attachedTo !== d.iid) continue;
    for (const t of api.chars(s, a).pc.triggers as any[]) if (t.event === 'attachTapped') api.queueTrigger(s, a, s.cards[a].controller, t, { triggerObj: d.iid, triggerPlayer: d.p });
  }
  each(s, api, 'anyTapped', (oid, t, ctrl) => {
    if (t.data.ctrl && !whoOk(t.data.ctrl, ctrl, d.p)) return;
    if (api.matchesFilter(s, d.iid, { ...t.filter, zone: 'battlefield' }, ctrl, oid)) api.queueTrigger(s, oid, ctrl, t, { triggerObj: d.iid, triggerPlayer: d.p });
  });
});

// "Whenever an opponent casts their first noncreature spell each turn" (Esper Sentinel) / "whenever you cast your
// second instant or sorcery spell each turn"
const ORD: Record<string, number> = { first: 1, second: 2, third: 3 };
EXT.triggers.push((cond) => {
  const m = cond.match(/^whenever (you cast your|an opponent casts their|a player casts their) (first|second|third) (.+?) spell each turn$/);
  if (!m) return null;
  const f = parseFilter(m[3] + ' spell');
  return f ? [{ event: 'nthTypeCast', filter: f, data: { n: ORD[m[2]], who: m[1].startsWith('you') ? 'you' : m[1].startsWith('an') ? 'opp' : 'any' }, last: TO, lastPlayer: TP }] : null;
});
EXT.hooks.event.push((s, name, d, api) => {
  if (name !== 'cast' || d.item.kind !== 'spell') return;
  const p = d.item.controller as PlayerIdx;
  const k = ((s as any).nthTC ??= { turn: -1, seen: {} });
  if (k.turn !== s.turn) { k.turn = s.turn; k.seen = {}; }
  each(s, api, 'nthTypeCast', (oid, t, ctrl) => {
    if (!whoOk(t.data.who, ctrl, p)) return;
    if (!api.matchesFilter(s, d.item.source, { ...t.filter, zone: 'stack' }, ctrl, oid)) return;
    const key = `${oid}:${t.text}:${p}`;
    k.seen[key] = (k.seen[key] ?? 0) + 1;
    if (k.seen[key] === t.data.n) api.queueTrigger(s, oid, ctrl, t, { triggerObj: d.item.source, triggerPlayer: p });
  });
});
EXT.amountPhrases.push((ph) => (/^(?:the number of )?spells? you've cast this turn$/.test(ph) ? { ext: 'spellsCastTurn' } : null));
EXT.amounts.spellsCastTurn = (s, _a, you) => (s.players[you] as any).spellsCastThisTurn ?? 0;

// "Whenever you cast a creature spell with mana value 3 or less / 5 or greater / power 5 or greater / {X} in its mana
// cost" and lists "a Cat, Dog, or Hero spell", "an instant, sorcery, or Wizard spell"; opponents' versions too
export const spellF = (ph: string): any | null => {
  let extra: any = {};
  let m: RegExpMatchArray | null;
  if ((m = ph.match(/^(.*?) ?spell with mana value (\d+) or (less|greater)$/))) { extra = m[3] === 'less' ? { cmcMax: +m[2] } : { cmcMin: +m[2] }; ph = m[1]; }
  else if ((m = ph.match(/^(.*?) ?spell with power (\d+) or greater$/))) { extra = { powerMin: +m[2] }; ph = m[1]; }
  else if ((m = ph.match(/^(.*?) ?spell with \{x\} in its mana cost$/))) { extra = { hasX: true }; ph = m[1]; }
  else if ((m = ph.match(/^(.*?) spell$/))) ph = m[1];
  else return null;
  if (!ph || ph === 'a' || ph === 'an') return { ...extra };
  const words = ph.replace(/^(?:a|an) /, '').split(/,? or |, /).map((x) => x.trim());
  if (words.length > 1) {
    const fs = words.map((w) => parseFilter(`${w} spell`));
    if (fs.some((f) => !f)) return null;
    return { anyOf: fs.map((f: any) => { const g = { ...f }; delete g.zone; return g; }), ...extra };
  }
  const f = parseFilter(`${words[0]} spell`);
  if (!f) return null;
  const g: any = { ...f, ...extra };
  delete g.zone;
  return g;
};
EXT.triggers.push((cond) => {
  const m = cond.match(/^whenever (you|an opponent|a player) casts? (an? .+)$/);
  if (!m || !/ with |, | or /.test(m[2]) || / that | from | during | other than /.test(m[2])) return null;
  const f = spellF(m[2]);
  if (!f) return null;
  if (m[1] === 'you') return [{ event: 'castSpell', filter: f, last: TO }];
  return [{ event: 'anyCast', filter: f, data: { who: m[1] === 'an opponent' ? 'opp' : 'any' }, last: TO, lastPlayer: TP, ...(m[1] === 'an opponent' ? { cond: { k: 'ext', name: 'casterOpp' } } : {}) }];
});
EXT.condEval.casterOpp = (s, _c, you, _self, ctx) => { const tp = (ctx as any)?.triggerPlayer; return tp === undefined ? true : tp !== you; };
// "whenever you cast a Cat, Dog, or Hero spell, …": the commas in the list aren't the end of the trigger condition
EXT.expand.push((line) => {
  const m = line.match(/^(whenever (?:you cast|an opponent casts|a player casts) an? )([a-z]+(?:, [a-z]+)+,? or [a-z]+)( spell.*)$/);
  return m ? [`${m[1]}${m[2].replace(/,? or /, ', ').split(', ').join(' or ')}${m[3]}`] : null;
});

// "Whenever an opponent draws their second card each turn" / "… gains life" / "… is dealt noncombat damage" /
// "… activates a loyalty ability / an ability of an artifact they control"
EXT.triggers.push((cond) => {
  let m: RegExpMatchArray | null;
  if ((m = cond.match(/^whenever (an opponent|a player|you) draws? (?:their|your) (second|third) card each turn$/))) return [{ event: 'nthDraw', data: { who: WHO[m[1]], n: m[2] === 'second' ? 2 : 3 }, lastPlayer: TP }];
  if ((m = cond.match(/^whenever (an opponent|a player) gains life$/))) return [{ event: 'anyGain', data: { who: WHO[m[1]] }, lastPlayer: TP }];
  if ((m = cond.match(/^whenever (an opponent|a player) is dealt (noncombat )?damage$/))) return [{ event: 'playerDealt', data: { who: WHO[m[1]], noncombat: !!m[2] }, lastPlayer: TP }];
  if ((m = cond.match(/^whenever (an opponent|a player) activates (a loyalty ability|an ability of an artifact they control|an ability that isn't a mana ability)$/))) return [{ event: 'oppActivate', data: { who: WHO[m[1]], kind: m[2] }, lastPlayer: TP }];
  return null;
});
EXT.hooks.event.push((s, name, d, api) => {
  if (name === 'draw') {
    const k = ((s as any).drawN ??= { turn: -1, n: [0, 0] });
    if (k.turn !== s.turn) { k.turn = s.turn; k.n = [0, 0]; }
    k.n[d.p]++;
    each(s, api, 'nthDraw', (oid, t, ctrl) => { if (whoOk(t.data.who, ctrl, d.p) && k.n[d.p] === t.data.n) api.queueTrigger(s, oid, ctrl, t, { triggerPlayer: d.p }); });
  }
  if (name === 'lifeGained') each(s, api, 'anyGain', (oid, t, ctrl) => { if (whoOk(t.data.who, ctrl, d.p)) api.queueTrigger(s, oid, ctrl, t, { triggerPlayer: d.p, amount: d.n } as any); });
  if (name === 'dealt' && d.to?.kind === 'player') each(s, api, 'playerDealt', (oid, t, ctrl) => { if (whoOk(t.data.who, ctrl, d.to.idx) && !(t.data.noncombat && d.combat)) api.queueTrigger(s, oid, ctrl, t, { triggerPlayer: d.to.idx, amount: d.n } as any); });
  if (name === 'activate') each(s, api, 'oppActivate', (oid, t, ctrl) => {
    if (!whoOk(t.data.who, ctrl, d.p)) return;
    const a = d.a;
    if (t.data.kind === 'a loyalty ability' && a?.special !== 'loyalty') return;
    if (t.data.kind === 'an ability of an artifact they control' && !(s.cards[d.iid] && api.chars(s, d.iid).types.has('artifact'))) return;
    if (t.data.kind === "an ability that isn't a mana ability" && a?.isMana) return;
    api.queueTrigger(s, oid, ctrl, t, { triggerPlayer: d.p, triggerObj: d.iid });
  });
});

// ---- "Whenever one or more …" batch triggers: they trigger once for a group of simultaneous events, so a trigger
// already waiting (pending) from the same source isn't queued again ----
const pendingHas = (s: GameState, oid: string, t: any) => s.pendingTriggers.some((x: any) => x.source === oid && x.text === t.text);
const BATCH: [RegExp, (m: RegExpMatchArray) => any][] = [
  [/^whenever one or more (other )?(.+?) (you control |your opponents control )?die$/, (m) => ({ ev: 'bDie', f: sing(m[2]), other: !!m[1], ctrl: m[3] ? (m[3].startsWith('you') ? 'you' : 'opp') : 'any' })],
  [/^whenever one or more (.+?) cards leave your graveyard$/, (m) => ({ ev: 'bGyLeave', f: sing(m[1]) })],
  [/^whenever one or more cards leave your graveyard$/, () => ({ ev: 'bGyLeave', f: '' })],
  [/^whenever one or more (other )?(.+?) you control enter$/, (m) => ({ ev: 'bEnter', f: sing(m[2]), other: !!m[1], ctrl: 'you' })],
  [/^whenever one or more (.+?) your opponents control enter$/, (m) => ({ ev: 'bEnter', f: sing(m[1]), ctrl: 'opp' })],
  [/^whenever one or more creatures attack( you)?$/, (m) => ({ ev: 'bAttack', you: !!m[1] })],
  [/^whenever one or more creatures you control become blocked$/, () => ({ ev: 'bBlocked' })],
  [/^whenever one or more ([+-]\d\/[+-]\d|\w+) counters are put on (?:a|another) (.+?)( you control)?$/, (m) => ({ ev: 'bCounters', counter: m[1], f: m[2], ctrl: m[3] ? 'you' : 'any', other: /another/.test(m[0]) })],
  [/^whenever one or more (?:(.+?) )?cards are put into your graveyard from your library$/, (m) => ({ ev: 'bMill', f: m[1] ? sing(m[1]) : '' })],
  [/^whenever one or more creatures deal combat damage to you$/, () => ({ ev: 'bDmgYou' })],
  [/^whenever one or more (.+?) you control deal combat damage to (?:a player|one or more players|an opponent)$/, (m) => ({ ev: 'bCombat', f: sing(m[1]) })],
];
EXT.triggers.push((cond) => {
  for (const [re, fn] of BATCH) {
    const m = cond.match(re);
    if (!m) continue;
    const d = fn(m);
    if (d.f !== undefined && d.f !== '') {
      const f = d.f === 'token' ? { token: true } : d.f === 'permanent' ? {} : looseFilterLite(d.f);
      if (!f) return null;
      d.filter = f;
    }
    return [{ event: d.ev, data: d, last: TO, lastPlayer: TP }];
  }
  return null;
});
const looseFilterLite = (ph: string): any | null => { const f = parseFilter(ph); if (!f) return null; const g: any = { ...f }; delete g.zone; return g; };
const fireBatch = (s: GameState, api: any, ev: string, ok: (t: any, ctrl: PlayerIdx, oid: string) => boolean, extra: (t: any) => any = () => ({})) => {
  each(s, api, ev, (oid, t, ctrl) => { if (!pendingHas(s, oid, t) && ok(t, ctrl, oid)) api.queueTrigger(s, oid, ctrl, t, extra(t)); });
};
const fOk = (s: GameState, api: any, iid: string, f: any, ctrl: PlayerIdx, oid: string) => {
  if (!f) return true;
  if (f.token && !(s.cards[iid] as any)?.token) return false;
  const g = { ...f }; delete g.token;
  return !Object.keys(g).length || api.matchesFilter(s, iid, { ...g, zone: s.cards[iid]?.zone }, ctrl, oid);
};
EXT.hooks.event.push((s, name, d, api) => {
  if (name === 'leave' && d.to === 'graveyard' && d.wasCreature) {
    fireBatch(s, api, 'bDie', (t, ctrl, oid) => (!t.data.other || oid !== d.iid) && (t.data.ctrl === 'any' || whoOk(t.data.ctrl, ctrl, d.controller)) && fOk(s, api, d.iid, t.data.filter, ctrl, oid), () => ({ triggerObj: d.iid }));
  }
  if (name === 'attack' && d.list?.length) fireBatch(s, api, 'bAttack', (t, ctrl) => !t.data.you || d.list.some((a: any) => a.target?.kind === 'player' && a.target.idx === ctrl), () => ({ refs: d.list.map((a: any) => a.iid) }));
  if (name === 'blocks') {
    const atk = (s.combat?.attackers ?? []).filter((a: any) => a.blocked);
    if (atk.length) fireBatch(s, api, 'bBlocked', (_t, ctrl) => atk.some((a: any) => s.cards[a.iid]?.controller === ctrl), () => ({ refs: atk.map((a: any) => a.iid) }));
  }
  if (name === 'counters' && s.cards[d.iid]?.zone === 'battlefield') fireBatch(s, api, 'bCounters', (t, ctrl, oid) => t.data.counter === d.counter && (!t.data.other || oid !== d.iid) && (t.data.ctrl === 'any' || s.cards[d.iid].controller === ctrl) && fOk(s, api, d.iid, t.data.filter, ctrl, oid), () => ({ triggerObj: d.iid }));
  if (name === 'dealt' && d.combat && d.to?.kind === 'player') {
    fireBatch(s, api, 'bDmgYou', (_t, ctrl) => d.to.idx === ctrl);
    fireBatch(s, api, 'bCombat', (t, ctrl, oid) => d.to.idx !== ctrl && s.cards[d.source]?.controller === ctrl && fOk(s, api, d.source, t.data.filter, ctrl, oid), () => ({ triggerPlayer: d.to.idx }));
  }
});
EXT.hooks.afterMove.push((s, iid, from, to, _o, api) => {
  const c = s.cards[iid];
  if (!c) return;
  if (from === 'graveyard') fireBatch(s, api, 'bGyLeave', (t, ctrl, oid) => c.owner === ctrl && (!t.data.filter || api.matchesFilter(s, iid, { ...t.data.filter, zone: c.zone }, ctrl, oid)));
  if (to === 'battlefield') fireBatch(s, api, 'bEnter', (t, ctrl, oid) => (!t.data.other || oid !== iid) && whoOk(t.data.ctrl, ctrl, c.controller) && fOk(s, api, iid, t.data.filter, ctrl, oid), () => ({ triggerObj: iid }));
  if (from === 'library' && to === 'graveyard') fireBatch(s, api, 'bMill', (t, ctrl, oid) => c.owner === ctrl && (!t.data.filter || api.matchesFilter(s, iid, { ...t.data.filter, zone: 'graveyard' }, ctrl, oid)), () => ({ triggerObj: iid }));
});
