// Plugin: batch 5.
//  - "If a creature an opponent controls would die, exile it instead." (creature-only exile replacement)
//  - Condition: "it/~ has a divinity counter on it" (e.g. "~ has indestructible as long as it has a divinity counter on it")
//  - "Enchanted creature gets +2/+2 and attacks each combat if able."
//  - "Suspect it / target creature." (it has menace and can't block for as long as it's suspected)
//  - "Target player shuffles up to three target cards from their graveyard into their library."
//  - "You may untap it and remove it from combat."
import { EXT } from '../ext';
import { parseSubject, spec, parsePlayerSubject } from '../oracle';

const W: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };

EXT.lines.push((line, pc) => {
  let m: RegExpMatchArray | null;
  if (/^if a (?:nontoken )?creature an opponent controls would die, exile it instead$/.test(line)) {
    pc.replacements.push({ k: 'graveExile', owner: 'opp', diesOnly: true } as any);
    return true;
  }
  if ((m = line.match(/^enchanted creature gets ([+-]\d+)\/([+-]\d+) and attacks each combat if able$/))) {
    pc.statics.push({ kind: 'attachPump', p: +m[1], t: +m[2], kw: [], mustAttack: true } as any);
    return true;
  }
  if (/^enchanted creature attacks each combat if able$/.test(line)) {
    pc.statics.push({ kind: 'attachPump', p: 0, t: 0, kw: [], mustAttack: true } as any);
    return true;
  }
  return false;
});

EXT.conds.push((text) => {
  const m = text.match(/^(?:it|~) has (?:a|an|one or more) ([+-]\d\/[+-]\d|[a-z]+) counters? on it$/);
  return m ? { k: 'ext', name: 'selfCounter', counter: m[1] } : null;
});
EXT.condEval.selfCounter = (s, cond, _you, self) => !!self && ((s.cards[self]?.counters?.[cond.counter] ?? 0) > 0);

// ---- suspect ----
EXT.rules.push([/^suspect (it|target creature|that creature|up to one target creature)$/, (m, ctx) => {
  const what = parseSubject(m[1], ctx);
  return what ? [{ k: 'ext', name: 'suspect', what }] : null;
}]);
EXT.effects.suspect = ({ s, item, e, api }) => {
  for (const c of api.subjCards(s, item, e.what)) {
    const card = s.cards[c];
    if (!card || card.zone !== 'battlefield' || (card as any).suspected) continue;
    (card as any).suspected = true;
    card.mods.push({ keywords: ['menace'], cantBlock: true, until: 'permanent', source: item.source, ts: s.ts++ });
    api.log(s, `${api.nm(s, c)} is suspected.`, card.controller);
  }
  return 'done';
};

// ---- graveyard cards back into the library ----
EXT.rules.push([/^(target player|target opponent|each player) shuffles up to (\w+) target cards from (?:their|his or her) graveyard into (?:their|his or her) library$/, (m, ctx) => {
  const who = m[1] === 'each player' ? { t: 'eachPlayer' } : parsePlayerSubject(m[1], ctx);
  const n = W[m[2]] ?? (+m[2] || 0);
  if (!who || !n) return null;
  ctx.specs.push(spec({ types: ['card'], zone: 'graveyard' } as any, n, true, `up to ${n} cards in a graveyard`));
  return [{ k: 'ext', name: 'gyShuffle', spec: ctx.specs.length - 1 }];
}]);
EXT.effects.gyShuffle = ({ s, item, e, api }) => {
  const owners = new Set<number>();
  for (const t of (item.targets[e.spec] ?? []) as any[]) if (t.kind === 'card' && s.cards[t.iid]?.zone === 'graveyard') { owners.add(s.cards[t.iid].owner); api.moveCard(s, t.iid, 'libraryTop'); }
  for (const p of owners) api.shuffleArr(s, api.P(s, p).library);
  return 'done';
};

// ---- untap and remove from combat ----
EXT.rules.push([/^(?:you may )?untap (it|that creature|~|target creature) and remove it from combat$/, (m, ctx) => {
  const what = parseSubject(m[1], ctx);
  return what ? [{ k: 'ext', name: 'untapRemove', what }] : null;
}]);
EXT.effects.untapRemove = ({ s, item, e, api }) => {
  for (const c of api.subjCards(s, item, e.what) as string[]) {
    const card = s.cards[c];
    if (!card || card.zone !== 'battlefield') continue;
    card.tapped = false;
    if (s.combat) {
      s.combat.attackers = s.combat.attackers.filter((a) => a.iid !== c);
      for (const a of s.combat.attackers) a.blockedBy = a.blockedBy.filter((b) => b !== c);
    }
    api.log(s, `${api.nm(s, c)} is untapped and removed from combat.`, card.controller);
  }
  return 'done';
};

// "If a creature dealt damage by ~ this turn would die, exile it instead." (checked in engine.ts moveCard)
EXT.lines.push((line, pc) => {
  if (!/^if a creature dealt damage by ~ this turn would die, exile it instead$/.test(line)) return false;
  pc.replacements.push({ k: 'dmgByExile' } as any);
  return true;
});
// "During your turn, equipped creature gets +2/+0 and has first strike." / "During your turn, ~ has flying."
EXT.lines.push((line, pc) => {
  const m = line.match(/^during your turn, (equipped creature|enchanted creature|~) (?:gets ([+-]\d+)\/([+-]\d+)(?: and has (.+))?|has (.+))$/);
  if (!m) return false;
  const kwText = m[4] ?? m[5];
  const kw = kwText ? kwText.split(/, (?:and )?| and /).map((k) => k.trim()) : [];
  if (kw.some((k) => !/^(first strike|double strike|flying|trample|lifelink|deathtouch|vigilance|haste|menace|hexproof|indestructible|reach)$/.test(k))) return false;
  const cond = { k: 'yourTurn' };
  const p = m[2] ? +m[2] : 0, t = m[3] ? +m[3] : 0;
  if (m[1] === '~') pc.statics.push({ kind: 'selfPump', p, t, kw, cond });
  else pc.statics.push({ kind: 'attachPump', p, t, kw, cond } as any);
  return true;
});
