// Sign-in: Supabase Auth when the server is configured for it (email + password, or an emailed magic link),
// otherwise a local "dev account" (just a name; a random secret stays in this browser).
import React, { useState } from 'react';
import { api, hello, request, send, setState, toast, useStore } from './store';
import { css, pc } from './dc';

let sb: any = null;
let mode: 'dev' | 'supabase' | null = null;
const DEV_KEY = 'manaforge.devAccount';

export async function initAuth() {
  let cfg: any = { auth: 'dev' };
  try {
    cfg = await (await api('/api/config')).json();
  } catch {}
  mode = cfg.auth;
  setState({ auth: cfg.auth });
  if (cfg.auth === 'supabase' && cfg.supabaseUrl && cfg.supabaseAnonKey) {
    const { createClient } = await import('@supabase/supabase-js');
    sb = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    const { data } = await sb.auth.getSession();
    if (data.session) await hello({ jwt: data.session.access_token });
    else await hello({});
    sb.auth.onAuthStateChange((ev: string, session: any) => {
      if (ev === 'SIGNED_IN' || ev === 'TOKEN_REFRESHED') hello({ jwt: session?.access_token });
      if (ev === 'SIGNED_OUT') hello({});
    });
  } else {
    const dev = devAccount();
    await hello(dev ? { dev } : {});
  }
}
function devAccount(): { name: string; secret: string } | null {
  try {
    const raw = localStorage.getItem(DEV_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function signOut() {
  if (sb) await sb.auth.signOut();
  try {
    localStorage.removeItem(DEV_KEY);
  } catch {}
  send({ t: 'signout' });
  await hello({});
}

const secret = () => Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => b.toString(16).padStart(2, '0')).join('');

/** Supabase's error messages, in plain words. */
function friendly(e: any): string {
  const m = String(e?.message ?? e ?? '');
  if (/invalid login credentials/i.test(m)) return 'Wrong email or password.';
  if (/email not confirmed/i.test(m)) return 'Confirm your email first. The link is in your inbox (check spam too).';
  if (/already registered|already been registered/i.test(m)) return 'There is already an account with this email. Sign in instead.';
  if (/password should be at least|weak password/i.test(m)) return 'Use a password with at least 8 characters.';
  if (/rate limit|too many|security purposes/i.test(m)) return 'Too many tries. Wait a minute and try again.';
  if (/invalid.*email|unable to validate email/i.test(m)) return 'That email address doesn’t look right.';
  if (/fetch|network/i.test(m)) return 'Can’t reach the sign-in service. Check your connection.';
  return m || 'Something went wrong. Try again.';
}

const PERKS = [
  ['Daily quests and login rewards', 'Earn gold and embers every day'],
  ['Ranked Commander', 'Climb from Bronze to Mythic each season'],
  ['Draft Night', 'Keep every card you pick'],
  ['Friends and challenges', 'Duel your friends and watch their games'],
];
const HERO = 'https://api.scryfall.com/cards/named?exact=Jace%2C%20the%20Mind%20Sculptor&format=image&version=art_crop';

/** The sign-in dialog (SIGN IN in the header, and anywhere an account is needed). */
export function SignIn({ onClose }: { onClose: () => void }) {
  const auth = useStore((s) => s.auth);
  const [tab, setTab] = useState<'in' | 'up'>('in');
  const [linkMode, setLinkMode] = useState(false);
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null);
  const supa = auth === 'supabase';

  React.useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const go = async () => {
    setMsg(null);
    const em = email.trim();
    if (!supa) {
      if (name.trim().length < 2) return setMsg({ text: 'Pick a player name with at least 2 characters.' });
    } else {
      if (tab === 'up' && name.trim().length < 2) return setMsg({ text: 'Pick a player name with at least 2 characters.' });
      if (!/^\S+@\S+\.\S+$/.test(em)) return setMsg({ text: 'Enter your email address.' });
      if (!linkMode && pw.length < (tab === 'up' ? 8 : 1)) return setMsg({ text: tab === 'up' ? 'Use a password with at least 8 characters.' : 'Enter your password.' });
    }
    setBusy(true);
    try {
      if (!supa) {
        const dev = { name: name.trim(), secret: secret(), create: true };
        const r: any = await hello({ dev });
        if (!r || r.t !== 'me') throw new Error('Could not create the account. Try another name.');
        localStorage.setItem(DEV_KEY, JSON.stringify({ name: dev.name, secret: dev.secret }));
        toast(`Welcome, ${r.me.name}`);
        return onClose();
      }
      if (linkMode) {
        const { error } = await sb.auth.signInWithOtp({ email: em, options: { emailRedirectTo: location.origin, shouldCreateUser: tab === 'up', data: tab === 'up' ? { name: name.trim() } : undefined } });
        if (error) throw error;
        return setMsg({ ok: true, text: `We sent a sign-in link to ${em}. Open it on this device.` });
      }
      if (tab === 'up') {
        const { data, error } = await sb.auth.signUp({ email: em, password: pw, options: { data: { name: name.trim() }, emailRedirectTo: location.origin } });
        if (error) throw error;
        if (!data.session) return setMsg({ ok: true, text: `Almost there. Open the link we sent to ${em} to confirm your account, then sign in.` });
      } else {
        const { error } = await sb.auth.signInWithPassword({ email: em, password: pw });
        if (error) throw error;
      }
      toast('Signed in');
      onClose();
    } catch (e: any) {
      setMsg({ text: friendly(e) });
    } finally {
      setBusy(false);
    }
  };
  const forgot = async () => {
    const em = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(em)) return setMsg({ text: 'Enter your email above first, then press “Forgot password?” again.' });
    setBusy(true);
    const { error } = await sb.auth.signInWithOtp({ email: em, options: { emailRedirectTo: location.origin, shouldCreateUser: false } });
    setBusy(false);
    setMsg(error ? { text: friendly(error) } : { ok: true, text: `We sent a sign-in link to ${em}. After signing in you can keep playing; your password stays the same.` });
  };

  const label = css('font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#8d98a8');
  const field = 'width:100%;box-sizing:border-box;height:46px;padding:0 14px;border-radius:4px;border:1px solid rgba(255,255,255,.1);background:#07080a;color:#f4efe4;font-family:Manrope,system-ui,sans-serif;font-size:15px;outline:none;transition:border-color .15s,box-shadow .15s';
  const fieldCls = pc([['focus', 'border-color:rgba(240,169,59,.7);box-shadow:0 0 0 3px rgba(240,169,59,.15)'], ['placeholder', 'color:#4f5968']]);
  const tabBtn = (id: 'in' | 'up', text: string) => {
    const on = tab === id;
    return (
      <button
        type="button"
        role="tab"
        aria-selected={on}
        onClick={() => {
          setTab(id);
          setMsg(null);
        }}
        style={css(`position:relative;flex:1;padding:12px 0;border:0;background:transparent;cursor:pointer;font-family:Cinzel,serif;font-size:13px;font-weight:700;letter-spacing:.2em;color:${on ? '#f7dc9a' : '#6b7688'};transition:color .15s`)}
      >
        {text}
        <span style={css(`position:absolute;left:20%;right:20%;bottom:-1px;height:2px;background:${on ? 'linear-gradient(90deg,rgba(240,169,59,0),#f0a93b,rgba(240,169,59,0))' : 'transparent'}`)} />
      </button>
    );
  };
  const title = !supa ? 'Choose your name' : tab === 'up' ? 'Create your account' : 'Welcome back';
  const cta = busy ? '…' : !supa ? 'START PLAYING' : linkMode ? 'EMAIL ME A LINK' : tab === 'up' ? 'CREATE ACCOUNT' : 'SIGN IN';

  return (
    <div onClick={onClose} style={css('position:fixed;inset:0;z-index:120;display:grid;place-items:center;padding:24px;overflow:auto;background:radial-gradient(circle at 50% 45%,rgba(20,12,4,.78),rgba(3,3,4,.97));animation:siFade .25s ease-out')}>
      <style>{'@keyframes siFade{from{opacity:0}to{opacity:1}}@keyframes siUp{from{opacity:0;transform:translateY(18px) scale(.98)}to{opacity:1;transform:none}}@media (max-width:720px){.si-art{display:none}}'}</style>
      <form
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) go();
        }}
        style={css('position:relative;width:min(860px,100%);display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));padding:1px;border-radius:10px;overflow:hidden;background:linear-gradient(160deg,#e8c46a,#5a4018 40%,#2a1d0a 70%,#c9a050);box-shadow:0 40px 100px rgba(0,0,0,.8),0 0 80px rgba(240,169,59,.08);animation:siUp .45s cubic-bezier(.2,.8,.2,1)')}
      >
        {/* art side */}
        <div className="si-art" style={css(`position:relative;min-height:220px;overflow:hidden;background:#0b0d11 url('${HERO}') center 30%/cover`)}>
          <div style={css('position:absolute;inset:0;background:linear-gradient(180deg,rgba(8,9,12,.2) 0%,rgba(8,9,12,.55) 45%,rgba(8,9,12,.96) 100%),linear-gradient(90deg,rgba(8,9,12,0) 60%,rgba(8,9,12,.6))')} />
          <div style={css('position:absolute;inset:0;box-shadow:inset 0 0 120px rgba(0,0,0,.7)')} />
          <div style={css('position:relative;height:100%;box-sizing:border-box;display:flex;flex-direction:column;justify-content:flex-end;gap:18px;padding:32px')}>
            <span style={css('font-family:Cinzel,serif;font-size:13px;font-weight:800;letter-spacing:.42em;color:#f7dc9a;text-shadow:0 2px 12px rgba(0,0,0,.9)')}>PLAYMTG</span>
            <span style={css('font-family:Cinzel,serif;font-size:28px;font-weight:700;line-height:1.15;color:#f6f0e2;text-shadow:0 4px 20px rgba(0,0,0,.9)')}>Your account keeps your decks, wallet and rank.</span>
            <div style={css('display:flex;flex-direction:column;gap:10px')}>
              {PERKS.map(([t, d]) => (
                <div key={t} style={css('display:flex;gap:12px;align-items:flex-start')}>
                  <span aria-hidden="true" style={css('flex:none;width:8px;height:8px;margin-top:6px;transform:rotate(45deg);background:#f0a93b;box-shadow:0 0 10px rgba(240,169,59,.7)')} />
                  <span style={css('display:flex;flex-direction:column;gap:1px')}>
                    <span style={css('font-size:14px;font-weight:700;color:#f4efe4')}>{t}</span>
                    <span style={css('font-size:12px;color:#aab3c0')}>{d}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* form side */}
        <div style={css('position:relative;display:flex;flex-direction:column;gap:18px;padding:30px 32px 26px;background:radial-gradient(500px 260px at 50% 0%,rgba(240,169,59,.08),rgba(240,169,59,0) 70%),linear-gradient(180deg,#17191e,#0d0e11)')}>
          <button type="button" onClick={onClose} aria-label="Close" style={css('position:absolute;top:12px;right:12px;width:32px;height:32px;border:0;border-radius:50%;background:transparent;cursor:pointer;font-size:20px;line-height:1;color:#6b7688')} className={pc([['hover', 'color:#f4efe4;background:rgba(255,255,255,.06)']])}>
            ×
          </button>
          {supa && (
            <div role="tablist" style={css('display:flex;border-bottom:1px solid rgba(255,255,255,.08);margin-top:6px')}>
              {tabBtn('in', 'SIGN IN')}
              {tabBtn('up', 'NEW ACCOUNT')}
            </div>
          )}
          <h2 style={css('margin:4px 0 0;font-family:Cinzel,serif;font-size:30px;font-weight:700;line-height:1.1;color:#f6f0e2')}>{title}</h2>

          {(!supa || tab === 'up') && (
            <label style={css('display:flex;flex-direction:column;gap:7px')}>
              <span style={label}>Player name</span>
              <input style={css(field)} className={fieldCls} placeholder="How others see you" maxLength={24} autoComplete="nickname" autoFocus={!supa} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
          )}
          {supa && (
            <label style={css('display:flex;flex-direction:column;gap:7px')}>
              <span style={label}>Email</span>
              <input style={css(field)} className={fieldCls} type="email" placeholder="you@example.com" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
          )}
          {supa && !linkMode && (
            <label style={css('display:flex;flex-direction:column;gap:7px')}>
              <span style={css('display:flex;justify-content:space-between;align-items:baseline')}>
                <span style={label}>Password</span>
                {tab === 'in' && (
                  <button type="button" onClick={forgot} style={css('padding:0;border:0;background:transparent;cursor:pointer;font-size:12px;font-weight:700;color:#c9a050')} className={pc([['hover', 'color:#f7dc9a']])}>
                    Forgot password?
                  </button>
                )}
              </span>
              <span style={css('position:relative;display:block')}>
                <input style={css(field + ';padding-right:64px')} className={fieldCls} type={showPw ? 'text' : 'password'} placeholder={tab === 'up' ? 'At least 8 characters' : 'Your password'} autoComplete={tab === 'up' ? 'new-password' : 'current-password'} value={pw} onChange={(e) => setPw(e.target.value)} />
                <button type="button" onClick={() => setShowPw((x) => !x)} style={css('position:absolute;right:8px;top:50%;transform:translateY(-50%);padding:6px 8px;border:0;background:transparent;cursor:pointer;font-size:12px;font-weight:700;color:#8d98a8')}>
                  {showPw ? 'Hide' : 'Show'}
                </button>
              </span>
            </label>
          )}
          {!supa && <p style={css('margin:0;font-size:13px;line-height:1.55;color:#aab3c0')}>Your account is kept on this server and remembered in this browser.</p>}

          {msg && (
            <div role="status" style={css(`padding:10px 14px;border-radius:4px;font-size:13px;font-weight:600;line-height:1.45;background:${msg.ok ? 'rgba(126,240,184,.08)' : 'rgba(224,105,79,.1)'};color:${msg.ok ? '#9af5c8' : '#ffb3a3'};box-shadow:inset 2px 0 0 ${msg.ok ? '#3ec28f' : '#e0694f'}`)}>
              {msg.text}
            </div>
          )}

          <button type="submit" disabled={busy} style={css(`margin-top:4px;padding:2px;border:0;cursor:pointer;opacity:${busy ? 0.7 : 1};background:linear-gradient(180deg,#f7dc9a,#a8742a 50%,#f0c56a);clip-path:polygon(16px 0,calc(100% - 16px) 0,100% 50%,calc(100% - 16px) 100%,16px 100%,0 50%)`)} className={pc([['hover', 'filter:brightness(1.1)'], ['active', 'transform:scale(.985)']])}>
            <span style={css('display:block;padding:15px 0;background:linear-gradient(180deg,#f5b44b,#b8621a);clip-path:polygon(15px 0,calc(100% - 15px) 0,100% 50%,calc(100% - 15px) 100%,15px 100%,0 50%);font-family:Cinzel,serif;font-size:15px;font-weight:800;letter-spacing:.16em;color:#1b1206')}>{cta}</span>
          </button>

          {supa && (
            <button
              type="button"
              onClick={() => {
                setLinkMode((x) => !x);
                setMsg(null);
              }}
              style={css('align-self:center;padding:0;border:0;background:transparent;cursor:pointer;font-size:13px;font-weight:700;color:#c9a050')}
              className={pc([['hover', 'color:#f7dc9a']])}
            >
              {linkMode ? 'Use a password instead' : 'Email me a sign-in link instead'}
            </button>
          )}
          <div style={css('display:flex;align-items:center;gap:12px;margin-top:2px')}>
            <span style={css('flex:1;height:1px;background:rgba(255,255,255,.07)')} />
            <button type="button" onClick={onClose} style={css('padding:0;border:0;background:transparent;cursor:pointer;font-size:13px;color:#8d98a8')} className={pc([['hover', 'color:#f4efe4']])}>
              Keep playing as a guest
            </button>
            <span style={css('flex:1;height:1px;background:rgba(255,255,255,.07)')} />
          </div>
        </div>
      </form>
    </div>
  );
}
void request;
