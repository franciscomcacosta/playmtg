// Plugin: Commander format (rules 903) and commander-related card text.
import { EXT } from '../ext';
import type { CardDef } from '../cardTypes';
import type { GameState, PlayerIdx } from '../types';

const isCommanderFmt = (s: GameState) => (s as any).format === 'commander';

// 903.9: if a commander would be put into a graveyard or exile (SBA) or into a hand or library (replacement),
// its owner may put it into the command zone instead. We ask right after the move.
EXT.hooks.afterMove.push((s, iid, from, to, _opts, api) => {
  const c = s.cards[iid] as any;
  if (!c?.isCommander || !isCommanderFmt(s) || from === to) return;
  if (!['graveyard', 'exile', 'hand', 'library', 'libraryTop', 'libraryBottom'].includes(to)) return;
  const item: any = {
    id: api.uid(s, 's'), kind: 'trigger', controller: c.owner, source: iid,
    label: `${api.nm(s, iid)} — return to the command zone?`, text: 'Commander', effects: [{ k: 'ext', name: 'commanderReturn', iid }], targets: [],
  };
  item.preTargeted = true;
  s.pendingTriggers.push(item);
});

EXT.effects.commanderReturn = ({ s, e, r, api }) => {
  const c = s.cards[e.iid] as any;
  if (!c || c.zone === 'command' || c.zone === 'battlefield' || c.zone === 'stack') return 'done';
  if (r.sub?.answered === 'yes') {
    api.moveCard(s, e.iid, 'command');
    api.log(s, `${api.nm(s, e.iid)} returns to the command zone.`, c.owner);
    return 'done';
  }
  if (r.sub?.answered === 'no') return 'done';
  r.sub = {};
  const where = c.zone === 'graveyard' ? 'the graveyard' : c.zone === 'exile' ? 'exile' : c.zone === 'hand' ? 'your hand' : 'your library';
  api.pushPrompt(s, { id: api.uid(s, 'p'), player: c.owner, kind: 'yesno', title: `Move your commander ${api.nm(s, e.iid)} from ${where} to the command zone?`, options: [{ id: 'yes', label: 'Command zone' }, { id: 'no', label: `Leave it in ${where}` }], cards: [e.iid], data: { ctx: 'resolve' } });
  return 'wait';
};

// 903.10a: 21 or more combat damage from a single commander → that player loses.
EXT.hooks.sba.push((s, api) => {
  if (!isCommanderFmt(s)) return false;
  let changed = false;
  for (const p of s.players) {
    if (p.lost) continue;
    const cd = (p as any).commanderDamage ?? {};
    const src = Object.keys(cd).find((k) => cd[k] >= 21);
    if (src) {
      p.lost = true;
      changed = true;
      api.log(s, `${p.name} has taken 21 combat damage from ${api.nm(s, src)} and loses the game.`, p.idx, 'turn');
    }
  }
  return changed;
});

