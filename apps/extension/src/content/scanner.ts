/**
 * On-demand content script (injected via chrome.scripting.executeScript only after a
 * user action or with granted site access). Routes background requests.
 */
import type { ContentRequest } from '../core/messaging/contract';
import { collectSnapshot } from './collect';
import { handleDevLensRequest } from './devlens';

declare global {
  interface Window {
    __ntmSentinelContent?: boolean;
  }
}

if (!window.__ntmSentinelContent) {
  window.__ntmSentinelContent = true;

  chrome.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
    // Only accept messages from our own extension (background/pages), never from web pages.
    if (sender.id !== chrome.runtime.id) return false;
    const m = msg as ContentRequest;
    if (!m || m.channel !== 'ntm-content') return false;

    let work: Promise<unknown> | undefined;
    if (m.type === 'ping') work = Promise.resolve({ ok: true });
    else if (m.type === 'collect') work = collectSnapshot(m.request);
    else work = handleDevLensRequest(m);

    if (!work) return false;
    work.then(
      (data) => sendResponse({ ok: true, data }),
      (err: unknown) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }),
    );
    return true; // async response
  });
}
