// Plugin: extra trigger events ("whenever you attack", "when you cast ~", "whenever ~ is dealt damage", …)
// Parsing: EXT.triggers turns a trigger head into { event, filter?, data? }; EXT.expand splits compound heads.
// Firing: the engine broadcasts game events (EXT.hooks.event) and this file queues the matching triggers.
import { EXT } from '../ext';
import { parseFilter } from '../oracle';
import type { GameState, PlayerIdx } from '../types';

const W: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, first: 1, second: 2, third: 3, fourth: 4 };
const n0 = (w: string) => (/^\d+$/.test(w) ? +w : W[w] ?? 1);
const TO = { t: 'triggerObj' } as const;
const TP = { t: 'triggerPlayer' } as const;

// ------------------------------------------------------------------------------------------
// Compound heads → several lines
// ------------------------------------------------------------------------------------------
const SELF_EV = '(enters|dies|attacks|blocks|becomes tapped|becomes untapped|is turned face up|leaves the battlefield|becomes blocked|is put into a graveyard from the battlefield|transforms|is dealt damage|becomes the target of a spell or ability)';
EXT.expand.push((line) => {
  const i = headEnd(line);
  if (i < 0) return null;
  const cond = line.slice(0, i);
  const eff = line.slice(i + 1).trim();
  let m: RegExpMatchArray | null;
  if ((m = cond.match(new RegExp(`^(when|whenever) ~ ${SELF_EV} or ${SELF_EV}$`)))) {
    if ((m[2] === 'attacks' && m[3] === 'blocks') || (m[2] === 'enters' && m[3] === 'attacks')) return null;
    return [`${m[1]} ~ ${m[2]}, ${eff}`, `${m[1]} ~ ${m[3]}, ${eff}`];
  }
  if ((m = cond.match(/^(when|whenever) ~ enters, attacks, or dies$/))) return [`${m[1]} ~ enters, ${eff}`, `${m[1]} ~ attacks, ${eff}`, `${m[1]} ~ dies, ${eff}`];
  if ((m = cond.match(/^(when|whenever) you cast or cycle ~$/))) return [`when you cast ~, ${eff}`, `when you cycle ~, ${eff}`];
  if ((m = cond.match(/^(when|whenever) ~ or another (.+?) (?:you control )?(enters|dies)(?: under your control)?$/))) {
    const ctrl = /you control|under your control/.test(cond) ? ' you control' : '';
    return [`${m[1]} ~ ${m[3]}, ${eff}`, `whenever another ${m[2]}${ctrl} ${m[3]}, ${eff}`];
  }
  if ((m = cond.match(/^((?:when|whenever) .+?) and ((?:when|whenever) .+|at the beginning of .+)$/)) && !/^(?:when|whenever) ~ and /.test(cond)) {
    const a = m[1];
    const b = m[2];
    return [`${a}, ${eff}`, `${b}, ${eff}`];
  }
  if ((m = cond.match(/^((?:when|whenever) .+?) and at the beginning of (.+)$/))) return [`${m[1]}, ${eff}`, `at the beginning of ${m[2]}, ${eff}`];
  return null;
});
function headEnd(line: string): number {
  if (!/^(when|whenever|at)\b/.test(line)) return -1;
  let q = 0;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') q ^= 1;
    if (line[i] === ',' && !q) return i;
  }
  return -1;
}

