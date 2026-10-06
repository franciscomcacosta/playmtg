// The Arcana Shop from the Claude Design file. Prices, today's stock, the weekly bundle and ownership all come from
// the server (the account is the source of truth); buying and equipping are server requests.
import React, { useState } from 'react';
import { ShopView, ShopView_CSS } from './ShopView';
import { request, toast, useStore, type Me } from './store';
import { useCatalog } from './catalogData';
import { SignIn } from './auth';
import { EASE, fmt, hms } from './dc';

const RC: Record<string, string> = { common: '#9aa3ae', uncommon: '#c9d6e6', rare: '#e8c46a', mythic: '#f07a3a' };
const GLOW: Record<string, string> = { common: 'rgba(170,180,195,.10)', uncommon: 'rgba(170,200,240,.14)', rare: 'rgba(240,196,106,.16)', mythic: 'rgba(240,122,58,.22)' };
const TL: Record<string, string> = { sleeve: 'SLEEVES', mat: 'PLAYMAT', back: 'CARD BACK', avatar: 'AVATAR' };
const TYPE_ORDER = ['avatar', 'sleeve', 'back', 'mat'];

export function Shop() {
  const me = useStore((s) => s.me);
  const cat = useCatalog();
  const [signIn, setSignIn] = useState(false);
  return (
    <>
      <style>{ShopView_CSS}</style>
      <ShopImpl me={me} cat={cat} askSignIn={() => setSignIn(true)} />
      {signIn && <SignIn onClose={() => setSignIn(false)} />}
    </>
  );
}

