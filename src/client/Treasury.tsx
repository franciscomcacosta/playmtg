// The Treasury from the Claude Design file. Payments are off ("free dev mode"): confirming a chest asks the server to
// credit the gold (and any cosmetics in that tier) to the account, then plays the coin burst into the gold counter.
import React, { useState } from 'react';
import { TreasuryView, TreasuryView_CSS } from './TreasuryView';
import { request, useStore, type Me } from './store';
import { useCatalog } from './catalogData';
import { SignIn } from './auth';
import { EASE, fmt } from './dc';

const eur = (n: number) => '€' + n.toFixed(2);
const TL: Record<string, string> = { sleeve: 'SLEEVES', mat: 'PLAYMAT', back: 'CARD BACK', avatar: 'AVATAR' };

export function Treasury() {
  const me = useStore((s) => s.me);
  const cat = useCatalog();
  const [signIn, setSignIn] = useState(false);
  return (
    <>
      <style>{TreasuryView_CSS}</style>
      <TreasuryImpl me={me} cat={cat} askSignIn={() => setSignIn(true)} />
      {signIn && <SignIn onClose={() => setSignIn(false)} />}
    </>
  );
}

class TreasuryImpl extends React.Component<{ me: Me | null; cat: any; askSignIn: () => void }, any> {
  state: any = { sel: null, shown: null as number | null, busy: false };
  rootRef = React.createRef<HTMLDivElement>();
  fxRef = React.createRef<HTMLDivElement>();
  _intro = false;
  q(s: string): HTMLElement[] {
    const r = this.rootRef.current;
    return r ? [...r.querySelectorAll<HTMLElement>(s)] : [];
  }
  componentDidMount() {
    this.intro();
  }
  intro() {
    if (this._intro || !this.props.cat) return;
    this._intro = true;
    this.q('[data-in]').forEach((el) => el.animate([{ opacity: 0, transform: 'translateY(24px)', filter: 'blur(6px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: 850, delay: 150 + +(el.dataset.in ?? 0) * 90, easing: EASE, fill: 'backwards' }));
    this.q('[data-tier]').forEach((el, i) => el.animate([{ opacity: 0, transform: 'translateY(40px)' }, { opacity: 1, transform: 'none' }], { duration: 750, delay: 450 + i * 80, easing: EASE, fill: 'backwards' }));
    this.q('[data-pile]').forEach((el, i) => el.animate([{ opacity: 0, transform: 'translateY(-60px)' }, { opacity: 1, transform: 'translateY(4px)', offset: 0.75 }, { transform: 'none' }], { duration: 700, delay: 700 + i * 80, easing: 'cubic-bezier(.5,0,.5,1)', fill: 'backwards' }));
  }
  componentDidUpdate(pp: any, ps: any) {
    if (!pp.cat && this.props.cat) this.intro();
    if (!ps.sel && this.state.sel) this.q('[data-modal]').forEach((el) => el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250 }));
  }
  /** Coins fly from the chest into the gold counter, which then counts up from `from` to the new balance. */
  burst(tierId: number, from: number) {
    const src = this.q(`[data-tier="${tierId}"] [data-pile]`)[0], dst = this.q('[data-cur="gold"]')[0], host = this.fxRef.current;
    if (!src || !dst || !host) return this.setState({ shown: null });
    const a = src.getBoundingClientRect(), b = dst.getBoundingClientRect();
    const n = Math.min(26, 8 + tierId * 3);
    for (let i = 0; i < n; i++) {
      const d = document.createElement('div');
      Object.assign(d.style, { position: 'absolute', left: a.left + 'px', top: a.top - 40 + 'px', width: '18px', height: '18px', marginLeft: '-9px', borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%,#fff4cc,#f0c35a 45%,#8a5a14)', boxShadow: '0 0 12px rgba(255,200,90,.8)' });
      host.appendChild(d);
      const dx = b.left + 30 - a.left, dy = b.top + 20 - (a.top - 40), sx = (Math.random() - 0.5) * 160, sy = -60 - Math.random() * 120;
      d.animate(
        [
          { transform: 'translate(0,0) scale(.4)', opacity: 0 },
          { transform: `translate(${sx}px,${sy}px) scale(1)`, opacity: 1, offset: 0.3 },
          { transform: `translate(${dx}px,${dy}px) scale(.5)`, opacity: 0.9 },
        ],
        { duration: 900 + Math.random() * 300, delay: i * 35, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'forwards' },
      ).finished.then(() => d.remove(), () => d.remove());
    }
    const t0 = performance.now() + 700, dur = 900;
    const tick = (now: number) => {
      const end = this.props.me?.gold ?? from;
      const k = Math.max(0, Math.min(1, (now - t0) / dur)), e = 1 - Math.pow(1 - k, 3);
      this.setState({ shown: Math.round(from + (end - from) * e) });
      if (k < 1) requestAnimationFrame(tick);
      else {
        this.setState({ shown: null });
        dst.animate([{ transform: 'scale(1)', filter: 'brightness(1)' }, { transform: 'scale(1.1)', filter: 'brightness(1.7)' }, { transform: 'scale(1)', filter: 'brightness(1)' }], { duration: 500 });
      }
    };
    requestAnimationFrame(tick);
  }
  renderVals() {
    const s = this.state, me = this.props.me, cat = this.props.cat;
    const TIERS: any[] = cat?.tiers ?? [];
    const sel = TIERS.find((t) => t.id === s.sel);
    const extraOf = (x: any) => ({ name: x.name, type: TL[x.type], thumb: x.type === 'back' ? x.style?.pattern ?? '#222' : `#222 url('${x.artUrl}')` });
    const tiers = TIERS.map((t, i) => {
      const k = i / 5, top = i === TIERS.length - 1, n = t.stacks.length;
      const stacks = t.stacks.map((c: number, j: number) => {
        const off = j - (n - 1) / 2, back = j % 2 === 1;
        return { x: Math.round(off * 30), y: back ? 12 : 0, z: back ? 1 : 5, coins: Array.from({ length: c }, (_, q) => ({ b: q * 6, dx: ((q * 7 + j * 3) % 5) - 2 })) };
      });
      const extras = (t.extraViews ?? []).filter(Boolean);
      return {
        id: t.id, numeral: t.roman, name: t.name.toUpperCase(), stacks,
        totalTxt: fmt(t.base + t.bonus), breakdown: t.bonus ? `${fmt(t.base)} + ${fmt(t.bonus)} bonus` : `${fmt(t.base)} gold`,
        hasBonus: t.bonus > 0, pct: Math.round((t.bonus / t.base) * 100),
        hasExtras: extras.length > 0, extras: extras.map(extraOf),
        shadowW: 80 + n * 30, shadowM: -(80 + n * 30) / 2,
        light: `rgba(255,196,96,${(0.08 + k * 0.22).toFixed(2)})`,
        accent: top ? '#f7dc9a' : i >= 3 ? '#e8c46a' : '#8d98a8',
        line: top ? 'rgba(240,196,106,.55)' : i >= 3 ? 'rgba(240,196,106,.22)' : 'rgba(255,255,255,.06)',
        priceTxt: eur(t.eur),
        frame: i >= 3 ? 'linear-gradient(180deg,#f7dc9a,#a8742a 50%,#f0c56a)' : 'linear-gradient(180deg,#c9a050,#5a4018)',
        fill: i >= 3 ? 'linear-gradient(180deg,#f5b44b,#b8621a)' : 'linear-gradient(180deg,#232a35,#12161d)',
        tc: i >= 3 ? '#1b1206' : '#f5d9a0', bw: i >= 3 ? '2px' : '1px',
        pick: () => (me ? this.setState({ sel: t.id }) : this.props.askSignIn()),
      };
    });
    const goldNow = s.shown ?? me?.gold;
    return {
      rootRef: this.rootRef, fxRef: this.fxRef,
      goldTxt: goldNow == null ? '—' : fmt(goldNow), embersTxt: me ? fmt(me.embers) : '—',
      intro: 'Gold is spent on anything in the Arcana Shop. Higher tiers add bonus gold, and the top three include cosmetics you can’t get anywhere else. Payments are switched off while PlayMTG is in development, so picking a chest adds the gold for free.',
      footer: 'Development mode: no payment is taken. Gold has no cash value and can’t be exchanged. Unofficial fan-made tool; card art © Wizards of the Coast, provided by Scryfall.',
      earn: [
        { t: 'Win a game', v: '+40' },
        { t: 'Finish a game', v: '+15' },
        { t: 'First win of the day', v: '+100' },
        { t: 'Daily wins track', v: 'up to 5 rewards' },
      ],
      tiers,
      hasSel: !!sel,
      sel: sel
        ? {
            name: sel.name, priceTxt: s.busy ? '…' : 'FREE',
            rows: [
              { k: 'Gold', v: fmt(sel.base), c: '#f5e2b0' },
              ...(sel.bonus ? [{ k: 'Bonus gold', v: '+' + fmt(sel.bonus), c: '#f0c35a' }] : []),
              ...(sel.extraViews ?? []).filter(Boolean).map((x: any) => ({ k: TL[x.type].charAt(0) + TL[x.type].slice(1).toLowerCase(), v: me?.owned.includes(x.id) ? `${x.name} (owned)` : x.name, c: '#e7ebf1' })),
              { k: 'Price', v: `${eur(sel.eur)} · free in dev mode`, c: '#9af5c8' },
            ],
          }
        : {},
      payLabel: 'ADD GOLD · ',
      pay: async () => {
        const t = sel;
        if (!t || s.busy || !me) return;
        const from = me.gold;
        this.setState({ busy: true, shown: from });
        try {
          await request({ t: 'treasury.buy', tier: t.id });
          this.setState({ sel: null, busy: false }, () => this.burst(t.id, from));
        } catch {
          this.setState({ busy: false, shown: null });
        }
      },
      cancel: () => this.setState({ sel: null }),
      stop: (e: any) => e.stopPropagation(),
    };
  }
  render() {
    if (!this.props.cat)
      return (
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0b0d11' }}>
          <mf-loader size="48"></mf-loader>
        </div>
      );
    return <TreasuryView v={this.renderVals()} />;
  }
}
