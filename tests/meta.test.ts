// Unit tests for the economy rules (payouts, quests, login calendar, ranks) and a full Draft Night pod with bots.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { FileStore } from '../server/meta/store';
import { Accounts } from '../server/meta/accounts';
import { rankAfter, RANK0, rankName, dailyStock, featuredBundle, ITEM, LOGIN } from '../server/meta/catalog';
import { loadCardDb, norm, findToken } from '../server/cards';
import { setEngineHooks, dispatch } from '../src/engine/engine';
import { Rooms } from '../server/rooms';
import { Hub } from '../server/meta/hub';
import { Drafts } from '../server/draft';

const tmp = (n: string) => {
  const f = `${process.env.HOME ?? '.'}/mf-test-${n}.json`;
  rmSync(f, { force: true });
  return f;
};

test('ranks: bronze climbs two pips a win, gold+ can drop a division but never a tier', () => {
  let r = { ...RANK0 };
  r = rankAfter(r, true);
  assert.equal(r.pips, 2);
  r = rankAfter(r, false);
  assert.equal(r.pips, 2, 'bronze never loses progress');
  for (let i = 0; i < 7; i++) r = rankAfter(r, true);
  assert.equal(rankName(r), 'Silver IV');
  let g: any = { tier: 'gold', division: 4, pips: 0 };
  g = rankAfter(g, false);
  assert.equal(rankName(g), 'Gold IV', 'cannot fall out of Gold');
  g = { tier: 'gold', division: 3, pips: 0 };
  g = rankAfter(g, false);
  assert.equal(rankName(g), 'Gold IV');
  assert.equal(g.pips, 3);
  let m: any = { tier: 'platinum', division: 1, pips: 3 };
  m = rankAfter(m, true);
  assert.equal(m.tier, 'mythic');
});

test('shop stock and bundle are deterministic and valid', () => {
  const a = dailyStock('2026-10-05'), b = dailyStock('2026-10-05');
  assert.deepEqual(a, b);
  assert.equal(new Set(a).size, 6);
  for (const id of a) assert.ok(ITEM.get(id)?.price);
  const f = featuredBundle(Date.UTC(2026, 9, 7));
  assert.ok(f.endsAt > Date.UTC(2026, 9, 7) && new Date(f.endsAt).getUTCDay() === 1);
});

test('payouts: win, first win, daily wins, quest progress, AI cap, short games', async () => {
  const acc = new Accounts(new FileStore(tmp('pay')));
  const p = await acc.load('u1', 'Tester');
  const base = { matchId: 'm', format: 'constructed' as const, vsAI: false, ranked: false, turns: 8, casts: [['R'], ['G'], ['U']], lands: 5, attacks: 4 };
  await acc.recordGame('u1', { ...base, won: true });
  // +40 win +100 first win +250 daily win #1 (gold)
  assert.equal(p.data.embers, 300 + 40 + 100);
  assert.equal(p.data.gold, 500 + 250);
  assert.equal(p.data.daily.wins, 1);
  assert.equal(p.data.xp, 100);
  await acc.recordGame('u1', { ...base, won: false });
  assert.equal(p.data.embers, 440 + 15);
  // short games pay nothing
  await acc.recordGame('u1', { ...base, won: true, turns: 2 });
  assert.equal(p.data.embers, 455);
  // AI games are capped per day
  for (let i = 0; i < 12; i++) await acc.recordGame('u1', { ...base, won: false, vsAI: true });
  assert.equal(p.data.embers, 455 + 10 * 15);
  // quests moved
  const lands = p.data.quests.list.find((q) => q.tpl === 'lands');
  if (lands) assert.ok(lands.prog > 0);
});

test('quest completes, claims once, grants gold + XP', async () => {
  const acc = new Accounts(new FileStore(tmp('quest')));
  const p = await acc.load('u2', 'Q');
  p.data.quests.list[0] = { id: 'qx', tpl: 'lands', prog: 0, claimed: false };
  await acc.recordGame('u2', { matchId: 'm', won: false, format: 'constructed', vsAI: false, ranked: false, turns: 9, casts: [], lands: 30, attacks: 0 });
  assert.equal(p.data.quests.list[0].prog, 30);
  const g0 = p.data.gold;
  await acc.claimQuest('u2', 'qx');
  assert.equal(p.data.gold, g0 + 250);
  await assert.rejects(() => acc.claimQuest('u2', 'qx'));
});

