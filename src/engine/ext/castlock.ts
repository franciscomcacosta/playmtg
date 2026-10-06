// Plugin: "can't cast" restrictions.
//  Statics:   "Your opponents can't cast spells during your turn." (Dragonlord Dromoka) · "Players can't cast spells from
//             graveyards or libraries." (Grafdigger's Cage) · "Your opponents can't cast spells with the chosen name."
//             · "You can't cast creature spells." · "Players can't cast spells during combat." · "Your opponents can't cast
//             spells with mana value 3 or less." · "… from anywhere other than their hands." · "of the chosen color"
//  Effects:   "Target player can't cast creature spells this turn." · "Your opponents can't cast spells this turn."
//             · "… until your next turn" · "… until the end of your next turn" · "Players can't cast … until …"
import { EXT } from '../ext';
import { sourcesWith } from '../rules';
import { looseFilter, parsePlayerSubject } from '../oracle';
import { hasName } from './naming';

type Lock = { who: 'opp' | 'all' | 'you'; f: any; named?: boolean; chosenColor?: boolean; zones?: string[]; notHand?: boolean; duringYourTurn?: boolean; duringCombat?: boolean };

const WHO: Record<string, Lock['who']> = { 'your opponents': 'opp', 'each opponent': 'opp', players: 'all', 'each player': 'all', you: 'you' };

function spellPhrase(ph: string): Omit<Lock, 'who'> | null {
  const out: any = { f: {} };
  let m: RegExpMatchArray | null;
  if ((m = ph.match(/^(.*?) ?spells? from (graveyards|graveyards or libraries|libraries|anywhere other than their hands?)$/))) {
    if (m[2].startsWith('anywhere')) out.notHand = true;
    else out.zones = m[2].includes('graveyard') ? (m[2].includes('libraries') ? ['graveyard', 'library'] : ['graveyard']) : ['library'];
    ph = (m[1] ? m[1] + ' ' : '') + 'spells';
  }
  if ((m = ph.match(/^(.*?) ?spells with the same name as (?:the exiled card|a card exiled with ~)$/))) { out.sameExiled = true; ph = (m[1] ? m[1] + ' ' : '') + 'spells'; }
  if ((m = ph.match(/^(.*?) ?spells with the chosen name$/))) { out.named = true; ph = (m[1] ? m[1] + ' ' : '') + 'spells'; }
  if ((m = ph.match(/^(.*?) ?spells of the chosen color$/))) { out.chosenColor = true; ph = (m[1] ? m[1] + ' ' : '') + 'spells'; }
  if ((m = ph.match(/^(.*?) ?spells with mana value (\d+) or (less|greater)$/))) {
    out.f = m[3] === 'less' ? { cmcMax: +m[2] } : { cmcMin: +m[2] };
    ph = (m[1] ? m[1] + ' ' : '') + 'spells';
  }
  if (ph === 'spells') return out;
  m = ph.match(/^(.+?) spells$/);
  if (!m) return null;
  const f = looseFilter(m[1]);
  if (!f) return null;
  const g: any = { ...out.f, ...f };
  delete g.zone; delete g.owner;
  out.f = g;
  return out;
}

