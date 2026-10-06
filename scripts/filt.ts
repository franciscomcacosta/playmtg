import { looseFilter, parseFilter } from '../src/engine/oracle';
for (const p of process.argv.slice(2)) console.log(p, '=>', JSON.stringify(looseFilter(p)), JSON.stringify(parseFilter(p + ' card')));
