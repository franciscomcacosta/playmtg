// Plugin: set mechanics — Start your engines!/speed, prepared (cast a copy of the spell half), the Ring tempts you.
import { EXT } from '../ext';
import { mkAct, parseCard } from '../oracle';
import type { GameState, PlayerIdx } from '../types';

const P = (s: GameState, p: PlayerIdx) => s.players[p] as any;

// ==========================================================================================
// Start your engines! (702.179) — speed 1..4, rises once per turn when an opponent loses life on your turn.
// ==========================================================================================
EXT.lines.push((line, pc) => {
  if (line !== 'start your engines!') return false;
  pc.startEngines = true;
  return true;
});
EXT.gates.push([/^max speed$/, { k: 'ext', name: 'maxSpeed' }]);
EXT.condEval.maxSpeed = (s, _c, you) => (P(s, you).speed ?? 0) >= 4;
EXT.conds.push((t) => (/^you have max speed$/.test(t) ? { k: 'ext', name: 'maxSpeed' } : /^your speed is (\d+) or greater$/.test(t) ? { k: 'ext', name: 'speedAtLeast', n: +t.match(/\d+/)![0] } : null));
EXT.condEval.speedAtLeast = (s, c, you) => (P(s, you).speed ?? 0) >= c.n;
EXT.hooks.afterMove.push((s, iid, _from, to, opts, api) => {
  if (to !== 'battlefield') return;
  const c = s.cards[iid];
  if (!c) return;
  const pl = P(s, c.controller);
  if (pl.speed || !(api.chars(s, iid).pc as any).startEngines) return;
  pl.speed = 1;
  api.log(s, `${pl.name} starts their engines! Speed 1.`, c.controller);
  api.ev(s, { k: 'pcounter', p: c.controller, counter: 'speed', n: 1 });
  void opts;
});
EXT.hooks.event.push((s, name, d, api) => {
  if (name !== 'lifeLost') return;
  const me = s.active as PlayerIdx;
  if (d.p === me) return;
  const pl = P(s, me);
  if (!pl.speed || pl.speed >= 4 || pl.speedTurn === s.turn) return;
  pl.speedTurn = s.turn;
  pl.speed++;
  api.log(s, `${pl.name}'s speed increases to ${pl.speed}${pl.speed === 4 ? ' (max speed!)' : ''}.`, me);
  api.ev(s, { k: 'pcounter', p: me, counter: 'speed', n: 1 });
  // "whenever your speed increases"
  for (const b of s.battlefield) {
    if (s.cards[b].controller !== me) continue;
    for (const t of api.chars(s, b).pc.triggers as any[]) if (t.event === 'speedUp') api.queueTrigger(s, b, me, t, {});
  }
});
EXT.triggers.push((cond) => (/^whenever your speed increases$/.test(cond) ? [{ event: 'speedUp' }] : null));
EXT.rules.push([/^your speed increases by (\w+)$/, (m) => [{ k: 'ext', name: 'speedUp', n: m[1] === 'one' ? 1 : +m[1] || 1 }]]);
EXT.effects.speedUp = ({ s, e, you, api }) => {
  const pl = P(s, you);
  pl.speed = Math.min(4, Math.max(pl.speed ?? 0, 0) + e.n);
  api.ev(s, { k: 'pcounter', p: you, counter: 'speed', n: e.n });
  return 'done';
};

