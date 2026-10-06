// Plugin: exert (701.43). An exerted permanent won't untap during its controller's next untap step.
//  - "You may exert ~ as it attacks. (When you do, X.)"  — an attack trigger: exert, then X
//  - "{T}, exert ~: …"  — a cost (oracle cost parser + engine payment)
//  - "Whenever you exert a creature, …"
import { EXT } from '../ext';
import { parseAbility } from '../oracle';

EXT.lines.push((line, pc) => {
  const m = line.match(/^(?:if ~ hasn't been exerted this turn, )?you may exert (?:~|it) as it attacks(?:\. when you do, (.+?))?\.?$/);
  if (!m) return false;
  const ab = parseAbility(m[1] ? `you may exert ~. if you do, ${m[1]}.` : 'you may exert ~.');
  if (ab.manual.length) return false;
  pc.triggers.push({ event: 'attacks', ability: ab, text: line });
  return true;
});
EXT.rules.push([/^exert ~$/, () => [{ k: 'ext', name: 'exertSelf' }]]);
EXT.effects.exertSelf = ({ s, item, you, api }) => {
  const c = s.cards[item.source] as any;
  if (!c || c.zone !== 'battlefield') return 'done';
  c.exertTurn = s.turn;
  api.log(s, `${api.nm(s, item.source)} is exerted.`, you);
  api.emit(s, 'exert', { iid: item.source, p: you });
  return 'done';
};
// skip exactly one untap step after being exerted
EXT.hooks.untap.push((s, iid) => {
  const c = s.cards[iid] as any;
  if (c.exertTurn === undefined || s.turn <= c.exertTurn) return undefined;
  c.exertTurn = undefined;
  return false;
});
// exerted while untapped (vigilance): the next untap step still passes it by — nothing to do then
EXT.hooks.step.push((s, step) => {
  if (step !== 'untap') return;
  for (const b of s.battlefield) {
    const c = s.cards[b] as any;
    if (c.exertTurn !== undefined && s.turn > c.exertTurn && c.controller === s.active && !c.tapped) c.exertTurn = undefined;
  }
});
