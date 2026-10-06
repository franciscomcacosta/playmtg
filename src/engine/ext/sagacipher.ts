// Plugin: read ahead (Sagas) and cipher.
//  - Read ahead: as the Saga enters, choose a chapter and start with that many lore counters. Chapters before it
//    don't trigger. (The core skips the usual first lore counter for these; this trigger sets the count.)
//  - Cipher: as the spell resolves you may exile it encoded on a creature you control. Whenever that creature deals
//    combat damage to a player, its controller may cast a copy of the encoded card without paying its mana cost.
//    APPROXIMATION: the copy is run as the cipher trigger's effect rather than cast onto the stack, so it doesn't
//    count as casting a spell (no prowess / "whenever you cast") and can't be countered as a spell.
import { EXT } from '../ext';
import type { GameState } from '../types';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

// ---- read ahead ----
EXT.lines.push((line, pc) => {
  if (line !== 'read ahead') return false;
  pc.readAhead = true;
  return true;
});
EXT.hooks.afterMove.push((s, iid, _from, to, _opts, api) => {
  if (to !== 'battlefield' || !s.cards[iid]) return;
  const pc = api.chars(s, iid).pc;
  if (!pc.readAhead || !pc.chapters?.length) return;
  api.queueTrigger(s, iid, s.cards[iid].controller, { event: 'readAheadEv', text: 'Read ahead', ability: { text: 'read ahead', effects: [{ k: 'ext', name: 'readAhead' }], specs: [], manual: [] } }, { noDouble: true });
});
EXT.effects.readAhead = ({ s, item, r, you, api }) => {
  const c = s.cards[item.source];
  if (!c || c.zone !== 'battlefield') return 'done';
  const max = Math.max(...api.chars(s, item.source).pc.chapters.flatMap((ch: any) => ch.n));
  if (!r.sub) {
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'mode', title: `${api.nm(s, item.source)}: read ahead — start on which chapter?`, options: Array.from({ length: max }, (_, i) => ({ id: String(i), label: `Chapter ${ROMAN[i + 1] ?? i + 1}` })), min: 1, max: 1, data: { ctx: 'resolve' } });
    return 'wait';
  }
  const n = +([].concat(r.sub.answer ?? ['0'])[0]) + 1;
  c.counters.lore = n - 1; // skipped chapters don't trigger
  api.addCounters(s, item.source, 'lore', 1);
  api.log(s, `${api.nm(s, item.source)} starts on chapter ${ROMAN[n] ?? n}.`, you);
  return 'done';
};

// ---- cipher ----
EXT.lines.push((line, pc) => {
  if (line !== 'cipher') return false;
  pc.cipher = true;
  return true;
});
EXT.hooks.finish.push((s, item, countered, api) => {
  if (countered || (item as any).isCopy || item.kind !== 'spell') return false;
  const c = s.cards[item.source];
  if (!c || !api.parsedFor(s, c).cipher) return false;
  const mine = s.battlefield.filter((b) => s.cards[b].controller === item.controller && api.chars(s, b).types.has('creature'));
  if (!mine.length) return false; // nothing to encode on: it goes to the graveyard as usual
  api.moveCard(s, item.source, 'exile');
  api.queueTrigger(s, item.source, item.controller, { event: 'cipherEncode', text: 'Cipher', ability: { text: 'cipher', effects: [{ k: 'ext', name: 'cipherEncode' }], specs: [], manual: [] } }, { noDouble: true });
  return true;
});
EXT.effects.cipherEncode = ({ s, item, r, you, api }) => {
  const card = s.cards[item.source];
  if (!card || card.zone !== 'exile') return 'done';
  const mine = s.battlefield.filter((b) => s.cards[b].controller === you && api.chars(s, b).types.has('creature'));
  if (!r.sub) {
    if (!mine.length) { api.moveCard(s, item.source, 'graveyard'); return 'done'; }
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'chooseCards', title: `Cipher: encode ${api.nm(s, item.source)} on a creature you control?`, cards: mine, min: 0, max: 1, data: { ctx: 'resolve' } });
    return 'wait';
  }
  const host = (r.sub.answer ?? [])[0];
  if (!host || !s.cards[host]) { api.moveCard(s, item.source, 'graveyard'); return 'done'; }
  (card as any).encodedOn = host;
  api.log(s, `${api.nm(s, item.source)} is encoded on ${api.nm(s, host)}.`, you);
  return 'done';
};
const encodedOn = (s: GameState, host: string) => Object.values(s.cards).filter((c: any) => c.zone === 'exile' && c.encodedOn === host).map((c) => c.iid);
EXT.hooks.event.push((s, name, d, api) => {
  if (name === 'leave') {
    for (const e of encodedOn(s, d.iid)) delete (s.cards[e] as any).encodedOn; // a new object: the encoding is gone
    return;
  }
  if (name !== 'dealt' || !d.combat || d.to?.kind !== 'player') return;
  const host = d.source as string;
  if (!s.cards[host] || s.cards[host].zone !== 'battlefield') return;
  for (const e of encodedOn(s, host)) {
    const spell = api.parsedFor(s, s.cards[e]).spell;
    if (!spell) continue;
    const ctrl = s.cards[host].controller;
    api.queueTrigger(s, host, ctrl, {
      event: 'cipherCopy',
      text: `Cipher — you may cast a copy of ${api.nm(s, e)}`,
      ability: { text: 'cipher copy', effects: [{ k: 'may', effects: JSON.parse(JSON.stringify(spell.effects)), text: `cast a copy of ${api.nm(s, e)}` }], specs: JSON.parse(JSON.stringify(spell.specs ?? [])), manual: [] },
    }, { noDouble: true });
    s.pendingTriggers[s.pendingTriggers.length - 1].label = `Cipher — copy of ${api.nm(s, e)}`;
  }
});
