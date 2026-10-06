// Plugin: library manipulation and common one-shot sentences.
import { EXT } from '../ext';
import { looseFilter } from '../oracle';
import type { Color } from '../types';

const N: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };
const num = (w: string) => (/^\d+$/.test(w) ? +w : N[w] ?? 1);

// Tutors to the top: "search your library for a (creature) card, (reveal it,) then shuffle and put that card on top"
EXT.rules.push([/^search your library for (?:a|an) (.+?)(?:, reveal it)?, then shuffle and put that card on top(?: of your library)?$/, (m) => {
  const f = m[1] === 'card' ? { types: ['card'] } : looseFilter(m[1]);
  return f ? [{ k: 'search', filter: { ...f, zone: 'library' }, n: 1, dest: 'libraryTop', upTo: false }] : null;
}]);

// "You may put a land card from your hand onto the battlefield (tapped)."
EXT.rules.push([/^(?:you may )?put (a|an|up to (?:one|two)) (.+?) cards? from your hand onto the battlefield( tapped)?$/, (m, ctx) => {
  const f = looseFilter(m[2]);
  if (!f) return null;
  ctx.last = { t: 'lastToken' }; // "that creature" afterwards = the card put onto the battlefield
  const upTo = /may|up to/.test(m[0]);
  return [{ k: 'ext', name: 'fromHand', filter: { ...f, zone: 'hand', owner: 'you' }, n: /two/.test(m[1]) ? 2 : 1, tapped: !!m[3], upTo }];
}]);
EXT.effects.fromHand = ({ s, item, e, r, you, api }) => {
  const cands = api.P(s, you).hand.filter((h: string) => api.matchesFilter(s, h, e.filter, you));
  if (!r.sub) {
    if (!cands.length) return 'done';
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'chooseCards', title: `Put ${e.upTo ? 'up to ' : ''}${e.n} onto the battlefield from your hand`, cards: cands, min: e.upTo ? 0 : Math.min(e.n, cands.length), max: Math.min(e.n, cands.length), data: { ctx: 'resolve' } });
    return 'wait';
  }
  for (const c of r.sub.answer ?? []) if (s.cards[c]?.zone === 'hand') api.moveCard(s, c, 'battlefield', { controller: you, tapped: e.tapped });
  (item as any).lastTokens = (r.sub.answer ?? []).filter((c: string) => s.cards[c]?.zone === 'battlefield');
  return 'done';
};

// Granted abilities on tokens: 'It has "Sacrifice this creature: Add {C}."'
EXT.rules.push([/^(it|they|the token|the tokens|those tokens) (?:has|have) "(.+)"$/, (m, ctx) => {
  if (!ctx.last) return null;
  return [{ k: 'ext', name: 'grant', what: ctx.last, text: m[2].replace(/this creature|this artifact|this token/g, '~') }];
}]);
EXT.effects.grant = ({ s, item, e, api }) => {
  for (const c of api.subjCards(s, item, e.what)) ((s.cards[c] as any).granted ??= []).push(e.text);
  return 'done';
};

// "Untap up to N lands."
EXT.rules.push([/^untap up to (\w+) (lands|target lands|creatures|target creatures)$/, (m) => [{ k: 'ext', name: 'untapUpTo', n: num(m[1]), type: /land/.test(m[2]) ? 'land' : 'creature' }]]);
EXT.effects.untapUpTo = ({ s, e, r, you, api }) => {
  const cands = s.battlefield.filter((b) => s.cards[b].controller === you && s.cards[b].tapped && api.chars(s, b).types.has(e.type));
  if (!r.sub) {
    if (!cands.length) return 'done';
    if (cands.length <= e.n) {
      for (const c of cands) s.cards[c].tapped = false;
      return 'done';
    }
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'chooseCards', title: `Untap up to ${e.n}`, cards: cands, min: 0, max: e.n, data: { ctx: 'resolve' } });
    return 'wait';
  }
  for (const c of r.sub.answer ?? []) s.cards[c].tapped = false;
  return 'done';
};

