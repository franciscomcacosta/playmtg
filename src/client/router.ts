// Minimal client-side routing: real URLs (/ /decks /shop /treasury /table /draft /assets) with pushState.
import { useSyncExternalStore } from 'react';

const subs = new Set<() => void>();
export function navigate(to: string, replace = false) {
  if (to === location.pathname + location.search) return;
  if (replace) history.replaceState(null, '', to);
  else history.pushState(null, '', to);
  window.scrollTo(0, 0);
  for (const f of subs) f();
}
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => subs.forEach((f) => f()));
  // same-origin <a href="/…"> links (the generated views use plain anchors) go through the router
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as HTMLElement)?.closest?.('a');
    const href = a?.getAttribute('href');
    if (!a || !href || !href.startsWith('/') || a.target === '_blank' || a.hasAttribute('download')) return;
    e.preventDefault();
    navigate(href);
  });
}
export function useRoute(): { path: string; query: URLSearchParams } {
  const key = useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => location.pathname + location.search,
  );
  const [path, qs] = key.split('?');
  return { path: path.replace(/\/+$/, '') || '/', query: new URLSearchParams(qs ?? '') };
}
