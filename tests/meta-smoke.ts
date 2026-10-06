// End-to-end smoke test of the account/economy/matchmaking server: npx tsx tests/meta-smoke.ts
// Starts the real server on a spare port with a throwaway store, then drives it over WebSocket like two browsers.
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import WebSocket from 'ws';

const PORT = 8911;
const STORE = `${process.env.HOME ?? '.'}/mf-smoke-store.json`;
rmSync(STORE, { force: true });
const srv = spawn('npx', ['tsx', 'server/index.ts'], { env: { ...process.env, PORT: String(PORT), MANAFORGE_STORE: STORE, SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
let log = '';
srv.stdout.on('data', (d) => (log += d));
srv.stderr.on('data', (d) => (log += d));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (ok: any, what: string) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failed++;
};

class Client {
  ws!: WebSocket;
  msgs: any[] = [];
  rid = 1;
  async open() {
    this.ws = new WebSocket(`ws://localhost:${PORT}/ws`);
    this.ws.on('message', (m) => this.msgs.push(JSON.parse(String(m))));
    await new Promise((r, j) => {
      this.ws.on('open', r);
      this.ws.on('error', j);
    });
  }
  send(m: any) {
    const rid = this.rid++;
    this.ws.send(JSON.stringify({ ...m, rid }));
    return rid;
  }
  async wait(pred: (m: any) => boolean, ms = 8000) {
    const t = Date.now();
    while (Date.now() - t < ms) {
      const i = this.msgs.findIndex(pred);
      if (i >= 0) return this.msgs.splice(i, 1)[0];
      await sleep(50);
    }
    return null;
  }
  async req(m: any, ms = 8000) {
    const rid = this.send(m);
    return this.wait((x) => x.rid === rid, ms);
  }
  last(t: string) {
    return [...this.msgs].reverse().find((m) => m.t === t);
  }
}

async function main() {
  for (let i = 0; i < 120; i++) {
    if (log.includes('Listening')) break;
    await sleep(500);
  }
  check(log.includes('Listening'), 'server starts');
  const cfg = await (await fetch(`http://localhost:${PORT}/api/config`)).json();
  check(cfg.auth === 'dev', 'dev auth without Supabase');
  const cat = await (await fetch(`http://localhost:${PORT}/api/catalog`)).json();
  check(cat.stock.length === 6 && cat.items.length > 20, 'catalog + 6-slot stock');
  check(cat.items.filter((i: any) => i.art && !i.artUrl).length === 0, `every cosmetic has art (${cat.items.filter((i: any) => i.art && !i.artUrl).map((i: any) => i.art).join(', ')})`);

  const a = new Client();
  await a.open();
  const me = await a.req({ t: 'hello', dev: { name: 'Alice', secret: 'alice-secret-0123456789', create: true } });
  check(me?.t === 'me' && me.me.gold === 500 && me.me.embers === 300, 'new account starts with 500 gold / 300 embers');
  check(me?.me.quests.length === 3, 'three daily quests');

  // login calendar
  const lc = await a.req({ t: 'login.claim' });
  check(lc?.t === 'ok' && lc.day === 1, 'login day 1 claimed');
  const lc2 = await a.req({ t: 'login.claim' });
  check(lc2?.t === 'error', 'second login claim the same day is refused');
  const after = a.last('me');
  check(after?.me.gold === 600, 'login reward credited (+100 gold)');

  // shop
  const stock: string[] = cat.stock;
  const items = new Map<string, any>(cat.items.map((i: any) => [i.id, i]));
  const affordable = stock.find((id) => items.get(id).price.cur !== 'free' && items.get(id).price.amt <= (items.get(id).price.cur === 'gold' ? 600 : 300));
  if (affordable) {
    const it = items.get(affordable);
    const r = await a.req({ t: 'shop.buy', item: affordable });
    check(r?.t === 'ok', `buy ${it.name}`);
    const m = a.last('me').me;
    check(m.owned.includes(affordable), 'item owned after purchase');
    const eq = await a.req({ t: 'shop.equip', item: affordable });
    check(eq?.t === 'ok' && a.last('me').me.equipped[it.type] === affordable, 'equip it');
    const again = await a.req({ t: 'shop.buy', item: affordable });
    check(again?.t === 'error', 'cannot buy twice');
  }
  const notStocked = [...items.keys()].find((k) => !stock.includes(k) && items.get(k).price);
  check((await a.req({ t: 'shop.buy', item: notStocked }))?.t === 'error', 'cannot buy items outside today\'s stock');
  const tre = await a.req({ t: 'treasury.buy', tier: 4 });
  check(tre?.t === 'ok' && tre.gold === 4200, 'treasury tier IV credits 4,200 gold (dev mode)');
  check(a.last('me').me.owned.includes('b-gilded'), 'tier IV grants Gilded Weave');
  const bund = await a.req({ t: 'shop.bundle', id: cat.bundle.id });
  check(bund?.t === 'error', 'bundle refused without enough embers');

  // decks
  const deckText = 'Deck\n22 Mountain\n4 Goblin Guide\n4 Monastery Swiftspear\n4 Raging Goblin\n4 Lightning Bolt\n4 Shock\n4 Lava Spike\n4 Searing Spear\n4 Valley Dasher\n4 Keldon Raider\n2 Fireblast';
  const main: Record<string, number> = {};
  for (const l of deckText.split('\n').slice(1)) {
    const [, q, n] = l.match(/^(\d+) (.+)$/)!;
    main[n] = +q;
  }
  const sv = await a.req({ t: 'decks.save', deck: { name: 'Red Aggro', format: 'standard', main, side: {} } });
  check(sv?.t === 'ok' && sv.id, 'save deck');
  const decks = await a.wait((m) => m.t === 'decks' && m.list.some((d: any) => d.id === sv.id));
  const mine = decks?.list?.find((d: any) => d.id === sv.id);
  check(mine?.valid === true && mine.cards === 60, 'deck summary: 60 cards, valid');
  check(decks.list.filter((d: any) => d.format === 'standard').length >= 4, 'new accounts get the starter decks');

  // friends
  const b = new Client();
  await b.open();
  const meB = await b.req({ t: 'hello', dev: { name: 'Bob', secret: 'bob-secret-0123456789xx', create: true } });
  check(meB?.t === 'me', 'second account');
  const fr = await a.req({ t: 'friends.add', name: 'Bob' });
  check(fr?.t === 'ok', 'friend request sent');
  const nb = await b.wait((m) => m.t === 'notes' && m.list.some((n: any) => n.kind === 'friend'));
  check(nb, 'Bob gets a friend-request notification');
  const acc = await b.req({ t: 'friends.accept', id: me.me.id });
  check(acc?.t === 'ok', 'Bob accepts');
  const fl = await a.wait((m) => m.t === 'friends' && m.list.some((f: any) => f.name === 'Bob' && !f.pending));
  check(fl && fl.list.find((f: any) => f.name === 'Bob').st === 'online', 'Alice sees Bob online');

  // matchmaking: both queue Standard → paired together
  const svB = await b.req({ t: 'decks.save', deck: { name: 'Red Aggro', format: 'standard', main, side: {} } });
  await a.req({ t: 'queue.join', mode: 'standard', deckId: sv.id });
  await b.req({ t: 'queue.join', mode: 'standard', deckId: svB.id });
  const fa = await a.wait((m) => m.t === 'found', 6000);
  const fb = await b.wait((m) => m.t === 'found', 6000);
  check(fa && fb && fa.code === fb.code, 'Standard queue pairs the two players');
  if (fa && fb) {
    await a.req({ t: 'rejoin', code: fa.code, token: fa.token });
    await b.req({ t: 'rejoin', code: fb.code, token: fb.token });
    const st = await a.wait((m) => m.t === 'state');
    check(st?.meta?.seats?.length === 2, 'game state with seat cosmetics');
    // B concedes at once: too short for rewards, but the game is recorded
    b.send({ t: 'leave' });
    await sleep(800);
  }
  // quick match vs AI after the timeout
  const q = await a.req({ t: 'queue.join', mode: 'quick', deckId: sv.id });
  check(q?.t === 'queue', 'quick match queued');
  if (q?.t !== 'queue') console.log(JSON.stringify(q));
  const fq = await a.wait((m) => m.t === 'found', 26000);
  check(fq && fq.opps[0].bot, 'quick match falls back to the AI');
  a.send({ t: 'leave' });

  // ranked needs a sign-in, guests are refused
  const g = new Client();
  await g.open();
  await g.req({ t: 'hello' });
  const rq = await g.req({ t: 'queue.join', mode: 'rcmd', deckText });
  check(rq?.t === 'error', 'guests cannot queue ranked');

  // draft: entry fee
  const dj = await b.req({ t: 'queue.join', mode: 'draft' });
  check(dj?.t === 'error', 'draft refused without 750 embers');

  // a quest claim before completion is refused
  const qc = await a.req({ t: 'quest.claim', id: me.me.quests[0].id });
  check(qc?.t === 'error', 'unfinished quest cannot be claimed');
  const rr = await a.req({ t: 'quest.reroll', id: me.me.quests[0].id });
  check(rr?.t === 'ok', 'quest swap');
  const rr2 = await a.req({ t: 'quest.reroll', id: a.last('me').me.quests[1].id });
  check(rr2?.t === 'error', 'only one swap per day');

  const rn = await a.req({ t: 'me.rename', name: 'Bob' });
  check(rn?.t === 'error', 'names are unique');

  console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
  srv.kill();
  process.exit(failed ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  console.log(log.slice(-3000));
  srv.kill();
  process.exit(1);
});
