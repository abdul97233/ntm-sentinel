/**
 * PrivacyGuard analysis: classifies observed third-party connections against the
 * tracker list and produces evidence-based findings. Passive only — nothing is blocked.
 */
import type { CookieInfo, Finding, FingerprintSignal, PrivacyReport, ThirdPartyConnection } from './types';
import type { PageSnapshot } from './snapshot';
import type { TrackerSignature, TrackerSignatureBundle } from './schemas';
import { hostMatchesDomain, registrableDomain } from './domain';

export function buildTrackerIndex(bundle: TrackerSignatureBundle) {
  const byDomain = new Map<string, TrackerSignature>();
  for (const t of bundle.trackers) for (const d of t.domains) byDomain.set(d, t);
  return (host: string): TrackerSignature | undefined => {
    // walk up the labels: a.b.example.com -> b.example.com -> example.com
    const labels = host.toLowerCase().split('.');
    for (let i = 0; i < labels.length - 1; i++) {
      const candidate = labels.slice(i).join('.');
      const hit = byDomain.get(candidate);
      if (hit && hostMatchesDomain(host, candidate)) return hit;
    }
    return undefined;
  };
}

const FP_KIND: Record<string, FingerprintSignal['kind']> = {
  'HTMLCanvasElement.toDataURL': 'canvas',
  'HTMLCanvasElement.toBlob': 'canvas',
  'CanvasRenderingContext2D.getImageData': 'canvas',
  'CanvasRenderingContext2D.measureText': 'fonts',
  'WebGLRenderingContext.getParameter': 'webgl',
  'WebGL2RenderingContext.getParameter': 'webgl',
  'WebGLRenderingContext.getExtension': 'webgl',
  'OfflineAudioContext.startRendering': 'audio',
  'AudioContext.createOscillator': 'audio',
  'AnalyserNode.getFloatFrequencyData': 'audio',
  'Navigator.plugins': 'navigator',
  'Navigator.hardwareConcurrency': 'navigator',
  'Navigator.deviceMemory': 'navigator',
};

