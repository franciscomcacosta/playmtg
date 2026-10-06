/**
 * Oracle-text parser. Turns the rules text of a card into structured abilities the engine can execute.
 * Anything it can't understand is kept as "manual" text so players can resolve it by hand (untap-style).
 */
import { EXT } from './ext';
import { SUBTYPES } from './subtypes';
import type { CardDef, CardFace } from './cardTypes';
import type { Color } from './types';

// ---------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------

export interface Filter {
  types?: string[]; // any of: creature, artifact, enchantment, land, planeswalker, battle, instant, sorcery, permanent, spell, card, player, opponent
  notTypes?: string[];
  subtypes?: string[];
  supertypes?: string[];
  controller?: 'you' | 'opp' | 'notYou';
  tapped?: boolean;
  untapped?: boolean;
  attacking?: boolean;
  blocking?: boolean;
  attackingOrBlocking?: boolean;
  keyword?: string;
  noKeyword?: string;
  powerMax?: number;
  powerMin?: number;
  toughnessMax?: number;
  toughnessMin?: number;
  cmcMax?: number;
  cmcMin?: number;
  colors?: string[];
  notColors?: string[];
  colorless?: boolean;
  multicolored?: boolean;
  other?: boolean;
  zone?: 'battlefield' | 'stack' | 'graveyard' | 'hand' | 'library' | 'exile';
  owner?: 'you' | 'opp' | 'any';
  token?: boolean;
  chosenType?: boolean;
  chosenColor?: boolean;
  nontoken?: boolean;
}

export interface TargetSpec {
  filter: Filter;
  players?: 'any' | 'opp' | 'you' | null; // can target players
  count: number;
  upTo: boolean;
  label: string;
  divided?: boolean;
}

export type Subject =
  | { t: 'target'; spec: number }
  | { t: 'self' }
  | { t: 'all'; filter: Filter; players?: 'any' | 'opp' | 'you' }
  | { t: 'you' }
  | { t: 'eachOpp' }
  | { t: 'eachPlayer' }
  | { t: 'controllerOf'; of: Subject }
  | { t: 'ownerOf'; of: Subject }
  | { t: 'enchanted' }
  | { t: 'equipped' }
  | { t: 'triggerObj' } // the object that caused the trigger
  | { t: 'triggerPlayer' } // the player involved in the trigger event ("that player")
  | { t: 'defending' }
  | { t: 'lastToken' } // tokens created earlier in this resolution
  | { t: 'exiledTop' } // cards exiled from the top of the library earlier in this resolution
  | { t: 'linkedExiled' } // cards this permanent exiled ("the exiled card")
  | { t: 'blockers'; filter?: Filter }; // creatures blocking the source

/** Amounts: fixed, X, or computed on resolution. `mult` multiplies a computed amount ("two for each …"). */
export type Amt =
  | number
  | 'X'
  | { power: Subject; mult?: number }
  | { toughness: Subject; mult?: number }
  | { count: Filter; mult?: number }
  | { cmc: Subject; mult?: number }
  | { zone: 'hand' | 'graveyard' | 'library'; who: 'you' | 'opp'; mult?: number }
  | { maxPower: Filter; mult?: number }
  | { lki: string; mult?: number }
  | { opponents: true; mult?: number };

/** Conditions for "as long as", intervening "if", and keyword checks. */
export type Cond =
  | { k: 'control'; filter: Filter; n: number; max?: boolean }
  | { k: 'yourTurn'; not?: boolean }
  | { k: 'zoneCount'; zone: 'graveyard' | 'hand'; n: number; filter?: Filter; max?: boolean; who?: 'you' | 'opp' }
  | { k: 'life'; who: 'you' | 'opp'; n: number; max?: boolean }
  | { k: 'self'; state: 'equipped' | 'enchanted' | 'attacking' | 'blocking' | 'tapped' | 'untapped' | 'attackingOrBlocking' }
  | { k: 'noSpellsLastTurn' }
  | { k: 'twoSpellsLastTurn' }
  | { k: 'day' }
  | { k: 'night' }
  | { k: 'noCounter'; counter: string }
  | { k: 'notRenowned' }
  | { k: 'evolve' }
  | { k: 'trainingPartner' }
  | { k: 'oppDamaged' }
  | { k: 'defendingMostLife' }
  | { k: 'kicked' }
  | { k: 'youDid'; not?: boolean }
  | { k: 'completedDungeon' }
  | { k: 'flip'; won: boolean }
  | { k: 'ext'; name: string; [key: string]: any }
  | { k: 'and'; conds: Cond[] };

/** "Look at the top N cards …" — choose some, the rest go somewhere else. */
export interface DigSpec {
  n: Amt;
  reveal: boolean;
  pick?: { count: number; upTo: boolean; all?: boolean; filter?: Filter; dest: 'hand' | 'battlefield' | 'graveyard' | 'top' | 'bottom' | 'cast' | 'exile'; tapped?: boolean };
  rest: 'bottom' | 'top' | 'graveyard' | 'hand' | 'exile';
  /** Whose library (default: yours). */
  owner?: Subject;
}

export type Replacement =
  | { k: 'selfDieExile' }
  | { k: 'graveExile'; owner: 'any' | 'opp' }
  | { k: 'counterPlus'; filter: Filter }
  | { k: 'counterDouble'; plusOnly: boolean; filter: Filter }
  | { k: 'tokenDouble' }
  | { k: 'damageDouble'; yourSources: boolean }
  | { k: 'preventSelf'; combat: boolean }
  | { k: 'umbra' }
  | { k: 'oppEnterTapped'; filter: Filter }
  | { k: 'lifeDouble' };

export interface TokenSpec {
  name: string;
  power?: string;
  toughness?: string;
  colors: string[];
  types: string; // full type line
  keywords: string[];
  oracle: string;
}

export type Effect =
  | { k: 'damage'; n: Amt; to: Subject[]; from?: Subject }
  | { k: 'draw'; n: Amt; who: Subject }
  | { k: 'gain'; n: Amt; who: Subject }
  | { k: 'lose'; n: Amt; who: Subject }
  | { k: 'destroy'; what: Subject }
  | { k: 'exile'; what: Subject; linked?: boolean }
  | { k: 'bounce'; what: Subject }
  | { k: 'toLibrary'; what: Subject; top: boolean }
  | { k: 'reanimate'; what: Subject; dest: 'hand' | 'battlefield'; tapped?: boolean; counters?: Record<string, number>; transformed?: boolean; owner?: boolean }
  | { k: 'counterSpell'; what: Subject; unlessPay?: number }
  | { k: 'pump'; what: Subject; p: Amt; t: Amt; kw: string[]; eot: boolean; neg?: boolean }
  | { k: 'counters'; what: Subject; counter: string; n: Amt }
  | { k: 'token'; n: Amt; token: TokenSpec; who: Subject; tapped?: boolean; attacking?: boolean }
  | { k: 'tap'; what: Subject }
  | { k: 'untap'; what: Subject }
  | { k: 'discard'; who: Subject; n: Amt; random?: boolean; hand?: boolean }
  | { k: 'mill'; who: Subject; n: Amt }
  | { k: 'scry'; n: Amt }
  | { k: 'surveil'; n: Amt }
  | { k: 'search'; filter: Filter; n: number; dest: 'hand' | 'battlefield' | 'libraryTop'; tapped?: boolean; upTo: boolean }
  | { k: 'addMana'; colors: Color[] | 'any' | 'anyOne'; n: number }
  | { k: 'fight'; a: Subject; b: Subject }
  | { k: 'sacrifice'; who: Subject; filter: Filter; n: number }
  | { k: 'sacSelf' }
  | { k: 'gainControl'; what: Subject; eot: boolean; whileYouControl?: boolean }
  | { k: 'cantBlock'; what: Subject }
  | { k: 'skipUntap'; what: Subject }
  | { k: 'may'; effects: Effect[]; text: string }
  | { k: 'shuffle' }
  | { k: 'fog' }
  | { k: 'extraTurn' }
  | { k: 'proliferate' }
  | { k: 'if'; cond: Cond; effects: Effect[] }
  | { k: 'adapt'; n: number }
  | { k: 'bolster'; n: number }
  | { k: 'energy'; n: Amt }
  | { k: 'playerCounter'; counter: string; n: Amt; who: Subject }
  | { k: 'animate'; what: Subject; p?: number; t?: number; types: string[]; subtypes: string[]; colors?: string[]; kw: string[]; eot: boolean }
  | { k: 'setPT'; what: Subject; p: number; t: number; eot: boolean }
  | { k: 'loseAbilities'; what: Subject; eot: boolean }
  | { k: 'exchangeControl'; a: Subject; b: Subject }
  | { k: 'tokenCopy'; what: Subject; n: Amt; tapped?: boolean }
  | { k: 'populate' }
  | { k: 'exileTop'; n: Amt }
  | { k: 'mayPlay'; what: Subject; until: 'eot' | 'nextTurn' }
  | { k: 'returnLinked' }
  | { k: 'delayed'; at: 'nextEnd' | 'nextUpkeep'; effects: Effect[] }
  | { k: 'pay'; cost: string }
  | { k: 'regen'; what: Subject }
  | { k: 'handPick'; who: Subject; filter?: Filter; upTo: boolean }
  | { k: 'revealHand'; who: Subject }
  | { k: 'revealTop'; who: Subject; filter?: Filter; dest?: 'hand' | 'battlefield'; may?: boolean; otherwise?: 'bottom' | 'graveyard' }
  | { k: 'monarch' }
  | { k: 'flip' }
  | { k: 'roll'; sides: number; table: { min: number; max: number; effects: Effect[] }[] }
  | { k: 'choose'; what: 'color' | 'creatureType' | 'cardType' | 'landType' }
  | { k: 'copySpell'; what: Subject; n: Amt }
  | { k: 'madnessCast'; iid: string }
  | { k: 'ninjutsu' }
  | { k: 'venture'; initiative?: boolean }
  | { k: 'mutate' }
  | { k: 'sacObj'; what: Subject }
  | { k: 'preventNext'; n: Amt; to: Subject[] }
  | { k: 'attach'; what: Subject; to: Subject }
  | { k: 'transform'; what: Subject }
  | { k: 'manifest'; n: number; cloak?: boolean; dread?: boolean }
  | { k: 'vanishing' }
  | { k: 'fading' }
  | { k: 'cumulativeUpkeep'; cost: string }
  | { k: 'echo'; cost: string }
  | { k: 'renown'; n: number }
  | { k: 'livingWeapon' }
  | { k: 'suspendTick' }
  | { k: 'unearth' }
  | { k: 'embalm'; eternalize: boolean }
  | { k: 'reconfigure'; attach: boolean }
  | { k: 'cloneChoice' }
  | { k: 'dig'; spec: DigSpec }
  | { k: 'cascade' }
  | { k: 'levelUp'; n: number }
  | { k: 'craft' }
  | { k: 'meld'; partner: string; into: string; cond?: Cond }
  | { k: 'ext'; name: string; [key: string]: any }
  | { k: 'manual'; text: string };

export interface Ability {
  text: string;
  effects: Effect[];
  specs: TargetSpec[];
  manual: string[];
  modes?: { min: number; max: number; options: Ability[] };
}

export interface ActCost {
  mana: string; // mana symbols
  tap: boolean;
  untap: boolean;
  sacSelf: boolean;
  sacrifice?: { filter: Filter; n: number };
  discard?: number;
  discardSelf?: boolean;
  life?: number;
  loyalty?: number | 'X';
  removeCounters?: { counter: string; n: number };
  exileSelf?: boolean;
  tapCreatures?: { n: number; filter: Filter };
  energy?: number;
  other?: string; // unparsed cost text -> manual
}

export interface Activated {
  label: string;
  cost: ActCost;
  ability: Ability;
  isMana: boolean;
  produces?: Color[][]; // for mana abilities: per unit options
  manaAmount?: number;
  anyColor?: boolean;
  sorcery: boolean;
  once: boolean;
  zone: 'battlefield' | 'hand' | 'graveyard';
  special?: 'ninjutsu' | 'equip' | 'cycling' | 'crew' | 'loyalty' | 'reconfigure' | 'foretell' | 'plot' | 'suspend' | 'unearth' | 'embalm' | 'outlast' | 'level' | 'craft';
  level?: number; // Class: this ability exists from this level on (or, for 'level', the level it grants)
  craft?: { filter: Filter; min: number; max: number };
  crew?: number;
}

export type TriggerEvent =
  | 'etb'
  | 'dies'
  | 'ltb'
  | 'attacks'
  | 'blocks'
  | 'attacksOrBlocks'
  | 'combatDamagePlayer'
  | 'dealsDamage'
  | 'upkeep'
  | 'eachUpkeep'
  | 'oppUpkeep'
  | 'endStep'
  | 'eachEndStep'
  | 'mainPhase'
  | 'beginCombat'
  | 'drawStep'
  | 'castSpell'
  | 'oppCastSpell'
  | 'otherEtb'
  | 'otherDies'
  | 'landfall'
  | 'gainLife'
  | 'drawCard'
  | 'becomesTapped'
  | 'blocked'
  | 'turnedFaceUp'
  | 'transformed';

export interface Trigger {
  level?: number;
  event: TriggerEvent;
  filter?: Filter;
  ability: Ability;
  text: string;
  cond?: Cond; // intervening "if" (checked when it triggers and again on resolution)
  data?: any; // plugin trigger parameters
}

export interface StaticAb {
  level?: number;
  kind: 'anthem' | 'attachPump' | 'selfPump' | 'setPT';
  filter?: Filter; // for anthem
  attach?: 'enchanted' | 'equipped';
  p: Amt;
  t: Amt;
  kw: string[];
  cond?: Cond;
  setP?: Amt; // for setPT (characteristic-defining power/toughness)
  setT?: Amt;
  cantAttack?: boolean;
  cantBlock?: boolean;
  noUntap?: boolean;
  lose?: boolean;
}

export interface ParsedCard {
  keywords: string[];
  spell?: Ability;
  triggers: Trigger[];
  activated: Activated[];
  statics: StaticAb[];
  entersTapped?: boolean | string; // string = unless-condition text
  entersCounters?: { counter: string; n: number; kickedOnly?: boolean }[];
  classLevels?: boolean;
  enchant?: { filter: Filter; players?: 'any' | 'opp' | 'you' | null };
  flashback?: string;
  cantBeCountered?: boolean;
  cantBlock?: boolean;
  cantAttack?: boolean;
  unblockable?: boolean;
  noUntap?: boolean;
  additionalLand?: number;
  mustAttack?: boolean;
  controlEnchanted?: boolean;
  ward?: number;
  kicker?: string;
  kwArgs: Record<string, number>;
  replacements: Replacement[];
  chapters?: { n: number[]; ability: Ability; text: string }[];
  finalChapter?: number;
  morph?: { cost: string; kind: 'morph' | 'megamorph' | 'disguise' };
  foretell?: string;
  escape?: { cost: string; exile: number };
  escapeCounters?: { counter: string; n: number };
  disturb?: string;
  plot?: string;
  suspend?: { n: number; cost: string };
  bestow?: string;
  reconfigure?: string;
  clone?: { filter: Filter; except?: string };
  echo?: string;
  unparsed: string[];
  intrinsicMana?: Color[];
}

// ---------------------------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------------------------

export const KEYWORDS = [
  'flying', 'reach', 'trample', 'deathtouch', 'lifelink', 'vigilance', 'haste', 'first strike', 'double strike',
  'menace', 'defender', 'indestructible', 'hexproof', 'shroud', 'flash', 'infect', 'wither', 'prowess', 'fear',
  'intimidate', 'skulk', 'shadow', 'horsemanship', 'changeling', 'convoke', 'devoid', 'undying', 'persist', 'exalted',
  'flanking', 'rampage', 'bushido', 'unleash', 'decayed', 'toxic', 'protection', 'ward', 'landwalk',
  'islandwalk', 'swampwalk', 'forestwalk', 'mountainwalk', 'plainswalk', 'afflict', 'battle cry', 'dethrone',
  'evolve', 'extort', 'melee', 'mentor', 'riot', 'training', 'split second', 'storm',
  'cascade', 'delve', 'affinity', 'improvise', 'rebound', 'retrace', 'wither', 'annihilator', 'living weapon',
  'sunburst', 'modular', 'fading', 'vanishing', 'echo', 'cumulative upkeep', 'phasing', 'totem armor', 'umbra armor',
  'undaunted', 'partner', 'companion', 'daybound', 'nightbound', 'backup', 'bargain', 
];

const TYPE_WORDS = ['creature', 'artifact', 'enchantment', 'land', 'planeswalker', 'battle', 'instant', 'sorcery', 'permanent', 'spell', 'card', 'kindred', 'tribal'];
const COLOR_WORDS: Record<string, string> = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };
const NUMS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fifteen: 15, twenty: 20, another: 1, single: 1,
};

export function num(s: string | undefined): Amt | null {
  if (s == null) return null;
  s = s.trim().toLowerCase();
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  if (s === 'x') return 'X';
  if (s in NUMS) return NUMS[s];
  if (s === 'that many') return { lastCount: true } as any;
  return null;
}

export function numN(s: string | undefined, d = 1): number {
  const n = num(s);
  return typeof n === 'number' ? n : d;
}

export function singular(w: string): string {
  if (w === 'elves') return 'elf';
  if (w === 'dwarves') return 'dwarf';
  if (w === 'wolves') return 'wolf';
  if (w === 'werewolves') return 'werewolf';
  if (w === 'halves') return 'half';
  if (w === 'thieves') return 'thief';
  if (w === 'leeches') return 'leech';
  if (w === 'mice') return 'mouse';
  if (w === 'sorceries') return 'sorcery';
  if (w === 'allies') return 'ally';
  if (w === 'fungi') return 'fungus';
  if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y';
  if (/(ss|sh|ch|x)es$/.test(w)) return w.slice(0, -2);
  if (/oes$/.test(w) && SUBTYPES.has(w.slice(0, -2))) return w.slice(0, -2);
  if (/ves$/.test(w) && SUBTYPES.has(w.slice(0, -3) + 'f')) return w.slice(0, -3) + 'f';
  if (w.endsWith('s') && !w.endsWith('ss') && w !== 'plains' && w !== 'swiss') return w.slice(0, -1);
  return w;
}

// ---------------------------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------------------------

export function normalizeText(text: string, name: string, aliases: string[] = []): string {
  let t = text;
  // strip reminder text
  t = t.replace(/\s*\([^()]*\)/g, '');
  const names = [name, ...aliases];
  if (name.includes(',')) names.push(name.split(',')[0]);
  if (name.includes(' // ')) names.push(...name.split(' // '));
  for (const n of names.sort((a, b) => b.length - a.length)) {
    if (!n.trim()) continue;
    t = t.split(n).join('~');
  }
  t = t.toLowerCase();
  t = t.replace(/−/g, '-').replace(/[—–]/g, '—');
  t = t.replace(/\bthis (creature|artifact|enchantment|land|permanent|spell|vehicle|equipment|aura|planeswalker|card|saga|battle|token|siege|class|case|room|spacecraft|attraction|contraption|role|food|clue|treasure|emblem)\b/g, '~');
  t = t.replace(/enters the battlefield/g, 'enters');
  // gendered pronouns for named characters ("he fights up to one target creature", "her power") → it / its
  // (the old "he or she" / "his or her" wording is left alone: rules match it as written)
  t = t.replace(/\b(?:himself|herself)\b/g, 'itself')
    .replace(/\b(he|she)\b(?! or (?:she|he)\b)/g, (w, _x, off, all) => (/(?:he|she) or $/.test(all.slice(Math.max(0, off - 7), off)) ? w : 'it'))
    .replace(/\bhis\b(?! or her\b)/g, 'its')
    .replace(/\bhim\b(?! or her\b)/g, 'it')
    .replace(/\bher\b/g, (w, off, all) => (/(?:his|him) or $/.test(all.slice(Math.max(0, off - 7), off)) ? w : /^ (?:power|toughness|controller|owner|abilities|base|mana|name|color|colors|counters|loyalty)\b/.test(all.slice(off + 3, off + 20)) ? 'its' : 'it'));
  t = t.replace(/\bcan't be blocked\b/g, "can't be blocked");
  // two-player game: "each other player" (relative to the controller) is the opponent
  t = t.replace(/\beach other player('s)?\b/g, (_w, poss) => (poss ? "each opponent's" : 'each opponent'));
  // Escalate: "escalate {1}{W}" above a "choose one or more" modal — the cost is paid for each mode beyond the first
  t = t.replace(/(^|\n)escalate ((?:\{[^}]+\})+|—[^\n]+)\n(choose one or more —|choose one or both —)/, (_all, pre: string, cost: string, head: string) => `${pre}\u0003${cost.trim()}\u0003${head}`);
  // Spree: "+ {1} — effect" lines become a "choose one or more" modal whose options carry their extra cost (\u0002cost\u0002)
  t = t.replace(/(^|\n)spree\n((?:\+ (?:\{[^}]+\})+ — [^\n]+(?:\n|$))+)/, (_all, pre: string, body: string) =>
    `${pre}choose one or more —\n` + body.trim().split('\n').map((l) => { const m = l.match(/^\+ ((?:\{[^}]+\})+) — (.+)$/)!; return `• \u0002${m[1]}\u0002 ${m[2]}`; }).join('\n') + '\n');
  return t;
}

/** Split text into sentences while respecting quoted abilities. */
function sentences(s: string): string[] {
  const quotes: string[] = [];
  let q = s.replace(/"[^"]*"/g, (m) => {
    quotes.push(m);
    return `\u0001${quotes.length - 1}\u0001`;
  });
  // "each player discards their hand, then draws four cards": carry the player subject into the second verb
  q = q.replace(/((?:^|, )(each player|each opponent|that player|target player|target opponent|they|its owner|its controller|the owner of [a-z ]+?|[a-z' ]+?'s controller) (?:discards?|shuffles?|puts?|exiles?|reveals?|sacrifices?|loses?|returns?|mills?)\b[^.\n]*?), then (draws?|discards?|shuffles?|puts?|loses?|gains?|mills?|creates?|sacrifices?) (?![^.\n]*this way)/g, (_a, first: string, subj: string, verb: string) => {
    const sub = /target|owner of|controller$/.test(subj) ? 'that player' : subj;
    return `${first} and ${sub} ${verb} `;
  });
  q = q.replace(/, then /g, '. ');
  const parts = q
    .split(/\.(?:\s+|$)|\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => p.replace(/\u0001(\d+)\u0001/g, (_, i) => quotes[+i]));
  return parts;
}

// ---------------------------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------------------------