test('login calendar: one claim a day, a missed day pauses the week', async () => {
  const acc = new Accounts(new FileStore(tmp('login')));
  const p = await acc.load('u3', 'L');
  const r = await acc.claimLogin('u3');
  assert.equal(r.day, 1);
  await assert.rejects(() => acc.claimLogin('u3'));
  p.data.login.last = '2000-01-01'; // pretend it was days ago
  const r2 = await acc.claimLogin('u3');
  assert.equal(r2.day, 2, 'continues the week instead of resetting');
  assert.equal(LOGIN.length, 7);
});

test('season XP grants level rewards', async () => {
  const acc = new Accounts(new FileStore(tmp('season')));
  const p = await acc.load('u4', 'S');
  const g0 = p.data.gold;
  await acc.mutate('u4', (pp, fx, led) => acc.addXp(pp, fx, led, 4200));
  assert.equal(p.data.seasonGranted, 5);
  assert.ok(p.data.owned['b-moss'], 'level 5 card back');
  assert.ok(p.data.gold > g0);
});

test('Draft Night: a pod with three bots drafts 42 cards, builds, plays three rounds and pays prizes', async () => {
  const db = loadCardDb();
  setEngineHooks({ findToken: (n, p, t, c) => findToken(db, n, p, t, c), findCard: (name) => db.byName.get(norm(name)) });
  const store = new FileStore(tmp('draft'));
  const acc = new Accounts(store);
  const rooms = new Rooms(db);
  const hub = new Hub(db, rooms, acc, store, { kind: 'dev', verify: async () => null });
  const drafts = new Drafts(db, rooms, acc);
  drafts.hub = hub;
  hub.drafts = drafts;
  const p = await acc.load('d1', 'Drafter');
  p.data.embers = 1000;
  const sent: any[] = [];
  const ws: any = { readyState: 1, OPEN: 1, send: (m: string) => sent.push(JSON.parse(m)) };
  const sess: any = { ws, user: { id: 'd1', name: 'Drafter' } };
  hub.byUser.set('d1', new Set([sess]));
  await drafts.join(sess, {});
  assert.equal(p.data.embers, 250, 'entry paid');
  await drafts.join(sess, {}); // joining again doesn't charge twice
  assert.equal(p.data.embers, 250);
  await drafts.seatPod(drafts.waiting.splice(0));
  const pod = drafts.byUser.get('d1')!;
  assert.equal(pod.seats.length, 4);
  // pick the first card every time; bots pick on the clock
  for (let guard = 0; guard < 4000 && pod.phase === 'drafting'; guard++) {
    const me = pod.seats[0];
    if (me.queue.length) drafts.pick(pod, 0, me.queue[0][0].id);
    for (let i = 1; i < 4; i++) if (pod.seats[i].queue.length) drafts.pick(pod, i, drafts.botChoice(pod.seats[i], pod.seats[i].queue[0]).id);
  }
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(pod.phase, 'building');
  assert.equal(pod.seats[0].picks.length, 42);
  assert.ok(Object.values(p.data.collection).reduce((a, b) => a + b, 0) === 42, 'every pick goes to the collection');
  assert.throws(() => drafts.setDeck(pod, 0, { Plains: 10 }), /at least 40/);
  drafts.setDeck(pod, 0, drafts.autoDeck(pod.seats[0].picks));
  assert.equal(pod.phase, 'playing');
  for (let round = 1; round <= 3; round++) {
    assert.equal(pod.round, round);
    const room = [...pod.rooms.values()].find((r) => r.seats.some((s) => s?.userId === 'd1'))!;
    assert.ok(room, 'the human has a table this round');
    const mySeat = room.seats.findIndex((s) => s?.userId === 'd1');
    dispatch(room.game!, (1 - mySeat) as any, { type: 'concede' } as any); // opponent concedes → we win
    rooms.broadcast(room);
    await new Promise((r) => setTimeout(r, 4200));
  }
  assert.equal(pod.phase, 'done');
  assert.equal(pod.seats[0].wins, 3);
  assert.equal(p.data.embers, 250 + 1200 + 3 * 0 /* round games are too short to pay */);
  clearTimeout(pod.timer);
});