// "Add {R}{R}, {G}{G}, or {W}{W}" (pain/filter lands, Signets' siblings)
EXT.rules.push([/^add ((?:\{[wubrgc]\})+), ((?:\{[wubrgc]\})+), or ((?:\{[wubrgc]\})+)$/, (m) => {
  const opts = [m[1], m[2], m[3]].map((x) => (x.match(/\{([wubrgc])\}/g) ?? []).map((y) => y[1].toUpperCase() as Color));
  return [{ k: 'ext', name: 'addOneOf', opts }];
}]);
EXT.rules.push([/^add ((?:\{[wubrgc]\})+) or ((?:\{[wubrgc]\})+)$/, (m) => {
  const opts = [m[1], m[2]].map((x) => (x.match(/\{([wubrgc])\}/g) ?? []).map((y) => y[1].toUpperCase() as Color));
  if (opts.every((o) => o.length === 1)) return null; // single symbols are handled by the core
  return [{ k: 'ext', name: 'addOneOf', opts }];
}]);
EXT.effects.addOneOf = ({ s, e, r, you, api }) => {
  if (!r.sub) {
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'mode', title: 'Choose mana to add', options: e.opts.map((o: string[], i: number) => ({ id: String(i), label: o.map((c) => `{${c}}`).join('') })), min: 1, max: 1, data: { ctx: 'resolve' } });
    return 'wait';
  }
  const i = +(Array.isArray(r.sub.answer) ? r.sub.answer[0] : r.sub.answer);
  for (const c of e.opts[i] ?? []) api.P(s, you).pool[c]++;
  return 'done';
};

// The sentence splitter breaks "…, then shuffle and put that card on top" into two sentences.
EXT.seqs.push((sents, i, _ctx, ab) => {
  const a = sents[i].match(/^search your library for (?:a|an) (.+?)(?:, reveal it| and reveal it)?$/);
  const b = sents[i + 1]?.match(/^(?:then )?shuffle(?: your library)? and put (?:that card|it) on top(?: of your library)?$/);
  if (!a || !b) return null;
  const f = a[1] === 'card' ? { types: ['card'] } : looseFilter(a[1]);
  if (!f) return null;
  ab.effects.push({ k: 'search', filter: { ...f, zone: 'library' }, n: 1, dest: 'libraryTop', upTo: false });
  return 1;
});

// ------------------------------------------------------------------------------------------
// Round 2: common one-shot sentences
// ------------------------------------------------------------------------------------------
import { parseSubject, parsePlayerSubject, spec as mkSpec, parseAmtPhrase } from '../oracle';
import { SUBTYPES } from '../subtypes';

