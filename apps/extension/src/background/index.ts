/**
 * NTM Sentinel background service worker (MV3).
 * All listeners are registered synchronously at top level so they survive worker restarts.
 * No state is kept in memory between events; everything is in chrome.storage.
 */
import { requestSchemas, type Envelope, type MessageType, type ResponseMap, type Result, type AccessStatus, type ContentRequest } from '../core/messaging/contract';
import { ALL_SITES, features, hasAllSites, hasPermission, originPattern, scanSupport } from '../core/browser';
import {
  clearAllData,
  clearHistory,
  clearTabState,
  getCachedSignatures,
  getHistory,
  getSettings,
  patchTabState,
  runMigrations,
  setCachedSignatures,
  updateSettings,
  StorageKeys,
} from '../core/storage/store';
import { apiConfigured, apiOrigin, checkHealth, fetchSignatures } from '../services/backend';
import { activeSignatures, analyzeCookies, broadcastScanUpdated, getOrInitState, runReputation, runScan, sendToContent } from './scan';
import { registerRedirectListeners } from './redirects';
import { openResponsiveWindow } from './responsive';
import type { ViewportInfo } from '@ntm/shared';

const FP_SCRIPT_ID = 'ntm-fingerprint-monitor';
const EXT_ORIGIN = chrome.runtime.getURL('');

/* ------------------------------ lifecycle ------------------------------ */

chrome.runtime.onInstalled.addListener(async () => {
  await runMigrations();
  // Session data must not be readable by content scripts.
  await chrome.storage.session.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(() => undefined);
  await syncFingerprintMonitor();
});

chrome.runtime.onStartup.addListener(() => {
  void syncFingerprintMonitor();
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void clearTabState(tabId);
  void chrome.storage.session.remove(`navstart:${tabId}`);
});

chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status !== 'complete' || !tab.url) return;
  const settings = await getSettings();
  if (!settings.autoScan || !scanSupport(tab.url).supported) return;
  if (!(await hasAllSites())) return;
  try {
    await runScan(tabId);
  } catch {
    /* page went away mid-scan */
  }
});

registerRedirectListeners();
chrome.permissions.onAdded.addListener(() => {
  registerRedirectListeners();
  void syncFingerprintMonitor();
});
chrome.permissions.onRemoved.addListener(() => {
  void syncFingerprintMonitor();
});

/** Registers or removes the opt-in MAIN-world fingerprint monitor to match settings + permissions. */
async function syncFingerprintMonitor(): Promise<boolean> {
  if (!features.mainWorldScripts()) return false;
  const settings = await getSettings();
  const want = settings.fingerprintMonitor && settings.modules.privacyguard && (await hasAllSites());
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [FP_SCRIPT_ID] }).catch(() => []);
  if (want && existing.length === 0) {
    await chrome.scripting.registerContentScripts([
      { id: FP_SCRIPT_ID, js: ['fingerprint-monitor.js'], matches: ALL_SITES, runAt: 'document_start', world: 'MAIN', allFrames: false, persistAcrossSessions: true },
    ]);
  } else if (!want && existing.length > 0) {
    await chrome.scripting.unregisterContentScripts({ ids: [FP_SCRIPT_ID] });
  }
  return want;
}

/* -------------------------------- access -------------------------------- */

