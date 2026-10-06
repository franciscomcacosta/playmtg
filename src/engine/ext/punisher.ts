// Plugin: "… unless that player pays {N}" (Rhystic Study, Mystic Remora, Esper Sentinel, Smothering Tithe, …)
//  The payer decides once; if they pay (mana or life), the rest doesn't happen.
import { EXT } from '../ext';
import { parseAmtPhrase, parsePlayerSubject, parseSentence } from '../oracle';

let n = 0;
function payerOf(w: string, ctx: any): any {
  if (w === 'that player' || w === 'they' || w === 'he or she') return ctx.lastPlayer ?? { t: 'triggerPlayer' };
  if (w === 'its controller' || w === "that creature's controller" || w === "that spell's controller") return ctx.last ? { t: 'controllerOf', of: ctx.last } : null;
  if (w === 'an opponent' || w === 'any player') return { t: 'eachOpp' };
  if (w === 'target opponent' || w === 'target player') return parsePlayerSubject(w, ctx);
  return null;
}
function build(body: string, who: string, cost: string, where: string | undefined, ctx: any): any[] | null {
  if (/^counter /.test(body)) return null; // the core's counterspell handles "unless its controller pays"
  const k0 = ctx.specs.length;
  const may = /^you may /.test(body);
  const inner = parseSentence(body.replace(/^you may /, ''), ctx);
  if (!inner || inner.some((e: any) => e.k === 'manual')) { ctx.specs.length = k0; return null; }
  const payer = payerOf(who, ctx);
  if (!payer) { ctx.specs.length = k0; return null; }
  let x: any;
  if (where) { x = parseAmtPhrase(where, ctx); if (x == null) { ctx.specs.length = k0; return null; } }
  const id = `u${++n}`;
  const life = cost.match(/^(\d+) life$/);
  return [
    { k: 'ext', name: 'unlessPay', id, payer, mana: life ? undefined : cost.toUpperCase(), life: life ? +life[1] : undefined, x },
    { k: 'if', cond: { k: 'itemFlag', id, not: true }, effects: may ? [{ k: 'may', effects: inner, text: body }] : inner },
  ];
}
EXT.rules.unshift([/^(.+?) unless (that player|they|its controller|that creature's controller|that spell's controller|an opponent|any player|target opponent|target player) pays? ((?:\{[^}]+\})+|\d+ life)(?:, where x is (.+))?$/, (m, ctx) => build(m[1], m[2], m[3], m[4], ctx)]);

// Smothering Tithe: "That player may pay {2}. If the player doesn't, you create a Treasure token."
EXT.seqs.push((sents, i, ctx, ab) => {
  const a = sents[i].match(/^(that player|they) may pay ((?:\{[^}]+\})+)$/);
  const b = sents[i + 1]?.match(/^if (?:the player|they|that player) (?:doesn't|don't|does not), (.+)$/);
  if (!a || !b) return null;
  const out = build(b[1], a[1], a[2], undefined, ctx);
  if (!out) return null;
  ab.effects.push(...out);
  return 1;
});

EXT.effects.unlessPay = ({ s, item, e, r, you, api }) => {
  const flags = ((item as any).flags ??= {});
  const payers: number[] = api.subjPlayers(s, item, e.payer).filter((p: number) => p !== you || e.payer.t !== 'eachOpp');
  const p = payers[0];
  if (p == null) { flags[e.id] = false; return 'done'; }
  let cost = e.mana as string | undefined;
  if (cost && e.x != null) cost = cost.replace(/\{X\}/g, `{${Math.max(0, api.amount(s, item, e.x))}}`);
  const can = cost ? api.canAfford(s, p, cost) : s.players[p].life >= (e.life ?? 0);
  if (!r.sub) {
    if (!can) { flags[e.id] = false; return 'done'; }
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: p, kind: 'yesno', title: `${item.label}: pay ${cost ?? `${e.life} life`}?`, options: [{ id: 'yes', label: `Pay ${cost ?? `${e.life} life`}` }, { id: 'no', label: "Don't pay" }], data: { ctx: 'resolve' } });
    return 'wait';
  }
  if (r.sub.answered === 'yes') {
    if (cost) api.payMana(s, p, cost, 0);
    else api.loseLife(s, p, e.life);
    api.log(s, `${api.pname(s, p)} pays ${cost ?? `${e.life} life`}.`, p);
    flags[e.id] = true;
  } else flags[e.id] = false;
  return 'done';
};

// "Its controller creates a 3/3 green Beast creature token." (Beast Within, Generous Gift, Pongify)
EXT.rules.push([/^(its controller|that creature's controller|that permanent's controller|its owner|that player|target player|target opponent|each opponent|each player) creates? (.+)$/, (m, ctx) => {
  const who = /controller$/.test(m[1]) ? (ctx.last ? { t: 'controllerOf', of: ctx.last } : null)
    : m[1] === 'its owner' ? (ctx.last ? { t: 'ownerOf', of: ctx.last } : null)
    : m[1] === 'that player' ? ctx.lastPlayer ?? { t: 'triggerPlayer' }
    : m[1] === 'each opponent' ? { t: 'eachOpp' } : m[1] === 'each player' ? { t: 'eachPlayer' } : null;
  const k0 = ctx.specs.length;
  const w = who ?? (m[1].startsWith('target') ? parsePlayerSubject(m[1], ctx) : null);
  if (!w) return null;
  const out = parseSentence(`create ${m[2]}`, ctx);
  if (!out || out.some((e: any) => e.k !== 'token')) { ctx.specs.length = k0; return null; }
  return out.map((e: any) => ({ ...e, who: w }));
}]);
