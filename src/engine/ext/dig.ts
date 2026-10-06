// Plugin: library digging that the core "look at the top N" parser doesn't cover.
//  - "Reveal cards from the top of your library until you reveal a creature card. Put that card into your hand
//     and the rest on the bottom of your library in a random order." (Ajani, Atla Palani, Class levels …)
//  - "Look at / reveal the top card of your library. If it's a land card, you may put it onto the battlefield.
//     (Otherwise, put it on the bottom.)" and "You may put that card into your graveyard."
//  - "Look at the top N cards of target player's library, then put them back in any order."
import { EXT } from '../ext';
import { looseFilter, parseFilter, parsePlayerSubject } from '../oracle';

const W: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const n0 = (w: string) => (/^\d+$/.test(w) ? +w : W[w]);
const cardF = (ph: string): any | null | undefined => {
  ph = ph.replace(/ cards?\b/g, '').replace(/^cards?$/, '').trim();
  if (!ph || ph === 'card') return undefined;
  const f = looseFilter(ph) ?? parseFilter(ph + ' card');
  if (!f) return null;
  const g: any = { ...f };
  delete g.zone; delete g.owner;
  return g;
};
const DEST = (t: string) =>
  t.startsWith('into your hand') ? 'hand' : t.startsWith('onto the battlefield') ? 'battlefield' : t === 'into your graveyard' ? 'graveyard' : t === 'on the bottom of your library' ? 'bottom' : t === 'on top of your library' || t === 'back on top of your library' ? 'top' : null;
