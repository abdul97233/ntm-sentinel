/**
 * Hostname utilities. Pure functions, no browser APIs.
 *
 * NOTE: registrableDomain() uses a compact list of common multi-label public
 * suffixes rather than the full Public Suffix List (~200KB). It is accurate for
 * the large majority of real-world domains and treats unknown suffixes as
 * single-label. This limitation is documented in docs/ARCHITECTURE.md.
 */

const MULTI_LABEL_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'me.uk', 'net.uk', 'ltd.uk', 'plc.uk',
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au',
  'co.nz', 'org.nz', 'net.nz', 'govt.nz',
  'co.jp', 'ne.jp', 'or.jp', 'ac.jp', 'go.jp',
  'co.kr', 'or.kr', 'ac.kr', 'go.kr',
  'com.br', 'net.br', 'org.br', 'gov.br',
  'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn',
  'com.hk', 'org.hk', 'com.tw', 'org.tw', 'com.sg', 'edu.sg', 'gov.sg',
  'co.in', 'net.in', 'org.in', 'gov.in', 'ac.in', 'edu.in',
  'com.mx', 'org.mx', 'gob.mx', 'com.ar', 'com.co', 'com.pe', 'com.ve', 'com.ec',
  'co.za', 'org.za', 'gov.za', 'ac.za',
  'com.tr', 'org.tr', 'gov.tr', 'com.sa', 'gov.sa', 'com.eg', 'com.pk', 'gov.pk',
  'com.my', 'com.ph', 'com.vn', 'co.id', 'or.id', 'co.th', 'in.th', 'ac.th',
  'com.ua', 'co.il', 'org.il', 'ac.il', 'com.ng', 'co.ke', 'com.bd', 'com.np',
  // Private suffixes (platforms where each subdomain has a separate owner)
  'github.io', 'gitlab.io', 'netlify.app', 'vercel.app', 'pages.dev', 'workers.dev',
  'herokuapp.com', 'web.app', 'firebaseapp.com', 'azurewebsites.net', 'cloudfront.net',
  'blogspot.com', 'wordpress.com', 'wixsite.com', 'weebly.com', 'glitch.me', 'repl.co',
  'onrender.com', 'fly.dev', 'surge.sh', 'ngrok.io', 'ngrok-free.app', 'r2.dev',
  's3.amazonaws.com', 'appspot.com', 'webflow.io', 'myshopify.com', 'carrd.co',
]);

/** Hosting platforms where anyone can publish content under a subdomain. */
export const FREE_HOSTING_SUFFIXES = [
  'github.io', 'gitlab.io', 'netlify.app', 'vercel.app', 'pages.dev', 'workers.dev',
  'herokuapp.com', 'web.app', 'firebaseapp.com', 'blogspot.com', 'wixsite.com',
  'weebly.com', 'glitch.me', 'repl.co', 'onrender.com', 'surge.sh', 'ngrok.io',
  'ngrok-free.app', 'r2.dev', 'webflow.io', 'carrd.co', '000webhostapp.com',
  'ipfs.io', 'trycloudflare.com',
];

export const URL_SHORTENERS = new Set([
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly', 'rebrand.ly',
  'cutt.ly', 'shorturl.at', 'tiny.cc', 'rb.gy', 's.id', 'v.gd', 'bl.ink', 'lnkd.in',
]);

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function normalizeHostname(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, '');
}

export function isIPv4(host: string): boolean {
  const m = IPV4_RE.exec(host);
  return !!m && m.slice(1).every((o) => Number(o) <= 255);
}

export function isIPv6(host: string): boolean {
  const h = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  return h.includes(':') && /^[0-9a-f:.]+$/i.test(h);
}

export function isIPAddress(host: string): boolean {
  return isIPv4(host) || isIPv6(host);
}

