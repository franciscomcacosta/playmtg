import { looseFilter, parseFilter } from '../src/engine/oracle';
const args = process.argv.slice(2);
for (const p of args.length ? args : ['creature you control with deathtouch']) console.log(p, '|', JSON.stringify(looseFilter(p)), JSON.stringify(parseFilter(p)));
