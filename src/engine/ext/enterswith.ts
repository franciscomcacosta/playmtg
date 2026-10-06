// Plugin: "~ enters with …" counter amounts the core lines don't read.
//  "~ enters with a +1/+1 counter on it for each creature card in your graveyard"
//  "~ enters with X +1/+1 counters on it, where X is <amount>" / "… a number of +1/+1 counters on it equal to <amount>"
//  "~ enters with twice X +1/+1 counters on it"
import { EXT } from '../ext';
import { parseAmtPhrase, parseCountPhrase } from '../oracle';

const CTX = () => ({ specs: [], selfName: '~', last: { t: 'self' } }) as any;
EXT.lines.push((line, pc) => {
  let m: RegExpMatchArray | null;
  let counter: string | undefined, amt: any, mult = 1;
  if ((m = line.match(/^~ enters with (a|an|one|two|three) ([+-]\d\/[+-]\d|[a-z]+) counters? on it for each (.+)$/))) {
    counter = m[2]; amt = parseCountPhrase(m[3]); mult = ({ a: 1, an: 1, one: 1, two: 2, three: 3 } as any)[m[1]];
  } else if ((m = line.match(/^~ enters with x ([+-]\d\/[+-]\d|[a-z]+) counters? on it, where x is (.+)$/))) {
    counter = m[1]; amt = parseAmtPhrase(m[2], CTX());
  } else if ((m = line.match(/^~ enters with a number of ([+-]\d\/[+-]\d|[a-z]+) counters? on it equal to (.+)$/))) {
    counter = m[1]; amt = parseAmtPhrase(m[2], CTX());
  } else if ((m = line.match(/^~ enters with twice x ([+-]\d\/[+-]\d|[a-z]+) counters? on it$/))) {
    (pc.entersCounters ??= []).push({ counter: m[1], n: -1, mult: 2 });
    return true;
  } else return false;
  if (amt == null || !counter) return false;
  (pc.entersCounters ??= []).push({ counter, n: 0, amt, mult });
  return true;
});
