// Generated from the Claude Design file "Deck Builder.dc.html" by conv.mjs, then wired to live data (see DeckBuilder.tsx).
import React from 'react';
import { css, pc, cx, str, show } from './dc';

export const DeckBuilderView_CSS = "@keyframes dbZoomIn{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:none}} html,body{margin:0;background:#07090c} a{color:#f0a93b;text-decoration:none} a:hover{color:#f5c77a} button,input,select{font-family:inherit} :focus-visible{outline:2px solid #f7dc9a;outline-offset:2px} input::placeholder{color:#6b7688} ::-webkit-scrollbar{width:10px} ::-webkit-scrollbar-thumb{background:#2a2419;border-radius:0;border:3px solid #0c0f14} ::-webkit-scrollbar-track{background:transparent}";

export function DeckBuilderView({ v }: { v: any }) {
  return (
    <>
<div style={css("position:relative;height:100vh;min-height:720px;overflow:hidden;display:flex;flex-direction:column;color:#e7ebf1;font-family:Manrope,system-ui,sans-serif;background:radial-gradient(1100px 600px at 50% 0%,rgba(255,150,70,.10),rgba(255,150,70,0) 70%),radial-gradient(1500px 1000px at 50% 45%,#161a20 0%,#0b0d11 62%,#040506 100%)")}>
<div aria-hidden="true" style={css("position:absolute;inset:0;pointer-events:none;opacity:.55;background:url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22%3E%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%22.85%22 numOctaves=%222%22 stitchTiles=%22stitch%22/%3E%3CfeColorMatrix values=%220 0 0 0 1 0 0 0 0 .92 0 0 0 0 .8 0 0 0 .06 0%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22/%3E%3C/svg%3E')")} />
<div aria-hidden="true" style={css(`position:absolute;inset:0;pointer-events:none;background:${str(v.tint)};transition:background .8s`)} />
<div aria-hidden="true" style={css("position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 0 220px rgba(0,0,0,.85)")} />
<div aria-live="polite" style={css("position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)")}>{show(v.live)}</div>
<header style={css("position:relative;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap;padding:16px 32px;background:linear-gradient(180deg,rgba(16,17,20,.9),rgba(12,13,15,.75));box-shadow:0 10px 30px rgba(0,0,0,.45)")}>
<div aria-hidden="true" style={css("position:absolute;left:0;right:0;bottom:0;height:1px;background:linear-gradient(90deg,rgba(201,160,80,0),rgba(201,160,80,.28) 50%,rgba(201,160,80,0))")} />
<div style={css("display:flex;align-items:center;gap:22px;min-width:0")}>
<a href="/" style={css("display:flex;align-items:center;gap:6px;height:36px;padding:0 14px 0 10px;border-radius:6px;background:rgba(255,255,255,.05);font-size:13px;font-weight:600;color:#c3c8d0")} className={cx('', pc([['hover', "background:rgba(255,255,255,.1);color:#f4efe4"]]))}><span aria-hidden="true" style={css("font-size:16px")}>{"‹"}</span>{"Lobby"}</a>
{v.switcher}
<div style={css("display:flex;flex-direction:column;gap:2px;min-width:0")}>
<label htmlFor="deckname" style={css("font-family:Cinzel,serif;font-size:11px;font-weight:700;letter-spacing:.3em;color:#c9a050")}>{"DECK BUILDER"}</label>
<input id="deckname" value={v.name} onChange={v.setName} aria-label="Deck name" style={css("width:min(420px,40vw);padding:2px 0;border:0;border-bottom:1px dashed rgba(201,160,80,.3);background:transparent;font-family:Cinzel,serif;font-size:26px;font-weight:700;color:#f4efe4;text-shadow:0 2px 12px rgba(0,0,0,.6)")} className={cx('', pc([['focus', "border-bottom-color:#f0a93b;outline:none"]]))} />
</div>
</div>
<div style={css("display:flex;align-items:center;gap:12px;flex-wrap:wrap")}>
<label style={css("display:flex;align-items:center;gap:6px;height:38px;padding:0 4px 0 12px;border-radius:8px;background:rgba(255,255,255,.04);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;white-space:nowrap;color:#8a909b")}>{"Format "}<select value={v.format} onChange={v.setFormat} aria-label="Deck format" style={css("height:30px;padding:0 4px;border:0;border-radius:6px;background:transparent;font-family:Cinzel,serif;font-size:14px;font-weight:700;letter-spacing:.02em;text-transform:none;color:#f7dc9a;cursor:pointer")}>
<option value="standard" style={css("background:#17191e")}>{"Standard"}</option>
<option value="commander" style={css("background:#17191e")}>{"Commander"}</option>
</select>
</label>
<div role="status" style={css(`display:flex;align-items:center;gap:10px;height:38px;padding:0 16px;border-radius:8px;white-space:nowrap;background:${str(v.status.bg)}`)}>
<span style={css(`font-family:Cinzel,serif;font-size:17px;font-weight:800;font-variant-numeric:tabular-nums;color:${str(v.status.c)}`)}>{show(v.total)}<span style={css("font-size:12px;opacity:.7")}>{" / "}{show(v.target)}</span></span>
<span style={css(`font-size:13px;font-weight:600;color:${str(v.status.c)}`)}>{show(v.status.text)}</span>
</div>
<button onClick={v.openImport} style={css("height:40px;padding:0 16px;border:0;border-radius:8px;background:rgba(255,255,255,.06);cursor:pointer;font-size:14px;font-weight:600;color:#c3c8d0")} className={cx('', pc([['hover', "background:rgba(255,255,255,.11)"]]))}>{"Import"}</button>
<button onClick={v.openExport} disabled={v.deckEmptyB} style={css(`height:40px;padding:0 16px;border:0;border-radius:8px;background:rgba(255,255,255,.06);cursor:pointer;font-size:14px;font-weight:600;color:#c3c8d0;opacity:${str(v.exportOp)}`)} className={cx('', pc([['hover', "background:rgba(255,255,255,.11)"]]))}>{"Export"}</button>
<span aria-hidden="true" style={css("width:1px;height:22px;background:rgba(255,255,255,.1)")} />
<button onClick={v.undo} disabled={v.noUndo} title="Undo (Ctrl+Z)" style={css(`height:40px;padding:0 18px;border:0;border-radius:8px;background:rgba(255,255,255,.06);cursor:pointer;font-size:14px;font-weight:600;color:#c3c8d0;opacity:${str(v.undoOp)}`)} className={cx('', pc([['hover', "background:rgba(255,255,255,.11)"]]))}>{"Undo"}</button>
<button onClick={v.save} style={css("height:40px;padding:0 24px;white-space:nowrap;border:1px solid #f7dc9a;border-radius:8px;background:linear-gradient(180deg,#f5b44b,#b8621a);box-shadow:inset 0 1px 0 rgba(255,240,200,.5),0 4px 14px rgba(0,0,0,.4);cursor:pointer;font-family:Cinzel,serif;font-size:13px;font-weight:800;letter-spacing:.08em;color:#1b1206")} className={cx('', pc([['hover', "filter:brightness(1.1);box-shadow:inset 0 1px 0 rgba(255,240,200,.5),0 0 18px rgba(240,169,59,.45)"], ['active', "transform:scale(.97)"]]))}>{show(v.saveLabel)}</button>
</div>
</header>
<main style={css("position:relative;flex:1;min-height:0;display:grid;grid-template-columns:clamp(220px,20vw,272px) minmax(0,1fr) clamp(280px,25vw,348px);gap:clamp(12px,1.6vw,22px);padding:22px 32px 22px")}>
<aside aria-label="Filters" style={css("min-height:0;overflow-y:auto;overflow-x:hidden;scrollbar-width:thin;scrollbar-color:#3a3f48 transparent;display:flex;flex-direction:column;gap:24px;padding:20px 18px;border-radius:10px;background:linear-gradient(180deg,#17191e,#111317);box-shadow:0 24px 50px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.04)")}>
<div style={css("display:flex;justify-content:space-between;align-items:baseline")}>
<span style={css("font-family:Cinzel,serif;font-size:17px;font-weight:700;color:#f4efe4")}>{"Find cards"}</span>
{(v.hasFilters) ? (<>
<button onClick={v.clearFilters} style={css("padding:4px 0;border:0;background:transparent;cursor:pointer;font-size:13px;font-weight:600;color:#f0a93b")} className={cx('', pc([['hover', "color:#f7dc9a"]]))}>{"Reset all"}</button>
</>) : null}
</div>
<div style={css("position:relative")}>
<input ref={v.searchRef} value={v.q} onChange={v.setQ} onKeyDown={v.searchKey} placeholder="Search name or type" aria-label="Search cards by name or type" style={css("box-sizing:border-box;width:100%;height:42px;padding:0 40px 0 14px;border-radius:8px;border:1px solid transparent;background:#0b0c0f;box-shadow:inset 0 1px 3px rgba(0,0,0,.6);font-size:14px;font-weight:500;color:#f4efe4")} className={cx('', pc([['focus', "border-color:rgba(240,169,59,.6);outline:none"]]))} />
<span aria-hidden="true" style={css("position:absolute;right:11px;top:11px;min-width:20px;height:20px;display:grid;place-items:center;border-radius:4px;background:rgba(255,255,255,.06);font-size:12px;font-weight:700;color:#7d8491")}>{"/"}</span>
</div>
<fieldset style={css("min-width:0;margin:0;padding:0;border:0;display:flex;flex-direction:column;gap:12px")}>
<legend style={css("padding:0 0 12px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#8a909b")}>{"Color"}</legend>
<div style={css("display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:4px;justify-items:center")}>
{(v.colorOpts ?? []).map((o: any, $index: number) => (<React.Fragment key={$index}>
<button onClick={o.pick} aria-pressed={o.pressed} aria-label={o.label} title={o.label} style={css(`width:100%;max-width:36px;aspect-ratio:1;padding:0;border:0;border-radius:50%;background:transparent;cursor:pointer;opacity:${str(o.op)};box-shadow:${str(o.ring)};transform:${str(o.tf)};transition:all .18s cubic-bezier(.2,.8,.2,1)`)} className={cx('', pc([['hover', "opacity:1;transform:translateY(-2px)"]]))}>
<span style={css(`display:block;width:100%;height:100%;background:url('${str(o.pip)}') center/contain no-repeat;filter:drop-shadow(0 3px 4px rgba(0,0,0,.7))`)} />
</button>
</React.Fragment>))}
</div>
<div role="radiogroup" aria-label="Color matching" style={css("display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2px;padding:3px;border-radius:8px;background:#0b0c0f")}>
{(v.modeOpts ?? []).map((m: any, $index: number) => (<React.Fragment key={$index}>
<button role="radio" aria-checked={m.pressed} onClick={m.pick} title={m.hint} style={css(`height:30px;border:0;border-radius:6px;background:${str(m.bg)};cursor:pointer;font-size:12px;font-weight:600;color:${str(m.c)};transition:background .15s`)}>{show(m.label)}</button>
</React.Fragment>))}
</div>
<span style={css("font-size:12px;line-height:1.45;color:#7d8491;text-wrap:pretty")}>{show(v.modeHint)}</span>
</fieldset>
<fieldset style={css("min-width:0;margin:0;padding:0;border:0")}>
<legend style={css("padding:0 0 12px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#8a909b")}>{"Mana value"}</legend>
<div style={css("display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:2px;justify-items:center")}>
{(v.mvOpts ?? []).map((o: any, $index: number) => (<React.Fragment key={$index}>
<button onClick={o.pick} aria-pressed={o.pressed} aria-label={o.aria} style={css(`width:100%;max-width:28px;aspect-ratio:1;padding:0;border:0;border-radius:50%;background:${str(o.bg)};box-shadow:${str(o.ring)};cursor:pointer;font-family:Cinzel,serif;font-size:${str(o.fs)};font-weight:800;color:${str(o.c)};transition:all .15s`)} className={cx('', pc([['hover', "filter:brightness(1.3)"]]))}>{show(o.label)}</button>
</React.Fragment>))}
</div>
</fieldset>
<fieldset style={css("min-width:0;margin:0;padding:0;border:0")}>
<legend style={css("padding:0 0 12px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#8a909b")}>{"Type"}</legend>
<div style={css("display:flex;flex-wrap:wrap;gap:6px")}>
{(v.typeOpts ?? []).map((o: any, $index: number) => (<React.Fragment key={$index}>
<button onClick={o.pick} aria-pressed={o.pressed} style={css(`height:32px;padding:0 12px;border:1px solid ${str(o.b)};background:${str(o.bg)};color:${str(o.c)};border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;transition:background .15s,border-color .15s`)} className={cx('', pc([['hover', "filter:brightness(1.35)"]]))}>{show(o.label)}</button>
</React.Fragment>))}
</div>
</fieldset>
<fieldset style={css("min-width:0;margin:0;padding:0;border:0")}>
<legend style={css("padding:0 0 12px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#8a909b")}>{"Rarity"}</legend>
<div style={css("display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px")}>
{(v.rarOpts ?? []).map((o: any, $index: number) => (<React.Fragment key={$index}>
<button onClick={o.pick} aria-pressed={o.pressed} style={css(`display:flex;align-items:center;gap:9px;height:32px;padding:0 11px;border:1px solid ${str(o.b)};background:${str(o.bg)};color:${str(o.c)};border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;transition:background .15s,border-color .15s`)} className={cx('', pc([['hover', "filter:brightness(1.35)"]]))}>
<span style={css(`flex:none;width:9px;height:9px;transform:rotate(45deg);background:${str(o.gem)};box-shadow:${str(o.gemGlow)}`)} />{show(o.label)}{" "}</button>
</React.Fragment>))}
</div>
</fieldset>
<button onClick={v.toggleInDeck} role="switch" aria-checked={v.inDeck.pressed} style={css("display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0;border:0;background:transparent;cursor:pointer;font-size:13px;font-weight:600;color:#c3c8d0;text-align:left")}>
<span>{"Only cards in my deck"}</span>
<span style={css(`flex:none;position:relative;width:38px;height:22px;border-radius:11px;background:${str(v.inDeck.track)};box-shadow:inset 0 1px 3px rgba(0,0,0,.6);transition:background .15s`)}>
<span style={css(`position:absolute;top:3px;left:${str(v.inDeck.x)};width:16px;height:16px;border-radius:50%;background:#f4efe4;transition:left .15s`)} />
</span>
</button>
</aside>
<section aria-label="Card results" style={css("min-height:0;display:flex;flex-direction:column;gap:14px")}>
<div style={css("display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap")}>
<div style={css("display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0")}>
<span style={css("font-size:14px;font-weight:700;color:#f4efe4;margin-right:6px")}>{show(v.resultTxt)}</span>
{(v.chips ?? []).map((c: any, $index: number) => (<React.Fragment key={$index}>
<button onClick={c.remove} aria-label={c.aria} style={css("display:flex;align-items:center;gap:6px;height:28px;padding:0 8px 0 11px;border:0;border-radius:6px;background:rgba(240,169,59,.14);cursor:pointer;font-size:12px;font-weight:600;color:#f7dc9a")} className={cx('', pc([['hover', "background:rgba(240,169,59,.26)"]]))}>{show(c.label)}<span aria-hidden="true" style={css("font-size:15px;line-height:1;color:#c9a050")}>{"×"}</span></button>
</React.Fragment>))}
</div>
<label style={css("display:flex;align-items:center;gap:8px;white-space:nowrap;font-size:13px;font-weight:600;color:#8a909b")}>{"Sort by "}<select value={v.sort} onChange={v.setSort} style={css("height:32px;padding:0 10px;border-radius:6px;border:0;background:#17191e;font-size:13px;font-weight:600;color:#e7ebf1;cursor:pointer")}>
<option value="mv">{"Mana value"}</option>
<option value="name">{"Name"}</option>
<option value="color">{"Color"}</option>
<option value="rarity">{"Rarity"}</option>
</select>
</label>
</div>
<div onScroll={v.onScroll} style={css("flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;scrollbar-width:thin;scrollbar-color:#3a3f48 transparent;padding:12px 12px 24px 4px")}>
{(v.hasResults) ? (<>
<div style={css(`display:grid;grid-template-columns:repeat(auto-fill,minmax(min(${str(v.tileMin)},100%),1fr));gap:22px 16px`)}>
{(v.results ?? []).map((c: any, $index: number) => (<React.Fragment key={$index}>
<div onMouseEnter={c.enter} onMouseLeave={v.tileLeave} style={css(`position:relative;min-width:0;transform:${str(c.lift)};transition:transform .18s cubic-bezier(.2,.8,.2,1)`)}>
<button onClick={c.add} onMouseDown={v.zClose} aria-label={c.aria} style={css(`display:block;width:100%;aspect-ratio:488/680;padding:0;border:0;border-radius:4.75%/3.5%;background:#1a1f27 url('${str(c.img)}') center/cover;cursor:${str(c.cursor)};box-shadow:${str(c.ring)};transition:box-shadow .18s`)} />
{(c.inDeck) ? (<>
<span aria-hidden="true" style={css(`position:absolute;bottom:-10px;right:-10px;width:34px;height:34px;display:grid;place-items:center;border-radius:50%;background:radial-gradient(circle at 35% 30%,#ffe7a8,#e3a246 45%,#8a5418);box-shadow:0 0 0 2px #1b1206,0 4px 10px rgba(0,0,0,.7);font-family:Cinzel,serif;font-size:${str(c.badgeSize)};font-weight:800;color:#1b1206;pointer-events:none`)}>{show(c.badge)}</span>
</>) : null}
{(c.hot) ? (<>
<div style={css("position:absolute;left:0;right:0;bottom:6%;display:flex;justify-content:center;gap:10px")}>
<button onClick={c.remove} onMouseDown={v.zClose} disabled={c.noRemove} aria-label={c.removeAria} style={css(`width:36px;height:36px;border-radius:50%;border:1px solid #6b7688;background:radial-gradient(circle at 50% 30%,#2e3642,#0d1015);box-shadow:0 4px 12px rgba(0,0,0,.8);cursor:pointer;font-size:20px;font-weight:700;line-height:1;color:#e7ebf1;opacity:${str(c.remOp)}`)} className={cx('', pc([['hover', "border-color:#f7dc9a"]]))}>{"−"}</button>
<button onClick={c.add} onMouseDown={v.zClose} disabled={c.noAdd} aria-label={c.addAria} style={css(`width:36px;height:36px;border-radius:50%;border:1px solid #f7dc9a;background:radial-gradient(circle at 50% 30%,#f5b44b,#9a4d14);box-shadow:0 4px 12px rgba(0,0,0,.8),0 0 12px rgba(240,169,59,.45);cursor:pointer;font-size:20px;font-weight:800;line-height:1;color:#1b1206;opacity:${str(c.addOp)}`)} className={cx('', pc([['hover', "filter:brightness(1.12)"]]))}>{"+"}</button>
</div>
</>) : null}
</div>
</React.Fragment>))}
</div>
</>) : null}
{(v.moreTxt) ? (<div style={css("padding:18px;text-align:center;font-size:13px;color:#8a909b")}>{v.moreTxt}</div>) : null}
{(v.noResults) ? (<>
<div style={css("display:flex;flex-direction:column;align-items:center;gap:14px;padding:80px 20px;text-align:center")}>
<span style={css("font-family:Cinzel,serif;font-size:24px;font-weight:700;color:#f4efe4")}>{"No cards match"}</span>
<span style={css("font-size:14px;color:#8d98a8;max-width:360px;text-wrap:pretty")}>{"Try removing a filter above, or reset everything."}</span>
<button onClick={v.clearFilters} style={css("height:40px;padding:0 20px;border:0;border-radius:8px;background:rgba(240,169,59,.14);cursor:pointer;font-size:14px;font-weight:600;color:#f7dc9a")} className={cx('', pc([['hover', "background:rgba(240,169,59,.26)"]]))}>{"Reset filters"}</button>
</div>
</>) : null}
</div>
</section>
<aside aria-label="Your deck" style={css("position:relative;min-height:0;display:flex;flex-direction:column;border-radius:10px;background:linear-gradient(180deg,#1a1b20,#111317);box-shadow:0 24px 60px rgba(0,0,0,.65),inset 0 1px 0 rgba(255,255,255,.05);overflow:hidden")}>
<div style={css("display:flex;flex-direction:column;gap:18px;padding:20px 18px 16px;background:rgba(0,0,0,.18)")}>
<div style={css("display:flex;justify-content:space-between;align-items:baseline;gap:10px")}>
<span style={css("font-family:Cinzel,serif;font-size:17px;font-weight:700;color:#f4efe4")}>{"Your deck"}</span>
<span style={css("white-space:nowrap;font-size:13px;font-weight:600;color:#8a909b")}>{show(v.summary)}</span>
</div>
{(v.hasLink) ? (<>
<div style={css("display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:-8px;font-size:12px;font-weight:600;color:#8a909b")}>
<span style={css("display:flex;align-items:center;gap:7px;min-width:0")}><span style={css("flex:none;width:6px;height:6px;border-radius:50%;background:#7ef0b8")} /><span style={css("white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>{"Linked to "}{show(v.linkSite)}</span></span>
<span style={css("display:flex;gap:12px")}>
<button onClick={v.resync} style={css("padding:2px 0;border:0;background:transparent;cursor:pointer;font-size:12px;font-weight:700;color:#f0a93b")} className={cx('', pc([['hover', "color:#f7dc9a"]]))}>{"Resync"}</button>
<button onClick={v.unlink} style={css("padding:2px 0;border:0;background:transparent;cursor:pointer;font-size:12px;font-weight:600;color:#7d8491")} className={cx('', pc([['hover', "color:#c3c8d0"]]))}>{"Unlink"}</button>
</span>
</div>
</>) : null}
{(v.isCmd) ? (<>
{(v.hasCommander) ? (<>
<div onMouseEnter={v.cmd.enter} onMouseLeave={v.cmd.leave} style={css(`position:relative;display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:62px;padding:8px 10px 8px 14px;box-sizing:border-box;border-radius:8px;overflow:hidden;background:linear-gradient(90deg,#1c1e23 34%,rgba(28,30,35,.3) 75%,rgba(28,30,35,.7)),#1c1e23 url('${str(v.cmd.art)}') right 30%/66% auto no-repeat;box-shadow:inset 0 0 0 1px rgba(247,220,154,.5),0 0 18px rgba(240,169,59,.12)`)}>
<span style={css("display:flex;flex-direction:column;gap:3px;min-width:0")}>
<span style={css("font-family:Cinzel,serif;font-size:10px;font-weight:700;letter-spacing:.24em;color:#c9a050")}>{"COMMANDER"}</span>
<span style={css("font-family:Cinzel,serif;font-size:15px;font-weight:700;line-height:1.2;color:#f4efe4;text-shadow:0 1px 3px #000")}>{show(v.cmd.name)}</span>
</span>
<span style={css("display:flex;gap:2px;flex:none")}>
{(v.cmd.pips ?? []).map((p: any, $index: number) => (<React.Fragment key={$index}><span style={css(`width:16px;height:16px;background:url('${str(p)}') center/contain no-repeat;filter:drop-shadow(0 1px 2px #000)`)} /></React.Fragment>))}
</span>
<button onClick={v.cmd.remove} aria-label="Move commander back to the deck" title="Move back to the deck" style={css("flex:none;width:26px;height:26px;border-radius:50%;border:1px solid #6b7688;background:#12161d;cursor:pointer;font-size:15px;line-height:1;color:#e7ebf1")} className={cx('', pc([['hover', "border-color:#f7dc9a"]]))}>{"×"}</button>
</div>
</>) : null}
{(v.noCommander) ? (<>
<div style={css("padding:12px 14px;border-radius:8px;border:1px dashed rgba(201,160,80,.4);font-size:13px;line-height:1.5;color:#c8bca6;text-wrap:pretty")}>{"No commander yet. Hover a legendary creature in your list and press ♛."}</div>
</>) : null}
</>) : null}
<div style={css("display:flex;flex-direction:column;gap:8px")}>
<span style={css("font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#8a909b")}>{"Mana curve"}</span>
<div role="img" aria-label={v.curveAria} style={css("display:grid;grid-template-columns:repeat(8,1fr);gap:6px;align-items:end")}>
{(v.curve ?? []).map((b: any, $index: number) => (<React.Fragment key={$index}>
<div style={css("display:flex;flex-direction:column;align-items:center;gap:5px")}>
<span style={css(`height:14px;font-family:Cinzel,serif;font-size:12px;font-weight:800;font-variant-numeric:tabular-nums;color:${str(b.nc)}`)}>{show(b.n)}</span>
<div style={css("position:relative;width:100%;height:68px;clip-path:polygon(0 5px,50% 0,100% 5px,100% 100%,0 100%);background:linear-gradient(180deg,#060505,#14110d);box-shadow:inset 0 1px 3px rgba(0,0,0,.8)")}>
<div style={css(`position:absolute;left:2px;right:2px;bottom:2px;height:${str(b.h)};background:linear-gradient(0deg,#5a1e08,#d0601e 55%,#ffb45a 92%,#fff0c4);box-shadow:0 0 14px rgba(255,130,40,.55);transition:height .4s cubic-bezier(.2,.8,.2,1)`)} />
<div style={css("position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,0) 0 7px,rgba(0,0,0,.55) 7px 8px);pointer-events:none")} />
</div>
<span style={css(`font-family:Cinzel,serif;font-size:12px;font-weight:700;color:${str(b.lc)}`)}>{show(b.label)}</span>
</div>
</React.Fragment>))}
</div>
</div>
{(v.hasColors) ? (<>
<div style={css("display:flex;flex-direction:column;gap:8px")}>
<div aria-hidden="true" style={css("display:flex;height:6px;gap:2px")}>
{(v.colorMix ?? []).map((m: any, $index: number) => (<React.Fragment key={$index}><span style={css(`flex:${str(m.flex)};background:${str(m.bar)};box-shadow:0 0 8px ${str(m.glow)}`)} /></React.Fragment>))}
</div>
<div style={css("display:flex;align-items:center;gap:14px;flex-wrap:wrap")}>
{(v.colorMix ?? []).map((m: any, $index: number) => (<React.Fragment key={$index}>
<span title={m.title} style={css("display:flex;align-items:center;gap:6px;font-size:13px;font-weight:700;color:#d6d9de")}><span role="img" aria-label={m.name} style={css(`width:17px;height:17px;background:url('${str(m.pip)}') center/contain no-repeat;filter:drop-shadow(0 1px 2px #000)`)} />{show(m.pct)}</span>
</React.Fragment>))}
</div>
</div>
</>) : null}
{(v.warnings ?? []).map((w: any, $index: number) => (<React.Fragment key={$index}>
<div style={css(`display:flex;gap:10px;align-items:flex-start;padding:9px 12px;background:${str(w.bg)};border-radius:6px;font-size:13px;line-height:1.45;font-weight:600;color:${str(w.c)}`)}>
<span style={css(`flex:none;margin-top:5px;width:7px;height:7px;transform:rotate(45deg);background:${str(w.c)}`)} /><span>{show(w.text)}</span>
</div>
</React.Fragment>))}
</div>
<div style={css("flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;scrollbar-width:thin;scrollbar-color:#3a3f48 transparent;padding:4px 12px 14px")}>
{(v.deckEmpty) ? (<>
<div style={css("padding:40px 16px;text-align:center;font-size:14px;line-height:1.55;color:#8d8472")}>{"Your deck is empty. Click any card to add it."}</div>
</>) : null}
{(v.groups ?? []).map((g: any, $index: number) => (<React.Fragment key={$index}>
<div role="group" aria-label={g.aria} style={css("display:flex;flex-direction:column;gap:3px;padding-top:14px")}>
<div style={css("display:flex;align-items:center;gap:10px;padding:0 2px 5px")}>
<span style={css("font-family:Cinzel,serif;font-size:12px;font-weight:700;letter-spacing:.14em;color:#c9a050")}>{show(g.label)}</span>
<span style={css("font-size:12px;font-weight:700;font-variant-numeric:tabular-nums;color:#7d8491")}>{show(g.n)}</span>
</div>
{(g.rows ?? []).map((r: any, $index: number) => (<React.Fragment key={$index}>
<div onMouseEnter={r.enter} onMouseLeave={r.leave} style={css(`position:relative;display:grid;grid-template-columns:30px minmax(0,1fr) auto;align-items:center;height:36px;overflow:hidden;border-radius:6px;background:linear-gradient(90deg,#1c1e23 38%,rgba(28,30,35,.3) 72%,rgba(28,30,35,.7)),#1c1e23 url('${str(r.art)}') right 38%/62% auto no-repeat;box-shadow:${str(r.edge)};transition:box-shadow .15s`)}>
<span style={css("height:100%;display:grid;place-items:center;background:rgba(0,0,0,.45);font-size:14px;font-weight:800;font-variant-numeric:tabular-nums;color:#f7dc9a")}>{show(r.n)}</span>
<span style={css("padding:0 10px;font-size:13px;font-weight:700;color:#f4efe4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 1px 3px #000")}>{show(r.name)}</span>
<span style={css("display:grid;padding-right:6px")}>
<span aria-label={r.costAria} style={css(`grid-area:1/1;display:flex;gap:2px;justify-content:flex-end;align-items:center;opacity:${str(r.costOp)};transition:opacity .12s`)}>
{(r.cost ?? []).map((p: any, $index: number) => (<React.Fragment key={$index}><span style={css(`width:15px;height:15px;background:url('${str(p)}') center/contain no-repeat;filter:drop-shadow(0 1px 2px #000)`)} /></React.Fragment>))}
</span>
<span style={css(`grid-area:1/1;display:flex;gap:3px;justify-content:flex-end;opacity:${str(r.ctlOp)};transition:opacity .12s`)} className={cx('', pc([['focus-within', "opacity:1"]]))}>
{(r.hasX) ? (<>
<button onClick={r.x} onFocus={r.enter} onBlur={r.leave} aria-label={r.xAria} title={r.xAria} style={css("min-width:26px;height:26px;padding:0 7px;border-radius:13px;border:1px solid #6b7688;background:#12161d;cursor:pointer;font-size:10px;font-weight:800;letter-spacing:.06em;line-height:1;color:#e8cf9a")} className={cx('', pc([['hover', "border-color:#f7dc9a"]]))}>{show(r.xLabel)}</button>
</>) : null}
<button onClick={r.remove} onFocus={r.enter} onBlur={r.leave} aria-label={r.removeAria} style={css("width:26px;height:26px;border-radius:50%;border:1px solid #6b7688;background:#12161d;cursor:pointer;font-size:15px;font-weight:700;line-height:1;color:#e7ebf1")} className={cx('', pc([['hover', "border-color:#f7dc9a"]]))}>{"−"}</button>
<button onClick={r.add} onFocus={r.enter} onBlur={r.leave} disabled={r.noAdd} aria-label={r.addAria} style={css(`width:26px;height:26px;border-radius:50%;border:1px solid #f7dc9a;background:radial-gradient(circle at 50% 30%,#f5b44b,#9a4d14);cursor:pointer;font-size:15px;font-weight:800;line-height:1;color:#1b1206;opacity:${str(r.addOp)}`)}>{"+"}</button>
</span>
</span>
</div>
</React.Fragment>))}
</div>
</React.Fragment>))}
</div>
{(v.hasCards) ? (<>
<div style={css("display:flex;justify-content:space-between;align-items:center;padding:12px 18px;background:rgba(0,0,0,.18)")}>
<span style={css("font-size:12px;line-height:1.4;color:#7a7262")}>{show(v.rulesTxt)}</span>
<button onClick={v.clearDeck} style={css("padding:4px 0;border:0;background:transparent;cursor:pointer;font-size:13px;font-weight:600;white-space:nowrap;color:#e0694f")} className={cx('', pc([['hover', "color:#ff9a8a"]]))}>{"Clear deck"}</button>
</div>
</>) : null}
</aside>
{(v.hasPreview) ? (<>
<div aria-hidden="true" style={css(`position:absolute;right:400px;top:48px;z-index:20;width:260px;aspect-ratio:488/680;border-radius:4.75%/3.5%;background:#1a1f27 url('${str(v.preview)}') center/cover;box-shadow:0 0 0 1px rgba(0,0,0,.6),0 30px 60px rgba(0,0,0,.8);pointer-events:none`)} />
</>) : null}
</main>
{(v.hasZoom) ? (<>
<div aria-hidden="true" style={css(`position:fixed;z-index:40;pointer-events:none;left:${str(v.zoom.x)};top:${str(v.zoom.y)};height:${str(v.zoom.h)};aspect-ratio:488/680;border-radius:4.75%/3.5%;background:#1a1f27 url('${str(v.zoom.img)}') center/cover;box-shadow:0 0 0 1px rgba(0,0,0,.7),0 0 0 3px rgba(201,160,80,.35),0 30px 70px rgba(0,0,0,.85);animation:dbZoomIn .2s cubic-bezier(.2,.8,.2,1) both;transform-origin:${str(v.zoom.origin)}`)} />
</>) : null}
{(v.hasExport) ? (<>
<div onClick={v.closeModal} style={css("position:fixed;inset:0;z-index:60;display:grid;place-items:center;padding:24px;background:rgba(5,6,8,.78)")}>
<div role="dialog" aria-modal="true" aria-label="Export deck" onClick={v.stop} style={css("width:100%;max-width:600px;display:flex;flex-direction:column;gap:16px;padding:24px;box-sizing:border-box;border-radius:12px;background:linear-gradient(180deg,#1c1d22,#131418);box-shadow:0 30px 80px rgba(0,0,0,.8),inset 0 1px 0 rgba(255,255,255,.06)")}>
<div style={css("display:flex;justify-content:space-between;align-items:center;gap:12px")}>
<span style={css("font-family:Cinzel,serif;font-size:20px;font-weight:700;color:#f4efe4")}>{"Export deck"}</span>
<button onClick={v.closeModal} aria-label="Close" style={css("width:32px;height:32px;border:0;border-radius:6px;background:transparent;cursor:pointer;font-size:20px;line-height:1;color:#8a909b")} className={cx('', pc([['hover', "background:rgba(255,255,255,.08);color:#f4efe4"]]))}>{"×"}</button>
</div>
<div role="tablist" aria-label="Export format" style={css("display:grid;gap:2px;padding:3px;border-radius:8px;background:#0b0c0f;grid-template-columns:repeat(3,minmax(0,1fr))")}>
{(v.exp.kinds ?? []).map((k: any, $index: number) => (<React.Fragment key={$index}>
<button role="tab" aria-selected={k.pressed} onClick={k.pick} style={css(`height:34px;border:0;border-radius:6px;background:${str(k.bg)};cursor:pointer;font-size:13px;font-weight:600;white-space:nowrap;color:${str(k.c)}`)}>{show(k.label)}</button>
</React.Fragment>))}
</div>
<span style={css("font-size:13px;line-height:1.5;color:#8a909b;text-wrap:pretty")}>{show(v.exp.hint)}</span>
<textarea ref={v.taRef} value={v.exp.text} readOnly={true} spellCheck="false" aria-label="Decklist text" style={css("box-sizing:border-box;width:100%;height:300px;resize:vertical;padding:14px;border:1px solid transparent;border-radius:8px;background:#0b0c0f;box-shadow:inset 0 1px 3px rgba(0,0,0,.6);font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;line-height:1.6;color:#e7ebf1")} className={cx('', pc([['focus', "border-color:rgba(240,169,59,.6);outline:none"]]))} />
<div style={css("display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap")}>
<span style={css("font-size:12px;color:#7d8491")}>{show(v.exp.foot)}</span>
<div style={css("display:flex;gap:8px;flex-wrap:wrap")}>
<button onClick={v.exp.download} style={css("height:40px;padding:0 16px;border:0;border-radius:8px;background:rgba(255,255,255,.06);cursor:pointer;font-size:14px;font-weight:600;white-space:nowrap;color:#c3c8d0")} className={cx('', pc([['hover', "background:rgba(255,255,255,.11)"]]))}>{"Download .txt"}</button>
<button onClick={v.exp.copy} style={css("height:40px;padding:0 22px;border:1px solid #f7dc9a;border-radius:8px;background:linear-gradient(180deg,#f5b44b,#b8621a);box-shadow:inset 0 1px 0 rgba(255,240,200,.5);cursor:pointer;font-size:14px;font-weight:700;white-space:nowrap;color:#1b1206")} className={cx('', pc([['hover', "filter:brightness(1.1)"]]))}>{show(v.exp.copyLabel)}</button>
</div>
</div>
</div>
</div>
</>) : null}
{(v.hasImport) ? (<>
<div onClick={v.closeModal} style={css("position:fixed;inset:0;z-index:60;display:grid;place-items:center;padding:24px;background:rgba(5,6,8,.8)")}>
<div role="dialog" aria-modal="true" aria-label={v.imp.title} onClick={v.stop} style={css("width:100%;max-width:1000px;max-height:calc(100vh - 48px);display:flex;flex-direction:column;border-radius:12px;overflow:hidden;background:linear-gradient(180deg,#1c1d22,#131418);box-shadow:0 30px 80px rgba(0,0,0,.8),inset 0 1px 0 rgba(255,255,255,.06)")}>
<div style={css("display:flex;justify-content:space-between;align-items:center;gap:16px;padding:18px 24px;border-bottom:1px solid rgba(255,255,255,.06)")}>
<div style={css("display:flex;align-items:center;gap:24px;flex-wrap:wrap;min-width:0")}>
<span style={css("font-family:Cinzel,serif;font-size:20px;font-weight:700;white-space:nowrap;color:#f4efe4")}>{show(v.imp.title)}</span>
<ol aria-label="Steps" style={css("display:flex;align-items:center;gap:10px;margin:0;padding:0;list-style:none")}>
{(v.imp.steps ?? []).map((st: any, $index: number) => (<React.Fragment key={$index}>
<li aria-current={st.cur} style={css(`display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;white-space:nowrap;color:${str(st.c)}`)}>
<span style={css(`width:20px;height:20px;display:grid;place-items:center;border-radius:50%;background:${str(st.bg)};font-size:11px;font-weight:800;color:${str(st.nc)}`)}>{show(st.n)}</span>{show(st.label)}{" "}{(st.line) ? (<><span style={css("width:28px;height:1px;margin-left:2px;background:rgba(255,255,255,.14)")} /></>) : null}
</li>
</React.Fragment>))}
</ol>
</div>
<button onClick={v.closeModal} aria-label="Close" style={css("flex:none;width:32px;height:32px;border:0;border-radius:6px;background:transparent;cursor:pointer;font-size:20px;line-height:1;color:#8a909b")} className={cx('', pc([['hover', "background:rgba(255,255,255,.08);color:#f4efe4"]]))}>{"×"}</button>
</div>
<div style={css("flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;scrollbar-width:thin;scrollbar-color:#3a3f48 transparent;padding:20px 24px 24px")}>
{(v.imp.isFormat) ? (<>
<div style={css("display:flex;flex-direction:column;gap:16px")}>
<span style={css("font-size:14px;line-height:1.5;color:#aab0ba;text-wrap:pretty")}>{"Pick the format first. It sets the deck size and copy limit, and decides how the list is read."}</span>
<div role="radiogroup" aria-label="Deck format" style={css("display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:14px")}>
{(v.imp.fmts ?? []).map((f: any, $index: number) => (<React.Fragment key={$index}>
<button role="radio" aria-checked={f.pressed} onClick={f.pick} onDoubleClick={f.go} style={css(`position:relative;display:flex;flex-direction:column;padding:0;border:0;border-radius:10px;overflow:hidden;background:#111317;cursor:pointer;text-align:left;box-shadow:${str(f.ring)};transition:box-shadow .15s,transform .15s`)} className={cx('', pc([['hover', "transform:translateY(-2px)"]]))}>
<span style={css(`position:relative;display:block;height:140px;background:#1a1f27 url('${str(f.art)}') center 28%/cover`)}>
<span style={css("position:absolute;inset:0;background:linear-gradient(0deg,#111317 4%,rgba(17,19,23,0) 70%)")} />
<span style={css(`position:absolute;top:12px;right:12px;width:22px;height:22px;box-sizing:border-box;display:grid;place-items:center;border-radius:50%;border:2px solid ${str(f.dotB)};background:rgba(10,11,13,.75)`)}><span style={css(`width:10px;height:10px;border-radius:50%;background:${str(f.dot)}`)} /></span>
</span>
<span style={css("position:relative;display:flex;flex-direction:column;gap:12px;margin-top:-26px;padding:0 18px 18px")}>
<span style={css("display:flex;justify-content:space-between;align-items:baseline;gap:10px")}>
<span style={css("font-family:Cinzel,serif;font-size:24px;font-weight:700;color:#f4efe4;text-shadow:0 2px 10px #000")}>{show(f.name)}</span>
<span style={css("font-family:Cinzel,serif;font-size:14px;font-weight:800;white-space:nowrap;color:#f7dc9a")}>{show(f.size)}</span>
</span>
<span style={css("display:flex;flex-direction:column;gap:7px")}>
{(f.rules ?? []).map((ru: any, $index: number) => (<React.Fragment key={$index}>
<span style={css("display:flex;gap:10px;align-items:flex-start;font-size:13px;line-height:1.45;color:#c3c8d0")}><span style={css("flex:none;width:6px;height:6px;margin-top:7px;transform:rotate(45deg);background:#c9a050")} /><span style={css("flex:1;min-width:0;text-wrap:pretty")}>{show(ru)}</span></span>
</React.Fragment>))}
</span>
</span>
</button>
</React.Fragment>))}
</div>
</div>
</>) : null}
{(v.imp.isSource) ? (<>
<div style={css("display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));gap:24px;align-items:start")}>
<div style={css("display:flex;flex-direction:column;gap:14px;min-width:0")}>
<div style={css("display:flex;align-items:center;justify-content:space-between;gap:10px")}>
<span style={css("display:flex;align-items:center;gap:9px;font-family:Cinzel,serif;font-size:15px;font-weight:700;white-space:nowrap;color:#f7dc9a")}><span style={css("width:7px;height:7px;transform:rotate(45deg);background:#f0a93b")} />{show(v.imp.fmtName)}<span style={css("font-family:Manrope,sans-serif;font-size:12px;font-weight:600;color:#8a909b")}>{show(v.imp.fmtSize)}</span></span>
<button onClick={v.imp.back} style={css("padding:4px 0;border:0;background:transparent;cursor:pointer;font-size:13px;font-weight:600;white-space:nowrap;color:#f0a93b")} className={cx('', pc([['hover', "color:#f7dc9a"]]))}>{"Change format"}</button>
</div>
<div role="tablist" aria-label="Import from" style={css("display:grid;gap:2px;padding:3px;border-radius:8px;background:#0b0c0f;grid-template-columns:repeat(3,minmax(0,1fr))")}>
{(v.imp.tabs ?? []).map((t: any, $index: number) => (<React.Fragment key={$index}>
<button role="tab" aria-selected={t.pressed} onClick={t.pick} style={css(`height:34px;border:0;border-radius:6px;background:${str(t.bg)};cursor:pointer;font-size:13px;font-weight:600;white-space:nowrap;color:${str(t.c)}`)}>{show(t.label)}</button>
</React.Fragment>))}
</div>
{(v.imp.isPaste) ? (<>
<div style={css("display:flex;flex-direction:column;gap:8px")}>
<textarea ref={v.taRef} value={v.imp.text} onChange={v.imp.setText} spellCheck="false" placeholder={v.imp.ph} aria-label="Decklist text" style={css("box-sizing:border-box;width:100%;height:290px;resize:vertical;padding:14px;border:1px solid transparent;border-radius:8px;background:#0b0c0f;box-shadow:inset 0 1px 3px rgba(0,0,0,.6);font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;line-height:1.6;color:#e7ebf1")} className={cx('', pc([['focus', "border-color:rgba(240,169,59,.6);outline:none"]]))} />
<span style={css("font-size:12px;line-height:1.5;color:#7d8491;text-wrap:pretty")}>{"Reads exports from MTG Arena, MTGO, Moxfield and Archidekt. “4” or “4x” quantities, set codes, foil marks, “SB:” lines and Commander, Deck and Sideboard headers all work."}</span>
</div>
</>) : null}
{(v.imp.isLink) ? (<>
<div style={css("display:flex;flex-direction:column;gap:12px")}>
<div style={css("display:flex;gap:8px")}>
<input value={v.imp.url} onChange={v.imp.setUrl} onKeyDown={v.imp.urlKey} placeholder="https://moxfield.com/decks/…" aria-label="Deck link" style={css("flex:1;min-width:0;box-sizing:border-box;height:42px;padding:0 14px;border-radius:8px;border:1px solid transparent;background:#0b0c0f;box-shadow:inset 0 1px 3px rgba(0,0,0,.6);font-size:14px;font-weight:500;color:#f4efe4")} className={cx('', pc([['focus', "border-color:rgba(240,169,59,.6);outline:none"]]))} />
<button onClick={v.imp.fetch} disabled={v.imp.noFetch} style={css(`height:40px;padding:0 22px;border:1px solid #f7dc9a;border-radius:8px;background:linear-gradient(180deg,#f5b44b,#b8621a);box-shadow:inset 0 1px 0 rgba(255,240,200,.5);cursor:pointer;font-size:14px;font-weight:700;white-space:nowrap;color:#1b1206;height:42px;opacity:${str(v.imp.fetchOp)}`)} className={cx('', pc([['hover', "filter:brightness(1.1)"]]))}>{show(v.imp.fetchLabel)}</button>
</div>
{(v.imp.hasUrlMsg) ? (<>
<div role="status" style={css(`padding:10px 12px;border-radius:6px;background:${str(v.imp.urlMsgBg)};font-size:13px;line-height:1.5;color:${str(v.imp.urlMsgC)};text-wrap:pretty`)}>{show(v.imp.urlMsg)}</div>
</>) : null}
<div style={css("display:flex;flex-direction:column;gap:8px")}>
<span style={css("font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#8a909b")}>{"Works with"}</span>
<div style={css("display:flex;flex-wrap:wrap;gap:6px")}>
{(v.imp.sites ?? []).map((x: any, $index: number) => (<React.Fragment key={$index}>
<span style={css(`height:28px;padding:0 10px;display:flex;align-items:center;border-radius:6px;border:1px solid ${str(x.b)};background:${str(x.bg)};font-size:12px;font-weight:600;white-space:nowrap;color:${str(x.c)}`)}>{show(x.label)}</span>
</React.Fragment>))}
</div>
<span style={css("font-size:12px;line-height:1.5;color:#7d8491;text-wrap:pretty")}>{"The deck must be public. To check, open the link in a private window."}</span>
</div>
<button onClick={v.imp.toggleLinked} role="switch" aria-checked={v.imp.linked.pressed} style={css("display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 14px;border:0;border-radius:8px;background:rgba(255,255,255,.035);cursor:pointer;text-align:left")}>
<span style={css("display:flex;flex-direction:column;gap:3px")}>
<span style={css("font-size:13px;font-weight:700;color:#e7ebf1")}>{"Keep linked to this page"}</span>
<span style={css("font-size:12px;line-height:1.45;color:#8a909b")}>{"Press Resync later to pull in changes made there."}</span>
</span>
<span style={css(`flex:none;position:relative;width:38px;height:22px;border-radius:11px;background:${str(v.imp.linked.track)};box-shadow:inset 0 1px 3px rgba(0,0,0,.6);transition:background .15s`)}><span style={css(`position:absolute;top:3px;left:${str(v.imp.linked.x)};width:16px;height:16px;border-radius:50%;background:#f4efe4;transition:left .15s`)} /></span>
</button>
</div>
</>) : null}
{(v.imp.isFile) ? (<>
<div style={css("display:flex;flex-direction:column;gap:10px")}>
<label onDragOver={v.imp.dragOver} onDragLeave={v.imp.dragLeave} onDrop={v.imp.drop} style={css(`position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;min-height:230px;padding:20px;box-sizing:border-box;border-radius:10px;border:1.5px dashed ${str(v.imp.dropB)};background:${str(v.imp.dropBg)};cursor:pointer;text-align:center;transition:background .15s,border-color .15s`)} className={cx('', pc([['hover', "border-color:rgba(240,169,59,.6)"]]))}>
<input type="file" accept=".txt,.dec,.dek,.cod,.dck,.csv" onChange={v.imp.pickFile} aria-label="Choose a deck file" style={css("position:absolute;width:1px;height:1px;opacity:0")} />
<span style={css("font-family:Cinzel,serif;font-size:18px;font-weight:700;color:#f4efe4")}>{"Drop a deck file here"}</span>
<span style={css("font-size:13px;font-weight:600;color:#f0a93b")}>{"or click to choose one"}</span>
<span style={css("margin-top:6px;font-size:12px;line-height:1.6;color:#7d8491")}>{".txt and .dec text lists · .dek from MTGO"}<br />{".cod from Cockatrice · .dck from Forge · .csv"}</span>
</label>
{(v.imp.hasFileMsg) ? (<>
<div role="status" style={css(`padding:10px 12px;border-radius:6px;background:${str(v.imp.fileMsgBg)};font-size:13px;line-height:1.5;color:${str(v.imp.fileMsgC)};text-wrap:pretty`)}>{show(v.imp.fileMsg)}</div>
</>) : null}
</div>
</>) : null}
<div style={css("display:flex;flex-direction:column;gap:8px;padding-top:4px")}>
<span style={css("font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#8a909b")}>{"Your current deck"}</span>
<div role="radiogroup" aria-label="Replace or add" style={css("display:grid;gap:2px;padding:3px;border-radius:8px;background:#0b0c0f;grid-template-columns:repeat(2,minmax(0,1fr))")}>
{(v.imp.modes ?? []).map((m: any, $index: number) => (<React.Fragment key={$index}>
<button role="radio" aria-checked={m.pressed} disabled={m.off} onClick={m.pick} style={css(`height:32px;border:0;border-radius:6px;background:${str(m.bg)};cursor:pointer;font-size:13px;font-weight:600;white-space:nowrap;color:${str(m.c)};opacity:${str(m.op)}`)}>{show(m.label)}</button>
</React.Fragment>))}
</div>
<span style={css("font-size:12px;line-height:1.5;color:#7d8491;text-wrap:pretty")}>{show(v.imp.modeHint)}</span>
</div>
</div>
<div style={css("display:flex;flex-direction:column;gap:14px;min-width:0;padding:16px;border-radius:10px;background:#0f1013;box-shadow:inset 0 0 0 1px rgba(255,255,255,.05)")}>
<div style={css("display:flex;justify-content:space-between;align-items:baseline;gap:10px")}>
<span style={css("font-family:Cinzel,serif;font-size:16px;font-weight:700;color:#f4efe4")}>{"Review"}</span>
<span style={css("font-size:12px;font-weight:600;white-space:nowrap;color:#8a909b")}>{show(v.imp.countTxt)}</span>
</div>
{(v.imp.empty) ? (<>
<div style={css("padding:56px 12px;text-align:center;font-size:13px;line-height:1.6;color:#7d8491;text-wrap:pretty")}>{show(v.imp.emptyTxt)}</div>
</>) : null}
{(v.imp.hasRows) ? (<>
<div style={css("display:flex;flex-direction:column;gap:7px;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,.06)")}>
{(v.imp.checks ?? []).map((k: any, $index: number) => (<React.Fragment key={$index}>
<div style={css("display:flex;align-items:center;gap:10px;font-size:13px;font-weight:600;color:#d6d9de")}>
<span style={css(`flex:none;width:18px;height:18px;display:grid;place-items:center;border-radius:50%;background:${str(k.bg)};font-size:11px;font-weight:800;color:${str(k.ic)}`)}>{show(k.icon)}</span>
<span style={css("flex:1;min-width:0")}>{show(k.label)}</span>
<span style={css(`font-variant-numeric:tabular-nums;white-space:nowrap;color:${str(k.vc)}`)}>{show(k.val)}</span>
</div>
</React.Fragment>))}
</div>
{(v.imp.needCmd) ? (<>
<label style={css("display:flex;flex-direction:column;gap:6px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#8a909b;color:#c9a050")}>{"Pick your commander "}<select value={v.imp.cmd} onChange={v.imp.setCmd} style={css("height:36px;padding:0 10px;border-radius:6px;border:1px solid rgba(240,169,59,.45);background:#17191e;font-size:13px;font-weight:600;letter-spacing:0;text-transform:none;color:#e7ebf1;cursor:pointer")}>
<option value="">{show(v.imp.cmdPh)}</option>
{(v.imp.cands ?? []).map((o: string) => (<option key={o} value={o}>{o}</option>))}
</select>
</label>
</>) : null}
<div style={css("display:flex;flex-direction:column;gap:14px;max-height:340px;overflow-y:auto;overflow-x:hidden;scrollbar-width:thin;scrollbar-color:#3a3f48 transparent;margin-right:-8px;padding-right:8px")}>
{(v.imp.secs ?? []).map((g: any, $index: number) => (<React.Fragment key={$index}>
<div style={css("display:flex;flex-direction:column;gap:2px")}>
<div style={css("display:flex;align-items:center;gap:8px;padding:0 6px 4px")}>
<span style={css("font-family:Cinzel,serif;font-size:11px;font-weight:700;letter-spacing:.16em;color:#c9a050")}>{show(g.label)}</span>
<span style={css("font-size:12px;font-weight:700;font-variant-numeric:tabular-nums;color:#7d8491")}>{show(g.n)}</span>
</div>
{(g.rows ?? []).map((rw: any, $index: number) => (<React.Fragment key={$index}>
<div style={css(`display:grid;grid-template-columns:28px minmax(0,1fr) auto;align-items:center;gap:8px;min-height:30px;padding:3px 6px;border-radius:5px;background:${str(rw.bg)}`)}>
<span style={css(`font-size:13px;font-weight:800;font-variant-numeric:tabular-nums;color:${str(rw.qc)}`)}>{show(rw.qty)}</span>
<span style={css("display:flex;flex-direction:column;min-width:0")}>
<span style={css(`font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${str(rw.nc)}`)}>{show(rw.name)}</span>
{(rw.hasSub) ? (<><span style={css("font-size:11px;line-height:1.35;color:#7d8491")}>{show(rw.sub)}</span></>) : null}
</span>
<span style={css("display:flex;gap:6px;align-items:center")}>
{(rw.hasFix) ? (<><button onClick={rw.fix} style={css("height:24px;padding:0 10px;border:1px solid rgba(240,169,59,.5);border-radius:12px;background:rgba(240,169,59,.12);cursor:pointer;font-size:11px;font-weight:700;white-space:nowrap;color:#f7dc9a")} className={cx('', pc([['hover', "background:rgba(240,169,59,.24)"]]))}>{show(rw.fixLabel)}</button></>) : null}
{(rw.hasTag) ? (<><span style={css(`height:20px;padding:0 8px;display:flex;align-items:center;border-radius:10px;background:${str(rw.tagBg)};font-size:11px;font-weight:700;white-space:nowrap;color:${str(rw.tagC)}`)}>{show(rw.tag)}</span></>) : null}
</span>
</div>
</React.Fragment>))}
</div>
</React.Fragment>))}
</div>
</>) : null}
</div>
</div>
</>) : null}
</div>
<div style={css("display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:14px 24px;border-top:1px solid rgba(255,255,255,.06);background:rgba(0,0,0,.2)")}>
<span style={css("font-size:12px;line-height:1.5;color:#8a909b")}>{show(v.imp.foot)}</span>
<div style={css("display:flex;gap:8px;flex-wrap:wrap")}>
<button onClick={v.imp.secondary} style={css("height:40px;padding:0 16px;border:0;border-radius:8px;background:rgba(255,255,255,.06);cursor:pointer;font-size:14px;font-weight:600;white-space:nowrap;color:#c3c8d0")} className={cx('', pc([['hover', "background:rgba(255,255,255,.11)"]]))}>{show(v.imp.secLabel)}</button>
{(v.imp.hasAlt) ? (<>
<button onClick={v.imp.alt} style={css("height:40px;padding:0 16px;border:0;border-radius:8px;background:rgba(255,255,255,.06);cursor:pointer;font-size:14px;font-weight:600;white-space:nowrap;color:#c3c8d0")} className={cx('', pc([['hover', "background:rgba(255,255,255,.11)"]]))}>{show(v.imp.altLabel)}</button>
</>) : null}
<button onClick={v.imp.primary} disabled={v.imp.noPrimary} style={css(`height:40px;padding:0 22px;border:1px solid #f7dc9a;border-radius:8px;background:linear-gradient(180deg,#f5b44b,#b8621a);box-shadow:inset 0 1px 0 rgba(255,240,200,.5);cursor:pointer;font-size:14px;font-weight:700;white-space:nowrap;color:#1b1206;opacity:${str(v.imp.primaryOp)}`)} className={cx('', pc([['hover', "filter:brightness(1.1)"]]))}>{show(v.imp.primaryLabel)}</button>
</div>
</div>
</div>
</div>
</>) : null}
</div>
    </>
  );
}