/** Loopback, RFC1918, link-local, CGNAT, unique-local, multicast and similar non-public ranges. */
export function isPrivateOrReservedIP(host: string): boolean {
  if (isIPv4(host)) {
    const [a, b] = host.split('.').map(Number) as [number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (isIPv6(host)) {
    const h = host.replace(/^\[|\]$/g, '').toLowerCase();
    return (
      h === '::1' ||
      h === '::' ||
      h.startsWith('fe80') ||
      h.startsWith('fc') ||
      h.startsWith('fd') ||
      h.startsWith('::ffff:') ||
      h.startsWith('ff')
    );
  }
  return false;
}

export function registrableDomain(hostname: string): string {
  const host = normalizeHostname(hostname);
  if (isIPAddress(host) || !host.includes('.')) return host;
  const labels = host.split('.');
  if (labels.length <= 2) return host;
  const lastTwo = labels.slice(-2).join('.');
  const lastThree = labels.slice(-3).join('.');
  if (MULTI_LABEL_SUFFIXES.has(lastThree)) {
    return labels.length >= 4 ? labels.slice(-4).join('.') : host;
  }
  if (MULTI_LABEL_SUFFIXES.has(lastTwo)) return lastThree;
  return lastTwo;
}

/** Labels to the left of the registrable domain. */
export function subdomainLabels(hostname: string): string[] {
  const host = normalizeHostname(hostname);
  const reg = registrableDomain(host);
  if (host === reg) return [];
  return host
    .slice(0, -(reg.length + 1))
    .split('.')
    .filter(Boolean);
}

export function isSameSite(a: string, b: string): boolean {
  return registrableDomain(a) === registrableDomain(b);
}

/** true if `host` equals `domain` or is a subdomain of it. */
export function hostMatchesDomain(host: string, domain: string): boolean {
  const h = normalizeHostname(host);
  const d = normalizeHostname(domain);
  return h === d || h.endsWith('.' + d);
}

export function tld(hostname: string): string {
  const labels = normalizeHostname(hostname).split('.');
  return labels[labels.length - 1] ?? '';
}

/* ---------------------- Punycode (RFC 3492) decoder ---------------------- */

const BASE = 36;
const TMIN = 1;
const TMAX = 26;
const SKEW = 38;
const DAMP = 700;
const INITIAL_BIAS = 72;
const INITIAL_N = 128;

function adapt(delta: number, numPoints: number, firstTime: boolean): number {
  let d = firstTime ? Math.floor(delta / DAMP) : delta >> 1;
  d += Math.floor(d / numPoints);
  let k = 0;
  while (d > ((BASE - TMIN) * TMAX) >> 1) {
    d = Math.floor(d / (BASE - TMIN));
    k += BASE;
  }
  return k + Math.floor(((BASE - TMIN + 1) * d) / (d + SKEW));
}

function basicToDigit(cp: number): number {
  if (cp >= 0x30 && cp < 0x3a) return cp - 22;
  if (cp >= 0x41 && cp < 0x5b) return cp - 0x41;
  if (cp >= 0x61 && cp < 0x7b) return cp - 0x61;
  return BASE;
}

/** Decode one punycode label (without the xn-- prefix). Throws on invalid input. */
export function punycodeDecodeLabel(input: string): string {
  const output: number[] = [];
  let n = INITIAL_N;
  let i = 0;
  let bias = INITIAL_BIAS;
  let basic = input.lastIndexOf('-');
  if (basic < 0) basic = 0;
  for (let j = 0; j < basic; j++) {
    const c = input.charCodeAt(j);
    if (c >= 0x80) throw new Error('invalid punycode');
    output.push(c);
  }
  for (let idx = basic > 0 ? basic + 1 : 0; idx < input.length; ) {
    const oldi = i;
    for (let w = 1, k = BASE; ; k += BASE) {
      if (idx >= input.length) throw new Error('invalid punycode');
      const digit = basicToDigit(input.charCodeAt(idx++));
      if (digit >= BASE) throw new Error('invalid punycode');
      i += digit * w;
      const t = k <= bias ? TMIN : k >= bias + TMAX ? TMAX : k - bias;
      if (digit < t) break;
      w *= BASE - t;
      if (w > 0x7fffffff) throw new Error('punycode overflow');
    }
    const len = output.length + 1;
    bias = adapt(i - oldi, len, oldi === 0);
    n += Math.floor(i / len);
    i %= len;
    if (n > 0x10ffff) throw new Error('invalid punycode');
    output.splice(i++, 0, n);
  }
  return String.fromCodePoint(...output);
}

/** Convert an ASCII (punycode) hostname to its Unicode display form. */
export function toUnicodeHostname(hostname: string): string {
  return normalizeHostname(hostname)
    .split('.')
    .map((label) => {
      if (!label.startsWith('xn--')) return label;
      try {
        return punycodeDecodeLabel(label.slice(4));
      } catch {
        return label;
      }
    })
    .join('.');
}

export type ScriptClass =
  | 'latin'
  | 'cyrillic'
  | 'greek'
  | 'armenian'
  | 'cjk'
  | 'arabic'
  | 'hebrew'
  | 'other';

export function scriptOf(ch: string): ScriptClass | null {
  const cp = ch.codePointAt(0) ?? 0;
  if ((cp >= 0x30 && cp <= 0x39) || ch === '-' || ch === '_' || ch === '.') return null;
  if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a) || (cp >= 0xc0 && cp <= 0x24f))
    return 'latin';
  if (cp >= 0x400 && cp <= 0x52f) return 'cyrillic';
  if (cp >= 0x370 && cp <= 0x3ff) return 'greek';
  if (cp >= 0x530 && cp <= 0x58f) return 'armenian';
  if (cp >= 0x590 && cp <= 0x5ff) return 'hebrew';
  if (cp >= 0x600 && cp <= 0x6ff) return 'arabic';
  if (
    (cp >= 0x3040 && cp <= 0x30ff) ||
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0xac00 && cp <= 0xd7af)
  )
    return 'cjk';
  return 'other';
}

/** Distinct scripts used within one label. Mixed scripts are a classic homograph signal. */
export function scriptsInLabel(label: string): Set<ScriptClass> {
  const s = new Set<ScriptClass>();
  for (const ch of label) {
    const sc = scriptOf(ch);
    if (sc) s.add(sc);
  }
  return s;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length]!;
}
