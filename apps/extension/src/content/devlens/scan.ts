/**
 * Page-wide DevLens collectors: colors, typography, assets, viewport.
 * All read-only; bounded by element caps so large pages stay responsive.
 */
import type { AssetItem, ColorSwatch, TypographyReport, TypographyStyle, ViewportInfo } from '@ntm/shared';
import { parseColor, toHex, toHslString, toRgbString } from '../../modules/devlens/color';

const MAX_ELEMENTS = 4000;
const MAX_BG_IMAGES = 300;
const MAX_ASSETS = 1000;
const DATA_URL_MAX = 120;

/** Visible elements (skips display:none / visibility:hidden / zero-size), capped. */
export function visibleElements(root: Document = document, cap = MAX_ELEMENTS): { el: Element; cs: CSSStyleDeclaration }[] {
  const out: { el: Element; cs: CSSStyleDeclaration }[] = [];
  const all = root.body ? root.body.getElementsByTagName('*') : root.getElementsByTagName('*');
  const win = root.defaultView ?? window;
  const noLayout = isJsdom();
  for (let i = 0; i < all.length && out.length < cap; i++) {
    const el = all[i]!;
    if (el.hasAttribute('data-ntm-devlens')) continue;
    const tag = el.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEMPLATE' || tag === 'META' || tag === 'LINK') continue;
    const cs = win.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse') continue;
    // jsdom has no layout engine (every rect is 0x0), so the size check only applies in browsers.
    if (!noLayout) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
    }
    out.push({ el, cs });
  }
  return out;
}

function isJsdom(): boolean {
  return typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent);
}

/* -------------------------------- colors -------------------------------- */

