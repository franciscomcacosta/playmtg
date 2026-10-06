// Plugin: soulbond (CR 702.95) and pairing.
//  - "Soulbond": when this enters or another creature enters under your control, you may pair them (both unpaired).
//  - "As long as ~ is paired with another creature, both creatures have K / each of those creatures has "…" / gets +N/+N"
//    Stored as pc.pairGrants (text granted to both creatures); rules.ts adds it while the pair is valid (pairedWith).
//  - Myriad (702.116) does nothing in a two-player game (there is no opponent other than the defending player).
import { EXT } from '../ext';
import { automationLevel, parseCard } from '../oracle';
import { pairedWith } from '../rules';

const probeOk = (text: string) => automationLevel(parseCard({ id: `pair-probe:${text}`, name: 'Granted', manaCost: '', cmc: 0, typeLine: 'Creature', oracle: text, colors: [], colorIdentity: [], keywords: [], layout: 'normal' } as any) as any) === 'full';

EXT.lines.push((line, pc) => {
  if (line === 'myriad') { pc.keywords.push('myriad'); return true; }
  if (line !== 'soulbond') return false;
  pc.keywords.push('soulbond');
  const ab = (who: string) => ({ text: 'soulbond', effects: [{ k: 'ext', name: 'soulbondPair', who }], specs: [], manual: [] });
  pc.triggers.push({ event: 'etb', text: 'soulbond', ability: ab('self') } as any);
  pc.triggers.push({ event: 'otherEtb', filter: { types: ['creature'], other: true, controller: 'you' }, text: 'soulbond', ability: ab('other') } as any);
  return true;
});

EXT.lines.push((line, pc) => {
  const m = line.match(/^as long as ~ is paired with another creature, (?:both creatures have (.+)|each of those creatures has "(.+?)"?|each of those creatures gets ([+-]\d+)\/([+-]\d+)(?: and has (.+))?)$/);
  if (!m) return false;
  const texts: string[] = [];
  if (m[1]) texts.push(m[1]);
  if (m[2]) texts.push(m[2].replace(/(^|\s)'|'(?=\s|$|[.,:])/g, (q: string) => q.replace("'", '"')));
  if (m[3]) texts.push(`~ gets ${m[3]}/${m[4]}`);
  if (m[5]) texts.push(m[5]);
  if (!texts.every(probeOk)) return false;
  (pc.pairGrants ??= []).push(...texts);
  return true;
});

const validPair = (s: any, a: string) => pairedWith(s, a);

EXT.effects.soulbondPair = ({ s, item, e, r, you, api }) => {
  const self = item.source;
  const sc: any = s.cards[self];
  if (!sc || sc.zone !== 'battlefield' || sc.controller !== you || validPair(s, self)) return 'done';
  const isCre = (x: string) => s.cards[x]?.zone === 'battlefield' && api.chars(s, x).types.has('creature');
  if (!isCre(self)) return 'done';
  let cands: string[];
  if (e.who === 'other') {
    const o = (item as any).triggerObj;
    cands = o && o !== self && isCre(o) && s.cards[o].controller === you && !validPair(s, o) ? [o] : [];
  } else cands = s.battlefield.filter((x: string) => x !== self && isCre(x) && s.cards[x].controller === you && !validPair(s, x));
  if (!cands.length) return 'done';
  if (!r.sub) {
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'chooseCards', title: `${item.label}: pair with a creature? (soulbond)`, cards: cands, min: 0, max: 1, data: { ctx: 'resolve' } });
    return 'wait';
  }
  const pick = (r.sub.answer ?? [])[0];
  if (pick && cands.includes(pick)) {
    sc.pairedWith = pick;
    (s.cards[pick] as any).pairedWith = self;
    api.log(s, `${api.nm(s, self)} is paired with ${api.nm(s, pick)}.`, you);
  }
  return 'done';
};


// Enlist (702.154): as it attacks, you may tap a non-attacking creature you control that could attack (no summoning
// sickness, or haste); when you do, it gets +X/+0 until end of turn, X = the tapped creature's power.
// Modelled as an attack trigger that offers the choice right after attackers are declared.
EXT.lines.push((line, pc) => {
  if (line !== 'enlist') return false;
  pc.keywords.push('enlist');
  pc.triggers.push({ event: 'attacks', text: 'enlist', ability: { text: 'enlist', effects: [{ k: 'ext', name: 'enlist' }], specs: [], manual: [] } } as any);
  return true;
});
EXT.effects.enlist = ({ s, item, r, you, api }) => {
  const self = item.source;
  if (s.cards[self]?.zone !== 'battlefield') return 'done';
  const attacking = new Set((s.combat?.attackers ?? []).map((a: any) => a.iid));
  const cands = s.battlefield.filter((x: string) => {
    const c: any = s.cards[x];
    if (x === self || c.controller !== you || c.tapped || attacking.has(x)) return false;
    const ch = api.chars(s, x);
    return ch.types.has('creature') && (!c.sick || ch.keywords.has('haste'));
  });
  if (!cands.length) return 'done';
  if (!r.sub) {
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'chooseCards', title: `${item.label}: enlist a creature? (tap it; this gets +X/+0)`, cards: cands, min: 0, max: 1, data: { ctx: 'resolve' } });
    return 'wait';
  }
  const pick = (r.sub.answer ?? [])[0];
  if (!pick || !cands.includes(pick)) return 'done';
  (s.cards[pick] as any).tapped = true;
  const pw = Math.max(0, api.chars(s, pick).power ?? 0);
  if (pw) (s.cards[self] as any).mods.push({ power: pw, toughness: 0, until: 'eot', ts: s.ts++ });
  api.log(s, `${api.nm(s, self)} enlists ${api.nm(s, pick)} (+${pw}/+0).`, you);
  return 'done';
};
