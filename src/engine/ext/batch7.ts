// Plugin: batch 7.
//  - "[Your / Target player's / Each player's / That player's] life total becomes N" (CR 119.5: gain or lose the difference)
//    N: a number, "equal to your starting life total", "half your/their starting life total, rounded up/down",
//    "the number of creatures they control", "the highest/lowest life total among all players".
import { EXT } from '../ext';
import { num, parsePlayerSubject } from '../oracle';
import type { PlayerIdx } from '../types';

EXT.rules.push([/^(your|target player's|target opponent's|each player's|that player's) life total becomes (.+)$/, (m, ctx) => {
  const subj = m[1] === 'your' ? 'you' : m[1].replace(/'s$/, '');
  const who = subj === 'that player' ? (ctx.lastPlayer ?? { t: 'triggerPlayer' }) : parsePlayerSubject(subj, ctx);
  if (!who) return null;
  const a = m[2];
  let to: any = null;
  const n = num(a);
  if (typeof n === 'number') to = { n };
  else if (/^equal to (?:your|their) starting life total$/.test(a)) to = { start: 1 };
  else if (/^half (?:your|their) starting life total, rounded (up|down)$/.test(a)) to = { start: 0.5, up: a.endsWith('up') };
  else if (a === 'the number of creatures they control') to = { creatures: true };
  else if (a === 'the highest life total among all players') to = { agg: 'max' };
  else if (a === 'the lowest life total among all players') to = { agg: 'min' };
  return to ? [{ k: 'ext', name: 'setLife', who, to }] : null;
}]);
EXT.effects.setLife = ({ s, item, e, you, api }) => {
  const ps: PlayerIdx[] = e.who.t === 'you' ? [you] : api.subjPlayers(s, item, e.who);
  const lives = s.players.map((p: any) => p.life);
  for (const p of ps) {
    const pl = s.players[p] as any;
    if (pl.lost) continue;
    const start = pl.startingLife ?? ((s as any).format === 'commander' ? 40 : 20);
    const t = e.to;
    const target = t.n !== undefined ? t.n
      : t.start === 1 ? start
      : t.start ? (t.up ? Math.ceil(start / 2) : Math.floor(start / 2))
      : t.creatures ? s.battlefield.filter((b: string) => s.cards[b].controller === p && api.chars(s, b).types.has('creature')).length
      : t.agg === 'max' ? Math.max(...lives) : Math.min(...lives);
    const d = target - pl.life;
    if (d > 0) api.gainLife(s, p, d);
    else if (d < 0) api.loseLife(s, p, -d);
    api.log(s, `${api.pname(s, p)}'s life total becomes ${pl.life}.`, p);
  }
  return 'done';
};
