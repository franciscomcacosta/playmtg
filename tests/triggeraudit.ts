// Trigger audit over the REAL card database: for every card whose triggered ability watches OTHER objects
// (another creature entering or dying, a spell being cast, a land entering, life gain, card draw…),
// put it on the battlefield, make that event happen with a matching object, and check it triggered.
// Usage: npx tsx tests/triggeraudit.ts [maxCards] [--verbose]
import { readFileSync } from 'node:fs';
import { setup, add, lands, def, passUntil } from './helpers';
import { dispatch, api } from '../src/engine/engine';
import { parseCard } from '../src/engine/oracle';
import type { GameState, PlayerIdx } from '../src/engine/types';

const db = JSON.parse(readFileSync('data/cards.json', 'utf8'));
const MAX = +(process.argv[2] ?? 99999);
const verbose = process.argv.includes('--verbose');
const EVENTS = ['otherEtb', 'otherDies', 'castSpell', 'oppCastSpell', 'landfall', 'gainLife', 'drawCard', 'anyCast', 'toGraveyard', 'discard', 'lifeLostBy', 'selfDealt', 'dealsPlayer', 'combatDamagePlayer', 'attacks', 'youAttack', 'ctrlAttacks'];

const TYPE = (w: string) => w[0].toUpperCase() + w.slice(1);
/** A made-up object that matches a trigger's filter. */
function synth(f: any, kind: 'permanent' | 'spell'): any | null {
  if (!f) f = {};
  if (f.anyOf?.length) f = { ...f, ...f.anyOf[0] };
  const types: string[] = (f.types ?? ['creature']).filter((t: string) => !['spell', 'card', 'permanent'].includes(t));
  if (!types.length) types.push(kind === 'spell' && !(f.types ?? []).includes('permanent') ? 'instant' : 'creature');
  if (f.notTypes?.includes(types[0])) types[0] = ['artifact', 'enchantment', 'instant', 'sorcery', 'creature'].find((t) => !f.notTypes.includes(t))!;
  const t0 = types[0];
  if (kind === 'permanent' && (t0 === 'instant' || t0 === 'sorcery')) return null;
  const subs = (f.subtypes ?? []).slice(0, 1).map(TYPE);
  const tl = `${f.supertypes?.includes('legendary') || f.historic ? 'Legendary ' : ''}${f.supertypes?.includes('snow') ? 'Snow ' : ''}${f.allTypes?.length > 1 ? f.allTypes.filter((x: string) => x !== t0).map(TYPE).join(' ') + ' ' : ''}${TYPE(t0)}${subs.length ? ' — ' + subs.join(' ') : ''}`;
  const cols = f.colors?.length ? f.colors : f.multicolored ? ['W', 'U'] : f.colorless ? [] : ['G'];
  if (f.hasX) return def('Audit X', '{X}{R}', 'Instant', '', undefined, { cmc: 1, colors: ['R'] });
  const cost = f.colorless ? '{1}' : cols.map((c: string) => `{${c}}`).join('') + '{1}';
  const cmc = f.cmcMin ?? (f.cmcMax != null ? Math.min(1, f.cmcMax) : 2);
  const pt: [string, string] | undefined = t0 === 'creature' ? [String(Math.max(f.powerMin ?? 1, 1)), '3'] : undefined;
  const kw = f.keyword ? [TYPE(f.keyword)] : [];
  return def(`Audit ${tl}`, cmc >= 1 ? `{${Math.max(0, cmc - cols.length)}}${cols.map((c: string) => `{${c}}`).join('')}` : cost, tl, kw.join('\n'), pt, { cmc, colors: cols, keywords: kw });
}

const fired = (s: GameState, iid: string) => {
  const name = s.defs[s.cards[iid]?.defId]?.name ?? '§';
  return s.pendingTriggers.some((t) => t.source === iid) || s.stack.some((t) => t.source === iid && t.kind === 'trigger') || (s.pendingCast as any)?.source === iid
    || !!s.prompt && (s.prompt.title?.includes(name) || s.prompt.title?.includes(name.split(',')[0]))
    || s.log.slice(-6).some((l) => l.text.includes(name) && /trigger removed|puts a trigger/.test(l.text));
};

