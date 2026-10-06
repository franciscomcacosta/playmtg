// Draft Night: 4-seat pods (bots fill empty seats), 3 packs of 14 passed left-right-left, a 40-card deck from your
// picks plus basic lands, then 3 rounds against the pod. The entry (750 embers) is paid once per day; every pick
// goes into your collection; prizes are paid in embers by wins.
import type { WebSocket } from 'ws';
import type { CardDb } from './cards';
import { norm } from './cards';
import type { CardDef } from '../src/engine/cardTypes';
import { cardAutomation } from '../src/engine/oracle';
import { send, type Room, type Rooms } from './rooms';
import type { Hub } from './meta/hub';
import type { Accounts } from './meta/accounts';
import { Err } from './meta/accounts';
import { DRAFT, ITEM } from './meta/catalog';
import type { GameState } from '../src/engine/types';

type Rar = 'common' | 'uncommon' | 'rare' | 'mythic';
interface PCard { id: string; name: string; rarity: Rar; image: string | null; colors: string[]; cmc: number; type: string }
interface DSeat {
  name: string;
  userId?: string;
  bot: boolean;
  art: string | null;
  picks: PCard[];
  queue: PCard[][]; // packs waiting to be picked from (first = current)
  deck: Record<string, number> | null;
  wins: number;
  losses: number;
  pickDeadline: number;
  played: number[]; // opponents faced
}
interface Pod {
  id: string;
  seats: DSeat[];
  phase: 'seating' | 'drafting' | 'building' | 'playing' | 'done';
  pack: number; // 1..3
  created: number;
  round: number;
  rooms: Map<string, Room>; // code -> room for the current round
  results: { round: number; a: number; b: number; winner: number | null }[];
  buildDeadline: number;
  timer?: ReturnType<typeof setTimeout>;
}

const BOT_NAMES = ['Orrin', 'Sable', 'Wren', 'Corvin', 'Ilsa', 'Tamsin'];
const BOT_AVATARS = ['a-liliana', 'a-chandra', 'a-teferi', 'a-nissa', 'a-ajani', 'a-garruk'];
const PICK_SECONDS = 45;
const BUILD_SECONDS = 600;
const BASICS = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'];
const RW: Record<Rar, number> = { common: 1, uncommon: 2, rare: 3.4, mythic: 4 };

export class Drafts {
  db: CardDb;
  rooms: Rooms;
  acc: Accounts;
  hub!: Hub;
  pods = new Map<string, Pod>();
  waiting: { sess: any; userId: string; since: number }[] = [];
  byUser = new Map<string, Pod>();
  private buckets: Record<Rar, CardDef[]> | null = null;
  private seq = 1;

  constructor(db: CardDb, rooms: Rooms, acc: Accounts) {
    this.db = db;
    this.rooms = rooms;
    this.acc = acc;
    setInterval(() => this.tick(), 700).unref?.();
  }

