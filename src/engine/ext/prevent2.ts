// Plugin: "Prevent all (combat) damage …" (615) in its many shapes.
//  One-shot ("… this turn"):  prevent all damage that would be dealt to it / target creature / you / creatures you control this turn
//                             prevent all (combat) damage target creature would deal this turn / … dealt by creatures this turn
//                             prevent all combat damage that would be dealt to and dealt by target creature this turn
//  Static:                    prevent all damage that would be dealt by enchanted creature / to ~ by creatures / to you by …
//  A rule = { to, by, combat }: `to` and `by` are each a side — specific objects, a filter, or players.
import { EXT } from '../ext';
import { parseFilter, parseSubject } from '../oracle';
import type { GameState, Target } from '../types';

type Side =
  | { k: 'subj'; subj: any }            // resolved to objects when the effect resolves
  | { k: 'objs'; iids: string[] }
  | { k: 'filter'; f: any }             // evaluated against the rule's controller
  | { k: 'you' } | { k: 'players' } | { k: 'youAndYours'; f: any }
  | { k: 'self' } | { k: 'enchanted' }; // statics
type Rule = { to?: Side; by?: Side; combat: boolean; owner: number; src?: string; last?: number };

const single = (w: string) => w.replace(/\bcreatures\b/g, 'creature').replace(/\bsources\b/g, 'source').replace(/\bpermanents\b/g, 'permanent').replace(/\bartifacts\b/g, 'artifact').replace(/\bplayers\b/g, 'player');

function side(ph: string, ctx: any, isStatic: boolean): Side | null {
  ph = ph.trim();
  if (ph === 'you') return { k: 'you' };
  if (ph === 'players' || ph === 'each player') return { k: 'players' };
  if (ph === 'you and creatures you control' || ph === 'you and permanents you control') return { k: 'youAndYours', f: parseFilter(single(ph.slice(8))) };
  if (isStatic && (ph === '~' || ph === 'it')) return { k: 'self' };
  if (isStatic && /^enchanted (creature|permanent)$/.test(ph)) return { k: 'enchanted' };
  if (/^(?:~|it|that creature|target .+|enchanted creature|equipped creature)$/.test(ph)) {
    const n = ctx.specs.length;
    const subj = parseSubject(ph, ctx);
    if (!subj) { ctx.specs.length = n; return null; }
    return { k: 'subj', subj };
  }
  let p = single(ph);
  if (p === 'source your opponents control' || p === 'source you don\'t control') return { k: 'filter', f: { controller: 'notYou' } };
  if (p === 'artifact source') return { k: 'filter', f: { types: ['artifact'] } };
  p = p.replace(/^(?:all |each )/, '');
  const f = parseFilter(p);
  if (!f) return null;
  delete (f as any).zone;
  return { k: 'filter', f };
}

/** "prevent all (combat )?damage …" → rule shape, or null. */
function parsePrevent(text: string, ctx: any, isStatic: boolean): { to?: Side; by?: Side; combat: boolean; eot: boolean } | null {
  let m: RegExpMatchArray | null;
  const eot = / this turn\b/.test(text);
  const t = text.replace(/ this turn\b/g, '');
  if ((m = t.match(/^prevent all (combat )?damage that would be dealt to and dealt by (.+)$/))) {
    const s1 = side(m[2], ctx, isStatic);
    return s1 ? { to: s1, by: s1, combat: !!m[1], eot, both: true } as any : null;
  }
  if ((m = t.match(/^prevent all (combat )?damage (?:that )?(.+?) would deal(?: to (.+))?$/))) {
    const by = side(m[2], ctx, isStatic);
    const to = m[3] ? side(m[3], ctx, isStatic) : undefined;
    return by && to !== null ? { by, to: to ?? undefined, combat: !!m[1], eot } : null;
  }
  if ((m = t.match(/^prevent all (combat )?damage that would be dealt(?: to (.+?))?(?: by (.+))?$/))) {
    if (!m[2] && !m[3]) return null; // the plain fog is the core's
    const to = m[2] ? side(m[2], ctx, isStatic) : undefined;
    const by = m[3] ? side(m[3], ctx, isStatic) : undefined;
    if (to === null || by === null) return null;
    return { to, by, combat: !!m[1], eot };
  }
  return null;
}

