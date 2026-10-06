// Plugin: famous reveal-the-top cards.
//  - Fact or Fiction family: "Reveal the top N cards of your library. An opponent separates those cards into two piles.
//    Put one pile into your hand and the other into your graveyard / on the bottom of your library."
//    Steam Augury family: "Reveal the top N … and separate them into two piles. An opponent chooses one of those piles.
//    Put that pile into your hand and the other into your graveyard."
//  - Atraxa: "For each card type, you may put a card of that type from among the revealed cards into your hand.
//    Put the rest on the bottom of your library in a random order."
//  - Genesis Wave: "You may put any number of permanent cards with mana value X or less from among them onto the
//    battlefield. Then put all cards revealed this way that weren't put onto the battlefield into your graveyard."
//  - Counterbalance: "you may reveal the top card of your library. If you do, counter that spell if it has the same mana
//    value as the revealed card."
import { EXT } from '../ext';
import { parseAmtPhrase } from '../oracle';

const W: Record<string, number> = { three: 3, four: 4, five: 5, six: 6, seven: 7, ten: 10 };
const amtOf = (w: string, ctx: any) => (W[w] ?? (/^\d+$/.test(w) ? +w : w === 'x' ? 'X' : w === 'x plus one' ? { x: 1, add: 1 } : null));

EXT.seqs.unshift((sents, i, ctx, ab) => {
  let m = sents[i].match(/^reveal the top (\w+|x plus one) cards of your library( and separate them into two piles)?(?:, where x is (.+))?$/);
  if (!m) return null;
  let n: any = amtOf(m[1], ctx);
  if (m[3]) { const a = parseAmtPhrase(m[3], ctx); if (a == null) return null; n = a; }
  if (n == null) return null;
  if (m[1] === 'x plus one') n = 'X+1';
  const s1 = sents[i + 1] ?? '', s2 = sents[i + 2] ?? '';
  const restDest = (t: string) => (/into your graveyard$/.test(t) ? 'graveyard' : /on the bottom of your library(?: in any order)?$/.test(t) ? 'bottom' : null);
  if (!m[2] && /^an opponent separates those cards into two piles$/.test(s1)) {
    const k = s2.match(/^put one pile into your hand and the other (.+)$/);
    const d = k && restDest(k[1]);
    if (!d) return null;
    ab.effects.push({ k: 'ext', name: 'piles', n, split: 'opp', rest: d });
    return 2;
  }
  if (m[2] && /^an opponent chooses one of those piles$/.test(s1)) {
    const k = s2.match(/^put that pile into your hand and the other (.+)$/);
    const d = k && restDest(k[1]);
    if (!d) return null;
    ab.effects.push({ k: 'ext', name: 'piles', n, split: 'you', rest: d });
    return 2;
  }
  if (/^for each card type, you may put a card of that type from among the revealed cards into your hand$/.test(s1)) {
    const d = s2.match(/^put the rest (on the bottom of your library in a random order|into your graveyard)$/);
    if (!d) return null;
    ab.effects.push({ k: 'ext', name: 'eachType', n, rest: d[1].startsWith('into') ? 'graveyard' : 'bottom' });
    return 2;
  }
  if (/^you may put any number of permanent cards with mana value x or less from among them onto the battlefield$/.test(s1) && /^then put all cards revealed this way that weren't put onto the battlefield into your graveyard$/.test(s2)) {
    ab.effects.push({ k: 'ext', name: 'genesisWave', n });
    return 2;
  }
  return null;
});

const topN = (s: any, item: any, you: number, n: any, api: any) => {
  const k = n === 'X+1' ? (item.x ?? 0) + 1 : api.amount(s, item, n);
  return api.P(s, you).library.slice(0, Math.max(0, k));
};
const reveal = (s: any, you: number, cards: string[], api: any) => api.log(s, `${api.pname(s, you)} reveals ${cards.map((c) => api.nm(s, c)).join(', ') || 'nothing'}.`, you);

EXT.effects.piles = ({ s, item, e, r, you, api }) => {
  const opp = 1 - you;
  if (!r.sub) {
    const cards = topN(s, item, you, e.n, api);
    if (!cards.length) return 'done';
    reveal(s, you, cards, api);
    r.sub = { cards, stage: 'split' };
    // the splitter puts cards into pile A; the rest are pile B
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: e.split === 'opp' ? opp : you, kind: 'chooseCards', title: `${item.label}: separate into two piles — choose pile 1 (the rest are pile 2)`, cards, min: 0, max: cards.length, data: { ctx: 'resolve' } });
    return 'wait';
  }
  if (r.sub.stage === 'split') {
    const a: string[] = r.sub.answer ?? [];
    const b = (r.sub.cards as string[]).filter((c) => !a.includes(c));
    r.sub = { stage: 'pick', a, b };
    const chooser = e.split === 'opp' ? you : opp;
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: chooser, kind: 'yesno', title: `${item.label}: which pile goes to ${api.pname(s, you)}'s hand?`, options: [{ id: 'yes', label: `Pile 1 (${a.map((c) => api.nm(s, c)).join(', ') || 'empty'})` }, { id: 'no', label: `Pile 2 (${b.map((c) => api.nm(s, c)).join(', ') || 'empty'})` }], cards: [...a, ...b], data: { ctx: 'resolve' } });
    return 'wait';
  }
  const hand = r.sub.answered === 'no' ? r.sub.b : r.sub.a;
  const rest = r.sub.answered === 'no' ? r.sub.a : r.sub.b;
  for (const c of hand) if (s.cards[c]?.zone === 'library') api.moveCard(s, c, 'hand');
  for (const c of rest) if (s.cards[c]?.zone === 'library') api.moveCard(s, c, e.rest === 'graveyard' ? 'graveyard' : 'libraryBottom');
  return 'done';
};

