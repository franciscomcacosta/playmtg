// One-turn and timing effects (src/engine/ext/oneturn.ts) and "discard X" additional costs (costs.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll, passUntil, dispatch, Bear, Forest } from './helpers';

test('target creature attacks this turn if able: declaring no attackers is refused', () => {
  const { s, ap } = setup();
  lands(s, ap, 1);
  const bear = add(s, ap, Bear, 'battlefield');
  cast(s, ap, add(s, ap, def('Test Taunt', '{R}', 'Sorcery', 'Target creature attacks this turn if able.')));
  resolveAll(s, (st) => (st.prompt?.kind === 'targets' ? [{ kind: 'card', iid: bear }] : undefined));
  passUntil(s, () => s.prompt?.kind === 'declareAttackers');
  assert.match(dispatch(s, ap, { type: 'answer', promptId: s.prompt!.id, choice: [] }) ?? '', /attacks each combat if able/);
});

test('look at the top card of target player\'s library: shown privately, nothing moves', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 1);
  const top = add(s, op, Bear, 'library');
  let shown: string[] = [];
  let shownTo = -1;
  cast(s, ap, add(s, ap, def('Test Bauble', '{1}', 'Instant', "Look at the top card of target player's library.")));
  resolveAll(s, (st) => {
    if (st.prompt?.kind === 'targets') return st.prompt.targets!.filter((t: any) => t.kind === 'player' && t.idx === op).slice(0, 1);
    if (st.prompt?.kind === 'chooseCards') { shown = st.prompt.cards!; shownTo = st.prompt.player; return []; }
    return undefined;
  });
  assert.deepEqual(shown, [top]);
  assert.equal(shownTo, ap);
  assert.equal(s.players[op].library[0], top);
});

test('discard X as an additional cost: X cards chosen and discarded', () => {
  const { s, ap } = setup();
  lands(s, ap, 3);
  s.players[ap].hand.length = 0;
  const junk = [add(s, ap, Forest), add(s, ap, Forest), add(s, ap, Bear)];
  const spell = add(s, ap, def('Test Dreams', '{X}{R}', 'Sorcery', 'As an additional cost to cast this spell, discard X cards.\nYou gain X life.'));
  const life = s.players[ap].life;
  cast(s, ap, spell);
  resolveAll(s, (st) => {
    if (st.prompt?.kind === 'x') return 2;
    if (st.prompt?.kind === 'chooseCards') { assert.equal(st.prompt.min, 2); return junk.slice(0, 2); }
    return undefined;
  });
  assert.equal(s.cards[junk[0]].zone, 'graveyard');
  assert.equal(s.cards[junk[1]].zone, 'graveyard');
  assert.equal(s.cards[junk[2]].zone, 'hand');
  assert.equal(s.players[ap].life, life + 2);
});

const Ward = def('Test Ward', '{1}', 'Enchantment', "You may cast this spell as though it had flash. If you cast it any time a sorcery couldn't have been cast, the controller of the permanent it becomes sacrifices it at the beginning of the next cleanup step.");

test('flash with a cost: cast in response it is sacrificed at cleanup', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 3);
  const ward = add(s, ap, Ward);
  // put something on the stack first, so this is not sorcery timing
  cast(s, ap, add(s, ap, def('Test Ping', '{1}', 'Instant', 'You gain 1 life.')));
  cast(s, ap, ward);
  resolveAll(s);
  assert.equal(s.cards[ward].zone, 'battlefield');
  passUntil(s, () => s.turn > 1 && s.active === op);
  assert.equal(s.cards[ward].zone, 'graveyard');
});

test('flash with a cost: cast at sorcery speed it stays', () => {
  const { s, ap, op } = setup();
  lands(s, ap, 1);
  const ward = add(s, ap, Ward);
  cast(s, ap, ward);
  resolveAll(s);
  passUntil(s, () => s.turn > 1 && s.active === op);
  assert.equal(s.cards[ward].zone, 'battlefield');
});
