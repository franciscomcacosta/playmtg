import type { CardDef } from './cardTypes';

export type PlayerIdx = 0 | 1;
export type Color = 'W' | 'U' | 'B' | 'R' | 'G' | 'C';
export const COLORS: Color[] = ['W', 'U', 'B', 'R', 'G'];

export type Zone = 'library' | 'hand' | 'battlefield' | 'graveyard' | 'exile' | 'stack' | 'command';

export type Step =
  | 'untap'
  | 'upkeep'
  | 'draw'
  | 'main1'
  | 'beginCombat'
  | 'declareAttackers'
  | 'declareBlockers'
  | 'firstStrikeDamage'
  | 'combatDamage'
  | 'endCombat'
  | 'main2'
  | 'end'
  | 'cleanup';

export const STEPS: Step[] = [
  'untap',
  'upkeep',
  'draw',
  'main1',
  'beginCombat',
  'declareAttackers',
  'declareBlockers',
  'firstStrikeDamage',
  'combatDamage',
  'endCombat',
  'main2',
  'end',
  'cleanup',
];

export const STEP_LABEL: Record<Step, string> = {
  untap: 'Untap',
  upkeep: 'Upkeep',
  draw: 'Draw',
  main1: 'Main 1',
  beginCombat: 'Beginning of Combat',
  declareAttackers: 'Declare Attackers',
  declareBlockers: 'Declare Blockers',
  firstStrikeDamage: 'First-Strike Damage',
  combatDamage: 'Combat Damage',
  endCombat: 'End of Combat',
  main2: 'Main 2',
  end: 'End Step',
  cleanup: 'Cleanup',
};

/** A continuous effect applied to one object (rules 611/613). Applied in layer order by rules.chars(). */
export interface TempMod {
  power?: number;
  toughness?: number;
  keywords?: string[];
  cantBlock?: boolean;
  setController?: PlayerIdx; // controller to restore when the effect ends
  addTypes?: string[];
  removeTypes?: string[];
  addSubtypes?: string[];
  setPT?: [number, number];
  colors?: string[];
  loseAbilities?: boolean;
  until: 'eot' | 'permanent' | 'whileSourceControlled';
  source?: string;
  ts?: number;
}

export interface CopyInfo {
  defId: string;
  face?: number;
  colors?: string[]; // embalm/eternalize overrides
  addSubtypes?: string[];
  pt?: [string, string];
  noManaCost?: boolean;
}

export interface CardObj {
  iid: string;
  defId: string;
  owner: PlayerIdx;
  controller: PlayerIdx;
  zone: Zone;
  tapped: boolean;
  sick: boolean; // came under control since start of controller's most recent turn
  counters: Record<string, number>;
  damage: number;
  deathtouched: boolean;
  attachedTo?: string;
  face: number; // active face index for DFC / chosen split half
  transformed?: boolean;
  faceDown?: boolean;
  token?: boolean;
  mods: TempMod[];
  ts: number; // timestamp
  skipUntap?: boolean;
  loyaltyUsed?: boolean;
  revealed?: boolean;
  onAdventure?: boolean;
  castFromGraveyardExile?: boolean; // flashback: exile when leaving stack
  phasedOut?: boolean;
  copyOf?: CopyInfo;
  mayPlay?: { player: PlayerIdx; untilTurn: number; free?: boolean };
  foretold?: number; // turn it was foretold
  plotted?: number; // turn it was plotted
  suspended?: boolean;
  linked?: string[]; // cards exiled "until ~ leaves"
  morph?: { cost: string; kind: 'morph' | 'megamorph' | 'disguise' | 'manifest' | 'cloak' };
  bestowed?: boolean;
  unearthed?: boolean;
  renowned?: boolean;
  echoDue?: boolean;
  disturbed?: boolean;
  escaped?: boolean;
  xPaid?: number;
  kicked?: boolean;
  classLevel?: number;
  meldedWith?: string; // the other card of a melded pair (kept in exile while melded)
}

export type Target =
  | { kind: 'card'; iid: string }
  | { kind: 'player'; idx: PlayerIdx }
  | { kind: 'stack'; id: string };

export interface StackItem {
  id: string;
  kind: 'spell' | 'ability' | 'trigger';
  controller: PlayerIdx;
  source: string; // card iid
  label: string;
  text: string; // effect text shown to players
  effects: any[]; // parsed Effect[]
  targets: Target[][]; // one list per target spec
  x?: number;
  face?: number;
  manual?: string[]; // text the engine cannot automate
  mode?: number[];
}

export interface ManaPool {
  W: number;
  U: number;
  B: number;
  R: number;
  G: number;
  C: number;
}

export interface PlayerState {
  idx: PlayerIdx;
  name: string;
  life: number;
  poison: number;
  library: string[]; // top = index 0
  hand: string[];
  graveyard: string[]; // top = last
  exile: string[];
  pool: ManaPool;
  landsPlayed: number;
  landsAllowed: number;
  mulligans: number;
  kept: boolean;
  drewFromEmpty: boolean;
  lost: boolean;
  conceded: boolean;
  lifeGainedThisTurn: number;
  spellsCastThisTurn: number;
  counters: Record<string, number>; // energy, experience, rad …
  damagedThisTurn: boolean;
  stops: { own: Step[]; opp: Step[] };
  passUntilEOT: boolean;
  fullControl: boolean;
  connected: boolean;
}

