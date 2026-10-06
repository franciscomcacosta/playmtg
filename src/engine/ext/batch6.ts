// Plugin: batch 6.
//  - "Look at the top card of your library. If it's a Zombie card, you may reveal it and put it into your hand.
//     If you don't put the card into your hand, you may put it into your graveyard / on the bottom of your library."
//  - "You may search your library for up to three / any number of cards named ~, reveal them, put them into your hand(, then shuffle)."
//  - "Target creature's owner puts it on their choice of the top or bottom of their library."
//  - "Enchanted creature gets +1/+1 and can't be blocked."
import { EXT } from '../ext';
import { looseFilter, parseFilter, parseSubject } from '../oracle';
import { hasName } from './naming';

const W: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };

EXT.seqs.unshift((sents, i, _ctx, ab) => {
  if (!/^look at the top card of your library$/.test(sents[i])) return null;
  const a = sents[i + 1]?.match(/^if it's (?:a|an) (.+?) card, you may reveal it and put it into your hand$/);
  const b = sents[i + 2]?.match(/^if you don't put the card into your hand, you may put it (into your graveyard|on the bottom of your library)$/);
  if (!a || !b) return null;
  const ph = a[1].replace(/ of the chosen type$/, '');
  const f0 = looseFilter(ph) ?? parseFilter(ph + ' card');
  if (!f0) return null;
  const filter: any = { ...f0 };
  delete filter.zone;
  if (/ of the chosen type$/.test(a[1])) filter.chosenType = true;
  ab.effects.push({ k: 'ext', name: 'topMaybe', filter, elseDest: b[1].includes('graveyard') ? 'graveyard' : 'libraryBottom' });
  return 2;
});
EXT.effects.topMaybe = ({ s, item, e, r, you, api }) => {
  const top = api.P(s, you).library[0];
  if (!top) return 'done';
  if (!r.sub) {
    r.sub = { stage: 'hand', top };
    if (api.matchesFilter(s, top, { ...e.filter, zone: 'library' }, you, item.source)) {
      api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'yesno', title: `Reveal ${api.nm(s, top)} and put it into your hand?`, options: [{ id: 'yes', label: 'Into my hand' }, { id: 'no', label: 'Leave it' }], cards: [top], data: { ctx: 'resolve' } });
      return 'wait';
    }
    r.sub.answered = 'no';
  }
  if (r.sub.stage === 'hand') {
    if (r.sub.answered === 'yes') { api.log(s, `${api.pname(s, you)} reveals ${api.nm(s, top)} and puts it into their hand.`, you); api.moveCard(s, top, 'hand'); return 'done'; }
    r.sub = { stage: 'else', top };
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'yesno', title: `Put the top card ${e.elseDest === 'graveyard' ? 'into your graveyard' : 'on the bottom of your library'}?`, options: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'Keep it on top' }], cards: [top], data: { ctx: 'resolve' } });
    return 'wait';
  }
  if (r.sub.answered === 'yes' && s.cards[r.sub.top]?.zone === 'library') api.moveCard(s, r.sub.top, e.elseDest);
  return 'done';
};

// ---- search for several cards named ~ ----
EXT.rules.push([/^(?:you may )?search your library for (up to (\w+)|any number of) cards named (~|.+?), reveal them,? (?:and )?put them into your hand$/, (m) => {
  const n = m[1] === 'any number of' ? 99 : W[m[2]] ?? (+m[2] || 0);
  return n ? [{ k: 'ext', name: 'searchNamedN', n, named: m[3] }] : null;
}]);
EXT.effects.searchNamedN = ({ s, item, e, r, you, api }) => {
  const nm = e.named === '~' ? s.defs[s.cards[item.source].defId].name : e.named;
  const lib: string[] = api.P(s, you).library;
  const cands = lib.filter((c) => hasName(s, c, nm));
  if (!r.sub) {
    r.sub = {};
    if (!cands.length) { api.shuffleArr(s, lib); return 'done'; }
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'chooseCards', title: `Search for up to ${e.n >= 99 ? 'any number of' : e.n} cards named ${nm}`, cards: cands, min: 0, max: Math.min(e.n, cands.length), data: { ctx: 'resolve' } });
    return 'wait';
  }
  for (const c of r.sub.answer ?? []) if (s.cards[c]?.zone === 'library') api.moveCard(s, c, 'hand');
  api.shuffleArr(s, lib);
  return 'done';
};

// ---- owner's choice: top or bottom ----
EXT.rules.push([/^(target creature|target nonland permanent|target permanent|that creature|it)'s owner puts it on (?:their|his or her) choice of the top or bottom of (?:their|his or her) library$/, (m, ctx) => {
  const what = parseSubject(m[1], ctx);
  return what ? [{ k: 'ext', name: 'ownerTopBottom', what }] : null;
}]);
EXT.effects.ownerTopBottom = ({ s, item, e, r, api }) => {
  const c = api.subjCards(s, item, e.what)[0];
  if (!c || !s.cards[c] || s.cards[c].zone !== 'battlefield') return 'done';
  const owner = s.cards[c].owner;
  if (!r.sub) {
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: owner, kind: 'yesno', title: `Put ${api.nm(s, c)} on top or bottom of your library?`, options: [{ id: 'yes', label: 'Top' }, { id: 'no', label: 'Bottom' }], cards: [c], data: { ctx: 'resolve' } });
    return 'wait';
  }
  api.moveCard(s, c, r.sub.answered === 'yes' ? 'libraryTop' : 'libraryBottom');
  return 'done';
};

// ---- Aura: +N/+N and can't be blocked ----
EXT.lines.push((line, pc) => {
  const m = line.match(/^enchanted creature gets ([+-]\d+)\/([+-]\d+) and can't be blocked$/);
  if (!m) return false;
  pc.statics.push({ kind: 'attachPump', p: +m[1], t: +m[2], kw: [], unblockable: true } as any);
  return true;
});
