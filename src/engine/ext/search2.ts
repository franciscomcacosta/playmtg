// Plugin: library searches the core rule doesn't take.
//  - destinations: into your graveyard (Entomb, Buried Alive), exile, and the Cultivate split
//    ("put one onto the battlefield tapped and the other into your hand")
//  - filters with a qualifier ("a creature card with mana value 6 or greater", "an instant card or a card with flash")
import { EXT } from '../ext';
import { looseFilter, parseFilter } from '../oracle';

const W: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };
EXT.rules.push([/^search your library for (?:up to (\w+) |(any number of) |(a|an|one|two|three|four|five) )?(.+?)(?:,? (?:and )?reveal (?:it|them|those cards))?(?:,| and) (?:put (?:it|them|that card|those cards) (onto the battlefield(?: tapped)?|into your hand|into your graveyard|on top of your library)|(exile) (?:it|them|that card)|put (one) onto the battlefield tapped and the other into your hand)(?:,? then shuffle)?$/, (m) => {
  if (/\bx\b|named|different names|plus|that could|attached|equal to/.test(m[4])) return null;
  const upTo = !!m[1] || !!m[2];
  const n = m[2] ? 99 : W[m[1] ?? m[3] ?? 'a'] ?? +(m[1] ?? 1);
  let ph = m[4].replace(/^(?:a|an) /, '');
  let filter: any;
  const or = ph.split(/ or (?:a|an) /);
  const one = (x: string) => {
    x = x.replace(/ cards?\b/, '').trim();
    if (x === '' || x === 'card') return {};
    const kw = x.match(/^(?:card )?with (flash|flashback|cycling|kicker)$/);
    if (kw) return { keyword: kw[1] };
    if (/^land with a basic land type$/.test(x)) return { types: ['land'], subtypes: ['plains', 'island', 'swamp', 'mountain', 'forest'] };
    if (/^instant or a card with flash$/.test(x)) return { anyOf: [{ types: ['instant'] }, { keyword: 'flash' }] };
    const f = looseFilter(x);
    if (!f) return null;
    const g: any = { ...f };
    delete g.zone; delete g.owner;
    return g;
  };
  if (or.length > 1) { const fs = or.map(one); if (fs.some((f) => !f)) return null; filter = { anyOf: fs }; }
  else { filter = one(ph); if (!filter) return null; }
  const dest = m[7] ? 'split' : m[6] ? 'exile' : /graveyard/.test(m[5]) ? 'graveyard' : /hand/.test(m[5]) ? 'hand' : /top/.test(m[5]) ? 'top' : 'battlefield';
  // the core's own rule covers the plain cases without a qualifier
  return [{ k: 'ext', name: 'search2', filter, n, upTo, dest, tapped: /tapped/.test(m[5] ?? '') || dest === 'split' }];
}]);

EXT.effects.search2 = ({ s, item, e: e0, r, you, api }) => {
  let e: any = e0;
  const lib: string[] = api.P(s, you).library;
  if (e.nAmt && !r.sub) e = { ...e, n: api.amount(s, item, e.nAmt) };
  if (e.mvAmt && !r.sub) { const v = api.amount(s, item, e.mvAmt.a); e = { ...e, filter: { ...e.filter, cmcMax: v, ...(e.mvAmt.eq ? { cmcMin: v } : {}) } }; }
  if (r.sub?.e) e = r.sub.e;
  if (!r.sub) {
    const cands = lib.filter((c) => api.matchesFilter(s, c, { ...e.filter, zone: 'library' }, you, item.source));
    r.sub = { stage: 'find', e };
    if (!cands.length) { api.shuffleArr(s, lib); return 'done'; }
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'chooseCards', title: `${item.label}: search for ${e.upTo ? 'up to ' : ''}${e.n >= 99 ? 'any number' : e.n}`, cards: cands, min: e.upTo ? 0 : Math.min(e.n, cands.length), max: Math.min(e.n, cands.length), data: { ctx: 'resolve' } });
    return 'wait';
  }
  if (r.sub.stage === 'find') {
    const found: string[] = (r.sub.answer ?? []).filter((c: string) => s.cards[c]?.zone === 'library');
    if (e.dest === 'split' && found.length > 1) {
      r.sub = { stage: 'split', found, e };
      api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'chooseCards', title: 'Choose the one to put onto the battlefield tapped (the other goes to your hand)', cards: found, min: 1, max: 1, data: { ctx: 'resolve' } });
      return 'wait';
    }
    r.sub = { stage: 'split', found, answer: found.slice(0, 1), e };
  }
  const found: string[] = r.sub.found;
  const bf: string[] = e.dest === 'split' ? (r.sub.answer ?? []) : [];
  for (const c of found) {
    if (s.cards[c]?.zone !== 'library') continue;
    api.log(s, `${api.pname(s, you)} searches and finds ${api.nm(s, c)}.`, you);
    if (e.dest === 'split') api.moveCard(s, c, bf.includes(c) ? 'battlefield' : 'hand', bf.includes(c) ? { controller: you, tapped: true } : {});
    else if (e.dest === 'battlefield') api.moveCard(s, c, 'battlefield', { controller: you, tapped: e.tapped });
    else if (e.dest === 'hand') api.moveCard(s, c, 'hand');
    else if (e.dest === 'graveyard') api.moveCard(s, c, 'graveyard');
    else if (e.dest === 'exile') api.moveCard(s, c, 'exile');
  }
  const top = e.dest === 'top' ? found.filter((c) => s.cards[c]?.zone === 'library') : [];
  api.shuffleArr(s, lib);
  for (const c of top) { lib.splice(lib.indexOf(c), 1); lib.unshift(c); }
  return 'done';
};

