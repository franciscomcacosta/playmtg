// Generated from the Claude Design file "Treasury.dc.html" by conv.mjs, then wired to live data.
import React from 'react';
import { css, pc, cx, str, show } from './dc';

export const TreasuryView_CSS = "html,body{margin:0;background:#07090c} a{color:#f0a93b;text-decoration:none} a:hover{color:#f5c77a} button{font-family:inherit}";

export function TreasuryView({ v }: { v: any }) {
  return (
    <>
<div ref={v.rootRef} style={css("position:relative;min-height:100vh;overflow:hidden;color:#e7ebf1;font-family:Manrope,system-ui,sans-serif;background:radial-gradient(1000px 520px at 50% -12%,rgba(255,196,96,.2),rgba(255,196,96,0) 70%),radial-gradient(1400px 900px at 50% 40%,#16181c 0%,#0b0c0f 65%,#050506 100%)")}>
<div style={css("position:absolute;inset:0;pointer-events:none;opacity:.55;background:url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22220%22 height=%22220%22%3E%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%22.9%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3CfeColorMatrix values=%220 0 0 0 1 0 0 0 0 .9 0 0 0 0 .75 0 0 0 .07 0%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22/%3E%3C/svg%3E')")} />
<div style={css("position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 0 220px 40px rgba(0,0,0,.85)")} />
<header data-in="0" style={css("position:relative;z-index:20;display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap;padding:18px 36px")}>
<div style={css("display:flex;align-items:center;gap:34px;flex-wrap:wrap")}>
<a href="/" style={css("font-family:Cinzel,serif;font-size:19px;font-weight:800;letter-spacing:.34em;white-space:nowrap;color:#f7dc9a;text-shadow:0 2px 12px rgba(0,0,0,.8)")}>{"PLAYMTG"}</a>
<nav aria-label="Main" style={css("display:flex;align-items:center;gap:4px")}>
<a href="/" style={css("padding:10px 14px;font-family:Cinzel,serif;font-size:12px;font-weight:700;letter-spacing:.18em;color:#9aa3b0")} className={cx('', pc([['hover', "color:#e8cf9a"]]))}>{"HOME"}</a>
<a href="/decks" style={css("padding:10px 14px;font-family:Cinzel,serif;font-size:12px;font-weight:700;letter-spacing:.18em;color:#9aa3b0")} className={cx('', pc([['hover', "color:#e8cf9a"]]))}>{"DECKS"}</a>
<a href="/shop" aria-current="page" style={css("position:relative;padding:10px 14px;font-family:Cinzel,serif;font-size:12px;font-weight:700;letter-spacing:.18em;color:#f7dc9a")}>{"SHOP"}<span style={css("position:absolute;left:50%;bottom:0;width:6px;height:6px;margin-left:-3px;transform:rotate(45deg);background:#f0a93b;box-shadow:0 0 10px rgba(240,169,59,.9)")} /></a>
</nav>
<span style={css("display:flex;align-items:center;gap:12px;font-family:Cinzel,serif;font-size:12px;font-weight:700;letter-spacing:.24em;color:#c9a050")}><span style={css("width:6px;height:6px;transform:rotate(45deg);background:#c9a050")} />{"TREASURY"}</span>
</div>
<div style={css("display:flex;align-items:center;gap:14px;flex-wrap:wrap")}>
<div data-cur="gold" style={css("display:flex;align-items:center;gap:8px;height:34px;padding:0 14px 0 4px;border-radius:17px;background:rgba(5,6,7,.7);box-shadow:inset 0 0 0 1px rgba(201,160,80,.4)")}>
<mf-coin size={"26"}></mf-coin>
<span style={css("font-size:14px;font-weight:800;font-variant-numeric:tabular-nums;color:#f5e2b0")}>{show(v.goldTxt)}</span>
</div>
<div data-cur="embers" style={css("display:flex;align-items:center;gap:6px;height:34px;padding:0 14px 0 4px;border-radius:17px;background:rgba(5,6,7,.7);box-shadow:inset 0 0 0 1px rgba(224,122,58,.4)")}>
<mf-ember size={"26"}></mf-ember>
<span style={css("font-size:14px;font-weight:800;font-variant-numeric:tabular-nums;color:#ffcfae")}>{show(v.embersTxt)}</span>
</div>
</div>
</header>
<section style={css("position:relative;z-index:3;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:32px 64px;align-items:end;padding:28px 36px 36px")}>
<div style={css("display:flex;flex-direction:column;gap:18px;max-width:560px")}>
<div data-in="1" style={css("display:flex;align-items:center;gap:14px")}>
<span style={css("font-family:Cinzel,serif;font-size:12px;font-weight:700;letter-spacing:.34em;color:#c9a050")}>{"GOLD"}</span>
<span style={css("width:48px;height:1px;background:linear-gradient(90deg,#c9a050,transparent)")} />
</div>
<h1 data-in="2" style={css("margin:0;font-family:Cinzel,serif;font-size:clamp(44px,5vw,72px);font-weight:700;line-height:.98;color:#f6ecd4;text-shadow:0 0 60px rgba(240,190,90,.25),0 6px 30px rgba(0,0,0,.7);text-wrap:balance")}>{"The bigger the chest, the bigger the bonus"}</h1>
<span data-in="3" style={css("font-size:15px;line-height:1.6;color:#aab3c0;max-width:480px;text-wrap:pretty")}>{show(v.intro)}</span>
</div>
<div data-in="4" style={css("justify-self:end;width:100%;max-width:440px;border-top:1px solid rgba(240,122,58,.35)")}>
<div style={css("display:flex;align-items:center;gap:10px;padding:14px 0 10px")}>
<mf-ember size={"17"}></mf-ember>
<span style={css("font-family:Cinzel,serif;font-size:12px;font-weight:700;letter-spacing:.24em;color:#ffb38a")}>{"EMBERS ARE EARNED, NOT BOUGHT"}</span>
</div>
{(v.earn ?? []).map((e: any, $index: number) => (<React.Fragment key={$index}>
<div style={css("display:flex;justify-content:space-between;align-items:baseline;gap:16px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.06)")}>
<span style={css("font-size:14px;font-weight:600;color:#c8d0dc")}>{show(e.t)}</span>
<span style={css("font-size:14px;font-weight:800;font-variant-numeric:tabular-nums;color:#ffcfae")}>{show(e.v)}</span>
</div>
</React.Fragment>))}
</div>
</section>
<section style={css("position:relative;z-index:3;padding:0 36px 24px;display:grid;grid-template-columns:repeat(auto-fill,minmax(max(300px,calc((100% - 36px) / 3)),1fr));gap:18px")}>
{(v.tiers ?? []).map((t: any, $index: number) => (<React.Fragment key={$index}>
<div data-tier={t.id} style={css(`position:relative;display:flex;flex-direction:column;border-radius:6px;overflow:hidden;background:linear-gradient(180deg,#15171b,#0c0d10);box-shadow:inset 0 0 0 1px ${str(t.line)},0 24px 44px rgba(0,0,0,.5)`)}>
<div style={css(`position:absolute;left:0;right:0;top:0;height:2px;background:linear-gradient(90deg,rgba(0,0,0,0),${str(t.accent)},rgba(0,0,0,0))`)} />
<div style={css(`position:relative;height:210px;background:radial-gradient(ellipse 70% 90% at 50% -10%,${str(t.light)},rgba(0,0,0,0) 72%)`)}>
<span style={css(`position:absolute;left:20px;top:16px;font-family:Cinzel,serif;font-size:14px;font-weight:700;letter-spacing:.2em;color:${str(t.accent)}`)}>{show(t.numeral)}</span>
{(t.hasBonus) ? (<>
<div style={css("position:absolute;right:16px;top:14px;padding:1px;background:linear-gradient(180deg,#f7dc9a,#a8742a);clip-path:polygon(8px 0,100% 0,100% 100%,8px 100%,0 50%)")}>
<span style={css("display:block;padding:6px 12px 6px 16px;background:linear-gradient(180deg,#f5b44b,#b8621a);clip-path:polygon(8px 0,100% 0,100% 100%,8px 100%,0 50%);font-size:12px;font-weight:800;color:#1b1206")}>{"+"}{show(t.pct)}{"% bonus"}</span>
</div>
</>) : null}
<div style={css(`position:absolute;left:50%;bottom:22px;width:${str(t.shadowW)}px;height:26px;margin-left:${str(t.shadowM)}px;border-radius:50%;background:radial-gradient(closest-side,rgba(0,0,0,.9),rgba(0,0,0,0))`)} />
<div data-pile="1" style={css("position:absolute;left:50%;bottom:30px;width:0;height:0")}>
{(t.stacks ?? []).map((s: any, $index: number) => (<React.Fragment key={$index}>
<div style={css(`position:absolute;left:${str(s.x)}px;bottom:${str(s.y)}px;z-index:${str(s.z)};width:46px;margin-left:-23px`)}>
{(s.coins ?? []).map((c: any, $index: number) => (<React.Fragment key={$index}>
<div style={css(`position:absolute;left:${str(c.dx)}px;bottom:${str(c.b)}px;width:46px;height:17px;border-radius:50%;background:radial-gradient(ellipse at 40% 35%,#fff4cc 0%,#f0c35a 38%,#b07a1e 80%);box-shadow:0 4px 0 #7a4e10,0 5px 0 #5a380a,0 6px 6px rgba(0,0,0,.4)`)} />
</React.Fragment>))}
</div>
</React.Fragment>))}
</div>
</div>
<div style={css("display:flex;flex-direction:column;gap:14px;padding:16px 20px 20px;border-top:1px solid rgba(255,255,255,.05);flex:1")}>
<div style={css("display:flex;justify-content:space-between;align-items:flex-end;gap:12px")}>
<div style={css("display:flex;flex-direction:column;gap:4px")}>
<span style={css("display:flex;align-items:center;gap:10px;font-family:Cinzel,serif;font-size:34px;font-weight:700;line-height:1;font-variant-numeric:tabular-nums;color:#f6ecd4")}>
<mf-coin size={"26"}></mf-coin>{show(t.totalTxt)}{" "}</span>
<span style={css("font-size:12px;font-weight:700;color:#8d98a8")}>{show(t.breakdown)}</span>
</div>
<span style={css("font-family:Cinzel,serif;font-size:13px;font-weight:700;letter-spacing:.14em;white-space:nowrap;color:#6b7688")}>{show(t.name)}</span>
</div>
{(t.hasExtras) ? (<>
<div style={css("display:flex;flex-direction:column;gap:8px;padding-top:12px;border-top:1px dashed rgba(201,160,80,.25)")}>
<span style={css("font-family:Cinzel,serif;font-size:10px;font-weight:700;letter-spacing:.24em;color:#c9a050")}>{"ALSO INCLUDES"}</span>
{(t.extras ?? []).map((x: any, $index: number) => (<React.Fragment key={$index}>
<div style={css("display:flex;align-items:center;gap:10px")}>
<span style={css(`width:34px;height:24px;flex:none;border-radius:3px;background:${str(x.thumb)};background-size:cover;background-position:center;box-shadow:0 0 0 1px rgba(255,255,255,.12)`)} />
<span style={css("flex:1;min-width:0;font-size:13px;font-weight:700;line-height:1.25;color:#e7ebf1")}>{show(x.name)}</span>
<span style={css("flex:none;white-space:nowrap;font-family:Cinzel,serif;font-size:10px;font-weight:700;letter-spacing:.16em;color:#6b7688")}>{show(x.type)}</span>
</div>
</React.Fragment>))}
</div>
</>) : null}
<button onClick={t.pick} style={css(`margin-top:auto;padding:${str(t.bw)};border:0;background:${str(t.frame)};clip-path:polygon(12px 0,calc(100% - 12px) 0,100% 50%,calc(100% - 12px) 100%,12px 100%,0 50%);cursor:pointer;transition:filter .15s,transform .12s`)} className={cx('', pc([['hover', "filter:brightness(1.15)"], ['active', "transform:scale(.98)"]]))}>
<span style={css(`display:block;padding:13px 0;text-align:center;background:${str(t.fill)};clip-path:polygon(11px 0,calc(100% - 11px) 0,100% 50%,calc(100% - 11px) 100%,11px 100%,0 50%);font-size:16px;font-weight:800;font-variant-numeric:tabular-nums;color:${str(t.tc)}`)}>{show(t.priceTxt)}</span>
</button>
</div>
</div>
</React.Fragment>))}
</section>
<footer style={css("position:relative;z-index:3;padding:12px 36px 28px;font-size:11px;line-height:1.5;color:#4f5968")}>{show(v.footer)}</footer>
<div ref={v.fxRef} style={css("position:fixed;inset:0;pointer-events:none;z-index:70")} />
{(v.hasSel) ? (<>
<div data-modal="1" onClick={v.cancel} style={css("position:fixed;inset:0;z-index:50;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 50% 45%,rgba(7,9,12,.7),rgba(4,5,7,.95))")}>
<div onClick={v.stop} style={css("width:100%;max-width:440px;padding:1px;background:linear-gradient(180deg,#c9a050,#3a2a10);border-radius:10px")}>
<div style={css("border-radius:9px;background:linear-gradient(180deg,#191b20,#0e0f12);padding:28px;display:flex;flex-direction:column;gap:20px")}>
<span style={css("font-family:Cinzel,serif;font-size:12px;font-weight:700;letter-spacing:.3em;color:#c9a050")}>{"CONFIRM PURCHASE"}</span>
<span style={css("font-family:Cinzel,serif;font-size:36px;font-weight:700;line-height:1;color:#f6ecd4")}>{show(v.sel.name)}</span>
<div style={css("display:flex;flex-direction:column")}>
{(v.sel.rows ?? []).map((r: any, $index: number) => (<React.Fragment key={$index}>
<div style={css("display:flex;justify-content:space-between;gap:16px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.07);font-size:14px")}>
<span style={css("color:#aab3c0")}>{show(r.k)}</span><span style={css(`font-weight:800;color:${str(r.c)}`)}>{show(r.v)}</span>
</div>
</React.Fragment>))}
<div style={css("display:flex;justify-content:space-between;gap:16px;padding:14px 0 0;font-size:16px")}>
<span style={css("font-weight:700")}>{"Total"}</span><span style={css("font-weight:800;font-variant-numeric:tabular-nums")}>{show(v.sel.priceTxt)}</span>
</div>
</div>
<div style={css("display:flex;gap:10px")}>
<button onClick={v.pay} style={css("flex:1;padding:2px;border:0;background:linear-gradient(180deg,#f7dc9a,#a8742a 50%,#f0c56a);clip-path:polygon(14px 0,calc(100% - 14px) 0,100% 50%,calc(100% - 14px) 100%,14px 100%,0 50%);cursor:pointer")} className={cx('', pc([['hover', "filter:brightness(1.1)"]]))}>
<span style={css("display:block;padding:14px 0;background:linear-gradient(180deg,#f5b44b,#b8621a);clip-path:polygon(13px 0,calc(100% - 13px) 0,100% 50%,calc(100% - 13px) 100%,13px 100%,0 50%);font-family:Cinzel,serif;font-size:14px;font-weight:800;letter-spacing:.12em;color:#1b1206")}>{show(v.payLabel)}{show(v.sel.priceTxt)}</span>
</button>
<button onClick={v.cancel} style={css("padding:1px;border:0;background:linear-gradient(180deg,#6b7688,#2e3a4a);clip-path:polygon(13px 0,calc(100% - 13px) 0,100% 50%,calc(100% - 13px) 100%,13px 100%,0 50%);cursor:pointer")} className={cx('', pc([['hover', "filter:brightness(1.3)"]]))}>
<span style={css("display:block;padding:15px 24px;background:linear-gradient(180deg,#232a35,#12161d);clip-path:polygon(12px 0,calc(100% - 12px) 0,100% 50%,calc(100% - 12px) 100%,12px 100%,0 50%);font-family:Cinzel,serif;font-size:13px;font-weight:700;letter-spacing:.14em;color:#c8d0dc")}>{"CANCEL"}</span>
</button>
</div>
</div>
</div>
</div>
</>) : null}
</div>
    </>
  );
}

