/**
 * Pure color math shared by the DevLens content script and UI.
 * No DOM access here so it can be unit-tested and bundled anywhere.
 */

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

function parseChannel(v: string, max = 255): number {
  const s = v.trim();
  if (s.endsWith('%')) return clamp((parseFloat(s) / 100) * max, 0, max);
  return clamp(parseFloat(s), 0, max);
}

function parseAlpha(v: string | undefined): number {
  if (v === undefined || v.trim() === '') return 1;
  const s = v.trim();
  if (s.endsWith('%')) return clamp(parseFloat(s) / 100, 0, 1);
  const n = parseFloat(s);
  return Number.isFinite(n) ? clamp(n, 0, 1) : 1;
}

/**
 * Parse a CSS color string as returned by getComputedStyle (rgb()/rgba(), color(srgb ...)),
 * plus hex and a few keywords for convenience. Returns null for unsupported or invalid input.
 */
export function parseColor(input: string): RGBA | null {
  const str = input.trim().toLowerCase();
  if (!str) return null;
  if (str === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (str === 'black') return { r: 0, g: 0, b: 0, a: 1 };
  if (str === 'white') return { r: 255, g: 255, b: 255, a: 1 };

  if (str.startsWith('#')) {
    const hex = str.slice(1);
    if (!/^[0-9a-f]+$/.test(hex)) return null;
    if (hex.length === 3 || hex.length === 4) {
      const [r, g, b, a] = hex.split('').map((c) => parseInt(c + c, 16));
      return { r: r!, g: g!, b: b!, a: a === undefined ? 1 : a / 255 };
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
      return { r, g, b, a };
    }
    return null;
  }

  const fn = /^(rgba?)\((.*)\)$/.exec(str);
  if (fn) {
    const body = fn[2]!;
    let parts: string[];
    let alpha: string | undefined;
    if (body.includes(',')) {
      parts = body.split(',');
      alpha = parts[3];
      parts = parts.slice(0, 3);
    } else {
      const [main, a] = body.split('/');
      parts = main!.trim().split(/\s+/);
      alpha = a;
    }
    if (parts.length !== 3) return null;
    const [r, g, b] = parts.map((p) => parseChannel(p));
    if ([r, g, b].some((n) => !Number.isFinite(n))) return null;
    return { r: Math.round(r!), g: Math.round(g!), b: Math.round(b!), a: parseAlpha(alpha) };
  }

  // color(srgb r g b / a) — values 0..1
  const cfn = /^color\(\s*(srgb|srgb-linear|display-p3)\s+([^)]*)\)$/.exec(str);
  if (cfn) {
    const [main, a] = cfn[2]!.split('/');
    const parts = main!.trim().split(/\s+/);
    if (parts.length !== 3) return null;
    const vals = parts.map((p) => (p.endsWith('%') ? parseFloat(p) / 100 : parseFloat(p)));
    if (vals.some((n) => !Number.isFinite(n))) return null;
    // display-p3 / linear are approximated as sRGB (documented limitation).
    const [r, g, b] = vals.map((v) => Math.round(clamp(v, 0, 1) * 255));
    return { r: r!, g: g!, b: b!, a: parseAlpha(a) };
  }

  return null;
}

const hex2 = (n: number) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0');

export function toHex({ r, g, b, a }: RGBA): string {
  const base = `#${hex2(r)}${hex2(g)}${hex2(b)}`;
  return a < 1 ? `${base}${hex2(a * 255)}` : base;
}

export function toRgbString({ r, g, b, a }: RGBA): string {
  return a < 1 ? `rgba(${r}, ${g}, ${b}, ${round(a, 3)})` : `rgb(${r}, ${g}, ${b})`;
}

function round(n: number, d = 0): number {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

export function toHsl({ r, g, b }: RGBA): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
  }
  return { h: Math.round(h) % 360, s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function toHslString(c: RGBA): string {
  const { h, s, l } = toHsl(c);
  return c.a < 1 ? `hsla(${h}, ${s}%, ${l}%, ${round(c.a, 3)})` : `hsl(${h}, ${s}%, ${l}%)`;
}

/** Relative luminance (WCAG). */
export function luminance({ r, g, b }: RGBA): number {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(a: RGBA, b: RGBA): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return round((hi + 0.05) / (lo + 0.05), 2);
}

/** Pick readable text color for a swatch background. */
export function readableTextOn(c: RGBA): '#000000' | '#ffffff' {
  return luminance(c) > 0.4 ? '#000000' : '#ffffff';
}
