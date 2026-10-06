// Plugin: trigger events, once-per-turn limits and "this turn" riders.
import { EXT } from '../ext';
import { parseAbility } from '../oracle';

// "When ~ becomes the target of a spell or ability, sacrifice it." / "Whenever ~ becomes the target of a spell or ability an opponent controls, …"
EXT.lines.push((line, pc) => {
  const m = line.match(/^(?:when|whenever) ~ becomes the target of a spell( or ability)?(?: (an opponent controls|you control))?(?: for the first time each turn)?, (.+)$/);
  if (!m) return false;
  const ab = parseAbility(m[3].replace(/^sacrifice it$/, 'sacrifice ~'), { lastPlayer: { t: 'triggerPlayer' } as any });
  pc.triggers.push({ event: 'becomesTarget' as any, ability: ab, text: line, ...(m[2] ? { who: m[2] } : {}), ...(m[1] ? {} : { spellOnly: true }), ...(/first time each turn/.test(line) ? { oncePerTurn: true } : {}) } as any);
  if (ab.manual.length) pc.unparsed.push(...ab.manual);
  return true;
});
EXT.hooks.pushed.push((s, item, api) => {
  const seen = new Set<string>();
  for (const t of item.targets.flat()) {
    if (t.kind !== 'card' || seen.has(t.iid)) continue;
    seen.add(t.iid);
    const c = s.cards[t.iid];
    if (!c || c.zone !== 'battlefield') continue;
    for (const tr of api.chars(s, t.iid).pc.triggers as any[]) {
      if (tr.event !== 'becomesTarget') continue;
      if (tr.spellOnly && item.kind !== 'spell') continue;
      if (tr.who === 'an opponent controls' && item.controller === c.controller) continue;
      if (tr.who === 'you control' && item.controller !== c.controller) continue;
      if (tr.oncePerTurn) {
        const k = `bt:${t.iid}`;
        const used = ((s as any).oncePerTurn ??= {});
        if (used[k] === s.turn) continue;
        used[k] = s.turn;
      }
      api.queueTrigger(s, t.iid, c.controller, tr, { triggerPlayer: item.controller });
    }
  }
});

// "If that creature would die this turn, exile it instead."
EXT.rules.push([/^if (?:that creature|it|the creature|that permanent) would die this turn, exile it instead$/, (_m, ctx) => [{ k: 'ext', name: 'dieExile', what: ctx.last ?? { t: 'target', spec: 0 } }]]);
EXT.rules.push([/^if a creature dealt damage this way would die this turn, exile it instead$/, (_m, ctx) => [{ k: 'ext', name: 'dieExile', what: ctx.last ?? { t: 'target', spec: 0 }, damaged: true }]]);
EXT.effects.dieExile = ({ s, item, e, api }) => {
  for (const c of api.subjCards(s, item, e.what)) if (s.cards[c]?.zone === 'battlefield') (s.cards[c] as any).dieExileTurn = s.turn;
  return 'done';
};

// "Whenever you draw your second card each turn, …"
EXT.lines.push((line, pc) => {
  const m = line.match(/^whenever you draw your second card each turn, (.+)$/);
  if (!m) return false;
  const ab = parseAbility(m[1]);
  pc.triggers.push({ event: 'secondDraw' as any, ability: ab, text: line });
  if (ab.manual.length) pc.unparsed.push(...ab.manual);
  return true;
});
EXT.hooks.afterMove.push((s, iid, from, to, _o, api) => {
  if (from !== 'library' || to !== 'hand') return;
  const owner = s.cards[iid]?.owner;
  if (owner == null) return;
  const d = ((s as any).drawsThisTurn ??= {});
  if (d.turn !== s.turn) { d.turn = s.turn; d[0] = 0; d[1] = 0; }
  d[owner] = (d[owner] ?? 0) + 1;
  if (d[owner] !== 2) return;
  for (const b of s.battlefield) {
    if (s.cards[b].controller !== owner) continue;
    for (const tr of api.chars(s, b).pc.triggers as any[]) if (tr.event === 'secondDraw') api.queueTrigger(s, b, owner, tr, {});
  }
});


// "If ~ was kicked, it enters with two +1/+1 counters on it." / "~ enters tapped. As it enters, choose a color."
import { parseAbility as pa2 } from '../oracle';
EXT.lines.push((line, pc) => {
  let m: RegExpMatchArray | null;
  if ((m = line.match(/^if ~ was kicked, it enters with (\w+) ([+-]\d\/[+-]\d|[a-z]+) counters? on it$/))) {
    const n = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 }[m[1] as 'a'] ?? +m[1];
    (pc.entersCounters ??= []).push({ counter: m[2], n, kickedOnly: true });
    return true;
  }
  if ((m = line.match(/^~ enters tapped\. as it enters, choose an? (color|creature type)$/))) {
    pc.entersTapped = true;
    pc.triggers.push({ event: 'etb', ability: { text: line, effects: [{ k: 'choose', what: m[1] === 'color' ? 'color' : 'creatureType' }], specs: [], manual: [] }, text: line });
    return true;
  }
  void pa2;
  return false;
});

// "When ~ is put into a graveyard from anywhere, …" (Emrakul, the Eldrazi titans, Worldspine Wurm-likes)
EXT.lines.push((line, pc) => {
  const m = line.match(/^(?:when|whenever) ~ is put into (?:a|your) graveyard from anywhere, (.+)$/);
  if (!m) return false;
  const ab = parseAbility(m[1].replace(/^(?:its owner )?shuffles? (?:it|~|~ and its owner's graveyard|their graveyard) into (?:its owner's|their) library$/, (x) => x), { lastPlayer: { t: 'you' } as any, last: { t: 'self' } as any } as any);
  pc.triggers.push({ event: 'toGyAnywhere' as any, ability: ab, text: line } as any);
  if (ab.manual.length) pc.unparsed.push(...ab.manual);
  return true;
});
EXT.hooks.afterMove.push((s, iid, _from, to, _opts, api) => {
  if (to !== 'graveyard') return;
  const c = s.cards[iid];
  if (!c || c.zone !== 'graveyard') return;
  for (const tr of api.parsedFor(s, c).triggers as any[]) if (tr.event === 'toGyAnywhere') api.queueTrigger(s, iid, c.owner, tr, {});
});
