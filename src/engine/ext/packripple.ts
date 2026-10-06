// Plugin: "that land's controller", pack tactics, ripple.
//  - "~ deals 2 damage to that land's controller." (Ankh of Mishra, Cryoclasm)
//  - "…, if you attacked with creatures with total power 6 or greater this combat, …" (pack tactics)
//  - "Ripple 4": when you cast it, you may reveal the top four cards; cast any with the same name for free; rest on the bottom.
import { EXT } from '../ext';
import { hasName } from './naming';
import { chars } from '../rules';

const W: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };

EXT.rules.push([/^(~|it) deals (\d+) damage to that (land|creature|permanent|artifact)'s controller$/, (m, ctx) => [{ k: 'ext', name: 'dmgObjCtrl', n: +m[2], what: ctx.last ?? { t: 'target', spec: 0 } }]]);
EXT.effects.dmgObjCtrl = ({ s, item, e, you, api }) => {
  let c = api.subjCards(s, item, e.what)[0];
  if (!c) c = (item as any).triggerObj;
  if (!c) c = ((item.targets ?? []).flat().find((t: any) => t?.kind === 'card') as any)?.iid;
  if (!c || !s.cards[c]) return 'done';
  const p = s.cards[c].zone === 'battlefield' ? s.cards[c].controller : s.cards[c].owner;
  api.dealDamage(s, item.source, { kind: 'player', idx: p }, e.n, false);
  void you;
  return 'done';
};

// ---- pack tactics ----
EXT.conds.push((text) => {
  const m = text.match(/^you attacked with creatures with total power (\d+) or greater this combat$/);
  return m ? { k: 'ext', name: 'attackPower', n: +m[1] } : null;
});
EXT.condEval.attackPower = (s, cond, you, _self, _ctx) => {
  const dec = (s as any).attackDeclared;
  const ids: string[] = dec?.turn === s.turn ? dec.ids : (s.combat?.attackers ?? []).map((a) => a.iid);
  const total = ids.filter((i) => s.cards[i]?.zone === 'battlefield' && s.cards[i].controller === you).reduce((n, i) => n + Math.max(0, chars(s, i).power), 0);
  return total >= cond.n;
};

// ---- ripple ----
EXT.lines.push((line, pc) => {
  const m = line.match(/^ripple (\d+|one|two|three|four|five)$/);
  if (!m) return false;
  const n = /^\d+$/.test(m[1]) ? +m[1] : W[m[1]];
  pc.triggers.push({ event: 'selfCast', text: line, ability: { text: line, effects: [{ k: 'ext', name: 'ripple', n }], specs: [], manual: [] } });
  return true;
});
EXT.effects.ripple = ({ s, item, e, r, you, api }) => {
  const name = s.defs[s.cards[item.source]?.defId]?.name;
  if (!r.sub) {
    r.sub = { stage: 'ask' };
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'yesno', title: `Ripple ${e.n}: reveal the top ${e.n} cards of your library?`, options: [{ id: 'yes', label: 'Reveal' }, { id: 'no', label: "Don't" }], data: { ctx: 'resolve' } });
    return 'wait';
  }
  if (r.sub.stage === 'ask') {
    if (r.sub.answered !== 'yes') return 'done';
    const top: string[] = api.P(s, you).library.slice(0, e.n);
    api.log(s, `${api.pname(s, you)} reveals ${top.map((c) => api.nm(s, c)).join(', ') || 'nothing'} (ripple).`, you);
    const same = top.filter((c) => hasName(s, c, name));
    r.sub = { stage: 'pick', top, same };
    if (same.length) {
      api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'chooseCards', title: `Ripple: cast any copies of ${name} for free`, cards: same, min: 0, max: same.length, data: { ctx: 'resolve' } });
      return 'wait';
    }
  }
  const picked: string[] = r.sub.answer ?? [];
  const rest = (r.sub.top as string[]).filter((c) => !picked.includes(c) && s.cards[c]?.zone === 'library');
  for (const c of rest) api.moveCard(s, c, 'libraryBottom');
  // cast the chosen copies one at a time (each is its own cast); later ones wait in the trigger queue
  const [first, ...more] = picked.filter((c) => s.cards[c]?.zone === 'library');
  if (first) {
    api.moveCard(s, first, 'exile');
    const err = api.beginCast(s, you, first, 0, 'free');
    if (err) { api.log(s, `Couldn't cast ${api.nm(s, first)}: ${err}`, you, 'warn'); api.moveCard(s, first, 'libraryBottom'); }
  }
  for (const c of more) {
    api.moveCard(s, c, 'exile');
    const it: any = { id: api.uid(s, 's'), kind: 'trigger', controller: you, source: c, label: `Ripple — cast ${api.nm(s, c)}`, text: 'ripple', effects: [{ k: 'ext', name: 'castExiledNow', iid: c }], targets: [] };
    it.preTargeted = true;
    s.pendingTriggers.push(it);
  }
  return 'done';
};
EXT.effects.castExiledNow = ({ s, e, you, api }) => {
  if (s.cards[e.iid]?.zone !== 'exile') return 'done';
  const err = api.beginCast(s, you, e.iid, 0, 'free');
  if (err) { api.log(s, `Couldn't cast ${api.nm(s, e.iid)}: ${err}`, you, 'warn'); api.moveCard(s, e.iid, 'libraryBottom'); }
  return 'done';
};
