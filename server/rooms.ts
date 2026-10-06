// Authoritative 1v1 game rooms: seats, the AI seat, broadcasting views, spectators and end-of-game payouts.
import { randomBytes } from 'node:crypto';
import { WebSocket } from 'ws';
import { parseDeckText, type CardDb } from './cards';
import { validateCommanderDeck, canBeCommander } from '../src/engine/ext/commander';
import { createGame, dispatch, startGame, viewFor } from '../src/engine/engine';
import { EXT } from '../src/engine/ext';
import type { Action, GameState, PlayerIdx } from '../src/engine/types';
import type { CardDef } from '../src/engine/cardTypes';
import { aiActionFailed, aiDecide, aiNeedsToAct } from '../src/engine/ai';

export type Format = 'constructed' | 'commander';
export interface Cosmetics { sleeve?: any; back?: any; mat?: any; avatar?: any }
export interface Seat {
  name: string;
  token: string;
  deck: CardDef[];
  deckText: string;
  sockets: Set<WebSocket>;
  bot?: boolean;
  commanders?: CardDef[];
  userId?: string;
  cosmetics?: Cosmetics;
  sub?: string; // "Gold II · Commander" / "Level 31"
}
export interface Room {
  code: string;
  seats: (Seat | null)[];
  game: GameState | null;
  created: number;
  lastActive: number;
  rematchVotes: Set<number>;
  format?: Format;
  mode?: string; // quick | standard | cmd | rcmd | draft | private | ai
  ranked?: boolean;
  botTimer?: ReturnType<typeof setTimeout>;
  spectators: Set<WebSocket>;
  paidFor?: GameState | null; // game instance already paid out
  onOver?: (room: Room) => void;
  draft?: { podId: string; round: number };
}

export function send(ws: WebSocket, msg: any) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

export class Rooms {
  rooms = new Map<string, Room>();
  db: CardDb;
  /** Called once per finished game (for payouts, quests, ranked, draft rounds). */
  onGameOver: (room: Room, game: GameState) => void = () => {};
  constructor(db: CardDb) {
    this.db = db;
    // per-game stats the quests need (spells cast with their colors, lands played, attackers)
    EXT.hooks.event.push((s, name, d) => {
      const st = ((s as any).mfStats ??= { casts: [[], []], lands: [0, 0], attacks: [0, 0] });
      if (name === 'cast' && d.item?.kind === 'spell') {
        const c = s.cards[d.item.source];
        const def = c ? s.defs[c.defId] : null;
        if (def && d.item.controller != null) st.casts[d.item.controller]?.push([...(def.colors ?? [])]);
      } else if (name === 'landPlayed') st.lands[d.p] = (st.lands[d.p] ?? 0) + 1;
      else if (name === 'attack') st.attacks[d.p] = (st.attacks[d.p] ?? 0) + (d.list?.length ?? 0);
    });
    setInterval(() => {
      const now = Date.now();
      for (const [code, r] of this.rooms) {
        const anyone = r.seats.some((s) => s && !s.bot && s.sockets.size) || r.spectators.size;
        if (!anyone && now - r.lastActive > 1000 * 60 * 60 * 3) {
          clearTimeout(r.botTimer);
          this.rooms.delete(code);
        }
      }
    }, 1000 * 60 * 10).unref?.();
  }

  newCode(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let c = '';
    do c = Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
    while (this.rooms.has(c));
    return c;
  }
  token() {
    return randomBytes(12).toString('hex');
  }

  buildDeck(text: string, format: Format = 'constructed'): { cards: CardDef[]; unknown: string[]; commanders: CardDef[]; warnings: string[]; side: CardDef[] } {
    const parsed = parseDeckText(this.db, text);
    const cards: CardDef[] = [];
    for (const { count, card } of parsed.main) for (let i = 0; i < Math.min(count, 250); i++) cards.push(card);
    const side: CardDef[] = [];
    for (const { count, card } of parsed.side) for (let i = 0; i < Math.min(count, 30); i++) side.push(card);
    let commanders = parsed.commander;
    const warnings: string[] = [];
    if (format === 'commander') {
      if (!commanders.length) {
        const i = cards.findIndex((c) => canBeCommander(c));
        if (i >= 0) commanders = cards.splice(i, 1);
      }
      warnings.push(...validateCommanderDeck(cards, commanders));
    } else if (commanders.length) cards.push(...commanders);
    return { cards, unknown: parsed.unknown, commanders, warnings, side };
  }

