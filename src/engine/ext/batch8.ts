// Plugin: batch 8 — imprint-and-copy spells.
//  - "(You may) exile an instant card (with mana value N or less) from your hand." (Isochron Scepter, Elite Arcanist, Spellbinder)
//  - "(You may) copy the exiled card / that card. (If you do,) you may cast the copy without paying its mana cost."
//    The copy is a new card object that exists only while it's a spell (CR 707.12): it's removed when it leaves the stack.
import { EXT } from '../ext';
import { looseFilter, parseFilter } from '../oracle';

EXT.rules.push([/^exile (?:a|an) (.+?) card(?: with mana value (\d+) or less)? from your hand$/, (m) => {
  const f0 = looseFilter(m[1]) ?? parseFilter(m[1] + ' card');
  if (!f0) return null;
  const filter: any = { ...f0 };
  delete filter.zone; delete filter.owner;
  return [{ k: 'ext', name: 'imprintHand', filter, mvMax: m[2] ? +m[2] : undefined }];
}]);
EXT.effects.imprintHand = ({ s, item, e, r, you, api }) => {
  const cands: string[] = api.P(s, you).hand.filter((h: string) => api.matchesFilter(s, h, { ...e.filter, zone: 'hand' }, you, item.source) && (e.mvMax === undefined || (s.defs[s.cards[h].defId].cmc ?? 0) <= e.mvMax));
  if (!r.sub) {
    if (!cands.length) return 'done';
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'chooseCards', title: `${item.label}: exile a card from your hand`, cards: cands, min: 0, max: 1, data: { ctx: 'resolve' } });
    return 'wait';
  }
  const c = (r.sub.answer ?? [])[0];
  if (!c || s.cards[c]?.zone !== 'hand') return 'done';
  api.moveCard(s, c, 'exile');
  api.log(s, `${api.pname(s, you)} exiles ${api.nm(s, c)} with ${api.nm(s, item.source)}.`, you);
  ((item as any).exiledHere ??= []).push(c);
  const src = s.cards[item.source];
  if (src && src.iid !== c) ((src as any).remembered ??= []).push(c);
  return 'done';
};

EXT.seqs.push((sents, i, _ctx, ab) => {
  const a = sents[i].match(/^(you may )?copy (?:the exiled card|that card|it)$/);
  if (!a) return null;
  const b = sents[i + 1]?.match(/^(?:if you do, )?you may cast the copy without paying its mana cost$/);
  if (!b) return null;
  ab.effects.push({ k: 'ext', name: 'castCopy', may: !!a[1] });
  return 1;
});
EXT.effects.castCopy = ({ s, item, r, you, api }) => {
  const ex: string[] = api.subjCards(s, item, { t: 'linkedExiled' });
  const orig = ex[ex.length - 1];
  if (!orig) return 'done';
  if (!r.sub) {
    r.sub = { orig };
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'yesno', title: `Copy ${api.nm(s, orig)} and cast the copy without paying its mana cost?`, options: [{ id: 'yes', label: 'Cast the copy' }, { id: 'no', label: "Don't" }], cards: [orig], data: { ctx: 'resolve' } });
    return 'wait';
  }
  if (r.sub.answered !== 'yes') return 'done';
  const iid = api.uid(s, 'c');
  const o = s.cards[r.sub.orig];
  if (!o) return 'done';
  s.cards[iid] = { ...api.newCardObj(iid, o.defId, you, 'exile'), cardCopy: true } as any;
  api.P(s, you).exile.push(iid);
  const err = api.beginCast(s, you, iid, 0, 'free');
  if (err) {
    api.log(s, `Couldn't cast the copy: ${err}`, you, 'warn');
    api.removeFromZone(s, iid);
    delete s.cards[iid];
  } else api.log(s, `${api.pname(s, you)} casts a copy of ${api.nm(s, r.sub.orig)}.`, you);
  return 'done';
};

