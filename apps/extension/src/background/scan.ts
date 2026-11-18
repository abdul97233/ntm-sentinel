/**
 * Scan orchestration: injects the on-demand content script, gathers a snapshot,
 * runs the local engines and persists results in session storage.
 */
import {
  aggregateRisk,
  analyzePageSecurity,
  analyzePrivacy,
  analyzeUrl,
  collectRequirements,
  detectTechnologies,
  sortFindings,
  toCookieInfo,
  type CookieInfo,
  type EngineState,
  type PageSnapshot,
  type RedirectHop,
  type ReputationResult,
  type SecurityReport,
  type TabScanState,
  type TechSignatureBundle,
  type TrackerSignatureBundle,
} from '@ntm/shared';
import { technologySignatures, trackerSignatures } from '@ntm/signatures';
import type { ContentRequest, EngineScan } from '../core/messaging/contract';
import { hasPermission, scanSupport } from '../core/browser';
import { addHistory, getCachedSignatures, getSettings, getTabState, setTabState } from '../core/storage/store';
import { fetchReputation } from '../services/backend';
import { getRedirects } from './redirects';

function newer(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true }) > 0;
}

export async function activeSignatures(): Promise<{ tech: TechSignatureBundle; trackers: TrackerSignatureBundle; source: 'bundled' | 'remote' }> {
  const cached = await getCachedSignatures();
  const tech = cached.tech && newer(cached.tech.version, technologySignatures.version) ? cached.tech : technologySignatures;
  const trackers =
    cached.trackers && newer(cached.trackers.version, trackerSignatures.version) ? cached.trackers : trackerSignatures;
  return { tech, trackers, source: tech !== technologySignatures || trackers !== trackerSignatures ? 'remote' : 'bundled' };
}

export async function ensureContentScript(tabId: number): Promise<void> {
  try {
    const pong = await chrome.tabs.sendMessage(tabId, { channel: 'ntm-content', type: 'ping' } satisfies ContentRequest);
    if (pong?.ok) return;
  } catch {
    /* not injected yet */
  }
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content-scanner.js'] });
}

export async function sendToContent<T>(tabId: number, msg: ContentRequest): Promise<T> {
  await ensureContentScript(tabId);
  const res = (await chrome.tabs.sendMessage(tabId, msg)) as { ok: boolean; data?: T; error?: string } | undefined;
  if (!res) throw new Error('No response from page script');
  if (!res.ok) throw new Error(res.error ?? 'Page script error');
  return res.data as T;
}

/**
 * Read-only probe of page globals in the MAIN world. The injected function is part of
 * the extension bundle (no remote or dynamic code). It only reads properties and
 * returns primitive string values for version fields.
 */
function probeGlobals(paths: string[]): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (const path of paths) {
    try {
      let cur: unknown = window;
      for (const part of path.split('.')) {
        if (cur === null || cur === undefined) break;
        const desc = Object.getOwnPropertyDescriptor(cur as object, part);
        // Avoid invoking page-defined getters where possible; fall back to plain access for prototype props.
        cur = desc && 'value' in desc ? desc.value : (cur as Record<string, unknown>)[part];
      }
      if (cur === undefined || cur === null) continue;
      if (typeof cur === 'string' || typeof cur === 'number') out[path] = String(cur).slice(0, 40);
      else out[path] = true;
    } catch {
      /* inaccessible */
    }
  }
  return out;
}

async function collect(tabId: number, tech: TechSignatureBundle): Promise<PageSnapshot> {
  const settings = await getSettings();
  const req = collectRequirements(tech);
  const snapshot = await sendToContent<PageSnapshot>(tabId, {
    channel: 'ntm-content',
    type: 'collect',
    request: { selectors: req.selectors, selectorAttrs: req.selectorAttrs, headerProbe: settings.headerProbe },
  });
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: probeGlobals,
      args: [req.globals],
    });
    const globals = res?.result;
    if (globals && typeof globals === 'object') {
      for (const [k, v] of Object.entries(globals as Record<string, unknown>)) {
        if (req.globals.includes(k) && (v === true || typeof v === 'string')) snapshot.globals[k] = v;
      }
    }
  } catch {
    /* MAIN world probe unavailable — signatures fall back to DOM/network signals */
  }
  return snapshot;
}

async function readCookies(url: string): Promise<{ source: 'cookies-api' | 'document.cookie' | 'none'; items: CookieInfo[] }> {
  if (!(await hasPermission('cookies')) || !chrome.cookies) return { source: 'none', items: [] };
  try {
    const host = new URL(url).hostname;
    const cookies = await chrome.cookies.getAll({ url });
    // Values are discarded inside toCookieInfo; they never leave this function.
    return { source: 'cookies-api', items: cookies.map((c) => toCookieInfo(c, host)) };
  } catch {
    return { source: 'none', items: [] };
  }
}

