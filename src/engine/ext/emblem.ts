// Plugin: emblems (114). "You get an emblem with "…"." — an object in your command zone whose abilities work like a
// permanent's (statics apply, triggers trigger). The engine's trigger and static scans include emblems (observers()).
import { EXT } from '../ext';
import { automationLevel, parseCard } from '../oracle';

EXT.rules.push([/^you get an emblem with,? "(.+?)"(?: and "(.+)")?$/, (m) => {
  const text = [m[1], m[2]].filter(Boolean).join('\n').replace(/(^|\s)'|'(?=\s|$|[.,:])/g, (q: string) => q.replace("'", '"'));
  // only claim it when the emblem's own abilities are readable
  const pc: any = parseCard({ id: 'emblem-probe', name: 'Emblem', manaCost: '', cmc: 0, typeLine: 'Emblem', oracle: text, colors: [], colorIdentity: [], keywords: [], layout: 'normal' } as any);
  if (automationLevel(pc) !== 'full') return null;
  return [{ k: 'ext', name: 'emblem', text }];
}]);
let n = 0;
EXT.effects.emblem = ({ s, item, e, you, api }) => {
  const srcName = api.nm(s, item.source) ?? 'Planeswalker';
  const id = `emblem:${srcName}:${e.text.length}:${e.text.slice(0, 40)}`;
  if (!s.defs[id]) {
    const oracle = e.text.replace(/(^|\n)(\w)/g, (_x: string, a: string, b: string) => a + b.toUpperCase());
    s.defs[id] = { id, name: `${srcName} emblem`, manaCost: '', cmc: 0, typeLine: 'Emblem', oracle, colors: [], colorIdentity: [], keywords: [], layout: 'emblem' } as any;
  }
  const iid = `${api.uid(s, 'e')}${n++}`;
  s.cards[iid] = { ...api.newCardObj(iid, id, you, 'command'), emblem: true } as any;
  ((api.P(s, you) as any).command ??= []).push(iid);
  api.log(s, `${api.pname(s, you)} gets an emblem: “${e.text}”`, you);
  return 'done';
};
