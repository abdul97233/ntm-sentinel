/**
 * Page snapshot collection (isolated-world content script).
 * Reads structure only: no form values, no cookie values, no storage values, no page text.
 */
import type { CollectRequest, PageSnapshot, StorageSummary } from '@ntm/shared';

const MAX_RESOURCES = 1500;
const MAX_CLASSES = 600;

function storageInfo(area: 'localStorage' | 'sessionStorage') {
  try {
    const s = window[area];
    const keys: string[] = [];
    let bytes = 0;
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k === null) continue;
      keys.push(k.slice(0, 80));
      // Length only — the value itself is never returned.
      bytes += (k.length + (s.getItem(k)?.length ?? 0)) * 2;
    }
    return { available: true, keyCount: keys.length, approxBytes: bytes, keys: keys.slice(0, 100) };
  } catch {
    return { available: false, keyCount: 0, approxBytes: 0, keys: [] };
  }
}

async function collectStorage(): Promise<StorageSummary> {
  const summary: StorageSummary = {
    localStorage: storageInfo('localStorage'),
    sessionStorage: storageInfo('sessionStorage'),
    indexedDB: { available: typeof indexedDB !== 'undefined', databases: [] },
  };
  try {
    if (indexedDB?.databases) {
      const dbs = await indexedDB.databases();
      summary.indexedDB.databases = dbs.map((d) => d.name ?? '(unnamed)').slice(0, 50);
    }
  } catch {
    /* not permitted */
  }
  try {
    const est = await navigator.storage?.estimate?.();
    if (est) summary.estimate = { usage: est.usage, quota: est.quota };
  } catch {
    /* not permitted */
  }
  return summary;
}

async function probeHeaders(enabled: boolean): Promise<PageSnapshot['headerProbe']> {
  if (!enabled) return { status: 'disabled', headers: {} };
  if (!/^https?:$/.test(location.protocol)) return { status: 'failed', headers: {}, error: 'Not an http(s) page' };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    // One same-origin HEAD request to the page the user is already viewing.
    const res = await fetch(location.href, {
      method: 'HEAD',
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'follow',
      signal: ctrl.signal,
    });
    clearTimeout(t);
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k.toLowerCase()] = v.slice(0, 300);
    });
    return { status: 'ok', headers };
  } catch (e) {
    return { status: 'failed', headers: {}, error: e instanceof Error ? e.message : String(e) };
  }
}

function stripQuery(u: string): string {
  try {
    const x = new URL(u, location.href);
    return x.origin + x.pathname;
  } catch {
    return u.slice(0, 200);
  }
}

export async function collectSnapshot(req: CollectRequest): Promise<PageSnapshot> {
  const doc = document;
  const scripts = Array.from(doc.scripts)
    .map((s) => s.src)
    .filter(Boolean)
    .slice(0, 500);

  const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
  const resources = entries.slice(0, MAX_RESOURCES).map((e) => ({ url: e.name, initiatorType: e.initiatorType }));

  const meta: Record<string, string> = {};
  doc.querySelectorAll('meta[name], meta[property]').forEach((m) => {
    const key = (m.getAttribute('name') ?? m.getAttribute('property') ?? '').toLowerCase();
    const content = m.getAttribute('content');
    if (key && content && !(key in meta)) meta[key] = content.slice(0, 300);
  });

  const matchedSelectors: string[] = [];
  for (const sel of req.selectors) {
    try {
      if (doc.querySelector(sel)) matchedSelectors.push(sel);
    } catch {
      /* invalid selector in signature: ignore */
    }
  }
  const selectorAttrs: Record<string, string> = {};
  for (const { selector, attr } of req.selectorAttrs) {
    try {
      const v = doc.querySelector(selector)?.getAttribute(attr);
      if (v) selectorAttrs[`${selector}|${attr}`] = v.slice(0, 100);
    } catch {
      /* ignore */
    }
  }

  const classes = new Set<string>();
  const all = doc.querySelectorAll('[class]');
  const step = Math.max(1, Math.floor(all.length / 1500));
  for (let i = 0; i < all.length && classes.size < MAX_CLASSES; i += step) {
    const el = all[i]!;
    el.classList.forEach((c) => classes.size < MAX_CLASSES && classes.add(c));
  }

  const cookieNames = doc.cookie
    ? doc.cookie
        .split(';')
        .map((c) => c.split('=')[0]!.trim())
        .filter(Boolean)
        .slice(0, 200)
    : [];

  const forms = Array.from(doc.forms)
    .slice(0, 50)
    .map((f) => ({
      action: stripQuery(f.getAttribute('action') ? f.action : location.href),
      method: (f.getAttribute('method') ?? 'get').toLowerCase(),
      hasPassword: !!f.querySelector('input[type="password"]'),
    }));

  const mixedContent: PageSnapshot['mixedContent'] = [];
  if (location.protocol === 'https:') {
    doc.querySelectorAll('script[src^="http:"], link[href^="http:"][rel~="stylesheet"], img[src^="http:"], iframe[src^="http:"], video[src^="http:"], audio[src^="http:"], source[src^="http:"], object[data^="http:"], embed[src^="http:"]').forEach((el) => {
      if (mixedContent.length >= 50) return;
      const url = el.getAttribute('src') ?? el.getAttribute('href') ?? el.getAttribute('data') ?? '';
      mixedContent.push({ tag: el.tagName.toLowerCase(), url: url.slice(0, 200) });
    });
    for (const r of resources) {
      if (mixedContent.length >= 50) break;
      if (r.url.startsWith('http:')) mixedContent.push({ tag: r.initiatorType, url: r.url.slice(0, 200) });
    }
  }

  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;

  const [headerProbe, storage] = await Promise.all([probeHeaders(req.headerProbe), collectStorage()]);

  // Fingerprint counters are written by the opt-in MAIN-world monitor into a DOM attribute.
  let fingerprint: PageSnapshot['fingerprint'] = { monitored: false, counts: {} };
  const fpAttr = doc.documentElement.getAttribute('data-ntm-fp');
  if (fpAttr) {
    try {
      const parsed = JSON.parse(fpAttr) as Record<string, unknown>;
      const counts: Record<string, number> = {};
      for (const [k, v] of Object.entries(parsed)) if (typeof v === 'number' && k.length < 80) counts[k] = v;
      fingerprint = { monitored: true, counts };
    } catch {
      /* ignore malformed */
    }
  }

  return {
    url: location.href,
    title: doc.title.slice(0, 200),
    collectedAt: Date.now(),
    scripts,
    resources,
    resourceTotal: entries.length,
    meta,
    matchedSelectors,
    selectorAttrs,
    classSample: [...classes],
    headerProbe,
    cookieNames,
    forms,
    passwordFieldCount: doc.querySelectorAll('input[type="password"]').length,
    mixedContent,
    iframeCount: doc.querySelectorAll('iframe').length,
    navigation: { redirectCount: nav?.redirectCount ?? 0, type: nav?.type ?? 'unknown' },
    storage,
    globals: {},
    fingerprint,
  };
}
