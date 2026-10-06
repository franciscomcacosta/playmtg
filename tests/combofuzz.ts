// "Thinking" fuzzer: AI vs AI games with synergy decks built around themes (tokens, sacrifice, counters,
// spells, lifegain, landfall, ETB, graveyard…), so cards trigger off each other all game long.
// After every action it checks engine invariants. Usage: npx tsx tests/combofuzz.ts [seed] [games]
import { readFileSync } from 'node:fs';
import { createGame, startGame, dispatch, viewFor } from '../src/engine/engine';
import { aiDecide, aiActionFailed, aiNeedsToAct } from '../src/engine/ai';
import { cardAutomation } from '../src/engine/oracle';
import type { GameState, PlayerIdx } from '../src/engine/types';

const db = JSON.parse(readFileSync('data/cards.json', 'utf8'));
let seed = +(process.argv[2] ?? 1);
const games = +(process.argv[3] ?? 30);
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];

const THEMES: Record<string, RegExp> = {
  tokens: /create[^.]*token|whenever (?:a|another|one or more) (?:creature|token)s? (?:you control )?enters|populate/i,
  sacrifice: /sacrifice (?:a|another) creature|whenever (?:a|another) creature (?:you control )?dies|whenever you sacrifice/i,
  counters: /\+1\/\+1 counter|proliferate/i,
  spells: /instant or sorcery|noncreature spell|prowess|whenever you cast/i,
  lifegain: /gain \d+ life|whenever you gain life|lifelink/i,
  landfall: /landfall|whenever a land (?:you control )?enters|search your library for a basic land/i,
  etb: /when (?:this creature|~|[^,]+) enters|flicker|exile (?:another )?target (?:creature|permanent) you control, then return/i,
  graveyard: /from your graveyard|mill|surveil|dredge|flashback/i,
  artifacts: /artifact (?:you control )?enters|treasure|affinity for artifacts/i,
  combat: /whenever [^,]+ attacks|double strike|first strike|menace/i,
};
const pool = db.cards.filter((c: any) => c.legal?.includes('vintage') && !/\bLand\b/.test(c.typeLine) && c.layout !== 'meld' && !/Conspiracy|Attraction|Contraption|Sticker/.test(c.typeLine));
const auto = new Map<string, string>();
const autoOf = (c: any) => { let a = auto.get(c.id); if (!a) { a = cardAutomation(c); auto.set(c.id, a); } return a; };
const basics: Record<string, any> = Object.fromEntries(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'].map((n, i) => ['WUBRG'[i], db.cards.find((c: any) => c.name === n)]));

function deck(): { cards: any[]; themes: string[] } {
  const themes = [pick(Object.keys(THEMES)), pick(Object.keys(THEMES))];
  const colors = [pick(['W', 'U', 'B', 'R', 'G']), pick(['W', 'U', 'B', 'R', 'G'])];
  const fits = pool.filter((c: any) => (c.colorIdentity ?? []).every((x: string) => colors.includes(x)) && autoOf(c) !== 'manual');
  const themed = fits.filter((c: any) => themes.some((t) => THEMES[t].test(c.oracle ?? '')));
  const out: any[] = [];
  for (let i = 0; i < 30 && themed.length; i++) out.push(pick(themed));
  for (let i = 0; i < 6 && fits.length; i++) out.push(pick(fits));
  for (let i = 0; i < 24; i++) out.push(basics[colors[i % 2]]);
  return { cards: out, themes };
}

// ------------------------------------------------------------------------------------------
// invariants
// ------------------------------------------------------------------------------------------
function invariants(s: GameState): string | null {
  const seen = new Map<string, string>();
  const note = (iid: string, where: string) => { if (seen.has(iid)) return `${iid} is in ${seen.get(iid)} and ${where}`; seen.set(iid, where); return null; };
  for (const b of s.battlefield) {
    const c = s.cards[b];
    if (!c) return `battlefield lists missing card ${b}`;
    if (c.zone !== 'battlefield') return `${b} listed on battlefield but zone=${c.zone}`;
    const e = note(b, 'battlefield'); if (e) return e;
    for (const [k, v] of Object.entries(c.counters)) if (!(Number.isFinite(v) && v >= 0)) return `${b} has bad counter ${k}=${v}`;
    if (c.attachedTo && !s.cards[c.attachedTo]) return `${b} attached to missing ${c.attachedTo}`;
  }
  for (const p of s.players) {
    if (!Number.isFinite(p.life)) return `player ${p.idx} life is ${p.life}`;
    for (const z of ['hand', 'graveyard', 'exile', 'library'] as const) {
      for (const iid of (p as any)[z] as string[]) {
        const c = s.cards[iid];
        if (!c) return `${z} of ${p.idx} lists missing ${iid}`;
        if (c.zone !== z) return `${iid} listed in ${z} but zone=${c.zone}`;
        if (c.owner !== p.idx) return `${iid} in ${p.idx}'s ${z} but owned by ${c.owner}`;
        const e = note(iid, `${p.idx}:${z}`); if (e) return e;
      }
    }
  }
  for (const [iid, c] of Object.entries(s.cards)) {
    if (c.zone === 'stack' && !s.stack.some((x) => x.source === iid) && s.pendingCast?.iid !== iid && s.resolving?.item?.source !== iid) return `${iid} is on the stack with no stack item`;
    if (['hand', 'graveyard', 'exile', 'library', 'battlefield'].includes(c.zone) && !seen.has(iid) && !(c as any).prepCopy) return `${iid} (${s.defs[c.defId]?.name}) has zone ${c.zone} but is in no zone list`;
  }
  return null;
}

let crashes = 0, broken = 0, stuck = 0, turns = 0, triggers = 0, manual = 0;
const t0 = Date.now();
for (let g = 0; g < games; g++) {
  const A = deck(), B = deck();
  const s = createGame('cf' + g, [{ name: 'A ' + A.themes.join('+'), cards: A.cards }, { name: 'B ' + B.themes.join('+'), cards: B.cards }], g + seed);
  let steps = 0;
  let lastSeq = 0;
  try {
    startGame(s);
    while (!s.over && s.turn < 30 && steps++ < 6000) {
      const p = ([0, 1] as PlayerIdx[]).find((i) => aiNeedsToAct(s, i));
      if (p == null) break;
      // a little randomness so the bots don't always take the same line
      let act: any = aiDecide(s, p);
      if (!act) break;
      if (!s.prompt && rnd() < 0.05) act = { type: 'pass' };
      const err = dispatch(s, p, act);
      if (err) {
        aiActionFailed(s, act);
        if (act.type === 'answer' && s.prompt) {
          const e2 = s.prompt.canCancel ? dispatch(s, p, { type: 'cancel', promptId: s.prompt.id }) : 'x';
          if (e2) { stuck++; console.log(`game ${g}: answer rejected (${s.prompt?.title}): ${err}`); break; }
        }
      }
      const bad = invariants(s);
      if (bad) { broken++; console.log(`game ${g} turn ${s.turn}: INVARIANT ${bad}`); console.log('   last log:', s.log.slice(-3).map((l) => l.text).join(' / ')); break; }
      if (steps % 60 === 0) viewFor(s, 0);
      if (s.manualNotice && s.manualNotice !== (s as any)._lastManual) { manual++; (s as any)._lastManual = s.manualNotice; }
    }
    const ev = ((s as any).events ?? []) as any[];
    for (const e of ev) if (e.seq > lastSeq && e.k === 'stack') triggers++;
    triggers += s.log.filter((l) => /puts a trigger on the stack/.test(l.text)).length;
    if (!s.over && s.turn < 30 && steps < 6000) { stuck++; console.log(`game ${g}: nobody to act at ${s.step} (${s.prompt?.title ?? 'no prompt'})`); }
    turns += s.turn;
  } catch (e: any) {
    crashes++;
    console.log(`CRASH game ${g} (${A.themes} vs ${B.themes}):`, e.stack?.split('\n').slice(0, 4).join(' | '));
    console.log('   last log:', s.log.slice(-4).map((l) => l.text).join(' / '));
  }
}
console.log({ games, crashes, invariantBreaks: broken, stuck, avgTurns: +(turns / games).toFixed(1), triggerLogLines: triggers, manualNotices: manual, seconds: (Date.now() - t0) / 1000 });
