// Plugin: Role tokens (Wilds of Eldraine) — Aura tokens created attached to a creature. A creature can have only one Role
// from each controller; a newer one replaces the older (rule 303.7).
import { EXT } from '../ext';
import { parseSubject } from '../oracle';

const ROLES: Record<string, string> = {
  cursed: 'Enchant creature\nEnchanted creature has base power and toughness 1/1.',
  monster: 'Enchant creature\nEnchanted creature gets +1/+1 and has trample.',
  royal: 'Enchant creature\nEnchanted creature gets +1/+1 and has ward {1}.',
  sorcerer: 'Enchant creature\nEnchanted creature gets +1/+1 and has "Whenever this creature attacks, scry 1."',
  wicked: 'Enchant creature\nEnchanted creature gets +1/+1.\nWhen this Aura is put into a graveyard from the battlefield, each opponent loses 1 life.',
  'young hero': 'Enchant creature\nEnchanted creature has "Whenever this creature attacks, if its toughness is 3 or less, put a +1/+1 counter on it."',
  virtuous: 'Enchant creature\nEnchanted creature gets +1/+1 for each enchantment you control.',
};
const cap = (w: string) => w.replace(/\b\w/g, (c) => c.toUpperCase());
EXT.rules.push([/^create (?:a|an) (cursed|monster|royal|sorcerer|wicked|young hero|virtuous) role token attached to (it|that creature|~|(?:up to one )?(?:another |other )?target creature(?: you control| an opponent controls)?|each creature (?:you control|your opponents control))$/, (m, ctx) => {
  let what: any;
  if (m[2] === '~') what = { t: 'self' };
  else if (m[2] === 'it' || m[2] === 'that creature') what = ctx.last ?? { t: 'self' };
  else if (/^each creature/.test(m[2])) what = { t: 'all', filter: { types: ['creature'], controller: /your opponents/.test(m[2]) ? 'opp' : 'you', zone: 'battlefield' } };
  else what = parseSubject(m[2].replace(/ other target/, ' another target'), ctx);
  return what ? [{ k: 'ext', name: 'roleToken', role: m[1], what }] : null;
}]);
EXT.effects.roleToken = ({ s, item, e, you, api }) => {
  for (const c of api.subjCards(s, item, e.what)) {
    if (s.cards[c]?.zone !== 'battlefield' || !api.chars(s, c).types.has('creature')) continue;
    // one Role per controller per creature: the old one goes
    for (const b of [...s.battlefield]) if (s.cards[b]?.attachedTo === c && s.cards[b].controller === you && (s.cards[b] as any).isRole) api.moveCard(s, b, 'graveyard');
    const tok = api.createToken(s, you, { name: `${cap(e.role)} Role`, colors: [], types: 'Token Enchantment — Aura Role', keywords: [], oracle: ROLES[e.role] });
    if (!tok || !s.cards[tok]) continue;
    s.cards[tok].attachedTo = c;
    (s.cards[tok] as any).isRole = true;
    ((item as any).lastTokens ??= []).push(tok);
    api.log(s, `${api.pname(s, you)} creates a ${cap(e.role)} Role attached to ${api.nm(s, c)}.`, you);
  }
  return 'done';
};
