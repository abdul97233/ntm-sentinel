/**
 * Browser API adapter. Centralises Chrome/Edge differences and feature detection so
 * the rest of the code never assumes an API exists.
 */

export type BrowserKind = 'chrome' | 'edge' | 'chromium';

export function detectBrowser(): BrowserKind {
  const ua = (globalThis.navigator?.userAgent ?? '').toLowerCase();
  if (ua.includes('edg/')) return 'edge';
  if (ua.includes('chrome/')) return 'chrome';
  return 'chromium';
}

export const features = {
  sidePanel: () => typeof chrome !== 'undefined' && !!chrome.sidePanel?.open,
  cookies: () => !!chrome.cookies?.getAll,
  webNavigation: () => !!chrome.webNavigation?.onCommitted,
  mainWorldScripts: () => !!chrome.scripting?.registerContentScripts,
};

/** Pages where extensions may not inject scripts in Chrome/Edge. */
const BLOCKED_HOSTS = ['chromewebstore.google.com', 'chrome.google.com', 'microsoftedge.microsoft.com'];

export function scanSupport(url: string | undefined): { supported: boolean; reason?: string } {
  if (!url) return { supported: false, reason: 'No page is open in this tab.' };
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { supported: false, reason: 'The address of this tab could not be read.' };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { supported: false, reason: `Browser-internal pages (${u.protocol}) cannot be analysed by extensions.` };
  }
  if (BLOCKED_HOSTS.some((h) => u.hostname === h)) {
    return { supported: false, reason: 'Browser extension stores block extensions from reading their pages.' };
  }
  if (u.pathname.toLowerCase().endsWith('.pdf')) {
    return { supported: false, reason: 'PDF viewer pages cannot be analysed.' };
  }
  return { supported: true };
}

export function originPattern(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return `${u.protocol}//${u.hostname}/*`;
  } catch {
    return null;
  }
}

export const ALL_SITES = ['https://*/*', 'http://*/*'];

export async function hasAllSites(): Promise<boolean> {
  try {
    return await chrome.permissions.contains({ origins: ALL_SITES });
  } catch {
    return false;
  }
}

export async function hasPermission(permission: 'cookies' | 'webNavigation'): Promise<boolean> {
  try {
    return await chrome.permissions.contains({ permissions: [permission] });
  } catch {
    return false;
  }
}

export async function openSidePanel(tabId: number, windowId?: number): Promise<boolean> {
  if (!features.sidePanel()) return false;
  try {
    // Must be called synchronously within a user gesture handler.
    await chrome.sidePanel.open(windowId !== undefined ? { windowId } : { tabId });
    return true;
  } catch {
    return false;
  }
}
