// Plugin registry: mechanics are added here from src/engine/ext/*.ts without touching the core files.
// Parsing hooks run in oracle.ts, effect handlers and rule hooks run in engine.ts / rules.ts.
import type { GameState, PlayerIdx, StackItem, Step, Action, Target } from './types';

export type Api = Record<string, any>;
export interface ExtEffectCtx { s: GameState; item: StackItem; e: any; r: any; you: PlayerIdx; api: Api }
export interface CastOpt { label: string; action: Action; ok: boolean }
export interface ExtAlt {
  /** Return the mana cost to pay (possibly '') or an error string starting with '!'. */
  begin(s: GameState, p: PlayerIdx, iid: string, pcFront: any, api: Api): string;
  /** Called in the costs stage; push a prompt and return true to wait, false when done. */
  costs?(s: GameState, pc: any, api: Api): boolean;
  /** Called when the spell is paid for, before it goes on the stack. */
  pay?(s: GameState, pc: any, api: Api): void;
  /** Called after the spell is put on the stack. */
  afterPush?(s: GameState, item: StackItem, api: Api): void;
  /** Replace the spell's ability (overload, fuse, awaken …). */
  ability?(s: GameState, p: PlayerIdx, iid: string, face: number, base: any, api: Api): any;
  /** Label shown in cast options, e.g. "warp". */
  label?: string;
  /** This way of casting may be used any time you could cast an instant. */
  instant?: boolean;
}