// ==========================================================================================
// Prepared (Secrets of Strixhaven): while prepared you may cast a copy of the card's spell half.
// ==========================================================================================
EXT.lines.push((line, pc) => {
  if (line !== '~ enters prepared') return false;
  pc.entersPrepared = true;
  return true;
});
EXT.rules.push([/^(~|it) becomes prepared$/, () => [{ k: 'ext', name: 'prepare' }]]);
EXT.rules.push([/^(~|it) becomes unprepared$/, () => [{ k: 'ext', name: 'prepare', off: true }]]);
EXT.effects.prepare = ({ s, item, e, api }) => {
  const c = s.cards[item.source] as any;
  if (!c || c.zone !== 'battlefield') return 'done';
  c.prepared = !e.off;
  api.log(s, `${api.nm(s, item.source)} becomes ${e.off ? 'unprepared' : 'prepared'}.`, c.controller);
  api.ev(s, { k: 'chosen', iid: item.source, text: e.off ? 'Unprepared' : 'Prepared' });
  return 'done';
};
EXT.conds.push((t) => (/^~ is prepared$/.test(t) ? { k: 'ext', name: 'prepared' } : /^~ isn't prepared$/.test(t) ? { k: 'ext', name: 'prepared', not: true } : null));
EXT.condEval.prepared = (s, c, _you, self) => !!(self && (s.cards[self] as any)?.prepared) !== !!c.not;
EXT.post.push((pc, info) => {
  const def = info.def;
  if (def?.layout !== 'prepare' || !def.faces?.[1] || info.name !== def.faces[0].name) return;
  const sp = def.faces[1];
  pc.activated.push({ ...mkAct(`Cast a copy of ${sp.name} ${sp.manaCost}`, { mana: sp.manaCost, tap: false, untap: false, sacSelf: false }, { text: '', effects: [], specs: [], manual: [] }, {}), gate: { k: 'ext', name: 'prepared' }, extSpecial: 'prepare' });
});
EXT.hooks.afterMove.push((s, iid, _from, to, _o, api) => {
  const c = s.cards[iid] as any;
  if (!c) return;
  if (to === 'battlefield') c.prepared = !!(api.chars(s, iid).pc as any).entersPrepared;
  else c.prepared = false;
});
EXT.specials.prepare = (s, p, iid, _a, api) => {
  const src = s.cards[iid] as any;
  if (!src?.prepared) return 'Not prepared';
  const cid = `${iid}p${s.nextId++}`;
  const copy = api.newCardObj(cid, src.defId, p, 'exile');
  copy.prepCopy = true;
  copy.prepFrom = iid;
  copy.mayPlay = { player: p, untilTurn: s.turn };
  s.cards[cid] = copy;
  P(s, p).exile.push(cid);
  const err = api.beginCast(s, p, cid, 1, 'ext:prepare');
  if (err) {
    api.removeFromZone(s, cid);
    delete s.cards[cid];
    return err;
  }
  return null;
};
EXT.alts.prepare = {
  begin: (s, _p, iid) => s.defs[s.cards[iid].defId].faces?.[1]?.manaCost ?? '',
  pay: (s, pc) => {
    const c = s.cards[pc.iid] as any;
    const from = c?.prepFrom && s.cards[c.prepFrom];
    if (from) (from as any).prepared = false;
  },
};
EXT.hooks.finish.push((s, item, _countered, api) => {
  const c = s.cards[item.source] as any;
  if (!c?.prepCopy) return false;
  api.removeFromZone(s, item.source);
  delete s.cards[item.source];
  return true;
});
// A copy whose cast was cancelled never leaves exile: clean it up.
EXT.hooks.sba.push((s, api) => {
  let changed = false;
  for (const p of [0, 1] as PlayerIdx[]) {
    for (const x of [...P(s, p).exile]) {
      const c = s.cards[x] as any;
      if (!c?.prepCopy || (s.pendingCast && s.pendingCast.iid === x)) continue;
      api.removeFromZone(s, x);
      delete s.cards[x];
      changed = true;
    }
  }
  return changed;
});
void parseCard;

// ==========================================================================================
// The Ring tempts you (701.52)
// ==========================================================================================
EXT.rules.push([/^the ring tempts you$/, () => [{ k: 'ext', name: 'tempt' }]]);
const bearerOf = (s: GameState, p: PlayerIdx) => {
  const b = P(s, p).ringBearer as string | undefined;
  return b && s.cards[b]?.zone === 'battlefield' && s.cards[b].controller === p ? b : undefined;
};
EXT.effects.tempt = ({ s, r, you, api }) => {
  const pl = P(s, you);
  const cands = s.battlefield.filter((b) => s.cards[b].controller === you && api.chars(s, b).types.has('creature'));
  if (!r.sub) {
    pl.ringLevel = Math.min(4, (pl.ringLevel ?? 0) + 1);
    pl.tempted = (pl.tempted ?? 0) + 1;
    api.log(s, `The Ring tempts ${pl.name} (level ${pl.ringLevel}).`, you);
    api.ev(s, { k: 'pcounter', p: you, counter: 'ring', n: 1 });
    r.sub = {};
    if (cands.length > 1) {
      api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'chooseCards', title: 'The Ring tempts you: choose your Ring-bearer', cards: cands, min: 1, max: 1, data: { ctx: 'resolve' } });
      return 'wait';
    }
    r.sub.answer = cands;
  }
  const chosen: string | undefined = r.sub.answer?.[0];
  if (chosen) {
    pl.ringBearer = chosen;
    api.log(s, `${api.nm(s, chosen)} is ${pl.name}'s Ring-bearer.`, you);
    api.ev(s, { k: 'chosen', iid: chosen, text: 'Ring-bearer' });
  }
  pl.ringChoseOther = {};
  for (const b of s.battlefield) {
    if (s.cards[b].controller !== you) continue;
    for (const t of api.chars(s, b).pc.triggers as any[]) {
      if (t.event === 'tempted') { pl.ringChoseOther[b] = !!chosen && chosen !== b; api.queueTrigger(s, b, you, t, { triggerObj: chosen }); }
      if (t.event === 'chooseBearer' && chosen) api.queueTrigger(s, b, you, t, { triggerObj: chosen });
    }
  }
  for (const g of [...pl.graveyard]) for (const t of api.chars(s, g).pc.triggers as any[]) if (t.event === 'tempted') api.queueTrigger(s, g, you, t, {});
  return 'done';
};
EXT.triggers.push((cond) => {
  if (/^when(?:ever)? the ring tempts you$/.test(cond)) return [{ event: 'tempted' }];
  if (/^whenever you choose a creature as your ring-bearer$/.test(cond)) return [{ event: 'chooseBearer', last: { t: 'triggerObj' } }];
  return null;
});
EXT.conds.push((t) => {
  if (/^you chose a creature other than (?:~|[a-z'’ -]+) as your ring-bearer$/.test(t)) return { k: 'ext', name: 'bearerOther' };
  if (/^~ is your ring-bearer$/.test(t)) return { k: 'ext', name: 'isBearer' };
  if (/^you control a ring-bearer$/.test(t)) return { k: 'ext', name: 'hasBearer' };
  if (/^you don't control a ring-bearer$/.test(t)) return { k: 'ext', name: 'hasBearer', not: true };
  const m = t.match(/^the ring has tempted you (\w+) or more times this game$/);
  if (m) return { k: 'ext', name: 'temptedN', n: { two: 2, three: 3, four: 4 }[m[1] as 'two'] ?? +m[1] };
  return null;
});
EXT.condEval.bearerOther = (s, _c, you, self) => { const b = bearerOf(s, you); return !!b && b !== self; };
EXT.condEval.isBearer = (s, _c, you, self) => bearerOf(s, you) === self;
EXT.condEval.hasBearer = (s, c, you) => !!bearerOf(s, you) !== !!c.not;
EXT.condEval.temptedN = (s, c, you) => (P(s, you).tempted ?? 0) >= c.n;
EXT.rules.push([/^put (a|an|one|two|three) ([+-]\d\/[+-]\d) counters? on your ring-bearer$/, (m) => [{ k: 'ext', name: 'bearerCounters', counter: m[2], n: ({ a: 1, an: 1, one: 1, two: 2, three: 3 } as any)[m[1]] }]]);
EXT.effects.bearerCounters = ({ s, e, you, api }) => { const b = bearerOf(s, you); if (b) api.addCounters(s, b, e.counter, e.n); return 'done'; };

// Ring abilities by level: 1 legendary + can't be blocked by greater power; 2 loot on attack;
// 3 blockers are sacrificed at end of combat; 4 each opponent loses 3 life on combat damage.
EXT.hooks.canBlock.push((s, blocker, attacker, api) => {
  const ac = s.cards[attacker];
  if (!ac || bearerOf(s, ac.controller) !== attacker || !(P(s, ac.controller).ringLevel >= 1)) return undefined;
  return api.chars(s, blocker).power > api.chars(s, attacker).power ? false : undefined;
});
EXT.hooks.event.push((s, name, d, api) => {
  if (name === 'attack') {
    const b = bearerOf(s, d.p);
    if (b && P(s, d.p).ringLevel >= 2 && d.list.some((a: any) => a.iid === b))
      api.queueTrigger(s, b, d.p, { event: 'attacks', text: 'The Ring: draw a card, then discard a card', ability: api.parseAbility('draw a card, then discard a card') }, {});
  } else if (name === 'blocks') {
    for (const x of d.list) {
      const ac = s.cards[x.attacker];
      if (!ac || bearerOf(s, ac.controller) !== x.attacker || !(P(s, ac.controller).ringLevel >= 3)) continue;
      (((s as any).ringSac ??= []) as string[]).push(x.blocker);
    }
  } else if (name === 'dealt' && d.combat && d.to.kind === 'player') {
    const sc = s.cards[d.source];
    if (sc && bearerOf(s, sc.controller) === d.source && P(s, sc.controller).ringLevel >= 4 && !s.pendingTriggers.some((t) => t.source === d.source && t.text === 'The Ring: each opponent loses 3 life'))
      api.queueTrigger(s, d.source, sc.controller, { event: 'combatDamagePlayer', text: 'The Ring: each opponent loses 3 life', ability: api.parseAbility('each opponent loses 3 life') }, {});
  }
});
EXT.hooks.step.push((s, step, api) => {
  if (step !== 'endCombat') return;
  const list = ((s as any).ringSac ?? []) as string[];
  (s as any).ringSac = [];
  for (const b of list) {
    if (s.cards[b]?.zone !== 'battlefield') continue;
    api.log(s, `${api.nm(s, b)} blocked the Ring-bearer and is sacrificed.`, s.cards[b].controller);
    api.moveCard(s, b, 'graveyard', { cause: 'sacrifice' });
  }
});