const TYPES = ['artifact', 'battle', 'creature', 'enchantment', 'instant', 'land', 'planeswalker', 'sorcery'];
EXT.effects.eachType = ({ s, item, e, r, you, api }) => {
  if (!r.sub) {
    const cards = topN(s, item, you, e.n, api);
    if (!cards.length) return 'done';
    reveal(s, you, cards, api);
    r.sub = { cards, picked: [] };
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'chooseCards', title: `${item.label}: choose up to one card of each card type`, cards, min: 0, max: Math.min(cards.length, TYPES.length), data: { ctx: 'resolve' } });
    return 'wait';
  }
  // keep the choice only if no card type is used twice
  const typesOf = (c: string) => TYPES.filter((t) => api.chars(s, c).types.has(t));
  const picked: string[] = [];
  const used = new Set<string>();
  for (const c of (r.sub.answer ?? []) as string[]) {
    const free = typesOf(c).find((t) => !used.has(t));
    if (!free) continue;
    used.add(free);
    picked.push(c);
  }
  for (const c of picked) if (s.cards[c]?.zone === 'library') api.moveCard(s, c, 'hand');
  const rest = (r.sub.cards as string[]).filter((c) => !picked.includes(c) && s.cards[c]?.zone === 'library');
  if (e.rest === 'bottom') { api.shuffleArr(s, rest); for (const c of rest) api.moveCard(s, c, 'libraryBottom'); } else for (const c of rest) api.moveCard(s, c, 'graveyard');
  return 'done';
};

EXT.effects.genesisWave = ({ s, item, e, r, you, api }) => {
  if (!r.sub) {
    const cards = topN(s, item, you, e.n, api);
    if (!cards.length) return 'done';
    reveal(s, you, cards, api);
    const x = item.x ?? 0;
    const ok = cards.filter((c) => /\b(Artifact|Creature|Enchantment|Land|Planeswalker|Battle)\b/.test(s.defs[s.cards[c].defId].typeLine.split(' // ')[0]) && (s.defs[s.cards[c].defId].cmc ?? 0) <= x);
    r.sub = { cards };
    if (!ok.length) { r.sub.answer = []; } else {
      api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'chooseCards', title: `${item.label}: put any number onto the battlefield`, cards: ok, min: 0, max: ok.length, data: { ctx: 'resolve' } });
      (s.prompt as any).looked = cards;
      return 'wait';
    }
  }
  const put: string[] = r.sub.answer ?? [];
  for (const c of put) if (s.cards[c]?.zone === 'library') api.moveCard(s, c, 'battlefield', { controller: you });
  for (const c of r.sub.cards as string[]) if (s.cards[c]?.zone === 'library') api.moveCard(s, c, 'graveyard');
  return 'done';
};

// Counterbalance
EXT.seqs.unshift((sents, i, _ctx, ab) => {
  if (!/^(?:you may )?reveal the top card of your library$/.test(sents[i])) return null;
  if (!/^if you do, counter that spell if it has the same mana value as the revealed card$/.test(sents[i + 1] ?? '')) return null;
  const eff = { k: 'ext', name: 'counterbalance' };
  ab.effects.push(/^you may /.test(sents[i]) ? { k: 'may', effects: [eff], text: sents[i] } : eff);
  return 1;
});
EXT.effects.counterbalance = ({ s, item, you, api }) => {
  const top = api.P(s, you).library[0];
  if (!top) return 'done';
  api.log(s, `${api.pname(s, you)} reveals ${api.nm(s, top)}.`, you);
  const spellCard = (item as any).triggerObj;
  const it = s.stack.find((x: any) => x.kind === 'spell' && x.source === spellCard);
  if (!it) return 'done';
  const mv = (iid: string) => s.defs[s.cards[iid].defId].cmc ?? 0;
  if (mv(top) === mv(spellCard)) {
    if (api.chars(s, spellCard).pc.cantBeCountered) api.log(s, `${it.label} can't be countered.`, you);
    else api.counterItem(s, it);
  }
  return 'done';
};