export interface Attacker {
  iid: string;
  target: Target; // player or planeswalker/battle card
  blockedBy: string[];
  blocked: boolean;
  dealtFirstStrike?: boolean;
}

export interface CombatState {
  attackers: Attacker[];
  declared: boolean;
  blocksDeclared: boolean;
  firstStrike: boolean;
}

export type PromptKind =
  | 'mulligan'
  | 'bottom'
  | 'targets'
  | 'x'
  | 'mode'
  | 'chooseCards'
  | 'yesno'
  | 'color'
  | 'scry'
  | 'declareAttackers'
  | 'declareBlockers'
  | 'number'
  | 'divide'
  /** Name any card (answer: the card name as a string). */
  | 'cardName';

export interface Prompt {
  id: string;
  player: PlayerIdx;
  kind: PromptKind;
  title: string;
  // candidates for card/target choices
  options?: { id: string; label: string }[];
  cards?: string[]; // iids to choose among (visible to prompted player)
  targets?: Target[]; // legal targets
  min?: number;
  max?: number;
  canCancel?: boolean;
  data?: any; // continuation info (server only semantics)
}

export interface LogEntry {
  t: number;
  player?: PlayerIdx;
  text: string;
  kind?: 'info' | 'manual' | 'warn' | 'chat' | 'combat' | 'turn';
}

export interface GameState {
  id: string;
  seed: number;
  started: boolean;
  over: boolean;
  winner?: PlayerIdx | null;
  turn: number;
  active: PlayerIdx;
  startingPlayer: PlayerIdx;
  step: Step;
  priority: PlayerIdx;
  passes: number; // consecutive passes
  players: [PlayerState, PlayerState];
  cards: Record<string, CardObj>;
  defs: Record<string, CardDef>;
  battlefield: string[];
  stack: StackItem[];
  combat: CombatState | null;
  pendingTriggers: StackItem[];
  prompt: Prompt | null;
  promptQueue: Prompt[];
  resolving: any | null; // continuation for effects waiting on a prompt
  pendingCast: any | null;
  log: LogEntry[];
  nextId: number;
  ts: number;
  manualNotice: string | null;
  version: number;
  dayNight: 'day' | 'night' | null;
  delayed: { at: 'nextEnd' | 'nextUpkeep'; controller: PlayerIdx; source: string; label: string; effects: any[]; targets: Target[][]; refs?: string[] }[];
  lastTurnSpells: number;
  lastTurnActiveSpells: number;
}

export type CastAlt = 'normal' | 'commander' | 'alt' | 'madness' | 'mutate' | 'morph' | 'bestow' | 'foretell' | 'disturb' | 'escape' | 'plot' | 'flashback' | 'mayPlay' | 'adventure';

export type Action =
  | { type: 'keep' }
  | { type: 'mulligan' }
  | { type: 'pass' }
  | { type: 'passUntilEOT'; on: boolean }
  | { type: 'setStops'; own: Step[]; opp: Step[]; fullControl?: boolean }
  | { type: 'setPace'; pace: 'fast' | 'normal' | 'slow' }
  | { type: 'playLand'; iid: string; face?: number }
  | { type: 'cast'; iid: string; face?: number; alt?: CastAlt; kicker?: boolean }
  | { type: 'turnFaceUp'; iid: string }
  | { type: 'activate'; iid: string; ability: number }
  | { type: 'tapForMana'; iid: string; ability?: number }
  | { type: 'answer'; promptId: string; choice: any }
  | { type: 'cancel'; promptId: string }
  | { type: 'concede' }
  | { type: 'chat'; text: string }
  | { type: 'manual'; op: ManualOp };

export type ManualOp =
  | { op: 'tap'; iid: string }
  | { op: 'move'; iid: string; to: Zone | 'libraryTop' | 'libraryBottom' }
  | { op: 'counter'; iid: string; counter: string; delta: number }
  | { op: 'life'; player: PlayerIdx; delta: number }
  | { op: 'poison'; player: PlayerIdx; delta: number }
  | { op: 'draw'; n: number }
  | { op: 'shuffle' }
  | { op: 'mill'; n: number }
  | { op: 'transform'; iid: string }
  | { op: 'faceDown'; iid: string }
  | { op: 'token'; name: string; power?: string; toughness?: string; types?: string; colors?: string[]; keywords?: string[]; count?: number }
  | { op: 'clone'; iid: string }
  | { op: 'control'; iid: string }
  | { op: 'pump'; iid: string; power: number; toughness: number }
  | { op: 'reveal'; iid: string }
  | { op: 'untapAll' }
  | { op: 'mana'; color: Color; delta: number }
  | { op: 'attach'; iid: string; to: string | null }
  | { op: 'resolveTop' }
  | { op: 'damage'; iid: string; delta: number };