// "Counter target noncreature spell." / "Counter target creature or planeswalker spell."
EXT.rules.push([/^counter target (non[a-z]+|[a-z]+(?: or [a-z]+)?) spell$/, (m, ctx) => {
  const sub = parseSubject('target spell', ctx);
  if (!sub || sub.t !== 'target') return null;
  const sp = ctx.specs[sub.spec];
  // each word may be a card type, a color, or a subtype ("Counter target Spirit or Arcane spell", "… blue spell")
  const CT = ['creature', 'artifact', 'enchantment', 'land', 'planeswalker', 'instant', 'sorcery', 'battle', 'kindred', 'tribal'];
  const COL: Record<string, string> = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };
  const one = (w: string): any => (CT.includes(w) ? { types: [w] } : COL[w] ? { colors: [COL[w]] } : w === 'multicolored' ? { multicolored: true } : w === 'colorless' ? { colorless: true } : SUBTYPES.has(w) ? { subtypes: [w] } : null);
  if (m[1].startsWith('non')) {
    const w = m[1].slice(3);
    if (CT.includes(w)) sp.filter = { ...sp.filter, notTypes: [w] };
    else if (COL[w]) sp.filter = { ...sp.filter, notColors: [COL[w]] } as any;
    else return null;
  } else {
    const parts = m[1].split(' or ').map(one);
    if (parts.some((x) => !x)) return null;
    const base: any = { ...sp.filter };
    delete base.types;
    sp.filter = parts.length === 1 ? { ...base, ...parts[0] } : ({ ...base, anyOf: parts } as any);
  }
  sp.label = `target ${m[1]} spell`;
  return [{ k: 'counterSpell', what: sub }];
}]);
// "If that spell is countered this way, exile it instead of putting it into its owner's graveyard."
EXT.rules.push([/^if that spell is countered this way, exile it instead of putting it into its owner's graveyard$/, () => [{ k: 'ext', name: 'exileCountered' }]]);
EXT.effects.exileCountered = ({ s, api }) => {
  const c = (s as any).lastCountered as string | undefined;
  if (c && s.cards[c]?.zone === 'graveyard') api.moveCard(s, c, 'exile');
  return 'done';
};

// "Exile up to two target cards from a single graveyard."
EXT.rules.push([/^exile (up to )?(\w+) target cards? from (?:a single graveyard|target player's graveyard|an opponent's graveyard)$/, (m, ctx) => {
  const n = { one: 1, two: 2, three: 3, four: 4 }[m[2] as 'one'] ?? (+m[2] || 1);
  ctx.specs.push(mkSpec({ types: ['card'], zone: 'graveyard', owner: /opponent/.test(m[0]) ? 'opp' : 'any' } as any, n, !!m[1], `${m[1] ?? ''}${m[2]} target card${n > 1 ? 's' : ''} from a graveyard`));
  return [{ k: 'exile', what: { t: 'target', spec: ctx.specs.length - 1 } }];
}]);
// "Put target creature card from a graveyard onto the battlefield under your control."
EXT.rules.push([/^(?:return|put) target (creature|artifact|enchantment|artifact or creature|permanent) card from (?:a|an opponent's) graveyard (?:onto|to) the battlefield under your control$/, (m, ctx) => {
  ctx.specs.push(mkSpec({ types: m[1].split(' or '), zone: 'graveyard', owner: /opponent/.test(m[0]) ? 'opp' : 'any' } as any, 1, false, `target ${m[1]} card in a graveyard`));
  const what = { t: 'target', spec: ctx.specs.length - 1 };
  ctx.last = what;
  return [{ k: 'reanimate', what, dest: 'battlefield' }];
}]);
// "(You may) sacrifice another creature (or artifact)." — tracks whether it happened for "if you do"
EXT.rules.push([/^sacrifice another (creature|artifact|creature or artifact|artifact or creature|permanent|land)$/, (m) => [{ k: 'ext', name: 'sacAnother', types: m[1] === 'permanent' ? ['creature', 'artifact', 'enchantment', 'land', 'planeswalker'] : m[1].split(' or ') }]]);
EXT.effects.sacAnother = ({ s, item, e, r, you, api }) => {
  const cands = s.battlefield.filter((b) => b !== item.source && s.cards[b].controller === you && e.types.some((t: string) => api.chars(s, b).types.has(t)));
  if (!r.sub) {
    if (!cands.length) { (item as any).didLast = false; return 'done'; }
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'chooseCards', title: `Sacrifice another ${e.types.join(' or ')}`, cards: cands, min: 1, max: 1, data: { ctx: 'resolve' } });
    return 'wait';
  }
  const c = r.sub.answer?.[0];
  if (c) {
    (s as any).lastSacrificed = [c];
    ((item as any).sacrificed ??= []).push(c);
    api.moveCard(s, c, 'graveyard', { cause: 'sacrifice' });
    (item as any).didLast = true;
  } else (item as any).didLast = false;
  return 'done';
};
// Protection from the color of your choice
EXT.rules.push([/^(~|target creature(?: you control)?|it) gains protection from the color of your choice until end of turn$/, (m, ctx) => {
  const what = m[1] === '~' ? { t: 'self' } : m[1] === 'it' ? ctx.last : parseSubject(m[1], ctx);
  return what ? [{ k: 'ext', name: 'protChoice', what }] : null;
}]);
EXT.effects.protChoice = ({ s, item, e, r, you, api }) => {
  if (!r.sub) {
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'color', title: 'Protection from which color?', options: ['W', 'U', 'B', 'R', 'G'].map((c) => ({ id: c, label: c })), data: { ctx: 'resolve' } });
    return 'wait';
  }
  const col = { W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green' }[String(r.sub.answer) as 'W'];
  for (const c of api.subjCards(s, item, e.what)) s.cards[c].mods.push({ keywords: [`protection from ${col}`], until: 'eot', source: item.source, ts: s.ts++ } as any);
  return 'done';
};
// "You may tap or untap target creature/permanent."
EXT.rules.push([/^(?:you may )?tap or untap target (creature|permanent|artifact|land)$/, (m, ctx) => {
  const what = parseSubject(`target ${m[1]}`, ctx);
  return what ? [{ k: 'ext', name: 'tapOrUntap', what }] : null;
}]);
EXT.effects.tapOrUntap = ({ s, item, e, r, you, api }) => {
  const c = api.subjCards(s, item, e.what)[0];
  if (!c) return 'done';
  if (!r.sub) {
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'yesno', title: `${api.nm(s, c)}: tap or untap it?`, options: [{ id: 'yes', label: 'Tap' }, { id: 'no', label: 'Untap' }], cards: [c], data: { ctx: 'resolve' } });
    return 'wait';
  }
  s.cards[c].tapped = r.sub.answered === 'yes';
  return 'done';
};
// "Target player draws two cards and loses 2 life."
EXT.rules.push([/^(target player|target opponent|each player|each opponent|you) draws? (\w+) cards? and loses? (\d+) life$/, (m, ctx) => {
  const who = m[1] === 'you' ? { t: 'you' } : parsePlayerSubject(m[1], ctx);
  const n = { a: 1, one: 1, two: 2, three: 3, four: 4 }[m[2] as 'a'] ?? +m[2];
  return who && n ? [{ k: 'draw', n, who }, { k: 'lose', n: +m[3], who }] : null;
}]);
// "You gain that much life." (after damage)
EXT.rules.push([/^you gain that much life$/, () => [{ k: 'ext', name: 'gainLast' }]]);
EXT.effects.gainLast = ({ s, you, api }) => {
  const n = (s as any).lastDealt ?? 0;
  if (n > 0) api.gainLife(s, you, n);
  return 'done';
};
// "Add N mana in any combination of {R} and/or {G}."
EXT.rules.push([/^add (\w+) mana in any combination of \{([wubrgc])\} and\/or \{([wubrgc])\}$/, (m) => {
  const n = { one: 1, two: 2, three: 3, four: 4 }[m[1] as 'one'] ?? +m[1];
  return n ? [{ k: 'ext', name: 'addCombo', n, a: m[2].toUpperCase(), b: m[3].toUpperCase() }] : null;
}]);
EXT.effects.addCombo = ({ s, e, r, you, api }) => {
  if (!r.sub) {
    r.sub = {};
    const opts = Array.from({ length: e.n + 1 }, (_, i) => ({ id: String(i), label: `{${e.a}}×${e.n - i} {${e.b}}×${i}` }));
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'mode', title: 'Choose the mana to add', options: opts, min: 1, max: 1, data: { ctx: 'resolve' } });
    return 'wait';
  }
  const i = +(Array.isArray(r.sub.answer) ? r.sub.answer[0] : r.sub.answer);
  api.P(s, you).pool[e.a] += e.n - i;
  api.P(s, you).pool[e.b] += i;
  return 'done';
};
// "You may cast a spell with mana value N or less from your hand without paying its mana cost."
EXT.rules.push([/^(?:you may )?cast (?:a|an) (.+?) with mana value (\d+|x) or less from your hand without paying its mana cost$/, (m) => {
  const f = m[1] === 'spell' ? {} : looseFilter(m[1].replace(/ spell$/, ''));
  return f ? [{ k: 'ext', name: 'castFree', filter: f, max: m[2] === 'x' ? 'X' : +m[2] }] : null;
}]);
EXT.effects.castFree = ({ s, item, e, r, you, api }) => {
  const max = api.amount(s, item, e.max);
  const cands = api.P(s, you).hand.filter((h: string) => {
    const d = s.defs[s.cards[h].defId];
    return !/\bLand\b/.test(d.typeLine.split(' // ')[0]) && d.cmc <= max && api.matchesFilter(s, h, { ...e.filter, zone: 'hand' }, you);
  });
  if (!r.sub) {
    if (!cands.length) return 'done';
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'chooseCards', title: `You may cast a spell with mana value ${max} or less for free`, cards: cands, min: 0, max: 1, data: { ctx: 'resolve' } });
    return 'wait';
  }
  const c = r.sub.answer?.[0];
  if (c) {
    const err = api.beginCast(s, you, c, 0, 'free');
    if (err) api.log(s, `Couldn't cast ${api.nm(s, c)}: ${err}`, you, 'warn');
  }
  return 'done';
};
void parseAmtPhrase;
