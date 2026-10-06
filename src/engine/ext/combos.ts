// Plugin: the cards that make combos work.
//  - Trigger doublers: Panharmonicon, Yarok, Elesh Norn (entering), Teysa Karlov (dying), Isshin (attacking).
//  - Trigger stoppers: Torpor Orb, Hushbringer, Elesh Norn's second line.
//    (The engine scopes a "cause" around ETB / death / attack trigger queuing; see queueTrigger.)
//  - Life-loss triggers: "whenever an opponent loses life" (Exquisite Blood, Bloodthirsty Conqueror).
//  - "That much": loses/gains that much life, using the triggering event's amount (Sanguine Bond, Vito).
import { EXT } from '../ext';
import { parsePlayerSubject, parseSentence } from '../oracle';
import type { PlayerIdx } from '../types';

const ENTER_TYPES: Record<string, string[]> = {
  'artifact or creature': ['artifact', 'creature'],
  permanent: ['permanent'],
  creature: ['creature'],
  artifact: ['artifact'],
  land: ['land'],
  'nontoken creature': ['creature'],
};
EXT.lines.push((line, pc) => {
  let m: RegExpMatchArray | null;
  if ((m = line.match(/^if (?:a|an) (artifact or creature|permanent|creature|artifact|land|nontoken creature) entering(?: the battlefield)? causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time$/))) {
    pc.replacements.push({ k: 'trigDouble', cause: 'enter', types: ENTER_TYPES[m[1]] });
    return true;
  }
  if (/^if a creature dying causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time$/.test(line)) {
    pc.replacements.push({ k: 'trigDouble', cause: 'die', types: ['creature'] });
    return true;
  }
  if (/^if a creature attacking causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time$/.test(line)) {
    pc.replacements.push({ k: 'trigDouble', cause: 'attack', types: ['creature'] });
    return true;
  }
  if ((m = line.match(/^(creatures|permanents) entering(?: the battlefield)?( or dying)? (?:don't|do not) cause abilities( of permanents your opponents control)? to trigger$/))) {
    pc.replacements.push({ k: 'trigStop', causes: m[2] ? ['enter', 'die'] : ['enter'], types: m[1] === 'creatures' ? ['creature'] : undefined, oppOnly: !!m[3] });
    return true;
  }
  return false;
});

// ---- life-loss trigger heads ----
const TP = { t: 'triggerPlayer' } as const;
EXT.triggers.push((cond) => {
  let m: RegExpMatchArray | null;
  if ((m = cond.match(/^whenever (an opponent|a player|you|each opponent) loses? life( during your turn)?$/))) {
    const who = m[1] === 'you' ? 'you' : m[1] === 'a player' ? 'any' : 'opp';
    return [{ event: 'loseLifeEv', data: { who, yourTurn: !!m[2] }, lastPlayer: TP }];
  }
  if (/^whenever an opponent loses life for the first time each turn$|^whenever an opponent loses life for the first time during each of your turns$/.test(cond)) {
    return [{ event: 'loseLifeEv', data: { who: 'opp', first: true, yourTurn: /your turns/.test(cond) }, lastPlayer: TP }];
  }
  return null;
});

EXT.hooks.event.push((s, name, d, api) => {
  if (name !== 'lifeLost') return;
  const p = d.p as PlayerIdx;
  const firsts = ((s as any).lifeLostFirst ??= {});
  if (firsts.turn !== s.turn) { firsts.turn = s.turn; firsts.seen = [false, false]; }
  const first = !firsts.seen[p];
  firsts.seen[p] = true;
  for (const oid of [...s.battlefield]) {
    const o = s.cards[oid];
    if (!o) continue;
    for (const t of api.chars(s, oid).pc.triggers as any[]) {
      if (t.event !== 'loseLifeEv') continue;
      const dd = t.data;
      if (dd.who === 'you' ? p !== o.controller : dd.who === 'opp' ? p === o.controller : false) continue;
      if (dd.yourTurn && s.active !== o.controller) continue;
      if (dd.first && !first) continue;
      api.queueTrigger(s, oid, o.controller, t, { triggerPlayer: p, amount: d.n });
    }
  }
});

// ---- "that much" ----
EXT.rules.push([/^(target opponent|target player|each opponent|each player|that player|you) loses? that much life$/, (m, ctx) => {
  const who = m[1] === 'you' ? { t: 'you' } : m[1] === 'that player' ? TP : parsePlayerSubject(m[1], ctx);
  return who ? [{ k: 'lose', n: { trigAmount: true }, who }] : null;
}]);
EXT.rules.push([/^(?:(you|target player) )?gains? that much life$/, (m, ctx) => {
  const who = !m[1] || m[1] === 'you' ? { t: 'you' } : parsePlayerSubject(m[1], ctx);
  return who ? [{ k: 'ext', name: 'gainThatMuch', who }] : null;
}]);
EXT.effects.gainThatMuch = ({ s, item, e, you, api }) => {
  // a trigger knows its event's amount; otherwise fall back to the last damage dealt ("deals 3 damage … you gain that much life")
  const n = (item as any).evAmount ?? (s as any).lastDealt ?? 0;
  const ps: PlayerIdx[] = e.who.t === 'you' ? [you] : api.subjPlayers(s, item, e.who);
  for (const p of ps) if (n > 0) api.gainLife(s, p, n);
  return 'done';
};
// The older "you gain that much life" rule (library.ts) only knew about damage; prefer the trigger's own amount.
const gainLastBase = EXT.effects.gainLast;
EXT.effects.gainLast = (c) => {
  const n = (c.item as any).evAmount;
  if (n === undefined) return gainLastBase(c);
  if (n > 0) c.api.gainLife(c.s, c.you, n);
  return 'done';
};

// "It deals that much damage to any target / target opponent / each other opponent." (Boros Reckoner, Brash Taunter)
// — the amount is the triggering event's (damage dealt to it, or by it).
EXT.rules.push([/^(it|~) deals that much damage to (.+)$/, (m, ctx) => {
  const base = parseSentence(`${m[1]} deals 1 damage to ${m[2]}`, ctx);
  const dmg = base?.find((e: any) => e.k === 'damage') as any;
  if (!base || !dmg) return null;
  dmg.n = { trigAmount: true };
  return base;
}]);