class ShopImpl extends React.Component<{ me: Me | null; cat: any; askSignIn: () => void }, any> {
  state: any = { detail: null, now: Date.now(), busy: null as string | null, cols: 6, matScale: 0.8 };
  rootRef = React.createRef<HTMLDivElement>();
  matRef = React.createRef<HTMLDivElement>();
  gridRef = React.createRef<HTMLDivElement>();
  matRO?: ResizeObserver;
  gridRO?: ResizeObserver;
  _t: any;
  _intro = false;
  q(s: string): HTMLElement[] {
    const r = this.rootRef.current;
    return r ? [...r.querySelectorAll<HTMLElement>(s)] : [];
  }
  componentDidMount() {
    const fit = () => {
      const el = this.matRef.current;
      if (!el) return;
      const s = Math.min(1.15, el.clientWidth / 720);
      if (Math.abs(s - this.state.matScale) > 0.005) this.setState({ matScale: s });
    };
    const cols = () => {
      const el = this.gridRef.current;
      if (!el) return;
      const w = el.clientWidth, c = w >= 6 * 185 + 70 ? 6 : w >= 3 * 185 + 28 ? 3 : 2;
      if (c !== this.state.cols) this.setState({ cols: c });
    };
    this.matRO = new ResizeObserver(() => requestAnimationFrame(fit));
    this.gridRO = new ResizeObserver(() => requestAnimationFrame(cols));
    this._t = setInterval(() => this.setState({ now: Date.now() }), 1000);
    this.observe();
    fit();
    cols();
    this.intro();
  }
  observe() {
    if (this.matRef.current) this.matRO?.observe(this.matRef.current);
    if (this.gridRef.current) this.gridRO?.observe(this.gridRef.current);
  }
  intro() {
    if (this._intro || !this.props.cat) return;
    this._intro = true;
    this.q('[data-in]').forEach((el) => el.animate([{ opacity: 0, transform: 'translateY(24px)', filter: 'blur(6px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: 850, delay: 150 + +(el.dataset.in ?? 0) * 90, easing: EASE, fill: 'backwards' }));
    this.q('[data-mat]').forEach((el) => el.animate([{ opacity: 0, transform: 'rotateX(10deg) rotateZ(0deg) translateY(160px) scale(.75)' }, { opacity: 1, transform: 'rotateX(54deg) rotateZ(-14deg) translateY(-10px)' }], { duration: 1500, delay: 250, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' }));
    this.q('[data-slot]').forEach((el, i) => el.animate([{ opacity: 0, transform: 'translateY(40px)' }, { opacity: 1, transform: 'none' }], { duration: 750, delay: 500 + i * 70, easing: EASE, fill: 'backwards' }));
  }
  componentWillUnmount() {
    clearInterval(this._t);
    this.matRO?.disconnect();
    this.gridRO?.disconnect();
  }
  componentDidUpdate(pp: any, ps: any) {
    if (!pp.cat && this.props.cat) {
      this.observe();
      this.intro();
    }
    if (!ps.detail && this.state.detail) {
      this.q('[data-modal]').forEach((el) => el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 }));
      this.q('[data-dprev]').forEach((el) => el.animate([{ opacity: 0, translate: '0 40px', rotate: '-6deg' } as any, { opacity: 1, translate: '0 0', rotate: '0deg' }], { duration: 700, easing: 'cubic-bezier(.16,1,.3,1)' }));
      this.q('[data-dprev] [data-tilt]').forEach((el) => el.animate([{ translate: '0 4px' } as any, { translate: '0 -8px' }], { duration: 2600, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' }));
    }
    const was = new Set(pp.me?.owned ?? []);
    const fresh = pp.me ? (this.props.me?.owned ?? []).filter((k) => !was.has(k)) : [];
    fresh.forEach((id) => {
      this.q(`[data-stamp="${id}"]`).forEach((el) => el.animate([{ opacity: 0, transform: 'rotate(9deg) scale(2.4)' }, { opacity: 1, transform: 'rotate(9deg) scale(.92)', offset: 0.7 }, { transform: 'rotate(9deg) scale(1)' }], { duration: 520, easing: 'cubic-bezier(.5,0,.3,1)' }));
      this.q(`[data-slot="${id}"]`).forEach((el) => el.animate([{ transform: 'none' }, { transform: 'translateY(3px)', offset: 0.6 }, { transform: 'none' }], { duration: 400, delay: 280 }));
    });
    (['gold', 'embers'] as const).forEach((c) => {
      if (pp.me && this.props.me && pp.me[c] !== this.props.me[c])
        this.q(`[data-cur="${c}"]`).forEach((el) => el.animate([{ transform: 'scale(1)', filter: 'brightness(1)' }, { transform: 'scale(1.08)', filter: 'brightness(1.6)' }, { transform: 'scale(1)', filter: 'brightness(1)' }], { duration: 480 }));
    });
  }
  owned(id: string) {
    return !!this.props.me?.owned.includes(id);
  }
  canAfford(it: any) {
    const me = this.props.me;
    if (!it.price) return false;
    return it.price.cur === 'free' || (!!me && me[it.price.cur as 'gold' | 'embers'] >= it.price.amt);
  }
  async run(key: string, m: any, ok: string) {
    if (this.state.busy) return;
    this.setState({ busy: key });
    try {
      await request(m);
      toast(ok);
    } catch {
      /* toast shown */
    } finally {
      this.setState({ busy: null });
    }
  }
  act(it: any) {
    if (!this.props.me) return this.props.askSignIn();
    const eq = this.props.me.equipped[it.type] === it.id;
    if (this.owned(it.id)) {
      if (eq) return it.type === 'avatar' ? undefined : this.run(it.id, { t: 'shop.unequip', type: it.type }, `${it.name} unequipped`);
      return this.run(it.id, { t: 'shop.equip', item: it.id }, `${it.name} equipped`);
    }
    if (!it.price || !this.canAfford(it)) return;
    this.run(it.id, { t: 'shop.buy', item: it.id }, it.price.cur === 'free' ? `${it.name} claimed` : `${it.name} is yours`);
  }
  view(it: any, forSale: boolean) {
    const me = this.props.me;
    const owned = this.owned(it.id), eq = me?.equipped[it.type] === it.id, afford = this.canAfford(it), free = it.price?.cur === 'free';
    const gold = { frame: 'linear-gradient(180deg,#f7dc9a,#a8742a 50%,#f0c56a)', fill: 'linear-gradient(180deg,#f5b44b,#b8621a)', tc: '#1b1206' };
    const dark = { frame: 'linear-gradient(180deg,#c9a050,#5a4018)', fill: 'linear-gradient(180deg,#232a35,#12161d)', tc: '#f5d9a0' };
    const green = { frame: 'linear-gradient(180deg,#7ef0b8,#1e6a48)', fill: 'linear-gradient(180deg,#16352a,#0b1a14)', tc: '#9af5c8' };
    const dead = { frame: 'linear-gradient(180deg,#3a4452,#222a34)', fill: 'linear-gradient(180deg,#171c23,#0e1217)', tc: '#5a6472' };
    const busy = this.state.busy === it.id;
    const canUnequip = eq && it.type !== 'avatar';
    let sk, btn: string, bigBtn: string;
    if (!me) {
      sk = free ? gold : dark;
      btn = free ? 'Claim free' : fmt(it.price?.amt ?? 0);
      bigBtn = 'SIGN IN TO ' + (free ? 'CLAIM' : 'BUY');
    } else if (owned) {
      sk = eq ? (canUnequip ? dark : dead) : green;
      btn = eq ? (canUnequip ? 'Unequip' : 'Equipped') : 'Equip';
      bigBtn = eq ? (canUnequip ? 'UNEQUIP' : 'EQUIPPED') : 'EQUIP';
    } else if (!it.price) {
      sk = dead;
      btn = 'Locked';
      bigBtn = it.source ? `FROM ${String(it.source).toUpperCase()}` : 'NOT FOR SALE';
    } else if (free) {
      sk = gold;
      btn = 'Claim free';
      bigBtn = 'CLAIM FREE';
    } else {
      sk = afford ? dark : dead;
      btn = fmt(it.price.amt);
      bigBtn = `BUY · ${fmt(it.price.amt)} ${it.price.cur === 'gold' ? 'GOLD' : 'EMBERS'}`;
    }
    const short = !!me && !owned && !!it.price && !afford;
    const showPrice = !owned && !!it.price && !free;
    return {
      ...it, ...(it.style ?? {}),
      art: it.artUrl ?? '', artName: it.art || '', hasArt: !!it.art,
      rc: RC[it.rarity], glow: GLOW[it.rarity], typeLabel: TL[it.type], desc: it.desc + (it.source && !it.price ? ` From the ${it.source}.` : ''),
      isSleeve: it.type === 'sleeve', isMat: it.type === 'mat', isBack: it.type === 'back', isAvatar: it.type === 'avatar',
      isGold: showPrice && it.price.cur === 'gold', isEmbers: showPrice && it.price.cur === 'embers',
      owned: owned && forSale, ownedLabel: eq ? 'EQUIPPED' : 'OWNED', btn: busy ? '…' : btn, bigBtn: busy ? '…' : bigBtn, ...sk,
      disabled: busy || (!!me && ((owned && eq && !canUnequip) || (!owned && (!it.price || !afford)))),
      short, shortTxt: short ? `You need ${fmt(it.price.amt - (me as any)[it.price.cur])} more ${it.price.cur}.` : '',
      scale: it.type === 'mat' ? 1.7 : 1.9,
      open: () => this.setState({ detail: it.id }),
      act: (e: any) => {
        e?.stopPropagation?.();
        this.act(it);
      },
    };
  }
  renderVals() {
    const s = this.state, me = this.props.me, cat = this.props.cat;
    const items: any[] = cat?.items ?? [];
    const byId = (id: string) => items.find((i) => i.id === id);
    const stock = (cat?.stock ?? []).map(byId).filter(Boolean);
    const b = cat?.bundle;
    const bundleOwned = !!b && !!me && b.items.every((id: string) => me.owned.includes(id));
    const bCur = b?.cur ?? 'embers';
    const bOK = !!b && !bundleOwned && (!me || me[bCur as 'gold' | 'embers'] >= b.price);
    const left = Math.max(0, (cat?.restock ?? s.now) - s.now);
    const bLeft = b ? Math.max(0, b.endsAt - s.now) : 0;
    const bDays = Math.ceil(bLeft / 864e5);
    const owned = me ? me.owned.map(byId).filter(Boolean).sort((x: any, y: any) => TYPE_ORDER.indexOf(x.type) - TYPE_ORDER.indexOf(y.type) || x.name.localeCompare(y.name)) : [];
    const dIt = byId(s.detail);
    return {
      rootRef: this.rootRef, matRef: this.matRef, gridRef: this.gridRef, stockCols: s.cols, matScale: s.matScale, matH: Math.round(400 * s.matScale),
      goldTxt: me ? fmt(me.gold) : '—', embersTxt: me ? fmt(me.embers) : '—',
      countdown: hms(left),
      bundleLeft: !b ? '' : bLeft < 864e5 ? `Leaves the shop in ${hms(bLeft)}` : `Leaves the shop in ${bDays} day${bDays === 1 ? '' : 's'}`,
      bundleName: b?.name ?? '', bundlePrice: b ? fmt(b.price) : '', bundleSep: b ? `${fmt(b.separately)} separately` : '', bundleSave: b ? `Save ${fmt(b.separately - b.price)} ${bCur}` : '',
      heroArt: b?.heroArt ?? '', hero1: b?.heroCards?.[0]?.image ?? '', hero2: b?.heroCards?.[1]?.image ?? b?.heroCards?.[0]?.image ?? '',
      bundleRows: (b?.itemViews ?? []).map((i: any) => ({ type: TL[i.type], name: i.name })),
      bundle: {
        label: this.state.busy === 'bundle' ? '…' : bundleOwned ? 'OWNED' : me ? 'BUY BUNDLE' : 'SIGN IN TO BUY', showPrice: !bundleOwned,
        disabled: !bOK || this.state.busy === 'bundle', filter: bundleOwned ? 'saturate(.3) brightness(.7)' : bOK ? 'none' : 'grayscale(1) brightness(.5)',
      },
      buyBundle: () => {
        if (!me) return this.props.askSignIn();
        if (bOK) this.run('bundle', { t: 'shop.bundle', id: b.id }, `${b.name} unlocked`);
      },
      items: stock.map((it: any) => this.view(it, true)),
      hasOwned: owned.length > 0,
      owned: owned.map((it: any) => this.view(it, false)),
      ownedHint: 'Equip what you own. It shows on the table in every game.',
      tiltMove: (e: any) => {
        const bx = e.currentTarget as HTMLElement, r = bx.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        const t = bx.querySelector<HTMLElement>('[data-tilt]');
        if (t) t.style.transform = `rotateY(${(px - 0.5) * 22}deg) rotateX(${(0.5 - py) * 16}deg) translateY(-6px)`;
        bx.querySelectorAll<HTMLElement>('[data-glare]').forEach((g) => (g.style.backgroundPosition = `${px * 100}% ${py * 100}%`));
      },
      tiltLeave: (e: any) => {
        const t = e.currentTarget.querySelector('[data-tilt]');
        if (t) t.style.transform = '';
      },
      hasDetail: !!dIt, d: dIt ? this.view(dIt, true) : {},
      closeDetail: () => this.setState({ detail: null }),
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
    return <ShopView v={this.renderVals()} />;
  }
}