const stats: Record<string, { ok: number; fail: number; skip: number }> = {};
const fails: string[] = [];
let tested = 0;
const t0 = Date.now();
for (const d of db.cards) {
  if (tested >= MAX) break;
  if (d.layout === 'meld' || !d.legal?.includes('vintage')) continue;
  if (/\b(Instant|Sorcery|Land)\b/.test(d.typeLine.split(' // ')[0])) continue;
  const faces = d.faces?.length > 1 && !['split', 'adventure'].includes(d.layout) ? [d.faces[0]] : [undefined];
  const pc: any = parseCard(d, faces[0]);
  const trig = pc.triggers.find((t: any) => EVENTS.includes(t.event) && !t.cond && !t.level && !t.gate && !/first time each turn|only once each turn/.test(t.text ?? ''));
  if (!trig) continue;
  tested++;
  const ev = trig.event as string;
  const st = (stats[ev] ??= { ok: 0, fail: 0, skip: 0 });
  let verdict: boolean | null = null;
  try {
    const { s, ap, op } = setup(7 + tested);
    lands(s, ap, 10);
    lands(s, op, 10);
    const fromGy = /from your graveyard/.test(trig.text ?? '') && !/(?:card|cards) from your graveyard/.test(trig.text ?? '');
    const me = add(s, ap, d, fromGy ? 'graveyard' : 'battlefield');
    s.cards[me].sick = false;
    const f = trig.filter ?? {};
    const who: PlayerIdx = f.controller === 'opp' || f.controller === 'notYou' || ev === 'oppCastSpell' ? op : ap;
    s.pendingTriggers = [];
    switch (ev) {
      case 'otherEtb': {
        const o = synth(f, 'permanent');
        if (!o) break;
        const x = add(s, who, o, 'library');
        if (f.token) (s.cards[x] as any).token = true;
        api.moveCard(s, x, 'battlefield', { controller: who });
        verdict = fired(s, me);
        break;
      }
      case 'otherDies': case 'toGraveyard': {
        const o = synth(f, 'permanent');
        if (!o) break;
        const x = add(s, who, o, 'battlefield');
        s.pendingTriggers = [];
        api.moveCard(s, x, 'graveyard', { cause: 'destroy' });
        verdict = fired(s, me);
        break;
      }
      case 'castSpell': case 'oppCastSpell': case 'anyCast': {
        const o = synth(f, 'spell');
        if (!o) break;
        if (!/Instant/.test(o.typeLine)) o.oracle = (o.oracle ? o.oracle + '\n' : '') + 'Flash';
        const x = add(s, who, o, 'hand');
        s.priority = who;
        const err = dispatch(s, who, { type: 'cast', iid: x });
        if (err) { verdict = null; if (verbose) console.log('  cast failed', d.name, err); break; }
        verdict = fired(s, me);
        break;
      }
      case 'landfall': {
        const x = add(s, ap, db.cards.find((c: any) => c.name === 'Forest'), 'hand');
        dispatch(s, ap, { type: 'playLand', iid: x });
        verdict = fired(s, me);
        break;
      }
      case 'gainLife': api.gainLife(s, ap, 2); verdict = fired(s, me); break;
      case 'drawCard': api.drawCards(s, ap, 1); verdict = fired(s, me); break;
      case 'lifeLostBy': api.loseLife(s, trig.data?.who === 'you' ? ap : op, 2); verdict = fired(s, me); break;
      case 'discard': {
        const p = trig.data?.who === 'opp' ? op : ap;
        const x = add(s, p, db.cards.find((c: any) => c.name === 'Grizzly Bears'), 'hand');
        api.moveCard(s, x, 'graveyard', { cause: 'discard' });
        verdict = trig.data?.type ? null : fired(s, me);
        break;
      }
      case 'selfDealt': {
        if (!api.chars(s, me).types.has('creature')) break;
        api.dealDamage(s, me, { kind: 'card', iid: me }, 1, false);
        verdict = fired(s, me);
        break;
      }
      case 'attacks': case 'combatDamagePlayer': case 'dealsPlayer': case 'youAttack': case 'ctrlAttacks': {
        const af = ev === 'youAttack' ? trig.data?.filter ?? {} : f;
        const n = ev === 'youAttack' ? Math.max(1, trig.data?.min ?? 1) : 1;
        const attackers = ev === 'youAttack' || ev === 'ctrlAttacks' ? Array.from({ length: n }, () => add(s, ap, synth(af, 'permanent') ?? synth({}, 'permanent'), 'battlefield')) : [me];
        const attacker = attackers[0];
        if (!api.chars(s, attacker).types.has('creature')) break;
        for (const a of attackers) s.cards[a].sick = false;
        passUntil(s, () => s.prompt?.kind === 'declareAttackers' || s.step === 'main2', 60);
        if (s.prompt?.kind !== 'declareAttackers') break;
        const err = dispatch(s, ap, { type: 'answer', promptId: s.prompt.id, choice: attackers.map((iid) => ({ iid, target: { kind: 'player', idx: op } })) });
        if (err) break;
        if (ev === 'attacks' || ev === 'youAttack' || ev === 'ctrlAttacks') { verdict = fired(s, me); break; }
        // let it connect
        for (let i = 0; i < 200 && s.step !== 'main2' && !s.over; i++) {
          if (fired(s, me)) break;
          if (s.prompt) { const pr = s.prompt; dispatch(s, pr.player, { type: 'answer', promptId: pr.id, choice: pr.kind === 'declareBlockers' ? [] : pr.kind === 'yesno' ? 'yes' : pr.kind === 'targets' ? pr.targets!.slice(0, 1) : pr.kind === 'chooseCards' ? pr.cards!.slice(0, pr.min ?? 0) : null }); continue; }
          dispatch(s, s.priority, { type: 'pass' });
        }
        verdict = fired(s, me) || s.log.some((l) => l.text.includes(`${api.nm(s, me)}`) && /trigger/.test(l.text));
        break;
      }
    }
  } catch (e: any) {
    verdict = false;
    if (verbose) console.log('  crash', d.name, e.message);
  }
  if (verdict === null) st.skip++;
  else if (verdict) st.ok++;
  else { st.fail++; if (fails.length < 400) fails.push(`${ev} :: ${d.name} :: ${(trig.text ?? '').slice(0, 110)}`); }
}
console.log(`tested ${tested} cards in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.table(stats);
const total = Object.values(stats).reduce((a, b) => ({ ok: a.ok + b.ok, fail: a.fail + b.fail, skip: a.skip + b.skip }), { ok: 0, fail: 0, skip: 0 });
console.log(total);
console.log(fails.slice(0, +(process.env.SHOW ?? 40)).join('\n'));
