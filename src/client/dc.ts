// Runtime helpers for the views generated from the Claude Design files:
//   css("a:b;c:d")      → a React style object (cached)
//   pc([['hover','…']]) → a class carrying :hover / :active / :focus … rules (injected once, like the design runtime)
//   str(x) / show(x)    → how the design runtime prints values (null/false print nothing)
import type React from 'react';

const styleCache = new Map<string, React.CSSProperties>();
export function css(s: string): React.CSSProperties {
  const hit = styleCache.get(s);
  if (hit) return hit;
  const out: Record<string, string> = {};
  // split on ; that are not inside parentheses or quotes (url(…;…), data URIs)
  let depth = 0, q = '', cur = '';
  const parts: string[] = [];
  for (const ch of s) {
    if (q) {
      if (ch === q) q = '';
    } else if (ch === '"' || ch === "'") q = ch;
    else if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ';' && depth === 0) {
      parts.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  parts.push(cur);
  for (const p of parts) {
    const i = p.indexOf(':');
    if (i < 0) continue;
    const k = p.slice(0, i).trim();
    const v = p.slice(i + 1).trim();
    if (!k || !v) continue;
    const key = k.startsWith('--') ? k : k.replace(/^-ms-/, 'ms-').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    out[key] = v;
  }
  if (styleCache.size > 5000) styleCache.clear();
  styleCache.set(s, out as React.CSSProperties);
  return out as React.CSSProperties;
}

let sheet: CSSStyleSheet | null = null;
const classes = new Map<string, string>();
let n = 0;
function addRule(rule: string) {
  if (typeof document === 'undefined') return;
  if (!sheet) {
    const el = document.createElement('style');
    el.setAttribute('data-dc', '');
    document.head.appendChild(el);
    sheet = el.sheet as CSSStyleSheet;
  }
  try {
    sheet.insertRule(rule, sheet.cssRules.length);
  } catch {
    /* invalid rule in a browser that doesn't know a property: skip */
  }
}
const imp = (decls: string) =>
  decls
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => (/!important$/.test(d) ? d : d + ' !important'))
    .join(';');
export function pc(rules: [string, string][]): string {
  const key = JSON.stringify(rules);
  const hit = classes.get(key);
  if (hit) return hit;
  const cls = `dc${(n++).toString(36)}`;
  for (const [pseudo, decls] of rules) {
    const sel = pseudo === 'placeholder' ? `.${cls}::placeholder` : pseudo === 'disabled' ? `.${cls}:disabled` : `.${cls}:${pseudo}`;
    addRule(`${sel}{${imp(decls)}}`);
  }
  classes.set(key, cls);
  return cls;
}
export const cx = (...c: (string | null | undefined | false)[]) => c.filter(Boolean).join(' ');
export const str = (x: any) => (x == null || x === false || x === true ? '' : String(x));
export const show = (x: any) => (x == null || typeof x === 'boolean' ? null : x);

/** WAAPI helper used by the ported animations. */
export function anim(el: Element | null | undefined, frames: Keyframe[], opts: KeyframeAnimationOptions) {
  if (!el || !(el as any).animate) return null;
  try {
    return (el as HTMLElement).animate(frames, opts);
  } catch {
    return null;
  }
}
export const EASE = 'cubic-bezier(.2,.8,.2,1)';
export const fmt = (n: number) => (n ?? 0).toLocaleString('en-US');
export const pad = (n: number) => String(n).padStart(2, '0');
export const hms = (ms: number) => {
  const t = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(t / 3600))}:${pad(Math.floor(t / 60) % 60)}:${pad(t % 60)}`;
};
export const PIP = (c: string) => `https://svgs.scryfall.io/card-symbols/${c.replace(/\//g, '')}.svg`;
