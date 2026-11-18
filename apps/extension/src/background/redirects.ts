/**
 * Redirect observation via the OPTIONAL webNavigation permission.
 * Keeps only the most recent top-frame chain per tab, in session storage
 * (memory-only, cleared on browser exit). Intermediate server-side hops are not
 * visible through webNavigation; we record the start URL and the committed URL.
 */
import type { RedirectHop } from '@ntm/shared';

const key = (tabId: number) => `redirects:${tabId}`;
const MAX_HOPS = 10;
let registered = false;

export async function getRedirects(tabId: number): Promise<RedirectHop[]> {
  const { [key(tabId)]: r } = await chrome.storage.session.get(key(tabId));
  return Array.isArray(r) ? (r as RedirectHop[]) : [];
}

async function setRedirects(tabId: number, hops: RedirectHop[]) {
  await chrome.storage.session.set({ [key(tabId)]: hops.slice(-MAX_HOPS) });
}

export function registerRedirectListeners(): void {
  if (registered || !chrome.webNavigation?.onCommitted) return;
  registered = true;

  chrome.webNavigation.onBeforeNavigate.addListener((d) => {
    if (d.frameId !== 0) return;
    void chrome.storage.session.set({ [`navstart:${d.tabId}`]: d.url });
  });

  chrome.webNavigation.onCommitted.addListener(async (d) => {
    if (d.frameId !== 0 || !/^https?:/.test(d.url)) return;
    const q = d.transitionQualifiers ?? [];
    const { [`navstart:${d.tabId}`]: start } = await chrome.storage.session.get(`navstart:${d.tabId}`);
    const prev = await getRedirects(d.tabId);
    let hops: RedirectHop[];
    if (q.includes('client_redirect') && prev.length) {
      hops = [...prev, { url: d.url, qualifiers: q, timestamp: d.timeStamp }];
    } else if (q.includes('server_redirect') && typeof start === 'string' && start !== d.url) {
      hops = [
        { url: start, qualifiers: ['start'], timestamp: d.timeStamp },
        { url: d.url, qualifiers: q, timestamp: d.timeStamp },
      ];
    } else {
      hops = [{ url: d.url, qualifiers: q.length ? q : [d.transitionType], timestamp: d.timeStamp }];
    }
    await setRedirects(d.tabId, hops);
  });
}