// "if you control your commander" / "as long as you control your commander" (lieutenant etc.)
EXT.conds.push((t) => (/^you control (?:your|a) commander$/.test(t) ? { k: 'ext', name: 'controlCommander' } : null));
EXT.condEval.controlCommander = (s, _c, you) => s.battlefield.some((b) => s.cards[b].controller === you && (s.cards[b] as any).isCommander);
// "for each time you've cast your commander from the command zone this game"
EXT.conds.push((t) => (/^you've cast your commander from the command zone this game$/.test(t) ? { k: 'ext', name: 'castCommander' } : null));
EXT.condEval.castCommander = (s, _c, you) => Object.values(((s.players[you] as any).commanderCasts ?? {}) as Record<string, number>).some((n) => n > 0);

// ------------------------------------------------------------------------------------------
// Deck validation (903.5): 100 cards including commanders, singleton except basic lands and
// "any number" cards, every card within the commanders' color identity, legal pairings.
// ------------------------------------------------------------------------------------------
const BASICS = /^(plains|island|swamp|mountain|forest|wastes|snow-covered (?:plains|island|swamp|mountain|forest))$/i;
export function canBeCommander(d: CardDef): boolean {
  const tl = (d.faces?.[0]?.typeLine ?? d.typeLine).toLowerCase();
  const text = (d.oracle ?? '').toLowerCase();
  return (/\blegendary\b/.test(tl) && (/\bcreature\b/.test(tl) || /\bvehicle\b|\bspacecraft\b/.test(tl))) || /can be your commander/.test(text) || /\bbackground\b/.test(tl);
}
function pairingOk(a: CardDef, b: CardDef): boolean {
  const ta = (a.oracle ?? '').toLowerCase();
  const tb = (b.oracle ?? '').toLowerCase();
  const pw = (x: string, other: CardDef) => new RegExp(`partner with ${other.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(x);
  if (pw(ta, b) && pw(tb, a)) return true;
  if (/^partner\b|\npartner\b|\bpartner(?: \(|$)/m.test(ta) && /^partner\b|\npartner\b|\bpartner(?: \(|$)/m.test(tb) && !/partner with/.test(ta + tb)) return true;
  if (/friends forever/.test(ta) && /friends forever/.test(tb)) return true;
  const bg = (x: CardDef) => /\bbackground\b/i.test(x.typeLine);
  if ((/choose a background/.test(ta) && bg(b)) || (/choose a background/.test(tb) && bg(a))) return true;
  if ((/doctor's companion/.test(ta) && /\bdoctor\b/i.test(b.typeLine)) || (/doctor's companion/.test(tb) && /\bdoctor\b/i.test(a.typeLine))) return true;
  return false;
}
export function validateCommanderDeck(main: CardDef[], commanders: CardDef[]): string[] {
  const errs: string[] = [];
  if (!commanders.length) errs.push('Choose a commander (put it under a "Commander" heading in the deck list).');
  if (commanders.length > 2) errs.push('A deck can have at most two commanders.');
  for (const c of commanders) if (!canBeCommander(c)) errs.push(`${c.name} can't be your commander.`);
  if (commanders.length === 2 && !pairingOk(commanders[0], commanders[1])) errs.push(`${commanders[0].name} and ${commanders[1].name} can't be commanders together (partner / background / friends forever).`);
  const total = main.length + commanders.length;
  if (total !== 100) errs.push(`A Commander deck has exactly 100 cards (yours has ${total}).`);
  const identity = new Set(commanders.flatMap((c) => c.colorIdentity ?? []));
  const counts = new Map<string, number>();
  for (const d of [...main, ...commanders]) counts.set(d.name, (counts.get(d.name) ?? 0) + 1);
  for (const [name, n] of counts) {
    if (n <= 1) continue;
    const d = main.find((x) => x.name === name)!;
    if (BASICS.test(name) || /a deck can have any number of cards named/i.test(d?.oracle ?? '')) continue;
    const limit = /a deck can have up to (\w+) cards named/i.exec(d?.oracle ?? '');
    const W: Record<string, number> = { seven: 7, nine: 9 };
    if (limit && n <= (W[limit[1].toLowerCase()] ?? +limit[1])) continue;
    errs.push(`Singleton: ${name} appears ${n} times.`);
  }
  for (const d of main) {
    const out = (d.colorIdentity ?? []).filter((c) => !identity.has(c));
    if (out.length) errs.push(`${d.name} is outside your commander's color identity.`);
  }
  return [...new Set(errs)].slice(0, 20);
}

// Players' own names for the view
EXT.hooks.view.push((s: GameState, _viewer: PlayerIdx | null, view: any) => {
  if (!isCommanderFmt(s)) return;
  view.commanderTaxes = s.players.map((p) => {
    const casts = ((p as any).commanderCasts ?? {}) as Record<string, number>;
    return Object.fromEntries(Object.entries(casts).map(([k, v]) => [k, 2 * v]));
  });
});
