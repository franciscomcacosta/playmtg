/* Manaforge animated assets. Load once: <script src="./mf-assets.js"></script>
   Tags: mf-coin, mf-ember, mf-xp, mf-cardback, mf-frame, mf-foil, mf-rank, mf-pack, mf-loader
   Common attrs: size (px number or CSS length), motion ("idle" | "spin" (coin) | "hover" | "none")
   JS: MF.fly(kind, fromEl, toEl, {count, size, onDone}) · MF.pulse(el) · MF.setStill(bool) */
(() => {
  if (window.MF) return;
  const RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const len = v => v == null || v === '' ? null : (/^[\d.]+$/.test(v) ? v + 'px' : v);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const TAGS = [];
  const MF = window.MF = { still: false };

  const SQ = `:host{display:inline-block;flex:none;width:var(--s,24px);aspect-ratio:1;vertical-align:middle;container-type:inline-size;position:relative;line-height:0}
  *{box-sizing:border-box}.a{position:absolute}
  @keyframes rot{to{transform:rotate(360deg)}}
  @keyframes sweep{0%,58%{transform:translateX(-85%)}78%,100%{transform:translateX(85%)}}`;
  const STILL = `*,*::before,*::after{animation:none!important;transition:none!important}`;
  const HOVER = `:host(:not(:hover)) *,:host(:not(:hover)) *::before,:host(:not(:hover)) *::after{animation-play-state:paused!important}`;

  class Base extends HTMLElement {
    static get observedAttributes() { return ['size', 'motion', 'tone', 'color', 'finish', 'tier', 'division', 'label', 'art', 'name']; }
    connectedCallback() { if (!this.shadowRoot) this.attachShadow({ mode: 'open' }); this.render(); }
    attributeChangedCallback() { if (this.shadowRoot) this.render(); }
    get motion() { return RM || MF.still ? 'none' : (this.getAttribute('motion') || 'idle'); }
    attr(k, d) { const v = this.getAttribute(k); return v == null || v === '' ? d : v; }
    render() {
      const s = len(this.getAttribute('size'));
      if (!this._d) this._d = (-Math.random() * 6).toFixed(2) + 's';
      const m = this.motion;
      this.shadowRoot.innerHTML = `<style>${this.css()}:host{--d:${this._d};${s ? `--s:${s};` : ''}}${m === 'none' ? STILL : m === 'hover' ? HOVER : ''}</style>${this.html()}`;
    }
  }
  /* Pointer tracking for foil: listens on closest [data-tilt] (which also tilts) or the parent box */
  const TRACK = new WeakMap();
  const bindTrack = foil => {
    if (RM || foil._rec) return;
    const t = foil.closest('[data-tilt]') || foil.parentElement; if (!t) return;
    let rec = TRACK.get(t);
    if (!rec) {
      rec = { subs: new Set(), x: .5, y: .5, tx: .5, ty: .5, on: 0, ton: 0, raf: 0, anim: null, tilt: t.hasAttribute('data-tilt') };
      TRACK.set(t, rec);
      const loop = () => {
        rec.x += (rec.tx - rec.x) * .2; rec.y += (rec.ty - rec.y) * .2; rec.on += (rec.ton - rec.on) * .16;
        rec.subs.forEach(s => s.track(rec.x, rec.y, rec.on));
        if (rec.tilt && !MF.still) {
          const tr = `perspective(900px) rotateX(${((.5 - rec.y) * 18 * rec.on).toFixed(2)}deg) rotateY(${((rec.x - .5) * 22 * rec.on).toFixed(2)}deg) scale(${(1 + .045 * rec.on).toFixed(3)})`;
          if (!rec.anim) { rec.anim = t.animate([{ transform: tr }, { transform: tr }], { duration: 1, fill: 'both' }); rec.anim.pause(); }
          else rec.anim.effect.setKeyframes([{ transform: tr }, { transform: tr }]);
        }
        const settled = Math.abs(rec.tx - rec.x) < .002 && Math.abs(rec.ty - rec.y) < .002 && Math.abs(rec.ton - rec.on) < .004;
        if (settled) { rec.raf = 0; if (!rec.ton) { rec.anim && rec.anim.cancel(); rec.anim = null; rec.subs.forEach(s => s.track(.5, .5, 0)); } return; }
        rec.raf = requestAnimationFrame(loop);
      };
      const kick = () => { if (!rec.raf) rec.raf = requestAnimationFrame(loop); };
      t.addEventListener('pointermove', e => { const r = t.getBoundingClientRect(); rec.tx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); rec.ty = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)); rec.ton = 1; kick(); });
      t.addEventListener('pointerleave', () => { rec.tx = .5; rec.ty = .5; rec.ton = 0; kick(); });
    }
    rec.subs.add(foil); foil._rec = rec;
  };
  const unbindTrack = foil => { if (foil._rec) { foil._rec.subs.delete(foil); foil._rec = null; } };
  const foilTrack = (root, x, y, on, glare) => {
    const pw = root.querySelector('.pw'), gr = root.querySelector('.gr'); if (!pw) return;
    pw.style.transform = `translate(${((.5 - x) * 46).toFixed(1)}%,${((.5 - y) * 34).toFixed(1)}%)`;
    pw.style.filter = `brightness(${(1 + on * .7).toFixed(2)}) saturate(${(1 + on * .5).toFixed(2)})`;
    if (gr) { gr.style.opacity = (on * glare).toFixed(3); gr.style.background = `radial-gradient(circle at ${(x * 100).toFixed(1)}% ${(y * 100).toFixed(1)}%,rgba(255,250,235,.85),rgba(255,236,200,.25) 22%,transparent 50%)`; }
  };
  const FOILCSS = `.pw,.gr{position:absolute;inset:0}.gr{opacity:0;pointer-events:none}`;

  const def = (tag, cls) => { TAGS.push(tag); if (!customElements.get(tag)) customElements.define(tag, cls); };

  /* ---------- Gold coin ---------- */
  def('mf-coin', class extends Base {
    css() { return SQ + `
      .w{inset:0;perspective:320cqw}.c{inset:0;transform-style:preserve-3d}
      .f{inset:0;border-radius:50%;overflow:hidden;background:radial-gradient(circle at 35% 30%,#fff2c4,#e8b64a 45%,#8a5a14 100%);
        box-shadow:inset 0 0 0 6cqw #a8742a,inset 0 0 0 8.5cqw rgba(255,236,180,.55),inset 0 -6cqw 10cqw rgba(70,36,4,.55),0 3cqw 8cqw rgba(0,0,0,.35)}
      .r{inset:17cqw;border-radius:50%;box-shadow:inset 0 0 0 2.5cqw rgba(110,70,14,.45),0 1.5cqw 0 rgba(255,244,210,.4)}
      .g{left:50%;top:50%;width:30cqw;height:30cqw;margin:-15cqw;transform:rotate(45deg);background:linear-gradient(135deg,#fff8e0,#e2ad48 50%,#9a6418);
        box-shadow:inset 2cqw 2cqw 0 rgba(255,255,255,.55),inset -2.5cqw -2.5cqw 0 rgba(100,60,10,.55),0 0 0 2.5cqw rgba(110,70,14,.28)}
      .g::after{content:'';position:absolute;inset:33%;background:#b07a20;box-shadow:inset 1.2cqw 1.2cqw 0 rgba(80,48,6,.6)}
      .sh{inset:-30%;background:linear-gradient(115deg,transparent 42%,rgba(255,255,255,.85) 50%,transparent 58%);transform:translateX(-85%);animation:sweep 4.8s ease-in-out var(--d) infinite}
      .gl{left:8%;top:4%;width:38cqw;height:38cqw;transform:scale(0);animation:gl 4.8s ease-out var(--d) infinite;
        background:radial-gradient(circle,#fff 0 7%,transparent 9%),linear-gradient(0deg,transparent 47%,#fff 50%,transparent 53%),linear-gradient(90deg,transparent 47%,#fff 50%,transparent 53%);
        -webkit-mask:radial-gradient(circle,#000 0 12%,transparent 55%);mask:radial-gradient(circle,#000 0 12%,transparent 55%)}
      .f{transform:translateZ(4cqw)}.f.bk{transform:rotateY(180deg) translateZ(4cqw)}
      .l{inset:0;border-radius:50%;background:linear-gradient(90deg,#6b4410,#c8902e 50%,#6b4410)}
      :host(:not([motion=spin])) .l,:host(:not([motion=spin])) .bk{display:none}:host(:not([motion=spin])) .f{transform:none}
      @keyframes gl{0%,72%{transform:scale(0) rotate(0)}80%{transform:scale(1) rotate(45deg)}90%,100%{transform:scale(0) rotate(90deg)}}
      @keyframes flip{to{transform:rotateY(360deg)}}
      :host([motion=spin]) .c{animation:flip 1.6s linear infinite}
      :host([motion=spin]) .gl{display:none}
      @container (max-width:20px){.r{inset:15cqw}.gl{display:none}}`; }
    html() { const face = `<div class="a r"></div><div class="a g"></div><div class="a sh"></div>`, layers = [-3, -2, -1, 0, 1, 2, 3].map(z => `<div class="a l" style="transform:translateZ(${z}cqw)"></div>`).join(''); return `<div class="a w"><div class="a c">${layers}<div class="a f bk">${face}</div><div class="a f">${face}</div></div></div><div class="a gl"></div>`; }
  });

  /* ---------- Ember ---------- */
  def('mf-ember', class extends Base {
    css() { return SQ + `
      .gw{inset:0;border-radius:50%;background:radial-gradient(circle,rgba(240,122,58,.6),rgba(240,122,58,0) 66%);animation:fl 2.3s linear var(--d) infinite}
      .s{left:19%;right:19%;top:3%;bottom:3%;clip-path:polygon(50% 0,94% 42%,63% 100%,37% 100%,6% 42%);background:linear-gradient(160deg,#ffe0a8,#f07a3a 46%,#8a2a10)}
      .s::before{content:'';position:absolute;inset:0;background:linear-gradient(90deg,rgba(110,24,6,.42) 0 50%,transparent 50%)}
      .s::after{content:'';position:absolute;inset:0;clip-path:polygon(50% 0,94% 42%,50% 58%,6% 42%);background:linear-gradient(180deg,rgba(255,244,220,.7),rgba(255,190,130,.12))}
      .k{left:50%;top:60%;width:34cqw;height:34cqw;margin:-17cqw;border-radius:50%;background:radial-gradient(circle,#fff4dc,rgba(255,180,110,.55) 42%,rgba(255,180,110,0) 70%);mix-blend-mode:screen;animation:core 1.7s linear var(--d) infinite}
      .p{left:50%;top:30%;width:7cqw;height:7cqw;margin-left:-3.5cqw;border-radius:50%;background:#ffd8b8;box-shadow:0 0 4cqw #f07a3a;opacity:0;animation:up 2.4s ease-out infinite}
      .p:nth-child(4){--x:-22cqw;animation-delay:.2s}.p:nth-child(5){--x:18cqw;animation-delay:1s;width:5cqw;height:5cqw}.p:nth-child(6){--x:-4cqw;animation-delay:1.7s}
      @keyframes up{0%{transform:translate(0,0) scale(1);opacity:0}12%{opacity:1}100%{transform:translate(var(--x,0),-70cqw) scale(.2);opacity:0}}
      @keyframes fl{0%,100%{opacity:.85;transform:scale(1)}18%{opacity:.55;transform:scale(.9)}40%{opacity:1;transform:scale(1.08)}63%{opacity:.68;transform:scale(.96)}82%{opacity:.95}}
      @keyframes core{0%,100%{opacity:.9}27%{opacity:.45}52%{opacity:1}78%{opacity:.6}}
      @container (max-width:22px){.p{display:none}}`; }
    html() { return `<div class="a gw"></div><div class="a s"></div><div class="a k"></div><span class="a p"></span><span class="a p"></span><span class="a p"></span>`; }
  });

  /* ---------- XP orb ---------- */
  def('mf-xp', class extends Base {
    css() { return SQ + `
      .h{inset:0;border-radius:50%;background:radial-gradient(circle,rgba(255,170,100,.55) 38%,rgba(255,170,100,0) 70%);animation:br 2.6s ease-in-out var(--d) infinite}
      .o{inset:15%;border-radius:50%;overflow:hidden;background:radial-gradient(circle at 50% 58%,#fff6e6 0,#ffc890 22%,#f07a3a 52%,#8a2a10 82%,#3a0e04 100%);
        box-shadow:inset 0 -4cqw 8cqw rgba(40,8,0,.6),0 0 0 1.5cqw rgba(255,210,160,.3)}
      .w1,.w2{inset:-25%;border-radius:50%;filter:blur(1.5cqw)}
      .w1{background:conic-gradient(from 0deg,transparent 0 8%,rgba(255,246,226,.7) 17%,transparent 30% 52%,rgba(255,214,166,.55) 64%,transparent 78%);animation:rot 3.6s linear infinite}
      .w2{background:conic-gradient(from 90deg,transparent 0 20%,rgba(255,120,60,.55) 32%,transparent 45% 70%,rgba(255,236,200,.4) 82%,transparent 95%);animation:rot 6s linear infinite reverse}
      .hl{left:24%;top:13%;width:30%;height:19%;border-radius:50%;background:radial-gradient(ellipse,rgba(255,255,255,.9),rgba(255,255,255,0) 70%);transform:rotate(-28deg)}
      .ob{inset:3%;animation:rot 3s linear var(--d) infinite}
      .ob::before{content:'';position:absolute;left:50%;top:0;width:8cqw;height:8cqw;margin-left:-4cqw;border-radius:50%;background:#fff1dc;box-shadow:0 0 5cqw 1cqw #ffb070}
      .t{inset:0;display:grid;place-items:center;font:900 24cqw/1 Cinzel,serif;letter-spacing:-.02em;color:#5a1a06;text-shadow:0 0 3cqw rgba(255,240,220,.9)}
      @keyframes br{0%,100%{transform:scale(.94);opacity:.75}50%{transform:scale(1.06);opacity:1}}
      @container (max-width:22px){.ob{display:none}}`; }
    html() { const l = this.getAttribute('label'); return `<div class="a h"></div><div class="a o"><div class="a w1"></div><div class="a w2"></div><div class="a hl"></div></div>${l ? `<div class="a t">${l}</div>` : ''}<div class="a ob"></div>`; }
  });

  /* ---------- Card back (fills its box) ---------- */
  const BACK = { gold: ['#8a6a30', '#6b3a14'], lit: ['#f7dc9a', '#7a4418'], ember: ['#ffb070', '#8a2a10'] };
  def('mf-cardback', class extends Base {
    css() { const [ring, core] = BACK[this.attr('tone', 'gold')] || BACK.gold; return `
      :host{display:block;width:100%;height:100%;position:relative;container-type:inline-size;border-radius:inherit;--ring:${ring};--core:${core}}
      *{box-sizing:border-box}.a{position:absolute}
      @keyframes rot{to{transform:rotate(360deg)}}
      .b{inset:0;overflow:hidden;border-radius:inherit;background:#120a05;box-shadow:inset 0 0 0 3cqw #1e130a,inset 0 0 0 3.8cqw var(--ring)}
      .c{inset:9% 11%;border-radius:50%;border:1.4cqw solid var(--ring);background:radial-gradient(ellipse at 50% 50%,var(--core) 0 30%,#1a0e06 72%)}
      .w{left:50%;top:50%;width:64cqw;height:64cqw;margin:-32cqw;border-radius:50%;opacity:.8;animation:rot 80s linear infinite;
        background:repeating-conic-gradient(var(--ring) 0 1.4deg,transparent 1.4deg 10deg);
        -webkit-mask:radial-gradient(circle,transparent 0 62%,#000 63% 69%,transparent 70%);mask:radial-gradient(circle,transparent 0 62%,#000 63% 69%,transparent 70%)}
      .w2{left:50%;top:50%;width:40cqw;height:40cqw;margin:-20cqw;border-radius:50%;border:.8cqw dashed var(--ring);opacity:.55;animation:rot 50s linear infinite reverse}
      .g{left:50%;top:50%;width:14cqw;height:14cqw;margin:-7cqw;transform:rotate(45deg);background:linear-gradient(135deg,#fff4d6,var(--ring) 55%,#4a2c0c);animation:pg 3.2s ease-in-out infinite}
      .gs{left:50%;top:50%;width:5cqw;height:5cqw;margin:-2.5cqw;transform:rotate(45deg);background:var(--ring);opacity:.8}
      .gs.n{margin-top:-27cqw}.gs.s{margin-top:22cqw}.gs.e{margin-left:17cqw}.gs.wst{margin-left:-22cqw}
      .sh{inset:-40%;background:linear-gradient(120deg,transparent 44%,rgba(255,236,190,.28) 50%,transparent 56%);transform:translateX(-85%);animation:sweep 7s ease-in-out var(--d) infinite}
      .l{left:0;right:0;bottom:6.5%;text-align:center;font:700 8.5cqw/1 Cinzel,serif;letter-spacing:.18em;color:var(--ring)}
      @keyframes pg{0%,100%{box-shadow:0 0 3cqw rgba(240,169,59,.25)}50%{box-shadow:0 0 10cqw rgba(240,169,59,.7)}}
      @keyframes sweep{0%,58%{transform:translateX(-85%)}78%,100%{transform:translateX(85%)}}`; }
    html() { const l = this.getAttribute('label'); return `<div class="a b"><div class="a c"></div><div class="a w"></div><div class="a w2"></div><div class="a gs n"></div><div class="a gs s"></div><div class="a gs e"></div><div class="a gs wst"></div><div class="a g"></div><div class="a sh"></div>${l ? `<div class="a l">${l}</div>` : ''}</div>`; }
  });

  /* ---------- Card frame background (absolute layer; parent: position:relative;isolation:isolate) ---------- */
  const FR = { white: ['#f4ecd8', '#a89c80', '#e0d4b8'], blue: ['#5a8ac0', '#1e3a5e', '#4a74a6'], black: ['#6a6070', '#18141c', '#4a4250'], red: ['#d0603a', '#6b1e10', '#b0442a'], green: ['#6aa860', '#1e4a24', '#4a8a48'], gold: ['#e8c46a', '#8a6420', '#c9a050'], grey: ['#a8adb4', '#4a4e55', '#8a8f96'], ember: ['#ffb070', '#8a2a10', '#e07a3a'] };
  MF.frames = FR;
  const HOLO = `.ho{inset:-60%;mix-blend-mode:color-dodge;opacity:.75;background:linear-gradient(125deg,transparent 18%,rgba(255,176,112,.6) 28%,rgba(247,220,154,.7) 36%,rgba(126,240,184,.45) 44%,rgba(90,138,192,.55) 52%,rgba(255,150,110,.5) 60%,transparent 70%);animation:holo 5s ease-in-out var(--d) infinite alternate}
    @keyframes holo{from{transform:translate(-18%,-10%)}to{transform:translate(18%,10%)}}`;
  def('mf-frame', class extends Base {
    css() { const [a, b, c] = FR[this.attr('color', 'gold')] || FR.gold; return `
      :host{display:block;position:absolute;inset:0;z-index:-1;border-radius:inherit;overflow:hidden;pointer-events:none}
      .a{position:absolute}
      .b{inset:0;background:linear-gradient(160deg,${a},${b} 60%,${c})}
      .t{inset:0;background:repeating-linear-gradient(45deg,rgba(255,255,255,.035) 0 1px,transparent 1px 3px)}
      .sh{inset:-50%;background:linear-gradient(110deg,transparent 45%,rgba(255,255,255,.32) 50%,transparent 55%);transform:translateX(-85%);animation:sweep 8s ease-in-out var(--d) infinite}
      @keyframes sweep{0%,60%{transform:translateX(-85%)}80%,100%{transform:translateX(85%)}}
      ${HOLO}${FOILCSS}.gr{mix-blend-mode:overlay}`; }
    html() { return `<div class="a b"></div><div class="a t"></div><div class="a sh"></div>${this.foil ? '<div class="pw"><div class="a ho"></div></div><div class="gr"></div>' : ''}`; }
    get foil() { return this.getAttribute('finish') === 'foil'; }
    render() { super.render(); if (this.foil) bindTrack(this); else unbindTrack(this); }
    disconnectedCallback() { unbindTrack(this); }
    track(x, y, on) { foilTrack(this.shadowRoot, x, y, on, .9); }
  });

  /* ---------- Foil overlay (absolute, above art) ---------- */
  def('mf-foil', class extends Base {
    css() { return `:host{display:block;position:absolute;inset:0;z-index:2;border-radius:inherit;overflow:hidden;pointer-events:none;mix-blend-mode:color-dodge}
      .a{position:absolute}${HOLO}.ho{mix-blend-mode:normal;opacity:${this.attr('tone', 'rare') === 'mythic' ? .55 : .35}}
      .sp{inset:0;background:radial-gradient(circle at 20% 30%,rgba(255,255,255,.9) 0 .6px,transparent 1.2px),radial-gradient(circle at 70% 60%,rgba(255,255,255,.8) 0 .6px,transparent 1.2px),radial-gradient(circle at 45% 85%,rgba(255,255,255,.8) 0 .6px,transparent 1.2px);background-size:23px 29px,31px 23px,19px 37px;animation:tw 2.4s ease-in-out infinite alternate;opacity:.6}
      @keyframes tw{from{opacity:.2}to{opacity:.8}}${FOILCSS}`; }
    html() { return `<div class="pw"><div class="a ho"></div></div><div class="a sp"></div><div class="gr"></div>`; }
    render() { super.render(); bindTrack(this); }
    disconnectedCallback() { unbindTrack(this); }
    track(x, y, on) { foilTrack(this.shadowRoot, x, y, on, .7); const sp = this.shadowRoot.querySelector('.sp'); if (sp) sp.style.filter = `brightness(${(1 + on * 1.5).toFixed(2)})`; }
  });

  /* ---------- Rank crest ---------- */
  const RK = { bronze: ['#f0b888', '#a0582a', '#4a2410'], silver: ['#f4f6f9', '#9aa3b0', '#3e434b'], gold: ['#fff2c4', '#e8b64a', '#7a4e10'], platinum: ['#dcfff0', '#6cc8a2', '#1a4636'], mythic: ['#ffe0a8', '#f07a3a', '#7a200a'] };
  const ROMAN = ['', 'I', 'II', 'III', 'IV'];
  def('mf-rank', class extends Base {
    css() { const t = this.attr('tier', 'gold'), [a, b, c] = RK[t] || RK.gold, hi = ['gold', 'platinum', 'mythic'].includes(t); return SQ + `
      :host{width:var(--s,48px)}
      .hal{inset:-6%;border-radius:50%;background:conic-gradient(from 0deg,rgba(240,122,58,0),rgba(255,176,112,.55),rgba(240,122,58,0) 40%,rgba(255,224,168,.45) 70%,rgba(240,122,58,0));filter:blur(3cqw);animation:rot 5s linear infinite}
      .o{inset:13%;transform:rotate(45deg);border-radius:5cqw;overflow:hidden;background:linear-gradient(135deg,${a},${b} 50%,${c});
        box-shadow:inset 0 0 0 2.5cqw rgba(0,0,0,.3),inset 0 0 0 4.5cqw rgba(255,255,255,.22),0 4cqw 10cqw rgba(0,0,0,.6)}
      .sh{inset:-40%;background:linear-gradient(90deg,transparent 42%,rgba(255,255,255,.7) 50%,transparent 58%);transform:translateX(-85%);animation:sweep 5.5s ease-in-out var(--d) infinite}
      .i{inset:27%;transform:rotate(45deg);border-radius:2.5cqw;background:radial-gradient(circle at 40% 35%,#2a2016,#0e0b08);box-shadow:inset 0 0 0 1.8cqw ${b}}
      .p{left:50%;top:1%;width:13cqw;height:13cqw;margin-left:-6.5cqw;transform:rotate(45deg);background:linear-gradient(135deg,${a},${b});box-shadow:0 0 0 1.2cqw rgba(0,0,0,.4)}
      .wl,.wr{top:50%;width:11cqw;height:11cqw;margin-top:-5.5cqw;transform:rotate(45deg);background:linear-gradient(135deg,${a},${b});box-shadow:0 0 0 1.2cqw rgba(0,0,0,.4)}
      .wl{left:0}.wr{right:0}
      .n{inset:0;display:grid;place-items:center;font:800 17cqw/1 Cinzel,serif;color:${a};text-shadow:0 0 5cqw ${b}}
      .f{left:50%;bottom:62%;width:9cqw;height:20cqw;margin-left:-4.5cqw;transform-origin:50% 100%;clip-path:polygon(50% 0,100% 60%,50% 100%,0 60%);background:linear-gradient(180deg,#ffe0a8,#f07a3a);animation:fk 1.1s ease-in-out infinite alternate}
      .f.l{transform:rotate(-38deg);margin-left:-14cqw;height:15cqw;animation-delay:.3s}.f.r{transform:rotate(38deg);margin-left:5cqw;height:15cqw;animation-delay:.6s}
      @keyframes fk{from{filter:brightness(1);scale:1 .85}to{filter:brightness(1.3);scale:1 1.1}}
      ${hi ? '' : '.p,.wl,.wr{display:none}'}${t === 'mythic' ? '' : '.hal,.f{display:none}'}`; }
    html() { const d = ROMAN[+this.attr('division', 0)] || ''; return `<div class="a hal"></div><span class="a f l"></span><span class="a f r"></span><span class="a f"></span><div class="a o"><div class="a sh"></div></div><div class="a p"></div><div class="a wl"></div><div class="a wr"></div><div class="a i"></div><div class="a n">${d}</div>`; }
  });

  /* ---------- Booster pack (fills its box) ---------- */
  const zig = (n, d) => { const t = [], b = []; for (let i = 0; i <= n * 2; i++) { const x = (i / (n * 2) * 100).toFixed(2); t.push(`${x}% ${i % 2 ? d : 0}%`); b.unshift(`${x}% ${i % 2 ? 100 - d : 100}%`); } return `polygon(${t.concat(b).join(',')})`; };
  def('mf-pack', class extends Base {
    css() { const [a, b, c] = FR[this.attr('color', 'blue')] || FR.blue; return `
      :host{display:block;width:100%;height:100%;position:relative;container-type:inline-size}
      .a{position:absolute}
      .w{inset:0;transition:transform .35s cubic-bezier(.2,.8,.2,1);filter:drop-shadow(0 6cqw 10cqw rgba(0,0,0,.7))}
      :host(:hover) .w{transform:translateY(-4%) rotate(-2deg)}
      .p{inset:0;clip-path:${zig(11, 2.2)};background:linear-gradient(160deg,${a},${b} 60%,${c});overflow:hidden}
      .cr{left:0;right:0;height:8%;background:repeating-linear-gradient(90deg,rgba(0,0,0,.28) 0 1.5cqw,rgba(255,255,255,.12) 1.5cqw 3.5cqw)}
      .cr.t{top:0}.cr.b{bottom:0}
      .ar{left:7%;right:7%;top:12%;bottom:24%;background:#1a1f27 var(--art) center 30%/cover;box-shadow:inset 0 0 0 .8cqw rgba(0,0,0,.6),0 0 0 1cqw rgba(255,255,255,.18)}
      .n{left:0;right:0;bottom:11%;text-align:center;font:800 11cqw/1 Cinzel,serif;letter-spacing:.14em;color:#f4efe4;text-shadow:0 1cqw 3cqw rgba(0,0,0,.8)}
      .sh{inset:-50%;background:linear-gradient(110deg,transparent 45%,rgba(255,255,255,.4) 50%,transparent 55%);transform:translateX(-85%);animation:sweep 5s ease-in-out var(--d) infinite}
      @keyframes sweep{0%,58%{transform:translateX(-85%)}78%,100%{transform:translateX(85%)}}
      ${HOLO}.ho{opacity:.4}`; }
    html() { const art = this.getAttribute('art'), n = this.getAttribute('name'); return `<div class="a w"><div class="a p" style="${art ? `--art:url('${art.replace(/'/g, '%27')}')` : ''}"><div class="a ar"></div><div class="a ho"></div><div class="a cr t"></div><div class="a cr b"></div>${n ? `<div class="a n">${n}</div>` : ''}<div class="a sh"></div></div></div>`; }
  });

  /* ---------- Loader ---------- */
  def('mf-loader', class extends Base {
    css() { return SQ + `:host{width:var(--s,40px)}
      .d{inset:20%;border:5cqw solid #f0a93b;transform:rotate(45deg);box-shadow:0 0 14cqw rgba(240,169,59,.4);animation:sp 1.4s cubic-bezier(.6,0,.4,1) infinite}
      .g{inset:40%;transform:rotate(45deg);background:linear-gradient(135deg,#f7dc9a,#b8621a);animation:pu 1.4s ease-in-out infinite}
      .o{inset:0;animation:rot 2.2s linear infinite}.o::before,.o::after{content:'';position:absolute;left:50%;top:0;width:7cqw;height:7cqw;margin-left:-3.5cqw;border-radius:50%;background:#ffd8a0;box-shadow:0 0 5cqw #f0a93b}
      .o::after{top:auto;bottom:0;opacity:.5}
      @keyframes sp{from{transform:rotate(45deg)}to{transform:rotate(405deg)}}
      @keyframes pu{0%,100%{transform:rotate(45deg) scale(.7);opacity:.7}50%{transform:rotate(45deg) scale(1.1);opacity:1}}`; }
    html() { return `<div class="a o"></div><div class="a d"></div><div class="a g"></div>`; }
  });

  /* ---------- Booster opening (fills its box): drag across the top to tear, cards fan out, tap to flip ----------
     attrs: art, name, sub, color, cards='[{"img":url,"rarity":"common|uncommon|rare|mythic"}]'
     methods: reset(), revealAll() · events: mf-torn, mf-opened */
  const RCOL = { common: '#9aa3ae', uncommon: '#c9d6e6', rare: '#e8c46a', mythic: '#f07a3a' };
  def('mf-booster', class extends HTMLElement {
    static get observedAttributes() { return ['art', 'name', 'sub', 'color', 'cards', 'set']; }
    connectedCallback() {
      if (!this.shadowRoot) { this.attachShadow({ mode: 'open' }); this.build(); }
      if (!this._ro) { this._ro = new ResizeObserver(() => this.layout()); this._ro.observe(this); }
    }
    disconnectedCallback() { this._ro && this._ro.disconnect(); this._ro = null; }
    attributeChangedCallback() { if (this.shadowRoot && this.stage === 'idle') { this.build(); this.layout(); } }
    get cards() { try { return JSON.parse(this.getAttribute('cards') || '[]'); } catch (e) { return []; } }
    D(ms) { return RM || MF.still ? 1 : ms; }
    $(s) { return this.shadowRoot.querySelector(s); }
    build() {
      this.stage = 'idle'; this.p = 0; this.flipped = 0; this._revealAfter = false;
      const [a, b, c] = FR[this.getAttribute('color') || 'blue'] || FR.blue;
      const art = this.getAttribute('art'), name = this.getAttribute('name') || 'DRAFT NIGHT', sub = this.getAttribute('sub') || 'DRAFT BOOSTER';
      const T = 15, n = 11, d = 2.2, P = ([x, y]) => `${x}% ${y}%`;
      const tear = []; for (let i = 0; i <= 25; i++) tear.push([i * 4, +(T + (i % 2 ? rnd(.5, 1.6) : -rnd(.2, 1.3))).toFixed(2)]);
      const topE = [], botE = []; for (let i = 0; i <= n * 2; i++) { const x = +(i / (n * 2) * 100).toFixed(2); topE.push([x, i % 2 ? d : 0]); botE.unshift([x, i % 2 ? 100 - d : 100]); }
      const topPoly = `polygon(${[...topE, ...[...tear].reverse()].map(P).join(',')})`, bodyPoly = `polygon(${[...tear, ...botE].map(P).join(',')})`;
      const esc = u => (u || '').replace(/'/g, '%27');
      const face = `<div class="a fc"><div class="a ar"${art ? ` style="background-image:url('${esc(art)}')"` : ''}></div><div class="a tsh"></div><div class="a bsh"></div><div class="a ho"></div><div class="a cr t"></div><div class="a cr b"></div>${this.getAttribute('set') ? `<img class="a sy" alt="" src="https://svgs.scryfall.io/sets/${this.getAttribute('set')}.svg">` : ''}<div class="a nm">${name}</div><div class="a sb">${sub}</div><div class="a sh"></div></div>`;
      const cards = this.cards;
      this.shadowRoot.innerHTML = `<style>
        :host{display:block;position:relative;width:100%;height:100%;min-height:320px;user-select:none;-webkit-user-select:none;touch-action:none}
        *{box-sizing:border-box}.a{position:absolute}.st,.cds{inset:0}
        .pk{filter:drop-shadow(0 20px 30px rgba(0,0,0,.75));cursor:grab;animation:bob 3.2s ease-in-out infinite}
        .pk.go{animation:none;cursor:grabbing}
        @keyframes bob{0%,100%{translate:0 0;rotate:-1.2deg}50%{translate:0 -7px;rotate:1.2deg}}
        .bd,.tp{inset:0}
        .fc{inset:0;overflow:hidden;background:linear-gradient(160deg,${a},${b} 60%,${c})}
        .fc::after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,.3),rgba(0,0,0,0) 12%,rgba(255,255,255,.06) 50%,rgba(0,0,0,0) 88%,rgba(0,0,0,.35))}
        .ar{left:0;right:0;top:7%;bottom:7%;background:#1a1f27 center 30%/cover}
        .tsh{left:0;right:0;top:7%;height:36%;background:linear-gradient(180deg,rgba(0,0,0,.15),rgba(5,6,7,.75) 45%,rgba(5,6,7,0))}
        .bsh{left:0;right:0;bottom:7%;height:26%;background:linear-gradient(0deg,${b},rgba(0,0,0,0))}
        .cr{left:0;right:0;height:8%;background:repeating-linear-gradient(90deg,rgba(0,0,0,.3) 0 2px,rgba(255,255,255,.14) 2px 5px),linear-gradient(180deg,${a},${b})}.cr.t{top:0}.cr.b{bottom:0}
        .sy{left:50%;top:18%;width:16%;aspect-ratio:1;margin-left:-8%;object-fit:contain;filter:invert(86%) sepia(38%) saturate(520%) hue-rotate(350deg) brightness(1.02) drop-shadow(0 2px 4px rgba(0,0,0,.8))}
        .nm{left:4%;right:4%;top:29%;text-align:center;font:800 var(--nf,18px)/1.05 Cinzel,serif;letter-spacing:.08em;color:#f6f0e2;text-shadow:0 2px 8px rgba(0,0,0,.9);text-wrap:balance}
        .sb{left:0;right:0;bottom:11%;text-align:center;font:800 var(--sf,9px)/1 Manrope,sans-serif;letter-spacing:.22em;color:#f6f0e2;text-shadow:0 1px 4px rgba(0,0,0,.8)}
        .sh{inset:-50%;background:linear-gradient(110deg,transparent 45%,rgba(255,255,255,.4) 50%,transparent 55%);transform:translateX(-85%);animation:sweep 5s ease-in-out infinite}
        @keyframes sweep{0%,58%{transform:translateX(-85%)}78%,100%{transform:translateX(85%)}}
        ${HOLO}.ho{opacity:.35}
        .lip{left:0;right:0;height:7%;background:linear-gradient(180deg,rgba(0,0,0,.9),rgba(0,0,0,0));opacity:0;transition:opacity .3s}
        .gd{left:7%;right:7%;height:0;border-top:1.5px dashed rgba(255,244,220,.6);transition:opacity .2s;pointer-events:none}
        .gd::after{content:'';position:absolute;left:0;top:-4.5px;width:8px;height:8px;border-radius:50%;background:#fff4dc;box-shadow:0 0 10px 2px #f0a93b;animation:run 1.8s ease-in-out infinite}
        @keyframes run{0%{left:0;opacity:0}15%,85%{opacity:1}100%{left:100%;opacity:0}}
        .spk{width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:radial-gradient(circle,#fff,rgba(255,200,140,.85) 35%,rgba(255,200,140,0) 70%);opacity:0;pointer-events:none}
        .hint{left:0;right:0;bottom:0;text-align:center;font:700 12px/1.4 Manrope,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#8d98a8;transition:opacity .3s;pointer-events:none}
        .cd{perspective:1400px}.cd.can{cursor:pointer}.cd.can:hover .in{filter:brightness(1.15)}
        .in{inset:0;transform-style:preserve-3d}
        .bk,.fr{inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden;border-radius:4.5%;overflow:hidden;box-shadow:0 10px 24px rgba(0,0,0,.6)}
        .fr{transform:rotateY(180deg);background:#111 center/cover;isolation:isolate}
        .gw{inset:-8%;border-radius:12%;background:radial-gradient(closest-side,var(--rc),rgba(0,0,0,0));opacity:0;filter:blur(8px)}
        .cd.lit .gw{animation:gp 1.6s ease-in-out infinite}
        @keyframes gp{0%,100%{opacity:.3}50%{opacity:.85}}
        ${RM || MF.still ? STILL : ''}
      </style>
      <div class="a st">
        <div class="a cds">${cards.map((c, i) => `<div class="a cd" data-i="${i}" style="--rc:${RCOL[c.rarity] || RCOL.common}"><div class="a gw"></div><div class="a in"><div class="a bk"><mf-cardback motion="none"></mf-cardback></div><div class="a fr" style="background-image:url('${esc(c.img)}')">${c.rarity === 'rare' || c.rarity === 'mythic' ? `<mf-foil tone="${c.rarity === 'mythic' ? 'mythic' : 'rare'}"></mf-foil>` : ''}</div></div></div>`).join('')}</div>
        <div class="a pk">
          <div class="a bd" style="clip-path:${bodyPoly}">${face}<div class="a lip" style="top:${T - 1}%"></div></div>
          <div class="a tp" style="clip-path:${topPoly};transform-origin:100% ${T}%">${face}</div>
          <div class="a gd" style="top:${T}%"></div><div class="a spk" style="top:${T}%"></div>
        </div>
        <div class="a hint">Drag across the top to tear it open</div>
      </div>`;
      this.cardEls = [...this.shadowRoot.querySelectorAll('.cd')];
      const pk = this.$('.pk');
      const end = cancel => { const dr = this.drag; if (!dr) return; this.drag = null; if (!cancel && (!dr.moved || this.p > .4)) this.autoTear(); else this.springBack(); };
      pk.addEventListener('pointerdown', e => { if (this.stage !== 'idle') return; this.drag = { x: e.clientX, moved: false }; try { pk.setPointerCapture(e.pointerId); } catch (_) {} pk.classList.add('go'); });
      pk.addEventListener('pointermove', e => { if (!this.drag) return; const dx = e.clientX - this.drag.x; if (Math.abs(dx) > 5) this.drag.moved = true; this.setP(Math.max(0, Math.min(1, dx / (this.g.pw * .9)))); if (this.p >= 1) { this.drag = null; this.complete(); } });
      pk.addEventListener('pointerup', () => end(false));
      pk.addEventListener('pointercancel', () => end(true));
      this.cardEls.forEach((el, i) => el.addEventListener('click', () => this.flip(i)));
      this.layout();
    }
    layout() {
      const r = this.getBoundingClientRect(), W = r.width, H = r.height; if (!W || !H || !this.shadowRoot) return;
      const ph = Math.min(H * .7, W * .5 / .62, 440), pw = ph * .62, cw = pw * .84;
      this.g = { W, H, ph, pw, cw, ch: cw * 88 / 63, L: (W - pw) / 2, Tp: (H - ph) / 2 - H * .03 };
      const g = this.g, pk = this.$('.pk');
      Object.assign(pk.style, { left: g.L + 'px', top: g.Tp + 'px', width: pw + 'px', height: ph + 'px' });
      pk.style.setProperty('--nf', (ph * .052).toFixed(1) + 'px'); pk.style.setProperty('--sf', (ph * .024).toFixed(1) + 'px');
      this.cardEls.forEach(el => Object.assign(el.style, { left: (W / 2 - cw / 2) + 'px', top: (g.Tp + ph * .2) + 'px', width: cw + 'px', height: g.ch + 'px' }));
      if (this.stage === 'fanned') this.placeFan(false);
    }
    setP(p) {
      this.p = p;
      this.$('.tp').style.transform = `translate(${(-p * 2).toFixed(2)}%,${(-p * 6).toFixed(2)}%) rotate(${(-p * 10).toFixed(2)}deg)`;
      const s = this.$('.spk'); s.style.left = (7 + p * 86) + '%'; s.style.opacity = p > .02 && p < .98 ? 1 : 0;
      this.$('.gd').style.opacity = Math.max(0, 1 - p * 3); this.$('.hint').style.opacity = 1 - p;
    }
    tween(to, ms, done) {
      const from = this.p, t0 = performance.now(), dur = this.D(ms);
      const step = now => { const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 2); this.setP(from + (to - from) * e); if (k < 1) requestAnimationFrame(step); else done && done(); };
      requestAnimationFrame(step);
    }
    autoTear() { if (this.stage !== 'idle') return; this.$('.pk').classList.add('go'); this.tween(1, 420 * (1 - this.p) + 80, () => this.complete()); }
    springBack() { this.tween(0, 260, () => { if (this.stage === 'idle') this.$('.pk').classList.remove('go'); }); }
    complete() {
      if (this.stage !== 'idle') return; this.stage = 'torn';
      const tp = this.$('.tp'), pk = this.$('.pk');
      this.$('.spk').style.opacity = 0; this.$('.gd').style.opacity = 0; this.$('.hint').style.opacity = 0;
      tp.animate([{ transform: tp.style.transform, opacity: 1 }, { transform: 'translate(55%,-180%) rotate(-48deg)', opacity: 0 }], { duration: this.D(800), easing: 'cubic-bezier(.25,.6,.35,1)', fill: 'forwards' });
      this.$('.lip').style.opacity = 1;
      pk.animate([{ translate: '0 0' }, { translate: '0 10px' }, { translate: '0 0' }], { duration: this.D(320), easing: 'ease-out' });
      this.dispatchEvent(new CustomEvent('mf-torn', { bubbles: true }));
      setTimeout(() => this.rise(), this.D(360));
    }
    rise() {
      const { ph } = this.g;
      this.cardEls.forEach((el, i) => el.animate([{ transform: 'translateY(0)' }, { transform: `translateY(${-ph * .5 - i * 3}px)` }], { duration: this.D(700), delay: this.D(i * 35), easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'forwards' }));
      setTimeout(() => this.fan(), this.D(950));
    }
    fan() {
      this.stage = 'fanned';
      const pk = this.$('.pk'); pk.style.pointerEvents = 'none';
      pk.animate([{ opacity: 1, translate: '0 0' }, { opacity: 0, translate: '0 55%' }], { duration: this.D(650), easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' });
      this.placeFan(true);
      const h = this.$('.hint'); h.textContent = 'Tap a card to flip it'; setTimeout(() => { h.style.opacity = 1; }, this.D(700));
      const cards = this.cards;
      this.cardEls.forEach((el, i) => { el.classList.add('can'); if (cards[i] && (cards[i].rarity === 'rare' || cards[i].rarity === 'mythic')) el.classList.add('lit'); });
      if (this._revealAfter) setTimeout(() => this.revealAll(), this.D(900));
    }
    placeFan(anim) {
      const { W, H, cw, ch, ph, Tp } = this.g, n = this.cardEls.length, mid = (n - 1) / 2;
      const s = Math.min(1, (W * .94) / (n * cw * .9 + cw * .1), (H * .74) / ch), step = cw * s * .9;
      const dy0 = H * .45 - (Tp + ph * .2 + ch / 2);
      this.cardEls.forEach((el, i) => {
        const k = i - mid, t = `translate(${(k * step).toFixed(1)}px,${(dy0 + k * k * 6 * s).toFixed(1)}px) rotate(${(k * 3.5).toFixed(2)}deg) scale(${s.toFixed(3)})`;
        if (anim) {
          el.getAnimations().forEach(a => { try { a.commitStyles(); } catch (_) {} a.cancel(); });
          el.animate([{ transform: el.style.transform || `translateY(${-ph * .5}px)` }, { transform: t }], { duration: this.D(720), delay: this.D(i * 70), easing: 'cubic-bezier(.2,.9,.3,1.04)', fill: 'forwards' });
        } else { el.getAnimations().filter(a => !a.effect || a.effect.getKeyframes().some(f => f.transform)).forEach(a => a.cancel()); el.style.transform = t; }
      });
    }
    flip(i) {
      const el = this.cardEls[i]; if (this.stage !== 'fanned' || !el || el._flipped) return;
      el._flipped = true; el.classList.remove('can', 'lit');
      el.querySelector('.in').animate([{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(90deg) translateZ(50px)', offset: .5 }, { transform: 'rotateY(180deg)' }], { duration: this.D(600), easing: 'cubic-bezier(.3,.6,.3,1)', fill: 'forwards' });
      const c = this.cards[i] || {};
      if (c.rarity === 'rare' || c.rarity === 'mythic') {
        el.querySelector('.gw').animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: `scale(${c.rarity === 'mythic' ? 2 : 1.6})` }], { duration: this.D(1000), delay: this.D(300), easing: 'ease-out' });
        el.animate([{ scale: '1' }, { scale: '1.12' }, { scale: '1' }], { duration: this.D(650), delay: this.D(260), easing: 'cubic-bezier(.3,1.4,.5,1)' });
      }
      if (++this.flipped === this.cardEls.length) { this.$('.hint').style.opacity = 0; this.dispatchEvent(new CustomEvent('mf-opened', { bubbles: true })); }
    }
    revealAll() {
      if (this.stage !== 'fanned') { this._revealAfter = true; if (this.stage === 'idle') this.autoTear(); return; }
      this.cardEls.map((el, i) => i).filter(i => !this.cardEls[i]._flipped).forEach((i, k) => setTimeout(() => this.flip(i), this.D(k * 200)));
    }
    reset() { this.build(); }
  });

  /* ---------- Helpers ---------- */
  const KIND = { gold: 'mf-coin', embers: 'mf-ember', ember: 'mf-ember', xp: 'mf-xp' };
  MF.pulse = el => el && el.animate && el.animate([{ transform: 'scale(1)', filter: 'brightness(1)' }, { transform: 'scale(1.08)', filter: 'brightness(1.6)' }, { transform: 'scale(1)', filter: 'brightness(1)' }], { duration: 280, easing: 'ease-out' });
  MF.fly = (kind, from, to, o = {}) => {
    const done = () => { o.onDone && o.onDone(); };
    if (!from || !to) { done(); return Promise.resolve(); }
    if (RM || MF.still) { MF.pulse(to); done(); return Promise.resolve(); }
    const tag = KIND[kind] || 'mf-coin', size = o.size || 24, n = o.count || 8;
    const a = from.getBoundingClientRect(), tgt = to.querySelector(tag) || to, b = tgt.getBoundingClientRect();
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483000;overflow:visible';
    document.body.appendChild(host);
    const ex = b.left + b.width / 2 - size / 2, ey = b.top + b.height / 2 - size / 2;
    const jobs = Array.from({ length: n }, (_, i) => {
      const el = document.createElement(tag);
      el.setAttribute('size', size); if (tag === 'mf-coin') el.setAttribute('motion', 'spin');
      el.style.cssText = 'position:absolute;left:0;top:0;will-change:transform';
      host.appendChild(el);
      const sx = a.left + a.width / 2 - size / 2 + rnd(-a.width / 5, a.width / 5), sy = a.top + a.height / 2 - size / 2 + rnd(-a.height / 5, a.height / 5);
      const ang = rnd(0, Math.PI * 2), r = rnd(40, 110), mx = sx + Math.cos(ang) * r, my = sy + Math.sin(ang) * r * .7 - 30;
      return el.animate([
        { transform: `translate(${sx}px,${sy}px) scale(.3)`, opacity: 0 },
        { transform: `translate(${mx}px,${my}px) scale(1.15)`, opacity: 1, offset: .32, easing: 'cubic-bezier(.5,0,.75,0)' },
        { transform: `translate(${ex}px,${ey}px) scale(.75)`, opacity: 1 },
      ], { duration: rnd(820, 1080), delay: i * 50, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'both' }).finished.then(() => { el.remove(); MF.pulse(to); o.onEach && o.onEach(i); });
    });
    return Promise.all(jobs).then(() => { host.remove(); done(); });
  };
  MF.setStill = v => { MF.still = !!v; TAGS.forEach(t => document.querySelectorAll(t).forEach(e => e.render && e.render())); };
})();
