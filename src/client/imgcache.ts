// Card image preloading. Images come from Scryfall; fetching + decoding one the moment a card appears is what
// made freshly played cards show up blank for a beat. We warm the browser cache (and keep decoded copies alive)
// ahead of time: your own deck at game start, and every newly visible card before its update is displayed.

const cache = new Map<string, Promise<void>>();
const keep: HTMLImageElement[] = [];
const KEEP_MAX = 500;

function load(url: string): Promise<void> {
  let p = cache.get(url);
  if (p) return p;
  p = new Promise<void>((res) => {
    const im = new Image();
    im.decoding = 'async';
    (im as any).fetchPriority = 'high';
    const done = () => res();
    im.onload = () => {
      // decode off the main thread so the first paint of the card is instant
      (im.decode ? im.decode() : Promise.resolve()).then(done, done);
    };
    im.onerror = () => {
      cache.delete(url); // allow a retry later
      done();
    };
    im.src = url;
    keep.push(im);
    if (keep.length > KEEP_MAX) keep.splice(0, keep.length - KEEP_MAX);
  });
  cache.set(url, p);
  return p;
}

/** Load these images now; resolves when all are ready or after `timeoutMs`, whichever comes first. */
export function preload(urls: (string | undefined | null)[], timeoutMs = 700): Promise<void> {
  const list = [...new Set(urls.filter((u): u is string => !!u))];
  if (!list.length) return Promise.resolve();
  const all = Promise.all(list.map(load)).then(() => undefined);
  return Promise.race([all, new Promise<void>((r) => setTimeout(r, timeoutMs))]);
}

/** Load in the background, a few at a time, without competing with images needed right now. */
export function preloadIdle(urls: (string | undefined | null)[]) {
  const list = [...new Set(urls.filter((u): u is string => !!u && !cache.has(u)))];
  if (!list.length) return;
  let i = 0;
  const step = () => {
    const batch = list.slice(i, i + 6);
    i += 6;
    if (!batch.length) return;
    Promise.all(batch.map(load)).then(() => {
      const ric = (window as any).requestIdleCallback as ((f: () => void) => void) | undefined;
      if (ric) ric(step);
      else setTimeout(step, 30);
    });
  };
  step();
}
