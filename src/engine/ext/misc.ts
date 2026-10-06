// Plugin: assorted keywords and effect sentences (round 3).
import { EXT } from '../ext';
import { parseAbility, parseSentence, parseSubject, parsePlayerSubject, parseFilter, parseCostText, mkAct } from '../oracle';
import type { PlayerIdx } from '../types';

const W: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
const n0 = (w: string) => (/^\d+$/.test(w) ? +w : W[w] ?? 1);
const TO = { t: 'triggerObj' };

// ---------------- predefined tokens ----------------
const TOK: Record<string, any> = {
  lander: { name: 'Lander', colors: [], types: 'Token Artifact — Lander', keywords: [], oracle: '{2}, {T}, Sacrifice ~: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.' },
  mutagen: { name: 'Mutagen', colors: [], types: 'Token Artifact — Mutagen', keywords: [], oracle: '{1}, {T}, Sacrifice ~: Put a +1/+1 counter on target creature. Activate only as a sorcery.' },
  junk: { name: 'Junk', colors: [], types: 'Token Artifact — Junk', keywords: [], oracle: '{T}, Sacrifice ~: Exile the top card of your library. You may play that card this turn. Activate only as a sorcery.' },
};
EXT.rules.push([/^create (a|an|one|two|three|four|x) (tapped )?(lander|mutagen|junk) tokens?$/, (m, ctx) => {
  ctx.last = { t: 'lastToken' };
  return [{ k: 'token', n: m[1] === 'x' ? 'X' : n0(m[1]), token: { ...TOK[m[3]] }, who: { t: 'you' }, tapped: !!m[2] }];
}]);

// ---------------- "destroy/exile that creature at end of combat" ----------------
EXT.rules.push([/^(destroy|exile|sacrifice) (that creature|it|those creatures|target creature|~) at end of combat$/, (m, ctx) => {
  const what = m[2] === '~' ? { t: 'self' } : m[2] === 'target creature' ? parseSubject(m[2], ctx) : ctx.last ?? TO;
  return what ? [{ k: 'ext', name: 'eoc', act: m[1], what }] : null;
}]);
EXT.effects.eoc = ({ s, item, e, api }) => {
  const list = (((s as any).eoc ??= []) as { iid: string; act: string }[]);
  for (const c of api.subjCards(s, item, e.what)) list.push({ iid: c, act: e.act });
  return 'done';
};
EXT.hooks.step.push((s, step, api) => {
  if (step !== 'endCombat' && step !== 'main2') return;
  const list = ((s as any).eoc ?? []) as { iid: string; act: string }[];
  (s as any).eoc = [];
  for (const x of list) {
    if (s.cards[x.iid]?.zone !== 'battlefield') continue;
    if (x.act === 'destroy') api.destroy(s, x.iid);
    else if (x.act === 'exile') api.moveCard(s, x.iid, 'exile');
    else api.moveCard(s, x.iid, 'graveyard', { cause: 'sacrifice' });
  }
});

// ---------------- sacrifice it (self) / win the game / shuffle into library ----------------
EXT.rules.push([/^(?:you may )?sacrifice (it|that creature|that permanent|this permanent)$/, (m, ctx) => {
  const may = m[0].startsWith('you may');
  const eff = ctx.last?.t === 'self' || !ctx.last ? { k: 'sacSelf' } : { k: 'sacObj', what: ctx.last };
  return [may ? { k: 'may', effects: [eff], text: m[0].slice(8) } : eff];
}]);
EXT.rules.push([/^you win the game$/, () => [{ k: 'ext', name: 'win' }]]);
EXT.rules.push([/^(target player|target opponent|that player|each opponent) loses the game$/, (m, ctx) => { const w = parsePlayerSubject(m[1], ctx); return w ? [{ k: 'ext', name: 'lose', who: w }] : null; }]);
EXT.effects.win = ({ s, you, api }) => {
  const o = api.opp(you);
  s.players[o].lost = true;
  api.log(s, `${api.pname(s, you)} wins the game!`, you, 'turn');
  return 'done';
};
EXT.effects.lose = ({ s, item, e, api }) => {
  for (const p of api.subjPlayers(s, item, e.who)) s.players[p].lost = true;
  return 'done';
};
EXT.rules.push([/^(?:shuffle|put) (~|it|target creature|that card) into its owner's library(?:, then shuffle)?$/, (m, ctx) => {
  const what = m[1] === '~' ? { t: 'self' } : m[1] === 'target creature' ? parseSubject(m[1], ctx) : ctx.last ?? { t: 'self' };
  return what ? [{ k: 'ext', name: 'shuffleIn', what }] : null;
}]);
EXT.effects.shuffleIn = ({ s, item, e, api }) => {
  for (const c of api.subjCards(s, item, e.what)) {
    api.moveCard(s, c, 'library');
    api.shuffleArr(s, api.P(s, s.cards[c]?.owner ?? item.controller).library);
  }
  return 'done';
};

