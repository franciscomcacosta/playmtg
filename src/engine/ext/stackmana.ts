// Plugin: abilities on the stack as targets, and two mana-ability shapes.
//  - "Counter target activated ability." / "… triggered ability" / "… activated or triggered ability"
//    / "… from an artifact source" / "… from an artifact, creature, enchantment, or land" (Bind, Interdict, Brown Ouphe)
//  - "Add {B} or one mana of the chosen color." (the Gates — the color chosen as it entered)
//  - "Add an amount of {G} equal to ~'s power." (Cradle Clearcutter, Marwyn)
import { EXT } from '../ext';
import { spec, looseFilter } from '../oracle';

const KIND: Record<string, string[]> = { activated: ['ability'], triggered: ['trigger'], 'activated or triggered': ['ability', 'trigger'] };
EXT.rules.push([/^counter target (activated|triggered|activated or triggered) ability(?: from (?:an? )?(.+?) source| from (?:an? )?(artifact, creature, enchantment, or land))?$/, (m, ctx) => {
  const kinds = KIND[m[1]];
  const src = (m[2] ?? m[3])?.replace(/,? or /g, ', ').split(/, /).map((t) => t.trim()).filter(Boolean);
  if (src && src.some((t) => !['artifact', 'creature', 'enchantment', 'land', 'planeswalker'].includes(t))) return null;
  ctx.specs.push(spec({ zone: 'stack', stackKinds: kinds, ...(src ? { srcTypes: src } : {}) } as any, 1, false, `target ${m[1]} ability`));
  return [{ k: 'counterSpell', what: { t: 'target', spec: ctx.specs.length - 1 } }];
}]);
EXT.rules.push([/^add \{([wubrgc])\} or one mana of the chosen color$/, (m) => [{ k: 'addMana', colors: 'chosen', n: 1, orBase: m[1].toUpperCase() } as any]]);
EXT.rules.push([/^add an amount of \{([wubrgc])\} equal to ~'s power$/, (m) => [{ k: 'addMana', colors: [m[1].toUpperCase()], n: 1, perPower: true } as any]]);

// "Spend this mana only to cast a creature spell." / "… dragon spells or activate abilities of dragons" / "… an artifact
// spell or activate an ability of an artifact source": the mana ability's output becomes restricted mana. The engine
// keeps it in a separate pool and only spends / auto-taps it for a qualifying spell or ability.
const spellF = (ph: string): any => {
  if (/ or (?:an? )?/.test(ph) && / of the chosen type/.test(ph)) {
    const parts = ph.split(/ or (?:an? )?/).map((x) => spellF(x));
    return parts.some((x) => !x) ? null : { anyOf: parts };
  }
  const ct = / of the chosen type/.test(ph);
  if (ct) { const g = spellF(ph.replace(/ (spells?) of the chosen type/, ' $1').replace(/ of the chosen type/, '')); return g ? { ...g, chosenType: true } : null; }
  ph = ph.replace(/^(?:a |an )/, '').replace(/ (?:spells?|sources?|permanents?)$/, '').replace(/ and\/or /g, ' or ').trim();
  const extra: any = {};
  // words looseFilter doesn't map: supertypes and color counts
  ph = ph.replace(/\blegendary\b ?/, () => { extra.supertypes = ['legendary']; return ''; })
    .replace(/\bcolorless\b ?/, () => { extra.colorless = true; return ''; })
    .replace(/\bmulticolored\b ?/, () => { extra.multicolored = true; return ''; }).trim();
  if (ph === 'spell' || ph === '') return extra;
  const f = looseFilter(ph);
  if (!f) return null;
  const g: any = { ...f, ...extra };
  delete g.zone; delete g.controller;
  return g;
};
// "…, and that spell can't be countered." (Cavern of Souls, Delighted Halfling)
EXT.rules.push([/^spend this mana only to cast (.+?), and that spell can't be countered$/, (m) => {
  const spell = spellF(m[1]);
  return spell ? [{ k: 'manaRestrict', kind: { spell, uncounter: true } } as any] : null;
}]);
// "… equipment spells or activate equip abilities" / "… elf spells and activate abilities of elf sources" / "… kicked spells"
EXT.rules.push([/^spend this mana only to cast (.+?) (?:or|and) (?:to )?activate (?:an )?equip abilit(?:y|ies)$/, (m) => {
  const spell = spellF(m[1]);
  return spell ? [{ k: 'manaRestrict', kind: { spell, ability: { subtypes: ['equipment'] } } } as any] : null;
}]);
EXT.rules.push([/^spend this mana only to cast (.+?) and activate abilities of (.+?) sources$/, (m) => {
  const spell = spellF(m[1]), ability = spellF(m[2]);
  return spell && ability ? [{ k: 'manaRestrict', kind: { spell, ability } } as any] : null;
}]);
EXT.rules.push([/^spend this mana only to cast spells with mana value (\d+) or greater or spells with \{x\} in their mana costs$/, (m) => [{ k: 'manaRestrict', kind: { spell: { anyOf: [{ cmcMin: +m[1] }, { hasX: true }] } } } as any]]);
EXT.rules.push([/^spend this mana only to cast (.+?) (?:or|and) (.+?)$/, (m) => {
  if (/activate|turn|pay|foretell|unlock|kicked|watermark|\{x\}|can't be countered|devoid|face/.test(m[0])) return null;
  const a = spellF(m[1]), b = spellF(m[2]);
  return a && b ? [{ k: 'manaRestrict', kind: { spell: { anyOf: [a, b] } } } as any] : null;
}]);
EXT.rules.push([/^spend this mana only to cast (.+?)(?:,? or (?:to )?activate (an ability|abilities)(?: of (.+?))?)?$/, (m) => {
  if (/can't be countered|kicked|devoid|face up|face-down|unlock|pay a cost|and saga|watermark|names begin|\{x\}|mana value|no abilities|or a |second spell|last card|equip abilit|freerunning/.test(m[0])) return null;
  const spell = spellF(m[1]);
  if (!spell) return null;
  let ability: any;
  if (m[2]) { ability = m[3] ? spellF(m[3].replace(/s$/, '')) : {}; if (!ability) return null; }
  return [{ k: 'manaRestrict', kind: { spell, ability } } as any];
}]);

// "Spend this mana only to activate abilities (of land sources / of artifacts)." / "… to cast spells with mana value 4 or greater."
// "Spend this mana only to cast your commander." (Jeweled Lotus) / "… a commander spell"
EXT.rules.push([/^spend this mana only to cast (?:your commander|commander spells?|a commander spell)$/, () => [{ k: 'manaRestrict', kind: { spell: { commander: true } } } as any]]);
EXT.rules.push([/^spend this mana only to activate abilities(?: of (.+?)(?: sources)?)?$/, (m) => {
  const ability = m[1] ? spellF(m[1].replace(/s$/, '')) : {};
  return ability ? [{ k: 'manaRestrict', kind: { ability } } as any] : null;
}]);
EXT.rules.push([/^spend this mana only to cast spells with mana value (\d+) or (greater|less)$/, (m) => [{ k: 'manaRestrict', kind: { spell: m[2] === 'greater' ? { cmcMin: +m[1] } : { cmcMax: +m[1] } } } as any]]);