export async function analyzeCookies(tabId: number) {
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url || !scanSupport(tab.url).supported) return { status: 'unsupported' as const, cookies: [] };
  if (!(await hasPermission('cookies'))) return { status: 'permission-required' as const, cookies: [] };
  const r = await readCookies(tab.url);
  return { status: 'ok' as const, cookies: r.items };
}

function emptyState(tabId: number, url: string): TabScanState {
  let hostname = '';
  try {
    hostname = new URL(url).hostname;
  } catch {
    /* ignore */
  }
  const ns = { status: 'not-scanned' as const };
  return { tabId, url, hostname, security: ns, privacy: ns, stack: ns, updatedAt: Date.now() };
}

export function broadcastScanUpdated(tabId: number) {
  chrome.runtime.sendMessage({ channel: 'ntm-event', type: 'scan/updated', tabId }).catch(() => undefined);
}

export async function getOrInitState(tabId: number): Promise<TabScanState> {
  const tab = await chrome.tabs.get(tabId);
  const url = tab.url ?? '';
  const cur = await getTabState(tabId);
  if (cur && cur.url === url) return cur;
  const fresh = emptyState(tabId, url);
  if (cur?.apiRequestCount !== undefined && cur.hostname === fresh.hostname) fresh.apiRequestCount = cur.apiRequestCount;
  return fresh;
}

function securityFromUrl(url: string, redirects: RedirectHop[], snapshot: PageSnapshot | null, snapshotError?: string): SecurityReport {
  const ua = analyzeUrl(url);
  const pageFindings = snapshot ? analyzePageSecurity(snapshot) : [];
  const findings = sortFindings([...ua.findings, ...pageFindings]);
  if (redirects.length > 1) {
    const hosts = [...new Set(redirects.map((r) => { try { return new URL(r.url).hostname; } catch { return r.url; } }))];
    if (hosts.length > 1) {
      findings.push({
        id: 'redirect-chain',
        title: `Arrived via redirect across ${hosts.length} hosts`,
        severity: hosts.length >= 3 ? 'moderate' : 'info',
        evidence: redirects.map((r) => r.url.slice(0, 100)).join('\n→ '),
        explanation: 'This page was reached through one or more redirects. Long chains across unrelated domains are common in malicious link campaigns, but also in ad and login flows.',
        source: 'Navigation observation (webNavigation)',
      });
    }
  }
  return {
    url,
    hostname: ua.hostname,
    riskLevel: aggregateRisk(findings, true),
    findings,
    coverage: [
      { name: 'URL structure analysis', ran: true },
      { name: 'Page structure analysis (forms, mixed content)', ran: !!snapshot, note: snapshotError },
      {
        name: 'Security response headers',
        ran: snapshot?.headerProbe.status === 'ok',
        note:
          snapshot?.headerProbe.status === 'disabled'
            ? 'Header probe disabled in Settings'
            : snapshot?.headerProbe.status === 'failed'
              ? `Probe failed: ${snapshot.headerProbe.error ?? 'unknown error'}`
              : undefined,
      },
      {
        name: 'Redirect observation',
        ran: redirects.length > 0,
        note: redirects.length ? undefined : 'Requires the optional "webNavigation" permission; only navigations after it was granted are observed',
      },
      { name: 'TLS certificate inspection', ran: false, note: 'Not exposed to Chrome/Edge extensions. Use the browser\'s site information (padlock) panel.' },
      { name: 'Cloud reputation', ran: false, note: 'Opt-in; run from the Security page' },
    ],
    redirects,
    scannedAt: Date.now(),
  };
}

