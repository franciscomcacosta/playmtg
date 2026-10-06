import { parseSubject } from '../src/engine/oracle';
for (const p of process.argv.slice(2)) { const ctx: any = { specs: [], selfName: '~', last: { t: 'self' } }; console.log(p, '=>', JSON.stringify(parseSubject(p, ctx)), JSON.stringify(ctx.specs)); }