export const EXT = {
  /** Sentence rules: [regex, (match, ctx) => Effect[] | null]. Tried before the built-in rules. */
  rules: [] as [RegExp, (m: RegExpMatchArray, ctx: any) => any[] | null][],
  /** Whole-line handlers in parseFace (statics, keywords). Return true if the line was consumed. */
  lines: [] as ((line: string, pc: any, info: { isSpell: boolean; tl: string; def: any; name: string }) => boolean)[],
  /** Multi-sentence handlers in parseAbility. Return how many EXTRA sentences were consumed (0+), or null. */
  seqs: [] as ((sents: string[], i: number, ctx: any, ab: any) => number | null)[],
  /** Condition parsers ("if …", "as long as …"). */
  conds: [] as ((text: string) => any | null)[],
  /** Evaluators for { k: 'ext', name } conditions. */
  condEval: {} as Record<string, (s: GameState, cond: any, you: PlayerIdx, self?: string, ctx?: any) => boolean>,
  /** Handlers for { k: 'ext', name } effects. */
  effects: {} as Record<string, (c: ExtEffectCtx) => 'done' | 'wait'>,
  /** Alternative / optional casting modes: action { type: 'cast', alt: 'ext:<name>' }. */
  alts: {} as Record<string, ExtAlt>,
  hooks: {
    /** Modify a spell's mana cost string (cost reductions / increases). */
    costMod: [] as ((s: GameState, p: PlayerIdx, iid: string, cost: string, alt: string, api: Api) => string)[],
    /** Return false to forbid. */
    canAttack: [] as ((s: GameState, iid: string, api: Api) => boolean | undefined)[],
    /** Return false to forbid activating this ability (Stony Silence, Cursed Totem, Grand Abolisher). */
    canActivate: [] as ((s: GameState, p: PlayerIdx, iid: string, a: any, api: Api) => boolean | undefined)[],
    /** Modify an activated ability's mana cost ("this ability costs {1} less to activate for each …"). */
    actCostMod: [] as ((s: GameState, p: PlayerIdx, iid: string, a: any, cost: string, api: Api) => string)[],
    /** A permanent was tapped for mana (mana abilities with {T} in the cost); colors = the mana it produced. */
    manaTapped: [] as ((s: GameState, p: PlayerIdx, iid: string, colors: string[], api: Api) => void)[],
    /** Extra mana cost to attack with a creature (Propaganda): return a cost string or null. */
    attackCost: [] as ((s: GameState, iid: string, target: any, api: Api) => string | null)[],
    canBlock: [] as ((s: GameState, blocker: string, attacker: string, api: Api) => boolean | undefined)[],
    /** Validate a full set of blocks; return an error message or null. */
    validateBlocks: [] as ((s: GameState, list: { blocker: string; attacker: string }[], api: Api) => string | null)[],
    /** Return false to keep a permanent tapped during its controller's untap step. */
    untap: [] as ((s: GameState, iid: string, api: Api) => boolean | undefined)[],
    /** Runs at the start of every step (after the core's own step actions are queued). */
    step: [] as ((s: GameState, step: Step, api: Api) => void)[],
    /** Runs after every zone change. */
    afterMove: [] as ((s: GameState, iid: string, from: string, to: string, opts: any, api: Api) => void)[],
    /** Extra cast/activate options shown for a card (hand, graveyard, exile …). */
    castOptions: [] as ((s: GameState, p: PlayerIdx, iid: string, api: Api) => CastOpt[])[],
    /** A spell finished resolving (or was countered). Return true if you moved the card yourself. */
    finish: [] as ((s: GameState, item: StackItem, countered: boolean, api: Api) => boolean)[],
    /** A spell or ability was put on the stack. */
    pushed: [] as ((s: GameState, item: StackItem, api: Api) => void)[],
    /** Damage is about to be dealt; return the new amount. */
    damage: [] as ((s: GameState, source: string, to: Target, n: number, combat: boolean, api: Api) => number)[],
    /** Add fields to a player's view. */
    view: [] as ((s: GameState, viewer: PlayerIdx | null, view: any) => void)[],
    /** Casting pipeline, costs stage: push a prompt and return true to wait (e.g. additional costs). pc = pending cast. */
    castCosts: [] as ((s: GameState, pc: any, api: Api) => boolean)[],
    /** Casting pipeline, pay stage (after mana): pay the chosen extra costs. */
    castPay: [] as ((s: GameState, pc: any, api: Api) => void)[],
    /** Return a reason string to forbid casting a spell right now (e.g. an additional cost can't be paid). */
    castBlock: [] as ((s: GameState, p: PlayerIdx, iid: string, alt: string, api: Api, face?: number) => string | null)[],
    /** Casting from an unusual zone (aftermath, jump-start …): return an alt like 'ext:jumpstart' or null. */
    zoneCast: [] as ((s: GameState, p: PlayerIdx, card: any, pcFront: any, api: Api) => string | null)[],
    /** How many creatures a blocker may block (default 1). */
    maxBlocks: [] as ((s: GameState, blocker: string, api: Api) => number | undefined)[],
    /** Extra state-based actions; return true if anything changed. */
    sba: [] as ((s: GameState, api: Api) => boolean)[],
    /** true = this player can't lose the game right now (Platinum Angel) */
    /** true = player p can't play lands right now */
    cantPlayLand: [] as ((s: GameState, p: PlayerIdx, api: Api) => boolean)[],
    /** cost changes that depend on choices made while casting (targets, bargain): run once, just before paying */
    lateCost: [] as ((s: GameState, pc: any, api: Api) => string | undefined)[],
    /** true = this creature assigns combat damage equal to its toughness (Doran) */
    dmgByToughness: [] as ((s: GameState, iid: string, api: Api) => boolean)[],
    /** true = this permanent can't be the target of that source's spell/ability */
    cantTarget: [] as ((s: GameState, iid: string, source: string, you: PlayerIdx, api: Api) => boolean)[],
    /** token replacement: a different token is created instead (Divine Visitation) */
    tokenSpec: [] as ((s: GameState, p: PlayerIdx, spec: any, api: Api) => any | undefined)[],
    /** token replacement: N times that many (Ojer Taq) */
    tokenMult: [] as ((s: GameState, p: PlayerIdx, spec: any, api: Api) => number | undefined)[],
    /** token replacement: "those tokens plus …" (Chatterfang, Peregrin Took) — create the extras */
    tokensMade: [] as ((s: GameState, p: PlayerIdx, n: number, spec: any, api: Api) => void)[],
    /** extra times a triggered ability of this source triggers ("triggers an additional time") */
    trigExtra: [] as ((s: GameState, source: string, controller: PlayerIdx, api: Api) => number | undefined)[],
    cantLose: [] as ((s: GameState, p: PlayerIdx, api: Api) => boolean)[],
    /** Modify an amount of life about to be gained (0 prevents it). */
    lifeGain: [] as ((s: GameState, p: PlayerIdx, n: number, api: Api) => number)[],
    /** Life about to be lost (not damage); return the new amount (0 = none). */
    lifeLoss: [] as ((s: GameState, p: PlayerIdx, n: number, api: Api) => number)[],
    /** A card is about to be drawn; return 'skip' to replace the draw (Narset, Notion Thief). */
    draw: [] as ((s: GameState, p: PlayerIdx, api: Api) => 'skip' | undefined)[],
    /** Return true if a card may be cast as though it had flash. */
    flash: [] as ((s: GameState, iid: string, api: Api) => boolean)[],
    /** Game events broadcast by the engine: cast, attack, blocks, dealt, counters, draw, activate, scry, surveil, untapped, leave. */
    event: [] as ((s: GameState, name: string, data: any, api: Api) => void)[],
  },
  /** Extra trigger heads ("whenever you attack", …). Return one or more trigger descriptors, or null. */
  triggers: [] as ((cond: string) => { event: string; filter?: any; data?: any; last?: any; lastPlayer?: any; cond?: any }[] | null)[],
  /** Amount phrases ("your devotion to black", "the amount of life you gained this turn"): return an Amt such as
   *  { ext: 'name', ... } or null. Tried before the built-in count phrases. */
  amountPhrases: [] as ((phrase: string) => any | null)[],
  /** Evaluators for { ext: name } amounts. */
  amounts: {} as Record<string, (s: GameState, a: any, you: PlayerIdx, self?: string, ctx?: any) => number>,
  /** Ability words that gate the abilities printed after them ("max speed — …"): [regex, condition]. */
  gates: [] as [RegExp, any][],
  /** Activated abilities with `extSpecial` run this instead of going on the stack. */
  specials: {} as Record<string, (s: GameState, p: PlayerIdx, iid: string, a: any, api: Api) => string | null>,
  /** "N+ | text" tables under a line: return true to consume them all. */
  tables: [] as ((pc: any, tables: { min: number; max: number; text: string }[][], info: { def: any; name: string; tl: string; isSpell: boolean }) => boolean)[],
  /** Runs at the end of parsing a face. */
  /** Activated-ability cost parts the core parser doesn't know: return true if handled (write into cost). */
  costParts: [] as ((part: string, cost: any) => boolean)[],
  post: [] as ((pc: any, info: { def: any; name: string; tl: string; isSpell: boolean; face?: any }) => void)[],
  /** Split one printed line into several lines (compound triggers). */
  expand: [] as ((line: string) => string[] | null)[],
};
