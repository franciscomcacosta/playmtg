// Plugin: casting spells without paying their mana cost.
//  - "Exile the top card of your library. (If it's a nonland card,) you may cast it without paying its mana cost."
//  - "You may cast a(n) [filter] spell from your hand (with mana value N or less) without paying its mana cost."
//    (wording variants the older rule in library.ts doesn't take: "less than or equal to N", no cap, "from your hand" first)
//  Dig ("look at the top N … you may cast a spell from among them …") is in the core dig parser.
import { EXT } from '../ext';
import { looseFilter } from '../oracle';

const W: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };
const mv = (w: string) => (w === 'x' ? 'X' : /^\d+$/.test(w) ? +w : W[w]);

EXT.seqs.push((sents, i, _ctx, ab) => {
  if (!/^exile the top card of your library$/.test(sents[i])) return null;
  const m = sents[i + 1]?.match(/^(?:if it's (?:a|an) (.+?) card, )?(?:you may )?cast (?:it|that card|the exiled card) without paying its mana cost$/);
  if (!m) return null;
  let f: any;
  if (m[1]) { f = looseFilter(m[1]); if (!f) return null; f = { ...f }; delete f.zone; }
  ab.effects.push({ k: 'exileTop', n: 1 });
  ab.effects.push({ k: 'ext', name: 'castExiledFree', filter: f });
  return 1;
});
EXT.effects.castExiledFree = ({ s, item, e, r, you, api }) => {
  const c = ((item as any).exiledTop ?? []).find((x: string) => s.cards[x]?.zone === 'exile' || s.cards[x]?.zone === 'library');
  if (!c) return 'done';
  const d = s.defs[s.cards[c].defId];
  if (/\bLand\b/.test(d.typeLine.split(' // ')[0])) {
    // "play that card": a land is played as the turn's land drop (305.3) if one is available and it's your turn
    const pl: any = s.players[you];
    if (e.play && s.active === you && pl.landsPlayed < (pl.landsAllowed ?? 1)) { pl.landsPlayed++; api.moveCard(s, c, 'battlefield', { controller: you }); api.log(s, `${api.pname(s, you)} plays ${api.nm(s, c)}.`, you); }
    return 'done';
  }
  if (e.filter && !api.matchesFilter(s, c, { ...e.filter, zone: s.cards[c].zone }, you)) return 'done';
  if (!r.sub) {
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'yesno', title: `Cast ${api.nm(s, c)} without paying its mana cost?`, options: [{ id: 'yes', label: 'Cast it' }, { id: 'no', label: "Don't" }], cards: [c], data: { ctx: 'resolve' } });
    return 'wait';
  }
  if (r.sub.answered === 'yes') {
    const err = api.beginCast(s, you, c, 0, 'free');
    if (err) api.log(s, `Couldn't cast ${api.nm(s, c)}: ${err}`, you, 'warn');
    else (s as any).lastFreeCast = c;
  }
  return 'done';
};

// "You may cast it / that card without paying its mana cost." after a sentence that revealed or exiled the top card
EXT.rules.push([/^(?:you may )?(cast|play) (?:it|that card|the revealed card|the exiled card) without paying its mana cost$/, (m, ctx) => (ctx.last?.t === 'exiledTop' ? [{ k: 'ext', name: 'castExiledFree', ...(m[1] === 'play' ? { play: true } : {}) }] : null)]);

// Hand casting, extra wordings → the existing castFree effect (library.ts).
EXT.rules.push([/^(?:you may )?cast (?:a|an|up to one) (.+?) (?:spell )?(?:from your hand )?(?:with mana value (\w+) or less |with mana value less than or equal to (\w+) )?(?:from your hand )?without paying its mana cost$/, (m) => {
  if (!/from your hand/.test(m[0])) return null;
  const ph = m[1].replace(/ spell$/, '');
  const f = ph === 'spell' || ph === '' ? {} : looseFilter(ph);
  const max = m[2] ? mv(m[2]) : m[3] ? mv(m[3]) : 99;
  if (!f || max === undefined) return null;
  return [{ k: 'ext', name: 'castFree', filter: f, max }];
}]);
// "You may cast it without paying its mana cost if that spell's mana value is 8 or less." (Breaching Dragonstorm)
EXT.rules.push([/^(?:you may )?cast (?:it|that card|the exiled card) without paying its mana cost if (?:that spell's|its|the spell's) mana value is (\d+) or less$/, (m, ctx) => (ctx.last?.t === 'exiledTop' ? [{ k: 'ext', name: 'castExiledFree', filter: { cmcMax: +m[1] } }] : null)]);
