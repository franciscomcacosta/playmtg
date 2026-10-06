import { parseCountPhrase, parseAmtPhrase } from '../src/engine/oracle';
import '../src/engine/ext/index';
for (const p of process.argv.slice(2).join(' ').split('|')) console.log(JSON.stringify(parseAmtPhrase(p.trim(), { specs: [] } as any) ?? parseCountPhrase(p.trim())), '<=', p.trim());
