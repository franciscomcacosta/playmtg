// Plugin: "choose a card name" and what refers back to it.
//  - "Choose a (nonland) card name." / "As ~ enters, choose a card name."
//  - "Target player reveals their hand and discards all cards with that name." (Cabal Therapy)
//  - "Search target opponent's graveyard, hand, and library for up to four cards with that name and exile them.
//     Then that player shuffles." (Cranial Extraction, Ancient Vendetta)
//  - "That player discards a card with that name. If they can't, you draw a card." (Brain Pry)
//  - "Reveal cards from the top of your library until you reveal a card with the chosen name. Put that card into
//     your hand and exile all other cards revealed this way." (Demonic Consultation)
import { EXT } from '../ext';
import { parsePlayerSubject } from '../oracle';
import type { GameState, PlayerIdx } from '../types';

const W: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
const WHO = '(target opponent|target player|each opponent|that player)';

/** Does a card have the given name? (split / double-faced cards match either half too) */
export function hasName(s: GameState, iid: string, name: string | undefined): boolean {
  if (!name || !s.cards[iid]) return false;
  const full = s.defs[s.cards[iid].defId].name.toLowerCase();
  const n = name.toLowerCase();
  return full === n || full.split(' // ').includes(n);
}
const named = (s: GameState, item: any): string | undefined => item.namedCard ?? (s.cards[item.source] as any)?.chosenName;

// ---- naming ----
EXT.rules.push([/^(?:then )?choose a (nonland )?card name$/, (m) => [{ k: 'ext', name: 'nameCard', nonland: !!m[1] }]]);
EXT.lines.push((line, pc) => {
  const m = line.match(/^as ~ enters, choose a (nonland )?card name$/);
  if (!m) return false;
  pc.triggers.push({ event: 'etb', text: line, ability: { text: line, effects: [{ k: 'ext', name: 'nameCard', nonland: !!m[1] }], specs: [], manual: [] } });
  return true;
});
EXT.effects.nameCard = ({ s, item, e, r, you, api }) => {
  if (!r.sub) {
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'cardName', title: `${item.label}: name a ${e.nonland ? 'nonland ' : ''}card`, data: { ctx: 'resolve', nonland: !!e.nonland } });
    return 'wait';
  }
  const n = String(r.sub.answer ?? '').trim();
  if (!n) return 'done';
  (item as any).namedCard = n;
  const src = s.cards[item.source];
  if (src && src.zone === 'battlefield') (src as any).chosenName = n;
  api.log(s, `${api.pname(s, you)} names ${n}.`, you);
  return 'done';
};