// ---------------- "its controller may search their library for …" (Path to Exile) ----------------
EXT.rules.push([/^(its controller|that player|their controller|that creature's controller|target player|target opponent) (may )?(search(?:es)? their library for .+)$/, (m, ctx) => {
  const who = m[1] === 'target player' || m[1] === 'target opponent' ? parsePlayerSubject(m[1], ctx) : m[1] === 'that player' ? ctx.lastPlayer ?? (ctx.last && ctx.last.t !== 'self' ? { t: 'controllerOf', of: ctx.last } : null) : ctx.last ? { t: 'controllerOf', of: ctx.last } : null;
  if (!who) return null;
  const inner = parseSentence(`${m[2] ? 'you may ' : ''}${m[3].replace(/^searches/, 'search').replace(/\btheir\b/g, 'your')}`, { specs: ctx.specs, selfName: '~', last: ctx.last } as any);
  return inner ? [{ k: 'ext', name: 'asPlayer', who, effects: inner }] : null;
}]);
EXT.effects.asPlayer = ({ s, item, e, r, api }) => {
  // Runs e.effects as if another player controlled this ability. Inner effects share this record
  // (the engine writes prompt answers into r.sub) and may splice their own list at r.i, so r.i is
  // swapped for the inner index while they run.
  if (r.__who == null) {
    const ps = api.subjPlayers(s, item, e.who) as PlayerIdx[];
    if (!ps.length) return 'done';
    r.__who = ps[0];
    r.__i = 0;
    r.__proxy = { ...item, controller: ps[0], effects: JSON.parse(JSON.stringify(e.effects)) };
  }
  const proxy = r.__proxy;
  const outer = r.i;
  try {
    while (r.__i < proxy.effects.length) {
      r.i = r.__i;
      const res = api.execEffect(s, proxy, proxy.effects[r.__i], r);
      r.__i = r.i;
      if (res === 'wait') return 'wait';
      r.__i++;
      r.sub = null;
    }
  } finally {
    r.i = outer;
  }
  r.__who = undefined;
  r.__proxy = undefined;
  return 'done';
};

// ---------------- afterlife N ----------------
EXT.lines.push((line, pc) => {
  const m = line.match(/^afterlife (\d+)$/);
  if (!m) return false;
  pc.triggers.push({ event: 'dies', text: line, ability: { text: line, effects: [{ k: 'token', n: +m[1], who: { t: 'you' }, token: { name: 'Spirit', power: '1', toughness: '1', colors: ['W', 'B'], types: 'Token Creature — Spirit', keywords: ['flying'], oracle: 'Flying' } }], specs: [], manual: [] } });
  return true;
});

// ---------------- ingest ----------------
EXT.lines.push((line, pc) => {
  if (line !== 'ingest') return false;
  pc.triggers.push({ event: 'combatDamagePlayer', text: line, ability: { text: line, effects: [{ k: 'ext', name: 'exileTopOf', who: { t: 'triggerPlayer' }, n: 1 }], specs: [], manual: [] } });
  return true;
});
EXT.rules.push([/^(that player|target player|target opponent|each opponent|defending player) exiles the top (?:card|(\w+) cards) of their library$/, (m, ctx) => {
  const who = m[1] === 'defending player' ? { t: 'defending' } : parsePlayerSubject(m[1], ctx);
  return who ? [{ k: 'ext', name: 'exileTopOf', who, n: m[2] ? n0(m[2]) : 1 }] : null;
}]);
EXT.effects.exileTopOf = ({ s, item, e, api }) => {
  for (const p of api.subjPlayers(s, item, e.who) as PlayerIdx[]) {
    const top = api.P(s, p).library.slice(0, e.n);
    for (const c of top) api.moveCard(s, c, 'exile');
    if (top.length) api.log(s, `${api.pname(s, p)} exiles ${top.map((c: string) => api.nm(s, c)).join(', ')} from the top of their library.`, p);
  }
  return 'done';
};

// ---------------- transmute {cost} ----------------
EXT.lines.push((line, pc, info) => {
  const m = line.match(/^transmute (\{[^}]+\}(?:\{[^}]+\})*)$/);
  if (!m) return false;
  const mv = info.def?.cmc ?? 0;
  pc.activated.push(mkAct(`Transmute ${m[1].toUpperCase()}`, { ...parseCostText(m[1]), discardSelf: true }, { text: 'search for a card with the same mana value', effects: [{ k: 'search', filter: { types: ['card'], zone: 'library', cmcMin: mv, cmcMax: mv }, n: 1, dest: 'hand', upTo: true }], specs: [], manual: [] }, { zone: 'hand', sorcery: true }));
  return true;
});