export function parseFilter(phrase: string): Filter | null {
  let p = phrase.trim().replace(/^(a|an|the) /, '');
  const f: Filter = {};
  // "a creature of their choice": who chooses is the effect's business, not the filter's
  p = p.replace(/ of (?:their|his or her|your|its controller's|that player's) choice$/, '');
  if (/ that was dealt damage this turn$/.test(p)) { (f as any).dealtThisTurn = true; p = p.replace(/ that was dealt damage this turn$/, ''); }
  if (/ of the chosen type\b/.test(p)) { f.chosenType = true; p = p.replace(/ of the chosen type\b/, ''); }
  if (/ of the chosen color\b/.test(p)) { f.chosenColor = true; p = p.replace(/ of the chosen color\b/, ''); }
  if (/^(?:creatures? )?(?:that are|that's) the chosen type\b/.test(p)) { f.chosenType = true; }
  if (/^chosen type /.test(p)) { f.chosenType = true; p = p.replace(/^chosen type /, ''); }

  {
    let m: RegExpMatchArray | null;
    if ((m = p.match(/ with (?:(?:a|an|one or more) )?([+-]\d\/[+-]\d|(?!(?:a|an|one|counters?)\b)[a-z]+) counters? on (?:it|them)$/))) { (f as any).hasCounter = m[1]; p = p.replace(m[0], ''); }
    else if ((m = p.match(/ with (?:a counter|one or more counters|counters) on (?:it|them)$/))) { (f as any).hasCounter = 'any'; p = p.replace(m[0], ''); }
    else if ((m = p.match(/ with no counters on (?:it|them)$/))) { (f as any).hasCounter = 'none'; p = p.replace(m[0], ''); }
  }
  // "with power less than or equal to the number of creatures you control" — a threshold computed when checked
  { let m: RegExpMatchArray | null;
  if ((m = p.match(/ with (mana value|power|toughness) x( or less)?(?=$| from | in | you control| you don't control| an opponent controls| your opponents control)/))) {
    (f as any).dynMax = { stat: m[1] === 'mana value' ? 'cmc' : m[1], amt: 'X', ...(m[2] ? {} : { eq: true }) };
    p = p.replace(m[0], '');
  }
  // "all other permanents except for lands and tokens" / "all permanents other than ~"
  if ((m = p.match(/ except for (.+)$/))) {
    const ex = m[1].split(/,? and |, /);
    const nt: string[] = [];
    let ok = true;
    for (const w of ex) { const x = singular(w.trim()); if (x === 'token') (f as any).nontoken = true; else if (TYPE_WORDS.includes(x)) nt.push(x); else ok = false; }
    if (ok) { if (nt.length) f.notTypes = [...(f.notTypes ?? []), ...nt]; p = p.replace(m[0], ''); }
  }
  if (/ other than ~$/.test(p)) { f.other = true; p = p.replace(/ other than ~$/, ''); }
  if ((m = p.match(/ with (power|toughness|mana value) less than or equal to (.+)$/)) && !/\bx\b|that creature's|that card's|^its |the sacrificed|that spell's|this way|that aura's|that damage/.test(m[2])) {
    const cx = { specs: [], selfName: '~', last: { t: 'self' } } as any;
    const SUF = /( (?:that )?you control| you don't control| (?:an opponent|your opponents|target opponent|target player|that player|defending player) controls?| you own| (?:in|from) (?:your|a|any|an opponent's) graveyard| (?:in|from) your hand)$/;
    let amtText = m[2], suf = '';
    let a: any = parseAmtPhrase(amtText, cx);
    const sm = amtText.match(SUF);
    if ((a == null || typeof a === 'number') && sm) { amtText = amtText.slice(0, -sm[0].length); suf = sm[0]; a = parseAmtPhrase(amtText, cx); }
    if (a != null && typeof a !== 'number') {
      (f as any).dynMax = { stat: m[1] === 'mana value' ? 'cmc' : m[1], amt: a };
      p = p.replace(m[0], '') + suf;
    }
  }
  }
  {
    let pm: RegExpMatchArray | null;
    if (/ that dealt damage to you this turn$/.test(p)) { (f as any).dealtYouTurn = true; p = p.replace(/ that dealt damage to you this turn$/, ''); }
    else if (/ that dealt damage this turn$/.test(p)) { (f as any).dealtTurn = true; p = p.replace(/ that dealt damage this turn$/, ''); }
    if ((pm = p.match(/ with power or toughness (\d+) or (greater|less)$/))) { (f as any).ptOr = { n: +pm[1], ge: pm[2] === 'greater' }; p = p.replace(pm[0], ''); }
    if (/ that (?:isn't|aren't|is not|are not) enchanted$/.test(p)) { (f as any).notEnchanted = true; p = p.replace(/ that (?:isn't|aren't|is not|are not) enchanted$/, ''); }
    if (/ that (?:'s|are|is) one or more colors$| that's one or more colors$/.test(p)) { (f as any).colored = true; p = p.replace(/ that(?:'s| are| is) one or more colors$/, ''); }
  }
  if (/ (?:blocking or blocked by|blocked by or blocking) (?:~|it)$/.test(p)) { (f as any).rel = 'combatWithSelf'; p = p.replace(/ (?:blocking or blocked by|blocked by or blocking) (?:~|it)$/, ''); }
  else if (/ blocking (?:~|it)$/.test(p)) { (f as any).rel = 'blockingSelf'; p = p.replace(/ blocking (?:~|it)$/, ''); }
  else if (/ (?:~|it) is blocking$/.test(p)) { (f as any).rel = 'blockedBySelf'; p = p.replace(/ (?:~|it) is blocking$/, ''); }
  else if (/ blocked by (?:~|it)$/.test(p)) { (f as any).rel = 'blockedBySelf'; p = p.replace(/ blocked by (?:~|it)$/, ''); }
  if (/ that entered (?:the battlefield )?this turn$/.test(p) && !(f as any).rel) { (f as any).rel = 'enteredThisTurn'; p = p.replace(/ that entered (?:the battlefield )?this turn$/, ''); }
  {
    const tm = p.match(/ that's (?:an? )?([a-z-]+)(?:,? (?:or|and\/or) (?:an? )?([a-z-]+))$/);
    if (tm && !(tm[1] in COLOR_WORDS)) {
      const one = (w: string): any => (w === 'token' ? { token: true } : w === 'nontoken' ? { nontoken: true } : w === 'legendary' ? { supertypes: ['legendary'] } : SUBTYPES.has(singular(w)) ? { subtypes: [singular(w)] } : TYPE_WORDS.includes(w) ? { allTypes: [w] } : null);
      const a = one(tm[1]), b = one(tm[2]);
      if (a && b) { (f as any).anyOf = [a, b]; p = p.replace(tm[0], ''); }
    }
  }
  // "… that's black or red" / "… that's attacking or blocking" / "… that has a fate counter on it"
  {
    let mm: RegExpMatchArray | null;
    if ((mm = p.match(/ that's (white|blue|black|red|green)(?:,? (?:or|and\/or) (white|blue|black|red|green))?$/))) {
      f.colors = [COLOR_WORDS[mm[1]], ...(mm[2] ? [COLOR_WORDS[mm[2]]] : [])] as any;
      p = p.replace(mm[0], '');
    } else if (/ that's attacking or blocking$/.test(p)) { (f as any).inCombat = true; p = p.replace(/ that's attacking or blocking$/, ''); }
    else if ((mm = p.match(/ that has (?:a|an|one or more) ([+-]\d\/[+-]\d|[a-z]+) counters? on it$/))) { (f as any).hasCounter = mm[1]; p = p.replace(mm[0], ''); }
  }
  // controller / zone suffixes
  const ctrl: [RegExp, (f: Filter) => void][] = [
    [/ (?:that )?you control$/, (f) => (f.controller = 'you')],
    [/ you don't control$/, (f) => (f.controller = 'notYou')],
    [/ (?:an opponent|your opponents|target opponent|target player|that player|defending player) controls?$/, (f) => (f.controller = 'opp')],
    [/ you own$/, (f) => (f.owner = 'you')],
    [/ (?:in|from) your graveyard$/, (f) => { f.zone = 'graveyard'; f.owner = 'you'; }],
    [/ (?:in|from) (?:a|any) graveyard$/, (f) => { f.zone = 'graveyard'; f.owner = 'any'; }],
    [/ (?:in|from) (?:an opponent's|target player's|target opponent's) graveyard$/, (f) => { f.zone = 'graveyard'; f.owner = 'opp'; }],
    [/ (?:in|from) your hand$/, (f) => { f.zone = 'hand'; f.owner = 'you'; }],
  ];
  for (let pass = 0; pass < 2; pass++)
    for (const [re, fn] of ctrl) {
      if (re.test(p)) {
        fn(f);
        p = p.replace(re, '');
      }
    }

  // "with ..." suffixes
  let m: RegExpMatchArray | null;
  if ((m = p.match(/ with an? ([a-z-]+(?: [a-z]+)?) ability$/)) && !/activated|triggered|mana|loyalty/.test(m[1])) { (f as any).textHas = m[1]; p = p.replace(m[0], ''); }
  if ((m = p.match(/ with \{x\} in (?:its|their) mana costs?$/))) { (f as any).hasX = true; p = p.replace(m[0], ''); }
  if ((m = p.match(/ that's exactly (two|three) colors$/))) { (f as any).nColors = m[1] === 'two' ? 2 : 3; p = p.replace(m[0], ''); }
  if (/(^| )double-faced /.test(p)) { (f as any).dfc = true; p = p.replace(/(^| )double-faced /, '$1'); }
  if (/(^| )face-down /.test(p)) { (f as any).faceDown = true; p = p.replace(/(^| )face-down /, '$1'); }
  if ((m = p.match(/ named (~|[a-z][a-z' -]*?)$/)) && !/ or /.test(m[1])) { (f as any).name = m[1]; p = p.replace(m[0], ''); }

  if ((m = p.match(/ with (?:power|power) (\d+) or less$/))) { f.powerMax = +m[1]; p = p.replace(m[0], ''); }
  if ((m = p.match(/ with power (\d+) or greater$/))) { f.powerMin = +m[1]; p = p.replace(m[0], ''); }
  if ((m = p.match(/ with toughness (\d+) or less$/))) { f.toughnessMax = +m[1]; p = p.replace(m[0], ''); }
  if ((m = p.match(/ with toughness (\d+) or greater$/))) { f.toughnessMin = +m[1]; p = p.replace(m[0], ''); }
  if ((m = p.match(/ with (?:mana value|converted mana cost) (\d+) or less$/))) { f.cmcMax = +m[1]; p = p.replace(m[0], ''); }
  if ((m = p.match(/ with (?:mana value|converted mana cost) (\d+) or greater$/))) { f.cmcMin = +m[1]; p = p.replace(m[0], ''); }
  if ((m = p.match(/ with (?:mana value|converted mana cost) (\d+)$/))) { f.cmcMin = +m[1]; f.cmcMax = +m[1]; p = p.replace(m[0], ''); }
  if ((m = p.match(/ with (flying|reach|trample|deathtouch|lifelink|vigilance|haste|first strike|double strike|defender|menace|hexproof|indestructible|shadow|flash|infect|wither|toxic|ward|prowess|fear|intimidate|skulk|horsemanship|flanking|bushido|exalted|changeling|modular|persist|undying|cycling|kicker|mutate|islandwalk|swampwalk|forestwalk|mountainwalk|plainswalk|training|backup|ninjutsu|unearth|encore|embalm|eternalize|dash|evoke|morph|disguise|riot|afflict|annihilator|rampage|banding|phasing|myriad|melee|dethrone|renown|outlast|evolve|extort|battle cry|split second|storm|cascade|convoke|delve|affinity|devour|graft|bloodthirst|soulbond|haunt|living weapon|reconfigure|crew|offspring|ravenous|squad|blitz|decayed|daybound|nightbound|boast|foretell|disturb|exploit|fabricate|mentor|partner|companion|ascend|spectacle|surge|emerge|escalate|aftermath|jump-start|adapt|amass|bestow|monstrosity|tribute|inspired|heroic|horsemanship)$/))) {
    f.keyword = m[1];
    p = p.replace(m[0], '');
  }
  if ((m = p.match(/ without (flying|reach|trample|deathtouch|defender|haste)$/))) { f.noKeyword = m[1]; p = p.replace(m[0], ''); }
  // "creature you control with deathtouch": the controller phrase sits before the "with …" suffix
  for (const [re, fn] of ctrl) if (re.test(p)) { fn(f); p = p.replace(re, ''); }
  const isSpellOrCard = / (?:spells?|cards?)$/.test(p);
  if (/ spells?$/.test(p) && !/^spells?$/.test(p)) {
    f.zone = 'stack';
    p = p.replace(/ spells?$/, '');
  }
  if (/ cards?$/.test(p) && !/^cards?$/.test(p)) {
    p = p.replace(/ cards?$/, '');
    f.zone = f.zone ?? 'graveyard';
  }

  const words = p.split(/,? (?:and\/or|or|and) |, /).map((s) => s.trim()).filter(Boolean);
  const types: string[] = [];
  let subGroups = 0, subMulti = false;
  for (let w of words) {
    const parts = w.split(' ');
    const groupStart = types.length;
    const sub0 = f.subtypes?.length ?? 0;
    for (let raw of parts) {
      let x = singular(raw);
      if (x === 'other' || x === 'another') { f.other = true; continue; }
      if (x === 'tapped') { f.tapped = true; continue; }
      if (x === 'untapped') { f.untapped = true; continue; }
      if (x === 'attacking') { f.attacking = true; continue; }
      if (x === 'blocking') { f.blocking = true; continue; }
      if (x === 'blocked' || x === 'unblocked') { (f as any).blockedState = x; continue; }
      if (x === 'nontoken') { f.nontoken = true; continue; }
      if (x === 'token') { f.token = true; continue; }
      if (x === 'legendary' || x === 'basic' || x === 'snow') { (f.supertypes ??= []).push(x); continue; }
      if (x === 'nonbasic') { f.notTypes = [...(f.notTypes ?? []), 'basic']; continue; }
      if (x === 'colorless') { f.colorless = true; continue; }
      if (x === 'historic') { (f as any).historic = true; continue; }
      if (x === 'modified' && !(f as any).rel) { (f as any).rel = 'modified'; continue; }
      if ((x === 'equipped' || x === 'enchanted') && !(f as any).rel && /\b(?:creatures|permanents)\b/.test(phrase)) { (f as any).rel = x; continue; }
      if (x === 'outlaw') { f.subtypes = [...(f.subtypes ?? []), 'assassin', 'mercenary', 'pirate', 'rogue', 'warlock']; (f as any).subAny = true; continue; }
      if (x === 'commander') { (f as any).commander = true; if (!types.length) types.push('permanent'); continue; }
      if (x === 'multicolored') { f.multicolored = true; continue; }
      if (x === 'monocolored') { (f as any).monocolored = true; continue; }
      if (x in COLOR_WORDS) { (f.colors ??= []).push(COLOR_WORDS[x]); continue; }
      if (x.startsWith('non')) {
        const rest = x.slice(3).replace(/^-/, '');
        if (rest in COLOR_WORDS) (f.notColors ??= []).push(COLOR_WORDS[rest]);
        else (f.notTypes ??= []).push(rest);
        continue;
      }
      if (x === 'spell') { f.zone = 'stack'; types.push('spell'); continue; }
      if (x === 'ability' || x === 'activated' || x === 'triggered') return null;
      if (TYPE_WORDS.includes(x)) { types.push(x === 'tribal' ? 'kindred' : x); continue; }
      if (x === 'target' || x === 'each' || x === 'all' || x === 'of') continue;
      // only real subtypes: an unknown word means the phrase isn't a plain filter (it used to become a fake type)
      if (SUBTYPES.has(x)) { (f.subtypes ??= []).push(x); continue; }
      if (SUBTYPES.has(raw)) { (f.subtypes ??= []).push(raw); continue; }
      return null;
    }
    // "artifact creature", "enchantment creature": one group naming several card types means it has ALL of them.
    // ("artifact or creature" splits into two groups and stays any-of.) Keep the last type (the noun) in types.
    const dSub = (f.subtypes?.length ?? 0) - sub0;
    if (dSub > 0) { subGroups++; if (dSub > 1) subMulti = true; }
    const group = types.slice(groupStart).filter((t) => t !== 'spell');
    if (group.length > 1) {
      (f as any).allTypes = [...((f as any).allTypes ?? []), ...group];
      types.splice(groupStart, types.length - groupStart, group[group.length - 1]);
    }
  }
  if (types.length) f.types = types;
  if (subGroups > 1 && !subMulti) (f as any).subAny = true;
  if (!f.types && !f.subtypes && (f.notTypes || f.colors || f.notColors || f.multicolored || f.colorless || f.cmcMin != null || f.cmcMax != null) && (f.zone || isSpellOrCard)) f.types = [f.zone === 'stack' ? 'spell' : 'card'];
  // "historic" alone: a historic card / spell / permanent
  if (!f.types && !f.subtypes && (f as any).historic) f.types = [f.zone === 'stack' ? 'spell' : 'card'];
  if (!f.types && !f.subtypes) return null;
  return f;
}

export function spec(filter: Filter, count: number, upTo: boolean, label: string, players: TargetSpec['players'] = null): TargetSpec {
  return { filter, count, upTo, label, players };
}

// ---------------------------------------------------------------------------------------------
// Computed amounts ("for each …", "equal to the number of …", "where X is …")
// ---------------------------------------------------------------------------------------------

/** "creatures you control", "cards in your hand", "creature cards in your graveyard", "opponent you have" … */
export function parseCountPhrase(phrase: string): Amt | null {
  for (const f of EXT.amountPhrases) { const r = f(phrase.trim()); if (r) return r as Amt; }
  const plus = phrase.trim().match(/^(\d+|one|two|three|four|five) plus (.+)$/);
  if (plus) {
    const base = parseCountPhrase(plus[2]);
    const k = /^\d+$/.test(plus[1]) ? +plus[1] : ({ one: 1, two: 2, three: 3, four: 4, five: 5 } as any)[plus[1]];
    return base && typeof base === 'object' ? ({ ...base, add: k } as any) : null;
  }
  let p = phrase.trim().replace(/^the number of /, '').replace(/^(?:a|an) /, '');
  if (/^cards? in your hand$/.test(p)) return { zone: 'hand', who: 'you' };
  if (/^cards? in your graveyard$/.test(p)) return { zone: 'graveyard', who: 'you' };
  if (/^cards? in your library$/.test(p)) return { zone: 'library', who: 'you' };
  if (/^cards? in (?:target opponent's|that player's|an opponent's) hand$/.test(p)) return { zone: 'hand', who: 'opp' };
  if (/^(?:opponents? you have|opponent)$/.test(p)) return { opponents: true };
  let m = p.match(/^the greatest power among (.+)$/);
  if (m) {
    const f = parseFilter(m[1]);
    if (!f) return null;
    f.zone = f.zone ?? 'battlefield';
    return { maxPower: f };
  }
  // "the number of cards named ~ in all graveyards / your graveyard" (Accumulated Knowledge)
  m = p.match(/^cards? named ~ in (all graveyards|your graveyard)$/);
  if (m) return { count: { name: '~', zone: 'graveyard', types: ['card'], ...(m[1] === 'your graveyard' ? { owner: 'you' } : {}) } as any };
  // "for each Aura (and Equipment) attached to it"
  m = p.match(/^(auras?|equipment|auras? and(?:\/or)? equipment|auras? or equipment) attached to (?:it|~)$/);
  if (m) return { count: { subtypes: /aura/.test(m[1]) && /equipment/.test(m[1]) ? ['aura', 'equipment'] : /aura/.test(m[1]) ? ['aura'] : ['equipment'], zone: 'battlefield', attachedToSelf: true } as any };
  const f = parseFilter(p.replace(/ on the battlefield$/, ''));
  if (!f) return null;
  if (!f.zone) f.zone = 'battlefield';
  return { count: f };
}

/** "its power", "~'s power", "the number of …", a number word. */
export function parseAmtPhrase(phrase: string, ctx: Ctx): Amt | null {
  const p = phrase.trim();
  const n = num(p);
  if (n != null) return n;
  if (/^(?:its|~'s) power$/.test(p)) return { power: ctx.last ?? { t: 'self' } };
  if (/^(?:its|~'s) toughness$/.test(p)) return { toughness: ctx.last ?? { t: 'self' } };
  if (/^(?:its|that (?:creature|card|spell|artifact|enchantment|permanent|land|planeswalker|aura|equipment|vehicle|wall)'s) mana value$/.test(p)) return { cmc: ctx.last ?? { t: 'self' } };
  if (/^that (?:creature|permanent|vehicle|wall)'s power$/.test(p)) return { power: ctx.last ?? { t: 'self' } };
  return parseCountPhrase(p);
}

function withMult(a: Amt, mult: number): Amt {
  if (typeof a === 'object') return { ...a, mult: (a.mult ?? 1) * mult } as Amt;
  return a;
}

/** Replace fixed numbers (or X) in effect amounts with a computed amount. */
function scaleEffects(effs: Effect[], by: Amt, onlyX: boolean): boolean {
  let changed = false;
  const fix = (v: any): any => {
    if (onlyX) {
      if (v === 'X') { changed = true; return by; }
      return v;
    }
    if (typeof v === 'number' && v !== 0) { changed = true; return withMult(by, v); }
    return v;
  };
  for (const e of effs as any[]) {
    if (e.k === 'may' || e.k === 'if' || e.k === 'delayed') { if (scaleEffects(e.effects, by, onlyX)) changed = true; continue; }
    for (const key of ['n', 'p', 't', 'mvMax']) if (key in e) e[key] = fix(e[key]);
  }
  return changed;
}

// ---------------------------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------------------------

export function parseCond(text: string): Cond | null {
  const c = text.trim().replace(/\.$/, '');
  for (const f of EXT.conds) {
    const r = f(c);
    if (r) return r;
  }
  let m: RegExpMatchArray | null;
  if (/^you(?:'ve| have) completed a dungeon$/.test(c)) return { k: 'completedDungeon' };
  const parts = c.split(/ and (?=(?:you|it|~|there|an opponent))/);
  if (parts.length > 1) {
    const conds = parts.map(parseCond);
    return conds.every(Boolean) ? { k: 'and', conds: conds as Cond[] } : null;
  }
  if (/^(?:~|it|this spell) was kicked$/.test(c)) return { k: 'kicked' };
  if (/^it's your turn$/.test(c)) return { k: 'yourTurn' };
  if (/^it's not your turn$/.test(c)) return { k: 'yourTurn', not: true };
  if (/^no spells were cast last turn$/.test(c)) return { k: 'noSpellsLastTurn' };
  if (/^a player cast two or more spells last turn$/.test(c)) return { k: 'twoSpellsLastTurn' };
  if (/^it's day$/.test(c)) return { k: 'day' };
  if (/^it's night$/.test(c)) return { k: 'night' };
  if ((m = c.match(/^(?:~|it) is (equipped|enchanted|attacking|blocking|tapped|untapped|attacking or blocking)$/))) {
    const st = m[1] === 'attacking or blocking' ? 'attackingOrBlocking' : m[1];
    return { k: 'self', state: st as any };
  }
  if ((m = c.match(/^you control (\w+) or more (.+)$/))) {
    const f = parseFilter(m[2]);
    return f ? { k: 'control', filter: { ...f, zone: 'battlefield', controller: 'you' }, n: numN(m[1]) } : null;
  }
  if ((m = c.match(/^you control (?:a|an|another) (.+)$/))) {
    const f = parseFilter(m[1]);
    if (!f) return null;
    if (/^you control another/.test(c)) f.other = true;
    return { k: 'control', filter: { ...f, zone: 'battlefield', controller: 'you' }, n: 1 };
  }
  if ((m = c.match(/^you control no (.+)$/))) {
    const f = parseFilter(m[1]);
    return f ? { k: 'control', filter: { ...f, zone: 'battlefield', controller: 'you' }, n: 0, max: true } : null;
  }
  if ((m = c.match(/^an opponent controls (?:a|an) (.+)$/))) {
    const f = parseFilter(m[1]);
    return f ? { k: 'control', filter: { ...f, zone: 'battlefield', controller: 'opp' }, n: 1 } : null;
  }
  if ((m = c.match(/^there are (\w+) or more (.*?)cards? in your graveyard$/))) {
    const f = m[2].trim() ? parseFilter(m[2].trim()) : null;
    if (m[2].trim() && !f) return null;
    return { k: 'zoneCount', zone: 'graveyard', n: numN(m[1]), filter: f ? { ...f, zone: 'graveyard', owner: 'you' } : undefined };
  }
  if ((m = c.match(/^(?:you have )?(\w+) or more cards? (?:are )?in your graveyard$/))) return { k: 'zoneCount', zone: 'graveyard', n: numN(m[1]) };
  if ((m = c.match(/^you have (\w+) or more cards in hand$/))) return { k: 'zoneCount', zone: 'hand', n: numN(m[1]) };
  if (/^you have no cards in hand$/.test(c)) return { k: 'zoneCount', zone: 'hand', n: 0, max: true };
  if ((m = c.match(/^you have (\w+) or (more|less) life$/))) return { k: 'life', who: 'you', n: numN(m[1]), max: m[2] === 'less' };
  if ((m = c.match(/^you have at least (\w+) life more than your starting life total$/))) return { k: 'life', who: 'you', n: 20 + numN(m[1]) };
  if ((m = c.match(/^an opponent has (\w+) or (more|less) life$/))) return { k: 'life', who: 'opp', n: numN(m[1]), max: m[2] === 'less' };
  if ((m = c.match(/^(?:~|it) has no ([+-]\d\/[+-]\d|[a-z]+) counters on it$/))) return { k: 'noCounter', counter: m[1] };
  return null;
}

// ---------------------------------------------------------------------------------------------
// Subjects
// ---------------------------------------------------------------------------------------------

interface Ctx {
  specs: TargetSpec[];
  last?: Subject;
  lastPlayer?: Subject;
  selfName: string;
}

export function parseSubject(phrase: string, ctx: Ctx): Subject | null {
  let p = phrase.trim();
  let m: RegExpMatchArray | null;
  // names given by an earlier "Choose target creature you control and target creature an opponent controls."
  const named = (ctx as any).named as Record<string, Subject> | undefined;
  if (named?.[p]) return named[p];
  // "creatures you control with flying" → "creatures with flying you control"
  if ((m = p.match(/^(.+?) (you control|your opponents control|you don't control) (with .+|that are (?:enchanted|equipped|tapped|untapped|attacking))$/))) {
    const q = m[3].replace(/^that are /, '');
    const alt = /^with /.test(q) ? `${m[1]} ${q} ${m[2]}` : `${q} ${m[1]} ${m[2]}`;
    const r = parseSubject(alt, ctx);
    if (r) return r;
  }
  if (p === '~') return { t: 'self' };
  if (['it', 'that creature', 'that permanent', 'that card', 'them', 'those creatures', 'that spell', 'the creature', 'that land', 'those cards', 'those permanents', 'the exiled permanents', 'that artifact', 'that enchantment', 'that planeswalker', 'the permanent'].includes(p)) return ctx.last ?? null;
  if (p === 'you' || p === 'your') return { t: 'you' };
  if (p === 'each opponent' || p === 'each of your opponents' || p === 'your opponents' || p === 'your opponent') return { t: 'eachOpp' };
  if (p === 'each player' || p === 'each players') return { t: 'eachPlayer' };
  if (p === 'defending player') return { t: 'defending' };
  if (p === 'enchanted creature' || p === 'enchanted permanent' || p === 'enchanted land' || p === 'enchanted artifact') return { t: 'enchanted' };
  if (p === 'equipped creature') return { t: 'equipped' };
  if (/^(?:the exiled (?:card|cards|permanent|creature)|all cards exiled with ~)$/.test(p)) return { t: 'linkedExiled' };
  if (/^(?:the token|those tokens|that token)$/.test(p)) return { t: 'lastToken' };
  if (/^(?:each creature blocking it|each creature blocking ~|creatures blocking it)$/.test(p)) return { t: 'blockers' };
  if ((['its controller', "that creature's controller", "that permanent's controller", "that spell's controller"].includes(p) || /^(?:that|the) (?:artifact|enchantment|land|planeswalker|creature|permanent|aura|equipment|vehicle|wall)'s controller$/.test(p)) && ctx.last)
    return { t: 'controllerOf', of: ctx.last };
  if ((["its owner", "that creature's owner"].includes(p) || /^(?:that|the) (?:artifact|enchantment|land|card|permanent)'s owner$/.test(p)) && ctx.last) return { t: 'ownerOf', of: ctx.last };
  if (p === 'that player' && ctx.lastPlayer) return ctx.lastPlayer;
  if (p === 'any target' || p === 'any other target') {
    ctx.specs.push(spec({ types: ['creature', 'planeswalker', 'battle'], ...(p === 'any other target' ? { other: true } : {}) }, 1, false, p, 'any'));
    return { t: 'target', spec: ctx.specs.length - 1 };
  }
  // "creatures target player controls", "each creature target opponent controls", "all lands target player controls"
  if ((m = p.match(/^(?:(?:each|all) )?(.+?) (target player|target opponent) controls$/))) {
    const f = parseFilter(m[1].replace(/ and\/or /g, ' or '));
    if (f && !(f as any).controller) {
      ctx.specs.push(spec({ types: [] }, 1, false, m[2], m[2] === 'target opponent' ? 'opp' : 'any'));
      const tp: Subject = { t: 'target', spec: ctx.specs.length - 1 };
      ctx.lastPlayer = tp;
      f.zone = 'battlefield';
      return { t: 'all', filter: f, ofPlayer: tp } as any;
    }
  }
  // "any number of target creatures" (strive, etc.)
  if ((m = p.match(/^any number of (other )?target (.+)$/))) {
    const rest = m[2].replace(/ and\/or /g, ' or ');
    const one = rest.replace(/\b(creature|artifact|enchantment|permanent|land|planeswalker|player|opponent|spell|card)s\b/g, '$1');
    if (/^(?:player|opponent)$/.test(one)) {
      ctx.specs.push(spec({ types: [] }, 99, true, `any number of target ${rest}`, one === 'opponent' ? 'opp' : 'any'));
      return { t: 'target', spec: ctx.specs.length - 1 };
    }
    const f = parseFilter(one);
    if (!f) return null;
    if (m[1]) f.other = true;
    ctx.specs.push(spec(f, 99, true, `any number of target ${rest}`, null));
    const s: Subject = { t: 'target', spec: ctx.specs.length - 1 };
    ctx.last = s;
    return s;
  }
  if ((m = p.match(/^(?:up to (\w+) )?(?:(\w+) )?(?:other )?target (.+)$/))) {
    const upTo = !!m[1];
    const count = numN(m[1] ?? m[2], 1);
    const rest = m[3];
    if (/^(player|opponent)s?$/.test(rest)) {
      ctx.specs.push(spec({ types: [] }, count, upTo, `target ${rest}`, rest.startsWith('opp') ? 'opp' : 'any'));
      const s: Subject = { t: 'target', spec: ctx.specs.length - 1 };
      ctx.lastPlayer = s;
      return s;
    }
    if (/^(player|opponent) or planeswalker$/.test(rest)) {
      ctx.specs.push(spec({ types: ['planeswalker'] }, count, upTo, `target ${rest}`, rest.startsWith('opp') ? 'opp' : 'any'));
      const s: Subject = { t: 'target', spec: ctx.specs.length - 1 };
      ctx.lastPlayer = s; // "… and each creature that player or that planeswalker's controller controls"
      return s;
    }
    // "target player and each creature that player controls" is two subjects, not one target
    if (/ and (?:each|all|target|~|you|that)\b/.test(rest)) return null;
    let players: TargetSpec['players'] = null;
    let r2 = rest;
    if (/(?:,| or) player(?: or planeswalker)?$/.test(r2) || /and\/or player/.test(r2)) {
      players = 'any';
      r2 = r2.replace(/,? (?:and\/)?or player$/, '').replace(/, player,? or planeswalker$/, ' or planeswalker');
    }
    if (/ or opponent$/.test(r2)) {
      players = 'opp';
      r2 = r2.replace(/ or opponent$/, '');
    }
    const f = parseFilter(r2);
    if (!f) return null;
    if (phrase.includes('other target')) f.other = true;
    ctx.specs.push(spec(f, count, upTo, `target ${rest}`, players));
    const s: Subject = { t: 'target', spec: ctx.specs.length - 1 };
    ctx.last = s;
    return s;
  }
  if ((m = p.match(/^(?:each|all) (.+?) each opponent controls$/))) {
    const f = parseFilter(m[1]);
    if (f && !(f as any).controller) { f.zone = 'battlefield'; f.controller = 'notYou' as any; return { t: 'all', filter: f }; }
  }
  if ((m = p.match(/^(?:each|all) (.+?) (?:that player|that player or that planeswalker's controller|they) controls?$/)) && ctx.lastPlayer) {
    const f = parseFilter(m[1].replace(/ and planeswalker$/, ' or planeswalker'));
    if (f) { f.zone = 'battlefield'; delete (f as any).controller; return { t: 'all', filter: f, ofPlayer: ctx.lastPlayer } as any; }
  }
  if ((m = p.match(/^(?:each|all) (.+)$/))) {
    let rest = m[1];
    let players: 'any' | 'opp' | 'you' | undefined;
    if ((m = rest.match(/^(.+?) and each (player|opponent)$/))) {
      players = m[2] === 'player' ? 'any' : 'opp';
      rest = m[1];
    }
    const f = parseFilter(rest);
    if (!f) return null;
    f.zone = f.zone ?? 'battlefield';
    return { t: 'all', filter: f, players };
  }
  if ((m = p.match(/^(?:other )?(.+?) (?:you control|your opponents control|you don't control)$/))) {
    const f = parseFilter(p);
    if (!f) return null;
    return { t: 'all', filter: f };
  }
  // "creatures you control with counters on them", "creatures you control that are enchanted"
  if ((m = p.match(/^(?:other )?(?:creatures|permanents|lands|artifacts) you control (?:with|that) .+$/))) {
    const f = parseFilter(p);
    if (f && !f.zone) { f.zone = 'battlefield'; if (/^other /.test(p)) f.other = true; return { t: 'all', filter: f }; }
  }
  if ((m = p.match(/^(creatures|lands|artifacts|enchantments|permanents|nonland permanents)$/))) {
    const f = parseFilter(p);
    if (f) return { t: 'all', filter: f };
  }
  // "other attacking creatures", "blocking creatures", "tapped creatures", "white creatures", "nontoken creatures"
  if (/^(?:other )?(?:(?:attacking|blocking|tapped|untapped|nontoken|white|blue|black|red|green|colorless|multicolored|legendary|non[a-z]+) )+(?:creatures|lands|artifacts|permanents)$/.test(p)) {
    const f = parseFilter(p);
    if (f && !f.zone) { f.zone = 'battlefield'; return { t: 'all', filter: f }; }
  }
  return null;
}

export function parsePlayerSubject(p: string, ctx: Ctx): Subject | null {
  p = p.trim();
  if (p === 'you') return { t: 'you' };
  if (p === 'each opponent') return { t: 'eachOpp' };
  if (p === 'each player') return { t: 'eachPlayer' };
  if (p === 'target player' || p === 'target opponent') return parseSubject(p, ctx);
  if (p === 'that player' && ctx.lastPlayer) return ctx.lastPlayer;
  if (p === 'defending player') return { t: 'defending' };
  if (p === 'its controller' && ctx.last) return { t: 'controllerOf', of: ctx.last };
  if (p === "its owner" && ctx.last) return { t: 'ownerOf', of: ctx.last };
  if (/^that (?:creature|permanent|spell|land|artifact|enchantment|planeswalker)'s controller$/.test(p) && ctx.last) return { t: 'controllerOf', of: ctx.last };
  if (/^(enchanted|equipped) (?:creature|permanent|land)'s controller$/.test(p)) return { t: 'controllerOf', of: { t: p.startsWith('enchanted') ? 'enchanted' : 'equipped' } } as any;
  if (/^that (?:creature|permanent|spell|card|land|artifact|enchantment)'s owner$/.test(p) && ctx.last) return { t: 'ownerOf', of: ctx.last };
  return null;
}

// ---------------------------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------------------------

export const PREDEFINED_TOKENS: Record<string, TokenSpec> = {
  treasure: { name: 'Treasure', colors: [], types: 'Token Artifact — Treasure', keywords: [], oracle: '{T}, Sacrifice ~: Add one mana of any color.' },
  food: { name: 'Food', colors: [], types: 'Token Artifact — Food', keywords: [], oracle: '{2}, {T}, Sacrifice ~: You gain 3 life.' },
  clue: { name: 'Clue', colors: [], types: 'Token Artifact — Clue', keywords: [], oracle: '{2}, Sacrifice ~: Draw a card.' },
  blood: { name: 'Blood', colors: [], types: 'Token Artifact — Blood', keywords: [], oracle: '{1}, {T}, Discard a card, Sacrifice ~: Draw a card.' },
  gold: { name: 'Gold', colors: [], types: 'Token Artifact — Gold', keywords: [], oracle: 'Sacrifice ~: Add one mana of any color.' },
  map: { name: 'Map', colors: [], types: 'Token Artifact — Map', keywords: [], oracle: '' },
  powerstone: { name: 'Powerstone', colors: [], types: 'Token Artifact — Powerstone', keywords: [], oracle: '{T}: Add {C}.' },
  shard: { name: 'Shard', colors: [], types: 'Token Enchantment — Shard', keywords: [], oracle: '{2}, Sacrifice ~: Scry 1. Draw a card.' },
};

export function parseToken(desc: string, withText?: string): TokenSpec | null {
  let d = desc.trim().replace(/^(tapped|untapped) /, '');
  const key = d.replace(/ artifact$/, '').trim();
  if (PREDEFINED_TOKENS[key]) return { ...PREDEFINED_TOKENS[key] };
  const m = d.match(/^(?:legendary )?(\d+|x)\/(\d+|x) (.+?) creature$/) ?? d.match(/^(?:legendary )?(\d+|x)\/(\d+|x) (.+)$/);
  if (!m) return null;
  const words = m[3].split(' ');
  const colors: string[] = [];
  const types: string[] = [];
  const subtypes: string[] = [];
  for (const w of words) {
    if (w in COLOR_WORDS) colors.push(COLOR_WORDS[w]);
    else if (w === 'colorless' || w === 'and') continue;
    else if (['artifact', 'enchantment', 'creature', 'land'].includes(w)) types.push(w[0].toUpperCase() + w.slice(1));
    else subtypes.push(w[0].toUpperCase() + w.slice(1));
  }
  types.push('Creature');
  const keywords: string[] = [];
  let oracle = '';
  if (withText) {
    const kw = withText.replace(/"[^"]*"/g, '').split(/,? and |, /).map((s) => s.trim()).filter((s) => KEYWORDS.includes(s));
    keywords.push(...kw);
    const quoted = withText.match(/"([^"]*)"/);
    if (quoted) oracle = quoted[1];
  }
  return {
    name: subtypes.join(' ') || 'Creature',
    power: m[1],
    toughness: m[2],
    colors,
    types: `Token ${[...new Set(types)].join(' ')} — ${subtypes.join(' ')}`,
    keywords,
    oracle: [keywords.map((k) => k[0].toUpperCase() + k.slice(1)).join(', '), oracle].filter(Boolean).join('\n'),
  };
}

// ---------------------------------------------------------------------------------------------
// Effect sentences
// ---------------------------------------------------------------------------------------------

type Rule = [RegExp, (m: RegExpMatchArray, ctx: Ctx) => Effect[] | null];

const AMT = '(\\d+|x|a|an|one|two|three|four|five|six|seven|eight|nine|ten|that many)';

export function amt(s: string): Amt {
  return num(s) ?? 1;
}

const RULES: Rule[] = [
  // randomness
  [/^flip a coin$/, () => [{ k: 'flip' }]],
  [/^roll (?:an? )?(?:d(\d+)|(four|six|eight|ten|twelve|twenty)-sided die)$/, (m) => {
    const W: Record<string, number> = { four: 4, six: 6, eight: 8, ten: 10, twelve: 12, twenty: 20 };
    return [{ k: 'roll', sides: m[1] ? +m[1] : W[m[2]], table: [] }];
  }],
  // choices stored on the permanent
  [/^(?:as ~ enters(?: the battlefield)?, )?choose a (color|creature type|card type|basic land type)$/, (m) => [{ k: 'choose', what: m[1] === 'color' ? 'color' : m[1] === 'creature type' ? 'creatureType' : m[1] === 'card type' ? 'cardType' : 'landType' }]],
  [new RegExp(`^add ${AMT} mana of the chosen color$`), (m) => [{ k: 'addMana', colors: 'chosen' as any, n: numN(m[1]) }]],
  // copying spells
  [/^copy (target (?:instant or sorcery |instant |sorcery |activated or triggered )?(?:spell|ability)(?: you control)?|that spell|it|~)(?: (twice|three times|x times))?$/, (m, ctx) => {
    const what: Subject | null = m[1] === '~' ? { t: 'self' } : m[1] === 'it' || m[1] === 'that spell' ? { t: 'triggerObj' } : parseSubject(m[1], ctx);
    if (!what) return null;
    const n: Amt = m[2] === 'twice' ? 2 : m[2] === 'three times' ? 3 : m[2] === 'x times' ? 'X' : 1;
    return [{ k: 'copySpell', what, n }];
  }],
  [/^you may choose new targets for the cop(?:y|ies)$/, () => []],
  // the dungeon and the initiative
  [/^venture into the dungeon$/, () => [{ k: 'venture' }]],
  [/^you take the initiative$/, () => [{ k: 'venture', initiative: true }]],
  // payments ("you may pay {1}. If you do, …")
  [/^pay ((?:\{[^}]+\})+)$/, (m) => [{ k: 'pay', cost: m[1].toUpperCase() }]],
  [/^pay (\d+) life$/, (m) => [{ k: 'lose', n: +m[1], who: { t: 'you' } }]],
  // regeneration shields
  [/^regenerate (.+)$/, (m, ctx) => {
    const what = m[1] === '~' ? ({ t: 'self' } as Subject) : parseSubject(m[1], ctx);
    return what ? [{ k: 'regen', what }] : null;
  }],
  // the monarch
  [/^you become the monarch$/, () => [{ k: 'monarch' }]],
  // prevention shields
  [/^prevent the next (\d+|x) damage that would be dealt to (.+?) this turn$/, (m, ctx) => {
    const to = splitSubjects(m[2], ctx);
    return to ? [{ k: 'preventNext', n: amt(m[1]), to }] : null;
  }],
  // evasion for a turn
  [/^(.+?) can't be blocked this turn$/, (m, ctx) => {
    const what = m[1] === '~' ? ({ t: 'self' } as Subject) : parseSubject(m[1], ctx);
    return what ? [{ k: 'pump', what, p: 0, t: 0, kw: ['unblockable'], eot: true }] : null;
  }],
  // "It gains haste." / "They gain haste until end of turn." — refers to what was just created or returned
  [/^(it|they|that creature|those creatures|the token|the tokens|that token|those tokens) gains? (.+?)( until end of turn)?$/, (m, ctx) => {
    const kws = parseKeywordList(m[2]);
    if (!kws || !ctx.last) return null;
    return [{ k: 'pump', what: ctx.last, p: 0, t: 0, kw: kws, eot: !!m[3] }];
  }],
  // delayed clean-up of temporary creatures
  [/^(sacrifice|exile) (it|them|that creature|those creatures|that token|those tokens|the token|the tokens) at the beginning of the next end step$/, (m, ctx) => {
    const what = ctx.last ?? ({ t: 'lastToken' } as Subject);
    return [{ k: 'delayed', at: 'nextEnd', effects: [m[1] === 'sacrifice' ? { k: 'sacObj', what } : { k: 'exile', what }] }];
  }],
  [/^(?:at the beginning of the next turn's upkeep, )?draw a card(?: at the beginning of the next turn's upkeep)?$/, (m) => (/upkeep/.test(m[0]) ? [{ k: 'delayed', at: 'nextUpkeep', effects: [{ k: 'draw', n: 1, who: { t: 'you' } }] }] : null)],
  // self-recursion
  [/^return ~ from your graveyard to (your hand|the battlefield)( tapped)?$/, (m) => [{ k: 'reanimate', what: { t: 'self' }, dest: m[1] === 'your hand' ? 'hand' : 'battlefield', tapped: !!m[2] }]],
  [/^if you search your library this way, shuffle$/, () => []],
  // mana
  [/^add (\{[wubrgc]\}), (\{[wubrgc]\}), or (\{[wubrgc]\})$/, (m) => [{ k: 'addMana', colors: [m[1][1], m[2][1], m[3][1]].map((c) => c.toUpperCase()) as Color[], n: -1 }]],
  [/^add (\{[wubrgc]\})( plus one more)? for each [a-z]+ counter removed this way$/, (m) => [{ k: 'addMana', colors: [m[1][1].toUpperCase()], n: 1, perRemoved: true, plus1: !!m[2] } as any]],
  [new RegExp(`^add ${AMT} mana in any combination of ((?:\\{[wubrg]\\}, )*\\{[wubrg]\\},? and/or \\{[wubrg]\\})$`), (m) => {
    const cols = (m[2].match(/\{([wubrg])\}/g) ?? []).map((x) => x[1].toUpperCase());
    return m[1] === 'x' ? [{ k: 'addMana', colors: cols, n: 1, perRemoved: true, combo: cols } as any] : [{ k: 'addMana', colors: cols, n: numN(m[1]), combo: cols } as any];
  }],
  [new RegExp(`^add ${AMT} mana in any combination of colors$`), (m) => [{ k: 'addMana', colors: 'any', n: numN(m[1]) }]],
  // revealing hands
  [/^(target opponent|target player|each opponent|that player|defending player) reveals (?:their|his or her) hand$/, (m, ctx) => {
    const who = parsePlayerSubject(m[1], ctx);
    return who ? [{ k: 'revealHand', who }] : null;
  }],
  // damage
  [new RegExp(`^(~|it|that creature|target creature you control|enchanted creature|equipped creature) deals? ${AMT} damage to (.+?)$`), (m, ctx) => {
    const from = m[1] === '~' ? ({ t: 'self' } as Subject) : parseSubject(m[1], ctx);
    const tos = splitSubjects(m[3], ctx);
    if (!tos || !from) return null;
    return [{ k: 'damage', n: amt(m[2]), to: tos, from }];
  }],
  [/^(~|it|target creature you control|that creature) deals damage equal to (?:its|~'s) power to (.+)$/, (m, ctx) => {
    const from = m[1] === '~' ? ({ t: 'self' } as Subject) : parseSubject(m[1], ctx);
    if (!from) return null;
    const tos = splitSubjects(m[2], ctx);
    if (!tos) return null;
    return [{ k: 'damage', n: { power: from }, to: tos, from }];
  }],
  [new RegExp(`^deal ${AMT} damage to (.+)$`), (m, ctx) => {
    const tos = splitSubjects(m[2], ctx);
    return tos ? [{ k: 'damage', n: amt(m[1]), to: tos, from: { t: 'self' } }] : null;
  }],
  // draw
  [new RegExp(`^draw ${AMT} cards?$`), (m) => [{ k: 'draw', n: amt(m[1]), who: { t: 'you' } }]],
  [new RegExp(`^(you|target player|target opponent|each player|each opponent|that player|its controller) draws? ${AMT} cards?$`), (m, ctx) => {
    const who = parsePlayerSubject(m[1], ctx);
    return who ? [{ k: 'draw', n: amt(m[2]), who }] : null;
  }],
  // life
  [new RegExp(`^(you|target player|each player|each opponent|its controller|that player|target opponent|that (?:creature|permanent|spell|land|artifact)'s controller|enchanted (?:creature|permanent|land)'s controller|equipped creature's controller|its owner) gains? ${AMT} life$`), (m, ctx) => {
    const who = parsePlayerSubject(m[1], ctx);
    return who ? [{ k: 'gain', n: amt(m[2]), who }] : null;
  }],
  [new RegExp(`^gain ${AMT} life$`), (m) => [{ k: 'gain', n: amt(m[1]), who: { t: 'you' } }]],
  [new RegExp(`^(you|target player|target opponent|each opponent|each player|that player|its controller|defending player|that (?:creature|permanent|spell|land|artifact)'s controller|enchanted (?:creature|permanent|land)'s controller|equipped creature's controller|its owner) loses? ${AMT} life$`), (m, ctx) => {
    const who = parsePlayerSubject(m[1], ctx);
    return who ? [{ k: 'lose', n: amt(m[2]), who }] : null;
  }],
  [new RegExp(`^(each opponent|target player|target opponent|that player|its controller|defending player|that (?:creature|permanent|spell|land|artifact)'s controller|enchanted (?:creature|permanent|land)'s controller|equipped creature's controller|its owner) loses? ${AMT} life and you gain ${AMT} life$`), (m, ctx) => {
    const who = parsePlayerSubject(m[1], ctx);
    return who ? [{ k: 'lose', n: amt(m[2]), who }, { k: 'gain', n: amt(m[3]), who: { t: 'you' } }] : null;
  }],
  // removal
  [/^destroy (.+?)(?:\. (?:it|they) can't be regenerated)?$/, (m, ctx) => {
    const s = parseSubject(m[1], ctx);
    return s ? [{ k: 'destroy', what: s }] : null;
  }],
  [/^exile (.+?)(?: until .+)?$/, (m, ctx) => {
    if (/until/.test(m[0])) return null;
    const s = parseSubject(m[1], ctx);
    return s ? [{ k: 'exile', what: s }] : null;
  }],
  [/^return (.+?) to (?:its|their) owners?'s? hands?$/, (m, ctx) => {
    const s = parseSubject(m[1], ctx);
    return s ? [{ k: 'bounce', what: s }] : null;
  }],
  [/^put (.+?) on (top|the bottom) of (?:its|their) owners?'s? librar(?:y|ies)$/, (m, ctx) => {
    const s = parseSubject(m[1], ctx);
    return s ? [{ k: 'toLibrary', what: s, top: m[2] === 'top' }] : null;
  }],
  [/^return (.+?) to (your hand|the battlefield(?: under your control)?|the battlefield tapped(?: under your control)?)$/, (m, ctx) => {
    const s = parseSubject(m[1], ctx);
    if (!s) return null;
    return [{ k: 'reanimate', what: s, dest: m[2] === 'your hand' ? 'hand' : 'battlefield', tapped: m[2].includes('tapped') }];
  }],
  [/^counter (target .+?)(?: unless its controller pays \{(\d+)\})?$/, (m, ctx) => {
    const s = parseSubject(m[1], ctx);
    return s ? [{ k: 'counterSpell', what: s, unlessPay: m[2] ? +m[2] : undefined }] : null;
  }],
  // pump
  [/^(.+?) gets? ([+-]\d+|[+-]x)\/([+-]\d+|[+-]x)(?: and gains? (.+?))?( until end of turn)?$/, (m, ctx) => {
    const s = parseSubject(m[1], ctx);
    if (!s) return null;
    const pv = m[2].replace('+', '');
    const tv = m[3].replace('+', '');
    const kws = m[4] ? parseKeywordList(m[4]) : [];
    if (m[4] && !kws) return null;
    return [{ k: 'pump', what: s, p: pv.includes('x') ? 'X' : +pv, t: tv.includes('x') ? 'X' : +tv, kw: kws ?? [], eot: true, neg: pv.startsWith('-') && pv.includes('x') && (tv.startsWith('-') || !tv.includes('x')), ...(tv.startsWith('-') && tv.includes('x') && !pv.startsWith('-') ? { negT: true } : {}), ...(pv.startsWith('-') && pv.includes('x') && tv.includes('x') && !tv.startsWith('-') ? { neg: false, negP: true } : {}) } as any];
  }],
  [/^(.+?) gains? (.+?) until end of turn$/, (m, ctx) => {
    const s = parseSubject(m[1], ctx);
    const kws = parseKeywordList(m[2]);
    if (!s || !kws) return null;
    return [{ k: 'pump', what: s, p: 0, t: 0, kw: kws, eot: true }];
  }],
  [/^(.+?) can't block this turn$/, (m, ctx) => {
    const s = parseSubject(m[1], ctx);
    return s ? [{ k: 'cantBlock', what: s }] : null;
  }],
  // counters
  [new RegExp(`^put ${AMT} ([+-]\\d+\\/[+-]\\d+|[a-z]+) counters? on (.+)$`), (m, ctx) => {
    const s = parseSubject(m[3], ctx);
    return s ? [{ k: 'counters', what: s, counter: m[2], n: amt(m[1]) }] : null;
  }],
  // tokens
  [new RegExp(`^create ${AMT} (tapped )?(.+?) tokens?(?: with (.+?))?( that(?:'s| are) (?:tapped and )?attacking)?$`), (m, ctx) => {
    const tok = parseToken(m[3], m[4]);
    if (!tok) return null;
    ctx.last = { t: 'lastToken' };
    return [{ k: 'token', n: amt(m[1]), token: tok, who: { t: 'you' }, tapped: !!m[2] }];
  }],
  // tap / untap
  [/^(tap|untap) (.+)$/, (m, ctx) => {
    const s = parseSubject(m[2], ctx);
    return s ? [m[1] === 'tap' ? { k: 'tap', what: s } : { k: 'untap', what: s }] : null;
  }],
  [/^(?:it|that creature|that permanent|that land|that artifact|they) (?:doesn't|don't) untap during (?:its|their) controllers?'s? next untap steps?$/, (m, ctx) => (ctx.last ? [{ k: 'skipUntap', what: ctx.last }] : null)],
  // discard / mill
  [new RegExp(`^(you|target player|target opponent|each opponent|each player|that player) discards? ${AMT} cards?( at random)?$`), (m, ctx) => {
    const who = parsePlayerSubject(m[1], ctx);
    return who ? [{ k: 'discard', who, n: amt(m[2]), random: !!m[3] }] : null;
  }],
  [new RegExp(`^discard ${AMT} cards?( at random)?$`), (m) => [{ k: 'discard', who: { t: 'you' }, n: amt(m[1]), random: !!m[2] }]],
  [/^(you|target player|each player) discards? (?:your|their|his or her) hand$/, (m, ctx) => {
    const who = parsePlayerSubject(m[1], ctx);
    return who ? [{ k: 'discard', who, n: 99, hand: true }] : null;
  }],
  [/^discard your hand$/, () => [{ k: 'discard', who: { t: 'you' }, n: 99, hand: true }]],
  [new RegExp(`^(you|target player|target opponent|each opponent|each player) mills? ${AMT} cards?$`), (m, ctx) => {
    const who = parsePlayerSubject(m[1], ctx);
    return who ? [{ k: 'mill', who, n: amt(m[2]) }] : null;
  }],
  [new RegExp(`^mill ${AMT} cards?$`), (m) => [{ k: 'mill', who: { t: 'you' }, n: amt(m[1]) }]],
  [/^(scry|surveil) (\d+|x)$/, (m) => [{ k: m[1] as 'scry' | 'surveil', n: amt(m[2]) }]],
  // search
  [/^search your library for (?:up to (\w+) |(a|an|one|two|three) )?(.+?) cards?(?: with (?:different names|mana value \d+ or less))?(?:, reveal (?:it|them|those cards))?(?:,| and) put (?:it|them|that card|those cards|one of them) (onto the battlefield|into your hand|on top of your library)( tapped)?(?:, and put the other into your hand)?(?:,? then shuffle| then shuffle)?$/, (m) => {
    const f = parseFilter(m[3].replace(/ cards?$/, '')) ?? { types: ['card'] };
    f.zone = 'library';
    const n = numN(m[1] ?? m[2], 1);
    const dest = m[4].includes('battlefield') ? 'battlefield' : m[4].includes('hand') ? 'hand' : 'libraryTop';
    return [{ k: 'search', filter: f, n, dest, tapped: !!m[5], upTo: !!m[1] }];
  }],
  [/^(?:then )?shuffle(?: your library)?$/, () => [{ k: 'shuffle' }]],
  // mana
  [/^add ((?:\{[wubrgc]\})+)$/, (m) => [{ k: 'addMana', colors: (m[1].match(/\{([wubrgc])\}/g) ?? []).map((s) => s[1].toUpperCase() as Color), n: 1 }]],
  [/^add (\{[wubrgc]\}) or (\{[wubrgc]\})$/, (m) => [{ k: 'addMana', colors: [m[1][1].toUpperCase(), m[2][1].toUpperCase()] as Color[], n: -1 }]],
  [/^add one mana of any color that a land an opponent controls could produce$/, () => [{ k: 'addMana', colors: 'any', n: 1, dyn: 'oppLands' } as any]],
  [/^add one mana of any type that a land you control could produce$/, () => [{ k: 'addMana', colors: 'any', n: 1, dyn: 'myLands' } as any]],
  [/^add one mana of any of the exiled card's colors$/, () => [{ k: 'addMana', colors: 'any', n: 1, dyn: 'exiledColors' } as any]],
  [new RegExp(`^add ${AMT} mana of any color in your commander's color identity$`), (m) => [{ k: 'addMana', colors: 'any', n: numN(m[1]), identity: true } as any]],
  [new RegExp(`^add ${AMT} mana of any (?:one )?color$`), (m) => [{ k: 'addMana', colors: m[0].includes('any one') ? 'anyOne' : 'any', n: numN(m[1]) }]],
  // fight
  [/^(.+?) fights (.+)$/, (m, ctx) => {
    const a = parseSubject(m[1], ctx);
    const b = parseSubject(m[2], ctx);
    return a && b ? [{ k: 'fight', a, b }] : null;
  }],
  // sacrifice
  [new RegExp(`^(each player|each opponent|target player|target opponent|you|that player) sacrifices? ${AMT} (.+)$`), (m, ctx) => {
    const who = parsePlayerSubject(m[1], ctx);
    const f = parseFilter(m[3]);
    if (!who || !f) return null;
    f.zone = 'battlefield';
    return [{ k: 'sacrifice', who, filter: f, n: numN(m[2]) }];
  }],
  [/^sacrifice ~$/, () => [{ k: 'sacSelf' }]],
  [new RegExp(`^sacrifice ${AMT} (.+)$`), (m) => {
    const f = parseFilter(m[2]);
    if (!f) return null;
    f.zone = 'battlefield';
    f.controller = 'you';
    return [{ k: 'sacrifice', who: { t: 'you' }, filter: f, n: numN(m[1]) }];
  }],
  // control
  [/^gain control of (.+?)( until end of turn)?$/, (m, ctx) => {
    const s = parseSubject(m[1], ctx);
    return s ? [{ k: 'gainControl', what: s, eot: !!m[2] }] : null;
  }],
  [/^prevent all combat damage that would be dealt this turn$/, () => [{ k: 'fog' }]],
  [/^(?:it|they) can't be regenerated$/, () => []],
  [/^investigate$/, () => [{ k: 'token', n: 1, token: { ...PREDEFINED_TOKENS.clue }, who: { t: 'you' } }]],
  [/^investigate (twice|three times)$/, (m) => [{ k: 'token', n: m[1] === 'twice' ? 2 : 3, token: { ...PREDEFINED_TOKENS.clue }, who: { t: 'you' } }]],
  [/^proliferate$/, () => [{ k: 'proliferate' }]],
  [/^take an extra turn after this one$/, () => [{ k: 'extraTurn' }]],
  // counters keywords
  [/^adapt (\d+)$/, (m) => [{ k: 'adapt', n: +m[1] }]],
  [/^bolster (\d+)$/, (m) => [{ k: 'bolster', n: +m[1] }]],
  [/^support (\d+)$/, (m, ctx) => {
    ctx.specs.push(spec({ types: ['creature'], other: true }, +m[1], true, `up to ${m[1]} other target creatures`));
    return [{ k: 'counters', what: { t: 'target', spec: ctx.specs.length - 1 }, counter: '+1/+1', n: 1 }];
  }],
  [new RegExp(`^put ${AMT} ([+-]\\d+\\/[+-]\\d+|[a-z]+) counters? on each of (.+)$`), (m, ctx) => {
    const s2 = parseSubject(m[3].replace(/^up to (\w+) other target/, 'up to $1 other target'), ctx);
    return s2 ? [{ k: 'counters', what: s2, counter: m[2], n: amt(m[1]) }] : null;
  }],
  [/^put a number of ([+-]\d\/[+-]\d|[a-z]+) counters on (.+?) equal to (.+)$/, (m, ctx) => {
    const what = parseSubject(m[2], ctx);
    const n = parseAmtPhrase(m[3], ctx);
    return what && n != null ? [{ k: 'counters', what, counter: m[1], n }] : null;
  }],
  // player counters / energy
  [/^you get ((?:\{e\})+)$/, (m) => [{ k: 'energy', n: (m[1].match(/\{e\}/g) ?? []).length }]],
  [/^you get (\w+) \{e\}$/, (m) => [{ k: 'energy', n: amt(m[1]) }]],
  [new RegExp(`^(you|target player|target opponent|each opponent|each player|that player|defending player|its controller|that creature's controller) gets? ${AMT} (poison|experience|rad|ticket) counters?$`), (m, ctx) => {
    const who = parsePlayerSubject(m[1], ctx);
    return who ? [{ k: 'playerCounter', counter: m[3], n: amt(m[2]), who }] : null;
  }],
  // becomes a creature / base P/T / loses abilities
  [/^(?:until end of turn, )?(.+?) becomes? an? (\d+)\/(\d+) (?:(.+?) )?(?:artifact )?creature(?: with ([a-z, ]+?))?(?: until end of turn)?(?: that's still an? (?:land|artifact))?(?: until end of turn)?$/, (m, ctx) => {
    const what = parseSubject(m[1], ctx);
    if (!what) return null;
    const words = m[4] ? m[4].split(' ') : [];
    const colors: string[] = [];
    const subtypes: string[] = [];
    const types = ['creature'];
    if (/artifact creature/.test(m[0])) types.push('artifact');
    for (const w of words) {
      if (w in COLOR_WORDS) colors.push(COLOR_WORDS[w]);
      else if (w === 'and' || w === 'colorless') continue;
      else if (['artifact', 'enchantment', 'land'].includes(w)) types.push(w);
      else subtypes.push(singular(w));
    }
    const kw = m[5] ? parseKeywordList(m[5]) : [];
    if (m[5] && !kw) return null;
    const eot = /until end of turn/.test(m[0]);
    return [{ k: 'animate', what, p: +m[2], t: +m[3], types, subtypes, colors: colors.length ? colors : undefined, kw: kw ?? [], eot }];
  }],
  [/^it's still an? (?:land|artifact|enchantment)$/, () => []],
  [/^(.+?) loses all abilities( until end of turn)?$/, (m, ctx) => {
    const what = parseSubject(m[1], ctx);
    return what ? [{ k: 'loseAbilities', what, eot: !!m[2] }] : null;
  }],
  [/^(.+?) (?:has|have) base power and toughness (\d+)\/(\d+)( until end of turn)?$/, (m, ctx) => {
    const what = parseSubject(m[1], ctx);
    return what ? [{ k: 'setPT', what, p: +m[2], t: +m[3], eot: !!m[4] }] : null;
  }],
  // control
  [/^gain control of (.+?) for as long as you control ~$/, (m, ctx) => {
    const what = parseSubject(m[1], ctx);
    return what ? [{ k: 'gainControl', what, eot: false, whileYouControl: true }] : null;
  }],
  [/^exchange control of (.+?) and (.+)$/, (m, ctx) => {
    const a = parseSubject(m[1], ctx);
    const b = parseSubject(m[2], ctx);
    return a && b ? [{ k: 'exchangeControl', a, b }] : null;
  }],
  // copies
  [new RegExp(`^create ${AMT} (tapped )?tokens? that(?:'s| are) (?:a )?cop(?:y|ies) of (.+?)(?:, except .+)?$`), (m, ctx) => {
    const what = parseSubject(m[3], ctx);
    return what ? [{ k: 'tokenCopy', what, n: amt(m[1]), tapped: !!m[2] }] : null;
  }],
  [/^populate$/, () => [{ k: 'populate' }]],
  // impulse draw, linked exile, blink, delayed return
  [new RegExp(`^exile the top ${AMT} cards? of your library$`), (m, ctx) => {
    ctx.last = { t: 'exiledTop' };
    return [{ k: 'exileTop', n: amt(m[1]) }];
  }],
  [/^exile the top card of your library$/, (m, ctx) => {
    ctx.last = { t: 'exiledTop' };
    return [{ k: 'exileTop', n: 1 }];
  }],
  [/^exile (.+?) until ~ leaves the battlefield$/, (m, ctx) => {
    const what = parseSubject(m[1], ctx);
    return what ? [{ k: 'exile', what, linked: true }] : null;
  }],
  [/^return (?:the exiled (?:card|cards|permanent|permanents|creature)|all cards exiled with ~) to the battlefield under (?:its|their) owners?'s? control$/, () => [{ k: 'returnLinked' }]],
  [/^(?:at the beginning of the next end step, )?return (.+?) to the battlefield(?: tapped)?(?: under (?:its owner's|their owners'|their owner's|your|its owner’s) control)?( at the beginning of the next end step)?$/, (m, ctx) => {
    if (/transformed/.test(m[1])) return null;
    const what = parseSubject(m[1], ctx);
    if (!what) return null;
    const eff: Effect = { k: 'reanimate', what, dest: 'battlefield', tapped: / tapped/.test(m[0]), owner: /owner/.test(m[0]) };
    const delayed = /next end step/.test(m[0]);
    return delayed ? [{ k: 'delayed', at: 'nextEnd', effects: [eff] }] : [eff];
  }],
  [/^return (.+?) to the battlefield transformed under (?:its owner's|your) control$/, (m, ctx) => {
    const what = parseSubject(m[1], ctx);
    return what ? [{ k: 'reanimate', what, dest: 'battlefield', transformed: true, owner: /owner/.test(m[0]) }] : null;
  }],
  [/^return (.+?) to the battlefield with (a|an|one|two|three|\d+) ([+-]\d\/[+-]\d|[a-z]+) counters? on it$/, (m, ctx) => {
    const what = parseSubject(m[1], ctx);
    return what ? [{ k: 'reanimate', what, dest: 'battlefield', counters: { [m[3]]: numN(m[2]) } }] : null;
  }],
  // attach / transform / manifest
  [/^attach (~|it|that equipment|that aura) to (.+)$/, (m, ctx) => {
    const what = m[1] === '~' ? ({ t: 'self' } as Subject) : ctx.last ?? { t: 'self' };
    const to = parseSubject(m[2], ctx);
    return to ? [{ k: 'attach', what, to }] : null;
  }],
  [/^transform (~|it|that creature|target .+)$/, (m, ctx) => {
    const what = m[1] === '~' ? ({ t: 'self' } as Subject) : parseSubject(m[1], ctx);
    return what ? [{ k: 'transform', what }] : null;
  }],
  [/^(manifest|cloak) the top (card|two cards|three cards) of your library$/, (m) => [{ k: 'manifest', n: m[2] === 'card' ? 1 : m[2].startsWith('two') ? 2 : 3, cloak: m[1] === 'cloak' }]],
  [/^manifest dread$/, () => [{ k: 'manifest', n: 1, dread: true }]],
  // variable damage and amounts
  [/^(~|it|that creature|target creature you control) deals damage equal to (.+?) to (.+)$/, (m, ctx) => {
    const from = m[1] === '~' ? ({ t: 'self' } as Subject) : m[1] === 'it' ? ((ctx.last ?? { t: 'self' }) as Subject) : parseSubject(m[1], ctx);
    if (!from) return null;
    const saved = ctx.last;
    // "its power" is the source's; "that creature's power" / "the creature's power" is the object referred to before
    if (/^(?:its|~'s)\b/.test(m[2]) || !saved) ctx.last = from;
    const n = parseAmtPhrase(m[2].replace(/^the (creature|artifact|permanent|spell|card|land|wall)'s /, 'that $1\'s '), ctx);
    ctx.last = saved;
    const tos = splitSubjects(m[3].replace(/^the (creature|artifact|permanent|land|wall)'s controller$/, "that $1's controller"), ctx);
    return n != null && tos ? [{ k: 'damage', n, to: tos, from }] : null;
  }],
  [/^(~|it) deals (\d+|x) damage divided as you choose among (one, two, or three|one or two|any number of) targets$/, (m, ctx) => {
    const max = m[3] === 'one or two' ? 2 : m[3] === 'one, two, or three' ? 3 : 20;
    ctx.specs.push({ ...spec({ types: ['creature', 'planeswalker', 'battle'] }, max, false, 'targets (divide damage)', 'any'), divided: true });
    return [{ k: 'damage', n: amt(m[2]), to: [{ t: 'target', spec: ctx.specs.length - 1 }], from: { t: 'self' } }];
  }],
  [/^(you gain|gain|you lose|target player loses|each opponent loses) life equal to (.+)$/, (m, ctx) => {
    const n = parseAmtPhrase(m[2], ctx);
    if (n == null) return null;
    if (/gain/.test(m[1])) return [{ k: 'gain', n, who: { t: 'you' } }];
    const who = m[1] === 'you lose' ? ({ t: 'you' } as Subject) : parsePlayerSubject(m[1].replace(/ loses?$/, ''), ctx);
    return who ? [{ k: 'lose', n, who }] : null;
  }],
  [/^(its controller|that player|target player|each player|you) gains? life equal to (.+)$/, (m, ctx) => {
    const who = parsePlayerSubject(m[1], ctx);
    const n = parseAmtPhrase(m[2], ctx);
    return who && n != null ? [{ k: 'gain', n, who }] : null;
  }],
  [/^draw cards equal to (.+)$/, (m, ctx) => {
    const n = parseAmtPhrase(m[1], ctx);
    return n != null ? [{ k: 'draw', n, who: { t: 'you' } }] : null;
  }],
];

export function parseKeywordList(s: string): string[] | null {
  const parts = s.split(/,? and |, /).map((x) => x.trim()).filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    if (KEYWORDS.includes(p)) out.push(p);
    else if (/^protection from \w+$/.test(p)) out.push(p);
    else if (p === 'hexproof from \w+') out.push('hexproof');
    else return null;
  }
  return out;
}

export function splitSubjects(s: string, ctx: Ctx): Subject[] | null {
  const direct = parseSubject(s, ctx);
  if (direct) return [direct];
  const parts = s.split(/ and /);
  if (parts.length < 2) return null;
  // "each creature and planeswalker your opponents control": the controller suffix covers every object part
  const sufOf = () => parts[parts.length - 1].match(/ (?:you|your opponents|an opponent|they|that player|defending player|target player|target opponent) controls?$/);
  if (parts[0] === 'each opponent') for (let i = 1; i < parts.length; i++) parts[i] = parts[i].replace(/ they control$/, ' your opponents control');
  for (let i = 1; i < parts.length; i++) if (/^each /.test(parts[i - 1]) && /^(?:creature|planeswalker|battle|artifact|enchantment|land)s? /.test(parts[i])) parts[i] = `each ${parts[i]}`;
  const suf = sufOf();
  if (suf) for (let i = 0; i < parts.length - 1; i++) if (!/control|\bplayer\b|\bopponents?\b|^you$|^~$|^it$|^(?:any|that|target) |\btarget\b/.test(parts[i]) && !/^\d/.test(parts[i])) parts[i] += suf[0];
  const out: Subject[] = [];
  for (const p of parts) {
    if (/^\d+ damage to /.test(p)) return null;
    const sub = parseSubject(p, ctx);
    if (!sub) return null;
    out.push(sub);
  }
  return out;
}

export function parseSentence(s: string, ctx: Ctx): Effect[] | null {
  s = s.trim().replace(/\.$/, '');
  if (!s) return [];
  // handled by the copy effect itself (it always offers new targets)
  if (/^you may choose new targets for the cop(?:y|ies)$/.test(s)) return [];
  let m: RegExpMatchArray | null;
  // "…, where X is …"
  if ((m = s.match(/^(.+), where x is (.+)$/)) && (parseAmtPhrase(m[2], ctx) != null || !/^search your library/.test(s))) {
    const by = parseAmtPhrase(m[2], ctx);
    if (by == null) return null;
    const k0 = ctx.specs.length;
    const inner = parseSentence(m[1], ctx);
    if (!inner) return null;
    scaleEffects(inner, by, true);
    // "target creature card with mana value X or less …, where X is …": the target filter's X too
    for (let i = k0; i < ctx.specs.length; i++) { const d = (ctx.specs[i].filter as any)?.dynMax; if (d?.amt === 'X') (ctx.specs[i].filter as any).dynMax = { ...d, amt: by }; }
    for (const e of inner as any[]) { const d = e?.what?.filter?.dynMax ?? e?.filter?.dynMax; if (d?.amt === 'X') { if (e.what?.filter) e.what.filter.dynMax = { ...d, amt: by }; else e.filter.dynMax = { ...d, amt: by }; } }
    return inner;
  }
  // "… for each …"
  if ((m = s.match(/^(.+?) for each (.+)$/)) && !/^(?:choose|each)/.test(s)) {
    const by = parseCountPhrase(m[2]);
    if (by != null) {
      const inner = parseSentence(m[1], ctx);
      if (inner && scaleEffects(inner, by, false)) return inner;
    }
  }
  // impulse draw: "(until …), you may play/cast that card (this turn)"
  if ((m = s.match(/^(?:(until end of turn|until the end of your next turn|this turn), )?you may (?:play|cast) (?:that card|those cards|it|them|the exiled cards?|spells from among (?:them|those cards))(?: (this turn|until end of turn|until the end of your next turn))?( without paying (?:its|their) mana costs?)?(?: (this turn|until end of turn))?$/)) && !(m[3] && !(m[1] ?? m[2] ?? m[4]))) {
    const when = m[1] ?? m[2] ?? m[4] ?? 'this turn';
    return [{ k: 'mayPlay', what: ctx.last ?? { t: 'exiledTop' }, until: /next turn/.test(when) ? 'nextTurn' : 'eot', ...(m[3] ? { free: true } : {}) } as any];
  }
  if ((m = s.match(/^if you (win|lose) the flip, (.+)$/))) {
    const inner = parseSentence(m[2], ctx);
    return inner ? [{ k: 'if', cond: { k: 'flip', won: m[1] === 'win' }, effects: inner }] : null;
  }
  // "If you do, …" / "If you don't, …" refer back to an optional action or payment
  if ((m = s.match(/^(?:if|when) (?:you do|they do|that player does)(?: not|n't)?, (.+)$/)) || (m = s.match(/^otherwise, (.+)$/))) {
    const inner = parseSentence(m[1], ctx);
    if (!inner) return null;
    const not = /don't|doesn't| not,|^otherwise/.test(s);
    return [{ k: 'if', cond: { k: 'youDid', not }, effects: inner }];
  }
  // "if <condition>, <effect>"
  if ((m = s.match(/^if (.+?), (.+)$/))) {
    const cond = parseCond(m[1]);
    if (cond) {
      const inner = parseSentence(m[2], ctx);
      if (inner) return [{ k: 'if', cond, effects: inner }];
      return null;
    }
    // unknown condition: let the sentence rules (and plugins) try the whole sentence
  }
  // optional
  m = s.match(/^you may (.+)$/);
  if (m) {
    const inner = parseSentence(m[1], ctx);
    if (inner) return [{ k: 'may', effects: inner, text: m[1] }];
    return null;
  }
  for (const [re, fn] of EXT.rules) {
    const mm = s.match(re);
    if (mm) {
      const r = fn(mm, ctx);
      if (r) return r;
    }
  }
  for (const [re, fn] of RULES) {
    const mm = s.match(re);
    if (mm) {
      const r = fn(mm, ctx);
      if (r) return r;
    }
  }
  // compound clauses joined with "and"
  const clauses = s.split(/,? and (?=(?:you|target|each|~|it|its|that|draw|gain|create|put|return|exile|destroy|tap|untap|scry|mill|sacrifice|discard|surveil)\b)/);
  if (clauses.length > 1) {
    const all: Effect[] = [];
    for (const c of clauses) {
      const r = parseSentence(c, ctx);
      if (!r) return null;
      all.push(...r);
    }
    return all;
  }
  return null;
}

/** "If you both own and control ~ and a creature named X, exile them, then meld them into Y." */
function parseMeld(text: string): Effect | null {
  const m = text.trim().replace(/\.$/, '').match(/^if (?:(.+?) and )?you both own and control ~ and an? (?:creature|land|artifact|permanent) named (.+?), exile them, then meld them into (.+)$/s);
  if (!m) return null;
  const cond = m[1] ? parseCond(m[1]) ?? undefined : undefined;
  if (m[1] && !cond) return null;
  return { k: 'meld', partner: m[2], into: m[3], cond };
}

const DEST: Record<string, 'hand' | 'battlefield' | 'graveyard' | 'top' | 'bottom' | 'exile'> = {
  'into your hand': 'hand', 'onto the battlefield': 'battlefield', 'onto the battlefield tapped': 'battlefield', 'into your graveyard': 'graveyard',
  'on top of your library': 'top', 'on the bottom of your library': 'bottom', 'back on top of your library': 'top', 'back': 'top', 'into exile': 'exile',
};

function restDest(t: string): DigSpec['rest'] | null {
  t = t.replace(/ in (?:a random|any) order$/, '').trim();
  if (/^(?:on the )?bottom(?: of your library)?$/.test(t) || /^on the bottom(?: of your library)?$/.test(t)) return 'bottom';
  if (/^(?:back )?on top of your library$/.test(t) || t === 'back' || /^back on top$/.test(t)) return 'top';
  if (/^into your graveyard$/.test(t)) return 'graveyard';
  if (/^into your hand$/.test(t)) return 'hand';
  if (/^into exile$/.test(t)) return 'exile';
  return null;
}

/** Recognise "look at / reveal the top N cards of your library …" spread over several sentences. */
export function parseDig(sents: string[], i: number): { spec: DigSpec; end: number } | null {
  let head = sents[i].match(/^(look at|reveal) the top (\w+) cards of your library$/);
  let dynN: Amt | null = null;
  if (!head) {
    // "look at that many cards from the top of your library" (combat-damage triggers) / "… the top x cards …, where x is …"
    const tm = sents[i].match(/^(look at|reveal) that many cards from the top of your library$/);
    const xm = tm ? null : sents[i].match(/^(look at|reveal) the top x cards of your library, where x is (.+)$/);
    if (tm) dynN = { trigAmount: true } as any;
    else if (xm) dynN = parseAmtPhrase(xm[2], { specs: [] } as any);
    if (dynN != null) head = [sents[i], (tm ?? xm)![1], 'x'] as any;
  }
  if (!head) {
    const inline = sents[i].match(/^(look at|reveal) the top (\w+) cards of your library, (.+)$/);
    if (!inline) return null;
    const tmp = [...sents];
    tmp.splice(i, 1, `${inline[1]} the top ${inline[2]} cards of your library`, inline[3]);
    const r = parseDig(tmp, i);
    return r ? { spec: r.spec, end: r.end - 1 } : null;
  }
  const n = dynN ?? num(head[2]);
  if (n == null) return null;
  const spec: DigSpec = { n, reveal: head[1] === 'reveal', rest: 'bottom' };
  let j = i + 1;
  let restSet = false;
  for (; j < sents.length && j <= i + 3; j++) {
    let t = sents[j].replace(/^then /, '');
    let m: RegExpMatchArray | null;
    // "… onto the battlefield with a shield counter on it" (Elspeth Resplendent)
    const wc = t.match(/^(.+ onto the battlefield(?: tapped)?) with (a|an|one|two|three) ([a-z+\/0-9-]+) counters? on (?:it|them)$/);
    if (wc) { (spec as any).pickCounter = { kind: wc[3], n: num(wc[2]) ?? 1 }; t = wc[1]; }
    // "… and the rest …" in one sentence
    let exileRest = t.match(/^(.+?),? and exile the rest$/);
    if (exileRest) { spec.rest = 'exile'; restSet = true; t = exileRest[1]; }
    const andRest = exileRest ? null : t.match(/^(.+?),? and (?:put )?(?:the (?:rest|others?)(?: of (?:the revealed cards|them|those cards|the cards))?|all other cards revealed this way) (.+)$/);
    if (andRest) {
      const r = restDest(andRest[2]);
      if (!r) return null;
      spec.rest = r;
      restSet = true;
      t = andRest[1];
    }
    if (/^exile the rest$/.test(t)) { spec.rest = 'exile'; restSet = true; break; }
    if ((m = t.match(/^put (?:the (?:rest|others?)(?: of (?:them|those cards|the cards|the revealed cards))?|all other cards revealed this way) (.+)$/))) {
      const r = restDest(m[1]);
      if (!r) return null;
      spec.rest = r;
      restSet = true;
      break;
    }
    if (/^put them back in any order$/.test(t)) { spec.rest = 'top'; restSet = true; break; }
    if ((m = t.match(/^(you may )?(?:reveal|put) (a|an|one|two|three|up to \w+|any number of) (.+?) from among (?:them|those cards)(?: and put (?:it|them|that card|those cards|the revealed cards) (into your hand|onto the battlefield(?: tapped(?: and attacking)?)?|on top of your library)| (into your hand|onto the battlefield(?: tapped(?: and attacking)?)?|into your graveyard|on top of your library|on the bottom of your library))$/))) {
      const orParts = m[3].replace(/ cards?\b/g, '').split(/ or (?:a|an) /);
      if (orParts.length > 1) {
        // "a Mount creature card or a Plains card": either filter
        const fs = orParts.map((x) => { const pf = looseFilter(x.trim()) ?? parseFilter(x.trim() + ' card'); if (!pf) return null; const g: any = { ...pf }; delete g.zone; delete g.owner; return g; });
        if (fs.every(Boolean)) {
          const q = m[2];
          const dest = m[4] ?? m[5];
          spec.pick = { count: q === 'any number of' ? 99 : numN(q.replace(/^up to /, ''), 1), upTo: true, filter: { anyOf: fs } as any, dest: (DEST[dest.replace(' and attacking', '')] ?? 'hand') as any, tapped: /tapped/.test(dest), ...(/attacking/.test(dest) ? { attacking: true } : {}) } as any;
          if (restSet) break;
          continue;
        }
      }
      let ph = m[3].replace(/,? and\/or (?:a|an) /g, ' or ').replace(/, (?:a|an) /g, ', ').replace(/ and\/or /g, ' or ').replace(/ cards?\b/g, '').replace(/^cards?$/, '').trim();
      let f: Filter | undefined;
      if (ph && ph !== 'card') {
        const pf = looseFilter(ph) ?? parseFilter(ph + ' card');
        if (!pf) m = null;
        else { f = { ...pf }; delete f.zone; delete f.owner; }
      }
      if (m) {
      const q = m[2];
      const count = q === 'any number of' ? 99 : numN(q.replace(/^up to /, ''), 1);
      const dest = m[4] ?? m[5];
      spec.pick = { count, upTo: !!m[1] || /^up to|^any number/.test(q), filter: f, dest: (DEST[dest.replace(' and attacking', '')] ?? 'hand') as any, tapped: /tapped/.test(dest), ...(/attacking/.test(dest) ? { attacking: true } : {}) } as any;
      if (restSet) break;
      continue;
      }
    }
    if ((m = t.match(/^(?:you may )?(?:reveal (?:a|an|up to (\w+)) (.+?) cards? from among them(?: and put (?:it|them)|,? put (?:it|that card)) (into your hand|onto the battlefield(?: tapped)?)|put (a|an|up to \w+|one|two|three|any number) (?:(.+?) cards? from among them|of (?:them|those cards)) (into your hand|onto the battlefield(?: tapped)?|into your graveyard|on top of your library|on the bottom of your library))$/))) {
      if (m[3]) {
        const f = looseFilter(m[2]);
        if (!f) return null;
        spec.pick = { count: m[1] ? numN(m[1]) : 1, upTo: true, filter: f, dest: m[3].startsWith('into') ? 'hand' : 'battlefield', tapped: m[3].endsWith('tapped') };
      } else {
        const q = m[4];
        const upTo = /^up to|^any number|^you may/.test(q) || /^you may/.test(t);
        const count = q === 'any number' ? 99 : numN(q.replace(/^up to /, ''), 1);
        let f: Filter | undefined;
        if (m[5]) {
          const pf = looseFilter(m[5]);
          if (!pf) return null;
          f = pf;
        }
        spec.pick = { count, upTo: upTo || !!f, filter: f, dest: (DEST[m[6]] ?? 'hand') as any, tapped: m[6].endsWith('tapped') };
      }
      if (restSet) break;
      continue;
    }
    // "You may put one of those cards back on top of your library." / "Put two of them into your hand."
    if ((m = t.match(/^(you may )?put (one|two|three) of (?:them|those cards) (?:back )?(on top of your library|into your hand|into your graveyard|on the bottom of your library)$/))) {
      spec.pick = { count: numN(m[2], 1), upTo: !!m[1], dest: (DEST[m[3]] ?? 'hand') as any };
      if (restSet) break;
      continue;
    }
    // "You may exile a creature card from among them."
    if ((m = t.match(/^(you may )?exile (a|an|one|up to \w+|any number of) (?:(.+?) )?cards? from among (?:them|those cards)$/))) {
      let f: Filter | undefined;
      if (m[3]) { const pf = looseFilter(m[3]); if (!pf) return null; f = { ...pf }; delete f.zone; }
      const q = m[2];
      spec.pick = { count: q === 'any number of' ? 99 : numN(q.replace(/^up to /, ''), 1), upTo: !!m[1] || /^up to|^any number/.test(q), filter: f, dest: 'exile' as any };
      if (restSet) break;
      continue;
    }
    // "You may cast a spell from among them without paying its mana cost." (Aetherworks Marvel)
    if ((m = t.match(/^(?:you may )?cast (?:a|an|up to one) (?:(.+?) )?spell from among (?:them|those cards|the revealed cards|the exiled cards) without paying its mana cost$/))) {
      let f: Filter | undefined;
      if (m[1]) { const pf = looseFilter(m[1]); if (!pf) return null; f = { ...pf }; delete f.zone; }
      spec.pick = { count: 1, upTo: true, filter: f, dest: 'cast' };
      if (restSet) break;
      continue;
    }
    if ((m = t.match(/^put all (.+?) cards (?:revealed this way|from among them) (into your hand|onto the battlefield)$/))) {
      const f = looseFilter(m[1]);
      if (!f) return null;
      spec.pick = { count: 99, upTo: true, all: true, filter: f, dest: m[2] === 'into your hand' ? 'hand' : 'battlefield' };
      if (restSet) break;
      continue;
    }
    // "It gains indestructible until end of turn." (Winota) — about the card just put onto the battlefield
    if (spec.pick?.dest === 'battlefield' && (m = t.match(/^(?:it|that creature) gains ([a-z ,]+?) until end of turn$/))) {
      const kws = m[1].split(/,? and |, /).map((x) => x.trim());
      if (kws.every((k) => /^(?:indestructible|haste|vigilance|lifelink|trample|flying|deathtouch|first strike|hexproof|menace)$/.test(k))) { (spec.pick as any).gainKw = kws; continue; }
    }
    // "If an Equipment is put onto the battlefield this way, you may attach it to a creature you control." (Armored Skyhunter)
    if (spec.pick?.dest === 'battlefield' && /^if an equipment is put onto the battlefield this way, you may attach it to a creature you control$/.test(t)) { (spec.pick as any).attachEquip = true; continue; }
    if (restSet) break;
    return null;
  }
  if (!restSet && !spec.pick) return null;
  return { spec, end: Math.min(j, sents.length - 1) };
}

/** Parse a block of effect text (a spell, or the effect part of an ability). */
/** "nonland", "noncreature, nonland", "creature or planeswalker" … as a card filter. */
function handFilter(ph: string): Filter | null {
  const ws = ph.split(/,\s*|\s+/).filter(Boolean);
  if (ws.length && ws.every((w) => /^non[a-z]+$/.test(w))) return { notTypes: ws.map((w) => w.slice(3)) };
  return parseFilter(ph);
}

/** The core trigger table + plugin triggers for a condition ("whenever ~ attacks"), with the parse seeds the line parser uses. */
export function matchTriggerCond(cond: string): { event: string; filter?: Filter; data?: any; last?: Subject; lastPlayer?: Subject; cond?: Cond }[] | null {
  const TP = { t: 'triggerPlayer' } as Subject;
  for (const [re, fn] of TRIGGERS) {
    const tm = cond.match(re);
    if (!tm) continue;
    const ev = fn(tm);
    if (!ev) continue;
    const seed: any = ev.event === 'otherEtb' || ev.event === 'otherDies' ? { last: { t: 'triggerObj' }, lastPlayer: TP } : ev.event === 'oppCastSpell' || ev.event === 'castSpell' ? { last: { t: 'triggerObj' }, lastPlayer: TP } : ['combatDamagePlayer', 'eachUpkeep', 'oppUpkeep', 'eachEndStep'].includes(ev.event) ? { lastPlayer: TP } : {};
    return [{ event: ev.event, filter: ev.filter, ...seed }];
  }
  for (const f of EXT.triggers) { const evs = f(cond); if (evs) return evs as any; }
  return null;
}

export function parseAbility(text: string, seed?: { last?: Subject; lastPlayer?: Subject }): Ability {
  const ab: Ability = { text, effects: [], specs: [], manual: [] };
  const ctx: Ctx = { specs: ab.specs, selfName: '~', last: seed?.last ?? { t: 'self' }, lastPlayer: seed?.lastPlayer };
  // "Choose one. If you control a commander as you cast this spell, you may choose both instead."
  let cmdBoth = false;
  text = text.replace(/^choose one\. if you control a commander as you cast (?:~|this spell), you may choose both instead\.?\s*\n/, () => { cmdBoth = true; return 'choose one —\n'; });
  // normalise modal headers: "choose three. you may choose the same mode more than once.", "choose up to two —",
  // "choose one. if it was kicked, choose both instead." …
  let modeExtra: any = {};
  const escM = text.match(/^\u0003(.+?)\u0003/);
  if (escM) { modeExtra.escalate = escM[1]; text = text.slice(escM[0].length); }
  {
    const hm = text.match(/^(choose [^\n•]+?)\s*\n(\s*•[\s\S]+)$/);
    if (hm) {
      let h = hm[1].trim();
      let ok = true;
      if (/you may choose the same mode more than once\.?/.test(h)) { modeExtra.repeat = true; h = h.replace(/\s*you may choose the same mode more than once\.?/, ''); }
      h = h.replace(/\s*each mode must target a different (?:player|creature)\.?/, '').replace(/\s*activate only as a sorcery\.?/, '');
      const cm = h.match(/^(choose [a-z ]+?)\.\s*if (.+?), (?:you may )?choose (both|two|three|any number) instead\s*[—.]?$/);
      if (cm) {
        const cond = /^(?:~|it) was kicked$/.test(cm[2]) ? { k: 'kickedCast' } : parseCond(cm[2]);
        if (cond) { modeExtra.condMax = { cond, max: cm[3] === 'any number' ? 99 : cm[3] === 'three' ? 3 : 2 }; h = cm[1]; } else ok = false;
      }
      const up = h.match(/^choose up to (one|two|three|four)\s*[—.:]?$/);
      if (up) { modeExtra.min = 0; h = `choose ${up[1]}`; }
      h = h.replace(/ that hasn't been chosen this turn/, '').replace(/\s*[—.:]$/, '');
      if (ok && /^choose (one|two|three|four|five|one or both|one or more|any number)$/.test(h)) text = `${h.replace(/four|five/, (w) => w)} —\n${hm[2]}`;
    }
  }
  // modal
  const modal = text.match(/^choose (one|two|three|four|five|one or both|one or more|any number)(?: that hasn't been chosen)?(?: —|:)?\s*\n?((?:\s*•.+\n?)+)$/s);
  if (modal) {
    const costs: string[] = [];
    const opts = modal[2].split('•').map((x) => x.trim()).filter(Boolean).map((o) => {
      const sp = o.match(/^\u0002(.+?)\u0002\s*(.+)$/s);
      costs.push(sp ? sp[1] : '');
      return sp ? sp[2] : o;
    });
    const options = opts.map((o) => parseAbility(o, seed));
    const r = modal[1];
    const NW: Record<string, number> = { two: 2, three: 3, four: 4, five: 5 };
    let min = r === 'any number' ? 0 : NW[r] ?? 1;
    const max = r === 'one' ? 1 : NW[r] ?? (r === 'one or both' ? 2 : options.length);
    if (modeExtra.min === 0) min = 0;
    ab.modes = { min, max, options, ...(cmdBoth ? { commanderMax: 2 } : {}), ...(modeExtra.repeat ? { repeat: true } : {}), ...(modeExtra.condMax ? { condMax: modeExtra.condMax } : {}), ...(costs.some(Boolean) ? { costs } : {}), ...(modeExtra.escalate ? { escalate: modeExtra.escalate } : {}) } as any;
    return ab;
  }
  const meld = parseMeld(text);
  if (meld) {
    ab.effects.push(meld);
    return ab;
  }
  const sents = sentences(text);
  for (let i = 0; i < sents.length; i++) {
    const sent = sents[i];
    if (/^activate only/.test(sent) || /^this ability triggers only/.test(sent)) continue;
    {
      let used: number | null = null;
      for (const f of EXT.seqs) {
        used = f(sents, i, ctx, ab);
        if (used != null) break;
      }
      if (used != null) {
        i += used;
        continue;
      }
    }
    // "Target opponent reveals their hand. You choose a nonland card from it. That player discards that card."
    {
      const a = sent.match(/^(target opponent|target player|each opponent|that player) reveals (?:their|his or her) hand$/);
      const b = sents[i + 1]?.match(/^you (?:may )?choose (?:an|a|one|up to one)\b ?(.*?) card(?: with mana value (\d+) or less)? from it(?: with mana value (\d+) or less)?$/);
      const c = sents[i + 2]?.match(/^(?:that player|they|the player) discards? (?:that card|it)$/);
      if (a && b && c) {
        const who = parsePlayerSubject(a[1], ctx);
        const f = b[1] ? handFilter(b[1]) : null;
        if (who && (!b[1] || f)) {
          const cmc = b[2] ?? b[3];
          const filter = f || cmc ? { ...(f ?? {}), ...(cmc ? { cmcMax: +cmc } : {}) } : undefined;
          ab.effects.push({ k: 'handPick', who, filter, upTo: /may|up to/.test(sents[i + 1]) });
          i += 2;
          continue;
        }
      }
      // "Reveal the top card of your library. If it's a land card, put it into your hand."
      const t = sent.match(/^(?:(you|target player|target opponent|defending player|each player|that player|each opponent) reveals?|reveal) the top card of (?:your|their|his or her) library( and put (?:that card|it) into your hand)?$/);
      if (t) {
        const who = t[1] ? parsePlayerSubject(t[1], ctx) : ({ t: 'you' } as Subject);
        const nx = sents[i + 1] ?? '';
        const f1 = t[2] ? null : nx.match(/^if it's an? (.+?) card, (?:you|that player|they) (may )?puts? it (into (?:your|their|his or her) hand|onto the battlefield)$/) ?? nx.match(/^if it's an? (.+?) card, (may )?put it (into your hand|onto the battlefield)$/);
        const f2 = nx.match(/^(?:you may )?put (?:that card|it) into your hand$/);
        if (who && (t[2] || f1 || f2 || !nx)) {
          const eff: Effect = { k: 'revealTop', who };
          let used = 0;
          if (t[2]) {
            eff.dest = 'hand';
            ab.effects.push(eff);
            ctx.last = { t: 'exiledTop' };
            continue;
          }
          if (f1) {
            const fl = parseFilter(f1[1]);
            if (fl) {
              eff.filter = fl;
              eff.dest = /battlefield/.test(f1[3]) ? 'battlefield' : 'hand';
              eff.may = !!f1[2];
              used = 1;
            }
          } else if (f2) {
            eff.dest = 'hand';
            used = 1;
          }
          const ow = sents[i + 1 + used]?.match(/^(?:otherwise|if you don't), put it (on the bottom of your library|into your graveyard)$/);
          if (ow) {
            eff.otherwise = /graveyard/.test(ow[1]) ? 'graveyard' : 'bottom';
            used++;
          }
          if (used || !nx) {
            ab.effects.push(eff);
            ctx.last = { t: 'exiledTop' };
            i += used;
            continue;
          }
        }
      }
    }
    const dig = parseDig(sents, i);
    if (dig) {
      ab.effects.push({ k: 'dig', spec: dig.spec });
      if ((dig.spec.pick as any)?.attachEquip) ab.effects.push({ k: 'ext', name: 'attachDug' } as any);
      i = dig.end;
      continue;
    }
    const r = parseSentence(sent, ctx);
    if (r) ab.effects.push(...r);
    else {
      ab.effects.push({ k: 'manual', text: sent });
      ab.manual.push(sent);
      // a later "it" can't mean ~ when the unreadable sentence chose something
      if (/\b(?:target|choose|chooses)\b/.test(sent)) ctx.last = { t: 'none' } as any;
    }
  }
  return ab;
}

// ---------------------------------------------------------------------------------------------
// Costs
// ---------------------------------------------------------------------------------------------

export function parseCostText(costText: string): ActCost {
  const c: ActCost = { mana: '', tap: false, untap: false, sacSelf: false };
  const parts = costText.split(/, /).map((s) => s.trim());
  const other: string[] = [];
  for (const p of parts) {
    let m: RegExpMatchArray | null;
    if (/^(\{[^}]+\})+$/.test(p)) {
      const syms = p.match(/\{[^}]+\}/g)!;
      for (const s of syms) {
        if (s === '{t}') c.tap = true;
        else if (s === '{q}') c.untap = true;
        else if (s === '{e}') c.energy = (c.energy ?? 0) + 1;
        else c.mana += s.toUpperCase();
      }
    } else if (/^[+-]?\d+$/.test(p) || p === '0') c.loyalty = parseInt(p, 10);
    else if (/^-x$/.test(p)) c.loyalty = 'X';
    else if (p === 'sacrifice ~') c.sacSelf = true;
    else if ((m = p.match(new RegExp(`^sacrifice ${AMT} (.+)$`)))) {
      const f = parseFilter(m[2]);
      if (f) {
        f.zone = 'battlefield';
        f.controller = 'you';
        c.sacrifice = { filter: f, n: numN(m[1]) };
      } else if (!EXT.costParts.some((g) => g(p, c))) other.push(p);
    } else if ((m = p.match(new RegExp(`^discard ${AMT} cards?$`)))) c.discard = numN(m[1]);
    else if (p === 'discard ~') c.discardSelf = true;
    else if ((m = p.match(/^pay (\d+) life$/))) c.life = +m[1];
    else if ((m = p.match(/^pay ((?:\{e\})+)$/))) c.energy = (c.energy ?? 0) + (m[1].match(/\{e\}/g) ?? []).length;
    else if ((m = p.match(/^pay (\w+) \{e\}$/))) c.energy = (c.energy ?? 0) + numN(m[1]);
    else if ((m = p.match(/^remove (?:any number of|x) ([a-z]+) counters from ~$/))) c.removeCounters = { counter: m[1], n: 0, any: true } as any;
    else if ((m = p.match(new RegExp(`^remove ${AMT} ([+-]\\d\\/[+-]\\d|[a-z]+) counters? from ~$`)))) c.removeCounters = { counter: m[2], n: numN(m[1]) };
    else if (p === 'exile ~ from your graveyard' || p === 'exile ~') c.exileSelf = true;
    else if (p === 'exert ~') (c as any).exert = true; // it won't untap during your next untap step
    else if ((m = p.match(new RegExp(`^tap ${AMT} untapped (.+?) you control$`)))) {
      const f = parseFilter(m[2]);
      if (f) c.tapCreatures = { n: numN(m[1]), filter: f };
      else if (!EXT.costParts.some((g) => g(p, c))) other.push(p);
    } else if (!EXT.costParts.some((f) => f(p, c))) other.push(p);
  }
  if (other.length) c.other = other.join(', ');
  return c;
}

// ---------------------------------------------------------------------------------------------
// Card-level parsing
// ---------------------------------------------------------------------------------------------

const cache = new Map<string, ParsedCard>();

export function parseCard(def: CardDef, face?: CardFace): ParsedCard {
  const f = face ?? { name: def.name, oracle: def.oracle, typeLine: def.typeLine, manaCost: def.manaCost };
  const key = `${def.id}|${f.name}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const pc = parseFace(f.oracle ?? '', f.name, f.typeLine ?? '', def);
  cache.set(key, pc);
  return pc;
}

const TRIGGERS: [RegExp, (m: RegExpMatchArray) => { event: TriggerEvent; filter?: Filter } | null][] = [
  [/^when(?:ever)? ~ enters$/, () => ({ event: 'etb' })],
  [/^when(?:ever)? ~ enters or attacks$/, () => ({ event: 'etb' })], // also attacks, added below
  [/^when(?:ever)? ~ dies$/, () => ({ event: 'dies' })],
  [/^when(?:ever)? ~ is put into a graveyard from the battlefield$/, () => ({ event: 'dies' })],
  [/^when(?:ever)? ~ leaves the battlefield$/, () => ({ event: 'ltb' })],
  [/^whenever ~ attacks$/, () => ({ event: 'attacks' })],
  [/^whenever ~ blocks$/, () => ({ event: 'blocks' })],
  [/^whenever ~ attacks or blocks$/, () => ({ event: 'attacksOrBlocks' })],
  [/^whenever ~ becomes blocked$/, () => ({ event: 'blocked' })],
  [/^whenever ~ deals combat damage to a player(?: or planeswalker)?$/, () => ({ event: 'combatDamagePlayer' })],
  [/^whenever ~ deals damage$/, () => ({ event: 'dealsDamage' })],
  [/^at the beginning of your upkeep$/, () => ({ event: 'upkeep' })],
  [/^at the beginning of each upkeep$|^at the beginning of each player's upkeep$/, () => ({ event: 'eachUpkeep' })],
  [/^at the beginning of each opponent's upkeep$/, () => ({ event: 'oppUpkeep' })],
  [/^at the beginning of your end step$/, () => ({ event: 'endStep' })],
  [/^at the beginning of (?:each|the) end step$/, () => ({ event: 'eachEndStep' })],
  [/^at the beginning of your (?:precombat|first) main phase$/, () => ({ event: 'mainPhase' })],
  [/^at the beginning of combat on your turn$/, () => ({ event: 'beginCombat' })],
  [/^at the beginning of your draw step$/, () => ({ event: 'drawStep' })],
  [/^whenever you cast (?:a|an|another) (?:(.+?) )?spell (of the chosen type)$/, (m) => {
    const f = parseFilter((m[1] ? m[1] + ' ' : '') + 'spell of the chosen type');
    return f ? { event: 'castSpell', filter: f } : null;
  }],
  [/^whenever you cast (?:a|an|another) (.+?) spell$/, (m) => {
    const f = parseFilter(m[1] + ' spell');
    return f ? { event: 'castSpell', filter: f } : null;
  }],
  [/^whenever you cast a spell$/, () => ({ event: 'castSpell', filter: { types: ['spell'] } })],
  [/^whenever an opponent casts (?:a|an) (.+?) spell$/, (m) => {
    const f = parseFilter(m[1] + ' spell');
    return f ? { event: 'oppCastSpell', filter: f } : null;
  }],
  [/^whenever an opponent casts a spell$/, () => ({ event: 'oppCastSpell', filter: { types: ['spell'] } })],
  [/^whenever a land (?:you control enters|enters under your control)$/, () => ({ event: 'landfall' })],
  // any player's land (Ankh of Mishra): not landfall, which is only your own lands
  [/^whenever a land enters$/, () => ({ event: 'otherEtb', filter: { types: ['land'] } as any })],
  [/^whenever (another|a|an) (.+?) (?:you control )?enters(?: under your control)?$/, (m) => {
    const ctrl = /you control|under your control/.test(m[0]);
    const f = parseFilter(m[2]);
    if (!f) return null;
    if (m[1] === 'another') f.other = true;
    if (ctrl) f.controller = 'you';
    return { event: 'otherEtb', filter: f };
  }],
  [/^whenever (another|a|an) (.+?) (?:you control )?dies$/, (m) => {
    const ctrl = /you control/.test(m[0]);
    const f = parseFilter(m[2]);
    if (!f) return null;
    if (m[1] === 'another') f.other = true;
    if (ctrl) f.controller = 'you';
    return { event: 'otherDies', filter: f };
  }],
  [/^whenever you gain life$/, () => ({ event: 'gainLife' })],
  [/^whenever you draw a card$/, () => ({ event: 'drawCard' })],
  [/^whenever ~ becomes tapped$/, () => ({ event: 'becomesTapped' })],
  [/^when(?:ever)? ~ is turned face up$/, () => ({ event: 'turnedFaceUp' })],
  [/^when(?:ever)? (?:~|this creature) transforms(?: into ~)?$/, () => ({ event: 'transformed' })],
  [/^at the beginning of (?:your|each of your) (?:postcombat|second) main phases?$/, () => ({ event: 'main2Phase' as any })],
  [/^at the beginning of combat on each opponent's turn$/, () => ({ event: 'oppBeginCombat' as any })],
];

// ---------------------------------------------------------------------------------------------
// Keyword lines with parameters, alternative casting keywords
// ---------------------------------------------------------------------------------------------

const NUM_KEYWORDS = ['modular', 'backup', 'fabricate', 'vanishing', 'fading', 'afflict', 'annihilator', 'bushido', 'renown', 'bloodthirst', 'toxic', 'rampage', 'absorb', 'amplify', 'graft', 'tribute', 'dredge', 'crew', 'support'];

export function mkAct(label: string, cost: ActCost, ability: Ability, opts: Partial<Activated>): Activated {
  return { label, cost, ability, isMana: false, sorcery: false, once: false, zone: 'battlefield', ...opts };
}

const emptyAb = (text = ''): Ability => ({ text, effects: [], specs: [], manual: [] });

function tryKeywordLine(line: string, pc: ParsedCard, isSpell: boolean, tl: string): boolean {
  let m: RegExpMatchArray | null;
  // "modular 2", "vanishing 3", "bushido 1", "fabricate 1, trample" …
  const parts = line.split(/, /).map((x) => x.trim());
  const numbered = parts.map((p) => p.match(/^([a-z ]+?) (\d+|x)$/)).filter(Boolean) as RegExpMatchArray[];
  if (numbered.length && parts.every((p) => KEYWORDS.includes(p) || NUM_KEYWORDS.some((k) => p.startsWith(k + ' ')))) {
    for (const p of parts) {
      const nm = p.match(/^([a-z ]+?) (\d+|x)$/);
      if (nm && NUM_KEYWORDS.includes(nm[1])) {
        if (nm[1] === 'crew') return false;
        pc.kwArgs[nm[1]] = nm[2] === 'x' ? 0 : +nm[2];
        pc.keywords.push(nm[1]);
      } else pc.keywords.push(p);
    }
    return true;
  }
  const cost = (x: string) => x.toUpperCase();
  if ((m = line.match(/^outlast (\{.+\})$/))) {
    pc.activated.push(mkAct(`Outlast ${m[1]}`, { ...parseCostText(m[1]), tap: true }, { ...emptyAb('put a +1/+1 counter on ~'), effects: [{ k: 'counters', what: { t: 'self' }, counter: '+1/+1', n: 1 }] }, { sorcery: true, special: 'outlast' }));
    return true;
  }
  if ((m = line.match(/^echo (\{.+\})$/))) { pc.echo = cost(m[1]); pc.keywords.push('echo'); return true; }
  if ((m = line.match(/^cumulative upkeep (\{[^}]+\}(?:\{[^}]+\})*)$/))) {
    pc.keywords.push('cumulative upkeep');
    pc.triggers.push({ event: 'upkeep', text: line, ability: { ...emptyAb(line), effects: [{ k: 'cumulativeUpkeep', cost: cost(m[1]) }] } });
    return true;
  }
  if ((m = line.match(/^(morph|megamorph|disguise) (\{.+\})$/))) { pc.morph = { cost: cost(m[2]), kind: m[1] as any }; return true; }
  if ((m = line.match(/^foretell (\{.+\})$/))) {
    pc.foretell = cost(m[1]);
    pc.activated.push(mkAct('Foretell {2}', { mana: '{2}', tap: false, untap: false, sacSelf: false }, emptyAb('foretell'), { zone: 'hand', special: 'foretell' }));
    return true;
  }
  if ((m = line.match(/^plot (\{.+\})$/))) {
    pc.plot = cost(m[1]);
    pc.activated.push(mkAct(`Plot ${m[1].toUpperCase()}`, { mana: cost(m[1]), tap: false, untap: false, sacSelf: false }, emptyAb('plot'), { zone: 'hand', special: 'plot', sorcery: true }));
    return true;
  }
  if ((m = line.match(/^suspend (\d+)—(\{.+\})$/))) {
    pc.suspend = { n: +m[1], cost: cost(m[2]) };
    pc.activated.push(mkAct(`Suspend ${m[1]} — ${m[2].toUpperCase()}`, { mana: cost(m[2]), tap: false, untap: false, sacSelf: false }, emptyAb('suspend'), { zone: 'hand', special: 'suspend', sorcery: !tl.includes('instant') }));
    return true;
  }
  if ((m = line.match(/^bestow (\{.+\})$/))) { pc.bestow = cost(m[1]); return true; }
  if ((m = line.match(/^disturb (\{.+\})$/))) { pc.disturb = cost(m[1]); return true; }
  if ((m = line.match(/^escape—(\{[^,]+\}), exile (\w+) other cards from your graveyard$/))) {
    pc.escape = { cost: cost(m[1]), exile: numN(m[2]) };
    return true;
  }
  if ((m = line.match(/^~ escapes with (\w+) ([+-]\d\/[+-]\d|[a-z]+) counters? on it$/))) {
    pc.escapeCounters = { counter: m[2], n: numN(m[1]) };
    return true;
  }
  if ((m = line.match(/^reconfigure (\{.+\})$/))) {
    pc.reconfigure = cost(m[1]);
    const ab = { ...emptyAb('attach to target creature you control'), effects: [{ k: 'reconfigure', attach: true } as Effect], specs: [spec({ types: ['creature'], controller: 'you', other: true }, 1, false, 'another target creature you control')] };
    pc.activated.push(mkAct(`Reconfigure ${m[1].toUpperCase()}: attach`, parseCostText(m[1]), ab, { sorcery: true, special: 'reconfigure' }));
    pc.activated.push(mkAct(`Reconfigure ${m[1].toUpperCase()}: unattach`, parseCostText(m[1]), { ...emptyAb('unattach'), effects: [{ k: 'reconfigure', attach: false }] }, { sorcery: true, special: 'reconfigure' }));
    return true;
  }
  if ((m = line.match(/^unearth (\{.+\})$/))) {
    pc.activated.push(mkAct(`Unearth ${m[1].toUpperCase()}`, parseCostText(m[1]), { ...emptyAb('unearth'), effects: [{ k: 'unearth' }] }, { zone: 'graveyard', sorcery: true, special: 'unearth' }));
    return true;
  }
  if ((m = line.match(/^(embalm|eternalize) (\{.+\})$/))) {
    pc.activated.push(mkAct(`${m[1][0].toUpperCase() + m[1].slice(1)} ${m[2].toUpperCase()}`, { ...parseCostText(m[2]), exileSelf: true }, { ...emptyAb(m[1]), effects: [{ k: 'embalm', eternalize: m[1] === 'eternalize' }] }, { zone: 'graveyard', sorcery: true, special: 'embalm' }));
    return true;
  }
  if ((m = line.match(/^(\{[^:]+\}): level (\d+)$/))) {
    const lv = +m[2];
    pc.classLevels = true;
    pc.activated.push(mkAct(`Level ${lv} ${m[1].toUpperCase()}`, parseCostText(m[1]), { ...emptyAb(`level ${lv}`), effects: [{ k: 'levelUp', n: lv }] }, { sorcery: true, special: 'level', level: lv }));
    return true;
  }
  if ((m = line.match(/^craft with (.+?) (\{[^}]+\}(?:\{[^}]+\})*)$/))) {
    const mat = m[1];
    let min = 1;
    let max = 1;
    let phrase = mat;
    let mm: RegExpMatchArray | null;
    if ((mm = mat.match(/^(one|two|three|four|five|\w+) or more (.+)$/))) { min = numN(mm[1]); max = 99; phrase = mm[2]; }
    else if ((mm = mat.match(/^(two|three|four|five|six|seven) (.+)$/))) { min = max = numN(mm[1]); phrase = mm[2]; }
    else if ((mm = mat.match(/^(?:a|an) (.+)$/))) phrase = mm[1];
    const f = parseFilter(phrase.replace(/ cards?$/, ''));
    if (!f) return false;
    delete f.zone;
    pc.activated.push({ ...mkAct(`Craft with ${mat} ${m[2].toUpperCase()}`, { ...parseCostText(m[2]), exileSelf: true }, { ...emptyAb('craft'), effects: [{ k: 'craft' }] }, { sorcery: true, special: 'craft' }), craft: { filter: f, min, max } });
    return true;
  }
  if (/^living weapon$/.test(line)) { pc.keywords.push('living weapon'); return true; }
  if (/^(totem|umbra) armor$/.test(line)) { pc.replacements.push({ k: 'umbra' }); pc.keywords.push('umbra armor'); return true; }
  if (/^(daybound|nightbound)$/.test(line)) { pc.keywords.push(line); return true; }
  if ((m = line.match(/^support (\d+)$/)) && !isSpell) { pc.kwArgs.support = +m[1]; pc.keywords.push('support'); return true; }
  return false;
}

// ---------------------------------------------------------------------------------------------
// Static abilities, replacement effects, clones
// ---------------------------------------------------------------------------------------------

/** A card filter from phrases like "blue", "nonland", "Mountain", "creature" (without the trailing "card"). */
export function cardFilter(ph: string): Filter | null {
  ph = ph.replace(/ cards?$/, '').trim();
  const ws = ph.split(/,\s*|\s+/).filter(Boolean);
  if (ws.length && ws.every((w) => w in COLOR_WORDS)) return { colors: ws.map((w) => COLOR_WORDS[w]) };
  if (ws.length && ws.every((w) => /^non[a-z]+$/.test(w))) return { notTypes: ws.map((w) => w.slice(3)) };
  if (ws.length === 2 && ws[0] in COLOR_WORDS) {
    const f = parseFilter(ws[1]);
    if (f) return { ...f, colors: [COLOR_WORDS[ws[0]]] };
  }
  return parseFilter(ph);
}

/** Lenient card filter for "a creature card with mana value 3 or less", "a white card", "an artifact or enchantment card"… */
export function looseFilter(ph: string): Filter | null {
  let p = ph.trim().replace(/^(?:a|an|any|one) /, '');
  const extra: Filter = {};
  let m: RegExpMatchArray | null;
  if ((m = p.match(/ with (?:mana value|converted mana cost) (\d+) or (less|greater)$/))) {
    if (m[2] === 'less') extra.cmcMax = +m[1];
    else extra.cmcMin = +m[1];
    p = p.slice(0, m.index);
  }
  if ((m = p.match(/ with power (\d+) or (less|greater)$/))) {
    if (m[2] === 'less') extra.powerMax = +m[1];
    else extra.powerMin = +m[1];
    p = p.slice(0, m.index);
  }
  p = p.replace(/ cards?$/, '').replace(/ card and\/or (?:a|an) /, ' or ').replace(/ and\/or /, ' or ');
  if (p === 'permanent') return { types: ['permanent'], ...extra };
  if (p === '' || p === 'card') return { ...extra };
  const f = cardFilter(p) ?? parseFilter(p);
  return f ? { ...f, ...extra } : null;
}

export interface AltCost { text: string; mana?: string; life?: number; sac?: { filter: Filter; n: number }; exileHand?: { filter: Filter; n: number }; discard?: { filter?: Filter; n: number }; cond?: Cond }

/** "You may sacrifice two Mountains rather than pay this spell's mana cost." (rule 118.9) */
function parseAltCost(line: string): AltCost | null {
  // "If you control a commander, you may cast this spell without paying its mana cost." (Fierce Guardianship)
  const fm = line.match(/^if (.+?), you may cast (?:~|this spell) without paying its mana cost$/);
  if (fm) {
    const c = parseCond(fm[1]);
    return c ? ({ text: 'without paying its mana cost', cond: c } as AltCost) : null;
  }
  const m = line.match(/^(?:if (.+?), )?you may (.+?) rather than pay (?:this spell's|~'s) mana cost$/);
  if (!m) return null;
  const alt: AltCost = { text: m[2] };
  if (m[1]) {
    const c = parseCond(m[1]);
    if (!c) return null;
    alt.cond = c;
  }
  for (const part of m[2].split(/,? and |, /)) {
    let x: RegExpMatchArray | null;
    if ((x = part.match(/^pay ((?:\{[^}]+\})+)$/))) alt.mana = x[1].toUpperCase();
    else if ((x = part.match(/^pay (\d+) life$/))) alt.life = +x[1];
    else if ((x = part.match(/^sacrifice (a|an|one|two|three|four|\d+) (.+)$/))) {
      const f = cardFilter(x[2]);
      if (!f) return null;
      alt.sac = { filter: { ...f, zone: 'battlefield', controller: 'you' }, n: numN(x[1]) };
    } else if ((x = part.match(/^exile (a|an|one|two|three|\d+) (.+?) cards? from your hand$/))) {
      const f = cardFilter(x[2]);
      if (!f) return null;
      alt.exileHand = { filter: { ...f, zone: 'hand' }, n: numN(x[1]) };
    } else if ((x = part.match(/^return (a|an|one|two|three|\d+) (.+?) you control to (?:its|their) owners?'s? hands?$/))) {
      const f = cardFilter(x[2]);
      if (!f) return null;
      (alt as any).bounce = { filter: { ...f, zone: 'battlefield', controller: 'you' }, n: numN(x[1]) };
    } else if ((x = part.match(/^discard (a|an|one|two|three|\d+) ?(.*?) cards?$/))) {
      const f = x[2] ? cardFilter(x[2]) : null;
      if (x[2] && !f) return null;
      alt.discard = { filter: f ? { ...f, zone: 'hand' } : undefined, n: numN(x[1]) };
    } else return null;
  }
  return alt;
}

function tryStatic(line: string, pc: ParsedCard): boolean {
  let m: RegExpMatchArray | null;
  {
    const alt = parseAltCost(line);
    if (alt) {
      (pc as any).altCost = alt;
      return true;
    }
  }
  // Commander-only rules text has no effect in a 1v1 constructed game
  if (/^(?:~ can be your commander|choose a background|doctor's companion|friends forever|partner(?: with [^.]+)?)(?: \(.*\))?$/.test(line)) return true;
  if (/^you may look at the top card of your library (?:any time|at any time)$/.test(line)) { (pc as any).lookTop = true; return true; }
  if (/^you have no maximum hand size$/.test(line)) { (pc as any).noMaxHand = true; return true; }
  if (/^players have no maximum hand size$/.test(line)) { (pc as any).noMaxHandAll = true; return true; }
  // Replacement effects
  if (/^if ~ would (?:die|be put into a graveyard from anywhere), exile it instead$/.test(line)) { pc.replacements.push({ k: 'selfDieExile' }); return true; }
  if ((m = line.match(/^if a (?:card|card or token|nontoken creature|creature) would be put into (a|an opponent's) graveyard from anywhere, exile it instead$/))) {
    pc.replacements.push({ k: 'graveExile', owner: m[1] === 'a' ? 'any' : 'opp' });
    return true;
  }
  if ((m = line.match(/^if one or more \+1\/\+1 counters would be put on (?:a|an) (.+?) you control, that many plus one \+1\/\+1 counters are put on (?:it|that \w+) instead$/))) {
    const f = parseFilter(m[1]);
    if (f) { pc.replacements.push({ k: 'counterPlus', filter: { ...f, zone: 'battlefield', controller: 'you' } }); return true; }
  }
  if ((m = line.match(/^if (?:an effect would put one or more counters|one or more counters would be put|one or more (\+1\/\+1) counters would be put) on (?:a|an) (.+?) you control, (?:it puts )?twice that many (?:of each of those kinds of |of those |\+1\/\+1 )?counters (?:are put )?on (?:it|that \w+) instead$/))) {
    const f = parseFilter(m[2]);
    if (f) { pc.replacements.push({ k: 'counterDouble', plusOnly: !!m[1], filter: { ...f, zone: 'battlefield', controller: 'you' } }); return true; }
  }
  if (/^if (?:an effect|one or more tokens) would (?:create one or more tokens under your control|be created under your control), (?:it creates )?twice that many (?:of those )?tokens (?:are created )?instead$/.test(line)) { pc.replacements.push({ k: 'tokenDouble' }); return true; }
  if ((m = line.match(/^if a source( you control)? would deal damage to (?:a permanent or player|an opponent or a permanent an opponent controls|a player or permanent), it deals double that damage(?: to that (?:permanent or player|player or permanent))? instead$/))) {
    pc.replacements.push({ k: 'damageDouble', yourSources: !!m[1] });
    return true;
  }
  if ((m = line.match(/^prevent all (combat )?damage that would be dealt to ~$/))) { pc.replacements.push({ k: 'preventSelf', combat: !!m[1] }); return true; }
  if (/^if enchanted creature would be destroyed, instead remove all damage from it and destroy ~$/.test(line)) { pc.replacements.push({ k: 'umbra' }); return true; }
  if ((m = line.match(/^(.+?) your opponents control enter tapped$/))) {
    const f = parseFilter(m[1]);
    if (f) { pc.replacements.push({ k: 'oppEnterTapped', filter: f }); return true; }
  }
  if (/^if you would gain life, you gain twice that much life instead$/.test(line)) { pc.replacements.push({ k: 'lifeDouble' }); return true; }
  // Clone
  if ((m = line.match(/^you may have ~ enter as a copy of (?:any|a|an) (.+?)(?: on the battlefield)?(?:, except (.+))?$/))) {
    const f = parseFilter(m[1]);
    if (f) { pc.clone = { filter: { ...f, zone: 'battlefield' }, except: m[2] }; if (m[2]) pc.unparsed.push(`except ${m[2]}`); return true; }
  }
  // Characteristic-defining P/T
  if ((m = line.match(/^~'s power and toughness are each equal to (.+)$/))) {
    const a = parseCountPhrase(m[1]);
    if (a) { pc.statics.push({ kind: 'setPT', p: 0, t: 0, kw: [], setP: a, setT: a }); return true; }
  }
  if ((m = line.match(/^~'s power is equal to (.+)$/))) {
    const a = parseCountPhrase(m[1]);
    if (a) { pc.statics.push({ kind: 'setPT', p: 0, t: 0, kw: [], setP: a }); return true; }
  }
  // "as long as" wrapper
  let cond: Cond | undefined;
  let body = line;
  if ((m = line.match(/^as long as (.+?), (.+)$/)) || (m = line.match(/^(.+) as long as (.+)$/))) {
    const [c, b] = line.startsWith('as long as') ? [m[1], m[2]] : [m[2], m[1]];
    const pcnd = parseCond(c);
    if (!pcnd) return false;
    cond = pcnd;
    body = b;
  }
  const before = pc.statics.length;
  if ((m = body.match(/^~ gets ([+-]\d+)\/([+-]\d+)(?: and has (.+?))?(?: for each (.+))?$/))) {
    const kws = m[3] ? parseKeywordList(m[3]) : [];
    const per = m[4] ? parseCountPhrase(m[4]) : null;
    if (kws && (!m[4] || per)) {
      const p = per ? withMult(per, +m[1]) : +m[1];
      const t = per ? withMult(per, +m[2]) : +m[2];
      pc.statics.push({ kind: 'selfPump', p, t, kw: kws, cond });
    }
  } else if ((m = body.match(/^~ has (.+)$/)) && !body.includes('"')) {
    const kws = parseKeywordList(m[1]);
    if (kws) pc.statics.push({ kind: 'selfPump', p: 0, t: 0, kw: kws, cond });
  } else if ((m = body.match(/^(other )?(.+?) (?:you control )?get ([+-]\d+)\/([+-]\d+)(?: and have (.+?))?(?: for each (.+))?$/))) {
    const f = parseFilter(m[2].replace(/ you control$/, '') + (/you control/.test(m[0]) ? ' you control' : ''));
    const kws = m[5] ? parseKeywordList(m[5]) : [];
    const per = m[6] ? parseCountPhrase(m[6]) : null;
    if (f && kws && (!m[6] || per)) {
      if (m[1]) f.other = true;
      f.zone = 'battlefield';
      pc.statics.push({ kind: 'anthem', filter: f, p: per ? withMult(per, +m[3]) : +m[3], t: per ? withMult(per, +m[4]) : +m[4], kw: kws, cond });
    }
  } else if ((m = body.match(/^(other )?(.+?) have (.+)$/)) && !body.includes('"') && cond) {
    const f = parseFilter(m[2]);
    const kws = parseKeywordList(m[3]);
    if (f && kws) {
      if (m[1]) f.other = true;
      f.zone = 'battlefield';
      pc.statics.push({ kind: 'anthem', filter: f, p: 0, t: 0, kw: kws, cond });
    }
  }
  return pc.statics.length > before;
}

/** Keyword abilities that are really triggered abilities become ordinary triggers the engine already knows how to run. */
function keywordTriggers(pc: ParsedCard) {
  const k = new Set(pc.keywords);
  const n = (x: string) => pc.kwArgs[x] ?? 1;
  const T = (event: TriggerEvent, effects: Effect[], text: string, extra: Partial<Trigger> = {}, specs: TargetSpec[] = []) =>
    pc.triggers.push({ event, text, ability: { text, effects, specs, manual: [] }, ...extra });
  const self: Subject = { t: 'self' };
  if (k.has('undying')) T('dies', [{ k: 'reanimate', what: self, dest: 'battlefield', counters: { '+1/+1': 1 }, owner: true }], 'Undying', { cond: { k: 'noCounter', counter: '+1/+1' } });
  if (k.has('persist')) T('dies', [{ k: 'reanimate', what: self, dest: 'battlefield', counters: { '-1/-1': 1 }, owner: true }], 'Persist', { cond: { k: 'noCounter', counter: '-1/-1' } });
  if (k.has('evolve')) T('otherEtb', [{ k: 'counters', what: self, counter: '+1/+1', n: 1 }], 'Evolve', { filter: { types: ['creature'], controller: 'you', other: true }, cond: { k: 'evolve' } });
  if (k.has('modular')) {
    (pc.entersCounters ??= []).push({ counter: '+1/+1', n: n('modular') });
    T('dies', [{ k: 'counters', what: { t: 'target', spec: 0 }, counter: '+1/+1', n: { lki: '+1/+1' } }], 'Modular', {}, [spec({ types: ['creature'], subtypes: undefined, other: true }, 1, true, 'target artifact creature')]);
    pc.triggers[pc.triggers.length - 1].ability.specs[0].filter = { types: ['artifact'], other: true };
  }
  if (k.has('bushido')) {
    T('blocks', [{ k: 'pump', what: self, p: n('bushido'), t: n('bushido'), kw: [], eot: true }], 'Bushido');
    T('blocked', [{ k: 'pump', what: self, p: n('bushido'), t: n('bushido'), kw: [], eot: true }], 'Bushido');
  }
  if (k.has('afflict')) T('blocked', [{ k: 'lose', n: n('afflict'), who: { t: 'defending' } }], 'Afflict');
  if (k.has('flanking')) T('blocked', [{ k: 'pump', what: { t: 'blockers', filter: { types: ['creature'], noKeyword: 'flanking' } }, p: -1, t: -1, kw: [], eot: true }], 'Flanking');
  if (k.has('battle cry')) T('attacks', [{ k: 'pump', what: { t: 'all', filter: { types: ['creature'], attacking: true, other: true, controller: 'you', zone: 'battlefield' } }, p: 1, t: 0, kw: [], eot: true }], 'Battle cry');
  if (k.has('annihilator')) T('attacks', [{ k: 'sacrifice', who: { t: 'defending' }, filter: { types: ['permanent'], zone: 'battlefield' }, n: n('annihilator') }], 'Annihilator');
  if (k.has('melee')) T('attacks', [{ k: 'pump', what: self, p: 1, t: 1, kw: [], eot: true }], 'Melee');
  if (k.has('dethrone')) T('attacks', [{ k: 'counters', what: self, counter: '+1/+1', n: 1 }], 'Dethrone', { cond: { k: 'defendingMostLife' } });
  if (k.has('mentor')) T('attacks', [{ k: 'counters', what: { t: 'target', spec: 0 }, counter: '+1/+1', n: 1 }], 'Mentor', {}, [spec({ types: ['creature'], attacking: true, controller: 'you', other: true }, 1, false, 'target attacking creature with lesser power')]);
  if (k.has('training')) T('attacks', [{ k: 'counters', what: self, counter: '+1/+1', n: 1 }], 'Training', { cond: { k: 'trainingPartner' } });
  if (k.has('renown')) T('combatDamagePlayer', [{ k: 'renown', n: n('renown') }], 'Renown', { cond: { k: 'notRenowned' } });
  if (k.has('bloodthirst')) T('etb', [{ k: 'counters', what: self, counter: '+1/+1', n: n('bloodthirst') }], 'Bloodthirst', { cond: { k: 'oppDamaged' } });
  if (k.has('backup')) T('etb', [{ k: 'counters', what: { t: 'target', spec: 0 }, counter: '+1/+1', n: n('backup') }], 'Backup', {}, [spec({ types: ['creature'] }, 1, false, 'target creature')]);
  if (k.has('support')) T('etb', [{ k: 'counters', what: { t: 'target', spec: 0 }, counter: '+1/+1', n: 1 }], 'Support', {}, [spec({ types: ['creature'], other: true }, n('support'), true, `up to ${n('support')} other target creatures`)]);
  if (k.has('unleash')) T('etb', [{ k: 'may', text: 'put a +1/+1 counter on it (unleash)', effects: [{ k: 'counters', what: self, counter: '+1/+1', n: 1 }] }], 'Unleash');
  if (k.has('vanishing')) {
    if (pc.kwArgs.vanishing) (pc.entersCounters ??= []).push({ counter: 'time', n: pc.kwArgs.vanishing });
    T('upkeep', [{ k: 'vanishing' }], 'Vanishing');
  }
  if (k.has('fading')) {
    (pc.entersCounters ??= []).push({ counter: 'fade', n: n('fading') });
    T('upkeep', [{ k: 'fading' }], 'Fading');
  }
  if (k.has('living weapon')) T('etb', [{ k: 'livingWeapon' }], 'Living weapon');
  const modal = (text: string, a: Ability, b: Ability) => {
    pc.triggers.push({ event: 'etb', text, ability: { text, effects: [], specs: [], manual: [], modes: { min: 1, max: 1, options: [a, b] } } });
  };
  if (k.has('riot')) modal('Riot', { text: 'Enter with a +1/+1 counter', effects: [{ k: 'counters', what: self, counter: '+1/+1', n: 1 }], specs: [], manual: [] }, { text: 'Gain haste', effects: [{ k: 'pump', what: self, p: 0, t: 0, kw: ['haste'], eot: false }], specs: [], manual: [] });
  if (k.has('fabricate')) {
    const f = n('fabricate');
    modal('Fabricate', { text: `Put ${f} +1/+1 counter(s) on it`, effects: [{ k: 'counters', what: self, counter: '+1/+1', n: f }], specs: [], manual: [] }, { text: `Create ${f} 1/1 Servo token(s)`, effects: [{ k: 'token', n: f, who: { t: 'you' }, token: { name: 'Servo', power: '1', toughness: '1', colors: [], types: 'Token Artifact Creature — Servo', keywords: [], oracle: '' } }], specs: [], manual: [] });
  }
}

function splitTrigger(line: string): { cond: string; effect: string } | null {
  if (!/^(when|whenever|at)\b/.test(line)) return null;
  // find first comma not inside quotes
  let depth = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') depth ^= 1;
    if (ch === ',' && !depth) return { cond: line.slice(0, i).trim(), effect: line.slice(i + 1).trim() };
  }
  return null;
}

function parseFace(oracle: string, name: string, typeLine: string, def: CardDef): ParsedCard {
  const pc: ParsedCard = { keywords: [], triggers: [], activated: [], statics: [], unparsed: [], kwArgs: {}, replacements: [] };
  const tl = typeLine.toLowerCase();
  const isSpell = /\b(instant|sorcery)\b/.test(tl);
  // legendary cards often call themselves by first name ("Whenever Edgar …", "Kaalia attacks")
  const aliasNames: string[] = [];
  if (/\blegendary\b/.test(tl) && !name.includes(',')) {
    const first = name.split(' ')[0];
    if (first.length >= 3 && first !== name && !/^(The|Lord|Lady|Sir|King|Queen|Captain|General|Grand|High|Old|Young|Mother|Father|Brother|Sister|Uncle|Aunt|Doctor|Professor|Master|Elder|Saint|Mr\.|Ms\.|Mrs\.)$/.test(first) && new RegExp(`\\b${first}\\b(?! [A-Z])`).test(oracle.replace(name, ''))) aliasNames.push(first);
  }
  const norm = normalizeText(oracle, name, aliasNames);

  // intrinsic mana from basic land types
  if (tl.includes('land')) {
    const intrinsic: Color[] = [];
    if (/\bplains\b/.test(tl)) intrinsic.push('W');
    if (/\bisland\b/.test(tl)) intrinsic.push('U');
    if (/\bswamp\b/.test(tl)) intrinsic.push('B');
    if (/\bmountain\b/.test(tl)) intrinsic.push('R');
    if (/\bforest\b/.test(tl)) intrinsic.push('G');
    if (intrinsic.length) {
      pc.intrinsicMana = intrinsic;
      pc.activated.push({
        label: `{T}: Add ${intrinsic.map((c) => `{${c}}`).join(' or ')}`,
        cost: { mana: '', tap: true, untap: false, sacSelf: false },
        ability: { text: '', effects: [], specs: [], manual: [] },
        isMana: true,
        produces: [intrinsic],
        manaAmount: 1,
        sorcery: false,
        once: false,
        zone: 'battlefield',
      });
    }
  }

  // Group modal bullet lines with their header
  const rawLines = norm.split('\n').map((l) => l.trim()).filter(Boolean);
  const lines: string[] = [];
  const tables: { min: number; max: number; text: string }[][] = [];
  for (const l of rawLines) {
    const row = l.match(/^(\d+)(?:[—–-](\d+)|(\+))? \| (.+)$/);
    if (row && lines.length) {
      if (!(lines as any).__tbl?.has(lines.length - 1)) {
        ((lines as any).__tbl ??= new Set()).add(lines.length - 1);
        tables.push([]);
      }
      tables[tables.length - 1].push({ min: +row[1], max: row[3] ? 999 : row[2] ? +row[2] : +row[1], text: row[4] });
      continue;
    }
    if (l.startsWith('•') && lines.length) lines[lines.length - 1] += '\n' + l;
    else lines.push(l);
  }

  const spellParts: string[] = [];
  // Class enchantments: abilities printed after "{cost}: Level N" only exist from level N on.
  let curLevel = 0;
  const snap = { t: 0, s: 0, a: 0, r: 0 };
  const tagLevel = () => {
    if (curLevel > 1) {
      for (const t of pc.triggers.slice(snap.t)) t.level = curLevel;
      for (const st of pc.statics.slice(snap.s)) st.level = curLevel;
      for (const a of pc.activated.slice(snap.a)) if (a.special !== 'level') a.level = curLevel;
      for (const r of pc.replacements.slice(snap.r)) (r as any).level = curLevel;
    }
    snap.t = pc.triggers.length; snap.s = pc.statics.length; snap.a = pc.activated.length; snap.r = pc.replacements.length;
  };
  let gate: any = null;
  const gsnap = { t: 0, s: 0, a: 0, r: 0, k: 0 };
  const tagGate = () => {
    if (!gate && (pc as any).__sticky) gate = (pc as any).__sticky;
    if (gate) {
      for (const t of pc.triggers.slice(gsnap.t)) (t as any).gate = gate;
      for (const st of pc.statics.slice(gsnap.s)) (st as any).gate = gate;
      for (const a of pc.activated.slice(gsnap.a)) (a as any).gate = gate;
      for (const r of pc.replacements.slice(gsnap.r)) (r as any).gate = gate;
      const kws = pc.keywords.splice(gsnap.k);
      if (kws.length) pc.statics.push({ kind: 'selfPump', p: 0, t: 0, kw: kws, gate } as any);
      (pc as any).gated = true;
      gate = null;
    }
    gsnap.t = pc.triggers.length; gsnap.s = pc.statics.length; gsnap.a = pc.activated.length; gsnap.r = pc.replacements.length; gsnap.k = pc.keywords.length;
  };
  for (let line of lines) {
    tagGate();
    tagLevel();
    {
      let ex: string[] | null = null;
      const bare = line.replace(/\.$/, '').replace(/^[a-z' ]+ — (?=(?:when|whenever|at) )/, '');
      for (const f of EXT.expand) if ((ex = f(bare))) break;
      if (ex) { lines.push(...ex); continue; }
    }
    const lvm = line.match(/^\{[^:]+\}: level (\d+)\.?$/);
    if (lvm) curLevel = +lvm[1];
    if (line === '//') continue;
    if (!line.includes('\n')) line = line.replace(/\.$/, '');
    let km: RegExpMatchArray | null;
    // Saga chapters: "i — …", "ii, iii — …"
    if (tl.includes('saga') && (km = line.match(/^((?:i|ii|iii|iv|v|vi|vii)(?:, (?:i|ii|iii|iv|v|vi|vii))*) — (.+)$/s))) {
      const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7 };
      const ns = km[1].split(', ').map((r) => ROMAN[r]);
      (pc.chapters ??= []).push({ n: ns, ability: parseAbility(km[2]), text: line });
      pc.finalChapter = Math.max(pc.finalChapter ?? 0, ...ns);
      continue;
    }
    if (/^read ahead$/.test(line)) { (pc as any).readAhead = true; continue; } // ext/sagacipher.ts asks for the chapter
    if (EXT.lines.some((f) => f(line, pc, { isSpell, tl, def, name }))) continue;
    {
      const alt = parseAltCost(line);
      if (alt) {
        (pc as any).altCost = alt;
        continue;
      }
      const ch = line.match(/^as ~ enters(?: the battlefield)?, choose an? (color|creature type|card type|basic land type)(?: other than [a-z]+)?$/);
      if (ch) {
        const what = ch[1] === 'color' ? 'color' : ch[1] === 'creature type' ? 'creatureType' : ch[1] === 'card type' ? 'cardType' : 'landType';
        pc.triggers.push({ event: 'etb', ability: { text: line, effects: [{ k: 'choose', what }], specs: [], manual: [] }, text: line });
        continue;
      }
      const mt = line.match(/^whenever (?:~|this creature) mutates, (.+)$/);
      if (mt) {
        pc.triggers.push({ event: 'mutates' as any, ability: parseAbility(mt[1]), text: line });
        continue;
      }
    }
    if (tryKeywordLine(line, pc, isSpell, tl)) continue;
    // strip ability words like "landfall — "
    const aw = line.match(/^([a-z' ]+) — (.+)$/s);
    if (aw && !/^(choose|equip|ward|cycling|flashback|kicker|crew|enchant)/.test(aw[1]) && !aw[2].startsWith('•')) {
      const g = EXT.gates.find(([re]) => re.test(aw[1]));
      if (g) gate = g[1];
      line = aw[2];
    }
    if (aw && line === aw[2] && EXT.lines.some((f) => f(line, pc, { isSpell, tl, def, name }))) continue;

    // keyword-only lines
    const kwParts = line.split(/[,;] /).map((x) => x.trim());
    if (kwParts.every((k) => KEYWORDS.includes(k) || /^protection from/.test(k) || /^(hexproof from|ward \{|ward—|landwalk)/.test(k) || /^(\w+walk)$/.test(k) || /^toxic \d+$/.test(k) || /^annihilator \d+$/.test(k) || /^bushido \d+$/.test(k) || /^afflict \d+$/.test(k))) {
      for (const k of kwParts) {
        pc.keywords.push(k.startsWith('ward') ? 'ward' : k);
        const w = k.match(/^ward \{(\d+)\}$/);
        if (w) pc.ward = +w[1];
      }
      continue;
    }
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^enchant (.+)$/))) {
      const t = m[1];
      if (t === 'player' || t === 'opponent') pc.enchant = { filter: { types: [] }, players: t === 'player' ? 'any' : 'opp' };
      else {
        const f = parseFilter(t);
        pc.enchant = { filter: f ?? { types: ['permanent'] } };
      }
      continue;
    }
    if ((m = line.match(/^equip(?: (?:legendary )?creature)? (\{[^:]+\}|—.+)$/)) || (m = line.match(/^equip (\{.+\})$/))) {
      const cost = m[1].startsWith('{') ? m[1] : '';
      const costObj = parseCostText(cost || '{0}');
      if (!m[1].startsWith('{')) costObj.other = m[1].replace(/^—/, '');
      const ab = parseAbility('attach ~ to target creature you control');
      ab.specs = [spec({ types: ['creature'], controller: 'you' }, 1, false, 'target creature you control')];
      ab.effects = [];
      pc.activated.push({ label: `Equip ${m[1]}`, cost: costObj, ability: ab, isMana: false, sorcery: true, once: false, zone: 'battlefield', special: 'equip' });
      continue;
    }
    if ((m = line.match(/^reconfigure (\{.+\})$/))) {
      continue;
    }
    if ((m = line.match(/^crew (\d+)$/))) {
      pc.activated.push({ label: `Crew ${m[1]}`, cost: { mana: '', tap: false, untap: false, sacSelf: false }, ability: { text: 'becomes an artifact creature until end of turn', effects: [], specs: [], manual: [] }, isMana: false, sorcery: false, once: false, zone: 'battlefield', special: 'crew', crew: +m[1] });
      continue;
    }
    if ((m = line.match(/^madness (\{.+\})$/))) {
      (pc as any).madness = m[1].toUpperCase();
      if (!pc.keywords.includes('madness')) pc.keywords.push('madness');
      continue;
    }
    if ((m = line.match(/^(?:commander )?ninjutsu (\{.+\})$/))) {
      pc.activated.push({ label: `Ninjutsu ${m[1]}`, cost: parseCostText(m[1]), ability: { text: 'ninjutsu', effects: [{ k: 'ninjutsu' }], specs: [], manual: [] }, isMana: false, sorcery: false, once: false, zone: 'hand', special: 'ninjutsu' });
      continue;
    }
    if ((m = line.match(/^mutate (\{.+\})$/))) {
      (pc as any).mutate = m[1].toUpperCase();
      if (!pc.keywords.includes('mutate')) pc.keywords.push('mutate');
      continue;
    }
    if ((m = line.match(/^cycling—pay (\d+) life$/))) {
      pc.activated.push({ label: `Cycling—Pay ${m[1]} life`, cost: { mana: '', tap: false, untap: false, sacSelf: false, life: +m[1], discardSelf: true }, ability: parseAbility('draw a card'), isMana: false, sorcery: false, once: false, zone: 'hand', special: 'cycling' } as any);
      continue;
    }
    if ((m = line.match(/^cycling (\{.+\})$/))) {
      pc.activated.push({ label: `Cycling ${m[1]}`, cost: { ...parseCostText(m[1]), discardSelf: true }, ability: parseAbility('draw a card'), isMana: false, sorcery: false, once: false, zone: 'hand', special: 'cycling' });
      continue;
    }
    if ((m = line.match(/^(?:\w+)cycling (\{.+\})$/))) {
      // landcycling / typecycling
      pc.unparsed.push(line);
      continue;
    }
    if ((m = line.match(/^flashback (\{.+\})$/))) {
      pc.flashback = m[1].toUpperCase();
      continue;
    }
    if ((m = line.match(/^kicker (\{[^}]+\}(?:\{[^}]+\})*)$/))) {
      pc.kicker = m[1].toUpperCase();
      continue;
    }
    if ((m = line.match(/^~ enters with (\w+) ([+-]\d\/[+-]\d|[a-z]+) counters? on it if it was kicked$/))) {
      (pc.entersCounters ??= []).push({ counter: m[2], n: numN(m[1]), kickedOnly: true });
      continue;
    }
    if (/^(~|this spell) can't be countered$/.test(line)) { pc.cantBeCountered = true; continue; }
    if (/^~ enters tapped$/.test(line)) { pc.entersTapped = true; continue; }
    if ((m = line.match(/^~ enters tapped unless (.+)$/))) { pc.entersTapped = m[1]; continue; }
    if ((m = line.match(/^~ enters with (\w+) ([+-]\d\/[+-]\d|[a-z]+) counters? on it$/))) {
      (pc.entersCounters ??= []).push({ counter: m[2], n: m[1] === 'x' ? -1 : numN(m[1]) });
      continue;
    }
    if (/^~ can't block$/.test(line)) { pc.cantBlock = true; continue; }
    if (/^~ can't attack or block(?: alone)?$/.test(line)) { pc.cantBlock = true; pc.cantAttack = true; continue; }
    if (/^~ can't attack$/.test(line)) { pc.cantAttack = true; continue; }
    if (/^~ can't be blocked$/.test(line)) { pc.unblockable = true; continue; }
    if (/^~ doesn't untap during your untap step$/.test(line)) { pc.noUntap = true; continue; }
    if (/^~ attacks each combat if able$/.test(line)) { pc.mustAttack = true; continue; }
    if (/^you control enchanted (creature|permanent|land|artifact)$/.test(line)) { pc.controlEnchanted = true; continue; }
    if (/^you may play an additional land on each of your turns$/.test(line)) { pc.additionalLand = (pc.additionalLand ?? 0) + 1; continue; }

    // Static: anthems & attachments
    if ((m = line.match(/^(enchanted|equipped) (?:creature|permanent) gets ([+-]\d+)\/([+-]\d+)(?: and has (.+))?$/))) {
      const kws = m[4] ? parseKeywordList(m[4]) : [];
      if (kws) {
        pc.statics.push({ kind: 'attachPump', attach: m[1] as any, p: +m[2], t: +m[3], kw: kws });
        continue;
      }
    }
    if ((m = line.match(/^(enchanted|equipped) creature has (.+)$/))) {
      const kws = parseKeywordList(m[2]);
      if (kws) {
        pc.statics.push({ kind: 'attachPump', attach: m[1] as any, p: 0, t: 0, kw: kws });
        continue;
      }
    }
    if ((m = line.match(/^enchanted creature can't (attack or block|attack|block)(?:, and its activated abilities can't be activated)?$/))) {
      pc.statics.push({ kind: 'attachPump', attach: 'enchanted', p: 0, t: 0, kw: [], cantAttack: m[1].includes('attack'), cantBlock: m[1].includes('block') });
      continue;
    }
    if (/^enchanted (creature|permanent|land) doesn't untap during its controller's untap step$/.test(line)) {
      pc.statics.push({ kind: 'attachPump', attach: 'enchanted', p: 0, t: 0, kw: [], noUntap: true });
      continue;
    }
    if ((m = line.match(/^(other )?(.+?) get ([+-]\d+)\/([+-]\d+)(?: and have (.+))?$/))) {
      const f = parseFilter(m[2]);
      const kws = m[5] ? parseKeywordList(m[5]) : [];
      if (f && kws) {
        if (m[1]) f.other = true;
        f.zone = 'battlefield';
        pc.statics.push({ kind: 'anthem', filter: f, p: +m[3], t: +m[4], kw: kws });
        continue;
      }
    }
    if ((m = line.match(/^(other )?(.+?) have (.+)$/)) && !line.includes('"')) {
      const f = parseFilter(m[2]);
      const kws = parseKeywordList(m[3]);
      if (f && kws) {
        if (m[1]) f.other = true;
        f.zone = 'battlefield';
        pc.statics.push({ kind: 'anthem', filter: f, p: 0, t: 0, kw: kws });
        continue;
      }
    }

    if (tryStatic(line, pc)) continue;

    // Triggers
    // a spell's "At the beginning of combat this turn, …" is a delayed trigger it creates (603.7), part of its effect
    const trig = isSpell && /^at the beginning of (?:each )?combat this turn,/.test(line) ? null : splitTrigger(line);
    if (trig) {
      let matched = false;
      for (const [re, fn] of TRIGGERS) {
        const tm = trig.cond.match(re);
        if (!tm) continue;
        const ev = fn(tm);
        if (!ev) continue;
        let effectText = trig.effect;
        let cond: Cond | undefined;
        const ifm = /meld them into/.test(effectText) ? null : effectText.match(/^if (.+?), (.+)$/s);
        if (ifm) {
          const c = parseCond(ifm[1]);
          if (!c) break; // unknown intervening-if -> manual
          cond = c;
          effectText = ifm[2];
        }
        const TP = { t: 'triggerPlayer' } as Subject;
        const seed = ev.event === 'otherEtb' || ev.event === 'otherDies' ? { last: { t: 'triggerObj' } as Subject, lastPlayer: TP } : ev.event === 'oppCastSpell' || ev.event === 'castSpell' ? { last: { t: 'triggerObj' } as Subject, lastPlayer: TP } : ['combatDamagePlayer', 'eachUpkeep', 'oppUpkeep', 'eachEndStep'].includes(ev.event) ? { lastPlayer: TP } : undefined;
        const ab = parseAbility(effectText, seed);
        pc.triggers.push({ event: ev.event, filter: ev.filter, ability: ab, text: line, cond });
        if (/enters or attacks/.test(trig.cond)) pc.triggers.push({ event: 'attacks', ability: ab, text: line });
        matched = true;
        break;
      }
      if (!matched) {
        for (const f of EXT.triggers) {
          const evs = f(trig.cond);
          if (!evs) continue;
          let effectText = trig.effect;
          let cond: Cond | undefined;
          const ifm = effectText.match(/^if (.+?), (.+)$/s);
          if (ifm) {
            const c = parseCond(ifm[1]);
            if (!c) break;
            cond = c;
            effectText = ifm[2];
          }
          for (const e of evs) {
            const ab = parseAbility(effectText, { last: e.last, lastPlayer: e.lastPlayer });
            pc.triggers.push({ event: e.event as TriggerEvent, filter: e.filter, data: e.data, ability: ab, text: line, cond: cond && (e as any).cond ? ({ k: 'ext', name: 'allOf', conds: [cond, (e as any).cond] } as any) : cond ?? (e as any).cond });
          }
          matched = true;
          break;
        }
      }
      if (!matched) pc.unparsed.push(line);
      continue;
    }

    // Activated abilities: "cost: effect"
    const act = line.match(/^([^":]+?): (.+)$/s);
    if (act && (/\{|^[+-]?\d+$|^-x$|sacrifice|discard|pay|remove|exile|tap an untapped|tap \w+ untapped|^return |, return |put an? [+-]\d\/[+-]\d counter on ~|tap enchanted|tap (?:two|three|four) (?:other )?untapped|reveal ~ from your hand/.test(act[1])) && !isSpell) {
      const cost = parseCostText(act[1]);
      let effectText = act[2];
      const sorcery = /activate only as a sorcery|activate only during your turn/.test(effectText);
      const once = /activate only once each turn/.test(effectText);
      const anyPlayer = /any player may activate this ability/.test(effectText);
      const perTurn = effectText.match(/activate (?:this ability )?no more than (twice|three times) each turn/);
      effectText = effectText.replace(/\s*activate (?:this ability )?no more than (?:twice|three times) each turn\.?/, '');
      effectText = effectText.replace(/^add (\{[wubrgc]\}), then add an additional \{[wubrgc]\} for each ([a-z]+) counter removed this way/, 'add $1 plus one more for each $2 counter removed this way');
      const onlyUpkeep = /but only during any upkeep step/.test(effectText);
      effectText = effectText.replace(/\s*any player may activate this ability[^.]*\.?/g, '').replace(/\s*activate only[^.]*\.?/g, '').trim();
      const ab = parseAbility(effectText);
      const isLoyalty = cost.loyalty !== undefined;
      let isMana = false;
      let produces: Color[][] | undefined;
      let anyColor = false;
      let amount = 0;
      if (!isLoyalty && ab.specs.length === 0) {
        const manaEff = ab.effects.find((e) => e.k === 'addMana') as any;
        if (manaEff && ab.effects.every((e) => e.k === 'addMana' || e.k === 'damage' || e.k === 'lose' || (e as any).k === 'manaRestrict')) {
          isMana = true;
          const rs = ab.effects.find((e) => (e as any).k === 'manaRestrict') as any;
          if (rs) { (ab as any).restrict = rs.kind; ab.effects = ab.effects.filter((e) => (e as any).k !== 'manaRestrict'); }
          if (manaEff.colors === 'chosen') {
            anyColor = true;
            (ab as any).chosenColor = true;
            produces = Array.from({ length: Math.max(1, manaEff.n) }, () => ['W', 'U', 'B', 'R', 'G'] as Color[]);
            if (manaEff.orBase) (ab as any).chosenColorOr = manaEff.orBase;
          } else if (manaEff.colors === 'any' || manaEff.colors === 'anyOne') {
            anyColor = true;
            if (manaEff.identity) (ab as any).identity = true;
            if (manaEff.dyn) (ab as any).dyn = manaEff.dyn;
            produces = Array.from({ length: manaEff.n }, () => ['W', 'U', 'B', 'R', 'G'] as Color[]);
          } else if (manaEff.combo) {
            anyColor = true;
            (ab as any).combo = manaEff.combo;
            produces = Array.from({ length: manaEff.n }, () => manaEff.combo as Color[]);
          } else if (manaEff.n === -1) produces = [manaEff.colors];
          else produces = (manaEff.colors as Color[]).map((c) => [c]);
          amount = produces.length;
          if (manaEff.perPower) (ab as any).perPower = true;
          if (manaEff.perRemoved) { (ab as any).perRemoved = true; (ab as any).plus1 = !!manaEff.plus1; }
        }
      }
      const zone: Activated['zone'] = cost.exileSelf && /graveyard/.test(act[1]) ? 'graveyard' : cost.discardSelf || (cost as any).fromHand ? 'hand' : 'battlefield';
      pc.activated.push({
        label: line,
        cost,
        ability: ab,
        isMana,
        produces,
        anyColor,
        manaAmount: amount,
        sorcery: sorcery || isLoyalty,
        once: once || isLoyalty,
        zone,
        special: isLoyalty ? 'loyalty' : undefined,
        ...(anyPlayer ? { anyPlayer: true } : {}),
        ...(onlyUpkeep ? { onlyUpkeep: true } : {}),
        ...(perTurn ? { maxPerTurn: perTurn[1] === 'twice' ? 2 : 3 } : {}),
      } as any);
      continue;
    }

    if (isSpell) {
      spellParts.push(line);
      continue;
    }
    pc.unparsed.push(line);
  }

  tagGate();
  tagLevel();
  if (isSpell) pc.spell = parseAbility(spellParts.join('\n'));
  // plugins may claim "N+ | …" tables (station, …)
  if (tables.length && EXT.tables.some((f) => f(pc, tables, { def, name, tl, isSpell }))) tables.length = 0;
  // attach "N—M | effect" die-roll tables to the roll effects, in order
  if (tables.length) {
    const rolls: any[] = [];
    const walk = (effs: Effect[] | undefined) => {
      for (const e of effs ?? []) {
        if (e.k === 'roll') rolls.push(e);
        if ((e as any).effects) walk((e as any).effects);
      }
    };
    walk(pc.spell?.effects);
    for (const t of pc.triggers) walk(t.ability.effects);
    for (const a of pc.activated) walk(a.ability.effects);
    tables.forEach((rows, i) => {
      const r = rolls[i];
      if (!r) {
        pc.unparsed.push(...rows.map((x) => `${x.min}—${x.max} | ${x.text}`));
        return;
      }
      for (const row of rows) {
        const ab = parseAbility(row.text);
        if (ab.manual.length) pc.unparsed.push(...ab.manual);
        r.table.push({ min: row.min, max: row.max, effects: ab.effects });
        if (ab.specs.length) (r.specs ??= []).push(...ab.specs);
      }
    });
  }

  // Fallback mana ability for lands whose text we couldn't read (uses Scryfall's produced_mana).
  if (tl.includes('land') && !pc.activated.some((a) => a.isMana) && def.produced?.length) {
    const cols = def.produced.filter((c) => 'WUBRGC'.includes(c)) as Color[];
    if (cols.length) {
      pc.activated.push({
        label: `{T}: Add ${cols.map((c) => `{${c}}`).join(' or ')}`,
        cost: { mana: '', tap: true, untap: false, sacSelf: false },
        ability: { text: '', effects: [], specs: [], manual: [] },
        isMana: true,
        produces: [cols],
        manaAmount: 1,
        sorcery: false,
        once: false,
        zone: 'battlefield',
      });
    }
  }
  // Scryfall keyword list (covers keywords on lines we treated as unparsed)
  for (const k of def.keywords ?? []) {
    const kl = k.toLowerCase();
    if (KEYWORDS.includes(kl) && !pc.keywords.includes(kl) && norm.includes(kl)) pc.keywords.push(kl);
  }
  keywordTriggers(pc);
  delete (pc as any).__sticky;
  for (const f of EXT.post) f(pc, { def, name, tl, isSpell });
  return pc;
}

/** How "automated" is a card? Used by the UI to flag cards needing manual handling. */
export function automationLevel(pc: ParsedCard): 'full' | 'partial' | 'manual' {
  const manualCount =
    pc.unparsed.length +
    (pc.spell?.manual.length ?? 0) +
    pc.triggers.reduce((a, t) => a + t.ability.manual.length, 0) +
    pc.activated.reduce((a, t) => a + t.ability.manual.length + (t.cost.other ? 1 : 0), 0);
  if (!manualCount) return 'full';
  const total = manualCount + (pc.spell?.effects.length ?? 0) + pc.triggers.length + pc.activated.length + pc.statics.length + pc.keywords.length;
  return manualCount / Math.max(total, 1) > 0.6 ? 'manual' : 'partial';
}

/** Automation level of a whole card; multi-face cards are judged face by face, as the engine plays them. */
export function cardAutomation(def: CardDef): 'full' | 'partial' | 'manual' {
  if (!(def.faces && def.faces.length > 1 && def.layout !== 'meld')) return automationLevel(parseCard(def));
  const ps = def.faces.map((f) => parseCard(def, f));
  const merged: any = { ...ps[0], unparsed: ps.flatMap((x) => x.unparsed), triggers: ps.flatMap((x) => x.triggers), activated: ps.flatMap((x) => x.activated), statics: ps.flatMap((x) => x.statics), keywords: ps.flatMap((x) => x.keywords), spell: { text: '', specs: [], manual: ps.flatMap((x) => x.spell?.manual ?? []), effects: ps.flatMap((x) => x.spell?.effects ?? []) } };
  return automationLevel(merged);
}

// Plugins (registered after this module's functions exist; callbacks run lazily)
import './ext/index';