export function analyzePrivacy(
  snapshot: PageSnapshot,
  bundle: TrackerSignatureBundle,
  cookies: { source: PrivacyReport['cookies']['source']; items: CookieInfo[] },
): PrivacyReport {
  const page = new URL(snapshot.url);
  const firstParty = registrableDomain(page.hostname);
  const lookup = buildTrackerIndex(bundle);

  const conns = new Map<string, ThirdPartyConnection>();
  const add = (rawUrl: string, type: string) => {
    let u: URL;
    try {
      u = new URL(rawUrl, snapshot.url);
    } catch {
      return;
    }
    if (!/^(https?|wss?):$/.test(u.protocol)) return;
    const host = u.hostname.toLowerCase();
    const reg = registrableDomain(host);
    if (reg === firstParty) return;
    let c = conns.get(host);
    if (!c) {
      const sig = lookup(host);
      c = {
        hostname: host,
        registrableDomain: reg,
        resourceTypes: [],
        requestCount: 0,
        service: sig ? { id: sig.id, name: sig.name, category: sig.category, company: sig.company } : undefined,
        // Exact list match is high confidence; unknown hosts get 'low' (classification unknown).
        confidence: sig ? 'high' : 'low',
      };
      conns.set(host, c);
    }
    c.requestCount++;
    if (!c.resourceTypes.includes(type)) c.resourceTypes.push(type);
  };
  for (const r of snapshot.resources) add(r.url, r.initiatorType || 'other');
  // Scripts present in DOM but not (yet) in resource timing still indicate a connection.
  const seen = new Set(snapshot.resources.map((r) => r.url));
  for (const s of snapshot.scripts) if (!seen.has(s)) add(s, 'script');

  const connections = [...conns.values()].sort((a, b) => b.requestCount - a.requestCount);
  const known = connections.filter((c) => c.service);
  const analytics = known.filter((c) => c.service!.category === 'analytics' || c.service!.category === 'session-replay');
  const advertising = known.filter((c) => c.service!.category === 'advertising');

  const signals: FingerprintSignal[] = Object.entries(snapshot.fingerprint.counts)
    .filter(([, n]) => n > 0)
    .map(([api, count]) => ({ api, count, kind: FP_KIND[api] ?? 'navigator' }));

  const findings: Finding[] = [];
  const src = 'Local resource observation';
  const services = (list: ThirdPartyConnection[]) =>
    [...new Set(list.map((c) => c.service!.name))].slice(0, 8).join(', ');

  if (advertising.length) {
    findings.push({
      id: 'pg-advertising',
      title: `${new Set(advertising.map((c) => c.service!.id)).size} advertising service(s) contacted`,
      severity: 'moderate',
      evidence: services(advertising),
      explanation: 'The page loaded resources from known advertising/ad-tech domains, which typically set identifiers used to track you across sites.',
      recommendation: 'Consider a content blocker or your browser\'s tracking prevention settings.',
      source: src,
    });
  }
  if (analytics.length) {
    findings.push({
      id: 'pg-analytics',
      title: `${new Set(analytics.map((c) => c.service!.id)).size} analytics / session-replay service(s)`,
      severity: analytics.some((c) => c.service!.category === 'session-replay') ? 'moderate' : 'low',
      evidence: services(analytics),
      explanation: 'Analytics services measure how visitors use the site. Session-replay tools can record mouse movement, clicks and typed content (when not masked).',
      source: src,
    });
  }
  const fpTrackers = known.filter((c) => c.service!.category === 'fingerprinting');
  if (fpTrackers.length) {
    findings.push({
      id: 'pg-fp-vendor',
      title: 'Known device-fingerprinting vendor contacted',
      severity: 'moderate',
      evidence: services(fpTrackers),
      explanation: 'These vendors provide device identification, often for fraud prevention, which can also identify browsers without cookies.',
      source: src,
    });
  }
  if (signals.length) {
    const kinds = [...new Set(signals.map((s) => s.kind))];
    findings.push({
      id: 'pg-fp-apis',
      title: `Fingerprinting-capable APIs used (${kinds.join(', ')})`,
      severity: kinds.length >= 2 ? 'moderate' : 'low',
      evidence: signals.map((s) => `${s.api} ×${s.count}`).join(', '),
      explanation: 'These APIs can be used to derive a device fingerprint, but they also have many legitimate uses (charts, games, image editing). This is an indicator, not proof of tracking.',
      source: 'Fingerprinting API monitor',
    });
  }
  const persistentThirdParty = cookies.items.filter((c) => !c.firstParty && !c.session);
  if (persistentThirdParty.length) {
    findings.push({
      id: 'pg-3p-cookies',
      title: `${persistentThirdParty.length} persistent third-party cookie(s)`,
      severity: 'low',
      evidence: [...new Set(persistentThirdParty.map((c) => c.domain))].slice(0, 8).join(', '),
      explanation: 'Third-party cookies that persist after the browser closes can be used to recognise you across websites.',
      source: 'Cookies API (names and attributes only)',
    });
  }
  const insecureCookies = cookies.items.filter((c) => page.protocol === 'https:' && !c.secure && c.firstParty);
  if (insecureCookies.length) {
    findings.push({
      id: 'pg-insecure-cookies',
      title: `${insecureCookies.length} first-party cookie(s) without the Secure flag`,
      severity: 'low',
      evidence: insecureCookies.slice(0, 6).map((c) => c.name).join(', '),
      explanation: 'Cookies without Secure may be sent over unencrypted connections if the site is ever loaded via HTTP.',
      source: cookies.source === 'cookies-api' ? 'Cookies API' : 'document.cookie',
    });
  }

  return {
    url: snapshot.url,
    firstPartyDomain: firstParty,
    connections,
    cookies,
    storage: snapshot.storage,
    fingerprinting: { monitored: snapshot.fingerprint.monitored, signals },
    findings,
    totals: {
      thirdPartyDomains: new Set(connections.map((c) => c.registrableDomain)).size,
      knownTrackers: new Set(known.map((c) => c.service!.id)).size,
      analytics: new Set(analytics.map((c) => c.service!.id)).size,
      advertising: new Set(advertising.map((c) => c.service!.id)).size,
      unknown: connections.filter((c) => !c.service).length,
    },
    scannedAt: Date.now(),
  };
}

/** Convert a chrome.cookies.Cookie-like object into CookieInfo. Values are dropped here. */
export function toCookieInfo(
  c: { name: string; domain: string; path: string; expirationDate?: number; session: boolean; secure: boolean; httpOnly: boolean; sameSite: string },
  pageHost: string,
): CookieInfo {
  const domain = c.domain.replace(/^\./, '');
  return {
    name: c.name,
    domain: c.domain,
    path: c.path,
    expires: c.expirationDate,
    session: c.session,
    secure: c.secure,
    httpOnly: c.httpOnly,
    sameSite: c.sameSite === 'strict' ? 'strict' : c.sameSite === 'lax' ? 'lax' : c.sameSite === 'no_restriction' ? 'none' : 'unspecified',
    firstParty: registrableDomain(domain) === registrableDomain(pageHost),
  };
}
