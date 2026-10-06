// Parse single sentences with ctx.last = exiledTop: npx tsx scripts/sent.ts "put it into your hand" …
import { parseSentence } from '../src/engine/oracle';
for (const t of process.argv.slice(2)) {
  const ctx: any = { specs: [], selfName: '~', last: { t: 'exiledTop' } };
  console.log(t, '=>', JSON.stringify(parseSentence(t, ctx)));
}
