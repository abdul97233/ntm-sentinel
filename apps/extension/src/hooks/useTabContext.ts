import { useCallback, useEffect, useRef, useState } from 'react';
import type { TabScanState } from '@ntm/shared';
import type { AccessStatus, EngineScan } from '../core/messaging/contract';
import type { Settings } from '../core/storage/settings';
import { DEFAULT_SETTINGS } from '../core/storage/settings';
import { onEvent, send } from '../core/messaging/client';
import { originPattern } from '../core/browser';

export interface TabContext {
  tabId: number | null;
  access: AccessStatus | null;
  scan: TabScanState | null;
  settings: Settings;
  loading: boolean;
  error: string | null;
  runScan: (engines?: EngineScan[]) => Promise<void>;
  refresh: () => Promise<void>;
  /** Must be called from a click handler (permissions.request needs a user gesture). */
  requestSiteAccess: () => Promise<boolean>;
  updateSettings: (patch: Parameters<typeof send<'settings/update'>>[1]['patch']) => Promise<void>;
}

/** Tracks the active tab, its access status and scan state; follows tab switches (side panel). */
export function useTabContext(options: { follow: boolean; autoScanOnOpen?: boolean }): TabContext {
  const [tabId, setTabId] = useState<number | null>(null);
  const [access, setAccess] = useState<AccessStatus | null>(null);
  const [scan, setScan] = useState<TabScanState | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const tabRef = useRef<number | null>(null);
  const autoScanned = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      setError(null);
      const [active, s] = await Promise.all([send('tab/active', {}), send('settings/get', {})]);
      setSettings(s);
      if (!active) {
        setTabId(null);
        setAccess(null);
        setScan(null);
        return;
      }
      tabRef.current = active.tabId;
      setTabId(active.tabId);
      const [acc, st] = await Promise.all([
        send('access/status', { tabId: active.tabId }),
        send('scan/get', { tabId: active.tabId }),
      ]);
      if (tabRef.current !== active.tabId) return;
      setAccess(acc);
      setScan(st);
      const key = `${active.tabId}|${acc.url}`;
      if (options.autoScanOnOpen && acc.canAccess && st && st.security.status === 'not-scanned' && !autoScanned.current.has(key)) {
        autoScanned.current.add(key);
        void send('scan/run', { tabId: active.tabId }).then((r) => tabRef.current === active.tabId && setScan(r)).catch(() => undefined);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [options.autoScanOnOpen]);

  useEffect(() => {
    void load();
    const off = onEvent(async (ev) => {
      if (ev.type === 'scan/updated' && ev.tabId === tabRef.current) {
        const st = await send('scan/get', { tabId: ev.tabId }).catch(() => null);
        if (st && ev.tabId === tabRef.current) setScan(st);
      } else if (ev.type === 'settings/changed') {
        setSettings(await send('settings/get', {}).catch(() => DEFAULT_SETTINGS));
      }
    });
    if (!options.follow) return off;
    const onActivated = () => void load();
    const onUpdated = (id: number, info: { status?: string; url?: string }) => {
      if (id === tabRef.current && (info.status === 'complete' || info.url)) void load();
    };
    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.windows?.onFocusChanged?.addListener(onActivated);
    return () => {
      off();
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.windows?.onFocusChanged?.removeListener(onActivated);
    };
  }, [load, options.follow]);

  const runScan = useCallback(
    async (engines?: EngineScan[]) => {
      if (tabId === null) return;
      try {
        setError(null);
        const st = await send('scan/run', engines ? { tabId, engines } : { tabId });
        setScan(st);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [tabId],
  );

  const requestSiteAccess = useCallback(async () => {
    const pattern = access?.url ? originPattern(access.url) : null;
    try {
      const granted = await chrome.permissions.request({ origins: pattern ? [pattern] : ['https://*/*', 'http://*/*'] });
      await load();
      return granted;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  }, [access?.url, load]);

  const updateSettings = useCallback<TabContext['updateSettings']>(async (patch) => {
    setSettings(await send('settings/update', { patch }));
  }, []);

  return { tabId, access, scan, settings, loading, error, runScan, refresh: load, requestSiteAccess, updateSettings };
}