// ---- discard all with that name ----
EXT.rules.push([new RegExp(`^${WHO} reveals (?:their|his or her) hand and discards all cards with (?:that|the chosen) name$`), (m, ctx) => {
  const who = parsePlayerSubject(m[1], ctx);
  return who ? [{ k: 'ext', name: 'namedFrom', who, zones: ['hand'], n: 99, dest: 'discard', reveal: true }] : null;
}]);
// ---- search graveyard, hand, and library ----
EXT.seqs.push((sents, i, ctx, ab) => {
  const m = sents[i].match(new RegExp(`^search ${WHO.replace(')', "|target player)")}'s graveyard, hand, and library for (up to (\\w+)|all|any number of) cards with (?:that|the chosen) name and exile them$`));
  if (!m) return null;
  const who = parsePlayerSubject(m[1], ctx);
  const n = m[3] ? W[m[3]] : 99;
  if (!who || !n) return null;
  ab.effects.push({ k: 'ext', name: 'namedFrom', who, zones: ['graveyard', 'hand', 'library'], n, dest: 'exile', upTo: !!m[3], shuffle: true });
  return /^(?:then )?that player shuffles(?: their library)?$/.test(sents[i + 1] ?? '') ? 1 : 0;
});
// ---- Brain Pry ----
EXT.seqs.push((sents, i, ctx, ab) => {
  const m = sents[i].match(new RegExp(`^${WHO} reveals (?:their|his or her) hand$`));
  const a = (m ? sents[i + 1] : sents[i])?.match(/^(?:that player|they) discards? a card with (?:that|the chosen) name$/);
  if (!a) return null;
  const off = m ? 1 : 0;
  const b = sents[i + 1 + off]?.match(/^if (?:they|that player) can't, (.+)$/);
  const who = m ? parsePlayerSubject(m[1], ctx) : ctx.lastPlayer ?? { t: 'target', spec: 0 };
  if (!who) return null;
  const eff: any = { k: 'ext', name: 'namedFrom', who, zones: ['hand'], n: 1, dest: 'discard', reveal: true };
  if (b) {
    if (!/^you draw a card$/.test(b[1])) return null;
    eff.elseDraw = 1;
    ab.effects.push(eff);
    return off + 1;
  }
  ab.effects.push(eff);
  return off;
});
EXT.effects.namedFrom = ({ s, item, e, you, api }) => {
  const p: PlayerIdx | undefined = api.subjPlayers(s, item, e.who)[0];
  const name = named(s, item);
  if (p == null) return 'done';
  const pl = api.P(s, p);
  if (e.reveal) api.log(s, `${api.pname(s, p)} reveals their hand: ${pl.hand.map((h: string) => api.nm(s, h)).join(', ') || 'nothing'}.`, p);
  let left = e.n;
  let moved = 0;
  for (const z of e.zones as ('graveyard' | 'hand' | 'library')[]) {
    for (const c of [...pl[z]]) {
      if (left <= 0) break;
      if (!hasName(s, c, name)) continue;
      if (e.dest === 'discard') api.moveCard(s, c, 'graveyard', { cause: 'discard' });
      else api.moveCard(s, c, 'exile');
      left--; moved++;
    }
  }
  if (moved) api.log(s, `${moved} card${moved > 1 ? 's' : ''} named ${name} ${e.dest === 'discard' ? 'discarded' : 'exiled'}.`, you);
  if (e.shuffle) api.shuffleArr(s, pl.library);
  if (!moved && e.elseDraw) api.drawCards(s, you, e.elseDraw);
  return 'done';
};

// ---- Demonic Consultation ----
EXT.seqs.push((sents, i, _ctx, ab) => {
  if (!/^reveal cards from the top of your library until you reveal a card with (?:that|the chosen) name$/.test(sents[i])) return null;
  const m = sents[i + 1]?.match(/^put that card into your hand and (exile|put) all other cards revealed this way(?: (into your graveyard))?$/);
  if (!m) return null;
  ab.effects.push({ k: 'ext', name: 'revealNamed', rest: m[1] === 'exile' ? 'exile' : 'graveyard' });
  return 1;
});
EXT.effects.revealNamed = ({ s, item, e, you, api }) => {
  const name = named(s, item);
  const lib: string[] = api.P(s, you).library;
  const seen: string[] = [];
  let hit: string | undefined;
  for (const c of [...lib]) { seen.push(c); if (hasName(s, c, name)) { hit = c; break; } }
  api.log(s, `${api.pname(s, you)} reveals ${seen.length} card${seen.length === 1 ? '' : 's'}${hit ? ` and finds ${name}` : ` without finding ${name}`}.`, you);
  if (hit) api.moveCard(s, hit, 'hand');
  for (const c of seen) if (c !== hit && s.cards[c]?.zone === 'library') api.moveCard(s, c, e.rest);
  return 'done';
};

// "Then that player shuffles." on its own (after a search of their library)
EXT.rules.push([/^(?:then )?that player shuffles(?: their library)?$/, () => [{ k: 'ext', name: 'shuffleLast' }]]);
EXT.effects.shuffleLast = ({ s, item, you, api }) => {
  const p = (item as any).triggerPlayer ?? ((item.targets ?? []).flat().find((t: any) => t?.kind === 'player') as any)?.idx ?? api.opp(you);
  api.shuffleArr(s, api.P(s, p).library);
  return 'done';
};
