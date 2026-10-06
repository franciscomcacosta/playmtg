// Plugin: "Reveal the top card of your library." followed by sentences about the revealed card:
//   "If it's a land card, ~ gets +1/+0 …"  "If a creature card is revealed this way, draw a card."
//   "Otherwise, put it into your graveyard."  "You gain life equal to that card's mana value."  "Put it into your hand."
// The core handles the simple "if it's an X card, put it into your hand" forms and parseDig the dig forms; this
// takes the rest: revealTop (no destination), then each following sentence with "it"/"that card" = the revealed card.
import { EXT } from '../ext';
import { looseFilter, parseAmtPhrase, parsePlayerSubject, parseDig, parseFilter, parseSentence } from '../oracle';
import { chars, matchesFilter } from '../rules';

const HEAD = /^(you may )?(?:(you|target player|target opponent|defending player|that player) reveals?|reveal) the top card of (?:your|their|his or her) library$/;
EXT.seqs.push((sents, i, ctx, ab) => {
  const t = sents[i].match(HEAD);
  if (!t) return null;
  if (t[2] && t[2] !== 'you') return null;
  const nx = sents[i + 1] ?? '';
  if (!nx) return null;
  if (/^if it's an? (.+?) card, (?:(?:you|that player|they) (?:may )?puts?|(?:may )?put) it (?:into (?:your|their|his or her) hand|onto the battlefield)$/.test(nx) || /^(?:you may )?put (?:that card|it) into your hand$/.test(nx)) {
    const ow = sents[i + 2] ?? '';
    if (!/^otherwise, /.test(ow) || /^(?:otherwise|if you don't), put it (on the bottom of your library|into your graveyard)$/.test(ow)) return null;
  }
  if (parseDig(sents, i)) return null;
  const k0 = ctx.specs.length;
  const saveLast = ctx.last;
  ctx.last = { t: 'exiledTop' } as any;
  const out: any[] = [{ k: 'revealTop', who: { t: 'you' } }];
  let j = i + 1;
  let lastCond: any = null;
  for (; j < sents.length; j++) {
    const s = sents[j];
    if (/^activate only/.test(s)) break;
    let m: RegExpMatchArray | null;
    let cond: any = null, body = s;
    if ((m = s.match(/^if (?:it's|that card is|it is) (not )?an? (.+?) card, (.+)$/)) || (m = s.match(/^if (?:it|that card) (isn't) an? (.+?) card, (.+)$/))) {
      const f = parseFilter(m[2]);
      if (!f) break;
      cond = { k: 'ext', name: 'revealedIs', filter: f, not: !!m[1] };
      body = m[3];
    } else if ((m = s.match(/^if an? (.+?) card is revealed this way, (.+)$/))) {
      const f = parseFilter(m[1]);
      if (!f) break;
      cond = { k: 'ext', name: 'revealedIs', filter: f };
      body = m[2];
    } else if ((m = s.match(/^otherwise, (.+)$/)) && lastCond) {
      cond = { ...lastCond, not: !lastCond.not };
      body = m[1];
    }
    ctx.last = { t: 'exiledTop' } as any;
    const effs = parseSentence(body.replace(/^this creature /, '~ ').replace(/\bthe revealed card\b/g, 'it').replace(/\b(?:that card's|its) (mana value|power|toughness)\b/g, "the revealed top card's $1"), ctx);
    if (!effs || effs.some((e: any) => e.k === 'manual')) break;
    if (cond) out.push({ k: "if", cond, effects: effs }); else out.push(...effs);
    lastCond = cond && !/^otherwise/.test(s) ? cond : null;
  }
  if (j === i + 1) { ctx.specs.length = k0; ctx.last = saveLast; return null; }
  if (t[1]) ab.effects.push({ k: 'may', effects: out, text: sents[i] } as any); else ab.effects.push(...out);
  return j - i - 1;
});

EXT.condEval.revealedIs = (s, c, you, self, ctx) => {
  const item: any = ctx?.item;
  const top = item?.exiledTop?.[item.exiledTop.length - 1];
  const card: any = top && s.cards[top];
  let ok = false;
  if (card) ok = matchesFilter(s, top, { ...c.filter, zone: card.zone }, you, self);
  return c.not ? !ok : ok;
};

// "Put it / that card into your hand / into your graveyard / onto the battlefield (tapped) / on the bottom of your library"
// — for a card named by an earlier sentence (the revealed / exiled top card).
EXT.rules.push([/^(?:you may )?put (it|that card|the revealed card) (into your hand|into (?:your|its owner's) graveyard|onto the battlefield(?: tapped)?(?: under your control)?|on the bottom of (?:your|its owner's) library|on top of (?:your|its owner's) library)$/, (m, ctx) => {
  if (!ctx.last || ctx.last.t !== 'exiledTop') return null;
  const d = m[2];
  const dest = /hand/.test(d) ? 'hand' : /graveyard/.test(d) ? 'graveyard' : /battlefield/.test(d) ? 'battlefield' : /bottom/.test(d) ? 'libraryBottom' : 'libraryTop';
  const eff = { k: 'ext', name: 'moveLast', what: ctx.last, dest, tapped: /tapped/.test(d) };
  return /^you may /.test(m[0]) ? [{ k: 'may', effects: [eff], text: m[0] }] : [eff];
}]);
EXT.effects.moveLast = ({ s, item, e, you, api }) => {
  for (const c of api.subjCards(s, item, e.what)) {
    if (!s.cards[c] || s.cards[c].zone === e.dest) continue;
    api.moveCard(s, c, e.dest, e.dest === 'battlefield' ? { controller: you, tapped: e.tapped } : {});
  }
  return 'done';
};
// "You draw cards equal to its power." / "Draw cards equal to that card's mana value."
EXT.rules.push([/^(?:you )?draws? cards equal to (.+)$/, (m, ctx) => {
  const n = parseAmtPhrase(m[1], ctx);
  return n == null ? null : [{ k: 'draw', n, who: { t: 'you' } }];
}]);

// "Look at the top card of your library." / "Look at the top N cards of target player's library." (information only)
EXT.seqs.push((sents, i, ctx, ab) => {
  const m = sents[i].match(/^look at the top (card|two cards|three cards|\d+ cards) of (your|target player's|target opponent's) library$/);
  if (!m) return null;
  const nx = sents[i + 1];
  // when later sentences do something with the cards, the dig parsers own it
  if (nx && !/^activate only/.test(nx) && /\b(them|it|its|that card|the rest|those cards|the card|this way)\b/.test(nx)) return null;
  const n = m[1] === 'card' ? 1 : ({ two: 2, three: 3 } as any)[m[1].split(' ')[0]] ?? +m[1].split(' ')[0];
  const who = m[2] === 'your' ? { t: 'you' } : parsePlayerSubject(m[2].replace(/'s$/, ''), ctx);
  if (!who) return null;
  ab.effects.push({ k: 'ext', name: 'lookTop', n, who } as any);
  return 0;
});
EXT.effects.lookTop = ({ s, item, e, r, you, api }) => {
  if (r.sub) return 'done';
  const cards: string[] = [];
  for (const p of api.subjPlayers(s, item, e.who)) cards.push(...s.players[p].library.slice(0, e.n));
  if (!cards.length) return 'done';
  r.sub = {};
  api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'chooseCards', title: `${item.label}: the top of the library (look only)`, cards, min: 0, max: 0, data: { ctx: 'resolve' } });
  (s.prompt as any).looked = cards;
  return 'wait';
};

// ---- "Reveal/Exile cards from the top of your library until you reveal/exile a nonland card." + sentences about it ----
// (the dig plugin takes the simple "put that card into your hand and the rest on the bottom" shape first)
const UNTIL = /^(reveal|exile) cards from the top of your library until you (?:reveal|exile) (?:an|a) (.+?)(?: card)?$/;
const REST_RE = /^(?:then )?put (all cards revealed this way|the revealed cards|the rest|all other cards revealed this way|the other revealed cards|the exiled cards not cast this way|the rest of the exiled cards|all other cards exiled this way) on the bottom of your library(?: in (?:a random|any) order)?$/;
EXT.seqs.push((sents, i, ctx, ab) => {
  const a = sents[i].match(UNTIL);
  if (!a) return null;
  const ph = a[2].replace(/ cards?$/, '');
  const f = ph === 'card' ? {} : (looseFilter(ph) ?? parseFilter(ph));
  if (!f) return null;
  const filter: any = { ...f };
  delete filter.zone;
  const k0 = ctx.specs.length;
  const saveLast = ctx.last;
  const out: any[] = [{ k: 'ext', name: 'untilHit', filter, exile: a[1] === 'exile' }];
  let j = i + 1;
  let lastCond: any = null;
  for (; j < sents.length; j++) {
    let s = sents[j].replace(/^then /, '');
    if (/^activate only/.test(s)) break;
    let m: RegExpMatchArray | null;
    if ((m = s.match(REST_RE))) { out.push({ k: 'ext', name: 'untilRest', all: /^(all cards revealed|the revealed cards)/.test(m[1]) }); continue; }
    // "Put that card into your hand and the rest on the bottom of your library in a random order."
    if ((m = s.match(/^put (?:that card|it|the nonland card|the exiled card) (into your hand|onto the battlefield(?: tapped)?) and the rest on the bottom of your library(?: in (?:a random|any) order)?$/))) {
      out.push({ k: 'ext', name: 'moveLast', what: { t: 'exiledTop' }, dest: m[1] === 'into your hand' ? 'hand' : 'battlefield', tapped: /tapped/.test(m[1]) }, { k: 'ext', name: 'untilRest' });
      continue;
    }
    let cond: any = null;
    if ((m = s.match(/^otherwise, (.+)$/)) && lastCond) { cond = { ...lastCond, not: !lastCond.not }; s = m[1]; }
    else if ((m = s.match(/^if you don't(?: cast it| cast that card)?, (.+)$/)) && out.some((e) => e.name === 'castExiledFree')) { cond = { k: 'ext', name: 'notCastFree' }; s = m[1]; }
    // "that creature" = the creature chosen earlier ("choose target creature"); "that card" = the revealed card
    if (/\bthat creature\b/.test(s) && ctx.named?.['the creature']) s = s.replace(/\bthat creature\b/g, 'the creature');
    else if (/\bthat creature\b/.test(s)) break;
    ctx.last = { t: 'exiledTop' } as any;
    const effs = parseSentence(s.replace(/\bthe revealed card\b|\bthe nonland card\b|\bthe exiled card\b/g, 'that card').replace(/\b(?:that card's|its) (mana value|power|toughness)\b/g, "the revealed top card's $1"), ctx);
    if (!effs || effs.some((e: any) => e.k === 'manual')) break;
    if (cond) out.push({ k: 'if', cond, effects: effs }); else out.push(...effs);
    lastCond = null;
  }
  if (j === i + 1) { ctx.specs.length = k0; ctx.last = saveLast; return null; }
  ab.effects.push(...out);
  return j - i - 1;
});
EXT.effects.untilHit = ({ s, item, e, you, api }) => {
  const lib: string[] = s.players[you].library;
  const seen: string[] = [];
  let hit: string | undefined;
  for (const c of [...lib]) {
    seen.push(c);
    if (api.matchesFilter(s, c, { ...e.filter, zone: 'library' }, you)) { hit = c; break; }
  }
  api.log(s, `${api.pname(s, you)} ${e.exile ? 'exiles' : 'reveals'} ${seen.map((c) => api.nm(s, c)).join(', ') || 'nothing'}${hit || !seen.length ? '' : ' (no match)'}.`, you);
  if (e.exile) for (const c of seen) api.moveCard(s, c, 'exile');
  (item as any).exiledTop = hit ? [hit] : [];
  (item as any).untilSeen = seen;
  (item as any).untilExile = !!e.exile;
  return 'done';
};
EXT.effects.untilRest = ({ s, item, e, api }) => {
  const hit = ((item as any).exiledTop ?? [])[0];
  const zone = (item as any).untilExile ? 'exile' : 'library';
  const rest = (((item as any).untilSeen ?? []) as string[]).filter((c) => s.cards[c]?.zone === zone && (e.all || c !== hit || (zone === 'exile' && s.cards[c]?.zone === 'exile' && (item as any).untilExile)));
  api.shuffleArr(s, rest);
  for (const c of rest) api.moveCard(s, c, 'libraryBottom');
  return 'done';
};
EXT.condEval.notCastFree = (s, _c, _you, _self, ctx) => {
  const hit = ctx?.item?.exiledTop?.[0];
  return !hit || s.cards[hit]?.zone !== 'stack' && (s as any).lastFreeCast !== hit;
};

EXT.amountPhrases.push((ph) => {
  const m = ph.match(/^the revealed top card's (mana value|power|toughness)$/);
  if (!m) return null;
  const k = m[1] === 'mana value' ? 'cmc' : m[1];
  return { [k]: { t: 'exiledTop' } };
});

// Kinship (Morningtide): "you may look at the top card of your library. If it shares a creature type with ~, you may
// reveal it. If you do, X."
EXT.seqs.push((sents, i, ctx, ab) => {
  if (!/^(?:you may )?look at the top card of your library$/.test(sents[i])) return null;
  if (!/^if it shares a creature type with ~, you may reveal it$/.test(sents[i + 1] ?? '')) return null;
  const m = (sents[i + 2] ?? '').match(/^if you do, (.+)$/);
  if (!m) return null;
  const k0 = ctx.specs.length;
  const save = ctx.last;
  ctx.last = { t: 'exiledTop' } as any;
  const body = parseSentence(m[1].replace(/^this creature /, '~ ').replace(/\b(?:that card's|its) (mana value|power|toughness)\b/g, "the revealed top card's $1"), ctx);
  ctx.last = save;
  if (!body || body.some((e: any) => e.k === 'manual')) { ctx.specs.length = k0; return null; }
  ab.effects.push({ k: 'ext', name: 'topRef' } as any, { k: 'if', cond: { k: 'ext', name: 'kinship' }, effects: [{ k: 'may', effects: body, text: 'reveal it' }] } as any);
  return 2;
});
EXT.effects.topRef = ({ s, item, you }) => { const t = s.players[you].library[0]; (item as any).exiledTop = t ? [t] : []; return 'done'; };
EXT.condEval.kinship = (s, _c, _you, self, ctx) => {
  const top = ctx?.item?.exiledTop?.[0];
  if (!top || !self || !s.cards[top]) return false;
  const tl = (s.defs[s.cards[top].defId].typeLine ?? '').toLowerCase();
  const subs = new Set((tl.split(' — ')[1] ?? '').split(/\s+/).filter(Boolean));
  const topChangeling = /\bchangeling\b/i.test(s.defs[s.cards[top].defId].oracle ?? '') && /\b(creature|kindred|tribal)\b/.test(tl);
  if (!/\b(creature|kindred|tribal)\b/.test(tl)) return false;
  const mine = matchSubs(s, self);
  if (topChangeling && mine.size) return true;
  return [...subs].some((x) => mine.has(x) || mine.has('*'));
};
const matchSubs = (s: any, self: string): Set<string> => {
  const c = s.cards[self];
  const ch = c?.zone === 'battlefield' ? (chars as any)(s, self) : null;
  const out = new Set<string>(ch ? [...ch.subtypes] : []);
  if (ch?.keywords?.has('changeling')) out.add('*');
  return out;
};

// Parley: "Each player reveals the top card of their library. For each nonland card revealed this way, X. Then each player draws a card."
EXT.seqs.push((sents, i, ctx, ab) => {
  if (!/^each player reveals the top card of their library$/.test(sents[i])) return null;
  const m = (sents[i + 1] ?? '').match(/^for each (nonland|land|creature|noncreature|nonland permanent) card revealed this way, (.+)$/);
  if (!m) return null;
  const f = looseFilter(m[1]);
  if (!f) return null;
  const k0 = ctx.specs.length;
  const body = parseSentence(m[2], ctx);
  if (!body || body.some((e: any) => e.k === 'manual')) { ctx.specs.length = k0; return null; }
  ab.effects.push({ k: 'ext', name: 'parley', filter: { ...f, zone: undefined } } as any, { k: 'ext', name: 'repeatN', n: { ext: 'parleyCount' }, effects: body } as any);
  return 1;
});
EXT.effects.parley = ({ s, item, e, api }) => {
  let n = 0;
  for (const p of [s.active, 1 - s.active]) {
    const top = s.players[p].library[0];
    if (!top) continue;
    api.log(s, `${api.pname(s, p)} reveals ${api.nm(s, top)}.`, p);
    if (api.matchesFilter(s, top, { ...e.filter, zone: 'library' }, p)) n++;
  }
  (item as any).parleyCount = n;
  return 'done';
};
EXT.amounts.parleyCount = (_s, _a, _you, _self, ctx) => ctx?.item?.parleyCount ?? 0;
EXT.effects.repeatN = ({ s, item, e, r, api }) => {
  const n = Math.max(0, api.amount(s, item, e.n));
  const copies: any[] = [];
  for (let k = 0; k < n; k++) copies.push(...JSON.parse(JSON.stringify(e.effects)));
  item.effects.splice(r.i + 1, 0, ...copies);
  return 'done';
};