export function extractColors(root: Document = document): ColorSwatch[] {
  const map = new Map<string, ColorSwatch>();
  const add = (raw: string, usage: 'text' | 'background' | 'border') => {
    const c = parseColor(raw);
    if (!c || c.a === 0) return;
    const hex = toHex(c);
    let sw = map.get(hex);
    if (!sw) {
      sw = { hex, rgb: toRgbString(c), hsl: toHslString(c), alpha: Math.round(c.a * 1000) / 1000, count: 0, usages: [] };
      map.set(hex, sw);
    }
    sw.count++;
    if (!sw.usages.includes(usage)) sw.usages.push(usage);
  };

  for (const { el, cs } of visibleElements(root)) {
    // Only count text colour where the element directly contains text.
    if (hasOwnText(el)) add(cs.color, 'text');
    add(cs.backgroundColor, 'background');
    for (const side of ['top', 'right', 'bottom', 'left'] as const) {
      const w = parseFloat(cs.getPropertyValue(`border-${side}-width`));
      if (w > 0 && cs.getPropertyValue(`border-${side}-style`) !== 'none') {
        add(cs.getPropertyValue(`border-${side}-color`), 'border');
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 200);
}

function hasOwnText(el: Element): boolean {
  for (const n of Array.from(el.childNodes)) {
    if (n.nodeType === 3 && (n.textContent ?? '').trim()) return true;
  }
  return false;
}

/* ------------------------------ typography ------------------------------ */

export function extractTypography(root: Document = document): TypographyReport {
  const map = new Map<string, TypographyStyle>();
  for (const { el, cs } of visibleElements(root)) {
    if (!hasOwnText(el)) continue;
    const s = {
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      lineHeight: cs.lineHeight,
      letterSpacing: cs.letterSpacing,
    };
    const key = `${s.fontFamily}|${s.fontSize}|${s.fontWeight}|${s.lineHeight}|${s.letterSpacing}`;
    const cur = map.get(key);
    if (cur) cur.count++;
    else map.set(key, { ...s, count: 1, sampleTag: el.tagName.toLowerCase() });
  }

  const fontFaces: TypographyReport['fontFaces'] = [];
  const fonts = (root as Document & { fonts?: FontFaceSet }).fonts;
  if (fonts && typeof (fonts as unknown as Iterable<FontFace>)[Symbol.iterator] === 'function') {
    const seen = new Set<string>();
    for (const f of fonts as unknown as Iterable<FontFace>) {
      const family = f.family.replace(/^["']|["']$/g, '');
      const k = `${family}|${f.weight}|${f.style}`;
      if (seen.has(k)) continue;
      seen.add(k);
      fontFaces.push({ family, weight: f.weight, style: f.style, status: f.status });
      if (fontFaces.length >= 200) break;
    }
  }

  return {
    styles: Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 100),
    fontFaces,
  };
}

/* -------------------------------- assets -------------------------------- */

function normalizeAssetUrl(raw: string | null | undefined, base: string): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (s.startsWith('data:')) return s.length > DATA_URL_MAX ? `${s.slice(0, DATA_URL_MAX)}…` : s;
  try {
    const u = new URL(s, base);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

const URL_IN_CSS = /url\(\s*(['"]?)(.*?)\1\s*\)/g;
const FONT_EXT = /\.(woff2?|ttf|otf|eot)(\?|#|$)/i;

export function extractAssets(root: Document = document): AssetItem[] {
  const base = root.baseURI;
  const out: AssetItem[] = [];
  const seen = new Set<string>();
  const push = (item: AssetItem) => {
    const key = `${item.kind}|${item.url}`;
    if (seen.has(key) || out.length >= MAX_ASSETS) return;
    seen.add(key);
    out.push(item);
  };

  for (const img of Array.from(root.images)) {
    const url = normalizeAssetUrl(img.currentSrc || img.src, base);
    if (!url) continue;
    const item: AssetItem = { kind: 'image', url };
    if (img.naturalWidth) item.width = img.naturalWidth;
    if (img.naturalHeight) item.height = img.naturalHeight;
    if (img.alt) item.alt = img.alt.slice(0, 200);
    push(item);
    // srcset candidates
    for (const cand of (img.srcset || '').split(',')) {
      const u = normalizeAssetUrl(cand.trim().split(/\s+/)[0], base);
      if (u) push({ kind: 'image', url: u });
    }
  }

  for (const source of Array.from(root.querySelectorAll('picture source[srcset]'))) {
    for (const cand of (source.getAttribute('srcset') || '').split(',')) {
      const u = normalizeAssetUrl(cand.trim().split(/\s+/)[0], base);
      if (u) push({ kind: 'image', url: u });
    }
  }

  for (const v of Array.from(root.querySelectorAll('video[poster]'))) {
    const u = normalizeAssetUrl(v.getAttribute('poster'), base);
    if (u) push({ kind: 'video-poster', url: u });
  }

  for (const link of Array.from(root.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="mask-icon"]'))) {
    const u = normalizeAssetUrl(link.getAttribute('href'), base);
    if (u) push({ kind: 'icon', url: u });
  }

  let bgCount = 0;
  for (const { cs } of visibleElements(root)) {
    if (bgCount >= MAX_BG_IMAGES) break;
    const bg = cs.backgroundImage;
    if (!bg || bg === 'none' || !bg.includes('url(')) continue;
    for (const m of bg.matchAll(URL_IN_CSS)) {
      const u = normalizeAssetUrl(m[2], base);
      if (u) {
        push({ kind: 'background-image', url: u });
        bgCount++;
      }
    }
  }

  const svgCount = root.querySelectorAll('svg').length;
  if (svgCount > 0) push({ kind: 'svg-inline', url: `inline:svg×${svgCount}` });

  try {
    const entries = (root.defaultView ?? window).performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    for (const e of entries) {
      if (FONT_EXT.test(e.name)) {
        const u = normalizeAssetUrl(e.name, base);
        if (u) push({ kind: 'font', url: u });
      }
    }
  } catch {
    /* performance API unavailable */
  }

  return out;
}

/* ------------------------------- viewport ------------------------------- */

export function viewportInfo(win: Window = window): ViewportInfo {
  return {
    innerWidth: win.innerWidth,
    innerHeight: win.innerHeight,
    outerWidth: win.outerWidth,
    outerHeight: win.outerHeight,
    devicePixelRatio: win.devicePixelRatio,
  };
}
