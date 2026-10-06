// Plugin: static draw replacements — "If you would draw a card[ while …], [you may] <effect> instead."
// (Thought Reflection, Phial of Galadriel, Blood Scrivener, Ormos, Obstinate Familiar, Possessed Portal, Pursuit of
// Knowledge, Sages of the Anima, Tomorrow, Underrealm Lich, Eruth …). The replacing effects go on the stack as a
// small item right away (the draw is skipped); "you may" ones draw normally when declined.
import { EXT } from '../ext';
import { parseAbility, parseCond } from '../oracle';

const COND: Record<string, any> = {};
const condOf = (t: string): any | null | undefined => {
  if (!t) return undefined;
  if (t === 'during your draw step') return { drawStep: true };
  if (t === 'except the first one you draw in each of your draw steps') return { notFirst: true };
  const c = parseCond(t.replace(/^while /, ''));
  return c ? { cond: c } : null;
};
EXT.lines.push((line, pc) => {
  const m = line.match(/^if (you|a player) would draw a card(?: (while [^,]+|during your draw step|except the first one you draw in each of your draw steps))?, (.+)$/s);
  if (!m) return false;
  const when = condOf(m[2] ?? '');
  if (when === null) return false;
  let body = m[3].trim();
  let may = false;
  if (/^(?:you|that player) may (?:instead )?/.test(body)) { may = true; body = body.replace(/^(?:you|that player) may (?:instead )?/, ''); }
  body = body.replace(/^instead,? /, '');
  // the first sentence ends in "instead"
  const sents = body.split(/\. /);
  sents[0] = sents[0].replace(/ instead$/, '');
  let text = sents.join('. ');
  const skip = /^(?:skip that draw|(?:that player|they) skips? that draw)$/.test(text);
  if (skip) text = '';
  const ab = text ? parseAbility(text, m[1] === 'a player' ? { lastPlayer: { t: 'triggerPlayer' } as any } : undefined) : { effects: [], specs: [], manual: [] } as any;
  if (ab.manual?.length || JSON.stringify(ab.effects).includes('"k":"manual"')) return false;
  (pc as any).drawRepl = [...((pc as any).drawRepl ?? []), { who: m[1] === 'you' ? 'you' : 'any', when, may, ab, text: line }];
  return true;
});
void COND;

EXT.hooks.draw.push((s, p, api) => {
  const res = s.resolving?.item as any;
  for (const b of s.battlefield) {
    const reps = (api.chars(s, b).pc as any).drawRepl as any[] | undefined;
    if (!reps) continue;
    const ctrl = s.cards[b].controller;
    for (let k = 0; k < reps.length; k++) {
      const r = reps[k];
      if (r.who === 'you' && p !== ctrl) continue;
      if (res?.drawReplOf === `${b}:${k}`) continue; // the replacement's own draws aren't replaced again
      const w = r.when;
      if (w?.drawStep && !(s.step === 'draw' && s.active === p)) continue;
      if (w?.notFirst) {
        const d = ((s as any).drFirst ??= {});
        const key = `${s.turn}:${p}`;
        if (s.step === 'draw' && s.active === p && !d[key]) { d[key] = true; continue; }
      }
      if (w?.cond && !api.evalCond(s, w.cond, ctrl, b)) continue;
      const effects = JSON.parse(JSON.stringify(r.ab.effects));
      const wrapped = r.may ? [{ k: 'may', effects: effects.length ? effects : [{ k: 'ext', name: 'noop' }], text: `${r.text.replace(/^if [^,]+, /, '')}` }, { k: 'if', cond: { k: 'youDid', not: true }, effects: [{ k: 'ext', name: 'drawFor', p }] }] : effects;
      if (!wrapped.length) { api.log(s, `${api.nm(s, b)}: ${api.pname(s, p)} skips a draw.`, p); return 'skip'; }
      api.log(s, `${api.nm(s, b)} replaces ${api.pname(s, p)}'s draw.`, p);
      s.pendingTriggers.push({ id: api.uid(s, 's'), kind: 'trigger', controller: r.may ? p : ctrl, source: b, label: api.nm(s, b), text: r.text, effects: wrapped, specs: JSON.parse(JSON.stringify(r.ab.specs ?? [])), targets: [], triggerPlayer: p, drawReplOf: `${b}:${k}` } as any);
      return 'skip';
    }
  }
  return undefined;
});
EXT.effects.drawFor = ({ s, e, api }) => { api.drawCards(s, e.p, 1); return 'done'; };