async function accessStatus(tabId: number): Promise<AccessStatus> {
  const tab = await chrome.tabs.get(tabId);
  const url = tab.url ?? '';
  // Without the "tabs" permission, the URL is hidden until the user grants access
  // (activeTab via the toolbar icon, or a host permission). Treat as "permission required".
  const support = url ? scanSupport(url) : { supported: true as const, reason: undefined };
  let hostname = '';
  try {
    hostname = new URL(url).hostname;
  } catch {
    /* ignore */
  }
  const pattern = originPattern(url);
  const [originGranted, allSitesGranted, cookiesPermission, webNavigationPermission] = await Promise.all([
    pattern ? chrome.permissions.contains({ origins: [pattern] }).catch(() => false) : Promise.resolve(false),
    hasAllSites(),
    hasPermission('cookies'),
    hasPermission('webNavigation'),
  ]);
  let canAccess = originGranted || allSitesGranted;
  if (!canAccess && support.supported) {
    // activeTab grants are not queryable; test with a harmless no-op injection.
    try {
      await chrome.scripting.executeScript({ target: { tabId }, func: () => true });
      canAccess = true;
    } catch {
      canAccess = false;
    }
  }
  return {
    tabId,
    url,
    hostname,
    supported: support.supported,
    unsupportedReason: support.reason,
    canAccess: support.supported && canAccess,
    originGranted,
    allSitesGranted,
    cookiesPermission,
    webNavigationPermission,
  };
}

/* -------------------------------- router -------------------------------- */

type Handler<T extends MessageType> = (payload: any) => Promise<ResponseMap[T]>;

const handlers: { [K in MessageType]: Handler<K> } = {
  'tab/active': async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id) return null;
    return { tabId: tab.id, url: tab.url ?? '', title: tab.title ?? '' };
  },
  'access/status': ({ tabId }) => accessStatus(tabId),
  'scan/run': ({ tabId, engines }) => runScan(tabId, engines),
  'scan/get': async ({ tabId }) => getOrInitState(tabId),
  'reputation/check': ({ tabId }) => runReputation(tabId),
  'cookies/analyze': ({ tabId }) => analyzeCookies(tabId),
  'settings/get': () => getSettings(),
  'settings/update': async ({ patch }) => {
    const s = await updateSettings(patch);
    await syncFingerprintMonitor().catch(() => undefined);
    chrome.runtime.sendMessage({ channel: 'ntm-event', type: 'settings/changed' }).catch(() => undefined);
    return s;
  },
  'history/get': () => getHistory(),
  'history/clear': async () => {
    await clearHistory();
    return { ok: true as const };
  },
  'data/clearAll': async () => {
    await clearAllData();
    await syncFingerprintMonitor().catch(() => undefined);
    return { ok: true as const };
  },
  'backend/status': async ({ refresh }) => {
    const settings = await getSettings();
    const enabled = settings.cloudReputation || settings.cloudSignatureUpdates;
    const base = { configured: apiConfigured(), enabled, apiOrigin: apiOrigin() };
    if (!base.configured) return { ...base, reachable: null, message: 'No backend URL configured in this build (local-only mode).' };
    const { [StorageKeys.backend]: cached } = await chrome.storage.session.get(StorageKeys.backend);
    if (!refresh && cached) return { ...base, ...(cached as object) } as ResponseMap['backend/status'];
    if (!refresh && !enabled) return { ...base, reachable: null, message: 'Cloud features are off.' };
    const h = await checkHealth();
    const status = { reachable: h.reachable, message: h.message, checkedAt: Date.now() };
    await chrome.storage.session.set({ [StorageKeys.backend]: status });
    return { ...base, ...status };
  },
  'signatures/info': async () => {
    const active = await activeSignatures();
    const { meta } = await getCachedSignatures();
    return { technologies: active.tech.version, trackers: active.trackers.version, source: active.source, lastCheckedAt: meta.lastCheckedAt };
  },
  'signatures/update': async () => {
    const settings = await getSettings();
    const current = await activeSignatures();
    if (!settings.cloudSignatureUpdates) {
      return { technologies: current.tech.version, trackers: current.trackers.version, updated: false, message: 'Signature updates are turned off in Settings.' };
    }
    const r = await fetchSignatures();
    await setCachedSignatures({ tech: r.tech, trackers: r.trackers, meta: { source: r.tech || r.trackers ? 'remote' : 'bundled', lastCheckedAt: Date.now() } });
    const next = await activeSignatures();
    return {
      technologies: next.tech.version,
      trackers: next.trackers.version,
      updated: next.tech.version !== current.tech.version || next.trackers.version !== current.trackers.version,
      message: r.error ?? (next.tech === current.tech && next.trackers === current.trackers ? 'Already up to date.' : undefined),
    };
  },
  'fingerprint/sync': async () => ({ registered: await syncFingerprintMonitor() }),
  'devlens/pickerStart': async ({ tabId }) => sendToContent(tabId, { channel: 'ntm-content', type: 'devlens/pickerStart' }),
  'devlens/pickerStop': async ({ tabId }) => {
    try {
      return await sendToContent(tabId, { channel: 'ntm-content', type: 'devlens/pickerStop' });
    } catch {
      return { ok: true as const };
    }
  },
  'devlens/inspectSelector': ({ tabId, selector }) =>
    sendToContent(tabId, { channel: 'ntm-content', type: 'devlens/inspectSelector', selector }),
  'devlens/colors': ({ tabId }) => sendToContent(tabId, { channel: 'ntm-content', type: 'devlens/colors' }),
  'devlens/typography': ({ tabId }) => sendToContent(tabId, { channel: 'ntm-content', type: 'devlens/typography' }),
  'devlens/assets': ({ tabId }) => sendToContent(tabId, { channel: 'ntm-content', type: 'devlens/assets' }),
  'devlens/viewport': ({ tabId }) => sendToContent(tabId, { channel: 'ntm-content', type: 'devlens/viewport' }),
  'devlens/openResponsive': async ({ tabId, width, height }) => {
    let offset: { w: number; h: number } | undefined;
    try {
      const v = await sendToContent<ViewportInfo>(tabId, { channel: 'ntm-content', type: 'devlens/viewport' } as ContentRequest);
      offset = { w: Math.max(0, v.outerWidth - v.innerWidth), h: Math.max(0, v.outerHeight - v.innerHeight) };
    } catch {
      offset = undefined;
    }
    return openResponsiveWindow(tabId, width, height, offset);
  },
  'apiwatch/count': async ({ tabId, count }) => {
    const state = (await patchTabState(tabId, { apiRequestCount: count })) ?? null;
    if (!state) {
      const fresh = await getOrInitState(tabId).catch(() => null);
      if (fresh) await chrome.storage.session.set({ [`tab:${tabId}`]: { ...fresh, apiRequestCount: count } });
    }
    broadcastScanUpdated(tabId);
    return { ok: true as const };
  },
};

