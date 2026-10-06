// Spree: each chosen mode adds its cost (OTJ). Parsed in oracle.ts normalizeText → modal with modes.costs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, add, lands, def, cast, resolveAll, Bear } from './helpers';

const Derail = def('Test Derailment', '{R}', 'Instant', 'Spree (Choose one or more additional costs.)\n+ {2} — Test Derailment deals 4 damage to target creature.\n+ {2} — Destroy target artifact.');
const tapped = (s: any, ids: string[]) => ids.filter((i) => s.cards[i].tapped).length;

test('spree: one mode costs base + that mode', () => {
  const { s, ap, op } = setup();
  const L = lands(s, ap, 5);
  const bear = add(s, op, Bear, 'battlefield');
  cast(s, ap, add(s, ap, Derail));
  resolveAll(s, (st) => {
    if (st.prompt?.kind === 'mode') return ['0'];
    if (st.prompt?.kind === 'targets') return [{ kind: 'card', iid: bear }];
    return undefined;
  });
  assert.equal(s.cards[bear]?.zone ?? 'graveyard', 'graveyard');
  assert.equal(tapped(s, L), 3, '{R} + {2}');
});

test('spree: both modes cost base + both', () => {
  const { s, ap, op } = setup();
  const L = lands(s, ap, 5);
  const bear = add(s, op, Bear, 'battlefield');
  const relic = add(s, op, def('Test Relic', '{1}', 'Artifact', ''), 'battlefield');
  cast(s, ap, add(s, ap, Derail));
  resolveAll(s, (st) => {
    if (st.prompt?.kind === 'mode') return ['0', '1'];
    if (st.prompt?.kind === 'targets') return [st.prompt.targets!.find((t: any) => t.iid === bear) ?? st.prompt.targets!.find((t: any) => t.iid === relic)];
    return undefined;
  });
  assert.equal(s.cards[relic]?.zone ?? 'graveyard', 'graveyard');
  assert.equal(s.cards[bear]?.zone ?? 'graveyard', 'graveyard');
  assert.equal(tapped(s, L), 5, '{R} + {2} + {2}');
});