  /** Legality used for matchmaking (Ready to play in the Deck Builder uses the same rules). */
  checkDeck(text: string, mode: string): { ok: boolean; why?: string; format: Format; deck: ReturnType<Rooms['buildDeck']> } {
    const format: Format = mode === 'cmd' || mode === 'rcmd' ? 'commander' : mode === 'standard' ? 'constructed' : /^\s*commander/im.test(text) ? 'commander' : 'constructed';
    const deck = this.buildDeck(text, format);
    if (!deck.cards.length) return { ok: false, why: 'That deck is empty.', format, deck };
    if (format === 'commander') {
      if (!deck.commanders.length) return { ok: false, why: 'Commander decks need a commander.', format, deck };
      const total = deck.cards.length + deck.commanders.length;
      if ((mode === 'cmd' || mode === 'rcmd') && total !== 100) return { ok: false, why: `Commander decks need exactly 100 cards (this one has ${total}).`, format, deck };
      if ((mode === 'cmd' || mode === 'rcmd') && deck.warnings.length) return { ok: false, why: deck.warnings[0], format, deck };
    } else if (mode === 'standard') {
      if (deck.cards.length < 60) return { ok: false, why: `Constructed decks need at least 60 cards (this one has ${deck.cards.length}).`, format, deck };
      const counts = new Map<string, number>();
      for (const c of deck.cards) if (!/\bBasic\b/.test(c.typeLine)) counts.set(c.name, (counts.get(c.name) ?? 0) + 1);
      const over = [...counts].find(([, n]) => n > 4);
      if (over) return { ok: false, why: `Only 4 copies of ${over[0]} are allowed.`, format, deck };
    }
    return { ok: true, format, deck };
  }

  create(opts: { format: Format; mode?: string; ranked?: boolean; seats: (Omit<Seat, 'token' | 'sockets'> | null)[]; start?: boolean; draft?: Room['draft'] }): Room {
    const r: Room = {
      code: this.newCode(), seats: opts.seats.map((s) => (s ? { ...s, token: this.token(), sockets: new Set() } : null)), game: null,
      created: Date.now(), lastActive: Date.now(), rematchVotes: new Set(), format: opts.format, mode: opts.mode, ranked: opts.ranked, spectators: new Set(), draft: opts.draft,
    };
    this.rooms.set(r.code, r);
    if (opts.start && r.seats.every(Boolean)) this.start(r);
    return r;
  }

  start(room: Room) {
    const [a, b] = room.seats as Seat[];
    room.game = createGame(room.code, [
      { name: a.name, cards: a.deck, commanders: a.commanders },
      { name: b.name, cards: b.deck, commanders: b.commanders },
    ], undefined, { format: room.format ?? 'constructed' });
    startGame(room.game);
    room.rematchVotes.clear();
  }

  publicSeats(room: Room) {
    return room.seats.map((s) => (s ? { name: s.name, deckSize: s.deck.length, connected: s.bot || s.sockets.size > 0, bot: !!s.bot, cosmetics: s.cosmetics ?? null, sub: s.sub ?? null } : null));
  }

  broadcast(room: Room) {
    const meta = { mode: room.mode ?? null, ranked: !!room.ranked, seats: this.publicSeats(room), draft: room.draft ?? null };
    room.seats.forEach((seat, idx) => {
      if (!seat) return;
      const payload = room.game
        ? { t: 'state', seat: idx, code: room.code, view: viewFor(room.game, idx as PlayerIdx), meta }
        : { t: 'lobby', seat: idx, code: room.code, players: this.publicSeats(room) };
      for (const ws of seat.sockets) send(ws, payload);
    });
    if (room.game && room.spectators.size) {
      const payload = { t: 'state', seat: -1, code: room.code, view: viewFor(room.game, null), meta, spectating: true };
      for (const ws of room.spectators) send(ws, payload);
    }
    if (room.game?.over && room.paidFor !== room.game) {
      room.paidFor = room.game;
      try {
        this.onGameOver(room, room.game);
      } catch (e) {
        console.error('[rooms] payout failed', e);
      }
    }
    this.scheduleBot(room);
  }

  /** Let the AI seat act, one decision at a time with a short delay so humans can follow along. */
  scheduleBot(room: Room) {
    const g = room.game;
    if (!g || room.botTimer) return;
    const idx = room.seats.findIndex((s) => s?.bot);
    if (idx < 0) return;
    if (g.over) {
      room.rematchVotes.add(idx);
      return;
    }
    if (!aiNeedsToAct(g, idx as PlayerIdx)) return;
    const quick = !g.prompt && g.priority === idx && g.stack.length === 0 && !['main1', 'main2'].includes(g.step);
    room.botTimer = setTimeout(() => {
      room.botTimer = undefined;
      if (room.game !== g) return;
      let acted = 0;
      while (acted++ < 25 && aiNeedsToAct(g, idx as PlayerIdx)) {
        let action;
        try {
          action = aiDecide(g, idx as PlayerIdx);
        } catch (e) {
          console.error('[ai] decision error', e);
          action = g.prompt?.canCancel ? { type: 'cancel', promptId: g.prompt.id } : { type: 'pass' };
        }
        if (!action) break;
        const err = dispatch(g, idx as PlayerIdx, action as Action);
        if (err) aiActionFailed(g, action as Action);
        if (action.type !== 'pass') break;
      }
      this.broadcast(room);
    }, quick ? 120 : 650);
  }

  /** Which room (and seat) a user is sitting in right now, for presence and rejoining. */
  findUser(userId: string): { room: Room; seat: number } | null {
    for (const r of this.rooms.values()) {
      const i = r.seats.findIndex((s) => s?.userId === userId);
      if (i >= 0 && r.game && !r.game.over) return { room: r, seat: i };
    }
    return null;
  }
}
