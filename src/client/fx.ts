// Animation helpers ported from the designer's "Board Redesign" and "Animation Reference" files.
// Everything is drawn in an absolutely-positioned fx layer that lives inside the (possibly scaled) board root,
// so all coordinates here are *local* board coordinates (screen px divided by the board scale).

export type Pt = { x: number; y: number };
export type Box = { x: number; y: number; w: number; h: number };

const EASE = 'cubic-bezier(.2,.8,.2,1)';
export const EXILE_TINT = 'grayscale(.6) brightness(1.1) sepia(.3) hue-rotate(210deg)';

export class FX {
  root: HTMLElement;
  layer: HTMLElement;
  scale = 1;
  speed = 1;
  constructor(root: HTMLElement, layer: HTMLElement) {
    this.root = root;
    this.layer = layer;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) this.speed = 3;
  }
  d(ms: number) {
    return ms / this.speed;
  }
  wait(ms: number) {
    return new Promise<void>((r) => setTimeout(r, this.d(ms)));
  }

  // ---------- geometry ----------
  box(el: Element | null | undefined): Box | null {
    if (!el) return null;
    const r = this.root.getBoundingClientRect();
    const a = el.getBoundingClientRect();
    if (!a.width && !a.height) return null;
    return { x: (a.left - r.left) / this.scale, y: (a.top - r.top) / this.scale, w: a.width / this.scale, h: a.height / this.scale };
  }
  ctr(el: Element | Box | null | undefined): Pt | null {
    const b = el && 'w' in (el as any) ? (el as Box) : this.box(el as Element);
    return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : null;
  }
  el(iid: string) {
    return this.root.querySelector(`[data-iid="${CSS.escape(iid)}"]`) as HTMLElement | null;
  }
  q(sel: string) {
    return this.root.querySelector(sel) as HTMLElement | null;
  }
  av(p: number) {
    return this.q(`[data-target="p${p}"]`);
  }
  anchor(name: string) {
    return this.q(`[data-anchor="${name}"]`);
  }

  // ---------- primitives ----------
  A(el: Element | null | undefined, frames: Keyframe[], dur: number, o: KeyframeAnimationOptions = {}) {
    if (!el) return Promise.resolve();
    return (el as HTMLElement).animate(frames, { duration: this.d(dur), easing: EASE, fill: 'forwards', ...o }).finished.then(
      () => undefined,
      () => undefined,
    );
  }
  mk(css: Partial<CSSStyleDeclaration> | Record<string, any>, text?: string, parent: HTMLElement = this.layer) {
    const e = document.createElement('div');
    Object.assign(e.style, { position: 'absolute', pointerEvents: 'none' }, css);
    if (text != null) e.textContent = text;
    parent.appendChild(e);
    return e;
  }
  fx(text: string, x: number, y: number, frames: Keyframe[], dur: number, easing: string, css: Record<string, any>) {
    const e = this.mk({ left: x + 'px', top: y + 'px', transform: 'translate(-50%,-50%)', ...css }, text);
    return e.animate(frames, { duration: this.d(dur), easing: easing || 'ease-out', fill: 'forwards' }).finished.then(
      () => e.remove(),
      () => e.remove(),
    );
  }
  floatText(c: Pt, text: string, color: string, size = 46) {
    return this.fx(
      text,
      c.x,
      c.y,
      [
        { transform: 'translate(-50%,-50%) scale(.4)', opacity: 0 },
        { transform: 'translate(-50%,-90%) scale(1.2)', opacity: 1, offset: 0.22 },
        { transform: 'translate(-50%,-90%) scale(1)', opacity: 1, offset: 0.55 },
        { transform: 'translate(-50%,-240%) scale(1)', opacity: 0 },
      ],
      1300,
      'ease-out',
      { font: `700 ${size}px Cinzel, serif`, color, whiteSpace: 'nowrap', textShadow: `0 3px 0 #000, 0 0 20px ${color}`, zIndex: 5 },
    );
  }
  caption(c: Pt, text: string, color = '#c8d0dc') {
    return this.fx(
      text,
      c.x,
      c.y,
      [
        { transform: 'translate(-50%,-50%) translateY(6px)', opacity: 0 },
        { transform: 'translate(-50%,-50%)', opacity: 1, offset: 0.15 },
        { transform: 'translate(-50%,-50%)', opacity: 1, offset: 0.8 },
        { transform: 'translate(-50%,-50%) translateY(-6px)', opacity: 0 },
      ],
      2000,
      'ease-out',
      { padding: '5px 12px', borderRadius: '999px', background: 'rgba(14,17,23,.92)', border: '1px solid #2e3a4a', font: '700 13px Manrope, sans-serif', color, whiteSpace: 'nowrap', zIndex: 6 },
    );
  }
  ring(c: Pt, color: string, s = 4.5) {
    return this.fx('', c.x, c.y, [{ transform: 'translate(-50%,-50%) scale(.2)', opacity: 1 }, { transform: `translate(-50%,-50%) scale(${s})`, opacity: 0 }], 520, 'ease-out', {
      width: '40px',
      height: '40px',
      borderRadius: '50%',
      border: '4px solid ' + color,
      boxShadow: '0 0 24px ' + color,
    });
  }
  shake(el: Element | null) {
    if (!el) return;
    (el as HTMLElement).animate([{ translate: '0 0' }, { translate: '-7px 2px' }, { translate: '6px -2px' }, { translate: '-4px 1px' }, { translate: '0 0' }], { duration: this.d(320) });
  }
  pop(el: Element | null, c: string) {
    if (!el) return Promise.resolve();
    return this.A(el, [{ transform: 'scale(1)', filter: 'none' }, { transform: 'scale(1.35)', filter: `drop-shadow(0 0 10px ${c})`, offset: 0.35 }, { transform: 'scale(1)', filter: 'none' }], 520, { fill: 'none' });
  }
  ptPulse(el: Element | null, c: string) {
    return this.A(el, [{ transform: 'scale(1)', boxShadow: '0 0 0 0 transparent' }, { transform: 'scale(1.4)', boxShadow: `0 0 0 2px ${c}, 0 0 20px ${c}`, offset: 0.35 }, { transform: 'scale(1)', boxShadow: '0 0 0 0 transparent' }], 700, { fill: 'none' });
  }
  drop(el: Element | null) {
    return this.A(el, [{ opacity: 0, transform: 'translateY(-60px) scale(.6)' }, { opacity: 1, transform: 'translateY(6px) scale(1.25)', offset: 0.7 }, { opacity: 1, transform: 'none' }], 520, { fill: 'none' });
  }
  appear(el: Element | null) {
    return this.A(el, [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1.1)', offset: 0.7 }, { opacity: 1, transform: 'scale(1)' }], 380, { fill: 'none' });
  }
  glow(el: Element | null, col: string, dur = 900) {
    return this.A(el, [{ boxShadow: '0 0 0 0 transparent' }, { boxShadow: `0 0 0 3px ${col}, 0 0 40px ${col}`, offset: 0.35 }, { boxShadow: '0 0 0 0 transparent' }], dur, { fill: 'none' });
  }
  flash(el: Element | null) {
    return this.A(el, [{ filter: 'brightness(2.2)' }, { filter: 'none' }], 600, { fill: 'none' });
  }
  stamp(c: Pt, text: string, big = false) {
    const b = `translate(-50%,-50%) rotate(${big ? -14 : -10}deg)`;
    const e = this.mk(
      big
        ? { left: c.x + 'px', top: c.y + 'px', padding: '4px 14px', border: '3px solid #ff6b5a', borderRadius: '6px', font: '700 26px Cinzel, serif', letterSpacing: '.12em', color: '#ff6b5a', background: 'rgba(20,6,4,.85)', textShadow: '0 0 12px rgba(255,107,90,.7)', boxShadow: '0 0 20px rgba(255,107,90,.4)', zIndex: 8, transform: b }
        : { left: c.x + 'px', top: c.y + 'px', padding: '2px 8px', borderRadius: '6px', background: '#f0a93b', color: '#1b1206', font: '800 16px Manrope, sans-serif', zIndex: 8, transform: b },
      text,
    );
    e.animate(
      [
        { transform: b + ' scale(2.4)', opacity: 0 },
        { transform: b + ' scale(1)', opacity: 1, offset: 0.2 },
        { transform: b + ' scale(1)', opacity: 1, offset: 0.85 },
        { transform: b + ' scale(1)', opacity: 0 },
      ],
      { duration: this.d(big ? 1800 : 1400), easing: 'cubic-bezier(.6,0,.8,1)', fill: 'forwards' },
    ).finished.then(() => e.remove(), () => e.remove());
    return e;
  }
  shards(c: Pt, r: number, col: string, n = 10) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const e = this.mk({ left: c.x + Math.cos(a) * r - 7 + 'px', top: c.y + Math.sin(a) * r - 2 + 'px', width: '14px', height: '4px', borderRadius: '2px', background: col, boxShadow: '0 0 8px ' + col, zIndex: 5 });
      e.animate([{ transform: `rotate(${a}rad) translateX(0)`, opacity: 1 }, { transform: `rotate(${a}rad) translateX(55px)`, opacity: 0 }], { duration: this.d(600), easing: 'ease-out', fill: 'forwards' }).finished.then(
        () => e.remove(),
        () => e.remove(),
      );
    }
  }
  projectile(a: Pt, b: Pt, label = '', glow = 'rgba(234,106,42,.7)') {
    const mx = (a.x + b.x) / 2;
    const my = Math.min(a.y, b.y) - 70;
    return this.fx(
      label,
      a.x,
      a.y,
      [
        { transform: 'translate(-50%,-50%) translate(0,0) scale(.5)' },
        { transform: `translate(-50%,-50%) translate(${mx - a.x}px,${my - a.y}px) scale(1.3)`, offset: 0.5 },
        { transform: `translate(-50%,-50%) translate(${b.x - a.x}px,${b.y - a.y}px) scale(1)` },
      ],
      480,
      'cubic-bezier(.4,0,.6,1)',
      {
        width: '28px',
        height: '28px',
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        font: '800 13px Manrope, sans-serif',
        color: '#3a1406',
        background: 'radial-gradient(circle,#fff 0%,#ffe0a0 30%,#ff8a3a 60%,rgba(234,106,42,0) 72%)',
        boxShadow: `0 0 34px 12px ${glow}`,
        zIndex: 7,
      },
    );
  }
  hit(el: Element | null, n: number, isPlayer: boolean) {
    const c = this.ctr(el);
    if (!c || !el) return;
    this.ring(c, '#ff8a3a');
    this.floatText(c, '−' + n, '#ff6b5a');
    this.shake(el);
    if (isPlayer) (el as HTMLElement).animate([{ boxShadow: '0 0 0 0 rgba(239,90,90,0)' }, { boxShadow: '0 0 0 6px #ef5a5a, 0 0 50px #ef5a5a' }, { boxShadow: '0 0 0 0 rgba(239,90,90,0)' }], { duration: this.d(700) });
  }
  lunge(el: HTMLElement | null, target: Element | null, frac = 0.55) {
    if (!el || !target) return Promise.resolve();
    const a = this.ctr(el);
    const b = this.ctr(target);
    if (!a || !b) return Promise.resolve();
    const dx = (b.x - a.x) * frac;
    const dy = (b.y - a.y) * frac;
    el.style.zIndex = '20';
    setTimeout(() => (el.style.zIndex = ''), this.d(720));
    el.animate(
      [
        { transform: 'translate(0,0) scale(1)' },
        { transform: `translate(${-dx * 0.1}px,${-dy * 0.1}px) scale(1.03)`, offset: 0.25 },
        { transform: `translate(${dx}px,${dy}px) scale(1.12)`, offset: 0.55 },
        { transform: 'translate(0,0) scale(1)' },
      ],
      { duration: this.d(700), easing: 'cubic-bezier(.5,0,.3,1)' },
    );
    return this.wait(385);
  }
  banner(text: string, color: string) {
    const w = this.root.clientWidth;
    const h = this.root.clientHeight;
    return this.fx(
      text,
      w / 2,
      h / 2,
      [
        { transform: 'translate(-50%,-50%) scale(.85)', opacity: 0, letterSpacing: '.05em' },
        { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.25 },
        { transform: 'translate(-50%,-50%) scale(1.02)', opacity: 1, offset: 0.7 },
        { transform: 'translate(-50%,-50%) scale(1.08)', opacity: 0, letterSpacing: '.2em' },
      ],
      1500,
      'ease-out',
      { font: '700 60px Cinzel, serif', color, whiteSpace: 'nowrap', textShadow: `0 4px 0 #000, 0 0 40px ${color}`, letterSpacing: '.1em', textTransform: 'uppercase', zIndex: 9 },
    );
  }
  ripple(c: Pt, col: string) {
    return this.fx('', c.x, c.y, [{ transform: 'translate(-50%,-50%) scale(.3)', opacity: 1 }, { transform: 'translate(-50%,-50%) scale(9)', opacity: 0 }], 1000, 'cubic-bezier(.2,.6,.4,1)', {
      width: '60px',
      height: '60px',
      borderRadius: '50%',
      border: '2px solid ' + col,
      boxShadow: `0 0 30px ${col}, inset 0 0 30px ${col}`,
    });
  }
  /** 3D flip of an element; `swap` runs at the half-way point (image already swapped by React if omitted). */
  flip(el: Element | null, dur = 560, halfOnly = true) {
    if (!el) return Promise.resolve();
    if (halfOnly)
      return this.A(el, [{ transform: 'perspective(700px) rotateY(-90deg)', filter: 'brightness(1.8)' }, { transform: 'perspective(700px) rotateY(0deg)', filter: 'none' }], dur / 2 + 120, { easing: 'ease-out', fill: 'none' });
    return this.A(el, [{ transform: 'perspective(700px) rotateY(0deg)' }, { transform: 'perspective(700px) rotateY(90deg)', offset: 0.5 }, { transform: 'perspective(700px) rotateY(0deg)' }], dur, { fill: 'none' });
  }

  /** A floating copy of a card image (or back) for zone transitions whose DOM node is gone. */
  ghost(b: Box, img: string | null, css: Record<string, any> = {}) {
    const e = this.mk({ left: b.x + 'px', top: b.y + 'px', width: b.w + 'px', height: b.h + 'px', borderRadius: '7px', background: '#1a212c', boxShadow: '0 10px 24px rgba(0,0,0,.6)', overflow: 'hidden', zIndex: 4, ...css });
    if (img) {
      const i = document.createElement('img');
      i.src = img;
      i.draggable = false;
      Object.assign(i.style, { width: '100%', height: '100%', display: 'block', objectFit: 'cover' });
      e.appendChild(i);
    } else e.className = 'fx-back';
    return e;
  }
  /** Move a ghost from its box to another box (centre-to-centre, scaled), with optional mid keyframe. */
  fly(e: HTMLElement, from: Box, to: Box, dur = 600, opts: { mid?: Keyframe; end?: Keyframe; start?: Keyframe; remove?: boolean } = {}) {
    const dx = to.x + to.w / 2 - (from.x + from.w / 2);
    const dy = to.y + to.h / 2 - (from.y + from.h / 2);
    const s = to.w / from.w;
    const frames: Keyframe[] = [{ transform: 'none', ...(opts.start ?? {}) }];
    if (opts.mid) frames.push({ offset: 0.42, ...opts.mid });
    frames.push({ transform: `translate(${dx}px,${dy}px) scale(${s})`, ...(opts.end ?? {}) });
    e.style.transformOrigin = '50% 50%';
    const p = e.animate(frames, { duration: this.d(dur), easing: 'cubic-bezier(.4,0,.3,1)', fill: 'forwards' }).finished.catch(() => undefined);
    if (opts.remove !== false) p.then(() => e.remove());
    return p;
  }
  bigNumFly(from: Pt, to: Pt, text: string, col: string) {
    return this.fx(
      text,
      from.x,
      from.y,
      [
        { transform: 'translate(-50%,-50%) scale(.6)', opacity: 0 },
        { transform: 'translate(-50%,-50%) scale(1.15)', opacity: 1, offset: 0.25 },
        { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.55 },
        { transform: `translate(-50%,-50%) translate(${to.x - from.x}px,${to.y - from.y}px) scale(.5)`, opacity: 0 },
      ],
      1300,
      'cubic-bezier(.5,0,.8,.5)',
      { font: '700 42px Cinzel, serif', color: col, textShadow: `0 3px 0 #000,0 0 18px ${col}`, zIndex: 7 },
    );
  }
}
