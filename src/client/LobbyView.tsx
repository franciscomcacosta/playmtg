// Generated from the Claude Design file "Lobby v3.dc.html" by conv.mjs, then wired to live data.
import React from 'react';
import { css, pc, cx, str, show } from './dc';

export const LobbyView_CSS = "html,body{margin:0;background:#050607} a{color:#f0a93b;text-decoration:none} a:hover{color:#f5c77a} button,input{font-family:inherit} button:disabled{cursor:not-allowed}";

export function LobbyView({ v }: { v: any }) {
  return (
    <>
<div ref={v.rootRef} style={css("position:relative;min-height:max(100vh,740px);overflow:hidden;background:#050607;color:#e7ebf1;font-family:Manrope,system-ui,sans-serif;display:grid;grid-template-rows:auto minmax(0,1fr) auto")}>
<div aria-hidden="true" style={css("position:absolute;inset:0;pointer-events:none")}>
{(v.slides ?? []).map((sl: any, $index: number) => (<React.Fragment key={$index}>
<div style={css(`position:absolute;inset:0;opacity:${str(sl.op)};transition:opacity 1.2s`)}>
<div data-kb={sl.i} style={css(`position:absolute;inset:-4%;background:#0b0d10 url('${str(sl.art)}') ${str(sl.pos)}/cover;filter:brightness(.9)`)} />
</div>
</React.Fragment>))}
<div style={css("position:absolute;inset:0;background:linear-gradient(90deg,rgba(5,6,7,.94) 0%,rgba(5,6,7,.72) 30%,rgba(5,6,7,.1) 60%,rgba(5,6,7,.55) 100%)")} />
<div style={css("position:absolute;inset:0;background:linear-gradient(0deg,#050607 0%,rgba(5,6,7,.9) 22%,rgba(5,6,7,0) 52%),linear-gradient(180deg,rgba(5,6,7,.85) 0%,rgba(5,6,7,0) 16%)")} />
<div style={css("position:absolute;inset:0;box-shadow:inset 0 0 220px 40px rgba(0,0,0,.75)")} />
</div>
{(v.anyPop) ? (<>
<div onClick={v.closePops} style={css("position:fixed;inset:0;z-index:15")} />
</>) : null}
<header data-in="0" style={css("position:relative;z-index:20;display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap;padding:18px 36px 0")}>
<div style={css("display:flex;align-items:center;gap:34px;flex-wrap:wrap")}>
<span style={css("font-family:Cinzel,serif;font-size:19px;font-weight:800;letter-spacing:.34em;white-space:nowrap;color:#f7dc9a;text-shadow:0 2px 12px rgba(0,0,0,.8)")}>{"PLAYMTG"}</span>
<nav aria-label="Main" style={css("display:flex;align-items:center;gap:4px")}>
<a href="/" aria-current="page" style={css("position:relative;padding:10px 14px;font-family:Cinzel,serif;font-size:12px;font-weight:700;letter-spacing:.18em;color:#f7dc9a")}>{"HOME"}<span style={css("position:absolute;left:50%;bottom:0;width:6px;height:6px;margin-left:-3px;transform:rotate(45deg);background:#f0a93b;box-shadow:0 0 10px rgba(240,169,59,.9)")} /></a>
<a href="/decks" style={css("padding:10px 14px;font-family:Cinzel,serif;font-size:12px;font-weight:700;letter-spacing:.18em;color:#9aa3b0")} className={cx('', pc([['hover', "color:#e8cf9a"]]))}>{"DECKS"}</a>
<a href="/shop" style={css("padding:10px 14px;font-family:Cinzel,serif;font-size:12px;font-weight:700;letter-spacing:.18em;color:#9aa3b0")} className={cx('', pc([['hover', "color:#e8cf9a"]]))}>{"SHOP"}</a>
</nav>
</div>
<div style={css("display:flex;align-items:center;gap:14px;flex-wrap:wrap")}>
{(v.showDailyChip) ? (<>
<button onClick={v.openLogin} aria-label="Open daily reward" title="Daily reward" style={css("position:relative;width:30px;height:42px;padding:0;border:0;background:transparent;cursor:pointer")}>
<span data-bob="1" style={css("position:absolute;inset:0;border-radius:4px;box-shadow:0 0 16px rgba(240,169,59,.55)")}><mf-cardback tone={"lit"}></mf-cardback></span>
</button>
</>) : null}
{(v.signedIn) ? (<>
<div style={css("display:flex;align-items:center;gap:14px")}>
<div data-cur="gold" style={css("display:flex;align-items:center;gap:8px;height:34px;padding:0 6px 0 4px;border-radius:17px;background:rgba(5,6,7,.7);box-shadow:inset 0 0 0 1px rgba(201,160,80,.4)")}>
<mf-coin size={"26"}></mf-coin>
<span style={css("font-size:14px;font-weight:800;font-variant-numeric:tabular-nums;color:#f5e2b0")}>{show(v.goldTxt)}</span>
<a href="/treasury" aria-label="Get more gold" title="Get more gold" style={css("width:22px;height:22px;display:grid;place-items:center;border-radius:50%;background:rgba(240,169,59,.16);font-size:15px;font-weight:800;line-height:1;color:#f7dc9a")} className={cx('', pc([['hover', "background:rgba(240,169,59,.32)"]]))}>{"+"}</a>
</div>
<div data-cur="embers" style={css("display:flex;align-items:center;gap:6px;height:34px;padding:0 14px 0 4px;border-radius:17px;background:rgba(5,6,7,.7);box-shadow:inset 0 0 0 1px rgba(224,122,58,.4)")}>
<mf-ember size={"26"}></mf-ember>
<span style={css("font-size:14px;font-weight:800;font-variant-numeric:tabular-nums;color:#ffcfae")}>{show(v.embersTxt)}</span>
</div>
<div style={css("position:relative")}>
<button onClick={v.toggleSocial} aria-label="Friends" aria-expanded={v.socialExp} style={css("display:flex;align-items:center;gap:10px;height:40px;padding:0 4px 0 0;border:0;background:transparent;cursor:pointer;color:inherit")}>
<span style={css("display:flex")}>
{(v.friendStack ?? []).map((fs: any, $index: number) => (<React.Fragment key={$index}>
<span style={css(`width:30px;height:30px;margin-left:-9px;box-sizing:border-box;border-radius:50%;border:2px solid #050607;background:#1a212c url('${str(fs)}') center 25%/cover`)} />
</React.Fragment>))}
</span>
<span style={css("font-size:12px;font-weight:800;white-space:nowrap;color:#7fdcae")}>{show(v.friendsOnline)}</span>
</button>
{(v.socialOpen) ? (<>
<div role="dialog" aria-label="Friends" style={css("position:absolute;right:-60px;top:calc(100% + 12px);z-index:30;width:320px;display:flex;flex-direction:column;padding:14px 8px 8px;border-radius:6px;background:#0f1012;box-shadow:0 30px 70px rgba(0,0,0,.85),inset 0 0 0 1px rgba(201,160,80,.25)")}>
<div style={css("display:flex;justify-content:space-between;align-items:center;gap:10px;padding:0 10px 10px")}>
<span style={css("font-family:Cinzel,serif;font-size:13px;font-weight:700;letter-spacing:.2em;color:#c9a050")}>{"FRIENDS"}</span>
<button onClick={v.toggleAdd} style={css("padding:4px 0;border:0;background:transparent;cursor:pointer;font-size:12px;font-weight:700;color:#f0a93b")} className={cx('', pc([['hover', "color:#f7dc9a"]]))}>{"Add friend"}</button>
</div>
{(v.addOpen) ? (<>
<div style={css("display:flex;gap:6px;padding:0 10px 10px")}>
<input value={v.addName} onChange={v.onAdd} onKeyDown={v.addKey} placeholder="Player name" aria-label="Player name" style={css("flex:1;min-width:0;height:34px;padding:0 10px;border-radius:4px;border:1px solid rgba(255,255,255,.1);background:#050607;color:#f0e6d0;font-size:13px;font-weight:600;outline:none")} className={cx('', pc([['focus', "border-color:#c9a050"]]))} />
<button onClick={v.sendAdd} disabled={v.noAdd} style={css(`height:34px;padding:0 12px;border:0;border-radius:4px;background:#c9862a;cursor:pointer;font-size:12px;font-weight:800;color:#1b1206;opacity:${str(v.addOp)}`)}>{"Send"}</button>
</div>
</>) : null}
{(v.friends ?? []).map((fr: any, $index: number) => (<React.Fragment key={$index}>
<div style={css(`display:flex;align-items:center;gap:11px;padding:7px 10px;border-radius:4px;opacity:${str(fr.op)}`)} className={cx('', pc([['hover', "background:rgba(255,255,255,.035)"]]))}>
<span style={css(`position:relative;flex:none;width:36px;height:36px;border-radius:50%;background:#1a212c url('${str(fr.art)}') center 25%/cover;box-shadow:0 0 0 2px ${str(fr.dot)}`)} />
<span style={css("display:flex;flex-direction:column;gap:1px;flex:1;min-width:0")}>
<span style={css("font-size:13px;font-weight:700;color:#e7ebf1")}>{show(fr.name)}</span>
<span style={css(`font-size:11px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${str(fr.sc)}`)}>{show(fr.status)}</span>
</span>
{(fr.canWatch) ? (<>
<a href="/table" onClick={fr.watch} style={css("font-size:12px;font-weight:700;white-space:nowrap;color:#c8d0dc")} className={cx('', pc([['hover', "color:#f7dc9a"]]))}>{"Watch"}</a>
</>) : null}
{(fr.canChallenge) ? (<>
<button onClick={fr.challenge} disabled={fr.sent} style={css(`padding:4px 0;border:0;background:transparent;cursor:pointer;font-size:12px;font-weight:800;white-space:nowrap;color:${str(fr.cc)}`)} className={cx('', pc([['hover', "color:#f7dc9a"]]))}>{show(fr.cLabel)}</button>
</>) : null}
</div>
</React.Fragment>))}
</div>
</>) : null}
</div>
<div style={css("position:relative")}>
<button onClick={v.toggleBell} aria-label="Notifications" aria-expanded={v.bellExp} style={css("position:relative;width:38px;height:38px;border:0;border-radius:50%;background:rgba(5,6,7,.7);box-shadow:inset 0 0 0 1px rgba(255,255,255,.12);cursor:pointer;display:grid;place-items:center")} className={cx('', pc([['hover', "box-shadow:inset 0 0 0 1px #c9a050"]]))}>
<span style={css("position:relative;display:block;width:14px;height:16px")}>
<span style={css("position:absolute;left:0;right:0;top:1px;height:11px;box-sizing:border-box;border:2px solid #c8d0dc;border-bottom:0;border-radius:7px 7px 2px 2px")} />
<span style={css("position:absolute;left:-2px;right:-2px;top:11px;height:2px;border-radius:1px;background:#c8d0dc")} />
<span style={css("position:absolute;left:5px;top:14px;width:4px;height:3px;border-radius:0 0 2px 2px;background:#c8d0dc")} />
</span>
{(v.hasUnread) ? (<>
<span style={css("position:absolute;top:-2px;right:-2px;min-width:17px;height:17px;padding:0 4px;box-sizing:border-box;display:grid;place-items:center;border-radius:9px;background:#c23a24;box-shadow:0 0 0 2px #050607;font-size:10px;font-weight:800;color:#fff")}>{show(v.unread)}</span>
</>) : null}
</button>
{(v.bellOpen) ? (<>
<div role="dialog" aria-label="Notifications" style={css("position:absolute;right:0;top:calc(100% + 12px);z-index:30;width:330px;display:flex;flex-direction:column;border-radius:6px;overflow:hidden;background:#0f1012;box-shadow:0 30px 70px rgba(0,0,0,.85),inset 0 0 0 1px rgba(201,160,80,.25)")}>
<span style={css("padding:14px 16px 10px;font-family:Cinzel,serif;font-size:13px;font-weight:700;letter-spacing:.2em;color:#c9a050")}>{"NOTICES"}</span>
{(v.noNotes) ? (<>
<div style={css("padding:20px 16px 26px;text-align:center;font-size:13px;color:#7d8491")}>{"Nothing new."}</div>
</>) : null}
{(v.notes ?? []).map((n: any, $index: number) => (<React.Fragment key={$index}>
<div style={css("display:flex;gap:12px;align-items:flex-start;padding:12px 16px;border-top:1px solid rgba(255,255,255,.05)")}>
<span style={css(`flex:none;width:34px;height:34px;border-radius:50%;background:#1a212c url('${str(n.art)}') center 25%/cover`)} />
<span style={css("display:flex;flex-direction:column;gap:6px;min-width:0;flex:1")}>
<span style={css("font-size:13px;font-weight:600;line-height:1.45;color:#e7ebf1;text-wrap:pretty")}>{show(n.text)}</span>
<span style={css("display:flex;align-items:center;gap:14px")}>
<span style={css("font-size:11px;font-weight:600;color:#6b7280")}>{show(n.time)}</span>
{(n.hasActs) ? (<>
<button onClick={n.yes} style={css("padding:0;border:0;background:transparent;cursor:pointer;font-size:12px;font-weight:800;color:#f0a93b")} className={cx('', pc([['hover', "color:#f7dc9a"]]))}>{show(n.yesLabel)}</button>
<button onClick={n.no} style={css("padding:0;border:0;background:transparent;cursor:pointer;font-size:12px;font-weight:600;color:#7d8491")} className={cx('', pc([['hover', "color:#c3c8d0"]]))}>{show(n.noLabel)}</button>
</>) : null}
</span>
</span>
</div>
</React.Fragment>))}
</div>
</>) : null}
</div>
<div style={css("position:relative")}>
<button onClick={v.toggleProfile} aria-label="Profile and season" style={css("display:flex;align-items:center;gap:12px;padding:0;border:0;background:transparent;cursor:pointer;text-align:left;color:inherit")}>
<span style={css("display:flex;flex-direction:column;align-items:flex-end;gap:5px")}>
<span style={css("font-size:13px;font-weight:800;white-space:nowrap;color:#f4efe4")}>{show(v.name)}</span>
<span style={css("display:flex;align-items:center;gap:7px")}>
<span style={css("font-family:Cinzel,serif;font-size:10px;font-weight:700;letter-spacing:.14em;white-space:nowrap;color:#f0a070")}>{"LV "}{show(v.level)}</span>
<span style={css("width:64px;height:3px;background:rgba(255,255,255,.12)")}><span style={css(`display:block;height:100%;width:${str(v.xpPct)};background:linear-gradient(90deg,#c2491a,#ffb070);box-shadow:0 0 6px rgba(240,122,58,.8)`)} /></span>
</span>
</span>
<span style={css("flex:none;width:46px;height:46px;border-radius:50%;padding:2px;box-sizing:border-box;background:conic-gradient(from 20deg,#f7dc9a,#6b4e1e,#e8c46a,#4a3418,#f7dc9a);box-shadow:0 6px 16px rgba(0,0,0,.6)")}>
<span style={css(`display:block;width:100%;height:100%;border-radius:50%;background:#1a212c url('${str(v.youArt)}') 55% 20%/cover`)} />
</span>
</button>
{(v.profileOpen) ? (<>
<div style={css("position:absolute;right:0;top:calc(100% + 12px);z-index:30;width:340px;display:flex;flex-direction:column;gap:16px;padding:18px;border-radius:6px;background:#0f1012;box-shadow:0 30px 70px rgba(0,0,0,.85),inset 0 0 0 1px rgba(201,160,80,.25)")}>
<div style={css("display:flex;flex-direction:column;gap:6px")}>
<span style={css("font-family:Cinzel,serif;font-size:11px;font-weight:700;letter-spacing:.26em;color:#f0a070")}>{"SEASON OF EMBERS"}</span>
<span style={css("display:flex;justify-content:space-between;align-items:baseline;gap:10px")}><span style={css("font-family:Cinzel,serif;font-size:22px;font-weight:700;color:#f4efe4")}>{"Level "}{show(v.level)}</span><span style={css("font-size:12px;font-weight:700;color:#8d98a8")}>{show(v.xpTxt)}</span></span>
<span style={css("font-size:12px;color:#7d8491")}>{"Ends in "}{show(v.seasonLeft)}{". Quests and wins give XP."}</span>
</div>
<div style={css("display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px")}>
{(v.track ?? []).map((r: any, $index: number) => (<React.Fragment key={$index}>
<div style={css(`display:flex;flex-direction:column;align-items:center;gap:6px;opacity:${str(r.op)}`)}>
<div style={css(`position:relative;width:100%;aspect-ratio:5/7;box-sizing:border-box;display:grid;place-items:center;border-radius:4px;border:1px solid ${str(r.border)};background:#16130f`)}>
{(r.isGold) ? (<><mf-coin size={"30"}></mf-coin></>) : null}
{(r.isEmber) ? (<><mf-ember size={"30"}></mf-ember></>) : null}
{(r.isArt) ? (<><span style={css(`position:absolute;inset:3px;border-radius:2px;background:#1a212c url('${str(r.art)}') center 25%/cover`)} /></>) : null}
{(r.got) ? (<><span style={css("position:absolute;right:-5px;top:-5px;width:17px;height:17px;display:grid;place-items:center;border-radius:50%;background:#16352a;border:1px solid #7ef0b8;font-size:10px;font-weight:800;color:#9af5c8")}>{"✓"}</span></>) : null}
</div>
<span style={css(`font-family:Cinzel,serif;font-size:10px;font-weight:700;color:${str(r.lc)}`)}>{"LV "}{show(r.lv)}</span>
</div>
</React.Fragment>))}
</div>
<label style={css("display:flex;flex-direction:column;gap:6px;padding-top:14px;border-top:1px solid rgba(255,255,255,.06)")}>
<span style={css("font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#7d8491")}>{"Player name"}</span>
<input value={v.name} onChange={v.onName} maxLength={24} style={css("height:36px;padding:0 10px;border-radius:4px;border:1px solid rgba(255,255,255,.1);background:#050607;color:#f0e6d0;font-size:14px;font-weight:700;outline:none")} className={cx('', pc([['focus', "border-color:#c9a050"]]))} />
</label>
<button onClick={v.signOut} style={css("align-self:flex-start;padding:0;border:0;background:transparent;cursor:pointer;font-size:12px;font-weight:700;color:#8d98a8")} className={cx('', pc([['hover', "color:#e7ebf1"]]))}>{"Sign out"}</button>
</div>
</>) : null}
</div>
</div>
</>) : null}
{(v.isGuest) ? (<>
<button onClick={v.signIn} style={css("height:38px;padding:0 22px;border:1px solid #c9a050;border-radius:2px;background:rgba(5,6,7,.7);cursor:pointer;font-family:Cinzel,serif;font-size:12px;font-weight:800;letter-spacing:.2em;color:#f7dc9a")} className={cx('', pc([['hover', "background:rgba(240,169,59,.15)"]]))}>{"SIGN IN"}</button>
</>) : null}
</div>
</header>
<main style={css(`position:relative;z-index:${str(v.mainZ)};display:grid;grid-template-columns:${str(v.lay.cols)};grid-template-rows:${str(v.lay.rows)};column-gap:28px;padding:0 36px`)}>
<section data-in="1" aria-label="Featured" onMouseEnter={v.heroEnter} onMouseLeave={v.heroLeave} style={css(`grid-area:${str(v.lay.feat)};align-self:center;display:flex;flex-direction:column;gap:16px;max-width:580px;padding:28px 0`)}>
{(v.slides ?? []).map((sl: any, $index: number) => (<React.Fragment key={$index}>
{(sl.on) ? (<>
<div data-slide="1" style={css("display:flex;flex-direction:column;gap:16px")}>
<span style={css("display:flex;align-items:center;gap:14px;font-family:Cinzel,serif;font-size:12px;font-weight:700;letter-spacing:.34em;color:#c9a050")}><span style={css("width:28px;height:1px;background:#c9a050")} />{show(sl.kicker)}</span>
<span style={css("font-family:Cinzel,serif;font-size:clamp(44px,5.2vw,80px);font-weight:700;line-height:.94;letter-spacing:-.01em;color:#f6f0e2;text-shadow:0 6px 40px rgba(0,0,0,.8);text-wrap:balance")}>{show(sl.title)}</span>
<span style={css("font-size:15px;line-height:1.6;color:#c9cfd8;max-width:460px;text-wrap:pretty;text-shadow:0 1px 8px rgba(0,0,0,.8)")}>{show(sl.body)}</span>
<span style={css("font-size:13px;font-weight:700;color:#e8cf9a;text-shadow:0 1px 8px rgba(0,0,0,.8)")}>{show(sl.meta)}</span>
<div style={css("display:flex;align-items:center;gap:22px;padding-top:6px;flex-wrap:wrap")}>
{(sl.isLink) ? (<>
<a href={sl.href} style={css("display:flex;align-items:center;gap:12px;height:46px;padding:0 26px;border:1px solid #c9a050;background:rgba(5,6,7,.55);font-family:Cinzel,serif;font-size:13px;font-weight:800;letter-spacing:.18em;white-space:nowrap;color:#f7dc9a")} className={cx('', pc([['hover', "background:rgba(240,169,59,.16)"]]))}>{show(sl.cta)}</a>
</>) : null}
{(sl.isAct) ? (<>
<button onClick={sl.act} disabled={sl.off} style={css(`display:flex;align-items:center;gap:12px;height:46px;padding:0 26px;border:1px solid #c9a050;background:rgba(5,6,7,.55);cursor:pointer;font-family:Cinzel,serif;font-size:13px;font-weight:800;letter-spacing:.18em;white-space:nowrap;color:#f7dc9a;opacity:${str(sl.btnOp)}`)} className={cx('', pc([['hover', "background:rgba(240,169,59,.16)"]]))}>{show(sl.cta)}</button>
</>) : null}
</div>
</div>
</>) : null}
</React.Fragment>))}
<div role="tablist" aria-label="Featured" style={css("display:flex;align-items:center;gap:18px;padding-top:14px")}>
{(v.slideTabs ?? []).map((t: any, $index: number) => (<React.Fragment key={$index}>
<button role="tab" aria-selected={t.cur} onClick={t.pick} aria-label={t.aria} style={css(`display:flex;align-items:center;gap:9px;padding:6px 0;border:0;background:transparent;cursor:pointer;font-size:12px;font-weight:700;white-space:nowrap;color:${str(t.c)}`)} className={cx('', pc([['hover', "color:#f4efe4"]]))}>
<span style={css(`width:8px;height:8px;box-sizing:border-box;transform:rotate(45deg);border:1px solid ${str(t.dotB)};background:${str(t.dot)}`)} />{show(t.label)}{" "}</button>
</React.Fragment>))}
</div>
</section>
<section data-in="2" aria-label="Quests" style={css(`grid-area:${str(v.lay.quests)};align-self:end;display:flex;flex-direction:column;gap:6px;padding-bottom:30px;max-width:420px`)}>
{(v.signedIn) ? (<>
<div style={css("display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:0 0 6px 2px")}>
<span style={css("font-family:Cinzel,serif;font-size:13px;font-weight:700;letter-spacing:.26em;color:#c9a050")}>{"QUESTS"}</span>
<span style={css("font-size:11px;font-weight:700;color:#7d8491")}>{"New in "}<span style={css("font-variant-numeric:tabular-nums;color:#c8bca6")}>{show(v.resetIn)}</span></span>
</div>
{(v.quests ?? []).map((q: any, $index: number) => (<React.Fragment key={$index}>
<div data-quest={q.id} style={css(`position:relative;display:flex;align-items:center;gap:14px;min-height:62px;padding:8px 10px 8px 6px;background:${str(q.bg)};clip-path:polygon(0 0,calc(100% - 14px) 0,100% 50%,calc(100% - 14px) 100%,0 100%)`)}>
<button onClick={q.claim} disabled={q.noClaim} aria-label={q.sealAria} style={css(`position:relative;flex:none;width:48px;height:48px;padding:0;border:0;border-radius:50%;cursor:${str(q.sealCursor)};background:${str(q.seal)};box-shadow:${str(q.sealGlow)};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0`)}>
<span style={css(`position:absolute;inset:4px;border-radius:50%;border:1px dashed ${str(q.sealRing)}`)} />
<span style={css(`position:relative;font-family:Cinzel,serif;font-size:13px;font-weight:800;line-height:1;color:${str(q.sealC)}`)}>{show(q.sealTop)}</span>
<span style={css(`position:relative;font-size:8px;font-weight:800;letter-spacing:.1em;line-height:1.4;color:${str(q.sealC)};opacity:.85`)}>{show(q.sealSub)}</span>
</button>
<div style={css("flex:1;display:flex;flex-direction:column;gap:7px;min-width:0")}>
<span style={css(`font-size:13px;font-weight:700;line-height:1.35;color:${str(q.tc)};text-wrap:pretty`)}>{show(q.title)}</span>
<span style={css("display:flex;align-items:center;gap:10px")}>
<span style={css("position:relative;flex:1;height:2px;background:rgba(255,255,255,.12)")}><span style={css(`position:absolute;left:0;top:0;bottom:0;width:${str(q.pct)};background:${str(q.barBg)};transition:width .6s`)} /></span>
<span style={css(`font-size:11px;font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap;color:${str(q.pc)}`)}>{show(q.progTxt)}</span>
</span>
</div>
{(q.canReroll) ? (<>
<button onClick={q.reroll} title="Swap for another quest. Once per day." aria-label="Swap this quest" style={css("flex:none;width:26px;height:26px;margin-right:6px;border:0;border-radius:50%;background:transparent;cursor:pointer;font-size:15px;line-height:1;color:#6b7280")} className={cx('', pc([['hover', "color:#f7dc9a"]]))}>{"↻"}</button>
</>) : null}
</div>
</React.Fragment>))}
</>) : null}
{(v.isGuest) ? (<>
<div style={css("display:flex;flex-direction:column;gap:10px;padding:16px 18px;background:linear-gradient(90deg,rgba(20,16,12,.85),rgba(20,16,12,.2));clip-path:polygon(0 0,calc(100% - 14px) 0,100% 50%,calc(100% - 14px) 100%,0 100%)")}>
<span style={css("font-family:Cinzel,serif;font-size:16px;font-weight:700;color:#f4efe4")}>{"Playing as a guest"}</span>
<span style={css("font-size:13px;line-height:1.5;color:#aab3c0;padding-right:16px")}>{"Sign in for quests, daily rewards, season levels, ranked play and friends."}</span>
<button onClick={v.signIn} style={css("align-self:flex-start;padding:2px 0;border:0;background:transparent;cursor:pointer;font-size:13px;font-weight:800;color:#f0a93b")} className={cx('', pc([['hover', "color:#f7dc9a"]]))}>{"Sign in"}</button>
</div>
</>) : null}
</section>
<section data-in="3" aria-label="Events" style={css(`grid-area:${str(v.lay.events)};align-self:end;display:flex;flex-direction:column;align-items:center;gap:6px;min-width:0`)}>
<div style={css("display:flex;justify-content:center;align-items:flex-end;height:236px;padding:0 20px 0 calc(20px + clamp(14px,calc(10vw - 60px),56px))")}>
{(v.events ?? []).map((e: any, $index: number) => (<React.Fragment key={$index}>
<button onClick={e.pick} aria-label={e.aria} style={css(`position:relative;flex:none;width:clamp(128px,10vw,152px);aspect-ratio:63/88;margin-left:clamp(-56px,calc(60px - 10vw),-14px);padding:5px;box-sizing:border-box;border:0;border-radius:7px;background:#0b0b0c;cursor:pointer;text-align:left;color:inherit;transform-origin:50% 120%;transform:translateY(${str(e.ty)}) rotate(${str(e.rot)});box-shadow:0 18px 40px rgba(0,0,0,.7),${str(e.ring)};transition:transform .25s cubic-bezier(.2,.8,.2,1),box-shadow .25s`)} className={cx('', pc([['hover', "transform:translateY(-36px) rotate(0deg) scale(1.08);z-index:6;box-shadow:0 30px 60px rgba(0,0,0,.8),0 0 0 2px rgba(247,220,154,.7)"]]))}>
<span style={css("position:relative;isolation:isolate;display:flex;flex-direction:column;gap:3px;height:100%;padding:4px;box-sizing:border-box;border-radius:4px")}>
<mf-frame color={str(e.fid)} finish={str(e.finish)}></mf-frame>
<span style={css("display:flex;justify-content:space-between;align-items:center;gap:4px;height:15%;min-height:16px;padding:0 6px;border-radius:3px;background:linear-gradient(180deg,#efe6d2,#cdbf9f);box-shadow:inset 0 0 0 1px rgba(0,0,0,.35)")}>
<span style={css("font-family:Cinzel,serif;font-size:clamp(9px,.78vw,11px);font-weight:800;line-height:1.05;color:#16120c;white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>{show(e.title)}</span>
</span>
<span style={css(`position:relative;flex:1;border-radius:2px;background:#1a1f27 url('${str(e.art)}') center 30%/cover;box-shadow:inset 0 0 0 1px rgba(0,0,0,.6)`)}><span style={css(`position:absolute;right:3px;top:3px;height:15px;padding:0 5px;display:flex;align-items:center;border-radius:2px;background:rgba(10,10,12,.85);font-size:9px;font-weight:800;letter-spacing:.04em;color:${str(e.costC)}`)}>{show(e.cost)}</span></span>
<span style={css("height:11%;min-height:13px;display:flex;align-items:center;padding:0 6px;border-radius:3px;background:linear-gradient(180deg,#efe6d2,#cdbf9f);font-family:Cinzel,serif;font-size:clamp(8px,.66vw,10px);font-weight:700;white-space:nowrap;overflow:hidden;color:#16120c")}>{show(e.type)}</span>
<span style={css("position:relative;height:28%;padding:5px 6px;box-sizing:border-box;border-radius:2px;background:#e9e0cc;font-size:clamp(8px,.68vw,10px);font-weight:600;line-height:1.3;color:#221c12;overflow:hidden")}>{show(e.text)}{" "}<span style={css("position:absolute;right:-2px;bottom:-4px;height:16px;padding:0 6px;display:flex;align-items:center;border-radius:3px;background:linear-gradient(180deg,#efe6d2,#bfb08e);box-shadow:0 0 0 1px rgba(0,0,0,.5);font-family:Cinzel,serif;font-size:9px;font-weight:800;color:#16120c")}>{show(e.pt)}</span>
</span>
</span>
</button>
</React.Fragment>))}
</div>
<span style={css("padding:26px 0 12px;font-size:10px;line-height:1.4;text-align:center;color:#3f4652")}>{"Unofficial fan project. Card art and names © Wizards of the Coast, via Scryfall."}</span>
</section>
<section data-in="2" data-play="1" aria-label="Play" style={css(`grid-area:${str(v.lay.play)};align-self:end;position:relative;display:flex;flex-direction:column;gap:16px;padding:0 0 30px`)}>
<div aria-hidden="true" style={css("position:absolute;left:-60px;right:-60px;bottom:-40px;top:-40px;z-index:-1;background:radial-gradient(closest-side,rgba(5,6,7,.85),rgba(5,6,7,0))")} />
<div style={css("position:relative")}>
<button onClick={v.toggleMode} disabled={v.busy} aria-expanded={v.modeExp} aria-label="Choose game mode" style={css("display:flex;align-items:flex-end;justify-content:space-between;gap:12px;width:100%;padding:0 0 12px;border:0;border-bottom:1px solid rgba(255,255,255,.1);background:transparent;cursor:pointer;text-align:left;color:inherit")} className={cx('', pc([['hover', "border-bottom-color:rgba(201,160,80,.6)"]]))}>
<span style={css("display:flex;flex-direction:column;gap:5px;min-width:0")}>
<span style={css("font-family:Cinzel,serif;font-size:10px;font-weight:700;letter-spacing:.26em;color:#8d98a8")}>{"GAME MODE"}</span>
<span style={css("display:flex;align-items:center;gap:10px")}><span style={css("font-family:Cinzel,serif;font-size:24px;font-weight:700;line-height:1.05;color:#f7dc9a")}>{show(v.cur.name)}</span>{(v.cur.ranked) ? (<><mf-rank tier={str(v.cur.tier)} division={str(v.cur.division)} size={"34"} title={"Gold 2"}></mf-rank></>) : null}</span>
<span style={css("font-size:12px;font-weight:600;color:#aab3c0")}>{show(v.cur.sub)}</span>
</span>
<span aria-hidden="true" style={css(`flex:none;width:8px;height:8px;margin:0 6px 10px 0;border-right:2px solid #c9a050;border-bottom:2px solid #c9a050;transform:rotate(${str(v.modeRot)})`)} />
</button>
{(v.modeOpen) ? (<>
<div role="listbox" aria-label="Game modes" style={css("position:absolute;left:0;right:0;top:calc(100% + 8px);z-index:30;display:flex;flex-direction:column;padding:6px;border-radius:6px;background:#0f1012;box-shadow:0 30px 70px rgba(0,0,0,.85),inset 0 0 0 1px rgba(201,160,80,.25)")}>
{(v.modeRows ?? []).map((m: any, $index: number) => (<React.Fragment key={$index}>
<button role="option" aria-selected={m.selStr} onClick={m.pick} disabled={m.off} style={css(`display:flex;align-items:center;gap:12px;padding:8px 10px;border:0;border-radius:4px;background:${str(m.bg)};cursor:pointer;text-align:left;color:inherit;opacity:${str(m.op)}`)} className={cx('', pc([['hover', "background:rgba(255,255,255,.05)"]]))}>
<span style={css(`flex:none;width:30px;height:42px;padding:2px;box-sizing:border-box;border-radius:3px;background:${str(m.frame)}`)}><span style={css(`display:block;height:100%;border-radius:2px;background:#1a1f27 url('${str(m.art)}') center 30%/cover`)} /></span>
<span style={css("display:flex;flex-direction:column;gap:2px;flex:1;min-width:0")}>
<span style={css("font-family:Cinzel,serif;font-size:14px;font-weight:700;color:#f4efe4")}>{show(m.name)}</span>
<span style={css("font-size:11px;font-weight:600;color:#8d98a8")}>{show(m.sub)}</span>
</span>
{(m.sel) ? (<><span style={css("width:7px;height:7px;transform:rotate(45deg);background:#f0a93b")} /></>) : null}
</button>
</React.Fragment>))}
</div>
</>) : null}
</div>
{(v.isDraft) ? (<>
<div style={css("display:flex;align-items:center;gap:20px;padding:4px 0")}>
<span style={css("position:relative;flex:none;width:86px;height:118px;margin-left:8px")}>
<span style={css("position:absolute;inset:0;transform:translate(-18px,6px) rotate(-11deg)")}><mf-pack art={str(v.draftArt2)} color={"red"} motion={"none"}></mf-pack></span>
<span style={css("position:absolute;inset:0;transform:translate(18px,6px) rotate(11deg)")}><mf-pack art={str(v.draftArt3)} color={"green"} motion={"none"}></mf-pack></span>
<span style={css("position:absolute;inset:0")}><mf-pack art={str(v.draftArt)} name={"3 PACKS"} color={"blue"}></mf-pack></span>
</span>
<span style={css("display:flex;flex-direction:column;gap:6px;flex:1;min-width:0")}>
<span style={css("font-family:Cinzel,serif;font-size:10px;font-weight:700;letter-spacing:.26em;color:#8d98a8")}>{"NO DECK NEEDED"}</span>
<span style={css("font-size:13px;line-height:1.5;color:#c9cfd8;text-wrap:pretty")}>{"Draft three packs with three other players, build 40 cards, play three rounds. Keep every pick."}</span>
<span style={css("font-size:12px;font-weight:700;color:#ffcfae")}>{show(v.draftStatus)}</span>
</span>
</div>
</>) : null}
{(v.needsDeck) ? (<>
<div style={css("position:relative")}>
<button onClick={v.toggleDeck} disabled={v.busy} aria-expanded={v.deckExp} aria-label="Choose deck" style={css("display:flex;align-items:center;gap:20px;width:100%;padding:4px 0;border:0;background:transparent;cursor:pointer;text-align:left;color:inherit")}>
<span data-deckbox="1" style={css("position:relative;flex:none;width:86px;height:118px;margin-left:8px")}>
<span style={css("position:absolute;inset:0;transform:translate(9px,-6px) rotate(6deg);border-radius:5px;box-shadow:0 6px 14px rgba(0,0,0,.6)")}><mf-cardback motion={"none"}></mf-cardback></span>
<span style={css("position:absolute;inset:0;transform:translate(4px,-3px) rotate(2.5deg);border-radius:5px;box-shadow:0 6px 14px rgba(0,0,0,.6)")}><mf-cardback motion={"none"}></mf-cardback></span>
<span style={css(`position:absolute;inset:0;transform:rotate(-3deg);padding:4px;box-sizing:border-box;border-radius:5px;background:#0b0b0c;box-shadow:0 12px 26px rgba(0,0,0,.75),0 0 0 1px ${str(v.sel.edge)}`)}>
<span style={css(`display:block;height:100%;border-radius:3px;background:#1a1f27 url('${str(v.sel.art)}') center 30%/cover`)} />
</span>
</span>
<span style={css("display:flex;flex-direction:column;gap:6px;flex:1;min-width:0")}>
<span style={css("font-family:Cinzel,serif;font-size:10px;font-weight:700;letter-spacing:.26em;color:#8d98a8")}>{"DECK"}</span>
<span style={css("font-family:Cinzel,serif;font-size:20px;font-weight:700;line-height:1.1;color:#f6f0e2;text-wrap:balance")}>{show(v.sel.title)}</span>
<span style={css("display:flex;align-items:center;gap:8px")}>
<span style={css("display:flex;gap:2px")}>{(v.sel.pips ?? []).map((p: any, $index: number) => (<React.Fragment key={$index}><span style={css(`width:15px;height:15px;background:url('${str(p)}') center/contain no-repeat`)} /></React.Fragment>))}</span>
<span style={css(`font-size:12px;font-weight:700;white-space:nowrap;color:${str(v.sel.vc)}`)}>{show(v.sel.status)}</span>
</span>
<span style={css("display:flex;align-items:center;gap:7px;font-size:12px;font-weight:700;color:#f0a93b")}>{"Change deck"}<span aria-hidden="true" style={css(`width:6px;height:6px;margin-top:${str(v.deckArrowM)};border-right:1.5px solid #f0a93b;border-bottom:1.5px solid #f0a93b;transform:rotate(${str(v.deckRot)})`)} /></span>
</span>
</button>
{(v.deckOpen) ? (<>
<div role="listbox" aria-label="Decks" style={css("position:absolute;left:0;right:0;bottom:calc(100% + 8px);z-index:30;display:flex;flex-direction:column;padding:6px;border-radius:6px;background:#0f1012;box-shadow:0 30px 70px rgba(0,0,0,.85),inset 0 0 0 1px rgba(201,160,80,.25)")}>
<span style={css("padding:8px 10px 6px;font-family:Cinzel,serif;font-size:11px;font-weight:700;letter-spacing:.2em;color:#c9a050")}>{show(v.deckListTitle)}</span>
{(v.deckRows ?? []).map((d: any, $index: number) => (<React.Fragment key={$index}>
<button role="option" aria-selected={d.selStr} onClick={d.pick} style={css(`display:flex;align-items:center;gap:12px;padding:7px 10px;border:0;border-radius:4px;background:${str(d.bg)};cursor:pointer;text-align:left;color:inherit`)} className={cx('', pc([['hover', "background:rgba(255,255,255,.05)"]]))}>
<span style={css("flex:none;width:30px;height:42px;padding:2px;box-sizing:border-box;border-radius:3px;background:#0b0b0c;box-shadow:0 0 0 1px rgba(255,255,255,.12)")}><span style={css(`display:block;height:100%;border-radius:2px;background:#1a1f27 url('${str(d.art)}') center 30%/cover`)} /></span>
<span style={css("display:flex;flex-direction:column;gap:2px;flex:1;min-width:0")}>
<span style={css("font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#f4efe4")}>{show(d.title)}</span>
<span style={css(`font-size:11px;font-weight:700;white-space:nowrap;color:${str(d.vc)}`)}>{show(d.status)}</span>
</span>
{(d.sel) ? (<><span style={css("width:7px;height:7px;transform:rotate(45deg);background:#f0a93b")} /></>) : null}
</button>
</React.Fragment>))}
<div style={css("display:flex;justify-content:space-between;gap:10px;margin-top:6px;padding:10px 10px 6px;border-top:1px solid rgba(255,255,255,.06)")}>
<a href="/decks" style={css("font-size:12px;font-weight:700")}>{"Open Deck Builder"}</a>
<a href="/decks?new=1" style={css("font-size:12px;font-weight:700")}>{"New deck"}</a>
</div>
</div>
</>) : null}
</div>
</>) : null}
{(v.signedIn) ? (<>
<div style={css("display:flex;align-items:center;justify-content:space-between;gap:12px")} title={v.winsTitle}>
<span style={css("font-size:11px;font-weight:700;letter-spacing:.06em;white-space:nowrap;color:#8d98a8")}>{"DAILY WINS "}<span style={css("color:#e8cf9a")}>{show(v.winsCount)}</span></span>
<span style={css("display:flex;gap:9px")}>
{(v.winNodes ?? []).map((w: any, $index: number) => (<React.Fragment key={$index}>
<span style={css(`width:12px;height:12px;box-sizing:border-box;transform:rotate(45deg);border:1px solid ${str(w.border)};background:${str(w.fill)};box-shadow:${str(w.glow)}`)} />
</React.Fragment>))}
</span>
</div>
</>) : null}
{(v.showPlay) ? (<>
<div style={css("display:flex;flex-direction:column;gap:9px")}>
<button onClick={v.play} disabled={v.noPlay} style={css(`position:relative;padding:2px;border:0;background:${str(v.playFrame)};clip-path:polygon(22px 0,calc(100% - 22px) 0,100% 50%,calc(100% - 22px) 100%,22px 100%,0 50%);cursor:pointer;transition:filter .2s,transform .12s`)} className={cx('', pc([['hover', "filter:brightness(1.14)"], ['active', "transform:scale(.98)"]]))}>
<span data-playfill="1" style={css(`display:block;padding:22px 0;text-align:center;background:${str(v.playFill)};clip-path:polygon(21px 0,calc(100% - 21px) 0,100% 50%,calc(100% - 21px) 100%,21px 100%,0 50%);font-family:Cinzel,serif;font-size:24px;font-weight:900;letter-spacing:.26em;white-space:nowrap;color:${str(v.playColor)};text-shadow:${str(v.playShadow)}`)}>{show(v.playLabel)}</span>
</button>
<span style={css("font-size:12px;line-height:1.45;text-align:center;color:#8d98a8;text-wrap:pretty")}>{show(v.playSub)}</span>
{(v.deckInvalid) ? (<>
<a href={v.deckLink} style={css("align-self:center;font-size:12px;font-weight:700")}>{"Finish it in the Deck Builder"}</a>
</>) : null}
</div>
</>) : null}
{(v.searching) ? (<>
<div style={css("display:flex;flex-direction:column;align-items:center;gap:14px;padding-top:6px")}>
{(v.isPodQ) ? (<>
<div style={css("display:grid;grid-template-columns:repeat(4,44px);gap:8px")}>
{(v.seats ?? []).map((st: any, $index: number) => (<React.Fragment key={$index}>
<span data-seat={st.i} style={css(`width:44px;height:62px;box-sizing:border-box;border-radius:4px;border:${str(st.border)};background:${str(st.bg)};box-shadow:${str(st.glow)}`)} />
</React.Fragment>))}
</div>
</>) : null}
{(v.isDuelQ) ? (<>
<mf-loader size={"52"}></mf-loader>
</>) : null}
<span style={css("display:flex;flex-direction:column;align-items:center;gap:4px")}>
<span style={css("font-family:Cinzel,serif;font-size:15px;font-weight:700;color:#f4efe4")}>{show(v.qTitle)}</span>
<span style={css("font-family:Cinzel,serif;font-size:26px;font-weight:700;font-variant-numeric:tabular-nums;color:#f7dc9a")}>{show(v.qTime)}</span>
</span>
<span style={css("font-size:12px;text-align:center;color:#8d98a8")}>{show(v.qHint)}</span>
<button onClick={v.cancelQ} style={css("width:100%;height:46px;border:1px solid rgba(255,255,255,.18);background:rgba(5,6,7,.5);cursor:pointer;font-family:Cinzel,serif;font-size:13px;font-weight:700;letter-spacing:.2em;color:#c8d0dc")} className={cx('', pc([['hover', "border-color:#c9a050;color:#f7dc9a"]]))}>{"CANCEL"}</button>
</div>
</>) : null}
</section>
</main>
{(v.hasFound) ? (<>
<div data-found="1" style={css("position:fixed;inset:0;z-index:80;display:grid;place-items:center;padding:32px;overflow:auto;background:radial-gradient(circle at 50% 45%,rgba(5,6,7,.8),rgba(3,3,4,.97))")}>
<div style={css("display:flex;flex-direction:column;align-items:center;gap:28px;max-width:980px;text-align:center")}>
<span style={css("font-family:Cinzel,serif;font-size:12px;font-weight:700;letter-spacing:.42em;color:#c9a050")}>{show(v.found.kicker)}</span>
<span style={css("font-family:Cinzel,serif;font-size:clamp(30px,3.4vw,48px);font-weight:700;line-height:1.05;color:#f6f0e2")}>{show(v.found.title)}</span>
<div style={css("display:flex;align-items:center;justify-content:center;gap:18px;flex-wrap:wrap")}>
<div data-pcard="1" style={css("width:168px;aspect-ratio:63/88;padding:6px;box-sizing:border-box;border-radius:8px;background:#0b0b0c;box-shadow:0 0 0 2px #f0a93b,0 0 40px rgba(240,169,59,.3)")}>
<div style={css("display:flex;flex-direction:column;gap:4px;height:100%;padding:4px;box-sizing:border-box;border-radius:5px;background:linear-gradient(180deg,#c9a050,#6b4e1e)")}>
<span style={css(`flex:1;border-radius:3px;background:#1a212c url('${str(v.youArt)}') 55% 20%/cover`)} />
<span style={css("display:flex;flex-direction:column;gap:2px;padding:6px 8px;border-radius:3px;background:#e9e0cc;text-align:left")}><span style={css("font-family:Cinzel,serif;font-size:13px;font-weight:800;color:#16120c")}>{show(v.name)}</span><span style={css("font-size:10px;font-weight:600;line-height:1.3;color:#3a3020")}>{show(v.found.youSub)}</span></span>
</div>
</div>
<span style={css("font-family:Cinzel,serif;font-size:22px;font-weight:800;color:#5a606a")}>{"VS"}</span>
{(v.found.opps ?? []).map((o: any, $index: number) => (<React.Fragment key={$index}>
<div data-pcard="1" style={css("width:168px;aspect-ratio:63/88;padding:6px;box-sizing:border-box;border-radius:8px;background:#0b0b0c;box-shadow:0 0 0 1px rgba(255,255,255,.15),0 20px 40px rgba(0,0,0,.6)")}>
<div style={css("display:flex;flex-direction:column;gap:4px;height:100%;padding:4px;box-sizing:border-box;border-radius:5px;background:linear-gradient(180deg,#8d98a8,#3a4250)")}>
<span style={css(`flex:1;border-radius:3px;background:#1a212c url('${str(o.art)}') center 25%/cover`)} />
<span style={css("display:flex;flex-direction:column;gap:2px;padding:6px 8px;border-radius:3px;background:#e9e0cc;text-align:left")}><span style={css("font-family:Cinzel,serif;font-size:13px;font-weight:800;color:#16120c")}>{show(o.name)}</span><span style={css("font-size:10px;font-weight:600;line-height:1.3;color:#3a3020")}>{show(o.sub)}</span></span>
</div>
</div>
</React.Fragment>))}
</div>
<span style={css("font-size:15px;font-weight:600;color:#aab3c0")}>{show(v.foundCount)}</span>
<div style={css("display:flex;gap:22px;flex-wrap:wrap;justify-content:center;align-items:center")}>
<a href="/table" onClick={v.goTable} style={css("display:block;padding:2px;background:linear-gradient(180deg,#f7dc9a,#a8742a 50%,#f0c56a);clip-path:polygon(16px 0,calc(100% - 16px) 0,100% 50%,calc(100% - 16px) 100%,16px 100%,0 50%)")} className={cx('', pc([['hover', "filter:brightness(1.12)"]]))}>
<span style={css("display:block;padding:15px 42px;background:linear-gradient(180deg,#f5b44b,#b8621a);clip-path:polygon(15px 0,calc(100% - 15px) 0,100% 50%,calc(100% - 15px) 100%,15px 100%,0 50%);font-family:Cinzel,serif;font-size:15px;font-weight:900;letter-spacing:.16em;white-space:nowrap;color:#1b1206")}>{"GO TO THE TABLE"}</span>
</a>
<button onClick={v.leaveFound} style={css("padding:0;border:0;background:transparent;cursor:pointer;font-family:Cinzel,serif;font-size:13px;font-weight:700;letter-spacing:.16em;color:#8d98a8")} className={cx('', pc([['hover', "color:#e7ebf1"]]))}>{"BACK TO LOBBY"}</button>
</div>
</div>
</div>
</>) : null}
{(v.loginOpen) ? (<>
<div data-login="1" onClick={v.closeLogin} style={css("position:fixed;inset:0;z-index:90;display:grid;place-items:center;padding:24px;overflow:auto;background:radial-gradient(circle at 50% 45%,rgba(20,12,4,.75),rgba(3,3,4,.97))")}>
<div role="dialog" aria-modal="true" aria-label="Daily login reward" onClick={v.stop} style={css("position:relative;width:100%;max-width:980px;display:flex;flex-direction:column;align-items:center;gap:30px")}>
<div data-lhead="1" style={css("display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center")}>
<span style={css("font-family:Cinzel,serif;font-size:12px;font-weight:700;letter-spacing:.42em;color:#c9a050")}>{"DAY "}{show(v.loginDayNum)}{" OF 7"}</span>
<span style={css("font-family:Cinzel,serif;font-size:clamp(30px,3.4vw,46px);font-weight:700;line-height:1.05;color:#f6f0e2")}>{"Welcome back, "}{show(v.name)}</span>
<span style={css("font-size:14px;color:#aab3c0")}>{show(v.loginSub)}</span>
</div>
<div style={css("display:flex;justify-content:center;align-items:flex-end;gap:clamp(8px,1.2vw,16px);perspective:1200px")}>
{(v.loginTiles ?? []).map((t: any, $index: number) => (<React.Fragment key={$index}>
<button data-ltile={t.i} onClick={t.click} disabled={t.off} aria-label={t.aria} style={css(`position:relative;flex:none;width:${str(t.w)};aspect-ratio:63/88;padding:0;border:0;background:transparent;cursor:${str(t.cursor)};transform:translateY(${str(t.lift)});transition:transform .3s`)} className={cx('', pc([['hover', "transform:translateY(-6px)"]]))}>
<span style={css(`position:absolute;inset:0;transform-style:preserve-3d;transform:rotateY(${str(t.flip)});transition:transform .7s cubic-bezier(.3,1.3,.5,1)`)}>
<span style={css(`position:absolute;inset:0;opacity:${str(t.backOp)};transition:opacity 0s .3s;backface-visibility:hidden;-webkit-backface-visibility:hidden;border-radius:7px;box-shadow:${str(t.backGlow)}`)}>
<mf-cardback tone={str(t.tone)} label={`DAY ${str(t.day)}`}></mf-cardback>
</span>
<span style={css(`position:absolute;inset:0;opacity:${str(t.faceOp)};transition:opacity 0s .3s;backface-visibility:hidden;-webkit-backface-visibility:hidden;transform:rotateY(180deg);padding:5px;box-sizing:border-box;border-radius:7px;background:#0b0b0c;box-shadow:0 0 0 1px rgba(255,255,255,.1),${str(t.faceGlow)}`)}>
<span style={css(`display:flex;flex-direction:column;gap:3px;height:100%;padding:3px;box-sizing:border-box;border-radius:4px;background:${str(t.frame)}`)}>
<span style={css("flex:1;display:grid;place-items:center;border-radius:2px;background:radial-gradient(circle at 50% 45%,#2a2016,#0e0b08)")}>
{(t.isGold) ? (<><mf-coin size={"52%"}></mf-coin></>) : null}
{(t.isEmber) ? (<><mf-ember size={"58%"}></mf-ember></>) : null}
{(t.isXp) ? (<><mf-xp size={"62%"} label={"XP"}></mf-xp></>) : null}
{(t.isArt) ? (<><span style={css(`width:100%;height:100%;border-radius:2px;background:#1a212c url('${str(t.art)}') center/cover`)} /></>) : null}
</span>
<span style={css("padding:4px 2px;border-radius:2px;background:#e9e0cc;text-align:center;font-size:10px;font-weight:800;line-height:1.2;color:#16120c")}>{show(t.amtTxt)}</span>
</span>
{(t.stamped) ? (<><span style={css("position:absolute;right:-6px;top:-6px;width:22px;height:22px;display:grid;place-items:center;border-radius:50%;background:#16352a;box-shadow:0 0 0 1px #7ef0b8;font-size:11px;font-weight:800;color:#9af5c8")}>{"✓"}</span></>) : null}
</span>
</span>
</button>
</React.Fragment>))}
</div>
<span style={css("font-size:13px;color:#8d98a8")}>{show(v.loginHint)}</span>
<button onClick={v.loginAct} style={css("padding:2px;border:0;background:linear-gradient(180deg,#f7dc9a,#a8742a 50%,#f0c56a);clip-path:polygon(16px 0,calc(100% - 16px) 0,100% 50%,calc(100% - 16px) 100%,16px 100%,0 50%);cursor:pointer")} className={cx('', pc([['hover', "filter:brightness(1.12)"], ['active', "transform:scale(.97)"]]))}>
<span style={css("display:block;min-width:200px;padding:15px 40px;box-sizing:border-box;text-align:center;background:linear-gradient(180deg,#f5b44b,#b8621a);clip-path:polygon(15px 0,calc(100% - 15px) 0,100% 50%,calc(100% - 15px) 100%,15px 100%,0 50%);font-family:Cinzel,serif;font-size:15px;font-weight:900;letter-spacing:.16em;white-space:nowrap;color:#1b1206")}>{show(v.loginBtn)}</span>
</button>
</div>
</div>
</>) : null}
<div aria-live="polite" style={css("position:fixed;left:50%;top:84px;z-index:110;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none")}>
{(v.toasts ?? []).map((to: any, $index: number) => (<React.Fragment key={$index}>
<div data-toast={to.id} style={css("max-width:460px;padding:11px 22px;background:linear-gradient(90deg,rgba(20,14,6,0),rgba(20,14,6,.95) 15%,rgba(20,14,6,.95) 85%,rgba(20,14,6,0));border-top:1px solid rgba(201,160,80,.5);border-bottom:1px solid rgba(201,160,80,.5);font-family:Cinzel,serif;font-size:13px;font-weight:700;letter-spacing:.04em;line-height:1.4;text-align:center;color:#f7dc9a")}>{show(to.text)}</div>
</React.Fragment>))}
</div>
</div>
    </>
  );
}