export async function runScan(tabId: number, engines: EngineScan[] = ['security', 'privacy', 'stack']): Promise<TabScanState> {
  const settings = await getSettings();
  const tab = await chrome.tabs.get(tabId);
  const url = tab.url ?? '';
  let state = await getOrInitState(tabId);

  const support = scanSupport(url);
  const want = engines.filter((e) =>
    e === 'security' ? settings.modules.scamlens : e === 'privacy' ? settings.modules.privacyguard : settings.modules.stackpeek,
  );

  if (!url) {
    const p: EngineState<never> = {
      status: 'permission-required',
      error: 'Site access required. Click the NTM Sentinel toolbar icon on this page, or grant access for this site.',
      updatedAt: Date.now(),
    };
    state = { ...state, security: p, privacy: p, stack: p };
    await setTabState(state);
    broadcastScanUpdated(tabId);
    return state;
  }
  if (!support.supported) {
    const u: EngineState<never> = { status: 'unsupported', error: support.reason, updatedAt: Date.now() };
    state = { ...state, security: u, privacy: u, stack: u };
    await setTabState(state);
    broadcastScanUpdated(tabId);
    return state;
  }

  const scanning = { status: 'scanning' as const, updatedAt: Date.now() };
  for (const e of want) state = { ...state, [e]: { ...state[e], ...scanning } };
  await setTabState(state);
  broadcastScanUpdated(tabId);

  const sigs = await activeSignatures();
  let snapshot: PageSnapshot | null = null;
  let snapshotError: string | undefined;
  let permissionDenied = false;
  try {
    snapshot = await collect(tabId, sigs.tech);
  } catch (e) {
    snapshotError = e instanceof Error ? e.message : String(e);
    permissionDenied = /cannot access|permission|host/i.test(snapshotError);
  }

  const now = Date.now();
  const fail = (msg: string): EngineState<never> =>
    permissionDenied
      ? { status: 'permission-required', error: 'Site access required. Click the NTM Sentinel toolbar icon on this page or grant access for this site.', updatedAt: now }
      : { status: 'failed', error: msg, updatedAt: now };

  if (want.includes('security')) {
    // URL analysis works without page access; page-level checks are added when available.
    const redirects = await getRedirects(tabId);
    state.security = { status: 'completed', data: securityFromUrl(url, redirects, snapshot, snapshotError), updatedAt: now };
    const prevRep = (await getTabState(tabId))?.security.data?.reputation;
    if (prevRep && prevRep.hostname === state.security.data!.hostname) state.security.data!.reputation = prevRep;
  }
  if (want.includes('stack')) {
    state.stack = snapshot
      ? { status: 'completed', data: { url, technologies: detectTechnologies(snapshot, sigs.tech), signatureVersion: sigs.tech.version, scannedAt: now }, updatedAt: now }
      : fail(snapshotError ?? 'Snapshot failed');
  }
  if (want.includes('privacy')) {
    if (snapshot) {
      let cookies = await readCookies(url);
      if (cookies.source === 'none' && snapshot.cookieNames.length) {
        const host = new URL(url).hostname;
        cookies = {
          source: 'document.cookie',
          items: snapshot.cookieNames.map((name) => ({
            name,
            domain: host,
            path: '/',
            session: true,
            secure: false,
            sameSite: 'unspecified' as const,
            firstParty: true,
          })),
        };
      }
      state.privacy = { status: 'completed', data: analyzePrivacy(snapshot, sigs.trackers, cookies), updatedAt: now };
    } else {
      state.privacy = fail(snapshotError ?? 'Snapshot failed');
    }
  }

  await setTabState(state);
  broadcastScanUpdated(tabId);

  if (settings.scanHistory && state.hostname) {
    await addHistory(
      {
        hostname: state.hostname,
        riskLevel: state.security.data?.riskLevel ?? 'unknown',
        trackerCount: state.privacy.data?.totals.knownTrackers ?? 0,
        techCount: state.stack.data?.technologies.length ?? 0,
        scannedAt: now,
      },
      settings.historyLimit,
    );
  }
  return state;
}

export async function runReputation(tabId: number): Promise<ReputationResult> {
  const settings = await getSettings();
  const tab = await chrome.tabs.get(tabId);
  let hostname = '';
  try {
    hostname = new URL(tab.url ?? '').hostname;
  } catch {
    /* ignore */
  }
  if (!hostname) return { status: 'error', hostname: '', verdicts: [], cached: false, message: 'No hostname for this tab' };
  if (!settings.cloudReputation) {
    return { status: 'not-configured', hostname, verdicts: [], cached: false, message: 'Cloud reputation is turned off. Enable it in Settings → Privacy & cloud.' };
  }
  const result = await fetchReputation(hostname);
  const state = await getTabState(tabId);
  if (state?.security.data && state.hostname === hostname) {
    state.security.data.reputation = result;
    if (result.status === 'ok') {
      const malicious = result.verdicts.some((v) => v.verdict === 'malicious');
      const suspicious = result.verdicts.some((v) => v.verdict === 'suspicious');
      const findings = state.security.data.findings.filter((f) => !f.id.startsWith('rep-'));
      for (const v of result.verdicts.filter((x) => x.verdict === 'malicious' || x.verdict === 'suspicious')) {
        findings.unshift({
          id: `rep-${v.provider}`,
          title: `${v.provider} lists this site as ${v.verdict}`,
          severity: v.verdict === 'malicious' ? 'critical' : 'high',
          evidence: [v.categories.join(', '), v.detail].filter(Boolean).join(' — ') || v.verdict,
          explanation: 'An external threat-intelligence provider has this hostname on a threat list.',
          recommendation: 'Leave the site and do not enter any information.',
          source: `Cloud reputation (${v.provider})`,
        });
      }
      state.security.data.findings = findings;
      state.security.data.riskLevel = malicious ? 'critical' : suspicious && state.security.data.riskLevel !== 'critical' ? 'high' : aggregateRisk(findings, true);
      const cov = state.security.data.coverage.find((c) => c.name === 'Cloud reputation');
      if (cov) {
        cov.ran = true;
        cov.note = result.cached ? 'Cached result' : undefined;
      }
    }
    await setTabState(state);
    broadcastScanUpdated(tabId);
  }
  return result;
}
