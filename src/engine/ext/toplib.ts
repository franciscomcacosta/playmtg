// Plugin: playing from the top of your library (Future Sight, Courser of Kruphix, Oracle of Mul Daya, Vizier of the Menagerie).
//  "You may play lands (and cast [creature] spells) from the top of your library." / "Play with the top card of your library revealed."
import { EXT } from '../ext';
import { sourcesWith } from '../rules';
import { looseFilter } from '../oracle';

EXT.lines.push((line, pc) => {
  if (/^play with the top card of your library revealed$/.test(line)) { pc.topRevealed = true; return true; }
  const m = line.match(/^you may (play lands|look at the top card of your library any time\. you may play lands)?(?: and )?(?:cast (.*?) ?spells)? from the top of your library$/);
  if (!m || (!m[1] && m[2] === undefined)) return false;
  let spells: any = null;
  if (m[2] !== undefined) {
    if (m[2] === '') spells = {};
    else {
      const f = looseFilter(m[2]);
      if (!f) return false;
      spells = { ...f };
      delete spells.zone;
    }
  }
  pc.topPlay = { lands: !!m[1], spells };
  if (m[1]?.startsWith('look')) pc.lookTop = true;
  return true;
});
EXT.hooks.zoneCast.push((s, p, card, _pc, api) => {
  if (card.zone !== 'library' || card.owner !== p || s.players[p].library[0] !== card.iid) return null;
  const isLand = /\bLand\b/.test(s.defs[card.defId].typeLine.split(' // ')[0]);
  for (const b of sourcesWith(s, 'topPlay')) {
    if (s.cards[b].controller !== p) continue;
    const tp = (api.chars(s, b).pc as any).topPlay;
    if (!tp) continue;
    if (isLand ? tp.lands : tp.spells && (!Object.keys(tp.spells).length || api.matchesFilter(s, card.iid, { ...tp.spells, zone: 'library' }, p))) {
      card.mayPlay = { player: p, untilTurn: s.turn } as any;
      return 'mayPlay';
    }
  }
  return null;
});

// "You may cast spells / sorcery spells / creature spells as though they had flash." (Leyline of Anticipation, Vedalken Orrery)
EXT.lines.push((line, pc) => {
  const m = line.match(/^you may cast (.*?) ?spells (?:and nonland cards )?as though they had flash$/);
  if (!m) return false;
  let f: any = {};
  if (m[1]) {
    const g: any = looseFilter(m[1]) ?? looseFilter(`${m[1]} spell`);
    if (!g) return false;
    f = { ...g }; delete f.zone;
    if (f.types?.length === 1 && f.types[0] === 'spell') delete f.types;
  }
  pc.flashFor = f;
  return true;
});
EXT.hooks.flash.push((s, iid, api) => {
  const c = s.cards[iid];
  if (!c) return false;
  const p = c.zone === 'hand' || c.zone === 'library' ? c.owner : c.controller;
  return sourcesWith(s, 'flashFor').some((b) => {
    if (s.cards[b].controller !== p) return false;
    const f = (api.chars(s, b).pc as any).flashFor;
    return !!f && (!Object.keys(f).length || api.matchesFilter(s, iid, { ...f, zone: c.zone }, p));
  });
});

// "You can spend mana of any type to cast creature spells." (Vizier of the Menagerie) / "… as though it were mana of any color …"
// Paying with any type = the colored symbols act as generic for this payment.
EXT.lines.push((line, pc) => {
  const m = line.match(/^you (?:can|may) spend mana (?:of any type|as though it were mana of any (?:type|color)) to cast (.*?) ?spells$/);
  if (!m) return false;
  let f: any = {};
  if (m[1]) { const g = looseFilter(m[1]); if (!g) return false; f = { ...g }; delete f.zone; }
  pc.anyTypeFor = f;
  return true;
});
EXT.hooks.costMod.push((s, p, iid, cost, _alt, api) => {
  if (!cost) return cost;
  const c = s.cards[iid];
  const ok = sourcesWith(s, 'anyTypeFor').some((b) => {
    if (s.cards[b].controller !== p) return false;
    const f = (api.chars(s, b).pc as any).anyTypeFor;
    return !!f && (!Object.keys(f).length || api.matchesFilter(s, iid, { ...f, zone: c.zone }, p));
  });
  if (!ok) return cost;
  let n = 0;
  const rest = cost.replace(/\{([WUBRGC])\}/gi, () => { n++; return ''; });
  if (!n) return cost;
  const g = +(rest.match(/\{(\d+)\}/)?.[1] ?? 0);
  return `{${g + n}}` + rest.replace(/\{\d+\}/g, '');
});

// Bolas's Citadel: "You may play lands and cast spells from the top of your library. If you cast a spell this way, pay
// life equal to its mana value rather than pay its mana cost."
EXT.lines.push((line, pc) => {
  if (!/^you may play lands and cast spells from the top of your library\. if you cast a spell this way, pay life equal to its mana value rather than pay its mana cost$/.test(line)) return false;
  pc.topPlay = { lands: true, spells: {}, life: true };
  return true;
});
EXT.hooks.zoneCast.unshift((s, p, card, _pc, api) => {
  if (card.zone !== 'library' || card.owner !== p || s.players[p].library[0] !== card.iid) return null;
  if (/\bLand\b/.test(s.defs[card.defId].typeLine.split(' // ')[0])) return null;
  const has = sourcesWith(s, 'topPlay').some((b) => s.cards[b].controller === p && (api.chars(s, b).pc as any).topPlay?.life);
  return has ? 'ext:citadel' : null;
});
EXT.alts.citadel = {
  label: 'pay life (top of library)',
  begin: (s, p, iid, _pcf, api) => {
    const mv = api.chars(s, iid).cmc ?? 0;
    return s.players[p].life >= mv || mv === 0 ? '' : "!You don't have enough life";
  },
  pay: (s, pc, api) => { const mv = api.chars(s, pc.iid).cmc ?? 0; if (mv > 0) api.loseLife(s, pc.player, mv); },
};