chrome.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
  const env = msg as Envelope;
  if (!env || typeof env !== 'object' || env.channel !== 'ntm') return false;

  // Only extension pages (popup, side panel, DevTools panel) may call the router.
  // Content scripts and web pages are rejected.
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(EXT_ORIGIN)) {
    sendResponse({ ok: false, error: 'Unauthorized sender', code: 'unauthorized' } satisfies Result<never>);
    return false;
  }
  const schema = requestSchemas[env.type as MessageType];
  if (!schema) {
    sendResponse({ ok: false, error: `Unknown message type`, code: 'unknown-type' } satisfies Result<never>);
    return false;
  }
  const parsed = schema.safeParse(env.payload ?? {});
  if (!parsed.success) {
    sendResponse({ ok: false, error: 'Invalid payload', code: 'invalid-payload' } satisfies Result<never>);
    return false;
  }
  const handler = handlers[env.type as MessageType] as Handler<MessageType>;
  handler(parsed.data).then(
    (data) => sendResponse({ ok: true, data } satisfies Result<unknown>),
    (err: unknown) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err), code: 'handler-error' } satisfies Result<never>),
  );
  return true;
});

/* Re-broadcast DevLens picker events with the sender tab id for per-tab filtering. */
chrome.runtime.onMessage.addListener((msg: unknown, sender) => {
  const m = msg as { channel?: string; type?: string; tabId?: number };
  if (m?.channel === 'ntm-event' && sender.tab?.id !== undefined && m.tabId === undefined && typeof m.type === 'string' && m.type.startsWith('devlens/')) {
    chrome.runtime.sendMessage({ ...m, tabId: sender.tab.id }).catch(() => undefined);
  }
  return false;
});

export {};
