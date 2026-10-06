// Splice (702.47): chosen before targets, adds the spliced card's effects and splice cost; the card stays in hand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll, Bear, Forest } from './helpers';

const Arcane = def('Test Arcane Bolt', '{R}', 'Instant — Arcane', 'Test Arcane Bolt deals 2 damage to any target.');
const Vortex = def('Test Vortex', '{U}', 'Instant — Arcane', 'Return target creature to its owner\'s hand.\nSplice onto Arcane {1}{U} (As you cast an Arcane spell, you may reveal this card from your hand and pay its splice cost. If you do, add this card\'s effects to that spell.)');

test('splice: the Arcane spell also bounces, costs extra, and the spliced card stays in hand', () => {
  const { s, ap, op } = setup();
  const L = lands(s, ap, 3);
  const bear = add(s, op, Bear, 'battlefield');
  const vortex = add(s, ap, Vortex);
  const life = s.players[op].life;
  let asked = false;
  cast(s, ap, add(s, ap, Arcane));
  resolveAll(s, (st) => {
    if (st.prompt?.kind === 'chooseCards' && /splice/i.test(st.prompt.title)) { asked = true; return [vortex]; }
    if (st.prompt?.kind === 'targets') {
      const tg = st.prompt.targets!;
      return [tg.find((t: any) => t.kind === 'player' && t.idx === op) ?? tg.find((t: any) => t.kind === 'card' && t.iid === bear)];
    }
    return undefined;
  });
  assert.ok(asked, 'splice was offered before targets');
  assert.equal(s.players[op].life, life - 2, 'bolt half');
  assert.equal(s.cards[bear].zone, 'hand', 'spliced bounce half');
  assert.equal(s.cards[vortex].zone, 'hand', 'the spliced card stays in hand');
  assert.equal(L.filter((l) => s.cards[l].tapped).length, 3, '{R} + {1}{U}');
});

test('splice is not offered onto a non-Arcane spell, or when it can\'t be paid for', () => {
  const { s, ap } = setup();
  lands(s, ap, 1);
  add(s, ap, Vortex);
  cast(s, ap, add(s, ap, Arcane)); // only 1 land: can't add {1}{U}
  resolveAll(s, (st) => { assert.ok(!/splice/i.test(st.prompt?.title ?? ''), 'no splice prompt'); return st.prompt?.kind === 'targets' ? st.prompt.targets!.filter((t: any) => t.kind === 'player').slice(0, 1) : undefined; });
  const { s: s2, ap: ap2 } = setup();
  lands(s2, ap2, 4);
  add(s2, ap2, Vortex);
  cast(s2, ap2, add(s2, ap2, def('Test Plain Bolt', '{R}', 'Instant', 'Test Plain Bolt deals 2 damage to any target.')));
  resolveAll(s2, (st) => { assert.ok(!/splice/i.test(st.prompt?.title ?? '')); return st.prompt?.kind === 'targets' ? st.prompt.targets!.filter((t: any) => t.kind === 'player').slice(0, 1) : undefined; });
});
