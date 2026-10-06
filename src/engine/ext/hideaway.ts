// Plugin: hideaway (702.75) and "play the exiled card without paying its mana cost".
//  - "Hideaway N": when this permanent enters, look at the top N cards of your library, exile one of them face down,
//    then put the rest on the bottom of your library in a random order.
//  - "You may play/cast the exiled card without paying its mana cost (if <condition>)."
import { EXT } from '../ext';
import { parseCond } from '../oracle';
import { chars } from '../rules';

EXT.lines.push((line, pc) => {
  const m = line.match(/^hideaway (\d+)(?:, hideaway \d+)?$/);
  if (!m) return false;
  pc.triggers.push({ event: 'etb', text: line, ability: { text: line, effects: [{ k: 'ext', name: 'hideaway', n: +m[1] }], specs: [], manual: [] } });
  return true;
});
EXT.effects.hideaway = ({ s, item, e, r, you, api }) => {
  const lib: string[] = api.P(s, you).library;
  if (!r.sub) {
    const top = lib.slice(0, e.n);
    if (!top.length) return 'done';
    r.sub = { top };
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'chooseCards', title: `Hideaway: exile one face down`, cards: top, min: 1, max: 1, data: { ctx: 'resolve' } });
    (s.prompt as any).looked = top;
    return 'wait';
  }
  const pick = (r.sub.answer ?? [])[0] ?? r.sub.top[0];
  const src = s.cards[item.source] as any;
  if (pick && s.cards[pick]?.zone === 'library') {
    (s.cards[pick] as any).faceDown = true;
    api.moveCard(s, pick, 'exile');
    (s.cards[pick] as any).faceDown = true;
    if (src) (src.remembered ??= []).push(pick);
  }
  const rest = (r.sub.top as string[]).filter((c) => c !== pick && s.cards[c]?.zone === 'library');
  api.shuffleArr(s, rest);
  for (const c of rest) api.moveCard(s, c, 'libraryBottom');
  api.log(s, `${api.pname(s, you)} hides a card away with ${api.nm(s, item.source)}.`, you);
  return 'done';
};

EXT.rules.push([/^(?:until end of turn, )?(?:you may )?(play|cast) the exiled card without paying its mana cost(?: if (.+))?$/, (m) => {
  let cond: any;
  if (m[2]) { cond = parseCond(m[2]); if (!cond) return null; }
  return [{ k: 'ext', name: 'playLinkedFree', play: m[1] === 'play', cond }];
}]);
EXT.effects.playLinkedFree = ({ s, item, e, you, api }) => {
  const ex: string[] = api.subjCards(s, item, { t: 'linkedExiled' });
  const c = ex[ex.length - 1];
  if (!c) return 'done';
  if (e.cond && !api.evalCond(s, e.cond, you, item.source, {})) { api.log(s, `${api.nm(s, item.source)}: the condition isn't met.`, you); return 'done'; }
  const isLand = /\bLand\b/.test(s.defs[s.cards[c].defId].typeLine.split(' // ')[0]);
  if (isLand && !e.play) return 'done';
  // (the "you may" around this effect has already asked)
  if (s.cards[c]?.zone !== 'exile') return 'done';
  (s.cards[c] as any).faceDown = false;
  if (isLand) {
    // playing a land this way uses up a land play (305.2)
    const pl = api.P(s, you) as any;
    if ((pl.landsPlayed ?? 0) >= (pl.landsAllowed ?? 1)) { api.log(s, `${api.pname(s, you)} has no land play left.`, you, 'warn'); return 'done'; }
    pl.landsPlayed = (pl.landsPlayed ?? 0) + 1;
    api.moveCard(s, c, 'battlefield', { controller: you });
    return 'done';
  }
  const err = api.beginCast(s, you, c, 0, 'free');
  if (err) api.log(s, `Couldn't cast ${api.nm(s, c)}: ${err}`, you, 'warn');
  return 'done';
};

// ---- conditions the hideaway lands use ----
const NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twenty: 20 };
const n = (w: string) => (/^\d+$/.test(w) ? +w : NUM[w]);
EXT.conds.push((text) => {
  let m: RegExpMatchArray | null;
  if ((m = text.match(/^you attacked with (\w+) or more creatures this turn$/))) return { k: 'ext', name: 'attackedWithN', n: n(m[1]) };
  if ((m = text.match(/^creatures you control have total power (\w+) or greater$/))) return { k: 'ext', name: 'totalPower', n: n(m[1]) };
  if ((m = text.match(/^a library has (\w+) or fewer cards in it$/))) return { k: 'ext', name: 'smallLibrary', n: n(m[1]) };
  if ((m = text.match(/^an opponent was dealt (\w+) or more damage this turn$/))) return { k: 'ext', name: 'oppDealtN', n: n(m[1]) };
  if (text === 'each player has no cards in hand') return { k: 'ext', name: 'allHandsEmpty' };
  return null;
});
EXT.condEval.attackedWithN = (s, c, you) => { const a = (s as any).attackDeclared; return !!a && a.turn === s.turn && s.active === you && a.ids.length >= c.n; };
EXT.condEval.totalPower = (s, c, you) => s.battlefield.filter((b) => s.cards[b].controller === you).reduce((t, b) => { const ch = chars(s, b); return t + (ch.types.has('creature') ? Math.max(0, ch.power) : 0); }, 0) >= c.n;
EXT.condEval.smallLibrary = (s, c) => s.players.some((p) => p.library.length <= c.n);
EXT.condEval.oppDealtN = (s, c, you) => { const d = (s as any).dmgTurn; return !!d && d.turn === s.turn && (d.to[1 - you] ?? 0) >= c.n; };
EXT.condEval.allHandsEmpty = (s) => s.players.every((p) => !p.hand.length);
EXT.hooks.event.push((s, name, d) => {
  if (name !== 'dealt' || d.to?.kind !== 'player') return;
  const t = ((s as any).dmgTurn ??= { turn: -1, to: {} });
  if (t.turn !== s.turn) { t.turn = s.turn; t.to = {}; }
  t.to[d.to.idx] = (t.to[d.to.idx] ?? 0) + d.n;
});

// "Put the exiled card into its owner's hand." (Watcher for Tomorrow)
EXT.rules.push([/^(?:return|put) the exiled card(?:s)? (?:in)?to (?:its|their) owner's hand$/, () => [{ k: 'ext', name: 'linkedToHand' }]]);
EXT.effects.linkedToHand = ({ s, item, api }) => {
  for (const c of api.subjCards(s, item, { t: 'linkedExiled' })) { (s.cards[c] as any).faceDown = false; api.moveCard(s, c, 'hand'); }
  return 'done';
};