// ------------------------------------------------------------------------------------------
// Trigger heads
// ------------------------------------------------------------------------------------------
type H = { event: string; filter?: any; data?: any; last?: any; lastPlayer?: any; cond?: any };
const OPP = { k: 'ext', name: 'oppTurn' };
const HEADS: [RegExp, (m: RegExpMatchArray) => H[] | null][] = [
  // casting
  [/^when(?:ever)? you cast ~$/, () => [{ event: 'selfCast' }]],
  [/^when(?:ever)? you cycle ~$/, () => [{ event: 'selfCycle' }]],
  [/^when(?:ever)? you cycle or discard ~$/, () => [{ event: 'selfDiscard' }]],
  [/^whenever you cycle or discard (?:a|another) card$|^whenever you discard (?:a|one or more) cards?$/, () => [{ event: 'discard', data: { who: 'you' } }]],
  [/^whenever you cycle (?:a|another) card$/, () => [{ event: 'cycle' }]],
  [/^whenever an opponent discards (?:a|one or more) cards?$/, () => [{ event: 'discard', data: { who: 'opp' }, lastPlayer: TP }]],
  [/^whenever a player discards a card$/, () => [{ event: 'discard', data: { who: 'any' }, lastPlayer: TP }]],
  [/^whenever you cast or copy (?:a|an) (.+?) spell$/, (m) => { const f = parseFilter(m[1] + ' spell'); return f ? [{ event: 'castSpell', filter: f }] : null; }],
  [/^whenever a player casts (?:a|an) (.+?) spell$/, (m) => { const f = parseFilter(m[1] + ' spell'); return f ? [{ event: 'anyCast', filter: f, last: TO, lastPlayer: TP }] : null; }],
  [/^whenever a player casts a spell$/, () => [{ event: 'anyCast', last: TO, lastPlayer: TP }]],
  [/^whenever you cast a spell with mana value (\d+) or (greater|less)$/, (m) => [{ event: 'castSpell', filter: { types: ['spell'], zone: 'stack', ...(m[2] === 'greater' ? { cmcMin: +m[1] } : { cmcMax: +m[1] }) }, last: TO }]],
  [/^whenever you cast a legendary spell$/, () => [{ event: 'castSpell', filter: { types: ['spell'], supertypes: ['legendary'], zone: 'stack' }, last: TO }]],
  [/^whenever you cast a spell from (?:your graveyard|exile|anywhere other than your hand)$/, (m) => [{ event: 'castFrom', data: { zone: /graveyard/.test(m[0]) ? 'graveyard' : /exile/.test(m[0]) ? 'exile' : 'nothand' }, last: TO }]],
  [/^whenever you gain life for the first time each turn$/, () => [{ event: 'gainLife', cond: { k: 'ext', name: 'firstGain' } }]],
  [/^whenever you(?:'re| are) dealt damage$/, () => [{ event: 'youDealt', data: { any: true }, lastPlayer: TP }]],
  [/^whenever a creature deals damage to you$/, () => [{ event: 'youDealt', data: { any: true, creature: true }, last: TO, lastPlayer: TP }]],
  [/^whenever a player cycles a card$/, () => [{ event: 'cycle', data: { any: true }, lastPlayer: TP }]],
  [/^whenever you discard (?:a|an) (creature|land|nonland|instant|sorcery) card$/, (m) => [{ event: 'discard', data: { who: 'you', type: m[1] } }]],
  [/^whenever ~ attacks for the first time each turn$/, () => [{ event: 'selfAttacks', data: { first: true } }]],
  [/^whenever (?:equipped|enchanted) creature attacks alone$/, () => [{ event: 'attachAttacks', data: { alone: true }, last: { t: 'equipped' } }]],
  [/^whenever a creature you control becomes blocked$/, () => [{ event: 'ctrlBlocked', last: TO }]],
  [/^whenever a creature attacks$/, () => [{ event: 'anyAttacks', last: TO }]],
  [/^when(?:ever)? enchanted creature is dealt damage$/, () => [{ event: 'attachDealt', last: { t: 'enchanted' } }]],
  [/^whenever you scry or surveil$/, () => [{ event: 'scry' }, { event: 'surveil' }]],
  [/^at the beginning of your combat step$/, () => [{ event: 'beginCombat' }]],
  [/^whenever you cast your first spell each turn$/, () => [{ event: 'nthCast', data: { n: 1, who: 'you' } }]],
  [/^whenever you cast your (second|third|fourth) spell each turn$/, (m) => [{ event: 'nthCast', data: { n: n0(m[1]), who: 'you' } }]],
  [/^whenever an opponent casts their (first|second) spell each turn$/, (m) => [{ event: 'nthCast', data: { n: n0(m[1]), who: 'opp' }, lastPlayer: TP }]],
  [/^whenever you cast a spell during an opponent's turn$/, () => [{ event: 'castSpell', filter: { types: ['spell'] }, cond: OPP }]],
  [/^whenever you cast (?:a|an) (.+?) spell during an opponent's turn$/, (m) => { const f = parseFilter(m[1] + ' spell'); return f ? [{ event: 'castSpell', filter: f, cond: OPP }] : null; }],
  [/^whenever you cast your first spell during each opponent's turn$/, () => [{ event: 'nthCast', data: { n: 1, who: 'you', oppTurn: true } }]],
  [/^whenever you cast a spell that targets ~$/, () => [{ event: 'castTargets', data: { self: true } }]],
  [/^whenever you cast (?:a|an) (.+?) spell that targets (?:a|an|one or more) (.+)$/, (m) => {
    const f = parseFilter(m[1] + ' spell');
    const tf = parseFilter(m[2]);
    return f && tf ? [{ event: 'castTargets', filter: f, data: { tf } }] : null;
  }],
  [/^whenever you cast a spell that targets (?:a|an|one or more) (.+)$/, (m) => { const tf = parseFilter(m[1]); return tf ? [{ event: 'castTargets', data: { tf } }] : null; }],
  // attacking
  [/^whenever you attack$/, () => [{ event: 'youAttack' }]],
  [/^whenever you attack with (\w+) or more creatures$/, (m) => [{ event: 'youAttack', data: { min: n0(m[1]) } }]],
  [/^whenever you attack with (\w+) or more (.+?)$/, (m) => { const ph = m[2].replace(/\b(el|dwar|wol)ves\b/g, '$1f').replace(/ies$/, 'y').replace(/(?<!ss)s$/, '').replace(/s with /, ' with ').replace(/creatures? with/, 'creature with'); const f = parseFilter(ph); return f && n0(m[1]) ? [{ event: 'youAttack', data: { min: n0(m[1]), filter: f }, last: { t: 'lastToken' } }] : null; }],
  [/^whenever (\w+) or more (.+?) you control attack( a player)?$/, (m) => { const ph = m[2].replace(/\b(el|dwar|wol)ves\b/g, '$1f').replace(/ies$/, 'y').replace(/(?<!ss)s$/, '').replace(/s with /, ' with '); const f = parseFilter(ph); return f && n0(m[1]) ? [{ event: 'youAttack', data: { min: n0(m[1]), filter: f, player: !!m[3] }, last: { t: 'lastToken' } }] : null; }],
  [/^whenever (?:a|an|another) (.+?) you control attacks$/, (m) => { const f = parseFilter(m[1]); return f ? [{ event: 'ctrlAttacks', filter: f, last: TO, data: { other: /another/.test(m[0]) } }] : null; }],
  [/^whenever (?:a|an) (.+?) you control attacks alone$/, (m) => { const f = parseFilter(m[1]); return f ? [{ event: 'ctrlAttacks', filter: f, last: TO, data: { alone: true } }] : null; }],
  [/^whenever ~ attacks alone$/, () => [{ event: 'selfAttacks', data: { alone: true } }]],
  [/^whenever ~ and at least (\w+) other creatures attack$/, (m) => [{ event: 'selfAttacks', data: { min: n0(m[1]) + 1 } }]],
  [/^whenever ~ attacks (?:a player|an opponent)$/, () => [{ event: 'selfAttacks', data: { player: true } }]],
  [/^whenever (equipped|enchanted) creature attacks$/, (m) => [{ event: 'attachAttacks', last: { t: m[1] } }]],
  [/^whenever a creature attacks you(?: or a planeswalker you control)?$/, () => [{ event: 'attackedYou', last: TO }]],
  [/^whenever ~ attacks and isn't blocked$/, () => [{ event: 'unblocked' }]],
  [/^when(?:ever)? ~ attacks or blocks$/, () => [{ event: 'attacksOrBlocks' }]],
  [/^when ~ (attacks|blocks)$/, (m) => [{ event: m[1] }]],
  // blocking
  [/^whenever ~ becomes blocked by (?:a|an) (.+)$/, (m) => { const f = m[1] === 'creature' ? { types: ['creature'] } : parseFilter(m[1]); return f ? [{ event: 'blockedBy', filter: f, last: TO }] : null; }],
  [/^whenever ~ blocks (?:a|an) (.+)$/, (m) => { const f = m[1] === 'creature' ? { types: ['creature'] } : parseFilter(m[1]); return f ? [{ event: 'blocksCreature', filter: f, last: TO }] : null; }],
  [/^whenever ~ blocks or becomes blocked by (?:a|an) (.+)$/, (m) => { const f = m[1] === 'creature' ? { types: ['creature'] } : parseFilter(m[1]); return f ? [{ event: 'blockedBy', filter: f, last: TO }, { event: 'blocksCreature', filter: f, last: TO }] : null; }],
  [/^whenever ~ blocks or becomes blocked$/, () => [{ event: 'blocks' }, { event: 'blocked' }]],
  [/^whenever (?:a|an) (.+?) you control blocks$/, (m) => { const f = parseFilter(m[1]); return f ? [{ event: 'ctrlBlocks', filter: f, last: TO }] : null; }],
  // damage
  [/^whenever ~ is dealt damage$/, () => [{ event: 'selfDealt' }]],
  [/^whenever ~ deals (combat )?damage to (?:a player|an opponent|a player or planeswalker|an opponent or planeswalker|a player or battle)$/, (m) => [m[1] ? { event: 'combatDamagePlayer', lastPlayer: TP } : { event: 'dealsPlayer', lastPlayer: TP }]],
  [/^whenever ~ deals (combat )?damage to (?:a|another) creature$/, (m) => [{ event: 'dealsCreature', data: { combat: !!m[1] }, last: TO }]],
  [/^whenever ~ deals combat damage$/, () => [{ event: 'dealsCombat' }]],
  [/^whenever ~ deals noncombat damage to (?:a player|an opponent)$/, () => [{ event: 'dealsPlayer', data: { noncombat: true }, lastPlayer: TP }]],
  [/^whenever (equipped|enchanted) creature deals (combat )?damage(?: to (a player|an opponent|a creature|a player or planeswalker))?$/, (m) => [{ event: 'attachDeals', data: { combat: !!m[2], to: m[3] ? (m[3] === 'a creature' ? 'creature' : 'player') : 'any' }, last: { t: m[1] }, lastPlayer: TP }]],
  [/^whenever (?:a|an|another) (.+?) you control deals combat damage to (?:a player|an opponent|a player or battle)$/, (m) => { const f = parseFilter(m[1]); return f ? [{ event: 'ctrlCombatPlayer', filter: f, last: TO, lastPlayer: TP }] : null; }],
  [/^whenever one or more (.+?) you control deal combat damage to (?:a player|an opponent)$/, (m) => { const f = parseFilter(m[1]); return f ? [{ event: 'ctrlCombatPlayer', filter: f, data: { once: true }, lastPlayer: TP }] : null; }],
  [/^whenever a source an opponent controls deals damage to you$/, () => [{ event: 'youDealt', lastPlayer: TP }]],
  [/^whenever a creature dealt damage by ~ this turn dies$/, () => [{ event: 'damagedDies', last: TO }]],
  // leaving
  [/^when(?:ever)? (enchanted|equipped) creature dies$/, (m) => [{ event: 'attachDies', data: { kind: m[1] }, last: TO }]],
  [/^when(?:ever)? (enchanted|equipped) creature leaves the battlefield$/, (m) => [{ event: 'attachDies', data: { kind: m[1], any: true }, last: TO }]],
  [/^whenever (?:a|an|another) (.+?) is put into (?:a|your) graveyard from the battlefield$/, (m) => {
    const f = parseFilter(m[1]);
    if (!f) return null;
    return [{ event: 'toGraveyard', filter: f, data: { other: /another/.test(m[0]), you: / you control|your graveyard/.test(m[0]) }, last: TO, lastPlayer: TP }];
  }],
  [/^whenever you sacrifice (?:a|an|another|one or more) (.+?)$/, (m) => { const f = parseFilter(m[1]); return f ? [{ event: 'sacrifice', filter: f, data: { other: /another/.test(m[0]) }, last: TO }] : null; }],
  [/^whenever one or more cards leave your graveyard$/, () => [{ event: 'leaveGraveyard', data: { once: true } }]],
  [/^whenever (?:a|another) creature you control leaves the battlefield$/, () => [{ event: 'ctrlLeaves', filter: { types: ['creature'] }, last: TO, data: { other: true } }]],
  // counters / untap / misc
  [/^whenever one or more ([+-]\d\/[+-]\d|[a-z]+) counters are put on ~$/, (m) => [{ event: 'selfCounters', data: { counter: m[1] } }]],
  [/^whenever you put one or more ([+-]\d\/[+-]\d|[a-z]+) counters on (?:a|an) (.+)$/, (m) => { const f = parseFilter(m[2]); return f ? [{ event: 'youCounters', filter: f, data: { counter: m[1] }, last: TO }] : null; }],
  [/^whenever ~ becomes untapped$/, () => [{ event: 'selfUntapped' }]],
  [/^whenever you (scry|surveil)$/, (m) => [{ event: m[1] }]],
  [/^whenever (an opponent|a player) draws a card$/, (m) => [{ event: 'draws', data: { who: m[1] === 'an opponent' ? 'opp' : 'any' }, lastPlayer: TP }]],
  [/^whenever you draw your (first|second) card each turn$/, (m) => [{ event: 'nthDraw', data: { n: n0(m[1]) } }]],
  [/^whenever you commit a crime$/, () => [{ event: 'crime' }]],
  // steps
  [/^at the beginning of (?:each player's|the) end step$/, () => [{ event: 'eachEndStep' }]],
  [/^at the beginning of each opponent's end step$/, () => [{ event: 'step', data: { step: 'end', who: 'opp' }, lastPlayer: TP }]],
  [/^at the beginning of each (?:player's|opponent's) draw step$/, (m) => [{ event: 'step', data: { step: 'draw', who: /opponent/.test(m[0]) ? 'opp' : 'any' }, lastPlayer: TP }]],
  [/^at the beginning of each combat$/, () => [{ event: 'step', data: { step: 'beginCombat', who: 'any' } }]],
  [/^at the beginning of each opponent's (?:combat|beginning of combat step)$/, () => [{ event: 'step', data: { step: 'beginCombat', who: 'opp' } }]],
  [/^at (?:the )?end of combat$/, () => [{ event: 'step', data: { step: 'endCombat', who: 'any' } }]],
  [/^at end of combat on your turn$/, () => [{ event: 'step', data: { step: 'endCombat', who: 'you' } }]],
  [/^at the beginning of each (?:player's )?draw step$/, () => [{ event: 'step', data: { step: 'draw', who: 'any' } }]],
  [/^at the beginning of each opponent's draw step$/, () => [{ event: 'step', data: { step: 'draw', who: 'opp' } }]],
  [/^at the beginning of each (?:player's )?(?:precombat |first )?main phase$/, () => [{ event: 'step', data: { step: 'main1', who: 'any' } }]],
  [/^at the beginning of the upkeep of (enchanted|equipped) creature's controller$/, () => [{ event: 'step', data: { step: 'upkeep', who: 'attachedCtrl' }, lastPlayer: TP }]],
  [/^at the beginning of the upkeep of enchanted (?:land|artifact|enchantment|permanent)'s controller$/, () => [{ event: 'step', data: { step: 'upkeep', who: 'attachedCtrl' }, lastPlayer: TP }]],
  [/^at the beginning of enchanted player's upkeep$/, () => [{ event: 'step', data: { step: 'upkeep', who: 'enchantedPlayer' }, lastPlayer: TP }]],
  [/^at the beginning of (?:your|each) (?:postcombat|second) main phase$/, () => [{ event: 'step', data: { step: 'main2', who: 'you' } }]],
];
EXT.triggers.push((cond) => {
  for (const [re, fn] of HEADS) {
    const m = cond.match(re);
    if (m) return fn(m);
  }
  return null;
});

// ------------------------------------------------------------------------------------------
// Firing
// ------------------------------------------------------------------------------------------
function each(s: GameState, api: any, event: string, fn: (oid: string, t: any, ctrl: PlayerIdx) => void) {
  for (const oid of [...api.observers(s)]) {
    const o = s.cards[oid];
    if (!o) continue;
    for (const t of api.chars(s, oid).pc.triggers as any[]) if (t.event === event) fn(oid, t, o.controller);
  }
}
const pendingHas = (s: GameState, oid: string, t: any) => s.pendingTriggers.some((x) => x.source === oid && x.text === t.text);
const fmatch = (s: GameState, api: any, iid: string, f: any, ctrl: PlayerIdx, self?: string) => !f || api.matchesFilter(s, iid, { ...f, zone: s.cards[iid]?.zone }, ctrl, self);
const turnData = (s: GameState) => {
  const d = ((s as any).evTurn ??= { turn: -1 });
  if (d.turn !== s.turn) Object.assign(d, { turn: s.turn, casts: [0, 0], draws: [0, 0], dmgBy: {} });
  return d;
};

EXT.hooks.event.push((s, name, d, api) => {
  const opp = api.opp as (p: PlayerIdx) => PlayerIdx;
  switch (name) {
    case 'cast': {
      const item = d.item;
      const caster = item.controller as PlayerIdx;
      const td = turnData(s);
      td.casts[caster]++;
      const nth = td.casts[caster];
      if (s.cards[item.source]) for (const t of api.chars(s, item.source).pc.triggers as any[]) if (t.event === 'selfCast') api.queueTrigger(s, item.source, caster, t, { triggerObj: item.source });
      const stackMatch = (f: any, ctrl: PlayerIdx) => !f || (f.types?.includes('spell') && Object.keys(f).every((k) => ['types', 'zone'].includes(k))) || api.matchesFilter(s, item.source, { ...f, zone: 'stack' }, ctrl);
      each(s, api, 'anyCast', (oid, t, ctrl) => { if (stackMatch(t.filter, ctrl)) api.queueTrigger(s, oid, ctrl, t, { triggerObj: item.source, triggerPlayer: caster }); });
      each(s, api, 'nthCast', (oid, t, ctrl) => {
        const who = t.data.who === 'any' ? caster : t.data.who === 'you' ? ctrl : opp(ctrl);
        if (who !== caster) return;
        if (t.data.oppTurn) {
          if (s.active === caster) return;
          const k = ((td as any).oppTurnCasts ??= [0, 0]);
          k[caster]++;
          if (k[caster] !== t.data.n) return;
        } else if (nth !== t.data.n) return;
        api.queueTrigger(s, oid, ctrl, t, { triggerObj: item.source, triggerPlayer: caster });
      });
      each(s, api, 'castTargets', (oid, t, ctrl) => {
        if (ctrl !== caster || item.kind !== 'spell') return;
        if (t.filter && !stackMatch(t.filter, ctrl)) return;
        const tg = (item.targets ?? []).flat().filter((x: any) => x.kind === 'card').map((x: any) => x.iid);
        const ok = t.data.self ? tg.includes(oid) : tg.some((x: string) => s.cards[x] && api.matchesFilter(s, x, { ...t.data.tf, zone: s.cards[x].zone }, ctrl));
        if (ok) api.queueTrigger(s, oid, ctrl, t, { triggerObj: item.source });
      });
      const from = (s.cards[item.source] as any)?.castFrom;
      each(s, api, 'castFrom', (oid, t, ctrl) => {
        if (ctrl !== caster) return;
        const z = t.data.zone;
        if (z === 'nothand' ? from && from !== 'hand' : from === z) api.queueTrigger(s, oid, ctrl, t, { triggerObj: item.source });
      });
      return;
    }
    case 'activate': {
      if (d.a?.special !== 'cycling') return;
      const iid = d.iid;
      if (s.cards[iid]) for (const t of api.chars(s, iid).pc.triggers as any[]) if (t.event === 'selfCycle') api.queueTrigger(s, iid, d.p, t, {});
      each(s, api, 'cycle', (oid, t, ctrl) => { if (ctrl === d.p || t.data?.any) api.queueTrigger(s, oid, ctrl, t, { triggerObj: iid, triggerPlayer: d.p }); });
      return;
    }
    case 'attack': {
      const p = d.p as PlayerIdx;
      const list = d.list as { iid: string; target: any }[];
      each(s, api, 'youAttack', (oid, t, ctrl) => {
        if (ctrl !== p) return;
        const ms = list.filter((a) => (!t.data?.filter || api.matchesFilter(s, a.iid, { ...t.data.filter, zone: 'battlefield' }, ctrl, oid)) && (!t.data?.player || a.target?.kind === 'player'));
        if (ms.length >= (t.data?.min ?? 1)) api.queueTrigger(s, oid, ctrl, t, { refs: ms.map((a) => a.iid) } as any);
      });
      each(s, api, 'ctrlAttacks', (oid, t, ctrl) => {
        if (ctrl !== p) return;
        if (t.data?.alone && list.length !== 1) return;
        for (const a of list) if ((!t.data?.other || a.iid !== oid) && fmatch(s, api, a.iid, t.filter, ctrl, oid)) api.queueTrigger(s, oid, ctrl, t, { triggerObj: a.iid, triggerPlayer: opp(p) });
      });
      for (const a of list) {
        for (const t of api.chars(s, a.iid).pc.triggers as any[]) {
          if (t.event !== 'selfAttacks') continue;
          if (t.data?.alone && list.length !== 1) continue;
          if (t.data?.min && list.length < t.data.min) continue;
          if (t.data?.player && a.target?.kind !== 'player') continue;
          if (t.data?.first) { const k = `fa:${a.iid}`; const u = ((s as any).oncePerTurn ??= {}); if (u[k] === s.turn) continue; u[k] = s.turn; }
          api.queueTrigger(s, a.iid, p, t, { triggerPlayer: opp(p) });
        }
      }
      each(s, api, 'attachAttacks', (oid, t, ctrl) => {
        const host = s.cards[oid].attachedTo;
        if (t.data?.alone && list.length !== 1) return;
        if (host && list.some((a) => a.iid === host)) api.queueTrigger(s, oid, ctrl, t, { triggerObj: host, triggerPlayer: opp(p) });
      });
      each(s, api, 'anyAttacks', (oid, t, ctrl) => { for (const a of list) api.queueTrigger(s, oid, ctrl, t, { triggerObj: a.iid, triggerPlayer: p }); });
      each(s, api, 'attackedYou', (oid, t, ctrl) => {
        if (ctrl === p) return;
        for (const a of list) api.queueTrigger(s, oid, ctrl, t, { triggerObj: a.iid, triggerPlayer: p });
      });
      return;
    }
    case 'blocks': {
      const list = d.list as { blocker: string; attacker: string }[];
      for (const b of list) {
        const bc = s.cards[b.blocker];
        const ac = s.cards[b.attacker];
        if (!bc || !ac) continue;
        for (const t of api.chars(s, b.attacker).pc.triggers as any[]) if (t.event === 'blockedBy' && fmatch(s, api, b.blocker, t.filter, ac.controller)) api.queueTrigger(s, b.attacker, ac.controller, t, { triggerObj: b.blocker });
        for (const t of api.chars(s, b.blocker).pc.triggers as any[]) if (t.event === 'blocksCreature' && fmatch(s, api, b.attacker, t.filter, bc.controller)) api.queueTrigger(s, b.blocker, bc.controller, t, { triggerObj: b.attacker });
      }
      each(s, api, 'ctrlBlocked', (oid, t, ctrl) => {
        for (const a of s.combat?.attackers ?? []) if (a.blocked && s.cards[a.iid]?.controller === ctrl) api.queueTrigger(s, oid, ctrl, t, { triggerObj: a.iid });
      });
      each(s, api, 'ctrlBlocks', (oid, t, ctrl) => {
        const seen = new Set<string>();
        for (const b of list) if (!seen.has(b.blocker) && s.cards[b.blocker]?.controller === ctrl && fmatch(s, api, b.blocker, t.filter, ctrl, oid)) { seen.add(b.blocker); api.queueTrigger(s, oid, ctrl, t, { triggerObj: b.blocker }); }
      });
      for (const a of s.combat?.attackers ?? []) {
        if (a.blocked || !s.cards[a.iid]) continue;
        for (const t of api.chars(s, a.iid).pc.triggers as any[]) if (t.event === 'unblocked') api.queueTrigger(s, a.iid, s.cards[a.iid].controller, t, { triggerPlayer: opp(s.cards[a.iid].controller) });
      }
      return;
    }
    case 'dealt': {
      const src = d.source as string;
      const to = d.to;
      const sc = s.cards[src];
      const sctrl = sc?.controller as PlayerIdx;
      if (to.kind === 'card' && s.cards[to.iid]) {
        const tc = s.cards[to.iid];
        if (tc.zone === 'battlefield') for (const t of api.chars(s, to.iid).pc.triggers as any[]) if (t.event === 'selfDealt') api.queueTrigger(s, to.iid, tc.controller, t, { amount: d.n, triggerObj: src });
        each(s, api, 'attachDealt', (oid, t, ctrl) => { if (s.cards[oid].attachedTo === to.iid) api.queueTrigger(s, oid, ctrl, t, { amount: d.n, triggerObj: to.iid, triggerPlayer: tc.controller }); });
        if (sc) {
          const td = turnData(s);
          ((td.dmgBy[to.iid] ??= []) as string[]).push(src);
          if (sc.zone === 'battlefield' && api.chars(s, to.iid).types.has('creature'))
            for (const t of api.chars(s, src).pc.triggers as any[]) if (t.event === 'dealsCreature' && (!t.data?.combat || d.combat)) api.queueTrigger(s, src, sctrl, t, { amount: d.n, triggerObj: to.iid });
        }
      }
      if (!sc) return;
      if (to.kind === 'player' && sc.zone === 'battlefield') {
        for (const t of api.chars(s, src).pc.triggers as any[]) if (t.event === 'dealsPlayer' && to.idx !== sctrl && (!t.data?.noncombat || !d.combat)) api.queueTrigger(s, src, sctrl, t, { amount: d.n, triggerPlayer: to.idx });
        each(s, api, 'youDealt', (oid, t, ctrl) => {
          if (to.idx !== ctrl || (!t.data?.any && sctrl === ctrl)) return;
          if (t.data?.creature && !(sc.zone === 'battlefield' && api.chars(s, src).types.has('creature'))) return;
          api.queueTrigger(s, oid, ctrl, t, { amount: d.n, triggerObj: src, triggerPlayer: sctrl });
        });
      }
      if (d.combat && sc.zone === 'battlefield') for (const t of api.chars(s, src).pc.triggers as any[]) if (t.event === 'dealsCombat' && !pendingHas(s, src, t)) api.queueTrigger(s, src, sctrl, t, { amount: d.n,});
      if (d.combat && to.kind === 'player' && sc.zone === 'battlefield') {
        each(s, api, 'ctrlCombatPlayer', (oid, t, ctrl) => {
          if (ctrl !== sctrl || to.idx === ctrl || !fmatch(s, api, src, t.filter, ctrl, oid)) return;
          if (t.data?.once && pendingHas(s, oid, t)) return;
          api.queueTrigger(s, oid, ctrl, t, { amount: d.n, triggerObj: src, triggerPlayer: to.idx });
        });
      }
      // equipped / enchanted creature deals damage
      each(s, api, 'attachDeals', (oid, t, ctrl) => {
        if (s.cards[oid].attachedTo !== src) return;
        if (t.data.combat && !d.combat) return;
        if (t.data.to === 'player' && to.kind !== 'player') return;
        if (t.data.to === 'creature' && !(to.kind === 'card' && s.cards[to.iid] && api.chars(s, to.iid).types.has('creature'))) return;
        api.queueTrigger(s, oid, ctrl, t, { amount: d.n, triggerObj: src, triggerPlayer: to.kind === 'player' ? to.idx : undefined });
      });
      return;
    }
    case 'leave': {
      const iid = d.iid as string;
      const toGy = d.to === 'graveyard';
      if (toGy && d.wasCreature) {
        for (const a of d.attached as string[]) {
          const ac = s.cards[a];
          if (!ac) continue;
          for (const t of api.chars(s, a).pc.triggers as any[]) if (t.event === 'attachDies') api.queueTrigger(s, a, ac.controller, t, { triggerObj: iid });
        }
        const by: string[] = turnData(s).dmgBy[iid] ?? [];
        for (const src of new Set(by)) {
          if (s.cards[src]?.zone !== 'battlefield') continue;
          for (const t of api.chars(s, src).pc.triggers as any[]) if (t.event === 'damagedDies') api.queueTrigger(s, src, s.cards[src].controller, t, { triggerObj: iid });
        }
      } else {
        for (const a of d.attached as string[]) {
          const ac = s.cards[a];
          if (!ac) continue;
          for (const t of api.chars(s, a).pc.triggers as any[]) if (t.event === 'attachDies' && t.data?.any) api.queueTrigger(s, a, ac.controller, t, { triggerObj: iid });
        }
      }
      const lkiCheck = (f: any, ctrl: PlayerIdx) => {
        if (!f) return true;
        const ch = d.lki ? { types: new Set<string>(), subtypes: new Set<string>() } : null;
        void ch;
        const types: string[] = f.types ?? [];
        const tl = (s.defs[d.card.defId]?.typeLine ?? '').toLowerCase().split(' // ')[0];
        if (types.length && !types.some((x) => x === 'permanent' || x === 'card' || tl.includes(x) || (x === 'creature' && d.wasCreature))) return false;
        if (f.subtypes?.length && !f.subtypes.some((x: string) => tl.includes(x))) return false;
        if (f.notTypes?.some((x: string) => tl.includes(x))) return false;
        if (f.token && !d.card.token) return false;
        if (f.nontoken && d.card.token) return false;
        if (f.controller === 'opp' && d.controller === ctrl) return false;
        if (f.controller === 'you' && d.controller !== ctrl) return false;
        return true;
      };
      if (toGy) each(s, api, 'toGraveyard', (oid, t, ctrl) => {
        if (t.data?.other && oid === iid) return;
        if (t.data?.you && d.controller !== ctrl) return;
        if (lkiCheck(t.filter, ctrl)) api.queueTrigger(s, oid, ctrl, t, { triggerObj: iid, triggerPlayer: d.controller });
      });
      if (d.opts?.cause === 'sacrifice') each(s, api, 'sacrifice', (oid, t, ctrl) => {
        if (d.controller !== ctrl || (t.data?.other && oid === iid)) return;
        if (lkiCheck(t.filter, ctrl)) api.queueTrigger(s, oid, ctrl, t, { triggerObj: iid });
      });
      each(s, api, 'ctrlLeaves', (oid, t, ctrl) => {
        if (d.controller !== ctrl || oid === iid) return;
        if (lkiCheck(t.filter, ctrl)) api.queueTrigger(s, oid, ctrl, t, { triggerObj: iid });
      });
      return;
    }
    case 'counters': {
      const c = s.cards[d.iid];
      if (!c || c.zone !== 'battlefield') return;
      for (const t of api.chars(s, d.iid).pc.triggers as any[]) if (t.event === 'selfCounters' && t.data.counter === d.counter) api.queueTrigger(s, d.iid, c.controller, t, { amount: d.n });
      each(s, api, 'youCounters', (oid, t, ctrl) => {
        if (t.data.counter !== d.counter || !fmatch(s, api, d.iid, t.filter, ctrl, oid)) return;
        // only counters you put: approximate with "the permanent's controller is you" or it's your own effect resolving
        const top = s.stack[s.stack.length - 1];
        if ((top ? top.controller : c.controller) !== ctrl) return;
        api.queueTrigger(s, oid, ctrl, t, { triggerObj: d.iid, amount: d.n });
      });
      return;
    }
    case 'untapped': {
      const c = s.cards[d.iid];
      if (!c) return;
      for (const t of api.chars(s, d.iid).pc.triggers as any[]) if (t.event === 'selfUntapped') api.queueTrigger(s, d.iid, c.controller, t, {});
      return;
    }
    case 'scry':
    case 'surveil':
      each(s, api, name, (oid, t, ctrl) => { if (ctrl === d.p) api.queueTrigger(s, oid, ctrl, t, {}); });
      return;
    case 'draw': {
      const td = turnData(s);
      td.draws[d.p]++;
      each(s, api, 'draws', (oid, t, ctrl) => { if (t.data.who === 'any' || d.p !== ctrl) api.queueTrigger(s, oid, ctrl, t, { triggerPlayer: d.p }); });
      each(s, api, 'nthDraw', (oid, t, ctrl) => { if (d.p === ctrl && td.draws[d.p] === t.data.n) api.queueTrigger(s, oid, ctrl, t, {}); });
      return;
    }
  }
});

// discards (the core moves discarded cards with cause 'discard')
EXT.hooks.afterMove.push((s, iid, from, to, opts, api) => {
  const c = s.cards[iid];
  if (!c) return;
  if (from === 'hand' && to === 'graveyard' && opts?.cause === 'discard') {
    const who = c.owner as PlayerIdx;
    for (const t of api.chars(s, iid).pc.triggers as any[]) if (t.event === 'selfDiscard') api.queueTrigger(s, iid, who, t, {});
    each(s, api, 'discard', (oid, t, ctrl) => {
      const w = t.data.who;
      if (t.data.type) {
        const tl = s.defs[c.defId].typeLine.toLowerCase();
        if (t.data.type === 'nonland' ? /\bland\b/.test(tl) : !tl.includes(t.data.type)) return;
      }
      if ((w === 'you' && who === ctrl) || (w === 'opp' && who !== ctrl) || w === 'any') api.queueTrigger(s, oid, ctrl, t, { triggerObj: iid, triggerPlayer: who });
    });
  }
  if (from === 'graveyard') {
    each(s, api, 'leaveGraveyard', (oid, t, ctrl) => { if (c.owner === ctrl && !pendingHas(s, oid, t)) api.queueTrigger(s, oid, ctrl, t, {}); });
  }
});

// steps
EXT.hooks.step.push((s, step, api) => {
  each(s, api, 'step', (oid, t, ctrl) => {
    const d = t.data;
    if (d.step !== step) return;
    if (d.who === 'you' && s.active !== ctrl) return;
    if (d.who === 'opp' && s.active === ctrl) return;
    if (d.who === 'attachedCtrl') {
      const h = s.cards[oid].attachedTo;
      if (!h || s.cards[h]?.controller !== s.active) return;
    }
    if (d.who === 'enchantedPlayer' && (s.cards[oid] as any).attachedPlayer !== s.active) return;
    api.queueTrigger(s, oid, ctrl, t, { triggerPlayer: s.active });
  });
});

// "whenever you commit a crime": you target an opponent, their permanents or spells, or cards in their graveyard
EXT.hooks.pushed.push((s, item, api) => {
  const p = item.controller;
  const o = api.opp(p);
  const crime = item.targets.flat().some((t: any) => (t.kind === 'player' && t.idx === o) || (t.kind === 'card' && s.cards[t.iid] && (s.cards[t.iid].zone === 'battlefield' ? s.cards[t.iid].controller === o : s.cards[t.iid].owner === o)) || (t.kind === 'stack' && s.stack.find((x) => x.id === t.id)?.controller === o));
  if (!crime) return;
  each(s, api, 'crime', (oid, t, ctrl) => { if (ctrl === p && !pendingHas(s, oid, t)) api.queueTrigger(s, oid, ctrl, t, {}); });
});

// "whenever you cast a spell during an opponent's turn": gate the core castSpell trigger
EXT.condEval.oppTurn = (s, _c, you) => s.active !== you;

// "whenever you gain life for the first time each turn"
const gains = (s: any) => { const k = (s.firstGain ??= { turn: -1 }); if (k.turn !== s.turn) { k.turn = s.turn; k[0] = 0; k[1] = 0; } return k; };
EXT.hooks.lifeGain.push((s, p, n) => { if (n > 0) gains(s)[p]++; return n; });
EXT.condEval.firstGain = (s, _c, you) => gains(s)[you] === 1;