// "If an Equipment is put onto the battlefield this way, you may attach it to a creature you control."
EXT.effects.attachDug = ({ s, item, r, you, api }) => {
  const eq = ((item as any).equipToAttach ?? []).find((c: string) => s.cards[c]?.zone === 'battlefield');
  if (!eq) return 'done';
  const cands = s.battlefield.filter((b: string) => s.cards[b].controller === you && api.chars(s, b).types.has('creature'));
  if (!r.sub) {
    if (!cands.length) return 'done';
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'chooseCards', title: `Attach ${api.nm(s, eq)} to a creature you control?`, cards: cands, min: 0, max: 1, data: { ctx: 'resolve' } });
    return 'wait';
  }
  const t = (r.sub.answer ?? [])[0];
  if (t && s.cards[t]?.zone === 'battlefield') { s.cards[eq].attachedTo = t; api.log(s, `${api.nm(s, eq)} is attached to ${api.nm(s, t)}.`, you); }
  return 'done';
};

// "Look at the top three cards of your library. Put one of those cards into your hand, one on top of your library,
//  and one on the bottom of your library." (Telling Time, Moment of Truth)
const SPLIT: Record<string, string> = { 'into your hand': 'hand', 'on top of your library': 'top', 'on the bottom of your library': 'bottom', 'into your graveyard': 'graveyard' };
EXT.seqs.unshift((sents, i, _ctx, ab) => {
  const h = sents[i].match(/^look at the top (two|three) cards of your library$/);
  if (!h) return null;
  const m = sents[i + 1]?.match(/^put one of (?:them|those cards) (into your hand|on top of your library|on the bottom of your library|into your graveyard),(?: and)? one (into your hand|on top of your library|on the bottom of your library|into your graveyard)(?:,? and one (into your hand|on top of your library|on the bottom of your library|into your graveyard))?$/);
  if (!m) return null;
  const dests = [m[1], m[2], m[3]].filter(Boolean).map((d) => SPLIT[d]);
  if (dests.length !== (h[1] === 'two' ? 2 : 3)) return null;
  ab.effects.push({ k: 'ext', name: 'digSplit', dests });
  return 1;
});
EXT.effects.digSplit = ({ s, item, e, r, you, api }) => {
  const lib: string[] = api.P(s, you).library;
  if (!r.sub) r.sub = { top: lib.slice(0, e.dests.length), step: 0, placed: {} as Record<string, string> };
  const st = r.sub;
  if (st.answer) { st.placed[st.step] = st.answer[0]; st.step++; st.answer = undefined; }
  const left = (st.top as string[]).filter((c) => !Object.values(st.placed).includes(c) && s.cards[c]?.zone === 'library');
  if (st.step < e.dests.length - 1 && left.length > 1) {
    const label: Record<string, string> = { hand: 'put into your hand', top: 'put back on top', bottom: 'put on the bottom', graveyard: 'put into your graveyard' };
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'chooseCards', title: `${item.label}: choose a card to ${label[e.dests[st.step]]}`, cards: left, min: 1, max: 1, data: { ctx: 'resolve' } });
    return 'wait';
  }
  if (left.length) st.placed[st.step] = left[0];
  for (let k = 0; k < e.dests.length; k++) {
    const c = st.placed[k];
    if (!c || s.cards[c]?.zone !== 'library') continue;
    const d = e.dests[k];
    if (d === 'hand') api.moveCard(s, c, 'hand');
    else if (d === 'graveyard') api.moveCard(s, c, 'graveyard');
    else if (d === 'bottom') api.moveCard(s, c, 'libraryBottom');
  }
  // the "top" card stays where it is once the others have moved away; put it back on top explicitly
  const topK = e.dests.indexOf('top');
  if (topK >= 0 && st.placed[topK] && s.cards[st.placed[topK]]?.zone === 'library') { lib.splice(lib.indexOf(st.placed[topK]), 1); lib.unshift(st.placed[topK]); }
  api.log(s, `${api.pname(s, you)} sorts the top ${(st.top as string[]).length} cards.`, you);
  return 'done';
};
