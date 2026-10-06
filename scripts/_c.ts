import { parseCond } from '../src/engine/oracle';
import '../src/engine/ext/index';
const L = process.argv.slice(2).join(' ').split('|');
for (const c of L) console.log(parseCond(c.trim()) ? 'OK  ' : 'FAIL', c.trim());
