/** Minimal chrome.* stub backed by in-memory maps. Good enough for unit/integration tests. */
import { vi } from 'vitest';

type Listener = (...args: any[]) => any;

function makeEvent() {
  const listeners = new Set<Listener>();
  return {
    addListener: (l: Listener) => listeners.add(l),
    removeListener: (l: Listener) => listeners.delete(l),
    hasListener: (l: Listener) => listeners.has(l),
    _listeners: listeners,
    _emit: (...args: any[]) => Array.from(listeners).map((l) => l(...args)),
  };
}

function makeStorageArea() {
  let data: Record<string, unknown> = {};
  return {
    get: vi.fn(async (keys?: string | string[] | null) => {
      if (keys == null) return { ...data };
      const list = Array.isArray(keys) ? keys : [keys];
      const out: Record<string, unknown> = {};
      for (const k of list) if (k in data) out[k] = structuredClone(data[k]);
      return out;
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      data = { ...data, ...structuredClone(items) };
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      for (const k of Array.isArray(keys) ? keys : [keys]) delete data[k];
    }),
    clear: vi.fn(async () => {
      data = {};
    }),
    _dump: () => data,
    _reset: () => {
      data = {};
    },
  };
}

export function installChromeStub() {
  const chromeStub = {
    runtime: {
      id: 'test-extension-id',
      getURL: (p: string) => `chrome-extension://test-extension-id/${p.replace(/^\//, '')}`,
      getManifest: () => ({ version: '0.0.0-test' }),
      sendMessage: vi.fn(async () => undefined),
      onMessage: makeEvent(),
      onInstalled: makeEvent(),
      onStartup: makeEvent(),
      lastError: undefined,
    },
    storage: {
      local: makeStorageArea(),
      session: { ...makeStorageArea(), setAccessLevel: vi.fn(async () => undefined) },
      onChanged: makeEvent(),
    },
    tabs: {
      query: vi.fn(async () => []),
      get: vi.fn(async () => undefined),
      sendMessage: vi.fn(async () => undefined),
      onRemoved: makeEvent(),
      onUpdated: makeEvent(),
      onActivated: makeEvent(),
    },
    scripting: {
      executeScript: vi.fn(async () => []),
      registerContentScripts: vi.fn(async () => undefined),
      unregisterContentScripts: vi.fn(async () => undefined),
      getRegisteredContentScripts: vi.fn(async () => []),
    },
    permissions: {
      contains: vi.fn(async () => false),
      request: vi.fn(async () => false),
      remove: vi.fn(async () => true),
      getAll: vi.fn(async () => ({ permissions: [], origins: [] })),
      onAdded: makeEvent(),
      onRemoved: makeEvent(),
    },
    sidePanel: {
      open: vi.fn(async () => undefined),
      setOptions: vi.fn(async () => undefined),
      setPanelBehavior: vi.fn(async () => undefined),
    },
    windows: { create: vi.fn(async () => ({ id: 1 })), getCurrent: vi.fn(async () => ({ id: 1 })) },
    action: { setBadgeText: vi.fn(async () => undefined), setBadgeBackgroundColor: vi.fn(async () => undefined) },
  };
  (globalThis as any).chrome = chromeStub;
  return chromeStub;
}

export type ChromeStub = ReturnType<typeof installChromeStub>;
export const getChrome = () => (globalThis as any).chrome as ChromeStub;
