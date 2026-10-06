// Plugin: Rooms (709.5) — cast either door; the other door can be unlocked later as a sorcery.
import { EXT } from '../ext';
import { mkAct } from '../oracle';
import type { GameState } from '../types';

const isRoom = (d: any) => d?.layout === 'split' && d.faces?.length === 2 && d.faces.every((f: any) => /\bRoom\b/.test(f.typeLine));
EXT.triggers.push((cond) => {
  if (/^when you unlock this door$/.test(cond)) return [{ event: 'unlockDoor' }];
  if (/^whenever you (?:fully )?unlock a room$|^whenever you unlock a door$/.test(cond)) return [{ event: 'fullyUnlock', data: { any: /unlock a door/.test(cond) } }];
  return null;
});
EXT.post.push((pc, info) => {
  const d = info.def;
  if (!isRoom(d)) return;
  const me = d.faces.findIndex((f: any) => f.name === info.name);
  if (me < 0) return;
  for (const t of pc.triggers) if (t.event === 'unlockDoor') t.data = { face: me };
  const other = 1 - me;
  pc.activated.push({ ...mkAct(`Unlock ${d.faces[other].name} ${d.faces[other].manaCost}`, { mana: d.faces[other].manaCost, tap: false, untap: false, sacSelf: false }, { text: 'unlock', effects: [], specs: [], manual: [] }, { sorcery: true }), extSpecial: 'unlock', door: other, gate: { k: 'ext', name: 'doorLocked', door: other } });
});
EXT.condEval.doorLocked = (s, c, _you, self) => !!self && !((s.cards[self] as any)?.unlocked?.[c.door]);
function fireUnlock(s: GameState, iid: string, door: number, api: any) {
  const c = s.cards[iid] as any;
  const d = s.defs[c.defId] as any;
  api.log(s, `${api.pname(s, c.controller)} unlocks ${d.faces[door].name}.`, c.controller);
  api.ev(s, { k: 'chosen', iid, text: `${d.faces[door].name} unlocked` });
  for (const t of api.chars(s, iid).pc.triggers as any[]) if (t.event === 'unlockDoor' && t.data?.face === door) api.queueTrigger(s, iid, c.controller, t, {});
  const full = c.unlocked.every(Boolean);
  for (const b of s.battlefield) {
    if (s.cards[b].controller !== c.controller) continue;
    for (const t of api.chars(s, b).pc.triggers as any[]) if (t.event === 'fullyUnlock' && (full || t.data?.any)) api.queueTrigger(s, b, c.controller, t, { triggerObj: iid });
  }
}
EXT.hooks.afterMove.push((s, iid, from, to, o, api) => {
  const c = s.cards[iid] as any;
  if (!c) return;
  if (to !== 'battlefield') { c.unlocked = undefined; return; }
  if (!isRoom(s.defs[c.defId])) return;
  c.unlocked = [false, false];
  if (from === 'stack' || o?.resolved) {
    const f = o?.face ?? c.face ?? 0;
    c.face = f;
    c.unlocked[f] = true;
    fireUnlock(s, iid, f, api);
  }
});
EXT.specials.unlock = (s, p, iid, a, api) => {
  const c = s.cards[iid] as any;
  if (!c?.unlocked || c.unlocked[a.door]) return 'That door is already unlocked';
  if (!(s.active === p && (s.step === 'main1' || s.step === 'main2') && !s.stack.length)) return 'Unlock only as a sorcery';
  const err = api.payMana(s, p, a.cost.mana, 0);
  if (err) return err;
  c.unlocked[a.door] = true;
  fireUnlock(s, iid, a.door, api);
  return null;
};