// ---------------- for mirrodin! ----------------
EXT.lines.push((line, pc) => {
  if (line !== 'for mirrodin!') return false;
  pc.triggers.push({ event: 'etb', text: line, ability: { text: line, effects: [
    { k: 'token', n: 1, who: { t: 'you' }, token: { name: 'Rebel', power: '2', toughness: '2', colors: ['R'], types: 'Token Creature — Rebel', keywords: [], oracle: '' } },
    { k: 'attach', what: { t: 'self' }, to: { t: 'lastToken' } },
  ], specs: [], manual: [] } });
  return true;
});

// ---------------- mobilize N ----------------
EXT.lines.push((line, pc) => {
  const m = line.match(/^mobilize (\d+|x)$/);
  if (!m) return false;
  const n = m[1] === 'x' ? 1 : +m[1];
  pc.triggers.push({ event: 'attacks', text: line, ability: { text: line, effects: [
    { k: 'token', n, who: { t: 'you' }, tapped: true, attacking: true, token: { name: 'Warrior', power: '1', toughness: '1', colors: ['R'], types: 'Token Creature — Warrior', keywords: [], oracle: '' } },
    { k: 'delayed', at: 'nextEnd', effects: [{ k: 'sacObj', what: { t: 'lastToken' } }] },
  ], specs: [], manual: [] } });
  return true;
});

// ---------------- switch power and toughness ----------------
EXT.rules.push([/^switch (~'s|target creature's|its|that creature's|each creature's) power and toughness until end of turn$/, (m, ctx) => {
  const what = m[1] === "~'s" ? { t: 'self' } : m[1] === "target creature's" ? parseSubject('target creature', ctx) : m[1] === "each creature's" ? { t: 'all', filter: { types: ['creature'] } } : ctx.last;
  return what ? [{ k: 'ext', name: 'switchPT', what }] : null;
}]);
EXT.effects.switchPT = ({ s, item, e, api }) => {
  for (const c of api.subjCards(s, item, e.what)) {
    if (s.cards[c]?.zone !== 'battlefield') continue;
    s.cards[c].mods.push({ switchPT: true, until: 'eot', source: item.source, ts: s.ts++ } as any);
    api.log(s, `${api.nm(s, c)} switches its power and toughness.`, item.controller);
  }
  return 'done';
};

// ---------------- target land becomes the basic land type of your choice ----------------
EXT.rules.push([/^(target land(?: you control)?|it) becomes the basic land type of your choice until end of turn$/, (m, ctx) => {
  const what = m[1] === 'it' ? ctx.last : parseSubject(m[1], ctx);
  return what ? [{ k: 'ext', name: 'landType', what }] : null;
}]);
EXT.effects.landType = ({ s, item, e, r, you, api }) => {
  if (!r.sub) {
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'yesno', title: 'Choose a basic land type', options: ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'].map((x) => ({ id: x.toLowerCase(), label: x })), data: { ctx: 'resolve' } });
    return 'wait';
  }
  const t = r.sub.answered ?? 'island';
  const col = { plains: 'W', island: 'U', swamp: 'B', mountain: 'R', forest: 'G' }[t as 'island'];
  for (const c of api.subjCards(s, item, e.what)) {
    s.cards[c].mods.push({ setLandType: t, landColor: col, until: 'eot', source: item.source, ts: s.ts++ } as any);
    api.log(s, `${api.nm(s, c)} becomes a ${t[0].toUpperCase()}${t.slice(1)} until end of turn.`, you);
  }
  return 'done';
};

void parseAbility; void parseFilter;
// "Each player searches their library for a basic land card, puts it onto the battlefield, then shuffles." (Field of Ruin)
EXT.rules.push([/^each player (may )?(search(?:es)? their library for .+)$/, (m, ctx) => {
  const body = `${m[1] ? 'you may ' : ''}${m[2].replace(/^searches/, 'search').replace(/\btheir\b/g, 'your').replace(/\bputs\b/g, 'put').replace(/\bshuffles\b/g, 'shuffle').replace(/\breveals\b/g, 'reveal')}`;
  const inner = parseSentence(body, { specs: ctx.specs, selfName: '~', last: ctx.last } as any);
  return inner ? [{ k: 'ext', name: 'asPlayer', who: { t: 'you' }, effects: inner }, { k: 'ext', name: 'asPlayer', who: { t: 'eachOpp' }, effects: JSON.parse(JSON.stringify(inner)) }] : null;
}]);