// "Search your library for a green creature card with mana value X or less, put it onto the battlefield, then shuffle."
// (Green Sun's Zenith, Chord of Calling, Wargate) / "… with mana value equal to 1 plus the sacrificed creature's mana
// value, put that card onto the battlefield …" (Birthing Pod, Neoform) / Eldritch Evolution ("X or less, where X is 2 plus …")
const DYN = /^search your library (and\/or graveyard )?for (?:a|an) (.+?) card with mana value (x or less|equal to (\d+) plus the sacrificed (?:creature|artifact|permanent)'s mana value|x or less, where x is (\d+) plus the sacrificed (?:creature|artifact|permanent)'s mana value)(?:,| and) (?:reveal it, )?put (?:it|that card) (onto the battlefield|into your hand)( tapped)?$/;
const dynSearch = (m: RegExpMatchArray): any[] | null => {
  const f: any = looseFilter(m[2]) ?? parseFilter(m[2] + ' card');
  if (!f) return null;
  const filter = { ...f, zone: 'library' };
  const dyn = m[3] === 'x or less' ? { x: true, max: true } : m[4] ? { sac: true, plus: +m[4], eq: true } : { sac: true, plus: +m[5], max: true };
  return [{ k: 'ext', name: 'searchDyn', filter, dyn, dest: m[6].includes('battlefield') ? 'battlefield' : 'hand', tapped: !!m[7], gy: !!m[1] }];
};
EXT.rules.push([DYN, (m) => dynSearch(m)]);
EXT.seqs.push((sents, i, _ctx, ab) => {
  const a = sents[i].match(/^search your library for (?:a|an) (.+?) card with mana value x or less, where x is (\d+) plus the sacrificed (?:creature|artifact|permanent)'s mana value$/);
  const b = (sents[i + 1] ?? '').match(/^put (?:it|that card) (onto the battlefield|into your hand)( tapped)?$/);
  if (!a || !b) return null;
  const r = dynSearch(['', '', a[1], `x or less, where x is ${a[2]} plus the sacrificed creature's mana value`, undefined, a[2], b[1], b[2]] as any);
  if (!r) return null;
  ab.effects.push(...r);
  return 1;
});
EXT.effects.searchDyn = ({ s, item, e, r, you, api }) => {
  const sac = ((s.cards[item.source] as any)?.sacForCost ?? (s as any).lastSacrificed ?? [])[0];
  const sacMv = sac && s.cards[sac] ? (api.chars(s, sac).cmc ?? 0) : 0;
  const v = e.dyn.x ? (item.x ?? 0) : sacMv + (e.dyn.plus ?? 0);
  const filter = { ...e.filter, ...(e.dyn.eq ? { cmcMin: v, cmcMax: v } : { cmcMax: v }) };
  const pool = [...s.players[you].library, ...(e.gy ? s.players[you].graveyard : [])];
  if (!r.sub) {
    const cands = pool.filter((c: string) => api.matchesFilter(s, c, { ...filter, zone: s.cards[c].zone }, you));
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'chooseCards', title: `Search your library${e.gy ? ' and/or graveyard' : ''} (mana value ${e.dyn.eq ? '' : '≤ '}${v})`, cards: cands, min: 0, max: Math.min(1, cands.length), data: { ctx: 'resolve' } });
    return 'wait';
  }
  for (const c of r.sub.answer ?? []) {
    if (e.dest === 'battlefield') api.moveCard(s, c, 'battlefield', { controller: you, tapped: e.tapped });
    else api.moveCard(s, c, 'hand');
    api.log(s, `${api.pname(s, you)} searches and finds ${api.nm(s, c)}.`, you);
  }
  api.shuffleArr(s, s.players[you].library);
  return 'done';
};
