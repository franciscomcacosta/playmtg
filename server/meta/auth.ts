// Sign-in. With Supabase configured the browser signs in with Supabase Auth and sends its access token; the server
// checks it with Supabase. Without Supabase (local development) a "dev account" is a name plus a random secret the
// browser keeps in localStorage.
import type { Auth, AuthUser } from './hub';
import type { FileStore } from './store';
import { uuid } from './store';

export function supabaseAuth(sb: any): Auth {
  const cache = new Map<string, { user: AuthUser; until: number }>();
  return {
    kind: 'supabase',
    async verify(msg: any) {
      const jwt = typeof msg.jwt === 'string' ? msg.jwt : '';
      if (!jwt) return null;
      const hit = cache.get(jwt);
      if (hit && hit.until > Date.now()) return hit.user;
      const { data, error } = await sb.auth.getUser(jwt);
      if (error || !data?.user) return null;
      const u = data.user;
      const name = String(u.user_metadata?.name ?? u.user_metadata?.full_name ?? u.email?.split('@')[0] ?? 'Planeswalker');
      const user = { id: u.id, name };
      cache.set(jwt, { user, until: Date.now() + 5 * 60000 });
      return user;
    },
  };
}

export function devAuth(store: FileStore): Auth {
  return {
    kind: 'dev',
    async verify(msg: any) {
      const d = msg.dev;
      if (!d || typeof d.secret !== 'string' || d.secret.length < 16) return null;
      let id = store.d.devTokens[d.secret];
      if (!id) {
        if (!d.create) return null;
        id = uuid();
        store.d.devTokens[d.secret] = id;
        store.flush();
      }
      return { id, name: String(d.name ?? 'Planeswalker').slice(0, 24) };
    },
  };
}
