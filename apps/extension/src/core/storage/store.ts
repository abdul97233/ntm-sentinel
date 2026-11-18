/**
 * Storage service. Versioned local storage with migrations; per-tab scan state in
 * chrome.storage.session (cleared when the browser closes, never synced).
 * The service worker can be terminated at any time, so all state lives here — not in memory.
 */
import type { ScanHistoryEntry, TabScanState, TechSignatureBundle, TrackerSignatureBundle } from '@ntm/shared';
import { techSignatureBundleSchema, trackerSignatureBundleSchema } from '@ntm/shared';
import { DEFAULT_SETTINGS, mergeSettings, settingsSchema, type Settings, type SettingsPatch } from './settings';

export const STORAGE_VERSION = 1;

const K = {
  version: 'storageVersion',
  settings: 'settings',
  history: 'scanHistory',
  techSigs: 'sig:technologies',
  trackerSigs: 'sig:trackers',
  sigMeta: 'sig:meta',
  backend: 'backend:status',
} as const;

type Migration = (data: Record<string, unknown>) => Record<string, unknown>;
/** migrations[n] upgrades from version n to n+1. */
const migrations: Record<number, Migration> = {
  0: (d) => d, // initial install: nothing to migrate
};

export async function runMigrations(): Promise<number> {
  const all = await chrome.storage.local.get(null);
  let version = typeof all[K.version] === 'number' ? (all[K.version] as number) : 0;
  let data = all;
  while (version < STORAGE_VERSION) {
    const m = migrations[version];
    if (m) data = m(data);
    version++;
  }
  data[K.version] = version;
  await chrome.storage.local.set(data);
  return version;
}

export async function getSettings(): Promise<Settings> {
  const { [K.settings]: raw } = await chrome.storage.local.get(K.settings);
  const parsed = settingsSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  // Partially valid / older settings: merge over defaults, dropping invalid fields.
  if (raw && typeof raw === 'object') {
    try {
      return mergeSettings(DEFAULT_SETTINGS, raw as SettingsPatch);
    } catch {
      /* fall through */
    }
  }
  return DEFAULT_SETTINGS;
}

export async function updateSettings(patch: SettingsPatch): Promise<Settings> {
  const next = mergeSettings(await getSettings(), patch);
  await chrome.storage.local.set({ [K.settings]: next });
  if (!next.scanHistory) await chrome.storage.local.remove(K.history);
  return next;
}

/* ------------------------------ tab state ------------------------------ */

const tabKey = (tabId: number) => `tab:${tabId}`;

export async function getTabState(tabId: number): Promise<TabScanState | null> {
  const { [tabKey(tabId)]: s } = await chrome.storage.session.get(tabKey(tabId));
  return (s as TabScanState | undefined) ?? null;
}

export async function setTabState(state: TabScanState): Promise<void> {
  await chrome.storage.session.set({ [tabKey(state.tabId)]: { ...state, updatedAt: Date.now() } });
}

export async function patchTabState(tabId: number, patch: Partial<TabScanState>): Promise<TabScanState | null> {
  const cur = await getTabState(tabId);
  if (!cur) return null;
  const next = { ...cur, ...patch, updatedAt: Date.now() };
  await chrome.storage.session.set({ [tabKey(tabId)]: next });
  return next;
}

export async function clearTabState(tabId: number): Promise<void> {
  await chrome.storage.session.remove([tabKey(tabId), `redirects:${tabId}`]);
}

/* ------------------------------- history ------------------------------- */

export async function getHistory(): Promise<ScanHistoryEntry[]> {
  const { [K.history]: h } = await chrome.storage.local.get(K.history);
  return Array.isArray(h) ? (h as ScanHistoryEntry[]) : [];
}

export async function addHistory(entry: ScanHistoryEntry, limit: number): Promise<void> {
  const h = (await getHistory()).filter((e) => e.hostname !== entry.hostname);
  h.unshift(entry);
  await chrome.storage.local.set({ [K.history]: h.slice(0, limit) });
}

export async function clearHistory(): Promise<void> {
  await chrome.storage.local.remove(K.history);
}

/* ------------------------------ signatures ------------------------------ */

export interface SignatureMeta {
  lastCheckedAt?: number;
  source: 'bundled' | 'remote';
}

/** Returns cached remote bundles only if they validate and are newer than the bundled ones. */
export async function getCachedSignatures(): Promise<{
  tech?: TechSignatureBundle;
  trackers?: TrackerSignatureBundle;
  meta: SignatureMeta;
}> {
  const got = await chrome.storage.local.get([K.techSigs, K.trackerSigs, K.sigMeta]);
  const tech = techSignatureBundleSchema.safeParse(got[K.techSigs]);
  const trackers = trackerSignatureBundleSchema.safeParse(got[K.trackerSigs]);
  return {
    tech: tech.success ? tech.data : undefined,
    trackers: trackers.success ? trackers.data : undefined,
    meta: (got[K.sigMeta] as SignatureMeta | undefined) ?? { source: 'bundled' },
  };
}

export async function setCachedSignatures(p: {
  tech?: TechSignatureBundle;
  trackers?: TrackerSignatureBundle;
  meta: SignatureMeta;
}): Promise<void> {
  const items: Record<string, unknown> = { [K.sigMeta]: p.meta };
  if (p.tech) items[K.techSigs] = p.tech;
  if (p.trackers) items[K.trackerSigs] = p.trackers;
  await chrome.storage.local.set(items);
}

/** Remove everything NTM Sentinel stored, then restore defaults. */
export async function clearAllData(): Promise<void> {
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
  await chrome.storage.local.set({ [K.version]: STORAGE_VERSION });
}

export const StorageKeys = K;