const REST = (t: string) => {
  t = t.replace(/ in (?:a random|any) order$/, '').replace(/^(?:of (?:them|those cards|the cards) )/, '').trim();
  if (/^(?:on the )?bottom(?: of your library)?$|^on the bottom of (?:your|their|that player's) library$/.test(t)) return 'bottom';
  if (/^into (?:your|their|its owner's) graveyard$/.test(t)) return 'graveyard';
  if (/^into exile$/.test(t)) return 'exile';
  if (/^(?:back )?on top(?: of your library)?$/.test(t)) return 'top';
  return null;
};

// ---- reveal until ----
EXT.seqs.push((sents, i, _ctx, ab) => {
  const a0 = sents[i].match(/^(?:then )?(if you do, )?(you may )?reveal cards from the top of your library until you reveal (?:a|an) (.+?)(?: card)?$/);
  if (!a0) return null;
  const a = [a0[0], a0[3]] as any;
  const f = cardF(a[1]);
  if (f === null) return null;
  let used = 0;
  let dest: string | null = null, tapped = false, rest: string | null = null;
  const b = sents[i + 1]?.replace(/^then /, '');
  let m: RegExpMatchArray | null;
  let attacking = false;
  if (b && (m = b.match(/^put (?:that card|it) (into your hand|onto the battlefield(?: tapped)?)( and attacking)?(?: under your control)?(?:,)? and (?:put )?(?:the rest|all other cards revealed this way|the other revealed cards) (.+)$/))) {
    dest = DEST(m[1]); tapped = m[1].endsWith('tapped'); attacking = !!m[2]; rest = REST(m[3]); used = 1;
  } else if (b && (m = b.match(/^put (?:that card|it) (into your hand|onto the battlefield(?: tapped)?)(?: under your control)?$/))) {
    dest = DEST(m[1]); tapped = m[1].endsWith('tapped'); used = 1;
    const c = sents[i + 2]?.replace(/^then /, '').match(/^put the rest (.+)$/);
    if (c) { rest = REST(c[1]); used = 2; }
    else rest = 'bottom';
  }
  if (!dest || !rest) return null;
  const eff: any = { k: 'ext', name: 'revealUntil', filter: f ?? { types: ['card'] }, dest, tapped, rest, ...(attacking ? { attacking: true } : {}) };
  const wrapped: any = a0[2] ? { k: 'may', effects: [eff], text: sents[i] } : eff;
  ab.effects.push(a0[1] ? { k: 'if', cond: { k: 'youDid' }, effects: [wrapped] } as any : wrapped);
  return used;
});
EXT.effects.revealUntil = ({ s, item, e, you, api }) => {
  const lib: string[] = api.P(s, you).library;
  const seen: string[] = [];
  let hit: string | undefined;
  for (const c of [...lib]) {
    seen.push(c);
    if (api.matchesFilter(s, c, { ...e.filter, zone: 'library' }, you)) { hit = c; break; }
  }
  if (!seen.length) return 'done';
  api.log(s, `${api.pname(s, you)} reveals ${seen.map((c) => api.nm(s, c)).join(', ')}${hit ? '' : ' (no match)'}.`, you);
  (item as any).revealedCount = seen.length;
  if (hit) {
    if (e.dest === 'hand') api.moveCard(s, hit, 'hand');
    else {
      api.moveCard(s, hit, 'battlefield', { controller: you, tapped: e.tapped });
      if (e.attacking && s.combat && s.cards[hit]?.zone === 'battlefield') {
        const tgt = s.combat.attackers.find((a: any) => a.iid === item.source)?.target ?? { kind: 'player', idx: 1 - you };
        s.combat.attackers.push({ iid: hit, target: tgt, blockedBy: [], blocked: false } as any);
      }
    }
    (item as any).lastTokens = [hit];
  }
  const rest = seen.filter((c) => c !== hit && s.cards[c]?.zone === 'library');
  if (e.rest === 'bottom') { api.shuffleArr(s, rest); for (const c of rest) api.moveCard(s, c, 'libraryBottom'); }
  else if (e.rest === 'graveyard') for (const c of rest) api.moveCard(s, c, 'graveyard');
  else if (e.rest === 'exile') for (const c of rest) api.moveCard(s, c, 'exile');
  return 'done';
};

// ---- the top card ----
EXT.seqs.push((sents, i, _ctx, ab) => {
  const a = sents[i].match(/^(look at|reveal) the top card of your library$/);
  if (!a) return null;
  const b = sents[i + 1];
  if (!b) return null;
  let m: RegExpMatchArray | null;
  let pick: any = null;
  let rest: string = 'top';
  let used = 1;
  if ((m = b.match(/^(you may )?put (?:that card|it) (into your graveyard|on the bottom of your library|into your hand)$/))) {
    pick = { count: 1, upTo: !!m[1], dest: DEST(m[2]) };
  } else if ((m = b.match(/^if (?:it's|it is) (?:a|an) (.+?)(?: card)?, (you may )?(?:reveal it and )?put it (into your hand|onto the battlefield(?: tapped)?|into your graveyard)$/))) {
    const f = cardF(m[1]);
    if (f === null) return null;
    pick = { count: 1, upTo: !!m[2], filter: f, dest: DEST(m[3]), tapped: m[3].endsWith('tapped') };
    const c = sents[i + 2]?.match(/^(?:otherwise|if you don't)(?:,)? put (?:it|that card) (on the bottom of your library|into your graveyard)$/);
    if (c) { rest = c[1].includes('bottom') ? 'bottom' : 'graveyard'; used = 2; }
  }
  if (!pick || !pick.dest) return null;
  if (/^otherwise, put (?:it|that card) into your hand$/.test(sents[i + used + 1] ?? '')) return null; // reveal.ts
  ab.effects.push({ k: 'dig', spec: { n: 1, reveal: a[1] === 'reveal', pick, rest } });
  return used;
});

// ---- someone else's library ----
EXT.seqs.push((sents, i, ctx, ab) => {
  let t = sents[i];
  let m = t.match(/^look at the top (\w+) cards? of (target player's|target opponent's|each opponent's|that player's) library(?:, then (.+))?$/);
  if (!m) return null;
  const n = n0(m[1]);
  const whoText = m[2].replace(/'s$/, '');
  const who = whoText === 'that player' ? { t: 'triggerPlayer' } : parsePlayerSubject(whoText, ctx);
  if (!n || !who) return null;
  let tail = m[3];
  let used = 0;
  if (!tail && sents[i + 1]) { tail = sents[i + 1].replace(/^then /, ''); used = 1; }
  if (!tail) return null;
  if (/^put them back in any order$/.test(tail)) {
    ab.effects.push({ k: 'dig', spec: { n, reveal: false, rest: 'top', owner: who } });
    return used;
  }
  const g = tail.match(/^put any number of them into (?:that player's|their) graveyard and the rest back on top (?:of (?:their|that player's) library )?in any order$/);
  if (g) {
    ab.effects.push({ k: 'dig', spec: { n, reveal: false, rest: 'top', owner: who, pick: { count: 99, upTo: true, dest: 'graveyard' } } });
    return used;
  }
  return null;
});
