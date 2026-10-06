// Plugin: putting a card from your hand onto the battlefield.
//  - "You may put a creature card from your hand onto the battlefield." (Elvish Piper, Quicksilver Amulet)
//  - "… a creature card with mana value 3 or less from your hand …" / "… a creature card of the chosen type …"
//  - "… a land card from your hand onto the battlefield tapped."
import { EXT } from '../ext';
import { looseFilter, parseFilter } from '../oracle';

const W: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
EXT.rules.push([/^(?:you may )?put (a|an|up to (\w+)|any number of) (.+?) cards? (?:with mana value (\w+) or less )?from your hand onto the battlefield( tapped)?( and attacking(?: that opponent| that player)?)?$/, (m, ctx) => {
  let ph = m[3].replace(/, or /g, ' or ').replace(/, /g, ' or ');
  const chosen = / of the chosen type$/.test(ph);
  ph = ph.replace(/ of the chosen type$/, '');
  const f0 = looseFilter(ph) ?? parseFilter(ph + ' card');
  if (!f0) return null;
  const f: any = { ...f0, zone: 'hand' };
  delete f.owner;
  if (chosen) f.chosenType = true;
  if (m[4]) { const n = /^\d+$/.test(m[4]) ? +m[4] : W[m[4]]; if (n === undefined) return null; f.cmcMax = n; }
  const max = m[1] === 'any number of' ? 99 : m[2] ? (/^\d+$/.test(m[2]) ? +m[2] : W[m[2]] ?? 1) : 1;
  // "That creature gains haste." afterwards refers to the card put onto the battlefield (via the lastToken list)
  ctx.last = { t: 'lastToken' };
  return [{ k: 'ext', name: 'putFromHand', filter: f, max, tapped: !!m[5] || !!m[6], attacking: !!m[6] }];
}]);
EXT.effects.putFromHand = ({ s, item, e, r, you, api }) => {
  const cands = (api.P(s, you).hand as string[]).filter((h) => api.matchesFilter(s, h, e.filter, you, item.source));
  if (!cands.length) { (item as any).didLast = false; return 'done'; }
  if (!r.sub) {
    r.sub = {};
    api.pushPrompt(s, { id: api.uid(s, 'p'), player: you, kind: 'chooseCards', title: `${item.label}: put ${e.max > 1 ? 'cards' : 'a card'} from your hand onto the battlefield`, cards: cands, min: 0, max: Math.min(e.max, cands.length), data: { ctx: 'resolve' } });
    return 'wait';
  }
  const picked: string[] = r.sub.answer ?? [];
  if (!picked.length) (item as any).didLast = false;
  for (const c of picked) if (s.cards[c]?.zone === 'hand') {
    api.moveCard(s, c, 'battlefield', { controller: you, tapped: e.tapped });
    // "… tapped and attacking": attacking what the source attacks (else the opponent)
    if (e.attacking && s.combat && (s.cards[c] as any)?.zone === 'battlefield') {
      const tgt = s.combat.attackers.find((a: any) => a.iid === item.source)?.target ?? { kind: 'player', idx: 1 - you };
      s.combat.attackers.push({ iid: c, target: tgt, blockedBy: [] } as any);
    }
  }
  (item as any).lastTokens = picked.filter((c) => s.cards[c]?.zone === 'battlefield');
  return 'done';
};
