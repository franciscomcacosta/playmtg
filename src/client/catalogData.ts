// The shop catalog (cosmetics with art, today's stock, the featured bundle, gold tiers), fetched once and shared.
import { useEffect, useState } from 'react';
import { api } from './store';

let cache: any = null;
let inflight: Promise<any> | null = null;
const subs = new Set<(c: any) => void>();
export function loadCatalog(force = false) {
  if (cache && !force) return Promise.resolve(cache);
  inflight ??= api('/api/catalog')
    .then((r) => r.json())
    .then((c) => {
      cache = c;
      inflight = null;
      subs.forEach((f) => f(c));
      return c;
    })
    .catch(() => {
      inflight = null;
      return null;
    });
  return inflight;
}
export function useCatalog(): any {
  const [c, setC] = useState(cache);
  useEffect(() => {
    subs.add(setC);
    loadCatalog().then((x) => x && setC(x));
    // the shop rotates at 00:00 UTC
    const t = setInterval(() => {
      if (cache && Date.now() > cache.restock) loadCatalog(true);
    }, 30000);
    return () => {
      subs.delete(setC);
      clearInterval(t);
    };
  }, []);
  return c;
}
export const itemById = (c: any, id?: string | null) => (id ? c?.items?.find((i: any) => i.id === id) ?? null : null);