  // ------------------------------------------------------------------------------------ packs
  pool(): Record<Rar, CardDef[]> {
    if (this.buckets) return this.buckets;
    const b: Record<Rar, CardDef[]> = { common: [], uncommon: [], rare: [], mythic: [] };
    for (const c of this.db.cards) {
      const legal = (c as any).legal as string[] | undefined;
      if (!legal?.some((f) => f === 'pioneer' || f === 'modern')) continue;
      if (/\bBasic\b|\bToken\b/.test(c.typeLine) || c.name.startsWith('A-') || c.cmc > 8) continue;
      const r = (c as any).rarity as Rar;
      if (!b[r]) continue;
      try {
        if (cardAutomation(c) !== 'full') continue;
      } catch {
        continue;
      }
      b[r].push(c);
    }
    this.buckets = b;
    return b;
  }
  warm() {
    setTimeout(async () => {
      for (let i = 0; i < this.db.cards.length && !this.buckets; i += 250) {
        for (const c of this.db.cards.slice(i, i + 250)) {
          try {
            cardAutomation(c);
          } catch {}
        }
        await new Promise((r) => setImmediate(r));
      }
      const t = Date.now();
      const b = this.pool();
      console.log(`[draft] pack pool ready in ${Date.now() - t}ms (C ${b.common.length} · U ${b.uncommon.length} · R ${b.rare.length} · M ${b.mythic.length})`);
    }, 4000);
  }
  pcard(c: CardDef): PCard {
    return { id: `p${this.seq++}`, name: c.name, rarity: (c as any).rarity, image: c.image ?? null, colors: [...(c.colors ?? [])], cmc: c.cmc, type: c.typeLine };
  }
  /** 14 cards: 10 commons, 3 uncommons, 1 rare (a mythic one time in eight). No duplicates in a pack. */
  makePack(): PCard[] {
    const b = this.pool();
    const take = (r: Rar, n: number, out: CardDef[]) => {
      for (let i = 0; i < n; i++) {
        let c: CardDef;
        let guard = 0;
        do c = b[r][Math.floor(Math.random() * b[r].length)];
        while (out.includes(c) && guard++ < 20);
        out.push(c);
      }
    };
    const cards: CardDef[] = [];
    take(Math.random() < 1 / 8 && b.mythic.length ? 'mythic' : 'rare', 1, cards);
    take('uncommon', 3, cards);
    take('common', DRAFT.packSize - 4, cards);
    return cards.map((c) => this.pcard(c));
  }

  // ------------------------------------------------------------------------------------ joining
  seated() {
    let n = 0;
    for (const p of this.pods.values()) if (p.phase !== 'done') n += p.seats.filter((s) => !s.bot).length;
    return n + this.waiting.length;
  }
  async join(sess: any, msg: any) {
    if (!sess.user) throw new Err('Sign in to play Draft Night.');
    const uid = sess.user.id as string;
    const live = this.byUser.get(uid);
    if (live && live.phase !== 'done') {
      this.sendState(live, uid);
      return;
    }
    if (this.waiting.some((w) => w.userId === uid)) return;
    // pay the entry once per day
    await this.acc.mutate(uid, (p, _fx, led) => {
      if (!p.data.draft.paid) {
        this.acc.debit(p, led, 'embers', DRAFT.entry, 'draft-entry');
        p.data.draft.paid = true;
      }
    });
    this.waiting.push({ sess, userId: uid, since: Date.now() });
    send(sess.ws, { t: 'queue', state: { mode: 'draft', since: Date.now(), seats: this.seatPreview() }, rid: msg?.rid });
  }
  leaveQueue(sess: any) {
    this.waiting = this.waiting.filter((w) => w.sess !== sess);
  }
  seatPreview() {
    return this.waiting.map((w) => ({ name: w.sess.user?.name ?? 'Drafter' }));
  }
  disconnect(sess: any) {
    this.leaveQueue(sess);
  }
  hello(sess: any, userId: string) {
    const p = this.byUser.get(userId);
    if (p && p.phase !== 'done') this.sendState(p, userId);
  }

  // ------------------------------------------------------------------------------------ the clock
  tick() {
    const now = Date.now();
    // seat a pod: 4 humans right away, otherwise after 8 s fill with bots
    if (this.waiting.length >= DRAFT.seats || (this.waiting.length && now - this.waiting[0].since > 8000)) {
      const humans = this.waiting.splice(0, DRAFT.seats);
      this.seatPod(humans).catch((e) => console.error('[draft] seat', e));
    } else if (this.waiting.length) {
      const seats = this.seatPreview();
      for (const w of this.waiting) send(w.sess.ws, { t: 'queue', state: { mode: 'draft', since: w.since, seats } });
    }
    for (const pod of this.pods.values()) {
      if (pod.phase === 'drafting') {
        for (let i = 0; i < pod.seats.length; i++) {
          const s = pod.seats[i];
          if (!s.queue.length) continue;
          if (s.bot) {
            if (now > s.pickDeadline) this.pick(pod, i, this.botChoice(s, s.queue[0]).id);
          } else if (now > s.pickDeadline) this.pick(pod, i, this.botChoice(s, s.queue[0]).id); // time ran out: auto-pick
        }
      } else if (pod.phase === 'building' && now > pod.buildDeadline) {
        for (const s of pod.seats) if (!s.deck) s.deck = this.autoDeck(s.picks);
        this.startRound(pod);
      }
      if (pod.phase === 'done' && now - pod.created > 6 * 3600 * 1000) {
        this.pods.delete(pod.id);
        for (const s of pod.seats) if (s.userId && this.byUser.get(s.userId) === pod) this.byUser.delete(s.userId);
      }
    }
  }

