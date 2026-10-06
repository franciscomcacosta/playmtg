// Plugin: more single-line shapes.
//  - "You may play lands from your graveyard." (Crucible of Worlds, Ramunap Excavator) — permission checked in engine.ts
//  - "~ deals damage to target creature equal to the number of lands you control." → rewritten to the X form
//  - "It endures N." (put N +1/+1 counters on it, or create an N/N white Spirit creature token)
//  - "Search its controller's graveyard, hand, and library for all cards with the same name as that spell and exile
//     them. That player shuffles." (Counterbore, Eradicate, Quash, Scour, Crumble to Dust)
//  - "Exile the top two cards of your library. (Then) choose one of them. You may play that card this turn."
import { EXT } from '../ext';
import { parseSentence } from '../oracle';
import { hasName } from './naming';

EXT.lines.push((line, pc) => {
  if (!/^you may play lands from your graveyard$/.test(line)) return false;
  pc.playLandsFromGy = true;
  return true;
});

EXT.rules.push([/^(~) deals damage to (.+?) equal to (.+)$/, (m, ctx) => {
  // Only self-contained amounts: anything pointing back at another object ("its power", "that card's mana value",
  // "cards revealed this way") would be misread as the spell itself.
  if (/where x is|\bits\b|\bthat (?:card|creature|spell|permanent)'s|\bthe (?:creature|card|discarded card|sacrificed creature)'s|\bthose\b|this way|difference|and you gain/.test(m[3])) return null;
  return parseSentence(`${m[1]} deals x damage to ${m[2]}, where x is ${m[3]}`, ctx);
}]);

// ---- endure ----
const W: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
EXT.rules.push([/^(~|it|that creature|target creature you control) endures (\d+|x|one|two|three)$/, (m, ctx) => {
  const n = m[2] === 'x' ? 'X' : /^\d+$/.test(m[2]) ? +m[2] : W[m[2]];
  if (n === undefined) return null;
  return [{ k: 'ext', name: 'endure', n, what: m[1] === '~' ? { t: 'self' } : ctx.last ?? { t: 'self' } }];
}]);
EXT.effects.endure = ({ s, item, e, r, you, api }) => {
  const n = api.amount(s, item, e.n);
  const who = api.subjCards(s, item, e.what).find((c: string) => s.cards[c]?.zone === 'battlefield');
  const token = () => api.createToken(s, you, { name: 'Spirit', power: String(n), toughness: String(n), colors: ['W'], types: 'Creature — Spirit', keywords: [], oracle: '' });
  if (!who) { if (n > 0) token(); return 'done'; }
  if (!r.sub) {
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'yesno', title: `${api.nm(s, who)} endures ${n}`, options: [{ id: 'yes', label: `${n} +1/+1 counter${n === 1 ? '' : 's'} on it` }, { id: 'no', label: `Create a ${n}/${n} Spirit` }], data: { ctx: 'resolve' } });
    return 'wait';
  }
  if (r.sub.answered === 'yes') api.addCounters(s, who, '+1/+1', n);
  else if (n > 0) token();
  return 'done';
};

// ---- same name as the target ----
EXT.seqs.push((sents, i, _ctx, ab) => {
  const m = sents[i].match(/^search its (?:controller's|owner's) graveyard, hand, and library for (all|any number of) cards with the same name as that (?:spell|creature|land|enchantment|artifact|permanent|card) and exile them$/);
  if (!m) return null;
  ab.effects.push({ k: 'ext', name: 'sameNameExile', upTo: m[1] !== 'all' });
  return /^(?:then )?that player shuffles(?: their library)?$/.test(sents[i + 1] ?? '') ? 1 : 0;
});
EXT.effects.sameNameExile = ({ s, item, e, r, you, api }) => {
  const t = (item.targets ?? []).flat().find((x: any) => x?.kind === 'card' || x?.kind === 'stack') as any;
  const iid = t?.kind === 'card' ? t.iid : t?.kind === 'stack' ? (item as any).targetStackSource ?? s.stack.find((x) => x.id === t.id)?.source : undefined;
  if (!iid || !s.cards[iid]) return 'done';
  const name = s.defs[s.cards[iid].defId].name;
  const p = s.cards[iid].owner;
  const pl = api.P(s, p);
  const all = [...pl.graveyard, ...pl.hand, ...pl.library].filter((c: string) => hasName(s, c, name));
  if (e.upTo && !r.sub && all.length) {
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'chooseCards', title: `Exile any number of cards named ${name}`, cards: all, min: 0, max: all.length, data: { ctx: 'resolve' } });
    return 'wait';
  }
  const pick: string[] = e.upTo ? (r.sub?.answer ?? []) : all;
  for (const c of pick) if (s.cards[c] && ['graveyard', 'hand', 'library'].includes(s.cards[c].zone)) api.moveCard(s, c, 'exile');
  if (pick.length) api.log(s, `${pick.length} card${pick.length > 1 ? 's' : ''} named ${name} exiled.`, you);
  api.shuffleArr(s, pl.library);
  return 'done';
};

// ---- exile two, choose one, may play it ----
EXT.seqs.push((sents, i, _ctx, ab) => {
  const a = sents[i].match(/^exile the top (two|three) cards of your library(?:, then choose one of them)?$/);
  if (!a) return null;
  let used = 0;
  if (!/choose one/.test(sents[i])) {
    if (!/^(?:then )?choose one of them$/.test(sents[i + 1] ?? '')) return null;
    used = 1;
  }
  const b = sents[i + 1 + used]?.match(/^(?:until end of turn, )?you may play (?:that card|it)(?: this turn| until end of turn| until the end of your next turn)?$/);
  if (!b) return null;
  ab.effects.push({ k: 'ext', name: 'exileChoosePlay', n: W[a[1]], untilNext: /next turn/.test(b[0]) });
  return used + 1;
});
EXT.effects.exileChoosePlay = ({ s, item, e, r, you, api }) => {
  if (!r.sub) {
    const lib = api.P(s, you).library as string[];
    const got = lib.slice(0, e.n);
    for (const c of got) api.moveCard(s, c, 'exile');
    if (!got.length) return 'done';
    r.sub = { got };
    if (got.length === 1) { r.sub.answer = got; }
    else {
      api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'chooseCards', title: `${item.label}: choose one — you may play it ${e.untilNext ? 'until the end of your next turn' : 'this turn'}`, cards: got, min: 1, max: 1, data: { ctx: 'resolve' } });
      const keep = r.sub; // the resolve answer lands on r.sub.answer
      void keep;
      return 'wait';
    }
  }
  const c = (r.sub.answer ?? [])[0];
  if (c && s.cards[c]?.zone === 'exile') s.cards[c].mayPlay = { player: you, untilTurn: s.turn + (e.untilNext ? 2 : 0) };
  return 'done';
};

// "You may have ~ assign its combat damage as though it weren't blocked." (Thorn Elemental, Rhox, Lone Wolf)
// — the choice itself is asked in engine.ts combatDamage.
EXT.lines.push((line, pc) => {
  if (!/^you may have ~ assign its combat damage as though it weren't blocked$/.test(line)) return false;
  pc.unblockedOption = true;
  return true;
});