EXT.rules.push([/^prevent all (?:combat )?damage .+$/, (m, ctx) => {
  const r = parsePrevent(m[0], ctx, false);
  if (!r || !r.eot) return null;
  return [{ k: 'ext', name: 'preventRule', rule: r }];
}]);
EXT.lines.push((line, pc) => {
  if (!/^prevent all (?:combat )?damage /.test(line) || / this turn\b/.test(line)) return false;
  const ctx: any = { specs: [], selfName: '~', last: { t: 'self' } };
  const r = parsePrevent(line, ctx, true);
  if (!r || ctx.specs.length || (r.to as any)?.k === 'subj' || (r.by as any)?.k === 'subj') return false;
  (pc.preventStatics ??= []).push(r);
  return true;
});

const rules = (s: GameState): Rule[] => ((s as any).prevRules ??= []);
EXT.effects.preventRule = ({ s, item, e, you, api }) => {
  const fix = (x?: Side): Side | undefined => (x && x.k === 'subj' ? { k: 'objs', iids: api.subjCards(s, item, x.subj).concat(api.subjPlayers ? [] : []) } : x);
  const r: Rule = { to: fix(e.rule.to), by: fix(e.rule.by), combat: e.rule.combat, owner: you, src: item.source, last: s.turn };
  if (e.rule.both) (r as any).both = true;
  // a targeted player side ("target player") resolves to players
  for (const k of ['to', 'by'] as const) {
    const x: any = (e.rule as any)[k];
    if (x?.k === 'subj' && x.subj.t === 'target') {
      const ts = (item.targets[x.subj.spec] ?? []) as Target[];
      if (ts.some((t) => t.kind === 'player')) (r as any)[k] = { k: 'objs', iids: ts.map((t) => (t.kind === 'player' ? `p${t.idx}` : (t as any).iid)) };
    }
  }
  rules(s).push(r);
  (s as any).prevRules = rules(s).filter((x) => (x.last ?? Infinity) >= s.turn);
  return 'done';
};

function sideHas(s: GameState, x: Side | undefined, obj: { iid?: string; p?: number }, owner: number, src: string | undefined, api: any): boolean {
  if (!x) return true;
  switch (x.k) {
    case 'objs': return obj.iid ? x.iids.includes(obj.iid) : x.iids.includes(`p${obj.p}`);
    case 'you': return obj.p === owner;
    case 'players': return obj.p !== undefined;
    case 'youAndYours': return obj.p === owner || (!!obj.iid && s.cards[obj.iid]?.controller === owner && api.matchesFilter(s, obj.iid, { ...x.f, zone: s.cards[obj.iid].zone }, owner, src));
    case 'self': return !!obj.iid && obj.iid === src;
    case 'enchanted': return !!obj.iid && !!src && s.cards[src]?.attachedTo === obj.iid;
    case 'filter': return !!obj.iid && !!s.cards[obj.iid] && api.matchesFilter(s, obj.iid, { ...x.f, zone: s.cards[obj.iid].zone }, owner, src);
    default: return false;
  }
}

EXT.hooks.damage.push((s, source, to, n, combat, api) => {
  if (n <= 0 || (s as any).noPreventTurn === s.turn) return n;
  const toObj = to.kind === 'player' ? { p: to.idx } : to.kind === 'card' ? { iid: to.iid } : {};
  const byObj = { iid: source };
  const hit = (r: Rule) => {
    if (r.combat && !combat) return false;
    if ((r as any).both) return sideHas(s, r.to, toObj, r.owner, r.src, api) || sideHas(s, r.by, byObj, r.owner, r.src, api);
    return sideHas(s, r.to, toObj, r.owner, r.src, api) && sideHas(s, r.by, byObj, r.owner, r.src, api);
  };
  for (const r of rules(s)) if ((r.last ?? Infinity) >= s.turn && hit(r)) { api.ev(s, { k: 'prevented', src: source, n }); return 0; }
  for (const b of s.battlefield) {
    for (const st of (api.chars(s, b).pc.preventStatics ?? []) as any[]) {
      if (st.gate14 && !api.gateOk(s, s.cards[b], st.gate14)) continue;
      if (hit({ ...st, owner: s.cards[b].controller, src: b })) return 0;
    }
  }
  return n;
});