  async seatPod(humans: { sess: any; userId: string }[]) {
    const pod: Pod = { id: `pod${this.seq++}`, seats: [], phase: 'seating', pack: 0, created: Date.now(), round: 0, rooms: new Map(), results: [], buildDeadline: 0 };
    for (const h of humans) {
      const p = await this.acc.load(h.userId);
      pod.seats.push({ name: p.name, userId: h.userId, bot: false, art: this.hub.art(ITEM.get(p.data.equipped.avatar ?? 'a-jace')?.art), picks: [], queue: [], deck: null, wins: 0, losses: 0, pickDeadline: 0, played: [] });
      this.byUser.set(h.userId, pod);
    }
    let k = 0;
    while (pod.seats.length < DRAFT.seats) {
      const i = k++;
      pod.seats.push({ name: BOT_NAMES[(i + pod.created) % BOT_NAMES.length], bot: true, art: this.hub.art(ITEM.get(BOT_AVATARS[i % BOT_AVATARS.length])?.art), picks: [], queue: [], deck: null, wins: 0, losses: 0, pickDeadline: 0, played: [] });
    }
    this.pods.set(pod.id, pod);
    for (const h of humans) {
      send(h.sess.ws, { t: 'queue', state: null });
      send(h.sess.ws, {
        t: 'found', mode: 'draft', kicker: 'Draft Night', title: 'Pack 1 of 3', draft: pod.id,
        you: { name: pod.seats.find((s) => s.userId === h.userId)!.name, sub: 'Drafter', art: pod.seats.find((s) => s.userId === h.userId)!.art },
        opps: pod.seats.filter((s) => s.userId !== h.userId).map((s) => ({ name: s.name, sub: s.bot ? 'AI drafter' : 'Drafter', art: s.art })),
      });
    }
    this.openPack(pod);
  }

  openPack(pod: Pod) {
    pod.pack++;
    pod.phase = 'drafting';
    for (const s of pod.seats) {
      s.queue = [this.makePack()];
      s.pickDeadline = Date.now() + (s.bot ? 1200 + Math.random() * 1500 : (PICK_SECONDS + 15) * 1000); // first pick of a pack: time to open it
    }
    this.broadcast(pod);
  }

  /** Take a card from the seat's current pack and pass the rest. */
  pick(pod: Pod, seat: number, cardId: string) {
    const s = pod.seats[seat];
    const pack = s.queue[0];
    if (!pack) return;
    const i = pack.findIndex((c) => c.id === cardId);
    if (i < 0) return;
    s.picks.push(pack.splice(i, 1)[0]);
    s.queue.shift();
    const dir = pod.pack === 2 ? -1 : 1;
    const to = (seat + dir + pod.seats.length) % pod.seats.length;
    if (pack.length) {
      const t = pod.seats[to];
      t.queue.push(pack);
      if (t.queue.length === 1) t.pickDeadline = Date.now() + (t.bot ? 900 + Math.random() * 1600 : PICK_SECONDS * 1000);
    }
    if (s.queue.length) s.pickDeadline = Date.now() + (s.bot ? 900 + Math.random() * 1600 : PICK_SECONDS * 1000);
    if (pod.seats.every((x) => !x.queue.length)) {
      if (pod.pack < DRAFT.packs) this.openPack(pod);
      else this.finishDrafting(pod);
      return;
    }
    this.broadcast(pod);
  }