EXT.lines.push((line, pc) => {
  const m = line.match(/^(during your turn, )?(your opponents|each opponent|players|each player|you) can't cast (.+?)( during your turn| during combat)?$/);
  if (!m) return false;
  const sp = spellPhrase(m[3]);
  if (!sp) return false;
  pc.castLock = { who: WHO[m[2]], ...sp, duringYourTurn: !!m[1] || m[4] === ' during your turn', duringCombat: m[4] === ' during combat' } as Lock;
  return true;
});

const COMBAT = new Set(['beginCombat', 'declareAttackers', 'declareBlockers', 'firstStrikeDamage', 'combatDamage', 'endCombat']);

function blocks(s: any, p: number, iid: string, lock: Lock, owner: number, src: string | undefined, api: any): boolean {
  if (lock.who === 'opp' && p === owner) return false;
  if (lock.who === 'you' && p !== owner) return false;
  if (lock.duringYourTurn && s.active !== owner) return false;
  if (lock.duringCombat && !COMBAT.has(s.step)) return false;
  const c = s.cards[iid];
  if (lock.zones && !lock.zones.includes(c.zone)) return false;
  if (lock.notHand && c.zone === 'hand') return false;
  if (lock.named) {
    const n = src ? (s.cards[src] as any)?.chosenName : (lock as any).name;
    if (!n || !hasName(s, iid, n)) return false;
  }
  if ((lock as any).sameExiled) {
    const sc: any = src ? s.cards[src] : null;
    const ex = [...(sc?.linked ?? []), ...(sc?.remembered ?? [])].filter((x: string) => s.cards[x]?.zone === 'exile');
    if (!ex.some((x: string) => hasName(s, iid, s.defs[s.cards[x].defId].name))) return false;
  }
  if (lock.chosenColor) {
    const col = src ? (s.cards[src] as any)?.chosenColor : (lock as any).color;
    if (!col || !api.chars(s, iid).colors.includes(col)) return false;
  }
  if (Object.keys(lock.f).length && !api.matchesFilter(s, iid, { ...lock.f, zone: c.zone }, p, src)) return false;
  return true;
}

EXT.hooks.castBlock.push((s, p, iid, _alt, api) => {
  for (const b of sourcesWith(s, 'castLock')) {
    const lock = api.chars(s, b).pc.castLock as Lock | undefined;
    if (lock && blocks(s, p, iid, lock, s.cards[b].controller, b, api)) return `${api.nm(s, b)}: you can't cast that spell`;
  }
  for (const l of ((s as any).castLocks ?? []) as any[]) {
    if (!lockLive(s, l)) continue;
    if (l.players.includes(p) && blocks(s, p, iid, { ...l.lock, who: 'all' }, l.owner, undefined, api)) return `${l.label}: you can't cast that spell`;
  }
  return null;
});

function lockLive(s: any, l: any) {
  if (l.only !== undefined) return s.turn === l.only;
  return s.turn <= l.last;
}

// ---- one-shot effects ----
EXT.rules.push([/^(?:(until your next turn|until end of turn), )?(target player|target opponent|your opponents|each opponent|players|each player|you) (?:can't|cannot) cast (.+?)(?: (this turn|until your next turn|until the end of your next turn|during (?:that player's|their) next turn))?$/, (m, ctx) => {
  const when = m[4] ?? m[1] ?? null;
  if (!when) return null;
  const sp = spellPhrase(m[3]);
  if (!sp || sp.named || sp.chosenColor || (sp as any).sameExiled) return null;
  let who: any;
  if (m[2].startsWith('target')) {
    who = parsePlayerSubject(m[2], ctx);
    if (!who) return null;
  } else who = { k: WHO[m[2]] };
  return [{ k: 'ext', name: 'castLockTemp', who, lock: sp, when: when === 'until end of turn' ? 'this turn' : when }];
}]);
EXT.effects.castLockTemp = ({ s, item, e, you, api }) => {
  const players: number[] = e.who.k ? (e.who.k === 'opp' ? [1 - you] : e.who.k === 'you' ? [you] : [0, 1]) : api.subjPlayers(s, item, e.who);
  const yourNext = s.turn + (s.active === you ? 2 : 1);
  const theirNext = (p: number) => s.turn + (s.active === p ? 2 : 1);
  const l: any = { players, lock: e.lock, owner: you, label: api.nm(s, item.source) };
  if (e.when === 'this turn') l.last = s.turn;
  else if (e.when === 'until your next turn') l.last = yourNext - 1;
  else if (e.when === 'until the end of your next turn') l.last = yourNext;
  else l.only = theirNext(players[0]);
  ((s as any).castLocks ??= []).push(l);
  (s as any).castLocks = (s as any).castLocks.filter((x: any) => lockLive(s, x));
  return 'done';
};
