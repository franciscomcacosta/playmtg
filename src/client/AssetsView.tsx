// Generated from the Claude Design file "Assets.dc.html" by conv.mjs, then wired to live data.
import React from 'react';
import { css, pc, cx, str, show } from './dc';

export const AssetsView_CSS = "html,body{margin:0;background:#050607} a{color:#f0a93b;text-decoration:none} a:hover{color:#f5c77a} button{font-family:inherit} code{font-family:ui-monospace,Menlo,monospace}";

export function AssetsView({ v }: { v: any }) {
  return (
    <>
<div ref={v.rootRef} style={css("min-height:100vh;background:#050607;color:#e7ebf1;font-family:Manrope,system-ui,sans-serif")}>
<header style={css("display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap;padding:18px 36px")}>
<div style={css("display:flex;align-items:center;gap:34px;flex-wrap:wrap")}>
<span style={css("font-family:Cinzel,serif;font-size:19px;font-weight:800;letter-spacing:.34em;color:#f7dc9a")}>{"PLAYMTG"}</span>
<nav style={css("display:flex;gap:4px")}>
<a href="/" style={css("padding:10px 14px;font-family:Cinzel,serif;font-size:12px;font-weight:700;letter-spacing:.18em;color:#9aa3b0")}>{"HOME"}</a>
<a href="/shop" style={css("padding:10px 14px;font-family:Cinzel,serif;font-size:12px;font-weight:700;letter-spacing:.18em;color:#9aa3b0")}>{"SHOP"}</a>
<a href="/treasury" style={css("padding:10px 14px;font-family:Cinzel,serif;font-size:12px;font-weight:700;letter-spacing:.18em;color:#9aa3b0")}>{"TREASURY"}</a>
</nav>
</div>
<div style={css("display:flex;align-items:center;gap:14px;flex-wrap:wrap")}>
<div data-tgt="gold" style={css("display:flex;align-items:center;gap:8px;height:34px;padding:0 14px 0 5px;border-radius:17px;background:#0c0d0f;box-shadow:inset 0 0 0 1px rgba(201,160,80,.4)")}>
<mf-coin size={"24"}></mf-coin>
<span style={css("font-size:14px;font-weight:800;font-variant-numeric:tabular-nums;color:#f5e2b0")}>{show(v.goldTxt)}</span>
</div>
<div data-tgt="embers" style={css("display:flex;align-items:center;gap:6px;height:34px;padding:0 14px 0 5px;border-radius:17px;background:#0c0d0f;box-shadow:inset 0 0 0 1px rgba(224,122,58,.4)")}>
<mf-ember size={"24"}></mf-ember>
<span style={css("font-size:14px;font-weight:800;font-variant-numeric:tabular-nums;color:#ffcfae")}>{show(v.embersTxt)}</span>
</div>
<div data-tgt="xp" style={css("display:flex;align-items:center;gap:6px;height:34px;padding:0 14px 0 5px;border-radius:17px;background:#0c0d0f;box-shadow:inset 0 0 0 1px rgba(255,176,112,.35)")}>
<mf-xp size={"24"}></mf-xp>
<span style={css("font-size:14px;font-weight:800;font-variant-numeric:tabular-nums;color:#ffd8b8")}>{show(v.xpTxt)}</span>
</div>
</div>
</header>
<div style={css("max-width:1240px;margin:0 auto;padding:40px 36px 80px;display:flex;flex-direction:column;gap:72px")}>
<div style={css("display:flex;flex-direction:column;gap:14px;max-width:640px")}>
<span style={css("display:flex;align-items:center;gap:14px;font-family:Cinzel,serif;font-size:12px;font-weight:700;letter-spacing:.34em;color:#c9a050")}><span style={css("width:28px;height:1px;background:#c9a050")} />{"LIBRARY"}</span>
<h1 style={css("margin:0;font-family:Cinzel,serif;font-size:clamp(40px,4.6vw,64px);font-weight:700;line-height:.98;color:#f6f0e2")}>{"Assets"}</h1>
<p style={css("margin:0;font-size:15px;line-height:1.6;color:#aab3c0;text-wrap:pretty")}>{"Animated pieces shared by every screen. Each one is a single tag from "}<code style={css("color:#e8cf9a")}>{"mf-assets.js"}</code>{". Set "}<code style={css("color:#e8cf9a")}>{"size"}</code>{" in pixels; set "}<code style={css("color:#e8cf9a")}>{"motion"}</code>{" to "}<code style={css("color:#e8cf9a")}>{"idle"}</code>{", "}<code style={css("color:#e8cf9a")}>{"hover"}</code>{" or "}<code style={css("color:#e8cf9a")}>{"none"}</code>{". Animation stops automatically for players with reduced motion turned on."}</p>
</div>
<section style={css("display:flex;flex-direction:column;gap:22px")}>
<div style={css("display:flex;align-items:baseline;justify-content:space-between;gap:16px;flex-wrap:wrap;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,.08)")}>
<span style={css("font-family:Cinzel,serif;font-size:13px;font-weight:700;letter-spacing:.26em;color:#c9a050")}>{"BOOSTER OPENING"}</span>
<code style={css("font-size:12px;color:#e8cf9a")}>{"<mf-booster art name color cards> · .revealAll() · .reset()"}</code>
</div>
<div style={css("position:relative;height:560px;border-radius:6px;overflow:hidden;background:radial-gradient(ellipse at 50% 40%,#142034,#0c0d0f 70%);box-shadow:inset 0 0 0 1px rgba(255,255,255,.06)")}>
<div style={css("position:absolute;inset:24px 24px 18px")}><mf-booster ref={v.boosterRef} art={str(v.packArt2)} name={"DRAFT NIGHT"} sub={"DRAFT BOOSTER"} color={"blue"} cards={str(v.packCards)}></mf-booster></div>
<div style={css("position:absolute;top:16px;right:16px;display:flex;gap:10px")}>
<button onClick={v.revealPack} style={css("height:34px;padding:0 16px;border:1px solid rgba(201,160,80,.5);border-radius:2px;background:rgba(5,6,7,.7);cursor:pointer;font-family:Cinzel,serif;font-size:11px;font-weight:700;letter-spacing:.16em;color:#f7dc9a")} className={cx('', pc([['hover', "background:rgba(240,169,59,.14)"]]))}>{"REVEAL ALL"}</button>
<button onClick={v.newPack} style={css("height:34px;padding:0 16px;border:1px solid rgba(255,255,255,.18);border-radius:2px;background:rgba(5,6,7,.7);cursor:pointer;font-family:Cinzel,serif;font-size:11px;font-weight:700;letter-spacing:.16em;color:#c8d0dc")} className={cx('', pc([['hover', "border-color:#c9a050;color:#f7dc9a"]]))}>{"NEW PACK"}</button>
</div>
</div>
<span style={css("font-size:13px;line-height:1.6;color:#8d98a8;max-width:640px")}>{"Drag across the dashed line to tear the top off, or click the pack to rip it in one go. The cards rise out and fan across the table. Rares and mythics glow until you flip them, then burst and keep a foil finish."}</span>
</section>
<section style={css("display:flex;flex-direction:column;gap:22px")}>
<div style={css("display:flex;align-items:baseline;justify-content:space-between;gap:16px;flex-wrap:wrap;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,.08)")}>
<span style={css("font-family:Cinzel,serif;font-size:13px;font-weight:700;letter-spacing:.26em;color:#c9a050")}>{"CURRENCY"}</span>
<span style={css("font-size:12px;color:#7d8491")}>{"Gold is bought. Embers are earned. XP levels the season."}</span>
</div>
<div style={css("display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:20px")}>
<div style={css("display:flex;flex-direction:column;border-radius:6px;background:#0c0d0f;box-shadow:inset 0 0 0 1px rgba(255,255,255,.06)")}>
<div style={css("height:240px;display:grid;place-items:center;border-radius:6px 6px 0 0;background:radial-gradient(circle at 50% 55%,#1c1508,#0c0d0f 70%)")}>
<mf-coin size={"140"}></mf-coin>
</div>
<div style={css("display:flex;flex-direction:column;gap:14px;padding:18px 20px 20px")}>
<div style={css("display:flex;justify-content:space-between;align-items:baseline;gap:10px")}><span style={css("font-family:Cinzel,serif;font-size:20px;font-weight:700;color:#f4efe4")}>{"Gold coin"}</span><code style={css("font-size:12px;color:#e8cf9a")}>{"<mf-coin>"}</code></div>
<span style={css("font-size:13px;line-height:1.5;color:#8d98a8")}>{"Milled rim and the forge diamond. A shine crosses the face every few seconds. "}<code style={css("color:#c8bca6")}>{"motion=\"spin\""}</code>{" flips it, used when coins fly to the counter."}</span>
<div style={css("display:flex;align-items:flex-end;gap:18px;flex-wrap:wrap;padding-top:4px")}>
<div style={css("display:flex;flex-direction:column;align-items:center;gap:6px")}><mf-coin size={"16"}></mf-coin><span style={css("font-size:10px;font-weight:700;color:#5a606a")}>{"16"}</span></div>
<div style={css("display:flex;flex-direction:column;align-items:center;gap:6px")}><mf-coin size={"24"}></mf-coin><span style={css("font-size:10px;font-weight:700;color:#5a606a")}>{"24"}</span></div>
<div style={css("display:flex;flex-direction:column;align-items:center;gap:6px")}><mf-coin size={"40"}></mf-coin><span style={css("font-size:10px;font-weight:700;color:#5a606a")}>{"40"}</span></div>
<div style={css("display:flex;flex-direction:column;align-items:center;gap:6px")}><mf-coin size={"56"} motion={"spin"}></mf-coin><span style={css("font-size:10px;font-weight:700;color:#5a606a")}>{"SPIN"}</span></div>
<div style={css("display:flex;flex-direction:column;align-items:center;gap:6px")}><mf-coin size={"56"} motion={"hover"}></mf-coin><span style={css("font-size:10px;font-weight:700;color:#5a606a")}>{"HOVER"}</span></div>
</div>
</div>
</div>
<div style={css("display:flex;flex-direction:column;border-radius:6px;background:#0c0d0f;box-shadow:inset 0 0 0 1px rgba(255,255,255,.06)")}>
<div style={css("height:240px;display:grid;place-items:center;border-radius:6px 6px 0 0;background:radial-gradient(circle at 50% 55%,#200c06,#0c0d0f 70%)")}>
<mf-ember size={"140"}></mf-ember>
</div>
<div style={css("display:flex;flex-direction:column;gap:14px;padding:18px 20px 20px")}>
<div style={css("display:flex;justify-content:space-between;align-items:baseline;gap:10px")}><span style={css("font-family:Cinzel,serif;font-size:20px;font-weight:700;color:#f4efe4")}>{"Ember"}</span><code style={css("font-size:12px;color:#e8cf9a")}>{"<mf-ember>"}</code></div>
<span style={css("font-size:13px;line-height:1.5;color:#8d98a8")}>{"A cut shard with a flickering core. Sparks rise from it at 24px and up; smaller sizes drop them to stay legible."}</span>
<div style={css("display:flex;align-items:flex-end;gap:18px;flex-wrap:wrap;padding-top:4px")}>
<div style={css("display:flex;flex-direction:column;align-items:center;gap:6px")}><mf-ember size={"16"}></mf-ember><span style={css("font-size:10px;font-weight:700;color:#5a606a")}>{"16"}</span></div>
<div style={css("display:flex;flex-direction:column;align-items:center;gap:6px")}><mf-ember size={"24"}></mf-ember><span style={css("font-size:10px;font-weight:700;color:#5a606a")}>{"24"}</span></div>
<div style={css("display:flex;flex-direction:column;align-items:center;gap:6px")}><mf-ember size={"40"}></mf-ember><span style={css("font-size:10px;font-weight:700;color:#5a606a")}>{"40"}</span></div>
<div style={css("display:flex;flex-direction:column;align-items:center;gap:6px")}><mf-ember size={"56"}></mf-ember><span style={css("font-size:10px;font-weight:700;color:#5a606a")}>{"56"}</span></div>
<div style={css("display:flex;flex-direction:column;align-items:center;gap:6px")}><mf-ember size={"56"} motion={"none"}></mf-ember><span style={css("font-size:10px;font-weight:700;color:#5a606a")}>{"STILL"}</span></div>
</div>
</div>
</div>
<div style={css("display:flex;flex-direction:column;border-radius:6px;background:#0c0d0f;box-shadow:inset 0 0 0 1px rgba(255,255,255,.06)")}>
<div style={css("height:240px;display:grid;place-items:center;border-radius:6px 6px 0 0;background:radial-gradient(circle at 50% 55%,#22120a,#0c0d0f 70%)")}>
<mf-xp size={"140"}></mf-xp>
</div>
<div style={css("display:flex;flex-direction:column;gap:14px;padding:18px 20px 20px")}>
<div style={css("display:flex;justify-content:space-between;align-items:baseline;gap:10px")}><span style={css("font-family:Cinzel,serif;font-size:20px;font-weight:700;color:#f4efe4")}>{"XP orb"}</span><code style={css("font-size:12px;color:#e8cf9a")}>{"<mf-xp>"}</code></div>
<span style={css("font-size:13px;line-height:1.5;color:#8d98a8")}>{"Molten core with two counter-turning swirls and an orbiting mote. Add "}<code style={css("color:#c8bca6")}>{"label=\"XP\""}</code>{" for reward tiles."}</span>
<div style={css("display:flex;align-items:flex-end;gap:18px;flex-wrap:wrap;padding-top:4px")}>
<div style={css("display:flex;flex-direction:column;align-items:center;gap:6px")}><mf-xp size={"16"}></mf-xp><span style={css("font-size:10px;font-weight:700;color:#5a606a")}>{"16"}</span></div>
<div style={css("display:flex;flex-direction:column;align-items:center;gap:6px")}><mf-xp size={"24"}></mf-xp><span style={css("font-size:10px;font-weight:700;color:#5a606a")}>{"24"}</span></div>
<div style={css("display:flex;flex-direction:column;align-items:center;gap:6px")}><mf-xp size={"40"}></mf-xp><span style={css("font-size:10px;font-weight:700;color:#5a606a")}>{"40"}</span></div>
<div style={css("display:flex;flex-direction:column;align-items:center;gap:6px")}><mf-xp size={"56"} label={"XP"}></mf-xp><span style={css("font-size:10px;font-weight:700;color:#5a606a")}>{"LABEL"}</span></div>
<div style={css("display:flex;flex-direction:column;align-items:center;gap:6px")}><mf-xp size={"56"} motion={"hover"}></mf-xp><span style={css("font-size:10px;font-weight:700;color:#5a606a")}>{"HOVER"}</span></div>
</div>
</div>
</div>
</div>
</section>
<section style={css("display:flex;flex-direction:column;gap:22px")}>
<div style={css("display:flex;align-items:baseline;justify-content:space-between;gap:16px;flex-wrap:wrap;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,.08)")}>
<span style={css("font-family:Cinzel,serif;font-size:13px;font-weight:700;letter-spacing:.26em;color:#c9a050")}>{"REWARD FLIGHT"}</span>
<code style={css("font-size:12px;color:#e8cf9a")}>{"MF.fly(kind, fromEl, toEl, { count, onDone })"}</code>
</div>
<div style={css("display:flex;flex-wrap:wrap;gap:20px;align-items:center")}>
<span style={css("flex:1 1 320px;font-size:13px;line-height:1.6;color:#8d98a8;max-width:520px")}>{"Rewards travel from where they were earned to the counter in the header. The counter flashes as each piece lands and the total updates once the last one arrives. Try it: the counters are at the top right."}</span>
<div style={css("display:flex;gap:14px;flex-wrap:wrap")}>
<button data-src="gold" onClick={v.flyGold} style={css("display:flex;align-items:center;gap:10px;height:48px;padding:0 20px 0 12px;border:1px solid rgba(201,160,80,.5);border-radius:2px;background:#0c0d0f;cursor:pointer;font-size:13px;font-weight:800;color:#f5e2b0")} className={cx('', pc([['hover', "background:rgba(240,169,59,.12)"]]))}><mf-coin size={"28"} motion={"hover"}></mf-coin>{"+250 gold"}</button>
<button data-src="embers" onClick={v.flyEmbers} style={css("display:flex;align-items:center;gap:10px;height:48px;padding:0 20px 0 12px;border:1px solid rgba(224,122,58,.5);border-radius:2px;background:#0c0d0f;cursor:pointer;font-size:13px;font-weight:800;color:#ffcfae")} className={cx('', pc([['hover', "background:rgba(240,122,58,.12)"]]))}><mf-ember size={"28"} motion={"hover"}></mf-ember>{"+100 embers"}</button>
<button data-src="xp" onClick={v.flyXp} style={css("display:flex;align-items:center;gap:10px;height:48px;padding:0 20px 0 12px;border:1px solid rgba(255,176,112,.45);border-radius:2px;background:#0c0d0f;cursor:pointer;font-size:13px;font-weight:800;color:#ffd8b8")} className={cx('', pc([['hover', "background:rgba(255,176,112,.1)"]]))}><mf-xp size={"28"} motion={"hover"}></mf-xp>{"+300 XP"}</button>
</div>
</div>
</section>
<section style={css("display:flex;flex-direction:column;gap:22px")}>
<div style={css("display:flex;align-items:baseline;justify-content:space-between;gap:16px;flex-wrap:wrap;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,.08)")}>
<span style={css("font-family:Cinzel,serif;font-size:13px;font-weight:700;letter-spacing:.26em;color:#c9a050")}>{"CARD BACKS"}</span>
<code style={css("font-size:12px;color:#e8cf9a")}>{"<mf-cardback tone=\"gold | lit | ember\" label>"}</code>
</div>
<div style={css("display:flex;gap:28px;flex-wrap:wrap;align-items:flex-end")}>
<div style={css("display:flex;flex-direction:column;gap:10px")}>
<div style={css("width:170px;aspect-ratio:63/88;border-radius:8px;box-shadow:0 18px 40px rgba(0,0,0,.7)")}><mf-cardback></mf-cardback></div>
<span style={css("font-size:12px;font-weight:700;color:#c8bca6")}>{"Gold"}<span style={css("font-weight:600;color:#6b7280")}>{" · default"}</span></span>
</div>
<div style={css("display:flex;flex-direction:column;gap:10px")}>
<div style={css("width:170px;aspect-ratio:63/88;border-radius:8px;box-shadow:0 0 0 2px #f0a93b,0 0 40px rgba(240,169,59,.5)")}><mf-cardback tone={"lit"} label={"DAY 5"}></mf-cardback></div>
<span style={css("font-size:12px;font-weight:700;color:#c8bca6")}>{"Lit"}<span style={css("font-weight:600;color:#6b7280")}>{" · ready to flip"}</span></span>
</div>
<div style={css("display:flex;flex-direction:column;gap:10px")}>
<div style={css("width:170px;aspect-ratio:63/88;border-radius:8px;box-shadow:0 0 30px rgba(240,122,58,.35)")}><mf-cardback tone={"ember"} label={"DAY 7"}></mf-cardback></div>
<span style={css("font-size:12px;font-weight:700;color:#c8bca6")}>{"Ember"}<span style={css("font-weight:600;color:#6b7280")}>{" · big rewards"}</span></span>
</div>
<div style={css("display:flex;flex-direction:column;gap:10px")}>
<div style={css("position:relative;width:110px;height:154px;margin:0 16px 0 8px")}>
<div style={css("position:absolute;inset:0;transform:translate(12px,-8px) rotate(7deg);border-radius:6px;box-shadow:0 6px 14px rgba(0,0,0,.6)")}><mf-cardback motion={"none"}></mf-cardback></div>
<div style={css("position:absolute;inset:0;transform:translate(6px,-4px) rotate(3deg);border-radius:6px;box-shadow:0 6px 14px rgba(0,0,0,.6)")}><mf-cardback motion={"none"}></mf-cardback></div>
<div style={css("position:absolute;inset:0;transform:rotate(-2deg);border-radius:6px;box-shadow:0 12px 26px rgba(0,0,0,.75)")}><mf-cardback></mf-cardback></div>
</div>
<span style={css("font-size:12px;font-weight:700;color:#c8bca6")}>{"Stacked"}<span style={css("font-weight:600;color:#6b7280")}>{" · still underneath"}</span></span>
</div>
</div>
</section>
<section style={css("display:flex;flex-direction:column;gap:22px")}>
<div style={css("display:flex;align-items:baseline;justify-content:space-between;gap:16px;flex-wrap:wrap;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,.08)")}>
<span style={css("font-family:Cinzel,serif;font-size:13px;font-weight:700;letter-spacing:.26em;color:#c9a050")}>{"CARD FRAMES"}</span>
<code style={css("font-size:12px;color:#e8cf9a")}>{"<mf-frame color finish=\"foil\"> · <mf-foil tone=\"rare | mythic\">"}</code>
</div>
<span style={css("font-size:13px;line-height:1.6;color:#8d98a8;max-width:640px")}>{"The frame is a background layer: drop it as the first child of any box with "}<code style={css("color:#c8bca6")}>{"position:relative;isolation:isolate"}</code>{". A slow metal sheen passes over it. Foil adds a moving holographic band; "}<code style={css("color:#c8bca6")}>{"mf-foil"}</code>{" lays the same finish over the art. Foil follows the pointer: the band shifts and a glare tracks the cursor. Add "}<code style={css("color:#c8bca6")}>{"data-tilt"}</code>{" to the card to tilt it in 3D as well."}</span>
<div style={css("display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:16px")}>
{(v.frames ?? []).map((f: any, $index: number) => (<React.Fragment key={$index}>
<div style={css("display:flex;flex-direction:column;gap:8px")}>
<div style={css("width:100%;aspect-ratio:63/88;padding:5px;box-sizing:border-box;border-radius:7px;background:#0b0b0c;box-shadow:0 14px 30px rgba(0,0,0,.6)")}>
<div style={css("position:relative;isolation:isolate;height:100%;display:flex;flex-direction:column;gap:3px;padding:4px;box-sizing:border-box;border-radius:4px")}>
<mf-frame color={str(f.id)}></mf-frame>
<span style={css("height:12%;border-radius:2px;background:linear-gradient(180deg,#efe6d2,#cdbf9f);box-shadow:inset 0 0 0 1px rgba(0,0,0,.35)")} />
<span style={css(`flex:1;border-radius:2px;background:#1a1f27 url('${str(f.art)}') center 30%/cover;box-shadow:inset 0 0 0 1px rgba(0,0,0,.6)`)} />
<span style={css("height:26%;border-radius:2px;background:#e9e0cc")} />
</div>
</div>
<span style={css("font-size:12px;font-weight:700;color:#c8bca6")}>{show(f.name)}</span>
</div>
</React.Fragment>))}
</div>
<div style={css("display:flex;gap:24px;flex-wrap:wrap;padding-top:8px")}>
{(v.foils ?? []).map((f: any, $index: number) => (<React.Fragment key={$index}>
<div style={css("display:flex;flex-direction:column;gap:10px")}>
<div data-tilt="1" style={css(`width:190px;aspect-ratio:63/88;padding:6px;box-sizing:border-box;border-radius:9px;background:#0b0b0c;box-shadow:0 0 0 1px ${str(f.ring)},0 20px 44px rgba(0,0,0,.7);cursor:pointer`)}>
<div style={css("position:relative;isolation:isolate;height:100%;display:flex;flex-direction:column;gap:4px;padding:5px;box-sizing:border-box;border-radius:5px")}>
<mf-frame color={str(f.color)} finish={"foil"}></mf-frame>
<span style={css("display:flex;align-items:center;height:12%;padding:0 7px;border-radius:3px;background:linear-gradient(180deg,#efe6d2,#cdbf9f);font-family:Cinzel,serif;font-size:11px;font-weight:800;color:#16120c")}>{show(f.name)}</span>
<span style={css(`position:relative;isolation:isolate;flex:1;overflow:hidden;border-radius:2px;background:#1a1f27 url('${str(f.art)}') center 30%/cover`)}><mf-foil tone={str(f.tone)}></mf-foil></span>
<span style={css("height:24%;border-radius:2px;background:#e9e0cc")} />
</div>
</div>
<span style={css("font-size:12px;font-weight:700;color:#c8bca6")}>{show(f.label)}</span>
</div>
</React.Fragment>))}
</div>
</section>
<section style={css("display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));gap:48px")}>
<div style={css("display:flex;flex-direction:column;gap:22px")}>
<div style={css("display:flex;align-items:baseline;justify-content:space-between;gap:16px;flex-wrap:wrap;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,.08)")}>
<span style={css("font-family:Cinzel,serif;font-size:13px;font-weight:700;letter-spacing:.26em;color:#c9a050")}>{"RANK CRESTS"}</span>
<code style={css("font-size:12px;color:#e8cf9a")}>{"<mf-rank tier division>"}</code>
</div>
<div style={css("display:flex;gap:18px;flex-wrap:wrap;align-items:flex-end")}>
{(v.ranks ?? []).map((r: any, $index: number) => (<React.Fragment key={$index}>
<div style={css("display:flex;flex-direction:column;align-items:center;gap:8px")}>
<mf-rank tier={str(r.tier)} division={str(r.div)} size={"72"}></mf-rank>
<span style={css(`font-family:Cinzel,serif;font-size:11px;font-weight:700;letter-spacing:.12em;color:${str(r.c)}`)}>{show(r.name)}</span>
</div>
</React.Fragment>))}
</div>
<span style={css("font-size:13px;line-height:1.5;color:#8d98a8")}>{"Gold and above gain points; Mythic burns."}</span>
</div>
<div style={css("display:flex;flex-direction:column;gap:22px")}>
<div style={css("display:flex;align-items:baseline;justify-content:space-between;gap:16px;flex-wrap:wrap;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,.08)")}>
<span style={css("font-family:Cinzel,serif;font-size:13px;font-weight:700;letter-spacing:.26em;color:#c9a050")}>{"PACKS & LOADER"}</span>
<code style={css("font-size:12px;color:#e8cf9a")}>{"<mf-pack art name color> · <mf-loader>"}</code>
</div>
<div style={css("display:flex;gap:22px;flex-wrap:wrap;align-items:center")}>
<div style={css("width:96px;height:150px")}><mf-pack art={str(v.packArt1)} name={"DRAFT"} color={"blue"}></mf-pack></div>
<div style={css("width:96px;height:150px")}><mf-pack art={str(v.packArt2)} name={"DRAFT"} color={"red"}></mf-pack></div>
<div style={css("display:flex;flex-direction:column;align-items:center;gap:10px;padding-left:16px")}><mf-loader size={"48"}></mf-loader><span style={css("font-size:10px;font-weight:700;letter-spacing:.1em;color:#5a606a")}>{"SEARCHING"}</span></div>
</div>
<span style={css("font-size:13px;line-height:1.5;color:#8d98a8")}>{"Packs lift and tilt on hover."}</span>
</div>
</section>
<span style={css("font-size:10px;line-height:1.4;color:#3f4652")}>{"Unofficial fan project. Card art and names © Wizards of the Coast, via Scryfall."}</span>
</div>
</div>
    </>
  );
}