  async finishDrafting(pod: Pod) {
    pod.phase = 'building';
    pod.buildDeadline = Date.now() + BUILD_SECONDS * 1000;
    for (const s of pod.seats) {
      if (s.bot) s.deck = this.autoDeck(s.picks);
      else if (s.userId) {
        // keep every pick
        await this.acc.mutate(s.userId, (p, fx) => {
          for (const c of s.picks) p.data.collection[c.name] = (p.data.collection[c.name] ?? 0) + 1;
          fx.push({ kind: 'toast', text: `${s.picks.length} cards added to your collection` });
        }).catch(() => {});
      }
    }
    this.broadcast(pod);
  }

  // ------------------------------------------------------------------------------------ bots
  colorsOf(picks: PCard[]): string[] {
    const w: Record<string, number> = {};
    for (const c of picks) for (const col of c.colors) w[col] = (w[col] ?? 0) + RW[c.rarity];
    return Object.entries(w).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([c]) => c);
  }
  botChoice(s: DSeat, pack: PCard[]): PCard {
    const main = s.picks.length >= 5 ? this.colorsOf(s.picks) : [];
    const score = (c: PCard) => {
      let v = RW[c.rarity] + (c.type.includes('Creature') ? 0.6 : 0) + (c.cmc >= 2 && c.cmc <= 4 ? 0.4 : 0) - (c.cmc >= 7 ? 0.8 : 0);
      if (main.length && c.colors.length) v += c.colors.every((x) => main.includes(x)) ? 1.6 : -1.2;
      if (!c.colors.length) v += 0.3;
      return v + Math.random() * 0.5;
    };
    return [...pack].sort((a, b) => score(b) - score(a))[0];
  }
  /** 23 spells in the two best colors + 17 basics split by color weight. */
  autoDeck(picks: PCard[]): Record<string, number> {
    const cols = this.colorsOf(picks);
    const fit = picks.filter((c) => c.colors.every((x) => cols.includes(x)) && !/\bLand\b/.test(c.type)).sort((a, b) => RW[b.rarity] - RW[a.rarity] || a.cmc - b.cmc);
    const spells = fit.slice(0, 23);
    const deck: Record<string, number> = {};
    for (const c of spells) deck[c.name] = (deck[c.name] ?? 0) + 1;
    const lands = 40 - spells.length;
    const weight: Record<string, number> = {};
    for (const c of spells) for (const x of c.colors) weight[x] = (weight[x] ?? 0) + 1;
    const use = cols.length ? cols : ['G'];
    const total = use.reduce((a, c) => a + (weight[c] ?? 1), 0);
    let left = lands;
    use.forEach((c, i) => {
      const n = i === use.length - 1 ? left : Math.round((lands * (weight[c] ?? 1)) / total);
      left -= n;
      const basic = BASICS['WUBRG'.indexOf(c)];
      if (n > 0) deck[basic] = (deck[basic] ?? 0) + n;
    });
    return deck;
  }

  // ------------------------------------------------------------------------------------ deck + rounds
  setDeck(pod: Pod, seat: number, main: Record<string, number>) {
    const s = pod.seats[seat];
    const have: Record<string, number> = {};
    for (const c of s.picks) have[c.name] = (have[c.name] ?? 0) + 1;
    let total = 0;
    const clean: Record<string, number> = {};
    for (const [n, q] of Object.entries(main ?? {})) {
      const qty = Math.max(0, Math.min(60, Math.floor(+q || 0)));
      if (!qty) continue;
      const basic = BASICS.find((b) => norm(b) === norm(n));
      if (!basic && (have[n] ?? 0) < qty) throw new Err(`You only drafted ${have[n] ?? 0} ${n}.`);
      clean[basic ?? n] = qty;
      total += qty;
    }
    if (total < DRAFT.deckSize) throw new Err(`Draft decks need at least ${DRAFT.deckSize} cards (you have ${total}).`);
    s.deck = clean;
    if (pod.seats.every((x) => x.deck)) this.startRound(pod);
    else this.broadcast(pod);
  }
  deckText(d: Record<string, number>) {
    return ['Deck', ...Object.entries(d).map(([n, q]) => `${q} ${n}`)].join('\n');
  }
  startRound(pod: Pod) {
    pod.round++;
    pod.phase = 'playing';
    pod.rooms.clear();
    // pair by record, avoiding rematches, preferring human vs human
    const order = pod.seats.map((_, i) => i).sort((a, b) => pod.seats[b].wins - pod.seats[a].wins || (pod.seats[a].bot ? 1 : 0) - (pod.seats[b].bot ? 1 : 0));
    const pairs: [number, number][] = [];
    const used = new Set<number>();
    for (const a of order) {
      if (used.has(a)) continue;
      const b = order.find((x) => x !== a && !used.has(x) && !pod.seats[a].played.includes(x)) ?? order.find((x) => x !== a && !used.has(x));
      if (b == null) continue;
      used.add(a).add(b);
      pairs.push([a, b]);
    }
    for (const [a, b] of pairs) {
      const A = pod.seats[a], B = pod.seats[b];
      A.played.push(b);
      B.played.push(a);
      if (A.bot && B.bot) {
        // two bots: decide it quickly, weighted by deck strength
        const sa = A.picks.reduce((t, c) => t + RW[c.rarity], 0), sb = B.picks.reduce((t, c) => t + RW[c.rarity], 0);
        const w = Math.random() < sa / (sa + sb) ? a : b;
        pod.seats[w].wins++;
        pod.seats[w === a ? b : a].losses++;
        pod.results.push({ round: pod.round, a, b, winner: w });
        continue;
      }
      const seat = (s: DSeat) => {
        const deck = this.rooms.buildDeck(this.deckText(s.deck!), 'constructed');
        return { name: s.name, deck: deck.cards, deckText: '', commanders: [], bot: s.bot, userId: s.userId, cosmetics: s.userId ? this.hub.cosmeticsOf(this.acc.cache.get(s.userId) ?? null) : { avatar: { artUrl: s.art } as any }, sub: `Draft · ${s.wins}-${s.losses}` };
      };
      const room = this.rooms.create({ format: 'constructed', mode: 'draft', seats: [seat(A), seat(B)], start: true, draft: { podId: pod.id, round: pod.round } });
      (room as any).draftSeats = [a, b];
      pod.rooms.set(room.code, room);
      room.seats.forEach((rs, i) => {
        const ds = pod.seats[[a, b][i]];
        if (!ds.userId || !rs) return;
        for (const ss of this.hub.byUser.get(ds.userId) ?? []) send(ss.ws, { t: 'draftMatch', code: room.code, seat: i, token: rs.token, round: pod.round, opp: pod.seats[[a, b][1 - i]].name });
      });
    }
    this.broadcast(pod);
    this.checkRoundDone(pod);
  }
  roundOver(room: Room, game: GameState) {
    const pod = room.draft ? this.pods.get(room.draft.podId) : null;
    if (!pod || room.draft!.round !== pod.round) return;
    const [a, b] = (room as any).draftSeats as [number, number];
    if (pod.results.some((r) => r.round === pod.round && r.a === a && r.b === b)) return;
    const w = game.winner == null ? null : [a, b][game.winner];
    if (w != null) {
      pod.seats[w].wins++;
      pod.seats[w === a ? b : a].losses++;
    }
    pod.results.push({ round: pod.round, a, b, winner: w });
    this.checkRoundDone(pod);
  }
  checkRoundDone(pod: Pod) {
    const games = pod.results.filter((r) => r.round === pod.round).length;
    if (games < pod.seats.length / 2) return this.broadcast(pod);
    if (pod.round >= DRAFT.rounds) return this.finish(pod);
    setTimeout(() => this.startRound(pod), 4000);
    this.broadcast(pod);
  }
  async finish(pod: Pod) {
    pod.phase = 'done';
    for (const s of pod.seats) {
      if (!s.userId) continue;
      const prize = DRAFT.prizeEmbers[Math.min(s.wins, DRAFT.prizeEmbers.length - 1)];
      await this.acc.mutate(s.userId, (p, fx, led) => {
        if (prize) this.acc.credit(p, fx, led, 'embers', prize, 'draft-prize', pod.id);
        fx.push({ kind: 'toast', text: `Draft finished ${s.wins}-${s.losses}${prize ? ` · +${prize} embers` : ''}` });
      }).catch(() => {});
    }
    this.broadcast(pod);
  }

  // ------------------------------------------------------------------------------------ messages
  async handle(sess: any, msg: any) {
    const uid = sess.user?.id;
    const pod = uid ? this.byUser.get(uid) : null;
    if (msg.t === 'draft.state') {
      if (pod) this.sendState(pod, uid);
      else send(sess.ws, { t: 'draft', state: null });
      return;
    }
    if (!pod) throw new Err('You are not in a draft.');
    const seat = pod.seats.findIndex((s) => s.userId === uid);
    switch (msg.t) {
      case 'draft.pick':
        if (pod.phase !== 'drafting') throw new Err('Picking is over.');
        if (!pod.seats[seat].queue.length) throw new Err('Wait for the next pack.');
        this.pick(pod, seat, String(msg.card));
        break;
      case 'draft.deck':
        if (pod.phase !== 'building') throw new Err('Deck building is closed.');
        this.setDeck(pod, seat, msg.main);
        break;
      case 'draft.leave':
        // leaving forfeits the remaining rounds; picks stay in the collection
        pod.seats[seat].bot = true;
        if (!pod.seats[seat].deck) pod.seats[seat].deck = this.autoDeck(pod.seats[seat].picks);
        this.byUser.delete(uid);
        send(sess.ws, { t: 'draft', state: null });
        if (pod.phase === 'building' && pod.seats.every((x) => x.deck)) this.startRound(pod);
        break;
      default:
        throw new Err('Unknown draft message.');
    }
  }
  view(pod: Pod, uid: string) {
    const me = pod.seats.findIndex((s) => s.userId === uid);
    const s = pod.seats[me];
    const live = [...pod.rooms.values()].find((r) => r.seats.some((x) => x?.userId === uid) && r.game && !r.game.over);
    return {
      id: pod.id, phase: pod.phase, pack: pod.pack, packs: DRAFT.packs, round: pod.round, rounds: DRAFT.rounds, seat: me,
      pickNo: s ? s.picks.length - (pod.pack - 1) * DRAFT.packSize + 1 : 0,
      seats: pod.seats.map((x) => ({ name: x.name, bot: x.bot, art: x.art, picks: x.picks.length, waiting: x.queue.length, ready: !!x.deck, wins: x.wins, losses: x.losses })),
      current: s?.queue[0] ?? null, queued: s ? Math.max(0, s.queue.length - 1) : 0,
      pickDeadline: s?.pickDeadline ?? 0, buildDeadline: pod.buildDeadline,
      picks: s?.picks ?? [], deck: s?.deck ?? null, results: pod.results,
      direction: pod.pack === 2 ? 'right' : 'left',
      match: live ? { code: live.code, seat: live.seats.findIndex((x) => x?.userId === uid), token: live.seats.find((x) => x?.userId === uid)!.token } : null,
      prizes: DRAFT.prizeEmbers,
    };
  }
  sendState(pod: Pod, uid: string) {
    for (const ss of this.hub.byUser.get(uid) ?? []) send((ss as any).ws as WebSocket, { t: 'draft', state: this.view(pod, uid) });
  }
  broadcast(pod: Pod) {
    for (const s of pod.seats) if (s.userId && this.byUser.get(s.userId) === pod) this.sendState(pod, s.userId);
  }
}
