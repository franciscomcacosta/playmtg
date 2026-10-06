// Generated from the Claude Design file "Arcana Shop.dc.html" by conv.mjs, then wired to live data (see Shop.tsx).
import React from 'react';
import { css, pc, cx, str, show } from './dc';

export const ShopView_CSS = "html,body{margin:0;background:#07090c} a{color:#f0a93b;text-decoration:none} a:hover{color:#f5c77a} button{font-family:inherit}";

export function ShopView({ v }: { v: any }) {
  return (
    <>
<div ref={v.rootRef} style={css("position:relative;min-height:100vh;overflow-x:hidden;display:flex;flex-direction:column;color:#e7ebf1;font-family:Manrope,system-ui,sans-serif;background:radial-gradient(900px 520px at 62% -8%,rgba(255,176,96,.16),rgba(255,176,96,0) 70%),radial-gradient(1400px 900px at 50% 40%,#151a21 0%,#0a0d11 65%,#050608 100%)")}>
<div style={css("position:absolute;inset:0;pointer-events:none;opacity:.55;background:url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22220%22 height=%22220%22%3E%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%22.9%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3CfeColorMatrix values=%220 0 0 0 1 0 0 0 0 .9 0 0 0 0 .8 0 0 0 .07 0%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22/%3E%3C/svg%3E')")} />
<div style={css("position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 0 220px 40px rgba(0,0,0,.85)")} />
<header data-in="0" style={css("position:relative;z-index:20;display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap;padding:18px 36px")}>
<div style={css("display:flex;align-items:center;gap:34px;flex-wrap:wrap")}>
<a href="/" style={css("font-family:Cinzel,serif;font-size:19px;font-weight:800;letter-spacing:.34em;white-space:nowrap;color:#f7dc9a;text-shadow:0 2px 12px rgba(0,0,0,.8)")}>{"PLAYMTG"}</a>
<nav aria-label="Main" style={css("display:flex;align-items:center;gap:4px")}>
<a href="/" style={css("padding:10px 14px;font-family:Cinzel,serif;font-size:12px;font-weight:700;letter-spacing:.18em;color:#9aa3b0")} className={cx('', pc([['hover', "color:#e8cf9a"]]))}>{"HOME"}</a>
<a href="/decks" style={css("padding:10px 14px;font-family:Cinzel,serif;font-size:12px;font-weight:700;letter-spacing:.18em;color:#9aa3b0")} className={cx('', pc([['hover', "color:#e8cf9a"]]))}>{"DECKS"}</a>
<a href="/shop" aria-current="page" style={css("position:relative;padding:10px 14px;font-family:Cinzel,serif;font-size:12px;font-weight:700;letter-spacing:.18em;color:#f7dc9a")}>{"SHOP"}<span style={css("position:absolute;left:50%;bottom:0;width:6px;height:6px;margin-left:-3px;transform:rotate(45deg);background:#f0a93b;box-shadow:0 0 10px rgba(240,169,59,.9)")} /></a>
</nav>
</div>
<div style={css("display:flex;align-items:center;gap:14px;flex-wrap:wrap")}>
<div data-cur="gold" style={css("display:flex;align-items:center;gap:8px;height:34px;padding:0 6px 0 4px;border-radius:17px;background:rgba(5,6,7,.7);box-shadow:inset 0 0 0 1px rgba(201,160,80,.4)")}>
<mf-coin size={"26"}></mf-coin>
<span style={css("font-size:14px;font-weight:800;font-variant-numeric:tabular-nums;color:#f5e2b0")}>{show(v.goldTxt)}</span>
<a href="/treasury" aria-label="Get more gold" title="Get more gold" style={css("width:22px;height:22px;display:grid;place-items:center;border-radius:50%;background:rgba(240,169,59,.16);font-size:15px;font-weight:800;line-height:1;color:#f7dc9a")} className={cx('', pc([['hover', "background:rgba(240,169,59,.32)"]]))}>{"+"}</a>
</div>
<div data-cur="embers" style={css("display:flex;align-items:center;gap:6px;height:34px;padding:0 14px 0 4px;border-radius:17px;background:rgba(5,6,7,.7);box-shadow:inset 0 0 0 1px rgba(224,122,58,.4)")}>
<mf-ember size={"26"}></mf-ember>
<span style={css("font-size:14px;font-weight:800;font-variant-numeric:tabular-nums;color:#ffcfae")}>{show(v.embersTxt)}</span>
</div>
</div>
</header>
<section style={css("position:relative;z-index:3;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,440px),1fr));gap:24px;align-items:center;padding:0 36px 32px;flex:1")}>
<div style={css("display:flex;flex-direction:column;gap:22px;min-width:0;max-width:540px")}>
<div data-in="1" style={css("display:flex;align-items:center;gap:14px")}>
<span style={css("font-family:Cinzel,serif;font-size:12px;font-weight:700;letter-spacing:.34em;color:#c9a050")}>{"FEATURED"}</span>
<span style={css("width:48px;height:1px;background:linear-gradient(90deg,#c9a050,transparent)")} />
<span style={css("font-size:12px;font-weight:700;color:#8d98a8")}>{show(v.bundleLeft)}</span>
</div>
<h1 data-in="2" style={css("margin:0;font-family:Cinzel,serif;font-size:clamp(40px,4.6vw,68px);font-weight:700;line-height:.95;color:#f1e9ff;text-shadow:0 0 60px rgba(160,110,255,.35),0 6px 30px rgba(0,0,0,.7);text-wrap:balance")}>{show(v.bundleName)}</h1>
<div data-in="3" style={css("display:flex;flex-direction:column;border-top:1px solid rgba(255,255,255,.08)")}>
{(v.bundleRows ?? []).map((r: any, $index: number) => (<React.Fragment key={$index}>
<div style={css("display:grid;grid-template-columns:110px minmax(0,1fr);gap:16px;align-items:baseline;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.08)")}>
<span style={css("font-family:Cinzel,serif;font-size:11px;font-weight:700;letter-spacing:.2em;color:#8d98a8")}>{show(r.type)}</span>
<span style={css("font-size:15px;font-weight:700;color:#e7ebf1")}>{show(r.name)}</span>
</div>
</React.Fragment>))}
</div>
<div data-in="4" style={css("display:flex;align-items:center;gap:22px;flex-wrap:wrap")}>
<button onClick={v.buyBundle} disabled={v.bundle.disabled} style={css(`padding:2px;border:0;background:linear-gradient(180deg,#f7dc9a,#a8742a 50%,#f0c56a);clip-path:polygon(16px 0,calc(100% - 16px) 0,100% 50%,calc(100% - 16px) 100%,16px 100%,0 50%);cursor:pointer;filter:${str(v.bundle.filter)};transition:filter .2s,transform .12s`)} className={cx('', pc([['hover', "filter:brightness(1.12) drop-shadow(0 0 18px rgba(240,169,59,.55))"], ['active', "transform:scale(.97)"]]))}>
<span style={css("display:flex;align-items:center;gap:12px;padding:15px 40px;background:linear-gradient(180deg,#f5b44b,#b8621a);clip-path:polygon(15px 0,calc(100% - 15px) 0,100% 50%,calc(100% - 15px) 100%,15px 100%,0 50%);font-family:Cinzel,serif;font-size:15px;font-weight:800;letter-spacing:.12em;color:#1b1206;box-shadow:inset 0 2px 0 rgba(255,255,255,.3)")}>
<span style={css("white-space:nowrap")}>{show(v.bundle.label)}</span>
{(v.bundle.showPrice) ? (<>
<span style={css("display:flex;align-items:center;gap:7px;white-space:nowrap;padding-left:12px;border-left:1px solid rgba(27,18,6,.3)")}><mf-ember size={"20"}></mf-ember>{show(v.bundlePrice)}</span>
</>) : null}
</span>
</button>
{(v.bundle.showPrice) ? (<>
<div style={css("display:flex;flex-direction:column;gap:2px")}>
<span style={css("font-size:13px;font-weight:700;color:#8d98a8;text-decoration:line-through;text-decoration-color:#e0694f")}>{show(v.bundleSep)}</span>
<span style={css("font-size:13px;font-weight:800;white-space:nowrap;color:#ffb38a")}>{show(v.bundleSave)}</span>
</div>
</>) : null}
</div>
</div>
<div ref={v.matRef} style={css(`position:relative;height:${str(v.matH)}px;min-width:0;perspective:1500px;display:grid;place-items:center`)}>
<div style={css(`transform:scale(${str(v.matScale)})`)}>
<div style={css("position:absolute;left:50%;top:50%;width:720px;height:360px;margin:-150px 0 0 -360px;border-radius:50%;background:radial-gradient(closest-side,rgba(150,100,255,.18),rgba(150,100,255,0));filter:blur(20px);pointer-events:none")} />
<div data-mat="1" style={css("position:relative;width:620px;height:350px;flex:none;transform-style:preserve-3d;transform:rotateX(54deg) rotateZ(-14deg) translateY(-10px)")}>
<div style={css("position:absolute;inset:0;border-radius:14px;background-color:#1a1428;background-image:url('"+str(v.heroArt)+"');background-size:cover;background-position:center 30%;box-shadow:0 60px 80px rgba(0,0,0,.85),0 0 0 1px rgba(0,0,0,.6)")} />
<div style={css("position:absolute;inset:0;border-radius:14px;background:radial-gradient(ellipse at 35% 25%,rgba(255,210,150,.18),rgba(0,0,0,0) 55%),linear-gradient(0deg,rgba(10,6,20,.55),rgba(10,6,20,.05))")} />
<div style={css("position:absolute;inset:9px;border-radius:9px;border:1.5px dashed rgba(230,210,255,.35)")} />
<div style={css("position:absolute;left:44px;top:96px;width:96px;height:134px;border-radius:7px;transform:translateZ(1px) rotateZ(6deg);padding:4px;box-sizing:border-box;background:linear-gradient(160deg,#b88aff,#3a1a70);box-shadow:1px 1px 0 #2a1450,2px 2px 0 #2a1450,3px 3px 0 #22103f,4px 4px 0 #22103f,5px 5px 0 #1a0c30,6px 6px 0 #1a0c30,14px 16px 18px rgba(0,0,0,.6)")}>
<div style={css("width:100%;height:100%;border-radius:4px;box-sizing:border-box;border:3px solid #0e0620;background:repeating-linear-gradient(60deg,#1e0e3a 0 6px,#2a1450 6px 12px);display:grid;place-items:center")}><div style={css("width:58%;height:66%;border-radius:50%;background:radial-gradient(circle,#f0e0ff 0%,#9a5af0 50%,#1e0e3a 100%)")} /></div>
</div>
<div style={css("position:absolute;left:250px;top:70px;width:104px;height:145px;border-radius:7px;transform:translateZ(1px) rotateZ(-4deg);padding:4px;box-sizing:border-box;background:linear-gradient(160deg,#b88aff,#3a1a70);box-shadow:10px 14px 16px rgba(0,0,0,.55)")}>
<div style={css("width:100%;height:100%;border-radius:4px;background:#111 url('"+str(v.hero1)+"') center/cover")} />
<div style={css("position:absolute;inset:0;border-radius:7px;background:linear-gradient(115deg,rgba(255,255,255,0) 35%,rgba(255,255,255,.22) 48%,rgba(255,255,255,0) 58%)")} />
</div>
<div style={css("position:absolute;left:380px;top:90px;width:104px;height:145px;border-radius:7px;transform:translateZ(1px) rotateZ(10deg);padding:4px;box-sizing:border-box;background:linear-gradient(160deg,#b88aff,#3a1a70);box-shadow:10px 14px 16px rgba(0,0,0,.55)")}>
<div style={css("width:100%;height:100%;border-radius:4px;background:#111 url('"+str(v.hero2)+"') center/cover")} />
<div style={css("position:absolute;inset:0;border-radius:7px;background:linear-gradient(115deg,rgba(255,255,255,0) 35%,rgba(255,255,255,.22) 48%,rgba(255,255,255,0) 58%)")} />
</div>
</div>
</div>
</div>
</section>
<section style={css("position:relative;z-index:3;padding:0 36px;flex:none")}>
<div data-in="5" style={css("display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap;padding-bottom:14px")}>
<div style={css("display:flex;align-items:baseline;gap:18px;flex-wrap:wrap")}>
<span style={css("font-family:Cinzel,serif;font-size:30px;font-weight:700;color:#f4efe4")}>{"Today's stock"}</span>
<span style={css("display:flex;align-items:center;gap:8px;white-space:nowrap;font-size:13px;font-weight:700;color:#8d98a8")}>{"Restocks in "}<span style={css("font-family:Cinzel,serif;font-size:16px;font-weight:700;letter-spacing:.06em;font-variant-numeric:tabular-nums;color:#f7dc9a")}>{show(v.countdown)}</span></span>
</div>
</div>
<div ref={v.gridRef} style={css(`position:relative;display:grid;grid-template-columns:repeat(${str(v.stockCols)},minmax(0,1fr));gap:14px`)}>
{(v.items ?? []).map((i: any, $index: number) => (<React.Fragment key={$index}>
<div data-slot={i.id} style={css("position:relative;display:flex;flex-direction:column;border-radius:6px;overflow:hidden;background:linear-gradient(180deg,#141920,#0c0f14);box-shadow:0 1px 0 rgba(255,255,255,.05) inset,0 24px 40px rgba(0,0,0,.45)")}>
<div style={css(`position:absolute;left:0;right:0;top:0;height:2px;background:linear-gradient(90deg,rgba(0,0,0,0),${str(i.rc)},rgba(0,0,0,0))`)} />
<button onClick={i.open} onMouseMove={v.tiltMove} onMouseLeave={v.tiltLeave} style={css(`position:relative;height:clamp(170px,24vh,230px);padding:0;border:0;cursor:pointer;perspective:800px;display:grid;place-items:center;background:radial-gradient(ellipse 70% 80% at 50% -10%,${str(i.glow)},rgba(0,0,0,0) 70%)`)}>
<div style={css("position:absolute;left:50%;bottom:26px;width:170px;height:22px;margin-left:-85px;border-radius:50%;background:radial-gradient(closest-side,rgba(0,0,0,.85),rgba(0,0,0,0))")} />
<div data-tilt="1" style={css("position:relative;transform-style:preserve-3d;transition:transform .35s cubic-bezier(.2,.8,.2,1)")}>
{(i.isSleeve) ? (<>
<div style={css("position:relative;width:128px;height:178px")}>
<div style={css(`position:absolute;inset:0;border-radius:8px;background:${str(i.edge)};opacity:.55;transform:translate(-16px,6px) rotate(-8deg)`)} />
<div style={css(`position:absolute;inset:0;border-radius:8px;padding:5px;box-sizing:border-box;background:${str(i.edge)};box-shadow:0 18px 30px rgba(0,0,0,.6)`)}>
<div style={css(`width:100%;height:100%;border-radius:4px;background:#111 url('${str(i.art)}') center/cover`)} />
<div style={css("position:absolute;left:5px;right:5px;top:16px;height:1px;background:rgba(255,255,255,.35)")} />
<div data-glare="1" style={css("position:absolute;inset:0;border-radius:8px;background:linear-gradient(115deg,rgba(255,255,255,0) 30%,rgba(255,255,255,.28) 46%,rgba(255,255,255,0) 60%);background-size:220% 220%;background-position:30% 30%")} />
</div>
</div>
</>) : null}
{(i.isMat) ? (<>
<div style={css(`width:210px;height:118px;border-radius:8px;position:relative;transform:rotateX(46deg) rotateZ(-10deg);background:#111 url('${str(i.art)}') center/cover;box-shadow:0 30px 34px rgba(0,0,0,.75)`)}>
<div style={css("position:absolute;inset:0;border-radius:8px;background:radial-gradient(ellipse at 35% 25%,rgba(255,210,150,.2),rgba(0,0,0,0) 60%)")} />
<div style={css("position:absolute;inset:5px;border-radius:5px;border:1px dashed rgba(255,255,255,.4)")} />
</div>
</>) : null}
{(i.isBack) ? (<>
<div style={css(`position:relative;width:128px;height:178px;border-radius:8px;box-sizing:border-box;border:5px solid ${str(i.rim)};background:${str(i.pattern)};display:grid;place-items:center;box-shadow:0 18px 30px rgba(0,0,0,.6)`)}>
<div style={css(`width:62%;height:70%;border-radius:50%;background:${str(i.gem)};box-shadow:0 0 24px ${str(i.halo)}`)} />
<div data-glare="1" style={css("position:absolute;inset:0;border-radius:4px;background:linear-gradient(115deg,rgba(255,255,255,0) 30%,rgba(255,255,255,.16) 46%,rgba(255,255,255,0) 60%);background-size:220% 220%;background-position:30% 30%")} />
</div>
</>) : null}
{(i.isAvatar) ? (<>
<div style={css("position:relative;width:150px;height:150px")}>
<div style={css("position:absolute;inset:0;border-radius:50%;padding:4px;box-sizing:border-box;background:conic-gradient(from 20deg,#f7dc9a,#6b4e1e,#e8c46a,#4a3418,#f7dc9a);box-shadow:0 18px 30px rgba(0,0,0,.6)")}>
<div style={css(`width:100%;height:100%;border-radius:50%;background:#111 url('${str(i.art)}') center 20%/cover;box-shadow:inset 0 0 20px rgba(0,0,0,.6)`)} />
</div>
<span style={css("position:absolute;left:50%;top:-5px;width:10px;height:10px;margin-left:-5px;transform:rotate(45deg);background:#f7dc9a")} />
<span style={css("position:absolute;left:50%;bottom:-5px;width:10px;height:10px;margin-left:-5px;transform:rotate(45deg);background:#c9a050")} />
</div>
</>) : null}
</div>
{(i.owned) ? (<>
<div data-stamp={i.id} style={css("position:absolute;top:20px;right:14px;padding:5px 10px;border:2px double rgba(126,240,184,.8);border-radius:3px;transform:rotate(9deg);font-family:Cinzel,serif;font-size:12px;font-weight:800;letter-spacing:.2em;color:#9af5c8;background:rgba(6,20,14,.7)")}>{show(i.ownedLabel)}</div>
</>) : null}
</button>
<div style={css("display:flex;flex-direction:column;gap:12px;padding:14px 16px 16px;border-top:1px solid rgba(255,255,255,.05);background:linear-gradient(180deg,rgba(255,255,255,.02),rgba(255,255,255,0))")}>
<div style={css("display:flex;justify-content:space-between;align-items:center;gap:6px 8px;flex-wrap:wrap")}>
<span style={css(`display:flex;align-items:center;gap:7px;white-space:nowrap;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:${str(i.rc)}`)}><span style={css(`width:7px;height:7px;transform:rotate(45deg);background:${str(i.rc)}`)} />{show(i.rarity)}</span>
<span style={css("font-family:Cinzel,serif;font-size:10px;font-weight:700;letter-spacing:.2em;white-space:nowrap;color:#6b7688")}>{show(i.typeLabel)}</span>
</div>
<div style={css("display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap")}>
<span style={css("flex:1 1 90px;font-size:16px;font-weight:800;line-height:1.2;min-width:0;text-wrap:balance")}>{show(i.name)}</span>
<button onClick={i.act} disabled={i.disabled} style={css(`flex:none;padding:1px;border:0;background:${str(i.frame)};clip-path:polygon(8px 0,calc(100% - 8px) 0,100% 50%,calc(100% - 8px) 100%,8px 100%,0 50%);cursor:pointer;transition:filter .15s`)} className={cx('', pc([['hover', "filter:brightness(1.25)"]]))}>
<span style={css(`display:flex;align-items:center;gap:7px;height:32px;padding:0 16px;white-space:nowrap;background:${str(i.fill)};clip-path:polygon(8px 0,calc(100% - 8px) 0,100% 50%,calc(100% - 8px) 100%,8px 100%,0 50%);font-size:13px;font-weight:800;font-variant-numeric:tabular-nums;color:${str(i.tc)}`)}>
{(i.isGold) ? (<><mf-coin size={"14"}></mf-coin></>) : null}
{(i.isEmbers) ? (<><mf-ember size={"15"}></mf-ember></>) : null}{" "}{show(i.btn)}{" "}</span>
</button>
</div>
</div>
</div>
</React.Fragment>))}
</div>
</section>
{(v.hasOwned) ? (<><section style={css("position:relative;z-index:3;padding:28px 36px 0;flex:none")}>
<div data-in="5" style={css("display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap;padding-bottom:14px")}>
<div style={css("display:flex;align-items:baseline;gap:18px;flex-wrap:wrap")}>
<span style={css("font-family:Cinzel,serif;font-size:30px;font-weight:700;color:#f4efe4")}>{"Your collection"}</span>
<span style={css("font-size:13px;font-weight:700;color:#8d98a8")}>{show(v.ownedHint)}</span>
</div>
</div>
<div style={css(`position:relative;display:grid;grid-template-columns:repeat(${str(v.stockCols)},minmax(0,1fr));gap:14px`)}>
{(v.owned ?? []).map((i: any, $index: number) => (<React.Fragment key={$index}>
<div data-own={i.id} style={css("position:relative;display:flex;flex-direction:column;border-radius:6px;overflow:hidden;background:linear-gradient(180deg,#141920,#0c0f14);box-shadow:0 1px 0 rgba(255,255,255,.05) inset,0 24px 40px rgba(0,0,0,.45)")}>
<div style={css(`position:absolute;left:0;right:0;top:0;height:2px;background:linear-gradient(90deg,rgba(0,0,0,0),${str(i.rc)},rgba(0,0,0,0))`)} />
<button onClick={i.open} onMouseMove={v.tiltMove} onMouseLeave={v.tiltLeave} style={css(`position:relative;height:clamp(170px,24vh,230px);padding:0;border:0;cursor:pointer;perspective:800px;display:grid;place-items:center;background:radial-gradient(ellipse 70% 80% at 50% -10%,${str(i.glow)},rgba(0,0,0,0) 70%)`)}>
<div style={css("position:absolute;left:50%;bottom:26px;width:170px;height:22px;margin-left:-85px;border-radius:50%;background:radial-gradient(closest-side,rgba(0,0,0,.85),rgba(0,0,0,0))")} />
<div data-tilt="1" style={css("position:relative;transform-style:preserve-3d;transition:transform .35s cubic-bezier(.2,.8,.2,1)")}>
{(i.isSleeve) ? (<>
<div style={css("position:relative;width:128px;height:178px")}>
<div style={css(`position:absolute;inset:0;border-radius:8px;background:${str(i.edge)};opacity:.55;transform:translate(-16px,6px) rotate(-8deg)`)} />
<div style={css(`position:absolute;inset:0;border-radius:8px;padding:5px;box-sizing:border-box;background:${str(i.edge)};box-shadow:0 18px 30px rgba(0,0,0,.6)`)}>
<div style={css(`width:100%;height:100%;border-radius:4px;background:#111 url('${str(i.art)}') center/cover`)} />
<div style={css("position:absolute;left:5px;right:5px;top:16px;height:1px;background:rgba(255,255,255,.35)")} />
<div data-glare="1" style={css("position:absolute;inset:0;border-radius:8px;background:linear-gradient(115deg,rgba(255,255,255,0) 30%,rgba(255,255,255,.28) 46%,rgba(255,255,255,0) 60%);background-size:220% 220%;background-position:30% 30%")} />
</div>
</div>
</>) : null}
{(i.isMat) ? (<>
<div style={css(`width:210px;height:118px;border-radius:8px;position:relative;transform:rotateX(46deg) rotateZ(-10deg);background:#111 url('${str(i.art)}') center/cover;box-shadow:0 30px 34px rgba(0,0,0,.75)`)}>
<div style={css("position:absolute;inset:0;border-radius:8px;background:radial-gradient(ellipse at 35% 25%,rgba(255,210,150,.2),rgba(0,0,0,0) 60%)")} />
<div style={css("position:absolute;inset:5px;border-radius:5px;border:1px dashed rgba(255,255,255,.4)")} />
</div>
</>) : null}
{(i.isBack) ? (<>
<div style={css(`position:relative;width:128px;height:178px;border-radius:8px;box-sizing:border-box;border:5px solid ${str(i.rim)};background:${str(i.pattern)};display:grid;place-items:center;box-shadow:0 18px 30px rgba(0,0,0,.6)`)}>
<div style={css(`width:62%;height:70%;border-radius:50%;background:${str(i.gem)};box-shadow:0 0 24px ${str(i.halo)}`)} />
<div data-glare="1" style={css("position:absolute;inset:0;border-radius:4px;background:linear-gradient(115deg,rgba(255,255,255,0) 30%,rgba(255,255,255,.16) 46%,rgba(255,255,255,0) 60%);background-size:220% 220%;background-position:30% 30%")} />
</div>
</>) : null}
{(i.isAvatar) ? (<>
<div style={css("position:relative;width:150px;height:150px")}>
<div style={css("position:absolute;inset:0;border-radius:50%;padding:4px;box-sizing:border-box;background:conic-gradient(from 20deg,#f7dc9a,#6b4e1e,#e8c46a,#4a3418,#f7dc9a);box-shadow:0 18px 30px rgba(0,0,0,.6)")}>
<div style={css(`width:100%;height:100%;border-radius:50%;background:#111 url('${str(i.art)}') center 20%/cover;box-shadow:inset 0 0 20px rgba(0,0,0,.6)`)} />
</div>
<span style={css("position:absolute;left:50%;top:-5px;width:10px;height:10px;margin-left:-5px;transform:rotate(45deg);background:#f7dc9a")} />
<span style={css("position:absolute;left:50%;bottom:-5px;width:10px;height:10px;margin-left:-5px;transform:rotate(45deg);background:#c9a050")} />
</div>
</>) : null}
</div>
{(i.owned) ? (<>
<div data-ostamp={i.id} style={css("position:absolute;top:20px;right:14px;padding:5px 10px;border:2px double rgba(126,240,184,.8);border-radius:3px;transform:rotate(9deg);font-family:Cinzel,serif;font-size:12px;font-weight:800;letter-spacing:.2em;color:#9af5c8;background:rgba(6,20,14,.7)")}>{show(i.ownedLabel)}</div>
</>) : null}
</button>
<div style={css("display:flex;flex-direction:column;gap:12px;padding:14px 16px 16px;border-top:1px solid rgba(255,255,255,.05);background:linear-gradient(180deg,rgba(255,255,255,.02),rgba(255,255,255,0))")}>
<div style={css("display:flex;justify-content:space-between;align-items:center;gap:6px 8px;flex-wrap:wrap")}>
<span style={css(`display:flex;align-items:center;gap:7px;white-space:nowrap;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:${str(i.rc)}`)}><span style={css(`width:7px;height:7px;transform:rotate(45deg);background:${str(i.rc)}`)} />{show(i.rarity)}</span>
<span style={css("font-family:Cinzel,serif;font-size:10px;font-weight:700;letter-spacing:.2em;white-space:nowrap;color:#6b7688")}>{show(i.typeLabel)}</span>
</div>
<div style={css("display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap")}>
<span style={css("flex:1 1 90px;font-size:16px;font-weight:800;line-height:1.2;min-width:0;text-wrap:balance")}>{show(i.name)}</span>
<button onClick={i.act} disabled={i.disabled} style={css(`flex:none;padding:1px;border:0;background:${str(i.frame)};clip-path:polygon(8px 0,calc(100% - 8px) 0,100% 50%,calc(100% - 8px) 100%,8px 100%,0 50%);cursor:pointer;transition:filter .15s`)} className={cx('', pc([['hover', "filter:brightness(1.25)"]]))}>
<span style={css(`display:flex;align-items:center;gap:7px;height:32px;padding:0 16px;white-space:nowrap;background:${str(i.fill)};clip-path:polygon(8px 0,calc(100% - 8px) 0,100% 50%,calc(100% - 8px) 100%,8px 100%,0 50%);font-size:13px;font-weight:800;font-variant-numeric:tabular-nums;color:${str(i.tc)}`)}>
{(i.isGold) ? (<><mf-coin size={"14"}></mf-coin></>) : null}
{(i.isEmbers) ? (<><mf-ember size={"15"}></mf-ember></>) : null}{" "}{show(i.btn)}{" "}</span>
</button>
</div>
</div>
</div>
</React.Fragment>))}
</div>
</section></>) : null}
<footer style={css("position:relative;z-index:3;flex:none;padding:14px 36px 16px;font-size:11px;line-height:1.5;color:#4f5968")}>{"Unofficial fan-made tool. Card names, text and images © Wizards of the Coast, provided by Scryfall. Not produced or endorsed by Wizards of the Coast."}</footer>
{(v.hasDetail) ? (<>
<div data-modal="1" onClick={v.closeDetail} style={css("position:fixed;inset:0;z-index:50;display:grid;place-items:center;padding:32px;background:radial-gradient(circle at 40% 50%,rgba(7,9,12,.7),rgba(4,5,7,.96))")}>
<div onClick={v.stop} style={css("display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:48px;align-items:center;width:100%;max-width:980px")}>
<div onMouseMove={v.tiltMove} onMouseLeave={v.tiltLeave} style={css(`position:relative;height:480px;display:grid;place-items:center;perspective:1000px;background:radial-gradient(ellipse 60% 70% at 50% 10%,${str(v.d.glow)},rgba(0,0,0,0) 70%)`)}>
<div style={css("position:absolute;left:50%;bottom:40px;width:300px;height:36px;margin-left:-150px;border-radius:50%;background:radial-gradient(closest-side,rgba(0,0,0,.9),rgba(0,0,0,0))")} />
<div data-dprev="1" style={css(`transform:scale(${str(v.d.scale)});transform-style:preserve-3d`)}>
<div data-tilt="1" style={css("position:relative;transform-style:preserve-3d;transition:transform .35s cubic-bezier(.2,.8,.2,1)")}>
{(v.d.isSleeve) ? (<>
<div style={css(`position:relative;width:128px;height:178px;border-radius:8px;padding:5px;box-sizing:border-box;background:${str(v.d.edge)};box-shadow:0 18px 30px rgba(0,0,0,.6)`)}>
<div style={css(`width:100%;height:100%;border-radius:4px;background:#111 url('${str(v.d.art)}') center/cover`)} />
<div style={css("position:absolute;left:5px;right:5px;top:16px;height:1px;background:rgba(255,255,255,.35)")} />
<div data-glare="1" style={css("position:absolute;inset:0;border-radius:8px;background:linear-gradient(115deg,rgba(255,255,255,0) 30%,rgba(255,255,255,.28) 46%,rgba(255,255,255,0) 60%);background-size:220% 220%;background-position:30% 30%")} />
</div>
</>) : null}
{(v.d.isMat) ? (<>
<div style={css(`width:210px;height:118px;border-radius:8px;position:relative;transform:rotateX(46deg) rotateZ(-10deg);background:#111 url('${str(v.d.art)}') center/cover;box-shadow:0 30px 34px rgba(0,0,0,.75)`)}>
<div style={css("position:absolute;inset:5px;border-radius:5px;border:1px dashed rgba(255,255,255,.4)")} />
</div>
</>) : null}
{(v.d.isBack) ? (<>
<div style={css(`position:relative;width:128px;height:178px;border-radius:8px;box-sizing:border-box;border:5px solid ${str(v.d.rim)};background:${str(v.d.pattern)};display:grid;place-items:center;box-shadow:0 18px 30px rgba(0,0,0,.6)`)}>
<div style={css(`width:62%;height:70%;border-radius:50%;background:${str(v.d.gem)};box-shadow:0 0 24px ${str(v.d.halo)}`)} />
<div data-glare="1" style={css("position:absolute;inset:0;border-radius:4px;background:linear-gradient(115deg,rgba(255,255,255,0) 30%,rgba(255,255,255,.16) 46%,rgba(255,255,255,0) 60%);background-size:220% 220%;background-position:30% 30%")} />
</div>
</>) : null}
{(v.d.isAvatar) ? (<>
<div style={css("width:150px;height:150px;border-radius:50%;padding:4px;box-sizing:border-box;background:conic-gradient(from 20deg,#f7dc9a,#6b4e1e,#e8c46a,#4a3418,#f7dc9a);box-shadow:0 18px 30px rgba(0,0,0,.6)")}>
<div style={css(`width:100%;height:100%;border-radius:50%;background:#111 url('${str(v.d.art)}') center 20%/cover`)} />
</div>
</>) : null}
</div>
</div>
</div>
<div style={css("display:flex;flex-direction:column;gap:20px")}>
<span style={css(`display:flex;align-items:center;gap:10px;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:${str(v.d.rc)}`)}><span style={css(`width:8px;height:8px;transform:rotate(45deg);background:${str(v.d.rc)}`)} />{show(v.d.rarity)}{" · "}{show(v.d.typeLabel)}</span>
<span style={css("font-family:Cinzel,serif;font-size:52px;font-weight:700;line-height:1;color:#f4efe4")}>{show(v.d.name)}</span>
<span style={css("font-size:15px;line-height:1.6;color:#aab3c0;max-width:380px")}>{show(v.d.desc)}</span>
{(v.d.hasArt) ? (<>
<span style={css("font-size:12px;color:#6b7688")}>{"Art from "}{show(v.d.artName)}</span>
</>) : null}
<div style={css("display:flex;gap:12px;flex-wrap:wrap;padding-top:8px")}>
<button onClick={v.d.act} disabled={v.d.disabled} style={css(`padding:2px;border:0;background:${str(v.d.frame)};clip-path:polygon(14px 0,calc(100% - 14px) 0,100% 50%,calc(100% - 14px) 100%,14px 100%,0 50%);cursor:pointer`)} className={cx('', pc([['hover', "filter:brightness(1.12)"]]))}>
<span style={css(`display:block;padding:14px 38px;background:${str(v.d.fill)};clip-path:polygon(13px 0,calc(100% - 13px) 0,100% 50%,calc(100% - 13px) 100%,13px 100%,0 50%);font-family:Cinzel,serif;font-size:14px;font-weight:800;letter-spacing:.12em;color:${str(v.d.tc)}`)}>{show(v.d.bigBtn)}</span>
</button>
<button onClick={v.closeDetail} style={css("padding:1px;border:0;background:linear-gradient(180deg,#6b7688,#2e3a4a);clip-path:polygon(13px 0,calc(100% - 13px) 0,100% 50%,calc(100% - 13px) 100%,13px 100%,0 50%);cursor:pointer")} className={cx('', pc([['hover', "filter:brightness(1.3)"]]))}>
<span style={css("display:block;padding:15px 30px;background:linear-gradient(180deg,#232a35,#12161d);clip-path:polygon(12px 0,calc(100% - 12px) 0,100% 50%,calc(100% - 12px) 100%,12px 100%,0 50%);font-family:Cinzel,serif;font-size:13px;font-weight:700;letter-spacing:.14em;color:#c8d0dc")}>{"CLOSE"}</span>
</button>
</div>
{(v.d.short) ? (<>
<span style={css("font-size:13px;font-weight:700;color:#ffb38a")}>{show(v.d.shortTxt)}</span>
</>) : null}
</div>
</div>
</div>
</>) : null}
</div>
    </>
  );
}

