// Plugin: hand disruption shapes the core handPick doesn't cover.
//  - "Target opponent reveals their hand. You choose a nonland card from it. That player discards that card." (3 sentences)
//  - "Look at target player's hand and choose two cards from it. Put them on top of that player's library in any order."
//  - "Target player reveals three cards from their hand and you choose one of them. That player discards that card."
//  - "Target player reveals their hand and discards all nonland cards."
import { EXT } from '../ext';
import { looseFilter, parseCountPhrase, parseFilter, parsePlayerSubject } from '../oracle';
import type { PlayerIdx } from '../types';

const W: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };
const amt = (w: string): number | 'X' | undefined => (w === 'x' ? 'X' : /^\d+$/.test(w) ? +w : W[w]);
const cardF = (ph?: string): any | null | undefined => {
  ph = (ph ?? '').replace(/ cards?\b/g, '').replace(/^cards?$/, '').trim();
  if (!ph || ph === 'card') return undefined;
  const f = looseFilter(ph) ?? parseFilter(ph + ' card');
  if (!f) return null;
  const g: any = { ...f };
  delete g.zone; delete g.owner;
  return g;
};
const WHO = '(target opponent|target player|each opponent|that player)';
const DEST = (t?: string) =>
  !t ? null
  : /^(?:that player|they) discards? (?:that card|those cards|them|it)$/.test(t) ? 'discard'
  : /^put (?:them|those cards|that card|it) on top of (?:that player's|their) library(?: in any order)?$/.test(t) ? 'top'
  : /^exile (?:that card|those cards|them|it)$/.test(t) ? 'exile'
  : null;

EXT.seqs.push((sents, i, ctx, ab) => {
  let m: RegExpMatchArray | null;
  // A) reveal / choose / discard over three sentences
  if ((m = sents[i].match(new RegExp(`^${WHO} reveals (?:their|his or her) hand$`))) || (m = sents[i].match(/^look at (target player|target opponent|that player)'s hand$/))) {
    const c = sents[i + 1]?.match(/^you (?:may )?choose (?:an|a|one)\b ?(.*?)(?: card)? from it$/);
    const d = DEST(sents[i + 2]);
    if (!c || !d) return null;
    const f = cardF(c[1]);
    if (f === null) return null;
    const who = parsePlayerSubject(m[1], ctx);
    if (!who) return null;
    ab.effects.push({ k: 'ext', name: 'handChoose', who, filter: f, n: 1, dest: d, ...(/^you may /.test(sents[i + 1]) ? { optional: true } : {}) });
    return 2;
  }
  // B) look at their hand, choose N
  if ((m = sents[i].match(new RegExp(`^look at ${WHO.replace(')', "|target player)")}'s hand and choose (\\w+) ?(.*?)(?: cards?)? from it$`)))) {
    const d = DEST(sents[i + 1]);
    const n = amt(m[2]);
    const who = parsePlayerSubject(m[1], ctx);
    const f = cardF(m[3]);
    if (!d || n === undefined || !who || f === null) return null;
    ab.effects.push({ k: 'ext', name: 'handChoose', who, filter: f, n, dest: d });
    return 1;
  }
  // C) they reveal N (or "a number of cards … equal to …"), you choose one
  let eq: any = null;
  if ((m = sents[i].match(new RegExp(`^${WHO} reveals a number of cards from (?:their|his or her) hand equal to (.+?)(?: and you choose one of (?:them|those cards))?$`)))) {
    eq = parseCountPhrase(m[2]);
    if (!eq) return null;
    m = [m[0], m[1], 'x'] as any;
  }
  if (m || (m = sents[i].match(new RegExp(`^${WHO} reveals (\\w+) cards? from (?:their|his or her) hand(?: and you choose one of (?:them|those cards))?$`)))) {
    let used = 0;
    if (!/you choose/.test(sents[i])) {
      if (!/^you choose one of (?:them|those cards)$/.test(sents[i + 1] ?? '')) return null;
      used = 1;
    }
    const d = DEST(sents[i + 1 + used]);
    const n = eq ?? amt(m[2]);
    const who = parsePlayerSubject(m[1], ctx);
    if (!d || n === undefined || !who) return null;
    ab.effects.push({ k: 'ext', name: 'handChoose', who, n: 1, reveal: n, dest: d });
    return used + 1;
  }
  return null;
});

// D) one sentence: "target player reveals their hand and discards all nonland cards"
EXT.rules.push([new RegExp(`^${WHO} reveals (?:their|his or her) hand and discards all (.+?) cards$`), (m, ctx) => {
  const who = parsePlayerSubject(m[1], ctx);
  const f = cardF(m[2]);
  return who && f ? [{ k: 'ext', name: 'handChoose', who, filter: f, all: true, dest: 'discard' }] : null;
}]);

EXT.effects.handChoose = ({ s, item, e, r, you, api }) => {
  const p: PlayerIdx | undefined = api.subjPlayers(s, item, e.who)[0];
  if (p == null) return 'done';
  const hand: string[] = api.P(s, p).hand;
  const finish = (picked: string[]) => {
    for (const h of picked) {
      if (s.cards[h]?.zone !== 'hand') continue;
      if (e.dest === 'discard') { api.log(s, `${api.pname(s, p)} discards ${api.nm(s, h)}.`, p); api.moveCard(s, h, 'graveyard', { cause: 'discard' }); }
      else if (e.dest === 'exile') { api.log(s, `${api.nm(s, h)} is exiled from ${api.pname(s, p)}'s hand.`, p); api.moveCard(s, h, 'exile'); }
      else api.moveCard(s, h, 'libraryTop');
    }
    if (e.dest === 'top' && picked.length) api.log(s, `${picked.length} card${picked.length > 1 ? 's' : ''} put on top of ${api.pname(s, p)}'s library.`, you);
    return 'done' as const;
  };
  const matching = () => (e.filter ? hand.filter((h) => api.matchesFilter(s, h, { ...e.filter, zone: 'hand' }, you)) : [...hand]);
  if (!r.sub) {
    if (e.all) {
      api.log(s, `${api.pname(s, p)} reveals their hand: ${hand.map((h) => api.nm(s, h)).join(', ') || 'nothing'}.`, p);
      return finish(matching());
    }
    if (e.reveal !== undefined) {
      // the target player picks which cards to reveal
      const k = Math.min(api.amount(s, item, e.reveal), hand.length);
      if (!k) return 'done';
      r.sub = { stage: 'reveal' };
      if (k >= hand.length) { r.sub = { stage: 'pick', revealed: [...hand] }; }
      else {
        api.pushPrompt(s, { id: api.uid(s, 'p'), player: p, kind: 'chooseCards', title: `${item.label}: reveal ${k} card${k > 1 ? 's' : ''} from your hand`, cards: [...hand], min: k, max: k, data: { ctx: 'resolve' } });
        return 'wait';
      }
    } else {
      r.sub = { stage: 'pick', revealed: matching() };
      api.ev(s, { k: 'revealHand', p, cards: hand.map((h) => ({ iid: h, name: api.nm(s, h), image: api.cardImageOf(s, h) })) });
    }
  }
  if (r.sub.stage === 'reveal') {
    const revealed = (r.sub.answer ?? []) as string[];
    api.log(s, `${api.pname(s, p)} reveals ${revealed.map((h) => api.nm(s, h)).join(', ')}.`, p);
    r.sub = { stage: 'pick', revealed };
  }
  if (r.sub.stage === 'pick') {
    const cands = (r.sub.revealed as string[]).filter((h) => s.cards[h]?.zone === 'hand');
    const n = Math.min(api.amount(s, item, e.n ?? 1), cands.length);
    if (!n) return 'done';
    r.sub = { stage: 'done' };
    const verb = e.dest === 'discard' ? 'to discard' : e.dest === 'exile' ? 'to exile' : 'to put on top of their library';
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'chooseCards', title: `${item.label}: choose ${n} ${verb}`, cards: cands, min: e.optional ? 0 : n, max: n, data: { ctx: 'resolve' } });
    (s.prompt as any).looked = [...hand];
    return 'wait';
  }
  return finish((r.sub.answer ?? []) as string[]);
};
